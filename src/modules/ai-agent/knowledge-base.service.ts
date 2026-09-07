import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import AdmZip from 'adm-zip';
import { createLogger } from '../../common/services/logger.service';

export interface KnowledgeDocumentDto {
  id: string;
  originalName: string;
  filename: string;
  mimeType: string;
  size: number;
  uploadedAt: string;
  charCount: number;
}

interface StoredDocumentRecord extends KnowledgeDocumentDto {
  textContent: string;
}

@Injectable()
export class KnowledgeBaseService {
  private readonly logger = createLogger('KnowledgeBaseService');

  private getSessionKnowledgeDir(sessionId: string): string {
    const safeSessionId = sessionId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const baseDir = path.join(process.cwd(), 'data', 'knowledge_base', safeSessionId);
    if (!fs.existsSync(baseDir)) {
      fs.mkdirSync(baseDir, { recursive: true });
    }
    return baseDir;
  }

  private getIndexFilePath(sessionId: string): string {
    return path.join(this.getSessionKnowledgeDir(sessionId), 'index.json');
  }

  private loadIndex(sessionId: string): StoredDocumentRecord[] {
    const indexPath = this.getIndexFilePath(sessionId);
    if (!fs.existsSync(indexPath)) {
      return [];
    }
    try {
      const content = fs.readFileSync(indexPath, 'utf-8');
      return JSON.parse(content) as StoredDocumentRecord[];
    } catch (err) {
      this.logger.warn(`Failed to read knowledge base index for session ${sessionId}`, {
        error: err instanceof Error ? err.message : String(err),
      });
      return [];
    }
  }

  private saveIndex(sessionId: string, records: StoredDocumentRecord[]): void {
    const indexPath = this.getIndexFilePath(sessionId);
    try {
      fs.writeFileSync(indexPath, JSON.stringify(records, null, 2), 'utf-8');
    } catch (err) {
      this.logger.error(
        `Failed to save knowledge base index for session ${sessionId}: ${err instanceof Error ? err.message : String(err)}`,
        err instanceof Error ? err.stack : undefined,
      );
    }
  }

  /**
   * Lists all knowledge documents uploaded for a session.
   */
  async listDocuments(sessionId: string): Promise<KnowledgeDocumentDto[]> {
    const records = this.loadIndex(sessionId);
    return records.map(({ id, originalName, filename, mimeType, size, uploadedAt, charCount }) => ({
      id,
      originalName,
      filename,
      mimeType,
      size,
      uploadedAt,
      charCount,
    }));
  }

  /**
   * Adds and parses a new document into the session's knowledge base.
   */
  async addDocument(
    sessionId: string,
    file: { originalname: string; buffer: Buffer; mimetype?: string; size: number },
  ): Promise<KnowledgeDocumentDto> {
    if (!file || !file.buffer) {
      throw new BadRequestException('Archivo no provisto o corrupto.');
    }

    const ext = path.extname(file.originalname).toLowerCase();
    const allowedExts = ['.pdf', '.txt', '.csv', '.docx'];
    if (!allowedExts.includes(ext)) {
      throw new BadRequestException(
        `Formato no soportado (${ext}). Formatos permitidos: PDF, DOCX, TXT, CSV.`,
      );
    }

    const id = `doc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const diskFilename = `${id}${ext}`;
    const targetDir = this.getSessionKnowledgeDir(sessionId);
    const diskFilePath = path.join(targetDir, diskFilename);

    // Save physical file
    fs.writeFileSync(diskFilePath, file.buffer);

    // Extract text content
    let textContent = '';
    try {
      textContent = await this.extractText(file.buffer, ext);
    } catch (err) {
      this.logger.error(
        `Failed to extract text from ${file.originalname}: ${err instanceof Error ? err.message : String(err)}`,
        err instanceof Error ? err.stack : undefined,
      );
      try {
        fs.unlinkSync(diskFilePath);
      } catch {}
      throw new BadRequestException(
        `Error al extraer texto del documento: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    const cleanText = textContent.replace(/\u0000/g, '').trim();

    const record: StoredDocumentRecord = {
      id,
      originalName: file.originalname,
      filename: diskFilename,
      mimeType: file.mimetype || 'application/octet-stream',
      size: file.size,
      uploadedAt: new Date().toISOString(),
      charCount: cleanText.length,
      textContent: cleanText,
    };

    const existing = this.loadIndex(sessionId);
    existing.push(record);
    this.saveIndex(sessionId, existing);

    this.logger.log(`Added document to knowledge base: ${file.originalname} (${cleanText.length} chars)`, {
      sessionId,
      docId: id,
    });

    return {
      id: record.id,
      originalName: record.originalName,
      filename: record.filename,
      mimeType: record.mimeType,
      size: record.size,
      uploadedAt: record.uploadedAt,
      charCount: record.charCount,
    };
  }

