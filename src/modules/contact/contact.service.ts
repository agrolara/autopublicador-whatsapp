import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { EngineRegistry } from '../../engine/engine-registry.service';
import { IWhatsAppEngine } from '../../engine/interfaces/whatsapp-engine.interface';
import { paginate, ListOptions } from '../../common/utils/paginate';
import { parseWaId } from '../../engine/identity/wa-id';

/**
 * Owns engine access for contact operations so the "session not started" guard and
 * contact business rules (not-found mapping) live behind the service boundary.
 */
@Injectable()
export class ContactService {
  constructor(private readonly engines: EngineRegistry) {}

  private getEngine(sessionId: string): IWhatsAppEngine {
    // EngineRegistry.require()'s default is this exact 400 "Session is not started".
    return this.engines.require(sessionId);
  }

  async getContacts(sessionId: string, opts: ListOptions = {}) {
    const engine = this.getEngine(sessionId);
    const contacts = await engine.getContacts();

    let chats: any[] = [];
    try {
      chats = await engine.getChats();
    } catch {
      // Ignore chat fetching failures if any
    }

    const contactMap = new Map<string, any>();

    // 1. Address book contacts first
    for (const c of contacts) {
      if (c && c.id) {
        contactMap.set(c.id, c);
      }
    }

    // 2. Merge non-group chats for unsaved contacts discovery
    for (const chat of chats) {
      if (!chat || chat.isGroup) continue;
      const jid = chat.id;
      if (typeof jid !== 'string' || jid.endsWith('@g.us') || jid === 'status@broadcast') continue;

      const existing = contactMap.get(jid);
      if (!existing) {
        const number = jid.split('@')[0];
        contactMap.set(jid, {
          id: jid,
          name: chat.name || undefined,
          pushName: chat.name || undefined,
          number: number,
          isMyContact: chat.isMyContact ?? false,
          isBlocked: chat.isBlocked ?? false,
        });
      } else if (!existing.name && chat.name) {
        existing.name = chat.name;
      }
    }

    const all = Array.from(contactMap.values());
    return paginate(all, opts.limit, opts.offset);
  }

  async getContactById(sessionId: string, contactId: string) {
    const contact = await this.getEngine(sessionId).getContactById(contactId);
    if (!contact) {
      throw new NotFoundException(`Contact ${contactId} not found`);
    }
    return contact;
  }

  /** The read half of block/unblock — neutral ids only (the honest common subset of both engines). */
  getBlockedContacts(sessionId: string) {
    return this.getEngine(sessionId).getBlockedContacts();
  }

  checkNumberExists(sessionId: string, number: string) {
    return this.getEngine(sessionId).checkNumberExists(number);
  }

  getNumberId(sessionId: string, number: string) {
    return this.getEngine(sessionId).getNumberId(number);
  }

  resolveContactPhone(sessionId: string, contactId: string) {
    return this.getEngine(sessionId).resolveContactPhone(contactId);
  }

  getProfilePicture(sessionId: string, contactId: string) {
    return this.getEngine(sessionId).getProfilePicture(contactId);
  }

  /** Upper bound for one batch call — keeps a huge `ids` list from pinning the engine for minutes. */
  private static readonly PROFILE_PICTURES_MAX_IDS = 50;

  /** Per-id engine-lookup deadline: one hanging id must not hold the whole batch hostage. */
  private static readonly PROFILE_PICTURE_LOOKUP_TIMEOUT_MS = 8000;

