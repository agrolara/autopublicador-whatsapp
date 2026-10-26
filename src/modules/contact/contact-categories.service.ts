import { Injectable, Logger, Optional, Inject, forwardRef, BadRequestException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not, IsNull } from 'typeorm';
import { EngineRegistry } from '../../engine/engine-registry.service';
import { SessionService } from '../session/session.service';
import { LidMapping } from '../../engine/identity/lid-mapping.entity';

export interface ContactCategory {
  id: string;
  sessionId: string;
  name: string;
  color?: string;
  contactIds: string[];
  createdAt: string;
  updatedAt?: string;
}

export interface GroupBroadcastExtractionResult {
  success: boolean;
  totalGroups: number;
  existingContactsSkipped: number;
  newContactsFound: number;
  createdCategories: Array<{ id: string; name: string; count: number }>;
  message?: string;
}

@Injectable()
export class ContactCategoriesService {
  private readonly logger = new Logger(ContactCategoriesService.name);
  private readonly filePath = path.join(process.cwd(), 'data', 'contact-categories.json');
  private categories: ContactCategory[] = [];

  constructor(
    @Optional()
    @Inject(forwardRef(() => EngineRegistry))
    private readonly engines?: EngineRegistry,
    @Optional()
    @InjectRepository(LidMapping, 'data')
    private readonly lidRepo?: Repository<LidMapping>,
    @Optional()
    @Inject(forwardRef(() => SessionService))
    private readonly sessionService?: SessionService,
  ) {
    this.loadFromFile();
  }

