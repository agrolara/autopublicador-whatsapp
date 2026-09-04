import { Injectable, Logger, OnModuleInit, OnModuleDestroy, Inject, forwardRef } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { BulkMessageService } from './bulk-message.service';
import { SendBulkMessageDto } from './dto/bulk-message.dto';
import { EngineRegistry } from '../../engine/engine-registry.service';

export interface BroadcastResultDetail {
  chatId: string;
  groupName?: string;
  status: 'sent' | 'failed';
  messageId?: string;
  error?: string;
}

export interface BroadcastExecutionSummary {
  timestamp: string;
  batchId?: string;
  total: number;
  sent: number;
  failed: number;
  status: 'completed' | 'failed' | 'processing';
  durationSeconds?: number;
  details?: BroadcastResultDetail[];
}

export interface ScheduledBroadcast {
  id: string;
  sessionId: string;
  name?: string;
  scheduledTime: string; // e.g. "09:00", "21:00"
  frequency: 'once' | 'daily' | 'twice_daily'; // once, daily, twice_daily (every 12h)
  payload: SendBulkMessageDto;
  daysOfWeek?: number[]; // [0,1,2,3,4,5,6] where 0=Sunday, 1=Monday... (empty/undefined = all days)
  mediaUrls?: string[]; // Array of up to 5 image/media URLs for multi-media campaigns
  status?: 'active' | 'paused';
  startDate?: string;
  endDate?: string;
  postToStatus?: boolean; // Publish to WhatsApp Status (24h story)
  lastRunAt?: string;
  lastBatchId?: string;
  lastSummary?: BroadcastExecutionSummary;
  history?: BroadcastExecutionSummary[];
  createdAt: string;
}

function getLocalChileTime(): { hour: number; minute: number; ymd: string; hhmm: string; dayOfWeek: number } {
  const tz = process.env.TIMEZONE || 'America/Santiago';
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });

  const p: Record<string, string> = {};
  formatter.formatToParts(now).forEach(x => {
    if (x.type !== 'literal') p[x.type] = x.value;
  });

  const hour = parseInt(p.hour || '0', 10);
  const minute = parseInt(p.minute || '0', 10);
  const ymd = `${p.year}-${p.month}-${p.day}`;
  const hhmm = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;

  const chileLocaleStr = now.toLocaleString('en-US', { timeZone: tz });
  const dayOfWeek = new Date(chileLocaleStr).getDay();

  return { hour, minute, ymd, hhmm, dayOfWeek };
}

