import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

export interface GroupTag {
  id: string;
  sessionId: string;
  name: string;
  color?: string;
  groupIds: string[];
  createdAt: string;
}

@Injectable()
export class GroupTagsService {
  private readonly logger = new Logger(GroupTagsService.name);
  private readonly filePath = path.join(process.cwd(), 'data', 'group-tags.json');
  private tags: GroupTag[] = [];

  constructor() {
    this.loadFromFile();
  }

  private loadFromFile() {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf8');
        this.tags = JSON.parse(raw);
      }
    } catch (e: any) {
      this.logger.error('Failed to load group tags:', e?.message);
      this.tags = [];
    }
  }

  private saveToFile() {
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.filePath, JSON.stringify(this.tags, null, 2), 'utf8');
    } catch (e: any) {
      this.logger.error('Failed to save group tags:', e?.message);
    }
  }

  getTags(sessionId: string): GroupTag[] {
    return this.tags.filter(t => t.sessionId === sessionId);
  }

  saveTag(sessionId: string, dto: { name: string; color?: string; groupIds: string[]; id?: string }): GroupTag {
    let existing = dto.id ? this.tags.find(t => t.id === dto.id && t.sessionId === sessionId) : null;

    if (!existing) {
      existing = this.tags.find(t => t.name.toLowerCase() === dto.name.toLowerCase() && t.sessionId === sessionId);
    }

    if (existing) {
      existing.name = dto.name;
      if (dto.color) existing.color = dto.color;
      existing.groupIds = Array.from(new Set([...dto.groupIds]));
      this.saveToFile();
      return existing;
    }

    const newTag: GroupTag = {
      id: `tag_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      sessionId,
      name: dto.name,
      color: dto.color || '#10b981',
      groupIds: Array.from(new Set([...dto.groupIds])),
      createdAt: new Date().toISOString(),
    };

    this.tags.push(newTag);
    this.saveToFile();
    this.logger.log(`Created group tag "${newTag.name}" with ${newTag.groupIds.length} groups for session ${sessionId}`);
    return newTag;
  }

  deleteTag(sessionId: string, id: string): boolean {
    const idx = this.tags.findIndex(t => t.sessionId === sessionId && t.id === id);
    if (idx !== -1) {
      const deleted = this.tags.splice(idx, 1)[0];
      this.saveToFile();
      this.logger.log(`Deleted group tag ${id} (${deleted.name})`);
      return true;
    }
    return false;
  }
}