  /**
   * Batch-resolve profile picture URLs for a list of contact ids (the dashboard's chat-list avatars
   * — one HTTP call instead of N, so the per-IP throttle isn't exhausted by a sidebar full of
   * parallel fetches). Engine lookups run 5 at a time with a per-id deadline; a per-id failure or
   * timeout yields null for that id (hidden/no picture), never aborts the batch. Ids beyond
   * PROFILE_PICTURES_MAX_IDS are ignored.
   */
  async getProfilePictures(sessionId: string, ids: string[]): Promise<Record<string, string | null>> {
    const engine = this.getEngine(sessionId);
    const capped = ids.slice(0, ContactService.PROFILE_PICTURES_MAX_IDS);
    const pictures: Record<string, string | null> = {};
    const CHUNK = 5;
    for (let i = 0; i < capped.length; i += CHUNK) {
      const chunk = capped.slice(i, i + CHUNK);
      const results = await Promise.all(
        chunk.map((id): Promise<readonly [string, string | null]> => {
          // Per-id deadline: a hanging lookup (bad/unreachable id) resolves null instead of
          // stalling the whole batch; the timer is cleared the moment the engine settles.
          return new Promise<readonly [string, string | null]>(resolve => {
            const timer = setTimeout(
              () => resolve([id, null] as const),
              ContactService.PROFILE_PICTURE_LOOKUP_TIMEOUT_MS,
            );
            engine.getProfilePicture(id).then(
              url => {
                clearTimeout(timer);
                resolve([id, url] as const);
              },
              () => {
                clearTimeout(timer);
                resolve([id, null] as const);
              },
            );
          });
        }),
      );
      for (const [id, url] of results) {
        pictures[id] = url;
      }
    }
    return pictures;
  }

  blockContact(sessionId: string, contactId: string) {
    return this.getEngine(sessionId).blockContact(contactId);
  }

  /**
   * An addressbook entry is keyed by a PHONE NUMBER, so a privacy-id (`@lid`) contact cannot be
   * saved or removed: the lid's digits are not a phone number, and whatsapp-web.js — which takes a
   * bare number rather than a JID — would happily store them as one, silently creating an
   * addressbook entry for a number that does not exist.
   *
   * Refused rather than forward-resolved through the lid mapping: the mapping is best-effort, and a
   * write that lands under the wrong number is worse than one the caller is told to redo with a
   * phone-based id.
   */
  private assertAddressable(contactId: string): void {
    const kind = parseWaId(contactId).kind;
    // Allow-list rather than deny-list: only a user id (or a bare number, which parses as
    // `unknown`) names a phone. A group/newsletter/broadcast/status id also carries digits that
    // whatsapp-web.js would happily store as a phone number for a contact that does not exist.
    if (kind === 'user' || this.isBareNumber(contactId)) return;
    if (kind === 'lid') {
      throw new BadRequestException(
        `Contact ${contactId} is a privacy id (@lid) with no known phone number; the addressbook is keyed by phone number, so pass a phone-based contact id instead`,
      );
    }
    throw new BadRequestException(
      `Contact ${contactId} does not name a person; the addressbook is keyed by phone number, so pass a phone-based contact id instead`,
    );
  }

  /** A digits-only id, e.g. `628123456789` — accepted for convenience and qualified below. */
  private isBareNumber(contactId: string): boolean {
    return parseWaId(contactId).kind === 'unknown' && /^\d{5,}$/.test(contactId.trim());
  }

  /**
   * Qualify a bare number to the neutral `@c.us` dialect before it reaches an engine.
   *
   * Baileys keys the addressbook app-state patch by the id it is handed and only folds a recognised
   * user JID to the engine dialect, so an unqualified number would be written under a key WhatsApp
   * never reads — reported as success. whatsapp-web.js takes the user-part either way, so the
   * qualification is a no-op there.
   */
  private toAddressableId(contactId: string): string {
    return this.isBareNumber(contactId) ? `${contactId.trim()}@c.us` : contactId;
  }

  upsertContact(sessionId: string, contactId: string, firstName: string, lastName?: string) {
    this.assertAddressable(contactId);
    return this.getEngine(sessionId).upsertContact(this.toAddressableId(contactId), firstName, lastName);
  }

  deleteContact(sessionId: string, contactId: string) {
    this.assertAddressable(contactId);
    return this.getEngine(sessionId).deleteContact(this.toAddressableId(contactId));
  }

  unblockContact(sessionId: string, contactId: string) {
    return this.getEngine(sessionId).unblockContact(contactId);
  }
}
