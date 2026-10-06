import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type * as BaileysLib from '@whiskeysockets/baileys';
import type { WAMessage } from '@whiskeysockets/baileys';
import { BaileysStoredMessage } from './baileys-stored-message.entity';
import { BaileysMessageStore } from '../types/baileys.types';
import { createLogger } from '../../common/services/logger.service';

function positiveIntFromEnv(name: string, fallback: number): number {
  const parsed = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * True when a write failed because the parent `sessions` row is absent (a foreign-key violation),
 * as opposed to any other persistence error. Covers SQLite (`SQLITE_CONSTRAINT[_FOREIGNKEY]`) and
 * Postgres (`23503`). TypeORM wraps the driver error in a QueryFailedError, so check both the
 * wrapper and `driverError`.
 */
function isMissingParentSessionError(err: unknown): boolean {
  const e = err as { code?: string; driverError?: { code?: string }; message?: string };
  const code = e?.driverError?.code ?? e?.code;
  if (code === '23503') {
    return true; // Postgres foreign_key_violation
  }
  const message = e?.message ?? '';
  if (typeof code === 'string' && code.startsWith('SQLITE_CONSTRAINT')) {
    return code === 'SQLITE_CONSTRAINT_FOREIGNKEY' || /FOREIGN KEY/i.test(message);
  }
  return /FOREIGN KEY constraint failed/i.test(message);
}

@Injectable()
export class BaileysMessageStoreService implements BaileysMessageStore, OnModuleDestroy {
  private readonly logger = createLogger('BaileysMessageStore');
  /** Sessions already warned about a missing parent row — keeps the orphan log to once per session. */
  private readonly orphanWarnedSessions = new Set<string>();

  /** Tracks writes per session to batch purge operations and avoid DB saturation on every message. */
  private readonly writeCounters = new Map<string, number>();

  /** Active purge promises keyed by sessionId to avoid concurrent conflicting purge queries. */
  private readonly activePurges = new Map<string, Promise<void>>();

  /** Set of sessionIds that requested another purge while one was already running. */
  private readonly pendingPurgeSessions = new Set<string>();

  private isDestroyed = false;

  /** Lazily loaded @whiskeysockets/baileys module (ESM-only; loaded on first use, not at boot). */
  private baileysLib?: typeof BaileysLib;

  private async loadLib(): Promise<typeof BaileysLib> {
    return (this.baileysLib ??= await import('@whiskeysockets/baileys'));
  }

  constructor(
    @InjectRepository(BaileysStoredMessage, 'data')
    private readonly repo: Repository<BaileysStoredMessage>,
  ) {}

  async onModuleDestroy(): Promise<void> {
    this.isDestroyed = true;
    while (this.activePurges.size > 0) {
      await Promise.all(Array.from(this.activePurges.values())).catch(() => undefined);
    }
  }

  async put(sessionId: string, msg: WAMessage): Promise<void> {
    const waMessageId = msg.key?.id;
    if (!waMessageId) {
      return;
    }
    const { BufferJSON } = await this.loadLib();
    const serializedMessage = JSON.stringify(msg, BufferJSON.replacer);
    // Idempotent: the same message arrives from the send return AND the messages.upsert echo.
    // createdAt is set explicitly so the stored value carries millisecond precision — matching the
    // :createdAt bound param used in enforceLimit(). Without this, SQLite's datetime('now') stores
    // second-precision (e.g. '…:11') while the JS Date bound serializes as '…:11.000', and SQLite
    // string-compares '…:11' < '…:11.000' = TRUE, causing every same-second row to be over-evicted
    // and the store to be wiped to ~0.
    try {
      await this.repo.upsert({ sessionId, waMessageId, serializedMessage, createdAt: new Date() }, [
        'sessionId',
        'waMessageId',
      ]);
    } catch (err) {
      if (isMissingParentSessionError(err)) {
        // Orphaned adapter: the sessions row was deleted/recreated (reconnect churn) while this
        // adapter kept emitting messages.upsert. There is no valid parent to store under, so drop
        // the write instead of throwing the FK error on every message (#319). Warn once per session
        // so the orphan stays visible without per-message log noise.
        if (!this.orphanWarnedSessions.has(sessionId)) {
          this.orphanWarnedSessions.add(sessionId);
          this.logger.warn(
            `No parent session row for "${sessionId}" — skipping Baileys message store (orphaned/recreated session). ` +
              `reply/forward/react/delete-by-id will be unavailable for messages received under this id.`,
          );
        }
        return;
      }
      throw err; // a genuine persistence failure — let the adapter's catch surface it
    }

    const limit = positiveIntFromEnv('BAILEYS_MESSAGE_STORE_LIMIT', 5000);
    // Controlled batch purge: run every N writes (default 100 in production, or 1 in small-cap test scenarios)
    const batchThreshold = process.env.BAILEYS_MESSAGE_STORE_PURGE_BATCH
      ? positiveIntFromEnv('BAILEYS_MESSAGE_STORE_PURGE_BATCH', 100)
      : limit <= 10
        ? 1
        : Math.min(100, Math.max(1, Math.floor(limit / 10)));

    const currentCount = (this.writeCounters.get(sessionId) ?? 0) + 1;
    if (currentCount >= batchThreshold) {
      this.writeCounters.set(sessionId, 0);
      await this.scheduleOrRunPurge(sessionId);
    } else {
      this.writeCounters.set(sessionId, currentCount);
    }
  }

  /**
   * Schedule or run purge with concurrency control (single-flight per session)
   * to protect against race conditions and lock contention.
   */
  async scheduleOrRunPurge(sessionId: string): Promise<void> {
    if (this.isDestroyed) return;

    const running = this.activePurges.get(sessionId);
    if (running) {
      this.pendingPurgeSessions.add(sessionId);
      return running;
    }

    const purgePromise = (async () => {
      try {
        await this.enforceLimit(sessionId);
      } catch (err) {
        this.logger.error(`Failed to enforce message limit for session "${sessionId}"`, String(err));
      } finally {
        this.activePurges.delete(sessionId);
        if (this.pendingPurgeSessions.has(sessionId) && !this.isDestroyed) {
          this.pendingPurgeSessions.delete(sessionId);
          void this.scheduleOrRunPurge(sessionId);
        }
      }
    })();

    this.activePurges.set(sessionId, purgePromise);
    return purgePromise;
  }

  async getMessage(sessionId: string, messageId: string, allowCrossSessionFallback = false): Promise<WAMessage | null> {
    // Baileys retry/poll paths can hand over a key with no id; treat that as not-found rather than
    // letting an undefined criterion reach the ORM (TypeORM 1.x throws; 0.3 matched an arbitrary row).
    if (!messageId) return null;
    let row = await this.repo.findOne({ where: { sessionId, waMessageId: messageId } });
    if (!row && allowCrossSessionFallback) {
      // Cross-session fallback: If multiple bot sessions are in the same group, another session may have sent the poll
      row = await this.repo.findOne({ where: { waMessageId: messageId } });
    }
    if (!row) {
      return null;
    }
    const { BufferJSON } = await this.loadLib();
    return JSON.parse(row.serializedMessage, BufferJSON.reviver) as WAMessage;
  }

  async clearSession(sessionId: string): Promise<void> {
    this.writeCounters.delete(sessionId);
    this.pendingPurgeSessions.delete(sessionId);
    const running = this.activePurges.get(sessionId);
    if (running) {
      await running.catch(() => undefined);
    }
    await this.repo.delete({ sessionId });
  }

  /** Per-session row cap: keep the newest N, delete the rest. Deterministic via (createdAt, id). */
  private async enforceLimit(sessionId: string): Promise<void> {
    const limit = positiveIntFromEnv('BAILEYS_MESSAGE_STORE_LIMIT', 5000);
    const cutoff = await this.repo.find({
      where: { sessionId },
      order: { createdAt: 'DESC', id: 'DESC' },
      skip: limit,
      take: 1,
      select: { id: true, createdAt: true },
    });
    if (cutoff.length === 0) {
      return; // under the cap — nothing to evict
    }
    const { id, createdAt } = cutoff[0];
    await this.repo
      .createQueryBuilder()
      .delete()
      .where('sessionId = :sessionId', { sessionId })
      .andWhere('(createdAt < :createdAt OR (createdAt = :createdAt AND id <= :id))', { createdAt, id })
      .execute();
  }
}
