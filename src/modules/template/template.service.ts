import { ConflictException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import { Template } from './entities/template.entity';
import { CreateTemplateDto, UpdateTemplateDto } from './dto';
import { createLogger } from '../../common/services/logger.service';
import { isUniqueConstraintError } from '../../common/utils/unique-constraint.util';

@Injectable()
export class TemplateService implements OnModuleInit {
  private readonly logger = createLogger('TemplateService');
  private readonly backupPath = path.join(process.cwd(), 'data', 'templates.json');

  constructor(
    @InjectRepository(Template, 'data')
    private readonly templateRepository: Repository<Template>,
  ) {}

  async onModuleInit() {
    await this.ensureColumns();
    await this.restoreFromBackup();
  }

  private async ensureColumns() {
    try {
      await this.templateRepository.query(`ALTER TABLE templates ADD COLUMN mediaType varchar(20) DEFAULT 'text'`).catch(() => {});
      await this.templateRepository.query(`ALTER TABLE templates ADD COLUMN mediaUrl text`).catch(() => {});
      await this.templateRepository.query(`ALTER TABLE templates ADD COLUMN mediaFileName varchar(255)`).catch(() => {});
      await this.templateRepository.query(`ALTER TABLE templates ADD COLUMN mediaUrls text`).catch(() => {});
    } catch (e: any) {
      this.logger.warn('Column auto-migration skipped or already present:', e?.message);
    }
  }

  private formatTemplate(template: Template): any {
    if (!template) return template;
    let parsedMediaUrls: string[] = [];
    if (template.mediaUrls) {
      try {
        parsedMediaUrls = typeof template.mediaUrls === 'string' ? JSON.parse(template.mediaUrls) : template.mediaUrls;
        if (!Array.isArray(parsedMediaUrls)) parsedMediaUrls = [];
      } catch {
        parsedMediaUrls = [template.mediaUrls];
      }
    } else if (template.mediaUrl) {
      parsedMediaUrls = [template.mediaUrl];
    }

    return {
      ...template,
      mediaUrls: parsedMediaUrls,
    };
  }

  private async syncBackup() {
    try {
      const all = await this.templateRepository.find();
      const dir = path.dirname(this.backupPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.backupPath, JSON.stringify(all, null, 2), 'utf8');
    } catch (e: any) {
      this.logger.error('Failed to sync templates backup:', e?.message);
    }
  }

  private async restoreFromBackup() {
    try {
      if (!fs.existsSync(this.backupPath)) return;
      const raw = fs.readFileSync(this.backupPath, 'utf8');
      const backup: Template[] = JSON.parse(raw);
      if (!Array.isArray(backup) || backup.length === 0) return;

      const currentCount = await this.templateRepository.count();
      if (currentCount === 0) {
        this.logger.log(`Restoring ${backup.length} templates from backup file...`);
        for (const item of backup) {
          const t = this.templateRepository.create(item);
          await this.templateRepository.save(t).catch(() => {});
        }
      }
    } catch (e: any) {
      this.logger.error('Failed to restore templates from backup:', e?.message);
    }
  }

  async create(sessionId: string, dto: CreateTemplateDto): Promise<Template> {
    const mediaUrlsJson = Array.isArray(dto.mediaUrls) && dto.mediaUrls.length > 0
      ? JSON.stringify(dto.mediaUrls)
      : dto.mediaUrl ? JSON.stringify([dto.mediaUrl]) : null;

    const firstMediaUrl = Array.isArray(dto.mediaUrls) && dto.mediaUrls.length > 0
      ? dto.mediaUrls[0]
      : dto.mediaUrl ?? null;

    const template = this.templateRepository.create({
      sessionId,
      name: dto.name,
      body: dto.body,
      header: dto.header ?? null,
      footer: dto.footer ?? null,
      mediaType: dto.mediaType || 'text',
      mediaUrl: firstMediaUrl,
      mediaUrls: mediaUrlsJson,
      mediaFileName: dto.mediaFileName ?? null,
    });

    try {
      const saved = await this.templateRepository.save(template);
      this.logger.log('Template created', { sessionId, templateId: saved.id, name: saved.name });
      await this.syncBackup();
      return this.formatTemplate(saved);
    } catch (err) {
      if (isUniqueConstraintError(err)) {
        throw new ConflictException(`A template named '${dto.name}' already exists for this session`);
      }
      throw err;
    }
  }

  async findBySession(sessionId: string): Promise<Template[]> {
    // Return all saved templates so templates are permanent and global across all session reconnections
    const list = await this.templateRepository.find({
      order: { createdAt: 'DESC' },
    });
    return list.map(t => this.formatTemplate(t));
  }

  async findOne(sessionId: string, id: string): Promise<Template> {
    const template = await this.templateRepository.findOne({ where: { id } });
    if (!template) {
      throw new NotFoundException(`Template with id '${id}' not found`);
    }
    return this.formatTemplate(template);
  }

  /**
   * Resolve a template by id or by name across all templates. Used by the send-template message flow.
   */
  async resolve(sessionId: string, identifier: { templateId?: string; templateName?: string }): Promise<Template> {
    const { templateId, templateName } = identifier;

    if (templateId) {
      const byId = await this.templateRepository.findOne({ where: { id: templateId } });
      if (byId) return this.formatTemplate(byId);
    }

    if (templateName) {
      const byName = await this.templateRepository.findOne({ where: { name: templateName }, order: { createdAt: 'ASC' } });
      if (byName) return this.formatTemplate(byName);
    }

    throw new NotFoundException(`Template not found for identifier: ${JSON.stringify(identifier)}`);
  }

  async update(sessionId: string, id: string, dto: UpdateTemplateDto): Promise<Template> {
    const template = await this.templateRepository.findOne({ where: { id } });
    if (!template) {
      throw new NotFoundException(`Template with id '${id}' not found`);
    }

    if (dto.name !== undefined) template.name = dto.name;
    if (dto.body !== undefined) template.body = dto.body;
    if (dto.header !== undefined) template.header = dto.header;
    if (dto.footer !== undefined) template.footer = dto.footer;
    if (dto.mediaType !== undefined) template.mediaType = dto.mediaType;
    if (dto.mediaUrl !== undefined) template.mediaUrl = dto.mediaUrl;
    if (dto.mediaFileName !== undefined) template.mediaFileName = dto.mediaFileName;
    if (dto.mediaUrls !== undefined) {
      template.mediaUrls = Array.isArray(dto.mediaUrls) && dto.mediaUrls.length > 0
        ? JSON.stringify(dto.mediaUrls)
        : null;
      if (Array.isArray(dto.mediaUrls) && dto.mediaUrls.length > 0 && !dto.mediaUrl) {
        template.mediaUrl = dto.mediaUrls[0];
      }
    }

    try {
      const saved = await this.templateRepository.save(template);
      await this.syncBackup();
      return this.formatTemplate(saved);
    } catch (err) {
      if (isUniqueConstraintError(err)) {
        throw new ConflictException(`A template named '${template.name}' already exists for this session`);
      }
      throw err;
    }
  }

  async delete(sessionId: string, id: string): Promise<void> {
    const template = await this.findOne(sessionId, id);
    await this.templateRepository.remove(template);
    await this.syncBackup();
    this.logger.log('Template deleted', { sessionId, templateId: id });
  }
}
