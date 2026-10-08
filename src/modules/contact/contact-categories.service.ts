import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

export interface ContactCategory {
  id: string;
  sessionId: string;
  name: string;
  color?: string;
  contactIds: string[];
  createdAt: string;
  updatedAt?: string;
}

@Injectable()
export class ContactCategoriesService {
  private readonly logger = new Logger(ContactCategoriesService.name);
  private readonly filePath = path.join(process.cwd(), 'data', 'contact-categories.json');
  private categories: ContactCategory[] = [];

  constructor() {
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
}
