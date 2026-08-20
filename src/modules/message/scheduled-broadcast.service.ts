import { Injectable, Logger, OnModuleInit, OnModuleDestroy, Inject, forwardRef } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { BulkMessageService } from './bulk-message.service';
import { SendBulkMessageDto } from './dto/bulk-message.dto';
import { EngineRegistry } from '../../engine/engine-registry.service';

export interface ScheduledBroadcast {
  id: string;
  sessionId: string;
  name?: string;
  scheduledTime: string; // e.g. "09:00", "21:00"
  frequency: 'once' | 'daily' | 'twice_daily'; // once, daily, twice_daily (every 12h)
  payload: SendBulkMessageDto;
  status?: 'active' | 'paused';
  startDate?: string;
  endDate?: string;
  postToStatus?: boolean; // Publish to WhatsApp Status (24h story)
  lastRunAt?: string;
  createdAt: string;
}

function getLocalChileTime(): { hour: number; minute: number; ymd: string; hhmm: string } {
  const tz = process.env.TIMEZONE || 'America/Santiago';
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
  formatter.formatToParts(new Date()).forEach(x => {
    if (x.type !== 'literal') p[x.type] = x.value;
  });

  const hour = parseInt(p.hour || '0', 10);
  const minute = parseInt(p.minute || '0', 10);
  const ymd = `${p.year}-${p.month}-${p.day}`;
  const hhmm = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;

  return { hour, minute, ymd, hhmm };
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

  private loadFromFile() {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf8');
        this.items = JSON.parse(raw);
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

  getBroadcasts(sessionId: string): ScheduledBroadcast[] {
    return this.items
      .filter(item => item.sessionId === sessionId)
      .sort((a, b) => (a.scheduledTime || '').localeCompare(b.scheduledTime || ''));
  }

  addBroadcast(sessionId: string, dto: {
    scheduledTime: string;
    frequency: 'once' | 'daily' | 'twice_daily';
    payload: SendBulkMessageDto;
    name?: string;
    status?: 'active' | 'paused';
    startDate?: string;
    endDate?: string;
    postToStatus?: boolean;
  }): ScheduledBroadcast {
    const newBroadcast: ScheduledBroadcast = {
      id: `sched_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      sessionId,
      name: dto.name || `Envío Masivo (${dto.scheduledTime})`,
      scheduledTime: dto.scheduledTime,
      frequency: dto.frequency,
      payload: dto.payload,
      status: dto.status || 'active',
      startDate: dto.startDate || undefined,
      endDate: dto.endDate || undefined,
      postToStatus: dto.postToStatus ?? false,
      createdAt: new Date().toISOString(),
    };

    this.items.push(newBroadcast);
    this.saveToFile();
    this.logger.log(`Created scheduled broadcast ${newBroadcast.id} at ${newBroadcast.scheduledTime} (${newBroadcast.frequency}) [Chile Time] (Status: ${newBroadcast.postToStatus ? 'Yes' : 'No'})`);
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
    if (dto.payload !== undefined) item.payload = dto.payload;
    if (dto.status !== undefined) item.status = dto.status;
    if (dto.startDate !== undefined) item.startDate = dto.startDate || undefined;
    if (dto.endDate !== undefined) item.endDate = dto.endDate || undefined;
    if (dto.postToStatus !== undefined) item.postToStatus = dto.postToStatus;
    this.saveToFile();
    this.logger.log(`Updated scheduled broadcast ${id} (${item.name}) - Status: ${item.status || 'active'} - PostToStatus: ${item.postToStatus ? 'Yes' : 'No'}`);
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
      const mediaUrl = firstMsg?.content?.[msgType]?.url || firstMsg?.mediaUrl;
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

      if (msgType === 'image' && mediaUrl) {
        this.logger.log(`📲 Posting image status for session ${item.sessionId}...`);
        await engine.postImageStatus({ mimetype: 'image/jpeg', data: mediaUrl }, statusOptions);
      } else if (msgType === 'video' && mediaUrl) {
        this.logger.log(`📲 Posting video status for session ${item.sessionId}...`);
        await engine.postVideoStatus({ mimetype: 'video/mp4', data: mediaUrl }, statusOptions);
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
    const { hour: nowH, minute: nowM, ymd: todayYMD, hhmm: currentHHMM } = getLocalChileTime();

    for (const item of [...this.items]) {
      // 1. Skip if paused
      if (item.status === 'paused') {
        continue;
      }

      // 2. Check date range (startDate / endDate)
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
              await this.bulkMessageService.createBatch(item.sessionId, item.payload);
              this.logger.log(`✅ Successfully launched batch for scheduled broadcast ${item.id}`);
            }
          } catch (err: any) {
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
