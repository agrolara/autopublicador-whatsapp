import { Injectable, Logger, OnModuleInit, Optional, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import { EngineRegistry } from '../../engine/engine-registry.service';
import { RadarSetting, GroupFilterMode } from './entities/radar-setting.entity';
import { RadarClient, DEFAULT_RADAR_ALERT_TEMPLATE } from './entities/radar-client.entity';
import { CreateRadarClientDto, UpdateRadarClientDto, UpdateRadarSettingsDto, TestEvaluateDto } from './dto/radar.dto';

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

  private readonly clientsBackupPath = path.join(process.cwd(), 'data', 'radar_clients.json');
  private readonly settingsBackupPath = path.join(process.cwd(), 'data', 'radar_settings.json');

  constructor(
    @InjectRepository(RadarSetting, 'data')
    private readonly settingsRepo: Repository<RadarSetting>,
    @InjectRepository(RadarClient, 'data')
    private readonly clientsRepo: Repository<RadarClient>,
    @Optional()
    private readonly engineRegistry?: EngineRegistry,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.ensureTables();
    await this.restoreFromBackup();
    await this.reloadCache();
    await this.syncBackup();
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
          whitelistedGroupIds TEXT NOT NULL DEFAULT '[]',
          activeScanningSessions TEXT NOT NULL DEFAULT '[]',
          dedupWindowSeconds INT NOT NULL DEFAULT 30,
          aiSemanticEnabled BOOLEAN NOT NULL DEFAULT 1,
          aiProvider VARCHAR(32) NOT NULL DEFAULT 'typesafe',
          typesafeApiKey TEXT NOT NULL DEFAULT '',
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
          createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
          updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `).catch(() => {});

      // Backward compatibility migrations for existing SQLite databases
      await this.settingsRepo.query(`ALTER TABLE radar_settings ADD COLUMN aiSemanticEnabled BOOLEAN NOT NULL DEFAULT 1`).catch(() => {});
      await this.settingsRepo.query(`ALTER TABLE radar_settings ADD COLUMN aiProvider VARCHAR(32) NOT NULL DEFAULT 'typesafe'`).catch(() => {});
      await this.settingsRepo.query(`ALTER TABLE radar_settings ADD COLUMN typesafeApiKey TEXT NOT NULL DEFAULT ''`).catch(() => {});
      await this.clientsRepo.query(`ALTER TABLE radar_clients ADD COLUMN useAiFilter BOOLEAN NOT NULL DEFAULT 1`).catch(() => {});

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

      // 0 ms Gate 7: Group Filter Check
      const groupName = await this.resolveGroupName(sessionId, groupId);
      if (!this.checkGroupAllowed(settings, groupId, groupName)) {
        return;
      }

      // Gate 8: Keyword matching against active clients
      if (!this.cachedActiveClients || this.cachedActiveClients.length === 0) {
        return;
      }

      const buyerPhoneDigits = normalizePhoneDigits(author);

      for (const client of this.cachedActiveClients) {
        const { matched, matchedKeyword } = matchesKeywords(text, client.localKeywords);
        if (!matched) continue;

        // 0 ms Gate 9: Semantic AI Validation (Anti-vendedores / Intención de compra)
        const isAiEnabled =
          (settings.aiSemanticEnabled ?? true) &&
          (client.useAiFilter ?? true) &&
          Boolean(client.jevPromptCriteria?.trim());

        if (isAiEnabled) {
          const effectiveKey = (settings.typesafeApiKey || '').trim() || DEFAULT_TYPESAFE_API_KEY;
          const aiCheck = await evaluateSemanticCriteriaWithTypeSafe(
            text,
            client.jevPromptCriteria!.trim(),
            effectiveKey,
          );

          if (!aiCheck.isMatch) {
            this.logger.log(
              `[Radar Lead] DISCARDED by TypeSafe AI (score: ${aiCheck.score.toFixed(2)}) for client "${client.name}". Motivo: Vendedor o sin intención de compra. Texto: "${text.slice(0, 60)}"`,
            );
            continue; // Filtered out: seller or non-buyer!
          }

          this.logger.log(
            `[Radar Lead] APPROVED by TypeSafe AI (score: ${aiCheck.score.toFixed(2)}) for client "${client.name}"`,
          );
        }

        this.logger.log(`Radar lead matched for client "${client.name}" (rubro: ${client.rubroKey}, keyword: "${matchedKeyword}")`);

        // Format alert template
        const alertMessage = this.formatAlertMessage(client, {
          groupName: groupName || groupId,
          buyerPhone: buyerPhoneDigits,
          buyerMessage: text,
        });

        // Dispatch alert via WhatsApp
        await this.dispatchAlert(client, alertMessage, sessionId);
      }
    } catch (err) {
      this.logger.warn('Error evaluating inbound radar lead (fail-open)', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /**
   * Checks if group satisfies current filter settings.
   */
  private checkGroupAllowed(settings: RadarSetting, groupId: string, groupName: string): boolean {
    const mode = settings.groupFilterMode || 'ALL';

    if (mode === 'ALL') {
      return true;
    }

    if (mode === 'WHITELIST') {
      const whitelist: string[] = this.parseJsonArray(settings.whitelistedGroupIds);
      return whitelist.includes(groupId);
    }

    if (mode === 'CATEGORY') {
      const categoryKeywords = settings.groupCategoryKeywords || '';
      if (!categoryKeywords.trim()) return true;
      const { matched } = matchesKeywords(groupName, categoryKeywords);
      return matched;
    }

    return true;
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
    if (dto.whitelistedGroupIds !== undefined) {
      settings.whitelistedGroupIds = JSON.stringify(dto.whitelistedGroupIds);
    }
    if (dto.activeScanningSessions !== undefined) {
      settings.activeScanningSessions = JSON.stringify(dto.activeScanningSessions);
    }
    if (dto.dedupWindowSeconds !== undefined) settings.dedupWindowSeconds = dto.dedupWindowSeconds;
    if (dto.aiSemanticEnabled !== undefined) settings.aiSemanticEnabled = dto.aiSemanticEnabled;
    if (dto.aiProvider !== undefined) settings.aiProvider = dto.aiProvider;
    if (dto.typesafeApiKey !== undefined) settings.typesafeApiKey = dto.typesafeApiKey;

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

        const isAiEnabled =
          (settings.aiSemanticEnabled ?? true) &&
          (client.useAiFilter ?? true) &&
          Boolean(client.jevPromptCriteria?.trim());

        if (isAiEnabled) {
          const effectiveKey = (settings.typesafeApiKey || '').trim() || DEFAULT_TYPESAFE_API_KEY;
          const aiCheck = await evaluateSemanticCriteriaWithTypeSafe(
            text,
            client.jevPromptCriteria!.trim(),
            effectiveKey,
          );
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
      }
    }

    return {
      matched: results.length > 0,
      results,
    };
  }

  private parseJsonArray(str: string | null | undefined): string[] {
    if (!str) return [];
    try {
      const parsed = JSON.parse(str);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
}
