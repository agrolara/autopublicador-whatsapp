import { Injectable, Logger, OnModuleInit, OnModuleDestroy, Inject, forwardRef } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { BulkMessageService } from './bulk-message.service';
import { SendBulkMessageDto } from './dto/bulk-message.dto';

export interface ScheduledBroadcast {
  id: string;
  sessionId: string;
  name?: string;
  scheduledTime: string; // e.g. "09:00", "21:00"
  frequency: 'once' | 'daily' | 'twice_daily'; // once, daily, twice_daily (every 12h)
  payload: SendBulkMessageDto;
  lastRunAt?: string;
  createdAt: string;
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
  ) {
    this.loadFromFile();
  }

  onModuleInit() {
    // Check every 30 seconds for scheduled broadcasts
    this.checkInterval = setInterval(() => this.processDueBroadcasts(), 30000);
    this.logger.log('ScheduledBroadcastService initialized, timer active (30s interval)');
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
    return this.items.filter(item => item.sessionId === sessionId);
  }

  addBroadcast(sessionId: string, dto: {
    scheduledTime: string;
    frequency: 'once' | 'daily' | 'twice_daily';
    payload: SendBulkMessageDto;
    name?: string;
  }): ScheduledBroadcast {
    const newBroadcast: ScheduledBroadcast = {
      id: `sched_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      sessionId,
      name: dto.name || `Envío Masivo (${dto.scheduledTime})`,
      scheduledTime: dto.scheduledTime,
      frequency: dto.frequency,
      payload: dto.payload,
      createdAt: new Date().toISOString(),
    };

    this.items.push(newBroadcast);
    this.saveToFile();
    this.logger.log(`Created scheduled broadcast ${newBroadcast.id} at ${newBroadcast.scheduledTime} (${newBroadcast.frequency})`);
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

  private async processDueBroadcasts() {
    const now = new Date();
    const currentHHMM = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const todayYMD = now.toISOString().split('T')[0];

    for (const item of this.items) {
      // Check if current time matches scheduledTime OR for twice_daily if current time matches scheduledTime + 12h
      let isDue = false;

      const [targetH, targetM] = item.scheduledTime.split(':').map(Number);
      const nowH = now.getHours();
      const nowM = now.getMinutes();

      if (nowM === targetM) {
        if (nowH === targetH) {
          isDue = true;
        } else if (item.frequency === 'twice_daily' && (nowH === (targetH + 12) % 24)) {
          isDue = true;
        }
      }

      if (isDue) {
        // Prevent running multiple times in the same minute
        const lastRunMinute = item.lastRunAt ? item.lastRunAt.substring(0, 16) : '';
        const currentMinuteStr = `${todayYMD}T${currentHHMM}`;

        if (lastRunMinute !== currentMinuteStr) {
          this.logger.log(`🚀 Executing due scheduled broadcast ${item.id} (${item.scheduledTime}) for session ${item.sessionId}...`);
          item.lastRunAt = new Date().toISOString();
          this.saveToFile();

          try {
            await this.bulkMessageService.createBatch(item.sessionId, item.payload);
            this.logger.log(`✅ Successfully launched batch for scheduled broadcast ${item.id}`);
          } catch (err: any) {
            this.logger.error(`❌ Failed to execute scheduled broadcast ${item.id}:`, err?.message);
          }

          if (item.frequency === 'once') {
            this.deleteBroadcast(item.sessionId, item.id);
          }
        }
      }
    }
  }
}
