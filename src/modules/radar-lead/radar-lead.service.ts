import { Injectable, Logger, OnModuleInit, Optional, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { EngineRegistry } from '../../engine/engine-registry.service';
import { RadarSetting, GroupFilterMode } from './entities/radar-setting.entity';
import { RadarClient, DEFAULT_RADAR_ALERT_TEMPLATE } from './entities/radar-client.entity';
import { RadarLeadLog, RadarLeadStatus } from './entities/radar-lead-log.entity';
import {
  CreateRadarClientDto,
  UpdateRadarClientDto,
  UpdateRadarSettingsDto,
  TestEvaluateDto,
  QueryRadarLogsDto,
  RadarMetricsSummaryDto,
  ClientMetricsDto,
  FlagNegativeLeadDto,
  SaveGroupCategoryTagDto,
} from './dto/radar.dto';
import { AiTelemetryService } from '../ai-telemetry/ai-telemetry.service';
import { GroupTagsService, GroupTag } from '../contact/group-tags.service';

export function normalizeTextForSearch(str: string): string {
  return (str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function matchesKeywords(text: string, keywordsStr: string): { matched: boolean; matchedKeyword?: string } {
  if (!text || !keywordsStr) return { matched: false };
  const normalizedText = normalizeTextForSearch(text);
  const keywords = keywordsStr
    .split(',')
    .map(k => normalizeTextForSearch(k.trim()))
    .filter(Boolean);

  for (const kw of keywords) {
    if (!kw) continue;
    if (kw.includes(' ')) {
      if (normalizedText.includes(kw)) {
        return { matched: true, matchedKeyword: kw };
      }
    } else {
      const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = kw.length >= 4
        ? `(^|[^a-z0-9])${escaped}`
        : `(^|[^a-z0-9])${escaped}(s|es)?([^a-z0-9]|$)`;
      const regex = new RegExp(pattern, 'i');
      if (regex.test(normalizedText)) {
        return { matched: true, matchedKeyword: kw };
      }
    }
  }
  return { matched: false };
}

export function normalizePhoneDigits(phone: string): string {
  if (!phone) return '';
  let str = phone;
  if (str.includes('@')) {
    str = str.split('@')[0].split(':')[0];
  }
  return str.replace(/[^0-9]/g, '');
}

export function extractPhonesFromText(text: string): string[] {
  if (!text) return [];
  const matches = text.match(/(?:\+?56\s?9\s?\d{4}\s?\d{4}|\+?56\s?9\d{8}|9\d{8}|\+?\d{9,15})/g) || [];
  const cleaned = matches.map((m) => normalizePhoneDigits(m)).filter((p) => p.length >= 8);
  return Array.from(new Set(cleaned));
}

/**
 * Normalizes message text to a compact alphanumeric fingerprint for cross-group deduplication.
 * Strips emojis, symbols, whitespace, and accents so that identical or near-identical broadcast
 * messages posted across multiple WhatsApp groups match 100%.
 */
export function computeTextDedupFingerprint(text: string): string {
  if (!text) return '';
  return normalizeTextForSearch(text)
    .replace(/[^\p{L}\p{N}]/gu, '')
    .slice(0, 160);
}

export const DEFAULT_TYPESAFE_API_KEY =
  'apikey_2199a480d31c3450450c8efa2ecc4c6d9d0d_6c18d62803e10160629944a9079e8ffcf825fa1f40caba0ebeea8e1fcfd57e5b';

/**
 * Calls TypeSafe System One (model: jev-latest) to evaluate whether an incoming message
 * expresses genuine buying intent or should be discarded as seller spam.
 * Fail-open: returns isMatch=true on network or parsing error so valid leads are never dropped.
 */
export async function evaluateSemanticCriteriaWithTypeSafe(
  text: string,
  criteriaInstructions: string,
  apiKey: string,
  timeoutMs = 6000,
): Promise<{ isMatch: boolean; score: number; error?: string }> {
  if (!text || !criteriaInstructions) {
    return { isMatch: true, score: 1.0 };
  }

  const key = (apiKey || '').trim() || DEFAULT_TYPESAFE_API_KEY;
  const payload = {
    model: 'jev-latest',
    state: text,
    questions: {
      es_intencion_compra: {
        type: 'noul',
        instructions: criteriaInstructions,
      },
    },
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch('https://api.typesafe.ai/v1/systemone', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      return {
        isMatch: true, // fail-open
        score: 1.0,
        error: `HTTP ${res.status}: ${errText}`,
      };
    }

    const data = await res.json();
    const noulVal = data?.answers?.es_intencion_compra?.noul;
    const score = typeof noulVal === 'number' ? noulVal : 1.0;
    // Score >= 0.5 indicates affirmative buying intention
    const isMatch = score >= 0.5;

    return {
      isMatch,
      score,
    };
  } catch (err: any) {
    clearTimeout(timeoutId);
    return {
      isMatch: true, // fail-open
      score: 1.0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

@Injectable()
export class RadarLeadService implements OnModuleInit {
  private readonly logger = new Logger(RadarLeadService.name);

  // In-memory caches for 0 ms discard
  private cachedSettings: RadarSetting | null = null;
  private cachedActiveClients: RadarClient[] = [];
  private readonly groupNameCache = new Map<string, string>();
  private readonly dedupCache = new Map<string, number>();
  // Anti-repetición de alertas entre distintos grupos: key -> { timestamp, groupName }
  // Key puede ser `${clientId}:${fingerprint}` o `${targetPhone}:${fingerprint}`
  private readonly crossGroupAlertCache = new Map<string, { timestamp: number; groupName: string }>();

  private readonly clientsBackupPath = path.join(process.cwd(), 'data', 'radar_clients.json');
  private readonly settingsBackupPath = path.join(process.cwd(), 'data', 'radar_settings.json');

  constructor(
    @InjectRepository(RadarSetting, 'data')
    private readonly settingsRepo: Repository<RadarSetting>,
    @InjectRepository(RadarClient, 'data')
    private readonly clientsRepo: Repository<RadarClient>,
    @Optional()
    @InjectRepository(RadarLeadLog, 'data')
    private logsRepo?: Repository<RadarLeadLog>,
    @Optional()
    private engineRegistry?: EngineRegistry,
    @Optional()
    private readonly aiTelemetryService?: AiTelemetryService,
    @Optional()
    private readonly groupTagsService?: GroupTagsService,
  ) {
    // Backwards-compatibility if caller passed (settingsRepo, clientsRepo, engineRegistry)
    if (this.logsRepo && !this.engineRegistry && ('get' in (this.logsRepo as any) || 'getEngine' in (this.logsRepo as any) || typeof (this.logsRepo as any).get === 'function')) {
      this.engineRegistry = this.logsRepo as any;
      this.logsRepo = undefined;
    }
  }

  async onModuleInit(): Promise<void> {
    await this.ensureTables();
    await this.restoreFromBackup();
    await this.reloadCache();
    await this.syncBackup();
    await this.seedCrossGroupAlertCache();
  }

  /**
   * Pre-seeds the cross-group alert cache from recent DISPATCHED logs in the database
   * so duplicate prevention persists across container restarts and deployments.
   */
  private async seedCrossGroupAlertCache(): Promise<void> {
    try {
      if (!this.logsRepo) return;
      const cutoff = new Date(Date.now() - 4 * 3600 * 1000); // last 4 hours
      const recentLogs = await this.logsRepo.find({
        where: {
          status: 'DISPATCHED',
        },
        order: { createdAt: 'DESC' },
        take: 200,
      });

      for (const log of recentLogs) {
        if (!log.createdAt || new Date(log.createdAt) < cutoff) continue;
        const fp = computeTextDedupFingerprint(log.messageText);
        if (!fp) continue;
        const ts = new Date(log.createdAt).getTime();
        if (log.clientId) {
          this.crossGroupAlertCache.set(`${log.clientId}:${fp}`, { timestamp: ts, groupName: log.groupName || log.groupId });
        }
      }
      this.logger.log(`Cross-group alert cache pre-seeded with ${this.crossGroupAlertCache.size} recent fingerprints`);
    } catch (err: any) {
      this.logger.warn('Failed to pre-seed cross-group alert cache', { error: err?.message });
    }
  }

  /**
   * Prunes expired entries from crossGroupAlertCache to prevent unbounded memory growth.
   */
  private cleanExpiredCrossGroupAlerts(maxAgeMs: number): void {
    if (this.crossGroupAlertCache.size > 2000) {
      const now = Date.now();
      for (const [k, v] of this.crossGroupAlertCache.entries()) {
        if (now - v.timestamp > maxAgeMs) {
          this.crossGroupAlertCache.delete(k);
        }
      }
    }
  }

  /**
   * Synchronizes radar clients and settings to persistent JSON backup files in data/
   * so they are never lost even if the SQLite database is re-initialized or corrupted.
   */
  async syncBackup(): Promise<void> {
    try {
      const dataDir = path.join(process.cwd(), 'data');
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      // Snapshot all clients
      const clients = await this.clientsRepo.find({ order: { createdAt: 'DESC' } });
      fs.writeFileSync(this.clientsBackupPath, JSON.stringify(clients, null, 2), 'utf8');

      // Snapshot global settings
      const settings = await this.settingsRepo.findOne({ where: { id: 'default' } });
      if (settings) {
        fs.writeFileSync(this.settingsBackupPath, JSON.stringify(settings, null, 2), 'utf8');
      }
    } catch (err) {
      this.logger.warn('Failed to sync radar backup files', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /**
   * Restores clients and settings from persistent JSON backup files if the database table is empty.
   */
  async restoreFromBackup(): Promise<void> {
    try {
      // 1. Restore clients if table is empty
      if (fs.existsSync(this.clientsBackupPath)) {
        const raw = fs.readFileSync(this.clientsBackupPath, 'utf8');
        const backupClients: RadarClient[] = JSON.parse(raw);
        if (Array.isArray(backupClients) && backupClients.length > 0) {
          const currentCount = await this.clientsRepo.count();
          if (currentCount === 0) {
            this.logger.log(`Restaurando ${backupClients.length} clientes del Radar desde archivo de respaldo...`);
            for (const item of backupClients) {
              const entity = this.clientsRepo.create(item);
              await this.clientsRepo.save(entity).catch(() => {});
            }
          }
        }
      }

      // 2. Restore settings if missing
      if (fs.existsSync(this.settingsBackupPath)) {
        const raw = fs.readFileSync(this.settingsBackupPath, 'utf8');
        const backupSettings: Partial<RadarSetting> = JSON.parse(raw);
        const currentSetting = await this.settingsRepo.findOne({ where: { id: 'default' } });
        if (!currentSetting && backupSettings) {
          this.logger.log('Restaurando configuración del Radar desde archivo de respaldo...');
          const entity = this.settingsRepo.create(backupSettings);
          await this.settingsRepo.save(entity).catch(() => {});
        }
      }
    } catch (err) {
      this.logger.warn('Failed to restore radar from backup files', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /**
   * Auto-creates SQLite tables if they do not exist and inserts default settings.
   */
  private async ensureTables(): Promise<void> {
    try {
      await this.settingsRepo.query(`
        CREATE TABLE IF NOT EXISTS radar_settings (
          id VARCHAR(32) PRIMARY KEY,
          enabled BOOLEAN NOT NULL DEFAULT 0,
          minTextLength INT NOT NULL DEFAULT 8,
          ignoreMediaWithoutCaption BOOLEAN NOT NULL DEFAULT 1,
          groupFilterMode VARCHAR(32) NOT NULL DEFAULT 'ALL',
          groupCategoryKeywords TEXT NOT NULL DEFAULT 'quilicura,valle lo campino,valle grande',
          groupCategoryTags TEXT NOT NULL DEFAULT '[]',
          whitelistedGroupIds TEXT NOT NULL DEFAULT '[]',
          activeScanningSessions TEXT NOT NULL DEFAULT '[]',
          dedupWindowSeconds INT NOT NULL DEFAULT 30,
          crossGroupDedupMinutes INT NOT NULL DEFAULT 60,
          aiSemanticEnabled BOOLEAN NOT NULL DEFAULT 1,
          aiProvider VARCHAR(32) NOT NULL DEFAULT 'typesafe',
          typesafeApiKey TEXT NOT NULL DEFAULT '',
          globalBlacklistedSenders TEXT NOT NULL DEFAULT '[]',
          updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `).catch(() => {});

      await this.clientsRepo.query(`
        CREATE TABLE IF NOT EXISTS radar_clients (
          id VARCHAR(36) PRIMARY KEY,
          name VARCHAR(128) NOT NULL,
          rubroKey VARCHAR(64) NOT NULL,
          targetPhone VARCHAR(32) NOT NULL,
          senderSessionId VARCHAR(64) NOT NULL DEFAULT '',
          localKeywords TEXT NOT NULL DEFAULT '',
          jevPromptCriteria TEXT NULL,
          useAiFilter BOOLEAN NOT NULL DEFAULT 1,
          alertTemplate TEXT NOT NULL,
          active BOOLEAN NOT NULL DEFAULT 1,
          blacklistedSenders TEXT NOT NULL DEFAULT '[]',
          negativePhrases TEXT NOT NULL DEFAULT '[]',
          groupFilterMode VARCHAR(32) NOT NULL DEFAULT 'GLOBAL',
          groupCategoryKeywords TEXT NOT NULL DEFAULT '',
          groupCategoryTags TEXT NOT NULL DEFAULT '[]',
          whitelistedGroupIds TEXT NOT NULL DEFAULT '[]',
          createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
          updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `).catch(() => {});

      if (this.logsRepo) {
        await this.logsRepo.query(`
          CREATE TABLE IF NOT EXISTS radar_lead_logs (
            id VARCHAR(36) PRIMARY KEY,
            clientId VARCHAR(64),
            clientName VARCHAR(128) NOT NULL,
            rubroKey VARCHAR(64) NOT NULL DEFAULT '',
            sessionId VARCHAR(64) NOT NULL DEFAULT '',
            groupId VARCHAR(128) NOT NULL DEFAULT '',
            groupName VARCHAR(255) NOT NULL DEFAULT '',
            buyerPhone VARCHAR(32) NOT NULL DEFAULT '',
            messageText TEXT NOT NULL,
            matchedKeyword VARCHAR(128) NOT NULL DEFAULT '',
            aiEvaluated BOOLEAN NOT NULL DEFAULT 0,
            aiScore REAL,
            status VARCHAR(32) NOT NULL,
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `).catch(() => {});
        await this.logsRepo.query(`CREATE INDEX IF NOT EXISTS idx_radar_logs_client ON radar_lead_logs(clientId)`).catch(() => {});
        await this.logsRepo.query(`CREATE INDEX IF NOT EXISTS idx_radar_logs_created ON radar_lead_logs(createdAt)`).catch(() => {});
      }

      // Backward compatibility migrations for existing databases (Postgres & SQLite)
      const isPostgres = this.settingsRepo.metadata.connection.options.type === 'postgres';
      if (isPostgres) {
        await this.settingsRepo.query(`ALTER TABLE radar_settings ADD COLUMN IF NOT EXISTS "groupCategoryTags" TEXT DEFAULT '[]'`).catch(() => {});
        await this.settingsRepo.query(`ALTER TABLE radar_settings ADD COLUMN IF NOT EXISTS "crossGroupDedupMinutes" INT DEFAULT 60`).catch(() => {});
        await this.clientsRepo.query(`ALTER TABLE radar_clients ADD COLUMN IF NOT EXISTS "groupFilterMode" VARCHAR(32) DEFAULT 'GLOBAL'`).catch(() => {});
        await this.clientsRepo.query(`ALTER TABLE radar_clients ADD COLUMN IF NOT EXISTS "groupCategoryKeywords" TEXT DEFAULT ''`).catch(() => {});
        await this.clientsRepo.query(`ALTER TABLE radar_clients ADD COLUMN IF NOT EXISTS "groupCategoryTags" TEXT DEFAULT '[]'`).catch(() => {});
        await this.clientsRepo.query(`ALTER TABLE radar_clients ADD COLUMN IF NOT EXISTS "whitelistedGroupIds" TEXT DEFAULT '[]'`).catch(() => {});
      } else {
        await this.settingsRepo.query(`ALTER TABLE radar_settings ADD COLUMN aiSemanticEnabled BOOLEAN NOT NULL DEFAULT 1`).catch(() => {});
        await this.settingsRepo.query(`ALTER TABLE radar_settings ADD COLUMN aiProvider VARCHAR(32) NOT NULL DEFAULT 'typesafe'`).catch(() => {});
        await this.settingsRepo.query(`ALTER TABLE radar_settings ADD COLUMN typesafeApiKey TEXT NOT NULL DEFAULT ''`).catch(() => {});
        await this.settingsRepo.query(`ALTER TABLE radar_settings ADD COLUMN globalBlacklistedSenders TEXT NOT NULL DEFAULT '[]'`).catch(() => {});
        await this.settingsRepo.query(`ALTER TABLE radar_settings ADD COLUMN groupCategoryTags TEXT NOT NULL DEFAULT '[]'`).catch(() => {});
        await this.settingsRepo.query(`ALTER TABLE radar_settings ADD COLUMN crossGroupDedupMinutes INT DEFAULT 60`).catch(() => {});

        await this.clientsRepo.query(`ALTER TABLE radar_clients ADD COLUMN useAiFilter BOOLEAN NOT NULL DEFAULT 1`).catch(() => {});
        await this.clientsRepo.query(`ALTER TABLE radar_clients ADD COLUMN blacklistedSenders TEXT NOT NULL DEFAULT '[]'`).catch(() => {});
        await this.clientsRepo.query(`ALTER TABLE radar_clients ADD COLUMN negativePhrases TEXT NOT NULL DEFAULT '[]'`).catch(() => {});
        await this.clientsRepo.query(`ALTER TABLE radar_clients ADD COLUMN groupFilterMode VARCHAR(32) NOT NULL DEFAULT 'GLOBAL'`).catch(() => {});
        await this.clientsRepo.query(`ALTER TABLE radar_clients ADD COLUMN groupCategoryKeywords TEXT NOT NULL DEFAULT ''`).catch(() => {});
        await this.clientsRepo.query(`ALTER TABLE radar_clients ADD COLUMN groupCategoryTags TEXT NOT NULL DEFAULT '[]'`).catch(() => {});
        await this.clientsRepo.query(`ALTER TABLE radar_clients ADD COLUMN whitelistedGroupIds TEXT NOT NULL DEFAULT '[]'`).catch(() => {});
      }

      let defaultSetting = await this.settingsRepo.findOne({ where: { id: 'default' } });
      if (!defaultSetting) {
        defaultSetting = this.settingsRepo.create({
          id: 'default',
          enabled: false,
          minTextLength: 8,
          ignoreMediaWithoutCaption: true,
          groupFilterMode: 'ALL',
          groupCategoryKeywords: 'quilicura,valle lo campino,valle grande',
          whitelistedGroupIds: '[]',
          activeScanningSessions: '[]',
          dedupWindowSeconds: 30,
          crossGroupDedupMinutes: 60,
          aiSemanticEnabled: true,
          aiProvider: 'typesafe',
          typesafeApiKey: DEFAULT_TYPESAFE_API_KEY,
        });
        await this.settingsRepo.save(defaultSetting);
        this.logger.log('Default Radar settings initialized');
      }
    } catch (err) {
      this.logger.warn('Failed to ensure radar tables', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /**
   * Refreshes in-memory cache of settings and active clients.
   */
  async reloadCache(): Promise<void> {
    try {
      let settings = await this.settingsRepo.findOne({ where: { id: 'default' } });
      if (!settings) {
        settings = this.settingsRepo.create({ id: 'default', enabled: false });
      }
      this.cachedSettings = settings;
      this.cachedActiveClients = await this.clientsRepo.find({ where: { active: true } });
    } catch (err) {
      this.logger.warn('Failed to reload radar cache', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /**
   * Evaluates an incoming WhatsApp message in 0 ms.
   * Runs fire-and-forget: MUST NEVER THROW or block the message receive pipeline.
   */
  async evaluateInbound(sessionId: string, message: any): Promise<void> {
    try {
      // 0 ms Gate 1: Master ON/OFF Switch
      const settings = this.cachedSettings;
      if (!settings || !settings.enabled) {
        return;
      }

      // 0 ms Gate 2: Ignore outgoing / echo messages
      if (message.fromMe) {
        return;
      }

      // 0 ms Gate 3: Must be a group message
      const isGroup = Boolean(
        message.isGroup ||
        (message.chatId && message.chatId.endsWith('@g.us')) ||
        (message.from && message.from.endsWith('@g.us'))
      );
      if (!isGroup) {
        return;
      }

      // 0 ms Gate 4: Session check (if activeScanningSessions configured)
      const allowedSessions: string[] = this.parseJsonArray(settings.activeScanningSessions);
      if (allowedSessions.length > 0 && !allowedSessions.includes(sessionId)) {
        return;
      }

      // 0 ms Gate 5: Text length and caption check
      const text = (message.body || message.caption || '').trim();
      if (settings.ignoreMediaWithoutCaption && message.type && message.type !== 'chat' && !text) {
        return;
      }
      if (text.length < (settings.minTextLength ?? 8)) {
        return;
      }

      // 0 ms Gate 6: Deduplication check across shared sessions
      const groupId = message.chatId || message.from || '';
      const author = message.author || message.from || '';
      const dedupKey = `${groupId}:${message.id || (author + ':' + text.slice(0, 30))}`;
      const now = Date.now();
      const dedupWindowMs = (settings.dedupWindowSeconds ?? 30) * 1000;

      // Clean old keys occasionally
      if (this.dedupCache.size > 500) {
        for (const [k, ts] of this.dedupCache.entries()) {
          if (now - ts > dedupWindowMs) {
            this.dedupCache.delete(k);
          }
        }
      }

      if (this.dedupCache.has(dedupKey)) {
        const lastSeen = this.dedupCache.get(dedupKey) || 0;
        if (now - lastSeen < dedupWindowMs) {
          return; // Duplicate lead message already evaluated
        }
      }
      this.dedupCache.set(dedupKey, now);

      // 0 ms Gate 7: Group Filter Pre-Check
      const groupName = await this.resolveGroupName(sessionId, groupId);
      const groupTags = this.loadGroupTags();

      // Discard in 0 ms if no active client listens to this group
      const anyClientListens = this.cachedActiveClients.some(client =>
        this.isGroupAllowedForClient(client, settings, groupId, groupName, groupTags),
      );
      if (!anyClientListens) {
        return;
      }

      // Gate 8: Keyword matching against active clients
      if (!this.cachedActiveClients || this.cachedActiveClients.length === 0) {
        return;
      }

      const buyerPhoneDigits = normalizePhoneDigits(author);

      for (const client of this.cachedActiveClients) {
        // Individual client group scope check (ALL, CATEGORY, WHITELIST, GLOBAL)
        if (!this.isGroupAllowedForClient(client, settings, groupId, groupName, groupTags)) {
          continue;
        }

        const { matched, matchedKeyword } = matchesKeywords(text, client.localKeywords);
        if (!matched) continue;

        // 0 ms Gate 8.5: Blacklist Gate (Sender Phone, Extracted Phones & Negative Phrases)
        const globalBlockedPhones: string[] = this.parseJsonArray(settings.globalBlacklistedSenders);
        const clientBlockedPhones: string[] = this.parseJsonArray(client.blacklistedSenders);
        const clientNegativePhrases: string[] = this.parseJsonArray(client.negativePhrases);
        const extractedPhones = extractPhonesFromText(text);
        const allCandidatePhones = [buyerPhoneDigits, ...extractedPhones].filter(Boolean);

        const isPhoneBlocked = allCandidatePhones.some(
          (p) => globalBlockedPhones.includes(p) || clientBlockedPhones.includes(p),
        );

        const normalizedMessageText = normalizeTextForSearch(text);
        const isPhraseBlocked = clientNegativePhrases.some((phrase) => {
          const normPhrase = normalizeTextForSearch(phrase);
          return normPhrase && normalizedMessageText.includes(normPhrase);
        });

        if (isPhoneBlocked || isPhraseBlocked) {
          const reason = isPhoneBlocked
            ? 'Emisor o teléfono en mensaje bloqueado por lista negra'
            : 'Contiene frase prohibida en lista negra';
          this.logger.log(`[Radar Lead] DISCARDED in 0ms by Blacklist for client "${client.name}". Motivo: ${reason}`);
          await this.recordLog({
            clientId: client.id,
            clientName: client.name,
            rubroKey: client.rubroKey,
            sessionId,
            groupId,
            groupName: groupName || groupId,
            buyerPhone: buyerPhoneDigits,
            messageText: text,
            matchedKeyword: matchedKeyword || '',
            aiEvaluated: false,
            aiScore: 0.0,
            status: 'DISCARDED_AI',
          });
          continue;
        }

        // 0 ms Gate 8.8: Cross-Group Duplicate Alert Check (Anti-spam / Difusiones idénticas en múltiples grupos)
        // Detecta si este texto idéntico ya generó una alerta reciente para este cliente o para el teléfono de destino
        const dedupWindowMinutes = settings.crossGroupDedupMinutes ?? 60;
        const crossGroupWindowMs = dedupWindowMinutes * 60 * 1000;
        this.cleanExpiredCrossGroupAlerts(crossGroupWindowMs);

        const textFingerprint = computeTextDedupFingerprint(text);
        const clientDedupKey = `${client.id}:${textFingerprint}`;
        const targetPhoneDigits = normalizePhoneDigits(client.targetPhone);
        const targetPhoneDedupKey = targetPhoneDigits ? `${targetPhoneDigits}:${textFingerprint}` : null;

        const existingAlert = textFingerprint
          ? (this.crossGroupAlertCache.get(clientDedupKey) || (targetPhoneDedupKey ? this.crossGroupAlertCache.get(targetPhoneDedupKey) : null))
          : null;

        if (textFingerprint && existingAlert && (now - existingAlert.timestamp < crossGroupWindowMs)) {
          const agoMin = Math.round((now - existingAlert.timestamp) / 60000);
          this.logger.log(
            `[Radar Lead] DISCARDED in 0ms: Mensaje duplicado ya alertado hace ${agoMin} min en grupo "${existingAlert.groupName}" para cliente "${client.name}" o su teléfono de destino.`,
          );
          await this.recordLog({
            clientId: client.id,
            clientName: client.name,
            rubroKey: client.rubroKey,
            sessionId,
            groupId,
            groupName: groupName || groupId,
            buyerPhone: buyerPhoneDigits,
            messageText: text,
            matchedKeyword: matchedKeyword || '',
            aiEvaluated: false,
            aiScore: null,
            status: 'DISCARDED_DUPLICATE',
          });
          continue; // Descarte inmediato en 0 ms: ¡no gasta tokens de TypeSafe AI ni envía spam al usuario!
        }

        // 0 ms Gate 9: Semantic AI Validation (Anti-vendedores / Intención de compra)
        const isAiEnabled =
          (settings.aiSemanticEnabled ?? true) &&
          (client.useAiFilter ?? true) &&
          Boolean(client.jevPromptCriteria?.trim());

        let aiEvaluated = false;
        let aiScore: number | null = null;

        if (isAiEnabled) {
          aiEvaluated = true;
          const effectiveKey = (settings.typesafeApiKey || '').trim() || DEFAULT_TYPESAFE_API_KEY;
          const aiCheck = await evaluateSemanticCriteriaWithTypeSafe(
            text,
            client.jevPromptCriteria!.trim(),
            effectiveKey,
          );
          aiScore = aiCheck.score;

          // Tarifa oficial TypeSafe: $0.042 USD por 1M tokens ($0.000000042 / token)
          const promptChars = (text || '').length + (client.jevPromptCriteria?.length || 0);
          const estimatedTokens = Math.max(80, Math.ceil(promptChars / 3.5) + 30);
          const evalCost = (estimatedTokens * 0.042) / 1_000_000;

          this.aiTelemetryService?.recordUsage({
            provider: 'typesafe',
            serviceType: 'radar_eval',
            model: 'jev-latest',
            sessionId,
            promptTokens: estimatedTokens,
            completionTokens: 10,
            totalTokens: estimatedTokens + 10,
            costUsd: evalCost,
            success: true,
          }).catch(() => {});

          if (!aiCheck.isMatch) {
            this.logger.log(
              `[Radar Lead] DISCARDED by TypeSafe AI (score: ${aiCheck.score.toFixed(2)}) for client "${client.name}". Motivo: Vendedor o sin intención de compra. Texto: "${text.slice(0, 60)}"`,
            );
            await this.recordLog({
              clientId: client.id,
              clientName: client.name,
              rubroKey: client.rubroKey,
              sessionId,
              groupId,
              groupName: groupName || groupId,
              buyerPhone: buyerPhoneDigits,
              messageText: text,
              matchedKeyword: matchedKeyword || '',
              aiEvaluated: true,
              aiScore: aiCheck.score,
              status: 'DISCARDED_AI',
            });
            continue; // Filtered out: seller or non-buyer!
          }

          this.logger.log(
            `[Radar Lead] APPROVED by TypeSafe AI (score: ${aiCheck.score.toFixed(2)}) for client "${client.name}"`,
          );
        }

        // Record approved / dispatched lead log
        await this.recordLog({
          clientId: client.id,
          clientName: client.name,
          rubroKey: client.rubroKey,
          sessionId,
          groupId,
          groupName: groupName || groupId,
          buyerPhone: buyerPhoneDigits,
          messageText: text,
          matchedKeyword: matchedKeyword || '',
          aiEvaluated,
          aiScore,
          status: 'DISPATCHED',
        });

        this.logger.log(`Radar lead matched for client "${client.name}" (rubro: ${client.rubroKey}, keyword: "${matchedKeyword}")`);

        // Format alert template
        const alertMessage = this.formatAlertMessage(client, {
          groupName: groupName || groupId,
          buyerPhone: buyerPhoneDigits,
          buyerMessage: text,
        });

        // Dispatch alert via WhatsApp
        await this.dispatchAlert(client, alertMessage, sessionId);

        // Registrar huella en caché inter-grupos para prevenir alertas duplicadas en otros grupos
        if (textFingerprint) {
          const alertEntry = { timestamp: Date.now(), groupName: groupName || groupId };
          this.crossGroupAlertCache.set(clientDedupKey, alertEntry);
          if (targetPhoneDedupKey) {
            this.crossGroupAlertCache.set(targetPhoneDedupKey, alertEntry);
          }
        }
      }
    } catch (err) {
      this.logger.warn('Error evaluating inbound radar lead (fail-open)', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /**
   * Loads group categories and segmentations from GroupTagsService or data/group-tags.json fallback.
   */
  loadGroupTags(): GroupTag[] {
    if (this.groupTagsService) {
      try {
        const tags = this.groupTagsService.getTags();
        if (Array.isArray(tags)) return tags;
      } catch (err: any) {
        this.logger.warn('Failed to load group tags from service, reading file fallback', { error: err?.message });
      }
    }
    try {
      const filePath = path.join(process.cwd(), 'data', 'group-tags.json');
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, 'utf8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return [];
  }

  getGroupTags(): GroupTag[] {
    return this.loadGroupTags();
  }

  saveGroupTag(dto: SaveGroupCategoryTagDto): GroupTag {
    if (this.groupTagsService) {
      return this.groupTagsService.saveTag('global', dto);
    }
    const tags = this.loadGroupTags();
    let existing = dto.id ? tags.find(t => t.id === dto.id) : null;
    if (!existing) {
      existing = tags.find(t => t.name.toLowerCase() === dto.name.toLowerCase());
    }
    if (existing) {
      existing.name = dto.name;
      if (dto.color) existing.color = dto.color;
      existing.groupIds = Array.from(new Set([...dto.groupIds]));
    } else {
      existing = {
        id: `tag_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        sessionId: 'global',
        name: dto.name,
        color: dto.color || '#10b981',
        groupIds: Array.from(new Set([...dto.groupIds])),
        createdAt: new Date().toISOString(),
      };
      tags.push(existing);
    }
    const filePath = path.join(process.cwd(), 'data', 'group-tags.json');
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(tags, null, 2), 'utf8');
    return existing;
  }

  deleteGroupTag(id: string): { success: boolean } {
    if (this.groupTagsService) {
      const success = this.groupTagsService.deleteTag('global', id);
      return { success };
    }
    const tags = this.loadGroupTags();
    const idx = tags.findIndex(t => t.id === id);
    if (idx !== -1) {
      tags.splice(idx, 1);
      const filePath = path.join(process.cwd(), 'data', 'group-tags.json');
      fs.writeFileSync(filePath, JSON.stringify(tags, null, 2), 'utf8');
      return { success: true };
    }
    return { success: false };
  }

  /**
   * Checks if group satisfies current filter settings.
   */
  checkGroupAllowed(settings: RadarSetting, groupId: string, groupName: string, tags?: GroupTag[]): boolean {
    const mode = settings.groupFilterMode || 'ALL';

    if (mode === 'ALL') {
      return true;
    }

    if (mode === 'WHITELIST') {
      const whitelist: string[] = this.parseJsonArray(settings.whitelistedGroupIds);
      return whitelist.includes(groupId);
    }

    if (mode === 'CATEGORY') {
      const categoryKeywords = (settings.groupCategoryKeywords || '').trim();
      const categoryTags: string[] = this.parseJsonArray(settings.groupCategoryTags);

      // Check category tags (segmentation)
      if (categoryTags.length > 0 && tags && tags.length > 0) {
        const belongsToTag = tags.some(
          t => (categoryTags.includes(t.id) || categoryTags.includes(t.name)) && Array.isArray(t.groupIds) && t.groupIds.includes(groupId),
        );
        if (belongsToTag) return true;
      }

      // Check keywords in group name
      if (categoryKeywords) {
        const { matched } = matchesKeywords(groupName, categoryKeywords);
        if (matched) return true;
      }

      // If both tags and keywords are empty, allow all
      if (!categoryKeywords && categoryTags.length === 0) return true;

      return false;
    }

    return true;
  }

  /**
   * Checks if group satisfies a specific client's filter settings.
   */
  isGroupAllowedForClient(
    client: RadarClient,
    settings: RadarSetting,
    groupId: string,
    groupName: string,
    tags?: GroupTag[],
  ): boolean {
    const clientMode = client.groupFilterMode || 'GLOBAL';

    if (clientMode === 'ALL') {
      return true;
    }

    if (clientMode === 'WHITELIST') {
      const clientWhitelist: string[] = this.parseJsonArray(client.whitelistedGroupIds);
      if (clientWhitelist.length > 0) {
        return clientWhitelist.includes(groupId);
      }
      // Fallback to global whitelist if client whitelist is empty
      const globalWhitelist: string[] = this.parseJsonArray(settings.whitelistedGroupIds);
      return globalWhitelist.includes(groupId);
    }

    if (clientMode === 'CATEGORY') {
      const clientKeywords = (client.groupCategoryKeywords || '').trim();
      const clientTags: string[] = this.parseJsonArray(client.groupCategoryTags);

      // 1. Check client category tags (segmentation)
      if (clientTags.length > 0 && tags && tags.length > 0) {
        const belongsToTag = tags.some(
          t => (clientTags.includes(t.id) || clientTags.includes(t.name)) && Array.isArray(t.groupIds) && t.groupIds.includes(groupId),
        );
        if (belongsToTag) return true;
      }

      // 2. Check client keywords in group name (or fallback to settings keywords)
      const effectiveKeywords = clientKeywords || (settings.groupCategoryKeywords || '').trim();
      if (effectiveKeywords) {
        const { matched } = matchesKeywords(groupName, effectiveKeywords);
        if (matched) return true;
      }

      // If both tags and keywords are empty, allow all
      if (!clientKeywords && clientTags.length === 0 && !settings.groupCategoryKeywords) {
        return true;
      }

      return false;
    }

    // Default: 'GLOBAL' - inherit radar general settings
    return this.checkGroupAllowed(settings, groupId, groupName, tags);
  }

  /**
   * Resolves group name from cache or WhatsApp engine.
   */
  private async resolveGroupName(sessionId: string, groupId: string): Promise<string> {
    if (this.groupNameCache.has(groupId)) {
      return this.groupNameCache.get(groupId)!;
    }

    if (this.engineRegistry) {
      try {
        const engine = this.engineRegistry.get(sessionId);
        if (engine && typeof (engine as any).getGroups === 'function') {
          const groups = await (engine as any).getGroups();
          if (Array.isArray(groups)) {
            for (const g of groups) {
              if (g?.id && g?.name) {
                this.groupNameCache.set(g.id, g.name);
              }
            }
          }
        }
      } catch {}
    }

    return this.groupNameCache.get(groupId) || groupId;
  }

  /**
   * Formats the alert message with variable replacement.
   */
  formatAlertMessage(
    client: RadarClient,
    data: { groupName: string; buyerPhone: string; buyerMessage: string },
  ): string {
    const template = client.alertTemplate || DEFAULT_RADAR_ALERT_TEMPLATE;
    const whatsappLink = data.buyerPhone ? `https://wa.me/${data.buyerPhone}` : 'N/A';

    return template
      .replace(/{grupo}/g, data.groupName)
      .replace(/{rubro}/g, client.rubroKey || client.name)
      .replace(/{comprador_telefono}/g, data.buyerPhone || 'Desconocido')
      .replace(/{mensaje_comprador}/g, data.buyerMessage)
      .replace(/{enlace_whatsapp}/g, whatsappLink);
  }

  /**
   * Sends the alert message to the client's phone via WhatsApp.
   */
  private async dispatchAlert(client: RadarClient, text: string, fallbackSessionId: string): Promise<void> {
    if (!client.targetPhone) {
      this.logger.warn(`Cannot dispatch radar alert for ${client.name}: targetPhone is missing`);
      return;
    }

    const cleanTarget = normalizePhoneDigits(client.targetPhone);
    if (!cleanTarget) return;

    const targetJid = `${cleanTarget}@c.us`;
    const targetSessionId = client.senderSessionId?.trim() || fallbackSessionId;

    if (!this.engineRegistry) {
      this.logger.warn(`Cannot dispatch radar alert: engineRegistry not available`);
      return;
    }

    let engine = this.engineRegistry.get(targetSessionId);
    if (!engine) {
      // Fallback to any connected engine
      const entries = this.engineRegistry.entries();
      if (entries.length > 0) {
        engine = entries[0][1];
      }
    }

    if (!engine) {
      this.logger.warn(`No connected WhatsApp session found to dispatch radar alert to ${cleanTarget}`);
      return;
    }

    try {
      await (engine as any).sendTextMessage(targetJid, text);
      this.logger.log(`Radar alert dispatched successfully to ${cleanTarget} via session ${targetSessionId}`);
    } catch (err) {
      this.logger.error(`Failed to send radar alert to ${cleanTarget}`, {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // ==========================================
  // Public CRUD & Utility Methods
  // ==========================================

  async getSettings(): Promise<RadarSetting> {
    if (!this.cachedSettings) {
      await this.reloadCache();
    }
    return this.cachedSettings!;
  }

  async updateSettings(dto: UpdateRadarSettingsDto): Promise<RadarSetting> {
    let settings = await this.settingsRepo.findOne({ where: { id: 'default' } });
    if (!settings) {
      settings = this.settingsRepo.create({ id: 'default' });
    }

    if (dto.enabled !== undefined) settings.enabled = dto.enabled;
    if (dto.minTextLength !== undefined) settings.minTextLength = dto.minTextLength;
    if (dto.ignoreMediaWithoutCaption !== undefined) settings.ignoreMediaWithoutCaption = dto.ignoreMediaWithoutCaption;
    if (dto.groupFilterMode !== undefined) settings.groupFilterMode = dto.groupFilterMode;
    if (dto.groupCategoryKeywords !== undefined) settings.groupCategoryKeywords = dto.groupCategoryKeywords;
    if (dto.groupCategoryTags !== undefined) {
      settings.groupCategoryTags = JSON.stringify(dto.groupCategoryTags);
    }
    if (dto.whitelistedGroupIds !== undefined) {
      settings.whitelistedGroupIds = JSON.stringify(dto.whitelistedGroupIds);
    }
    if (dto.activeScanningSessions !== undefined) {
      settings.activeScanningSessions = JSON.stringify(dto.activeScanningSessions);
    }
    if (dto.dedupWindowSeconds !== undefined) settings.dedupWindowSeconds = dto.dedupWindowSeconds;
    if (dto.crossGroupDedupMinutes !== undefined) settings.crossGroupDedupMinutes = dto.crossGroupDedupMinutes;
    if (dto.aiSemanticEnabled !== undefined) settings.aiSemanticEnabled = dto.aiSemanticEnabled;
    if (dto.aiProvider !== undefined) settings.aiProvider = dto.aiProvider;
    if (dto.typesafeApiKey !== undefined) settings.typesafeApiKey = dto.typesafeApiKey;
    if (dto.globalBlacklistedSenders !== undefined) {
      settings.globalBlacklistedSenders = JSON.stringify(dto.globalBlacklistedSenders);
    }

    const saved = await this.settingsRepo.save(settings);
    await this.reloadCache();
    await this.syncBackup();
    return saved;
  }

  async getClients(): Promise<RadarClient[]> {
    return this.clientsRepo.find({ order: { createdAt: 'DESC' } });
  }

  async getClientById(id: string): Promise<RadarClient | null> {
    if (!id || typeof id !== 'string' || !id.trim() || id === 'undefined' || id === 'null') {
      return null;
    }
    return this.clientsRepo.findOne({ where: { id } });
  }

  async createClient(dto: CreateRadarClientDto): Promise<RadarClient> {
    const client = this.clientsRepo.create({
      name: dto.name,
      rubroKey: dto.rubroKey,
      targetPhone: dto.targetPhone,
      senderSessionId: dto.senderSessionId || '',
      localKeywords: dto.localKeywords,
      jevPromptCriteria: dto.jevPromptCriteria || null,
      useAiFilter: dto.useAiFilter ?? true,
      alertTemplate: dto.alertTemplate || DEFAULT_RADAR_ALERT_TEMPLATE,
      active: dto.active ?? true,
      blacklistedSenders: dto.blacklistedSenders ? JSON.stringify(dto.blacklistedSenders) : '[]',
      negativePhrases: dto.negativePhrases ? JSON.stringify(dto.negativePhrases) : '[]',
      groupFilterMode: dto.groupFilterMode || 'GLOBAL',
      groupCategoryKeywords: dto.groupCategoryKeywords || '',
      groupCategoryTags: dto.groupCategoryTags ? JSON.stringify(dto.groupCategoryTags) : '[]',
      whitelistedGroupIds: dto.whitelistedGroupIds ? JSON.stringify(dto.whitelistedGroupIds) : '[]',
    });
    const saved = await this.clientsRepo.save(client);
    await this.reloadCache();
    await this.syncBackup();
    return saved;
  }

  async updateClient(id: string, dto: UpdateRadarClientDto): Promise<RadarClient> {
    if (!id || typeof id !== 'string' || !id.trim() || id === 'undefined' || id === 'null') {
      throw new BadRequestException('ID de cliente inválido');
    }
    const client = await this.clientsRepo.findOne({ where: { id } });
    if (!client) {
      throw new NotFoundException(`Radar client with id ${id} not found`);
    }

    if (dto.name !== undefined) client.name = dto.name;
    if (dto.rubroKey !== undefined) client.rubroKey = dto.rubroKey;
    if (dto.targetPhone !== undefined) client.targetPhone = dto.targetPhone;
    if (dto.senderSessionId !== undefined) client.senderSessionId = dto.senderSessionId;
    if (dto.localKeywords !== undefined) client.localKeywords = dto.localKeywords;
    if (dto.jevPromptCriteria !== undefined) client.jevPromptCriteria = dto.jevPromptCriteria;
    if (dto.useAiFilter !== undefined) client.useAiFilter = dto.useAiFilter;
    if (dto.alertTemplate !== undefined) client.alertTemplate = dto.alertTemplate;
    if (dto.active !== undefined) client.active = dto.active;
    if (dto.blacklistedSenders !== undefined) {
      client.blacklistedSenders = Array.isArray(dto.blacklistedSenders)
        ? JSON.stringify(dto.blacklistedSenders)
        : String(dto.blacklistedSenders);
    }
    if (dto.negativePhrases !== undefined) {
      client.negativePhrases = Array.isArray(dto.negativePhrases)
        ? JSON.stringify(dto.negativePhrases)
        : String(dto.negativePhrases);
    }
    if (dto.groupFilterMode !== undefined) client.groupFilterMode = dto.groupFilterMode;
    if (dto.groupCategoryKeywords !== undefined) client.groupCategoryKeywords = dto.groupCategoryKeywords;
    if (dto.groupCategoryTags !== undefined) {
      client.groupCategoryTags = Array.isArray(dto.groupCategoryTags)
        ? JSON.stringify(dto.groupCategoryTags)
        : String(dto.groupCategoryTags);
    }
    if (dto.whitelistedGroupIds !== undefined) {
      client.whitelistedGroupIds = Array.isArray(dto.whitelistedGroupIds)
        ? JSON.stringify(dto.whitelistedGroupIds)
        : String(dto.whitelistedGroupIds);
    }

    const saved = await this.clientsRepo.save(client);
    await this.reloadCache();
    await this.syncBackup();
    return saved;
  }

  async deleteClient(id: string): Promise<boolean> {
    if (!id || typeof id !== 'string' || !id.trim() || id === 'undefined' || id === 'null') {
      throw new BadRequestException('ID de cliente inválido para eliminación');
    }
    // Delete passing primary key string directly to prevent TypeORM from stripping undefined fields into a table wipe
    const result = await this.clientsRepo.delete(id);
    await this.reloadCache();
    await this.syncBackup();
    return (result.affected ?? 0) > 0;
  }

  async toggleClient(id: string): Promise<RadarClient> {
    if (!id || typeof id !== 'string' || !id.trim() || id === 'undefined' || id === 'null') {
      throw new BadRequestException('ID de cliente inválido');
    }
    const client = await this.clientsRepo.findOne({ where: { id } });
    if (!client) {
      throw new NotFoundException(`Radar client with id ${id} not found`);
    }
    client.active = !client.active;
    const saved = await this.clientsRepo.save(client);
    await this.reloadCache();
    await this.syncBackup();
    return saved;
  }

  /**
   * Retrieves all available groups across active connected sessions.
   */
  async getAvailableGroups(): Promise<Array<{ id: string; name: string; sessionCount: number; sessions: string[] }>> {
    const groupMap = new Map<string, { id: string; name: string; sessions: Set<string> }>();

    if (this.engineRegistry) {
      const entries = this.engineRegistry.entries();
      for (const [sessId, engine] of entries) {
        try {
          if (typeof (engine as any).getGroups === 'function') {
            const groups = await (engine as any).getGroups();
            if (Array.isArray(groups)) {
              for (const g of groups) {
                if (g?.id) {
                  this.groupNameCache.set(g.id, g.name || g.id);
                  if (!groupMap.has(g.id)) {
                    groupMap.set(g.id, { id: g.id, name: g.name || g.id, sessions: new Set() });
                  }
                  if (sessId) {
                    groupMap.get(g.id)!.sessions.add(sessId);
                  }
                }
              }
            }
          }
        } catch {}
      }
    }

    return Array.from(groupMap.values()).map(item => ({
      id: item.id,
      name: item.name,
      sessionCount: item.sessions.size,
      sessions: Array.from(item.sessions),
    }));
  }

  /**
   * Simulates an evaluation for testing without sending real WhatsApp messages.
   */
  async testEvaluate(dto: TestEvaluateDto): Promise<{
    matched: boolean;
    results: Array<{
      clientName: string;
      rubroKey: string;
      targetPhone: string;
      matchedKeyword: string;
      formattedAlert: string;
    }>;
  }> {
    const groupName = dto.groupName || 'Vecinos Quilicura Valle Lo Campino';
    const buyerPhone = dto.senderPhone ? normalizePhoneDigits(dto.senderPhone) : '56987654321';
    const text = dto.text;

    const results: Array<{
      clientName: string;
      rubroKey: string;
      targetPhone: string;
      matchedKeyword: string;
      formattedAlert: string;
      aiEvaluation?: {
        evaluated: boolean;
        passed: boolean;
        score: number;
        reason: string;
      };
    }> = [];

    const clients = await this.clientsRepo.find({ where: { active: true } });
    const settings = await this.getSettings();

    for (const client of clients) {
      const { matched, matchedKeyword } = matchesKeywords(text, client.localKeywords);
      if (matched) {
        let aiEvaluation: { evaluated: boolean; passed: boolean; score: number; reason: string } = {
          evaluated: false,
          passed: true,
          score: 1.0,
          reason: 'Filtro semántico IA no configurado (Aprobado por palabras clave)',
        };

        // Gate 8.5: Blacklist Check
        const globalBlockedPhones: string[] = this.parseJsonArray(settings.globalBlacklistedSenders);
        const clientBlockedPhones: string[] = this.parseJsonArray(client.blacklistedSenders);
        const clientNegativePhrases: string[] = this.parseJsonArray(client.negativePhrases);
        const extractedPhones = extractPhonesFromText(text);
        const allCandidatePhones = [buyerPhone, ...extractedPhones].filter(Boolean);

        const isPhoneBlocked = allCandidatePhones.some(
          (p) => globalBlockedPhones.includes(p) || clientBlockedPhones.includes(p),
        );
        const normalizedMessageText = normalizeTextForSearch(text);
        const isPhraseBlocked = clientNegativePhrases.some((phrase) => {
          const normPhrase = normalizeTextForSearch(phrase);
          return normPhrase && normalizedMessageText.includes(normPhrase);
        });

        const isAiEnabled =
          (settings.aiSemanticEnabled ?? true) &&
          (client.useAiFilter ?? true) &&
          Boolean(client.jevPromptCriteria?.trim());

        if (isPhoneBlocked || isPhraseBlocked) {
          const reason = isPhoneBlocked
            ? 'Emisor o teléfono en lista negra'
            : 'Contiene frase prohibida en lista negra';
          aiEvaluation = {
            evaluated: false,
            passed: false,
            score: 0.0,
            reason: `Descarte en 0 ms por Lista Negra: ${reason}`,
          };
        } else if (isAiEnabled) {
          const effectiveKey = (settings.typesafeApiKey || '').trim() || DEFAULT_TYPESAFE_API_KEY;
          const aiCheck = await evaluateSemanticCriteriaWithTypeSafe(
            text,
            client.jevPromptCriteria!.trim(),
            effectiveKey,
          );
          // Tarifa oficial TypeSafe: $0.042 USD por 1M tokens ($0.000000042 / token)
          const promptChars = (text || '').length + (client.jevPromptCriteria?.length || 0);
          const estimatedTokens = Math.max(80, Math.ceil(promptChars / 3.5) + 30);
          const evalCost = (estimatedTokens * 0.042) / 1_000_000;

          this.aiTelemetryService?.recordUsage({
            provider: 'typesafe',
            serviceType: 'radar_eval',
            model: 'jev-latest',
            promptTokens: estimatedTokens,
            completionTokens: 10,
            totalTokens: estimatedTokens + 10,
            costUsd: evalCost,
            success: true,
          }).catch(() => {});
          aiEvaluation = {
            evaluated: true,
            passed: aiCheck.isMatch,
            score: aiCheck.score,
            reason: aiCheck.isMatch
              ? `Aprobado por TypeSafe (jev-latest): Intención de compra confirmada (confianza: ${(aiCheck.score * 100).toFixed(0)}%)`
              : `Descartado por TypeSafe (jev-latest): Vendedor o sin intención de compra (confianza: ${(aiCheck.score * 100).toFixed(0)}%)`,
          };
        }

        const formattedAlert = this.formatAlertMessage(client, {
          groupName,
          buyerPhone,
          buyerMessage: text,
        });

        results.push({
          clientName: client.name,
          rubroKey: client.rubroKey,
          targetPhone: client.targetPhone,
          matchedKeyword: matchedKeyword || '',
          formattedAlert,
          aiEvaluation,
        });

        if (dto.recordLog !== false) {
          await this.recordLog({
            clientId: client.id,
            clientName: client.name,
            rubroKey: client.rubroKey,
            sessionId: dto.sessionId || 'test',
            groupId: 'simulado@g.us',
            groupName: `${groupName} (Simulación)`,
            buyerPhone: buyerPhone || '56900000000',
            messageText: text,
            matchedKeyword: matchedKeyword || '',
            aiEvaluated: aiEvaluation.evaluated,
            aiScore: aiEvaluation.evaluated ? aiEvaluation.score : null,
            status: aiEvaluation.passed ? 'DISPATCHED' : 'DISCARDED_AI',
          });
        }
      }
    }

    return {
      matched: results.length > 0,
      results,
    };
  }

  /**
   * Records a lead event (dispatched alert or AI discard) into the telemetry table.
   */
  async recordLog(data: {
    clientId?: string;
    clientName: string;
    rubroKey: string;
    sessionId: string;
    groupId: string;
    groupName: string;
    buyerPhone: string;
    messageText: string;
    matchedKeyword: string;
    aiEvaluated: boolean;
    aiScore?: number | null;
    status: RadarLeadStatus;
  }): Promise<void> {
    if (!this.logsRepo) return;
    try {
      const log = this.logsRepo.create({
        id: crypto.randomUUID ? crypto.randomUUID() : undefined,
        ...data,
        aiScore: typeof data.aiScore === 'number' ? data.aiScore : null,
      });
      await this.logsRepo.save(log);
    } catch (err) {
      this.logger.warn('Failed to record radar lead log', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /**
   * Returns recent lead logs with optional filtering.
   */
  async getLogs(query: QueryRadarLogsDto = {}): Promise<RadarLeadLog[]> {
    if (!this.logsRepo) return [];
    const limit = Math.min(Math.max(Number(query.limit) || 50, 1), 200);
    const where: any = {};
    if (query.clientId && query.clientId !== 'ALL') {
      where.clientId = query.clientId;
    }
    if (query.status && query.status !== 'ALL') {
      where.status = query.status;
    }

    return this.logsRepo.find({
      where,
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  /**
   * Computes telemetry metrics (global KPI and per-client performance).
   */
  async getMetrics(): Promise<RadarMetricsSummaryDto> {
    const allClients = await this.clientsRepo.find({ order: { name: 'ASC' } });
    if (!this.logsRepo) {
      return {
        global: { totalMatches: 0, approvedLeads: 0, discardedAds: 0, falsePositives: 0, accuracyRate: 0 },
        byClient: allClients.map((c) => ({
          clientId: c.id,
          clientName: c.name,
          rubroKey: c.rubroKey,
          totalMatches: 0,
          approvedLeads: 0,
          discardedAds: 0,
          falsePositives: 0,
          accuracyRate: 0,
          blacklistedCount: 0,
        })),
      };
    }

    const logs = await this.logsRepo.find({
      select: { clientId: true, status: true },
    });

    let globalMatches = logs.length;
    let globalApproved = 0;
    let globalDiscarded = 0;
    let globalFalsePositives = 0;

    const clientMap = new Map<
      string,
      { totalMatches: number; approvedLeads: number; discardedAds: number; falsePositives: number }
    >();
    for (const c of allClients) {
      clientMap.set(c.id, { totalMatches: 0, approvedLeads: 0, discardedAds: 0, falsePositives: 0 });
    }

    for (const l of logs) {
      if (l.status === 'DISPATCHED') {
        globalApproved++;
      } else if (l.status === 'DISCARDED_AI' || l.status === 'DISCARDED_BLACKLIST' || l.status === 'DISCARDED_DUPLICATE') {
        globalDiscarded++;
      } else if (l.status === 'FALSE_POSITIVE') {
        globalFalsePositives++;
      }

      if (l.clientId) {
        let stats = clientMap.get(l.clientId);
        if (!stats) {
          stats = { totalMatches: 0, approvedLeads: 0, discardedAds: 0, falsePositives: 0 };
          clientMap.set(l.clientId, stats);
        }
        stats.totalMatches++;
        if (l.status === 'DISPATCHED') {
          stats.approvedLeads++;
        } else if (l.status === 'DISCARDED_AI' || l.status === 'DISCARDED_BLACKLIST' || l.status === 'DISCARDED_DUPLICATE') {
          stats.discardedAds++;
        } else if (l.status === 'FALSE_POSITIVE') {
          stats.falsePositives++;
        }
      }
    }

    const globalAccuracy = globalMatches > 0 ? Number(((globalApproved / globalMatches) * 100).toFixed(1)) : 0;

    const byClient: ClientMetricsDto[] = allClients.map((c) => {
      const stats = clientMap.get(c.id) || { totalMatches: 0, approvedLeads: 0, discardedAds: 0, falsePositives: 0 };
      const accuracy = stats.totalMatches > 0 ? Number(((stats.approvedLeads / stats.totalMatches) * 100).toFixed(1)) : 0;
      const blockedPhones = this.parseJsonArray(c.blacklistedSenders);
      const negPhrases = this.parseJsonArray(c.negativePhrases);
      return {
        clientId: c.id,
        clientName: c.name,
        rubroKey: c.rubroKey,
        totalMatches: stats.totalMatches,
        approvedLeads: stats.approvedLeads,
        discardedAds: stats.discardedAds,
        falsePositives: stats.falsePositives,
        accuracyRate: accuracy,
        blacklistedCount: blockedPhones.length + negPhrases.length,
      };
    });

    return {
      global: {
        totalMatches: globalMatches,
        approvedLeads: globalApproved,
        discardedAds: globalDiscarded,
        falsePositives: globalFalsePositives,
        accuracyRate: globalAccuracy,
      },
      byClient,
    };
  }

  /**
   * Flags a lead as false positive and dynamically adds phones/phrases to blacklist.
   */
  async flagNegativeLead(
    logId: string,
    dto: FlagNegativeLeadDto,
  ): Promise<{ success: boolean; log: RadarLeadLog; blacklistedPhones: string[]; blacklistedPhrases: string[] }> {
    if (!this.logsRepo) {
      throw new BadRequestException('Logs repository not available');
    }
    const log = await this.logsRepo.findOne({ where: { id: logId } });
    if (!log) {
      throw new NotFoundException(`Lead log with id ${logId} not found`);
    }

    log.status = 'FALSE_POSITIVE';
    await this.logsRepo.save(log);

    const addedPhones: string[] = [];
    if (Array.isArray(dto.blockPhones)) {
      for (const p of dto.blockPhones) {
        const norm = normalizePhoneDigits(p);
        if (norm) addedPhones.push(norm);
      }
    }
    if (dto.blockPhone !== false && log.buyerPhone && (!dto.blockPhones || dto.blockPhones.includes(log.buyerPhone))) {
      const norm = normalizePhoneDigits(log.buyerPhone);
      if (norm) addedPhones.push(norm);
    }
    if (Array.isArray(dto.extraPhonesToBlock)) {
      for (const p of dto.extraPhonesToBlock) {
        const norm = normalizePhoneDigits(p);
        if (norm) addedPhones.push(norm);
      }
    }

    // Auto-extract from text if no phones provided
    if (addedPhones.length === 0 && log.messageText) {
      const extracted = extractPhonesFromText(log.messageText);
      addedPhones.push(...extracted);
    }

    const uniquePhones = Array.from(new Set(addedPhones));
    const addedPhrases: string[] = [];
    if (dto.negativePhrase && dto.negativePhrase.trim()) {
      addedPhrases.push(dto.negativePhrase.trim());
    }

    const isGlobal = dto.blockScope === 'GLOBAL' || dto.scope?.toLowerCase() === 'global';
    if (isGlobal) {
      const settings = await this.getSettings();
      const currentGlobal: string[] = this.parseJsonArray(settings.globalBlacklistedSenders);
      for (const p of uniquePhones) {
        if (!currentGlobal.includes(p)) currentGlobal.push(p);
      }
      settings.globalBlacklistedSenders = JSON.stringify(currentGlobal);
      await this.settingsRepo.save(settings);
    } else if (log.clientId) {
      const client = await this.getClientById(log.clientId);
      if (client) {
        const currentClientPhones: string[] = this.parseJsonArray(client.blacklistedSenders);
        for (const p of uniquePhones) {
          if (!currentClientPhones.includes(p)) currentClientPhones.push(p);
        }
        client.blacklistedSenders = JSON.stringify(currentClientPhones);

        if (addedPhrases.length > 0) {
          const currentPhrases: string[] = this.parseJsonArray(client.negativePhrases);
          for (const phr of addedPhrases) {
            if (!currentPhrases.includes(phr)) currentPhrases.push(phr);
          }
          client.negativePhrases = JSON.stringify(currentPhrases);
        }

        await this.clientsRepo.save(client);
      }
    }

    await this.reloadCache();
    await this.syncBackup();

    return {
      success: true,
      log,
      blacklistedPhones: uniquePhones,
      blacklistedPhrases: addedPhrases,
    };
  }

  async unblockPhone(clientId: string, phone: string): Promise<RadarClient> {
    const client = await this.getClientById(clientId);
    if (!client) throw new NotFoundException('Client not found');
    const norm = normalizePhoneDigits(phone);
    const phones: string[] = this.parseJsonArray(client.blacklistedSenders);
    client.blacklistedSenders = JSON.stringify(phones.filter((p) => p !== norm));
    const saved = await this.clientsRepo.save(client);
    await this.reloadCache();
    await this.syncBackup();
    return saved;
  }

  async removeNegativePhrase(clientId: string, phrase: string): Promise<RadarClient> {
    const client = await this.getClientById(clientId);
    if (!client) throw new NotFoundException('Client not found');
    const phrases: string[] = this.parseJsonArray(client.negativePhrases);
    client.negativePhrases = JSON.stringify(phrases.filter((p) => p.toLowerCase() !== phrase.toLowerCase()));
    const saved = await this.clientsRepo.save(client);
    await this.reloadCache();
    await this.syncBackup();
    return saved;
  }

  /**
   * Clears telemetry logs.
   */
  async clearLogs(): Promise<{ success: boolean }> {
    if (this.logsRepo) {
      await this.logsRepo.clear();
    }
    return { success: true };
  }

  private parseJsonArray(str: string | null | undefined): string[] {
    if (!str) return [];
    try {
      let parsed = JSON.parse(str);
      if (typeof parsed === 'string') {
        try {
          parsed = JSON.parse(parsed);
        } catch {}
      }
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
}
