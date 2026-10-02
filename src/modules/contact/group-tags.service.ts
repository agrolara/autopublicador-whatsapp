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

  getTags(sessionId?: string): GroupTag[] {
    // Return all group categories globally so they are never hidden or lost when sessionId changes
    return this.tags;
  }

  saveTag(
    sessionId: string,
    dto: {
      name: string;
      color?: string;
      groupIds: string[];
      id?: string;
      groupMetadata?: Record<string, string>;
    },
  ): GroupTag {
    let existing = dto.id ? this.tags.find(t => t.id === dto.id) : null;

    if (!existing) {
      existing = this.tags.find(t => t.name.toLowerCase() === dto.name.toLowerCase());
    }

    let savedTag: GroupTag;

    if (existing) {
      existing.name = dto.name;
      if (dto.color) existing.color = dto.color;
      existing.groupIds = Array.from(new Set([...dto.groupIds]));
      this.saveToFile();
      savedTag = existing;
    } else {
      const newTag: GroupTag = {
        id: `tag_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        sessionId: 'global',
        name: dto.name,
        color: dto.color || '#10b981',
        groupIds: Array.from(new Set([...dto.groupIds])),
        createdAt: new Date().toISOString(),
      };

      this.tags.push(newTag);
      this.saveToFile();
      this.logger.log(`Created global group tag "${newTag.name}" with ${newTag.groupIds.length} groups`);
      savedTag = newTag;
    }

    // Sincronización automática si la categoría es "alcaldia" o "alcaldía"
    const isAlcaldia = /^(alcaldia|alcald[ií]a)$/i.test(dto.name.trim());
    if (isAlcaldia) {
      void this.notifyAlcaldiaSync(savedTag.groupIds, dto.groupMetadata);
    }

    return savedTag;
  }

  deleteTag(sessionId: string, id: string): boolean {
    const idx = this.tags.findIndex(t => t.id === id);
    if (idx !== -1) {
      const deleted = this.tags.splice(idx, 1)[0];
      this.saveToFile();
      this.logger.log(`Deleted group tag ${id} (${deleted.name})`);

      const wasAlcaldia = /^(alcaldia|alcald[ií]a)$/i.test(deleted.name.trim());
      if (wasAlcaldia) {
        const remainingAlcaldia = this.tags.find(t =>
          /^(alcaldia|alcald[ií]a)$/i.test(t.name.trim()),
        );
        void this.notifyAlcaldiaSync(
          remainingAlcaldia ? remainingAlcaldia.groupIds : [],
        );
      }
      return true;
    }
    return false;
  }

  /**
   * Sincroniza dinámicamente con el Termómetro Comunal de Quilicura
   * cada vez que se crea, agrega o remueve grupos de la categoría "alcaldia"
   */
  async notifyAlcaldiaSync(
    groupIds: string[],
    groupMetadata?: Record<string, string>,
  ): Promise<void> {
    try {
      const termometroUrl = (
        process.env.QUILICURA_API_URL ||
        process.env.TERMOMETRO_URL ||
        'http://localhost:3000'
      ).replace(/\/$/, '');

      let catalog: Array<{ id: string; name: string }> = [];
      try {
        const catalogPath = path.join(process.cwd(), 'data', 'group-catalog.json');
        if (fs.existsSync(catalogPath)) {
          catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
        }
      } catch {}
      const catalogMap = new Map(catalog.map(c => [c.id, c.name]));

      const grupos = groupIds.map(gid => ({
        id: gid,
        name:
          groupMetadata?.[gid] ||
          catalogMap.get(gid) ||
          'Canal Vecinal Quilicura',
      }));

      this.logger.log(
        `[Alcaldía Sync] Sincronizando ${grupos.length} grupos de categoría "alcaldia" con Termómetro Comunal (${termometroUrl})...`,
      );

      const res = await fetch(`${termometroUrl}/api/openwa/delegar-grupos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          categoria: 'alcaldia',
          grupos,
        }),
        signal: AbortSignal.timeout(3500),
      });

      if (res.ok) {
        const data = await res.json();
        this.logger.log(
          `[Alcaldía Sync] Éxito: ${data.mensaje || `Sincronizados ${grupos.length} grupos`}`,
        );
      } else {
        this.logger.warn(`[Alcaldía Sync] Servidor respondió HTTP ${res.status}`);
      }
    } catch (e: any) {
      this.logger.log(
        `[Alcaldía Sync] Termómetro Comunal offline de momento (${e?.message}) - sincronización persistida localmente`,
      );
    }
  }
}