  private loadFromFile() {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf8');
        this.categories = JSON.parse(raw);
      }
    } catch (e: any) {
      this.logger.error('Failed to load contact categories:', e?.message);
      this.categories = [];
    }
  }

  private saveToFile() {
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.filePath, JSON.stringify(this.categories, null, 2), 'utf8');
    } catch (e: any) {
      this.logger.error('Failed to save contact categories:', e?.message);
    }
  }

  getCategories(sessionId?: string): ContactCategory[] {
    return this.categories;
  }

  saveCategory(
    sessionId: string,
    dto: {
      name: string;
      color?: string;
      contactIds: string[];
      id?: string;
    },
  ): ContactCategory {
    let existing = dto.id ? this.categories.find(c => c.id === dto.id) : null;

    if (!existing) {
      existing = this.categories.find(c => c.name.toLowerCase().trim() === dto.name.toLowerCase().trim());
    }

    if (existing) {
      existing.name = dto.name.trim();
      if (dto.color) existing.color = dto.color;
      existing.contactIds = Array.from(new Set([...existing.contactIds, ...dto.contactIds]));
      existing.updatedAt = new Date().toISOString();
      this.saveToFile();
      this.logger.log(`Updated contact category "${existing.name}" with ${existing.contactIds.length} contacts`);
      return existing;
    }

    const newCategory: ContactCategory = {
      id: `cat_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      sessionId: sessionId || 'global',
      name: dto.name.trim(),
      color: dto.color || '#3b82f6',
      contactIds: Array.from(new Set([...dto.contactIds])),
      createdAt: new Date().toISOString(),
    };

    this.categories.push(newCategory);
    this.saveToFile();
    this.logger.log(`Created contact category "${newCategory.name}" with ${newCategory.contactIds.length} contacts`);
    return newCategory;
  }

  deleteCategory(sessionId: string, id: string): boolean {
    const idx = this.categories.findIndex(c => c.id === id);
    if (idx !== -1) {
      const removed = this.categories.splice(idx, 1)[0];
      this.saveToFile();
      this.logger.log(`Deleted contact category "${removed.name}" (${id})`);
      return true;
    }
    return false;
  }

  /**
   * Scans all groups from the specified session, extracts all participants,
   * excludes bot's own number and previously classified contacts,
   * and creates clean broadcast categories of up to maxPerBatch contacts (default: 100).
   */
  async extractAndCreateGroupBroadcasts(
    sessionId: string,
    maxPerBatch: number = 100,
  ): Promise<GroupBroadcastExtractionResult> {
    if (!this.engines) {
      throw new BadRequestException('EngineRegistry no está disponible en el servidor');
    }

    let engine: any;
    try {
      engine = this.engines.get(sessionId);
    } catch {
      engine = null;
    }

    if (!engine) {
      throw new BadRequestException(`La sesión "${sessionId}" no está iniciada o no está lista.`);
    }

    // 1. Identify bot's own numbers to exclude
    const excludedPhones = new Set<string>();
    try {
      if (this.sessionService) {
        const session = await this.sessionService.findOne(sessionId);
        if (session?.phone) {
          const p = session.phone.replace(/\D/g, '');
          if (p) excludedPhones.add(p);
        }
      }
    } catch {}

    try {
      const info = engine.info || engine.client?.info;
      if (info?.wid) {
        const user = typeof info.wid === 'string' ? info.wid.split('@')[0] : info.wid?.user;
        if (user) {
          const p = String(user).replace(/\D/g, '');
          if (p) excludedPhones.add(p);
        }
      }
    } catch {}

    // 2. Identify all contacts already categorized in any existing Difusión
    const existingCategories = this.getCategories(sessionId);
    const existingContactJids = new Set<string>();
    const existingPhones = new Set<string>();

    let maxIndex = 0;
    const difusionRegex = /^difusi[oó]n\s+(\d+)$/i;

    for (const cat of existingCategories) {
      const match = cat.name.trim().match(difusionRegex);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxIndex) maxIndex = num;
      }
      for (const cid of cat.contactIds) {
        existingContactJids.add(cid);
        const p = cid.split('@')[0].replace(/\D/g, '');
        if (p) existingPhones.add(p);
      }
    }

    // 3. Fetch all groups from the engine
    let groups: any[] = [];
    try {
      groups = await engine.getGroups();
    } catch (e: any) {
      this.logger.error(`Error al obtener grupos de sesión ${sessionId}: ${e?.message}`);
      throw new BadRequestException(`No se pudieron obtener los grupos de la sesión: ${e?.message || 'Error de WhatsApp'}`);
    }

    if (!Array.isArray(groups) || groups.length === 0) {
      return {
        success: true,
        totalGroups: 0,
        existingContactsSkipped: 0,
        newContactsFound: 0,
        createdCategories: [],
        message: 'No se encontraron grupos activos en esta sesión de WhatsApp.',
      };
    }

    this.logger.log(`Scanning participants from ${groups.length} groups in session ${sessionId}...`);

    // 4. Extract participants from all groups
    const rawParticipantMap = new Map<string, { id: string; name?: string }>();
    let fastLoaded = false;

    // Fast-path A: WWJS client.getChats()
    try {
      const client = engine.client || engine.groups?.client?.();
      if (client && typeof client.getChats === 'function') {
        const chats = await client.getChats();
        if (Array.isArray(chats)) {
          const groupChats = chats.filter((c: any) => c.isGroup);
          for (const gc of groupChats) {
            if (Array.isArray(gc.participants) && gc.participants.length > 0) {
              fastLoaded = true;
              for (const p of gc.participants) {
                const wid = p.id?._serialized || (typeof p.id === 'string' ? p.id : undefined);
                if (wid) {
                  rawParticipantMap.set(wid, { id: wid, name: p.name });
                }
              }
            }
          }
          if (fastLoaded) {
            this.logger.log(`Fast-extracted ${rawParticipantMap.size} participants across WWJS group chats`);
          }
        }
      }
    } catch (e: any) {
      this.logger.debug(`WWJS getChats fast-path skipped: ${e?.message}`);
    }

    // Fast-path B: Baileys sock.groupFetchAllParticipating()
    if (!fastLoaded) {
      try {
        const sock = engine.sock || engine.groups?.sock?.();
        if (sock && typeof sock.groupFetchAllParticipating === 'function') {
          const allMetadata = await sock.groupFetchAllParticipating();
          if (allMetadata && typeof allMetadata === 'object') {
            fastLoaded = true;
            for (const [, meta] of Object.entries(allMetadata as Record<string, any>)) {
              if (Array.isArray(meta?.participants)) {
                for (const p of meta.participants) {
                  const wid = p.id;
                  if (wid) {
                    rawParticipantMap.set(wid, { id: wid, name: p.name });
                  }
                }
              }
            }
            this.logger.log(`Fast-extracted ${rawParticipantMap.size} participants across Baileys socket metadata`);
          }
        }
      } catch (e: any) {
        this.logger.debug(`Baileys groupFetchAllParticipating fast-path skipped: ${e?.message}`);
      }
    }

    // Standard Fallback: Query each group's metadata via engine.getGroupInfo
    if (!fastLoaded || rawParticipantMap.size === 0) {
      const batchSize = 6;
      for (let i = 0; i < groups.length; i += batchSize) {
        const slice = groups.slice(i, i + batchSize);
        await Promise.allSettled(
          slice.map(async g => {
            try {
              const info = await engine.getGroupInfo(g.id);
              if (info && Array.isArray(info.participants)) {
                for (const p of info.participants) {
                  if (p.id) {
                    rawParticipantMap.set(p.id, { id: p.id, name: p.name });
                  }
                }
              }
            } catch (err: any) {
              this.logger.warn(`Could not fetch group info for ${g.id}: ${err?.message}`);
            }
          }),
        );
      }
    }

    // 5. Pre-load LID mappings if available
    const lidPhoneMap = new Map<string, string>();
    if (this.lidRepo) {
      try {
        const rows = await this.lidRepo.find({ where: { phone: Not(IsNull()) } });
        for (const r of rows) {
          if (r.lid && r.phone) {
            const cleanLid = r.lid.replace(/\D/g, '');
            const cleanPhone = r.phone.replace(/\D/g, '');
            if (cleanLid && cleanPhone) lidPhoneMap.set(cleanLid, cleanPhone);
          }
        }
      } catch {}
    }

    // 6. Clean, filter and deduplicate
    let existingContactsSkipped = 0;
    const newUniqueContactJids: string[] = [];
    const seenPhonesThisScan = new Set<string>();

    for (const [rawId] of rawParticipantMap.entries()) {
      if (!rawId || typeof rawId !== 'string') continue;
      if (rawId.includes('@g.us') || rawId.includes('@newsletter') || rawId.includes('status')) continue;

      let phone = '';
      if (rawId.endsWith('@lid')) {
        const cleanLid = rawId.split('@')[0].replace(/\D/g, '');
        phone = lidPhoneMap.get(cleanLid) || '';
      } else {
        phone = rawId.split('@')[0].replace(/\D/g, '');
      }

      // Check valid phone length
      if (!phone || phone.length < 7 || phone.length > 15) continue;

      // Exclude bot's own phone
      if (excludedPhones.has(phone)) continue;

      const jid = `${phone}@c.us`;

      // Skip if already in any previous category
      if (existingContactJids.has(jid) || existingPhones.has(phone)) {
        existingContactsSkipped++;
        continue;
      }

      // Skip internal duplicates within this current scan
      if (seenPhonesThisScan.has(phone)) {
        continue;
      }

      seenPhonesThisScan.add(phone);
      newUniqueContactJids.push(jid);
    }

    this.logger.log(
      `Extraction Summary: Total groups: ${groups.length}, Raw: ${rawParticipantMap.size}, Skipped existing: ${existingContactsSkipped}, New unique: ${newUniqueContactJids.length}`,
    );

    if (newUniqueContactJids.length === 0) {
      return {
        success: true,
        totalGroups: groups.length,
        existingContactsSkipped,
        newContactsFound: 0,
        createdCategories: [],
        message: 'Todos los contactos de tus grupos ya están clasificados en difusiones existentes.',
      };
    }

    // 7. Divide into clean batches of maxPerBatch (100) and create sequential categories
    const createdCategories: Array<{ id: string; name: string; count: number }> = [];
    const colorPalette = ['#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#06b6d4', '#6366f1', '#14b8a6', '#f97316'];

    let currentNum = maxIndex + 1;
    for (let i = 0; i < newUniqueContactJids.length; i += maxPerBatch) {
      const batch = newUniqueContactJids.slice(i, i + maxPerBatch);
      const name = `Difusión ${currentNum}`;
      const color = colorPalette[(currentNum - 1) % colorPalette.length];

      const saved = this.saveCategory(sessionId, {
        name,
        color,
        contactIds: batch,
      });

      createdCategories.push({
        id: saved.id,
        name: saved.name,
        count: saved.contactIds.length,
      });
      currentNum++;
    }

    return {
      success: true,
      totalGroups: groups.length,
      existingContactsSkipped,
      newContactsFound: newUniqueContactJids.length,
      createdCategories,
      message: `Se crearon exitosamente ${createdCategories.length} difusiones con ${newUniqueContactJids.length} contactos nuevos.`,
    };
  }
}