  /**
   * Deletes a document from the session's knowledge base.
   */
  async deleteDocument(sessionId: string, documentId: string): Promise<boolean> {
    const existing = this.loadIndex(sessionId);
    const targetIndex = existing.findIndex((doc) => doc.id === documentId);
    if (targetIndex === -1) {
      throw new NotFoundException('Documento no encontrado.');
    }

    const [deleted] = existing.splice(targetIndex, 1);
    this.saveIndex(sessionId, existing);

    // Delete physical file
    try {
      const diskFilePath = path.join(this.getSessionKnowledgeDir(sessionId), deleted.filename);
      if (fs.existsSync(diskFilePath)) {
        fs.unlinkSync(diskFilePath);
      }
    } catch (err) {
      this.logger.warn(`Failed to delete disk file ${deleted.filename}`, {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    this.logger.log(`Deleted document from knowledge base: ${deleted.originalName}`, {
      sessionId,
      docId: documentId,
    });

    return true;
  }

  /**
   * Compiles all active knowledge documents into a prompt-ready context block.
   */
  async getContextText(sessionId: string, maxChars = 30000): Promise<string> {
    const records = this.loadIndex(sessionId);
    if (records.length === 0) {
      return '';
    }

    let compiled = '\n\n[BASE DE CONOCIMIENTO OFICIAL DEL NEGOCIO]\n';
    compiled +=
      'Utiliza la siguiente información oficial de la empresa como fuente de verdad estricta para resolver dudas, precios, productos y políticas:\n';

    let currentLength = compiled.length;

    for (const doc of records) {
      const header = `\n--- Documento: ${doc.originalName} ---\n`;
      const footer = `\n--- Fin de ${doc.originalName} ---\n`;
      const docText = doc.textContent;

      if (currentLength + header.length + docText.length + footer.length <= maxChars) {
        compiled += header + docText + footer;
        currentLength += header.length + docText.length + footer.length;
      } else {
        const remainingChars = maxChars - currentLength - header.length - footer.length - 20;
        if (remainingChars > 100) {
          compiled += header + docText.slice(0, remainingChars) + '\n[...contenido truncado por límite...]' + footer;
        }
        break;
      }
    }

    return compiled;
  }

  /**
   * Extracts text based on file extension.
   */
  private async extractText(buffer: Buffer, ext: string): Promise<string> {
    switch (ext) {
      case '.txt':
      case '.csv':
        return buffer.toString('utf-8');

      case '.docx':
        return this.extractDocx(buffer);

      case '.pdf':
        return await this.extractPdf(buffer);

      default:
        return buffer.toString('utf-8');
    }
  }

  private extractDocx(buffer: Buffer): string {
    const zip = new AdmZip(buffer);
    const docXml = zip.readAsText('word/document.xml');
    if (!docXml) {
      return '';
    }
    return docXml
      .replace(/<\/w:p>/gi, '\n')
      .replace(/<w:br[^>]*>/gi, '\n')
      .replace(/<w:tab[^>]*>/gi, '\t')
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/\n\s*\n\s*\n/g, '\n\n')
      .trim();
  }

  private async extractPdf(buffer: Buffer): Promise<string> {
    try {
      // Use pdf-parse v2 class structure
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const pdfModule = require('pdf-parse');
      const PDFParseClass = pdfModule.PDFParse || (typeof pdfModule === 'function' ? pdfModule : null);

      if (PDFParseClass && typeof PDFParseClass === 'function' && PDFParseClass.prototype?.load) {
        const parser = new PDFParseClass({ data: buffer });
        await parser.load();
        const result = await parser.getText();
        if (typeof parser.destroy === 'function') {
          await parser.destroy();
        }
        if (result && typeof result.text === 'string') {
          return result.text;
        }
        if (typeof result === 'string') {
          return result;
        }
      }

      // Fallback for pdf-parse v1 function signature
      if (typeof pdfModule === 'function') {
        const result = await pdfModule(buffer);
        return result.text || '';
      }

      return '';
    } catch (err) {
      throw new Error(`Error procesando archivo PDF: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