@Injectable()
export class ScheduledBroadcastService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ScheduledBroadcastService.name);
  private readonly filePath = path.join(process.cwd(), 'data', 'scheduled-broadcasts.json');
  private items: ScheduledBroadcast[] = [];
  private checkInterval?: NodeJS.Timeout;

  constructor(
    @Inject(forwardRef(() => BulkMessageService))
    private readonly bulkMessageService: BulkMessageService,
    private readonly engines: EngineRegistry,
  ) {
    this.loadFromFile();
  }

  onModuleInit() {
    // Check every 30 seconds for scheduled broadcasts
    this.checkInterval = setInterval(() => this.processDueBroadcasts(), 30000);
    this.logger.log('ScheduledBroadcastService initialized with Chile Timezone (America/Santiago), timer active (30s interval)');
  }

  onModuleDestroy() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }
  }

  private normalizePayloadMedia(sessionId: string, payload: SendBulkMessageDto): SendBulkMessageDto {
    if (!payload?.messages || payload.messages.length === 0) return payload;

    const base64Cache = new Map<string, { url: string; mime: string }>();
    const uploadsDir = path.join(process.cwd(), 'data', 'uploads');

    for (const msg of payload.messages as any[]) {
      const msgType = msg?.type || (msg?.content?.image ? 'image' : msg?.content?.video ? 'video' : 'text');
      const mediaObj = msg?.content?.[msgType];
      const rawData = mediaObj?.base64 || mediaObj?.url || msg?.mediaUrl;

      if (typeof rawData === 'string' && rawData.startsWith('data:') && rawData.includes(';base64,')) {
        try {
          let cached = base64Cache.get(rawData);
          if (!cached) {
            const comma = rawData.indexOf(',');
            const header = rawData.substring(5, comma);
            const mime = header.split(';')[0] || (msgType === 'video' ? 'video/mp4' : 'image/jpeg');
            const ext = mime.split('/')[1]?.split('+')[0] || (msgType === 'video' ? 'mp4' : 'jpeg');
            const cleanB64 = rawData.substring(comma + 1).replace(/\s/g, '');
            const buffer = Buffer.from(cleanB64, 'base64');

            if (!fs.existsSync(uploadsDir)) {
              fs.mkdirSync(uploadsDir, { recursive: true });
            }
            const filename = `media_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
            const filePath = path.join(uploadsDir, filename);
            fs.writeFileSync(filePath, buffer);

            const mediaFileUrl = `/api/sessions/${sessionId}/messages/media-file/${filename}`;
            cached = { url: mediaFileUrl, mime };
            base64Cache.set(rawData, cached);
          }

          if (msg.content?.[msgType]) {
            msg.content[msgType] = { url: cached.url, mimetype: cached.mime };
          }
          if (msg.mediaUrl) {
            msg.mediaUrl = cached.url;
          }
        } catch (err: any) {
          this.logger.warn(`Could not persist inline media to disk: ${err?.message}`);
        }
      }
    }
    return payload;
  }

  private loadFromFile() {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf8');
        this.items = JSON.parse(raw);
        let changed = false;
        for (const item of this.items) {
          if (item.payload) {
            const before = JSON.stringify(item.payload).length;
            item.payload = this.normalizePayloadMedia(item.sessionId, item.payload);
            if (JSON.stringify(item.payload).length !== before) changed = true;
          }
        }
        if (changed) {
          this.saveToFile();
        }
      }
    } catch (e: any) {
      this.logger.error('Failed to load scheduled broadcasts:', e?.message);
      this.items = [];
    }
  }

  private saveToFile() {
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.filePath, JSON.stringify(this.items, null, 2), 'utf8');
    } catch (e: any) {
      this.logger.error('Failed to save scheduled broadcasts:', e?.message);
    }
  }

  private formatError(err: any): string | undefined {
    if (!err) return undefined;
    if (typeof err === 'string') return err;
    if (typeof err === 'object') {
      return err.message || err.code || JSON.stringify(err);
    }
    return String(err);
  }

  getBroadcasts(sessionId: string): ScheduledBroadcast[] {
    return this.items
      .filter(item => item.sessionId === sessionId)
      .sort((a, b) => (a.scheduledTime || '').localeCompare(b.scheduledTime || ''))
      .map(item => {
        if (!item.payload?.messages || item.payload.messages.length <= 1) {
          return item;
        }
        const lightweightMessages = item.payload.messages.map((m: any, idx: number) => {
          if (idx === 0) return m;
          return {
            chatId: m.chatId,
            type: m.type,
            content: { text: m.content?.text || m.content?.caption || '' },
          };
        });

        return {
          ...item,
          payload: {
            ...item.payload,
            messages: lightweightMessages as any,
          },
        };
      });
  }

  async getBroadcastReport(sessionId: string, id: string): Promise<any> {
    const broadcast = this.items.find(item => item.sessionId === sessionId && item.id === id);
    if (!broadcast) {
      return null;
    }

    if (broadcast.lastBatchId) {
      try {
        const batch = await this.bulkMessageService.getBatchStatus(sessionId, broadcast.lastBatchId);
        if (batch) {
          const isFinished = batch.status === 'completed' || batch.status === 'failed' || batch.status === 'cancelled';
          const durationSeconds = batch.completedAt && batch.startedAt
            ? Math.round((new Date(batch.completedAt).getTime() - new Date(batch.startedAt).getTime()) / 1000)
            : undefined;

          broadcast.lastSummary = {
            timestamp: batch.startedAt ? new Date(batch.startedAt).toISOString() : (broadcast.lastRunAt || new Date().toISOString()),
            batchId: batch.batchId,
            total: batch.progress.total,
            sent: batch.progress.sent,
            failed: batch.progress.failed,
            status: isFinished ? (batch.progress.failed > 0 && batch.progress.sent === 0 ? 'failed' : 'completed') : 'processing',
            durationSeconds,
            details: (batch.results || []).map(r => ({
              chatId: r.chatId,
              status: r.status as 'sent' | 'failed',
              messageId: r.messageId,
              error: this.formatError(r.error),
            })),
          };
          this.saveToFile();
        }
      } catch {
        // ignore
      }
    }

    return {
      broadcast: {
        id: broadcast.id,
        name: broadcast.name,
        scheduledTime: broadcast.scheduledTime,
        frequency: broadcast.frequency,
        status: broadcast.status,
        lastRunAt: broadcast.lastRunAt,
        totalRecipients: broadcast.payload?.messages?.length || 0,
        payload: broadcast.payload,
      },
      summary: broadcast.lastSummary || null,
      history: broadcast.history || [],
    };
  }

  addBroadcast(sessionId: string, dto: {
    scheduledTime: string;
    frequency: 'once' | 'daily' | 'twice_daily';
    payload: SendBulkMessageDto;
    name?: string;
    daysOfWeek?: number[];
    mediaUrls?: string[];
    status?: 'active' | 'paused';
    startDate?: string;
    endDate?: string;
    postToStatus?: boolean;
  }): ScheduledBroadcast {
    const normalizedPayload = this.normalizePayloadMedia(sessionId, dto.payload);
    const newBroadcast: ScheduledBroadcast = {
      id: `sched_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      sessionId,
      name: dto.name || `Envío Masivo (${dto.scheduledTime})`,
      scheduledTime: dto.scheduledTime,
      frequency: dto.frequency,
      payload: normalizedPayload,
      daysOfWeek: Array.isArray(dto.daysOfWeek) ? dto.daysOfWeek : undefined,
      mediaUrls: Array.isArray(dto.mediaUrls) ? dto.mediaUrls : undefined,
      status: dto.status || 'active',
      startDate: dto.startDate || undefined,
      endDate: dto.endDate || undefined,
      postToStatus: dto.postToStatus ?? false,
      createdAt: new Date().toISOString(),
    };

    this.items.push(newBroadcast);
    this.saveToFile();
    this.logger.log(`Created scheduled broadcast ${newBroadcast.id} at ${newBroadcast.scheduledTime} (${newBroadcast.frequency}) [Chile Time] (Status: ${newBroadcast.postToStatus ? 'Yes' : 'No'}, Days: ${newBroadcast.daysOfWeek ? newBroadcast.daysOfWeek.join(',') : 'All'})`);
    return newBroadcast;
  }

  deleteBroadcast(sessionId: string, id: string): boolean {
    const idx = this.items.findIndex(item => item.sessionId === sessionId && item.id === id);
    if (idx !== -1) {
      this.items.splice(idx, 1);
      this.saveToFile();
      this.logger.log(`Deleted scheduled broadcast ${id}`);
      return true;
    }
    return false;
  }

  updateBroadcast(sessionId: string, id: string, dto: {
    scheduledTime?: string;
    frequency?: 'once' | 'daily' | 'twice_daily';
    payload?: SendBulkMessageDto;
    name?: string;
    daysOfWeek?: number[];
    mediaUrls?: string[];
    status?: 'active' | 'paused';
    startDate?: string;
    endDate?: string;
    postToStatus?: boolean;
  }): ScheduledBroadcast | null {
    const item = this.items.find(i => i.sessionId === sessionId && i.id === id);
    if (!item) return null;
    if (dto.name !== undefined) item.name = dto.name;
    if (dto.scheduledTime !== undefined) item.scheduledTime = dto.scheduledTime;
    if (dto.frequency !== undefined) item.frequency = dto.frequency;
    if (dto.daysOfWeek !== undefined) item.daysOfWeek = Array.isArray(dto.daysOfWeek) ? dto.daysOfWeek : undefined;
    if (dto.mediaUrls !== undefined) item.mediaUrls = Array.isArray(dto.mediaUrls) ? dto.mediaUrls : undefined;
    if (dto.payload !== undefined) {
      item.payload = this.normalizePayloadMedia(sessionId, dto.payload);
    }
    if (dto.status !== undefined) item.status = dto.status;
    if (dto.startDate !== undefined) item.startDate = dto.startDate || undefined;
    if (dto.endDate !== undefined) item.endDate = dto.endDate || undefined;
    if (dto.postToStatus !== undefined) item.postToStatus = dto.postToStatus;
    this.saveToFile();
    this.logger.log(`Updated scheduled broadcast ${id} (${item.name}) - Status: ${item.status || 'active'} - Days: ${item.daysOfWeek ? item.daysOfWeek.join(',') : 'All'} - PostToStatus: ${item.postToStatus ? 'Yes' : 'No'}`);
    return item;
  }

  toggleBroadcastStatus(sessionId: string, id: string): ScheduledBroadcast | null {
    const item = this.items.find(i => i.sessionId === sessionId && i.id === id);
    if (!item) return null;
    item.status = item.status === 'paused' ? 'active' : 'paused';
    this.saveToFile();
    this.logger.log(`Toggled broadcast ${id} status to: ${item.status}`);
    return item;
  }

  private async publishStatusForBroadcast(item: ScheduledBroadcast) {
    try {
      const engine = this.engines.get(item.sessionId);
      if (!engine) {
        this.logger.warn(`Cannot publish status for broadcast ${item.id}: engine for session ${item.sessionId} not found`);
        return;
      }

      const firstMsg = item.payload?.messages?.[0] as any;
      if (!firstMsg) return;

      const msgType = firstMsg?.type || (firstMsg?.content?.image ? 'image' : firstMsg?.content?.video ? 'video' : 'text');
      const mediaData = firstMsg?.content?.[msgType]?.data || firstMsg?.content?.[msgType]?.base64 || firstMsg?.content?.[msgType]?.url || firstMsg?.mediaUrl;
      const caption = firstMsg?.content?.caption || firstMsg?.content?.text || firstMsg?.text || (typeof firstMsg?.message === 'string' ? firstMsg.message : '') || '';

      // Get contacts for recipients list (needed for Baileys allow-list)
      let recipients: string[] | undefined;
      try {
        const contacts = await engine.getContacts?.();
        if (Array.isArray(contacts)) {
          const validContacts = contacts.map(c => c.id).filter(id => id && !id.endsWith('@g.us'));
          if (validContacts.length > 0) {
            recipients = validContacts;
          }
        }
      } catch (e: any) {
        this.logger.debug(`Could not fetch contacts for status: ${e?.message}`);
      }

      const statusOptions: any = { caption: caption.trim(), recipients };

      if (msgType === 'image' && mediaData) {
        this.logger.log(`📲 Posting image status for session ${item.sessionId}...`);
        await engine.postImageStatus({ mimetype: 'image/jpeg', data: mediaData }, statusOptions);
      } else if (msgType === 'video' && mediaData) {
        this.logger.log(`📲 Posting video status for session ${item.sessionId}...`);
        await engine.postVideoStatus({ mimetype: 'video/mp4', data: mediaData }, statusOptions);
      } else if (caption.trim()) {
        this.logger.log(`📲 Posting text status for session ${item.sessionId}...`);
        await engine.postTextStatus(caption.trim(), statusOptions);
      }
      this.logger.log(`✅ Successfully published status for broadcast ${item.id} (${item.name})`);
    } catch (err: any) {
      this.logger.error(`❌ Failed to publish status for broadcast ${item.id}:`, err?.message);
    }
  }

  private async processDueBroadcasts() {
    const { hour: nowH, minute: nowM, ymd: todayYMD, hhmm: currentHHMM, dayOfWeek: todayDayOfWeek } = getLocalChileTime();

    for (const item of [...this.items]) {
      // 1. Skip if paused
      if (item.status === 'paused') {
        continue;
      }

      // 2. Check days of week (if configured and non-empty)
      if (Array.isArray(item.daysOfWeek) && item.daysOfWeek.length > 0 && !item.daysOfWeek.includes(todayDayOfWeek)) {
        continue;
      }

      // 3. Check date range (startDate / endDate)
      if (item.startDate && todayYMD < item.startDate) {
        continue;
      }
      if (item.endDate && todayYMD > item.endDate) {
        continue;
      }

      let isDue = false;
      const targetHHMM = item.scheduledTime.padStart(5, '0');

      if (item.frequency === 'once') {
        if (!item.lastRunAt && currentHHMM >= targetHHMM) {
          isDue = true;
        }
      } else {
        const [targetH, targetM] = item.scheduledTime.split(':').map(Number);
        if (nowM === targetM) {
          if (nowH === targetH) {
            isDue = true;
          } else if (item.frequency === 'twice_daily' && (nowH === (targetH + 12) % 24)) {
            isDue = true;
          }
        }
      }

      if (isDue) {
        // Prevent running multiple times in the same minute
        const lastRunMinute = item.lastRunAt ? item.lastRunAt.substring(0, 16) : '';
        const currentMinuteStr = `${todayYMD}T${currentHHMM}`;

        if (lastRunMinute !== currentMinuteStr) {
          this.logger.log(`🚀 Executing due scheduled broadcast ${item.id} (${item.scheduledTime} Chile Time) for session ${item.sessionId}...`);
          item.lastRunAt = `${todayYMD}T${currentHHMM}:00Z`;
          this.saveToFile();

          // 1. Send group broadcast messages (if any recipients)
          try {
            if (item.payload?.messages?.length > 0) {
              const batch = await this.bulkMessageService.createBatch(item.sessionId, item.payload);
              item.lastBatchId = batch.batchId;
              item.lastSummary = {
                timestamp: new Date().toISOString(),
                batchId: batch.batchId,
                total: item.payload.messages.length,
                sent: 0,
                failed: 0,
                status: 'processing',
                details: [],
              };
              this.saveToFile();
              this.logger.log(`✅ Successfully launched batch ${batch.batchId} for scheduled broadcast ${item.id}`);
            }
          } catch (err: any) {
            item.lastSummary = {
              timestamp: new Date().toISOString(),
              total: item.payload?.messages?.length || 0,
              sent: 0,
              failed: item.payload?.messages?.length || 0,
              status: 'failed',
              details: (item.payload?.messages || []).map(m => ({
                chatId: m.chatId,
                status: 'failed',
                error: err?.message || 'Error al iniciar lote de envío',
              })),
            };
            this.saveToFile();
            this.logger.error(`❌ Failed to execute scheduled broadcast ${item.id}:`, err?.message);
          }

          // 2. Publish to WhatsApp Status (Stories) if enabled
          if (item.postToStatus) {
            await this.publishStatusForBroadcast(item);
          }

          if (item.frequency === 'once') {
            this.deleteBroadcast(item.sessionId, item.id);
          }
        }
      }
    }
  }
}
