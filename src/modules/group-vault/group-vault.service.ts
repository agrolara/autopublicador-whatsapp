import { Injectable, Logger, OnModuleInit, NotFoundException, BadRequestException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { EngineRegistry } from '../../engine/engine-registry.service';

export interface VaultGroupItem {
  id: string; // Group JID e.g. "120363000@g.us" or code
  name: string;
  inviteCode?: string;
  inviteUrl?: string;
  memberCount?: number;
  description?: string;
  sourceSessionId?: string;
  lastSyncedAt: string;
  tags?: string[];
  status?: 'active' | 'revoked' | 'unknown';
}

export interface AutoJoinLog {
  timestamp: string;
  groupName: string;
  status: 'joined' | 'already_member' | 'failed';
  message: string;
}

export interface AutoJoinJob {
  id: string;
  targetSessionId: string;
  total: number;
  completed: number;
  joined: number;
  alreadyMember: number;
  failed: number;
  status: 'running' | 'completed' | 'cancelled' | 'failed';
  currentGroupName?: string;
  logs: AutoJoinLog[];
  intervalSeconds: number;
  startedAt: string;
  finishedAt?: string;
}

@Injectable()
export class GroupVaultService implements OnModuleInit {
  private readonly logger = new Logger(GroupVaultService.name);
  private readonly filePath = path.join(process.cwd(), 'data', 'group-catalog.json');
  private items: VaultGroupItem[] = [];
  private activeJobs = new Map<string, AutoJoinJob>();
  private jobTimeouts = new Map<string, NodeJS.Timeout>();

  constructor(private readonly engines: EngineRegistry) {}

  onModuleInit() {
    this.loadFromFile();
    // Auto-seed with any backup links if catalog is empty
    this.seedFromExistingLinks();
  }

  private loadFromFile() {
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf8');
        this.items = JSON.parse(raw);
        this.logger.log(`Loaded ${this.items.length} groups in Group Vault catalog`);
      }
    } catch (e: any) {
      this.logger.error('Failed to load group catalog:', e?.message);
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
      this.logger.error('Failed to save group catalog:', e?.message);
    }
  }

  private seedFromExistingLinks() {
    if (this.items.length > 0) return;
    try {
      const txtPath = path.join(process.cwd(), 'enlaces_grupos_whatsapp.txt');
      if (fs.existsSync(txtPath)) {
        const content = fs.readFileSync(txtPath, 'utf8');
        const lines = content.split('\n');
        for (const line of lines) {
          const match = line.match(/(.+?)\s*->\s*(https:\/\/chat\.whatsapp\.com\/([A-Za-z0-9_-]+))/);
          if (match) {
            const name = match[1].trim();
            const inviteUrl = match[2].trim();
            const inviteCode = match[3].trim();
            this.items.push({
              id: `imported_${inviteCode}`,
              name,
              inviteCode,
              inviteUrl,
              lastSyncedAt: new Date().toISOString(),
              status: 'active',
            });
          }
        }
        if (this.items.length > 0) {
          this.saveToFile();
          this.logger.log(`Auto-seeded ${this.items.length} groups from enlaces_grupos_whatsapp.txt`);
        }
      }
    } catch (e: any) {
      this.logger.warn('Seed from links file skipped:', e?.message);
    }
  }

  listGroups(): VaultGroupItem[] {
    return [...this.items].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }

  getGroup(id: string): VaultGroupItem | undefined {
    return this.items.find(g => g.id === id || g.inviteCode === id);
  }

  deleteGroup(id: string): boolean {
    const idx = this.items.findIndex(g => g.id === id || g.inviteCode === id);
    if (idx !== -1) {
      this.items.splice(idx, 1);
      this.saveToFile();
      return true;
    }
    return false;
  }

  /**
   * Sync all groups and invite links from a live connected session
   */
  async syncFromSession(sessionId: string): Promise<{ total: number; withLinks: number; newAdded: number }> {
    const engine = this.engines.get(sessionId);
    if (!engine) {
      throw new NotFoundException(`Session ${sessionId} is not connected or active`);
    }

    this.logger.log(`🔄 Syncing Group Vault from session ${sessionId}...`);
    const chats = await engine.getChats();
    const groupChats = chats.filter(c => c.isGroup || c.id.endsWith('@g.us'));

    let withLinks = 0;
    let newAdded = 0;

    for (const group of groupChats) {
      const groupId = group.id;
      const groupName = group.name || groupId;

      let inviteCode: string | undefined;
      let inviteUrl: string | undefined;

      try {
        if (typeof (engine as any).getGroupInviteCode === 'function') {
          inviteCode = await (engine as any).getGroupInviteCode(groupId);
          if (inviteCode) {
            inviteUrl = `https://chat.whatsapp.com/${inviteCode}`;
            withLinks++;
          }
        }
      } catch (err: any) {
        this.logger.debug(`Could not get invite code for group ${groupId} (${groupName}): ${err?.message}`);
      }

      const existingIdx = this.items.findIndex(item => item.id === groupId || (inviteCode && item.inviteCode === inviteCode));

      if (existingIdx >= 0) {
        this.items[existingIdx] = {
          ...this.items[existingIdx],
          name: groupName,
          ...(inviteCode ? { inviteCode, inviteUrl, status: 'active' } : {}),
          sourceSessionId: sessionId,
          lastSyncedAt: new Date().toISOString(),
        };
      } else {
        this.items.push({
          id: groupId,
          name: groupName,
          inviteCode,
          inviteUrl,
          sourceSessionId: sessionId,
          lastSyncedAt: new Date().toISOString(),
          status: inviteCode ? 'active' : 'unknown',
        });
        newAdded++;
      }
    }

    this.saveToFile();
    this.logger.log(`✅ Synced Group Vault: ${groupChats.length} groups scanned, ${withLinks} links found, ${newAdded} new entries.`);
    return { total: groupChats.length, withLinks, newAdded };
  }

  /**
   * Import multiple plain-text invite links (e.g. from WhatsApp messages or files)
   */
  async importInviteLinks(links: string[]): Promise<{ imported: number; updated: number }> {
    let imported = 0;
    let updated = 0;

    for (const raw of links) {
      const trimmed = raw.trim();
      if (!trimmed) continue;

      let name = '';
      let url = trimmed;

      if (trimmed.includes('->')) {
        const parts = trimmed.split('->');
        name = parts[0].trim();
        url = parts[1].trim();
      }

      const codeMatch = url.match(/chat\.whatsapp\.com\/([A-Za-z0-9_-]+)/i);
      const inviteCode = codeMatch ? codeMatch[1] : (url.length >= 15 && !url.includes('/') ? url : null);

      if (!inviteCode) continue;
      const inviteUrl = `https://chat.whatsapp.com/${inviteCode}`;
      if (!name) name = `Grupo (${inviteCode.substring(0, 8)})`;

      const existing = this.items.find(g => g.inviteCode === inviteCode);
      if (existing) {
        existing.name = name.startsWith('Grupo (') ? existing.name : name;
        existing.inviteUrl = inviteUrl;
        existing.lastSyncedAt = new Date().toISOString();
        existing.status = 'active';
        updated++;
      } else {
        this.items.push({
          id: `imported_${inviteCode}`,
          name,
          inviteCode,
          inviteUrl,
          lastSyncedAt: new Date().toISOString(),
          status: 'active',
        });
        imported++;
      }
    }

    this.saveToFile();
    return { imported, updated };
  }

  /**
   * Start progressive, rate-limited auto-join for a target session
   */
  startAutoJoin(targetSessionId: string, options: { groupIds?: string[]; intervalSeconds?: number } = {}): AutoJoinJob {
    const engine = this.engines.get(targetSessionId);
    if (!engine) {
      throw new NotFoundException(`Target session ${targetSessionId} is not connected`);
    }

    // Filter candidate groups with valid inviteCode
    const candidates = this.items.filter(g => {
      if (!g.inviteCode) return false;
      if (options.groupIds && options.groupIds.length > 0) {
        return options.groupIds.includes(g.id) || options.groupIds.includes(g.inviteCode);
      }
      return true;
    });

    if (candidates.length === 0) {
      throw new BadRequestException('No groups with valid invite links selected for auto-join');
    }

    const intervalSeconds = Math.max(options.intervalSeconds || 30, 10);
    const jobId = `job_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    const job: AutoJoinJob = {
      id: jobId,
      targetSessionId,
      total: candidates.length,
      completed: 0,
      joined: 0,
      alreadyMember: 0,
      failed: 0,
      status: 'running',
      logs: [],
      intervalSeconds,
      startedAt: new Date().toISOString(),
    };

    this.activeJobs.set(jobId, job);
    this.logger.log(`🚀 Started Auto-Join Job ${jobId} for session ${targetSessionId}: ${candidates.length} groups at ${intervalSeconds}s interval.`);

    // Run in background with safe stepping
    this.runJobStep(jobId, candidates, 0);

    return job;
  }

  private async runJobStep(jobId: string, candidates: VaultGroupItem[], index: number) {
    const job = this.activeJobs.get(jobId);
    if (!job || job.status !== 'running') return;

    if (index >= candidates.length) {
      job.status = 'completed';
      job.finishedAt = new Date().toISOString();
      job.currentGroupName = undefined;
      this.logger.log(`🏁 Auto-Join Job ${jobId} completed. Summary: Joined: ${job.joined}, Already Member: ${job.alreadyMember}, Failed: ${job.failed}`);
      return;
    }

    const targetGroup = candidates[index];
    job.currentGroupName = targetGroup.name;

    const engine = this.engines.get(job.targetSessionId);
    if (!engine) {
      job.status = 'failed';
      job.finishedAt = new Date().toISOString();
      this.logger.error(`Auto-Join Job ${jobId} failed: session disconnected`);
      return;
    }

    try {
      this.logger.log(`[Job ${jobId}] (${index + 1}/${candidates.length}) Attempting to join: ${targetGroup.name} (Code: ${targetGroup.inviteCode})...`);
      const joinedId = await (engine as any).joinGroupViaInviteCode(targetGroup.inviteCode);
      job.joined++;
      job.logs.unshift({
        timestamp: new Date().toLocaleTimeString(),
        groupName: targetGroup.name,
        status: 'joined',
        message: `✅ Unido con éxito (ID: ${joinedId || 'OK'})`,
      });
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      if (errMsg.toLowerCase().includes('already') || errMsg.toLowerCase().includes('participating') || errMsg.toLowerCase().includes('joined')) {
        job.alreadyMember++;
        job.logs.unshift({
          timestamp: new Date().toLocaleTimeString(),
          groupName: targetGroup.name,
          status: 'already_member',
          message: 'ℹ️ Ya es miembro de este grupo.',
        });
      } else {
        job.failed++;
        job.logs.unshift({
          timestamp: new Date().toLocaleTimeString(),
          groupName: targetGroup.name,
          status: 'failed',
          message: `❌ Error: ${errMsg}`,
        });
      }
    }

    job.completed++;

    // Schedule next group after interval
    const timeout = setTimeout(() => {
      this.runJobStep(jobId, candidates, index + 1);
    }, job.intervalSeconds * 1000);

    this.jobTimeouts.set(jobId, timeout);
  }

  getJobStatus(jobId: string): AutoJoinJob | undefined {
    return this.activeJobs.get(jobId);
  }

  cancelJob(jobId: string): boolean {
    const job = this.activeJobs.get(jobId);
    if (job && job.status === 'running') {
      job.status = 'cancelled';
      job.finishedAt = new Date().toISOString();
      const timeout = this.jobTimeouts.get(jobId);
      if (timeout) clearTimeout(timeout);
      return true;
    }
    return false;
  }
}
