import { Injectable, Logger, Optional, Inject, forwardRef, BadRequestException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not, IsNull } from 'typeorm';
import { EngineRegistry } from '../../engine/engine-registry.service';
import { SessionService } from '../session/session.service';
import { GroupTagsService } from './group-tags.service';
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
    @Optional()
    @Inject(forwardRef(() => GroupTagsService))
    private readonly groupTagsService?: GroupTagsService,
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
   * Resolves the primary geographic zone for a WhatsApp group using:
   * 1. Existing manual group tags (QUILICURA, RENCA, OTROS, NO PUBLICAR AQUI -> mapped to Otros)
   * 2. Semantic matching against Santiago commune keywords from the group subject / name
   */
  resolveGroupZone(groupId: string, groupName: string = ''): string {
    // 1. Check existing Group Tags
    if (this.groupTagsService) {
      try {
        const tags = this.groupTagsService.getTags();
        for (const t of tags) {
          if (Array.isArray(t.groupIds) && t.groupIds.includes(groupId)) {
            const tagNameUpper = (t.name || '').toUpperCase().trim();
            if (tagNameUpper.includes('QUILICURA')) return 'Quilicura';
            if (tagNameUpper.includes('RENCA')) return 'Renca';
            // Numbers in "NO PUBLICAR AQUI" are categorized as "Otros" per user requirement
            if (tagNameUpper.includes('NO PUBLICAR') || tagNameUpper.includes('NO_PUBLICAR')) return 'Otros';
            if (tagNameUpper.includes('OTRO')) return 'Otros';
            return t.name.charAt(0).toUpperCase() + t.name.slice(1).toLowerCase();
          }
        }
      } catch (err: any) {
        this.logger.debug(`Error checking group tags: ${err?.message}`);
      }
    }

    // 2. Semantic matching from group title (Santiago communes)
    const nameLower = (groupName || '').toLowerCase();
    if (/quilicura|valle\s*lo\s*campino|valle\s*grande/i.test(nameLower)) return 'Quilicura';
    if (/renca/i.test(nameLower)) return 'Renca';
    if (/maip[uú]|pajaritos/i.test(nameLower)) return 'Maipú';
    if (/pudahuel|ciudad\s*de\s*los\s*valles/i.test(nameLower)) return 'Pudahuel';
    if (/lampa|batuco/i.test(nameLower)) return 'Lampa';
    if (/santiago\s*centro|stgo\s*centro/i.test(nameLower)) return 'Santiago Centro';
    if (/la\s*florida/i.test(nameLower)) return 'La Florida';
    if (/puente\s*alto/i.test(nameLower)) return 'Puente Alto';
    if (/san\s*bernardo/i.test(nameLower)) return 'San Bernardo';
    if (/conchal[ií]/i.test(nameLower)) return 'Conchalí';
    if (/recoleta/i.test(nameLower)) return 'Recoleta';
    if (/colina|chicureo/i.test(nameLower)) return 'Colina';
    if (/independencia/i.test(nameLower)) return 'Independencia';
    if (/estaci[oó]n\s*central/i.test(nameLower)) return 'Estación Central';
    if (/las\s*condes/i.test(nameLower)) return 'Las Condes';
    if (/providencia/i.test(nameLower)) return 'Providencia';
    if (/ñuñoa|nunoa/i.test(nameLower)) return 'Ñuñoa';
    if (/peñalol[eé]n|penalolen/i.test(nameLower)) return 'Peñalolén';
    if (/la\s*cisterna/i.test(nameLower)) return 'La Cisterna';
    if (/el\s*bosque/i.test(nameLower)) return 'El Bosque';
    if (/san\s*miguel/i.test(nameLower)) return 'San Miguel';
    if (/quinta\s*normal/i.test(nameLower)) return 'Quinta Normal';
    if (/cerro\s*navia/i.test(nameLower)) return 'Cerro Navia';
    if (/lo\s*prado/i.test(nameLower)) return 'Lo Prado';
    if (/macul/i.test(nameLower)) return 'Macul';
    if (/san\s*joaqu[ií]n/i.test(nameLower)) return 'San Joaquín';
    if (/lo\s*espejo/i.test(nameLower)) return 'Lo Espejo';
    if (/pedro\s*aguirre\s*cerda/i.test(nameLower)) return 'PAC';
    if (/cerrillos/i.test(nameLower)) return 'Cerrillos';
    if (/huechuraba/i.test(nameLower)) return 'Huechuraba';
    if (/lo\s*barnechea/i.test(nameLower)) return 'Lo Barnechea';
    if (/vitacura/i.test(nameLower)) return 'Vitacura';
    if (/la\s*reina/i.test(nameLower)) return 'La Reina';

    return 'Otros';
  }

  /**
   * Scans all groups from the specified session, extracts all participants,
   * excludes bot's own number and previously classified contacts (unless purgeFirst is true),
   * segmenting them by commune/zone into clean broadcast categories of up to maxPerBatch contacts (default: 100).
   */
  /**
   * Scans all groups from the given session (or ALL active sessions if sessionId === 'all' or empty),
   * extracts unique participant phone numbers, resolves their LID/JID, and categorizes them,
   * segmenting them by commune/zone into clean broadcast categories of up to maxPerBatch contacts (default: 100).
   *
   * Automatically fills existing incomplete categories for each zone before creating new sequential blocks.
   */
  async extractAndCreateGroupBroadcasts(
    sessionId: string = 'all',
    maxPerBatch: number = 100,
    purgeFirst: boolean = false,
  ): Promise<GroupBroadcastExtractionResult> {
    if (!this.engines) {
      throw new BadRequestException('EngineRegistry no está disponible en el servidor');
    }

    const isAllSessions = !sessionId || sessionId === 'all' || sessionId === 'global';
    const targetEngines: Array<{ sessionId: string; engine: any }> = [];

    if (isAllSessions) {
      for (const [id, eng] of this.engines.entries()) {
        if (eng) targetEngines.push({ sessionId: id, engine: eng });
      }
      if (targetEngines.length === 0) {
        throw new BadRequestException('No hay ninguna sesión de WhatsApp activa o conectada actualmente.');
      }
    } else {
      let engine: any;
      try {
        engine = this.engines.get(sessionId);
      } catch {
        engine = null;
      }
      if (!engine) {
        throw new BadRequestException(`La sesión "${sessionId}" no está iniciada o no está lista.`);
      }
      targetEngines.push({ sessionId, engine });
    }

    // Optional purge of previous generic or existing broadcast categories before re-classifying
    if (purgeFirst) {
      const initialCount = this.categories.length;
      this.categories = this.categories.filter(c => !/^difusi[oó]n/i.test(c.name.trim()));
      this.saveToFile();
      this.logger.log(`Purged ${initialCount - this.categories.length} previous broadcast categories before re-extracting`);
    }

    // 1. Identify bot's own numbers across ALL sessions to exclude
    const excludedPhones = new Set<string>();
    try {
      if (this.sessionService) {
        const allSessions = await this.sessionService.findAll();
        for (const s of allSessions) {
          if (s?.phone) {
            const p = s.phone.replace(/\D/g, '');
            if (p) excludedPhones.add(p);
          }
        }
      }
    } catch {}

    for (const item of targetEngines) {
      try {
        const info = item.engine.info || item.engine.client?.info;
        if (info?.wid) {
          const user = typeof info.wid === 'string' ? info.wid.split('@')[0] : info.wid?.user;
          if (user) {
            const p = String(user).replace(/\D/g, '');
            if (p) excludedPhones.add(p);
          }
        }
      } catch {}
    }

    // 2. Identify all contacts already categorized in any existing Difusión (skipped when purgeFirst is false)
    const existingCategories = this.getCategories();
    const existingContactJids = new Set<string>();
    const existingPhones = new Set<string>();

    for (const cat of existingCategories) {
      for (const cid of cat.contactIds) {
        existingContactJids.add(cid);
        const p = cid.split('@')[0].replace(/\D/g, '');
        if (p) existingPhones.add(p);
      }
    }

    // 3. Fetch all groups from target engines, deduplicating groups across sessions
    let totalGroupsScanned = 0;
    const rawParticipantMap = new Map<string, { id: string; name?: string }>();
    const participantZonesMap = new Map<string, Set<string>>();
    const processedGroupIds = new Set<string>();

    for (const item of targetEngines) {
      const eng = item.engine;
      const sId = item.sessionId;
      let sessionGroups: any[] = [];
      try {
        sessionGroups = await eng.getGroups();
      } catch (e: any) {
        this.logger.warn(`Error al obtener grupos de sesión ${sId}: ${e?.message}`);
        continue;
      }

      if (!Array.isArray(sessionGroups)) continue;

      let fastLoaded = false;
      // Fast-path A: WWJS client.getChats()
      try {
        const client = eng.client || eng.groups?.client?.();
        if (client && typeof client.getChats === 'function') {
          const chats = await client.getChats();
          if (Array.isArray(chats)) {
            const groupChats = chats.filter((c: any) => c.isGroup);
            for (const gc of groupChats) {
              const gid = gc.id?._serialized || gc.id;
              if (!gid || processedGroupIds.has(gid)) continue;
              processedGroupIds.add(gid);
              totalGroupsScanned++;

              const groupZone = this.resolveGroupZone(gid, gc.name || gc.subject);
              if (Array.isArray(gc.participants) && gc.participants.length > 0) {
                fastLoaded = true;
                for (const p of gc.participants) {
                  const wid = p.id?._serialized || (typeof p.id === 'string' ? p.id : undefined);
                  if (wid) {
                    rawParticipantMap.set(wid, { id: wid, name: p.name });
                    if (!participantZonesMap.has(wid)) participantZonesMap.set(wid, new Set());
                    participantZonesMap.get(wid)!.add(groupZone);
                  }
                }
              }
            }
          }
        }
      } catch (e: any) {
        this.logger.debug(`WWJS getChats fast-path skipped for ${sId}: ${e?.message}`);
      }

      // Fast-path B: Baileys sock.groupFetchAllParticipating()
      if (!fastLoaded) {
        try {
          const sock = eng.sock || eng.groups?.sock?.();
          if (sock && typeof sock.groupFetchAllParticipating === 'function') {
            const allMetadata = await sock.groupFetchAllParticipating();
            if (allMetadata && typeof allMetadata === 'object') {
              fastLoaded = true;
              for (const [gid, meta] of Object.entries(allMetadata as Record<string, any>)) {
                if (!gid || processedGroupIds.has(gid)) continue;
                processedGroupIds.add(gid);
                totalGroupsScanned++;

                const groupZone = this.resolveGroupZone(gid, meta?.subject || meta?.name);
                if (Array.isArray(meta?.participants)) {
                  for (const p of meta.participants) {
                    const wid = p.id;
                    if (wid) {
                      rawParticipantMap.set(wid, { id: wid, name: p.name });
                      if (!participantZonesMap.has(wid)) participantZonesMap.set(wid, new Set());
                      participantZonesMap.get(wid)!.add(groupZone);
                    }
                  }
                }
              }
            }
          }
        } catch (e: any) {
          this.logger.debug(`Baileys groupFetchAllParticipating fast-path skipped for ${sId}: ${e?.message}`);
        }
      }

      // Fallback: Query remaining groups via eng.getGroupInfo
      const groupsToQuery = sessionGroups.filter(g => {
        const gid = g?.id?._serialized || g?.id;
        return gid && !processedGroupIds.has(gid);
      });

      if (groupsToQuery.length > 0) {
        const batchSize = 6;
        for (let i = 0; i < groupsToQuery.length; i += batchSize) {
          const slice = groupsToQuery.slice(i, i + batchSize);
          await Promise.allSettled(
            slice.map(async g => {
              const gid = g?.id?._serialized || g?.id;
              if (!gid || processedGroupIds.has(gid)) return;
              processedGroupIds.add(gid);
              totalGroupsScanned++;

              try {
                const info = await eng.getGroupInfo(gid);
                const groupZone = this.resolveGroupZone(gid, info?.subject || info?.name || g.name);
                if (info && Array.isArray(info.participants)) {
                  for (const p of info.participants) {
                    if (p.id) {
                      rawParticipantMap.set(p.id, { id: p.id, name: p.name });
                      if (!participantZonesMap.has(p.id)) participantZonesMap.set(p.id, new Set());
                      participantZonesMap.get(p.id)!.add(groupZone);
                    }
                  }
                }
              } catch (err: any) {
                this.logger.warn(`Could not fetch group info for ${gid}: ${err?.message}`);
              }
            }),
          );
        }
      }
    }

    if (totalGroupsScanned === 0) {
      return {
        success: true,
        totalGroups: 0,
        existingContactsSkipped: 0,
        newContactsFound: 0,
        createdCategories: [],
        message: 'No se encontraron grupos activos en las sesiones seleccionadas de WhatsApp.',
      };
    }

    this.logger.log(`Scanning participants from ${totalGroupsScanned} unique groups across ${targetEngines.length} session(s) (purgeFirst: ${purgeFirst})...`);

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

    // 6. Clean, filter and deduplicate into Zone Buckets
    let existingContactsSkipped = 0;
    const newUniqueContactJids: string[] = [];
    const seenPhonesThisScan = new Set<string>();
    const zoneBuckets = new Map<string, string[]>();

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

      // Exclude bot's own phone across any session
      if (excludedPhones.has(phone)) continue;

      const jid = `${phone}@c.us`;

      // Skip if already in any previous category
      if (existingContactJids.has(jid) || existingPhones.has(phone)) {
        existingContactsSkipped++;
        continue;
      }

      // Skip internal duplicates within this scan
      if (seenPhonesThisScan.has(phone)) {
        continue;
      }

      seenPhonesThisScan.add(phone);
      newUniqueContactJids.push(jid);

      // Determine primary zone for contact with business priority:
      // Priority 1: Quilicura
      // Priority 2: Renca
      // Priority 3: Other specific commune
      // Priority 4: Otros (includes "NO PUBLICAR AQUI" and miscellaneous groups)
      const zones = participantZonesMap.get(rawId) || new Set(['Otros']);
      let primaryZone = 'Otros';
      if (zones.has('Quilicura')) {
        primaryZone = 'Quilicura';
      } else if (zones.has('Renca')) {
        primaryZone = 'Renca';
      } else {
        for (const z of zones) {
          if (z !== 'Otros') {
            primaryZone = z;
            break;
          }
        }
      }

      if (!zoneBuckets.has(primaryZone)) {
        zoneBuckets.set(primaryZone, []);
      }
      zoneBuckets.get(primaryZone)!.push(jid);
    }

    this.logger.log(
      `Extraction Summary: Total groups: ${totalGroupsScanned}, Raw: ${rawParticipantMap.size}, Skipped existing: ${existingContactsSkipped}, New unique: ${newUniqueContactJids.length}, Zones: ${Array.from(zoneBuckets.keys()).join(', ')}`,
    );

    if (newUniqueContactJids.length === 0) {
      return {
        success: true,
        totalGroups: totalGroupsScanned,
        existingContactsSkipped,
        newContactsFound: 0,
        createdCategories: [],
        message: 'Todos los contactos de tus grupos ya están clasificados en difusiones existentes de la base de datos.',
      };
    }

    // 7. Divide into clean batches of maxPerBatch (100) per Zone and create sequential categories
    // If the last category for a zone is incomplete (< maxPerBatch), fill it up first!
    const createdCategories: Array<{ id: string; name: string; count: number }> = [];
    const zoneColorMap: Record<string, string> = {
      'Quilicura': '#10b981',
      'Renca': '#0284c7',
      'Otros': '#f59e0b',
      'Maipú': '#8b5cf6',
      'Pudahuel': '#ec4899',
      'Lampa': '#06b6d4',
      'Santiago Centro': '#6366f1',
      'La Florida': '#14b8a6',
    };

    const colorPalette = ['#10b981', '#0284c7', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#6366f1', '#14b8a6', '#f97316'];

    // Prioritize zone order: Quilicura first, then Renca, then other communes, then Otros last
    const sortedZones = Array.from(zoneBuckets.keys()).sort((a, b) => {
      if (a === 'Quilicura') return -1;
      if (b === 'Quilicura') return 1;
      if (a === 'Renca') return -1;
      if (b === 'Renca') return 1;
      if (a === 'Otros') return 1;
      if (b === 'Otros') return -1;
      return a.localeCompare(b);
    });

    for (const zone of sortedZones) {
      let contactsForZone = zoneBuckets.get(zone) || [];
      if (contactsForZone.length === 0) continue;

      // Find highest index and last category for this specific zone
      let zoneMaxIndex = 0;
      let lastCategoryForZone: ContactCategory | null = null;
      const zoneRegex = new RegExp(`^difusi[oó]n\\s+${zone}\\s+(\\d+)$`, 'i');
      for (const cat of this.categories) {
        const match = cat.name.trim().match(zoneRegex);
        if (match) {
          const num = parseInt(match[1], 10);
          if (num > zoneMaxIndex) {
            zoneMaxIndex = num;
            lastCategoryForZone = cat;
          }
        }
      }

      // If the last category for this zone has room (< maxPerBatch), fill it first!
      if (lastCategoryForZone && Array.isArray(lastCategoryForZone.contactIds) && lastCategoryForZone.contactIds.length < maxPerBatch) {
        const room = maxPerBatch - lastCategoryForZone.contactIds.length;
        const toAdd = contactsForZone.slice(0, room);
        lastCategoryForZone.contactIds = Array.from(new Set([...lastCategoryForZone.contactIds, ...toAdd]));
        lastCategoryForZone.updatedAt = new Date().toISOString();
        contactsForZone = contactsForZone.slice(room);

        createdCategories.push({
          id: lastCategoryForZone.id,
          name: `${lastCategoryForZone.name} (Completada a ${lastCategoryForZone.contactIds.length})`,
          count: lastCategoryForZone.contactIds.length,
        });
        this.saveToFile();
        this.logger.log(`Completed existing category ${lastCategoryForZone.name} to ${lastCategoryForZone.contactIds.length} contacts`);
      }

      let currentNum = zoneMaxIndex + 1;
      const zoneColor = zoneColorMap[zone] || colorPalette[createdCategories.length % colorPalette.length];

      for (let i = 0; i < contactsForZone.length; i += maxPerBatch) {
        const batch = contactsForZone.slice(i, i + maxPerBatch);
        const name = `Difusión ${zone} ${currentNum}`;

        const saved = this.saveCategory(isAllSessions ? 'global' : sessionId, {
          name,
          color: zoneColor,
          contactIds: batch,
        });

        createdCategories.push({
          id: saved.id,
          name: saved.name,
          count: saved.contactIds.length,
        });
        currentNum++;
      }
    }

    return {
      success: true,
      totalGroups: totalGroupsScanned,
      existingContactsSkipped,
      newContactsFound: newUniqueContactJids.length,
      createdCategories,
      message: `Se crearon exitosamente ${createdCategories.length} difusiones segmentadas por zona (${Array.from(zoneBuckets.entries()).map(([z, list]) => `${z}: ${list.length}`).join(', ')}).`,
    };
  }
}
