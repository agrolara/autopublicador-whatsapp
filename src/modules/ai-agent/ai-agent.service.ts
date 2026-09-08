import { Injectable, OnModuleInit, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ModuleRef } from '@nestjs/core';
import * as fs from 'fs';
import * as path from 'path';
import { SessionAiConfig, AiProvider } from './entities/session-ai-config.entity';
import { UpdateAiConfigDto, TestAiPromptDto } from './dto/ai-config.dto';
import { Message, MessageDirection } from '../message/entities/message.entity';
import { createLogger } from '../../common/services/logger.service';
import type { MessageService } from '../message/message.service';
import { KnowledgeBaseService } from './knowledge-base.service';
import { EngineRegistry } from '../../engine/engine-registry.service';

interface DebounceEntry {
  timer: NodeJS.Timeout;
  messages: string[];
}

/**
 * Splits a long text cleanly into WhatsApp-friendly chunks of <= maxChunkSize chars.
 * Prefers splitting on double newlines, single newlines, sentence endings, or spaces.
 */
export function chunkMessage(text: string, maxChunkSize = 650): string[] {
  if (!text || text.length <= maxChunkSize) {
    return text && text.trim() ? [text.trim()] : [];
  }

  const chunks: string[] = [];
  let remaining = text.trim();

  while (remaining.length > 0) {
    if (remaining.length <= maxChunkSize) {
      chunks.push(remaining);
      break;
    }

    let cutIndex = -1;
    // 1. Try splitting by paragraph (\n\n)
    const doubleNewlineIndex = remaining.lastIndexOf('\n\n', maxChunkSize);
    if (doubleNewlineIndex > 100) {
      cutIndex = doubleNewlineIndex;
    } else {
      // 2. Try splitting by single newline (\n)
      const newlineIndex = remaining.lastIndexOf('\n', maxChunkSize);
      if (newlineIndex > 100) {
        cutIndex = newlineIndex;
      } else {
        // 3. Try splitting by sentence (. , ! , ? )
        const sentenceMatches = [...remaining.slice(0, maxChunkSize).matchAll(/([.!?])\s+/g)];
        if (sentenceMatches.length > 0) {
          const lastMatch = sentenceMatches[sentenceMatches.length - 1];
          cutIndex = (lastMatch.index ?? 0) + lastMatch[1].length;
        } else {
          // 4. Try splitting by whitespace
          const spaceIndex = remaining.lastIndexOf(' ', maxChunkSize);
          if (spaceIndex > 60) {
            cutIndex = spaceIndex;
          } else {
            // 5. Hard cut fallback
            cutIndex = maxChunkSize;
          }
        }
      }
    }

    const chunk = remaining.slice(0, cutIndex).trim();
    if (chunk) {
      chunks.push(chunk);
    }
    remaining = remaining.slice(cutIndex).trim();
  }

  return chunks;
}

/**
 * Strips internal thinking/reasoning blocks (e.g. from Nemotron, DeepSeek R1, Qwen)
 * so that only the final client-facing reply is sent to WhatsApp.
 */
export function stripThinkingProcess(text: string): string {
  if (!text) return '';

  let cleaned = text;

  // 1. Remove XML-like <think>...</think> tags
  cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

  // 2. Remove "Here's a thinking process: ... " or "Thinking Process: ..."
  if (/^(?:Here's a thinking process:|Thinking Process:|Thought Process:)/i.test(cleaned)) {
    // Look for common Spanish greetings, emojis, or delimiters where the actual response begins
    const spanishStart = cleaned.search(/\n\n(?=(?:¡|Hola|Buenas|Estimad|¿|🍕|•\s*\*\*|Claro|Por supuesto|Para|En|Si|Te|Con gusto|Aquí|Exactamente|Perfecto|Muy bien|Disculpa|Lamentablemente|Entiendo))/i);
    if (spanishStart !== -1 && spanishStart > 30) {
      cleaned = cleaned.slice(spanishStart).trim();
    } else {
      // Look for "Formulate Response:" or "Final Response:"
      const formulateMatch = cleaned.match(/[\s\S]*?(?:Formulate Response[^\n]*\n+|Final Response[^\n]*\n+|Drafting Response[^\n]*\n+)([\s\S]*)/i);
      if (formulateMatch && formulateMatch[1].trim()) {
        cleaned = formulateMatch[1].trim();
      }
    }
  }

  // Remove leading/trailing quotation marks if the whole response is quoted
  cleaned = cleaned.replace(/^["'](.*)["']$/s, '$1').trim();

  return cleaned || text;
}

export function normalizeChatId(id: string): string {
  if (!id) return '';
  return id.replace('@s.whatsapp.net', '@c.us').trim();
}

const HANDOVER_KEYWORD_REGEX =
  /\b(hablar con un humano|hablar con una persona|operador|asesor|persona real|humano|reclamo|supervisor|due[ñn]o|comunicar con un agente|quiero hablar con alguien)\b/i;

@Injectable()
export class AiAgentService implements OnModuleInit {
  private readonly logger = createLogger('AiAgentService');
  private messageService?: MessageService;
  private readonly debounceMap = new Map<string, DebounceEntry>();
  // In-memory handover silence map: `${sessionId}:${normalizedChatId}` -> expiry epoch ms (default 60 min)
  private readonly handoverMap = new Map<string, number>();
  // Tracks message IDs emitted by the AI Agent to never confuse them with a human operator
  private readonly aiSentMessageIds = new Set<string>();

  constructor(
    @InjectRepository(SessionAiConfig, 'data')
    private readonly configRepository: Repository<SessionAiConfig>,
    @InjectRepository(Message, 'data')
    private readonly messageRepository: Repository<Message>,
    @Optional()
    private readonly moduleRef?: ModuleRef,
    @Optional()
    private readonly knowledgeBaseService?: KnowledgeBaseService,
    @Optional()
    private readonly engineRegistry?: EngineRegistry,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.ensureTable();
    await this.syncFromBackup();
  }

  private getBackupFilePath(): string {
    const dataDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) {
      try {
        fs.mkdirSync(dataDir, { recursive: true });
      } catch {}
    }
    return path.join(dataDir, 'ai_configs.json');
  }

  private loadAllFromBackup(): Record<string, Partial<SessionAiConfig>> {
    try {
      const filePath = this.getBackupFilePath();
      if (!fs.existsSync(filePath)) {
        return {};
      }
      const raw = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(raw) as Record<string, Partial<SessionAiConfig>>;
    } catch (err) {
      this.logger.warn('Failed to read ai_configs.json backup', {
        error: err instanceof Error ? err.message : String(err),
      });
      return {};
    }
  }

  private saveToBackup(sessionId: string, config: Partial<SessionAiConfig>): void {
    try {
      const filePath = this.getBackupFilePath();
      const current = this.loadAllFromBackup();
      current[sessionId] = {
        sessionId,
        enabled: config.enabled,
        provider: config.provider,
        apiKey: config.apiKey,
        model: config.model,
        baseUrl: config.baseUrl,
        systemPrompt: config.systemPrompt,
        temperature: config.temperature,
        maxTokens: config.maxTokens,
        humanTakeoverMinutes: config.humanTakeoverMinutes,
        debounceSeconds: config.debounceSeconds,
        transcribeAudio: config.transcribeAudio,
        groqApiKey: config.groqApiKey,
        whisperModel: config.whisperModel,
      };
      fs.writeFileSync(filePath, JSON.stringify(current, null, 2), 'utf-8');
    } catch (err) {
      this.logger.warn('Failed to save ai_configs.json backup', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private async syncFromBackup(): Promise<void> {
    try {
      const backupMap = this.loadAllFromBackup();
      for (const [sessionId, bkp] of Object.entries(backupMap)) {
        let existing = await this.configRepository.findOne({ where: { sessionId } });
        if (!existing) {
          this.logger.log(`Restoring AI config for session ${sessionId} from ai_configs.json backup`);
          existing = this.configRepository.create({ sessionId });
        }
        let needsSave = false;
        const toSave = existing;
        if (bkp.enabled !== undefined && !toSave.enabled && bkp.enabled) {
          toSave.enabled = bkp.enabled;
          needsSave = true;
        }
        if (bkp.apiKey && !toSave.apiKey) {
          toSave.apiKey = bkp.apiKey;
          needsSave = true;
        }
        if (bkp.systemPrompt && (!toSave.systemPrompt || toSave.systemPrompt.length < 50)) {
          toSave.systemPrompt = bkp.systemPrompt;
          needsSave = true;
        }
        if (needsSave) {
          if (bkp.provider) toSave.provider = bkp.provider as AiProvider;
          if (bkp.model) toSave.model = bkp.model;
          if (bkp.baseUrl !== undefined) toSave.baseUrl = bkp.baseUrl;
          if (bkp.temperature !== undefined) toSave.temperature = bkp.temperature;
          if (bkp.maxTokens !== undefined) toSave.maxTokens = bkp.maxTokens;
          if (bkp.humanTakeoverMinutes !== undefined) toSave.humanTakeoverMinutes = bkp.humanTakeoverMinutes;
          if (bkp.debounceSeconds !== undefined) toSave.debounceSeconds = bkp.debounceSeconds;
          if (bkp.transcribeAudio !== undefined) toSave.transcribeAudio = bkp.transcribeAudio;
          if (bkp.groqApiKey !== undefined) toSave.groqApiKey = bkp.groqApiKey;
          if (bkp.whisperModel !== undefined) toSave.whisperModel = bkp.whisperModel;
          await this.configRepository.save(toSave);
        }
      }
    } catch (err) {
      this.logger.warn('Failed to sync AI configs from backup on init', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private async ensureTable(): Promise<void> {
    try {
      await this.configRepository.query(`
        CREATE TABLE IF NOT EXISTS session_ai_configs (
          id VARCHAR(36) PRIMARY KEY,
          sessionId VARCHAR(64) NOT NULL,
          enabled BOOLEAN NOT NULL DEFAULT 0,
          provider VARCHAR(32) NOT NULL DEFAULT 'openrouter',
          apiKey VARCHAR(255) NULL,
          model VARCHAR(128) NOT NULL DEFAULT 'deepseek/deepseek-chat',
          baseUrl VARCHAR(255) NULL,
          systemPrompt TEXT NULL,
          temperature FLOAT NOT NULL DEFAULT 0.7,
          maxTokens INT NOT NULL DEFAULT 400,
          humanTakeoverMinutes INT NOT NULL DEFAULT 30,
          debounceSeconds INT NOT NULL DEFAULT 3,
          transcribeAudio BOOLEAN DEFAULT 0,
          groqApiKey VARCHAR(255) NULL,
          whisperModel VARCHAR(64) DEFAULT 'whisper-large-v3-turbo',
          createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
          updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `).catch(() => {});

      await this.configRepository.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_session_ai_config_session ON session_ai_configs(sessionId)
      `).catch(() => {});

      // Add columns if table already existed without them
      await this.configRepository.query(`
        ALTER TABLE session_ai_configs ADD COLUMN transcribeAudio BOOLEAN DEFAULT 0
      `).catch(() => {});
      await this.configRepository.query(`
        ALTER TABLE session_ai_configs ADD COLUMN groqApiKey VARCHAR(255) NULL
      `).catch(() => {});
      await this.configRepository.query(`
        ALTER TABLE session_ai_configs ADD COLUMN whisperModel VARCHAR(64) DEFAULT 'whisper-large-v3-turbo'
      `).catch(() => {});
    } catch (err) {
      this.logger.warn('Error verifying session_ai_configs schema', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async getConfig(sessionId: string): Promise<SessionAiConfig> {
    let config = await this.configRepository.findOne({ where: { sessionId } });
    if (!config) {
      const backupMap = this.loadAllFromBackup();
      const bkp = backupMap[sessionId];
      config = this.configRepository.create({
        sessionId,
        enabled: bkp?.enabled ?? false,
        provider: (bkp?.provider as any) || 'openrouter',
        apiKey: bkp?.apiKey || null,
        model: bkp?.model || 'deepseek/deepseek-chat',
        baseUrl: bkp?.baseUrl || null,
        systemPrompt: bkp?.systemPrompt || 'Eres un asistente virtual amable y profesional. Responde de forma concisa y útil a los clientes.',
        temperature: bkp?.temperature ?? 0.7,
        maxTokens: bkp?.maxTokens ?? 400,
        humanTakeoverMinutes: bkp?.humanTakeoverMinutes ?? 30,
        debounceSeconds: bkp?.debounceSeconds ?? 3,
        transcribeAudio: bkp?.transcribeAudio ?? false,
        groqApiKey: bkp?.groqApiKey || null,
        whisperModel: bkp?.whisperModel || 'whisper-large-v3-turbo',
      });
      try {
        config = await this.configRepository.save(config);
        this.saveToBackup(sessionId, config);
      } catch {
        config = (await this.configRepository.findOne({ where: { sessionId } })) || config;
      }
    }
    return config;
  }

  async updateConfig(sessionId: string, dto: UpdateAiConfigDto): Promise<SessionAiConfig> {
    const config = await this.getConfig(sessionId);
    if (dto.enabled !== undefined) config.enabled = dto.enabled;
    if (dto.provider !== undefined) config.provider = dto.provider;
    if (dto.apiKey !== undefined) config.apiKey = dto.apiKey.trim() || null;
    if (dto.model !== undefined) config.model = dto.model.trim();
    if (dto.baseUrl !== undefined) config.baseUrl = dto.baseUrl?.trim() || null;
    if (dto.systemPrompt !== undefined) config.systemPrompt = dto.systemPrompt;
    if (dto.temperature !== undefined) config.temperature = dto.temperature;
    if (dto.maxTokens !== undefined) config.maxTokens = dto.maxTokens;
    if (dto.humanTakeoverMinutes !== undefined) config.humanTakeoverMinutes = dto.humanTakeoverMinutes;
    if (dto.debounceSeconds !== undefined) config.debounceSeconds = dto.debounceSeconds;
    if (dto.transcribeAudio !== undefined) config.transcribeAudio = dto.transcribeAudio;
    if (dto.groqApiKey !== undefined) config.groqApiKey = dto.groqApiKey.trim() || null;
    if (dto.whisperModel !== undefined) config.whisperModel = dto.whisperModel.trim() || 'whisper-large-v3-turbo';

    const saved = await this.configRepository.save(config);
    this.saveToBackup(sessionId, saved);
    return saved;
  }

  /**
   * Evaluates inbound messages and triggers AI response under strict privacy rules:
   * 1. ONLY private 1:1 chats (@s.whatsapp.net / @c.us).
   * 2. NEVER in groups (@g.us).
   * 3. NEVER for status broadcasts or newsletters.
   * 4. NEVER for messages sent by ourselves (fromMe).
   * 5. Freshness gate: skips stale messages (> 180s old).
   * 6. Human takeover gate: silences AI if human replied recently or if handed over.
   * 7. Voice Notes STT: transcribes WhatsApp audio (.ogg) via Groq Whisper if enabled.
   * 8. Debounce gate: buffers rapid-fire customer messages.
   * 9. Handover keyword trigger: alerts personal number and silences AI.
   */
  async handleInboundMessage(sessionId: string, message: Record<string, unknown>): Promise<void> {
    try {
      if (message.fromMe === true) return;

      const rawChatId = typeof message.chatId === 'string' ? message.chatId : (typeof message.from === 'string' ? message.from : null);
      if (!rawChatId) return;

      // STRICT RULE: Reject groups, broadcasts, channels/newsletters
      if (
        rawChatId.endsWith('@g.us') ||
        rawChatId.includes('@broadcast') ||
        rawChatId.includes('status@broadcast') ||
        rawChatId.includes('@newsletter')
      ) {
        return;
      }

      const normalizedChatId = normalizeChatId(rawChatId);
      const handoverKey = `${sessionId}:${normalizedChatId}`;

      // Check for manual reactivation command first (operates anytime)
      const rawBody = typeof message.body === 'string' ? message.body.trim() : '';
      if (/^#(?:bot|ia|reactivar|activar)\b/i.test(rawBody)) {
        this.handoverMap.delete(handoverKey);
        this.logger.log(`Handover silence manually cleared via command for ${rawChatId}`);
        const messageService = this.resolveMessageService();
        if (messageService) {
          const sent = await messageService.sendText(sessionId, {
            chatId: rawChatId,
            text: '🤖 *Asistente de IA activo y operativo para este chat.* ¿En qué te puedo ayudar?',
          });
          if (sent?.messageId) this.aiSentMessageIds.add(sent.messageId);
        }
        return;
      }

      // Check handover silence window
      const handoverExpiry = this.handoverMap.get(handoverKey);
      if (handoverExpiry && Date.now() < handoverExpiry) {
        this.logger.debug('AI reply skipped: chat is currently handed over to human operator', {
          sessionId,
          chatId: rawChatId,
          remainingMinutes: Math.round((handoverExpiry - Date.now()) / 60000),
        });
        return;
      }

      // Freshness gate: ignore messages older than 3 minutes
      const timestamp = typeof message.timestamp === 'number' ? message.timestamp : null;
      if (timestamp !== null && Date.now() / 1000 - timestamp > 180) {
        return;
      }

      // Load session config
      const config = await this.configRepository.findOne({ where: { sessionId } });
      if (!config || !config.enabled || !config.apiKey || !config.systemPrompt) {
        return;
      }

      let text = typeof message.body === 'string' ? message.body.trim() : '';

      // Check for voice note / audio
      const media = message.media as { data?: string; mimetype?: string } | undefined;
      const isAudio =
        message.type === 'ptt' ||
        message.type === 'audio' ||
        (media && typeof media.mimetype === 'string' && media.mimetype.startsWith('audio/'));

      if (!text && isAudio) {
        if (!config.transcribeAudio || !config.groqApiKey) {
          this.logger.debug('Skipping audio: transcription disabled or no Groq key configured', { sessionId });
          return;
        }

        const audioBase64 = media?.data;
        if (!audioBase64) {
          this.logger.warn('Audio message received but media data was not available', { sessionId, msgId: message.id });
          return;
        }

        this.logger.log(`Transcribing audio message for session ${sessionId} with Groq Whisper...`);
        const transcribed = await this.transcribeWithGroq(audioBase64, config.groqApiKey, config.whisperModel);
        if (!transcribed) {
          this.logger.warn('Groq Whisper returned empty transcription', { sessionId });
          return;
        }

        this.logger.log(`Transcribed audio successfully: "${transcribed.slice(0, 60)}..."`);
        text = `[Nota de voz transcripta]: "${transcribed}"`;
      }

      if (!text) return; // Only process messages with text content or successfully transcribed audio

      // Keyword trigger for immediate human handover
      if (HANDOVER_KEYWORD_REGEX.test(text)) {
        this.logger.log(`Human handover keyword detected in message from ${rawChatId}`);
        await this.triggerHumanHandover(sessionId, rawChatId, text, message);
        return;
      }

      // Human takeover check: did the human operator reply in this chat recently?
      // CRITICAL: We exclude messages sent by the AI itself so the bot never silences itself!
      const humanMinutes = config.humanTakeoverMinutes ?? 30;
      if (humanMinutes > 0) {
        const cutoff = new Date(Date.now() - humanMinutes * 60 * 1000);
        const recentOutgoing = await this.messageRepository.find({
          where: [
            { sessionId, chatId: rawChatId, direction: MessageDirection.OUTGOING },
            { sessionId, chatId: normalizedChatId, direction: MessageDirection.OUTGOING },
          ],
          order: { createdAt: 'DESC' },
          take: 10,
        });

        const recentHumanMsg = recentOutgoing.find(
          (m) =>
            !this.aiSentMessageIds.has(m.id) &&
            (!m.waMessageId || !this.aiSentMessageIds.has(m.waMessageId)) &&
            !m.body?.startsWith('🤖 *Asistente') &&
            !m.body?.startsWith('Te estoy transfiriendo'),
        );

        if (recentHumanMsg && recentHumanMsg.createdAt > cutoff) {
          this.logger.debug('AI reply skipped: human operator active in chat', {
            sessionId,
            chatId: rawChatId,
            humanTakeoverMinutes: humanMinutes,
          });
          return;
        }
      }

      // Debounce customer message bursts (e.g. 3 messages sent within 3 seconds)
      const bufferKey = `${sessionId}:${normalizedChatId}`;
      const debounceDelay = (config.debounceSeconds || 3) * 1000;

      const existing = this.debounceMap.get(bufferKey);
      if (existing) {
        clearTimeout(existing.timer);
        existing.messages.push(text);
        existing.timer = setTimeout(() => {
          this.debounceMap.delete(bufferKey);
          void this.executeAiReply(sessionId, rawChatId, config, existing.messages, message);
        }, debounceDelay);
      } else {
        const entry: DebounceEntry = {
          messages: [text],
          timer: setTimeout(() => {
            this.debounceMap.delete(bufferKey);
            void this.executeAiReply(sessionId, rawChatId, config, entry.messages, message);
          }, debounceDelay),
        };
        this.debounceMap.set(bufferKey, entry);
      }
    } catch (err) {
      this.logger.warn('Error evaluating inbound message for AI agent', {
        sessionId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /**
   * Transcribes WhatsApp audio (.ogg/opus) via Groq Whisper API in ~300ms.
   */
  async transcribeWithGroq(
    audioBase64: string,
    groqApiKey: string,
    whisperModel?: string,
  ): Promise<string> {
    try {
      const buffer = Buffer.from(audioBase64, 'base64');
      const blob = new Blob([buffer], { type: 'audio/ogg' });
      const formData = new FormData();
      formData.append('file', blob, 'audio.ogg');
      formData.append('model', whisperModel?.trim() || 'whisper-large-v3-turbo');
      formData.append('language', 'es');
      formData.append('response_format', 'json');

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20000);

      try {
        const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${groqApiKey.trim()}`,
          },
          body: formData,
          signal: controller.signal,
        });

        if (!response.ok) {
          const errText = await response.text().catch(() => '');
          throw new Error(`Groq Whisper status ${response.status}: ${errText.slice(0, 200)}`);
        }

        const json = (await response.json()) as { text?: string };
        return json.text?.trim() || '';
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (err) {
      this.logger.error(
        `Failed to transcribe audio with Groq Whisper: ${err instanceof Error ? err.message : String(err)}`,
      );
      return '';
    }
  }

  private async executeAiReply(
    sessionId: string,
    chatId: string,
    config: SessionAiConfig,
    userMessages: string[],
    rawMessage?: Record<string, unknown>,
  ): Promise<void> {
    try {
      const combinedUserMessage = userMessages.join('\n');

      // Check keyword trigger one more time on combined messages
      if (HANDOVER_KEYWORD_REGEX.test(combinedUserMessage)) {
        this.logger.log(`Handover keyword in combined burst for chat ${chatId}`);
        await this.triggerHumanHandover(sessionId, chatId, combinedUserMessage, rawMessage);
        return;
      }

      // Fetch recent message history (last 8 messages) for conversational memory
      const historyRows = await this.messageRepository.find({
        where: { sessionId, chatId },
        order: { createdAt: 'DESC' },
        take: 8,
      });
      historyRows.reverse();

      // Inject Knowledge Base context if available
      let knowledgeContext = '';
      if (this.knowledgeBaseService) {
        try {
          knowledgeContext = await this.knowledgeBaseService.getContextText(sessionId);
        } catch (err) {
          this.logger.warn('Failed to load knowledge base context', { error: String(err) });
        }
      }

      const handoverInstruction =
        `\n\n[INSTRUCCIÓN OBLIGATORIA DE DERIVACIÓN A ASESOR HUMANO]:\n` +
        `Si el cliente solicita explícitamente comunicarse con una persona humana, asesor, operador, supervisor, realizar un reclamo formal o si su solicitud requiere una gestión manual o personalizada que no puedes resolver, debes responder amablemente confirmando que lo estás comunicando con un asesor humano de nuestro equipo e incluir obligatoriamente al final de tu respuesta la etiqueta especial: [DERIVAR_HUMANO].`;

      const finalSystemPrompt = `${config.systemPrompt || 'Eres un asistente útil.'}${knowledgeContext}${handoverInstruction}`;

      const messagesForLlm: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
        { role: 'system', content: finalSystemPrompt },
      ];

      // Append past turns (excluding the current ones)
      for (const row of historyRows) {
        if (!row.body) continue;
        const isOutgoing = row.direction === MessageDirection.OUTGOING;
        if (row.body === combinedUserMessage && !isOutgoing) continue;
        messagesForLlm.push({
          role: isOutgoing ? 'assistant' : 'user',
          content: row.body,
        });
      }

      // Add the new incoming user message(s)
      messagesForLlm.push({
        role: 'user',
        content: combinedUserMessage,
      });

      this.logger.log(`Invoking AI agent for chat ${chatId} (${config.provider}/${config.model})`);

      let replyText = await this.callLlm(config, messagesForLlm);
      if (!replyText || !replyText.trim()) return;

      // Clean internal thinking/reasoning blocks (e.g. from Nemotron, DeepSeek R1, Qwen)
      replyText = stripThinkingProcess(replyText);
      if (!replyText || !replyText.trim()) return;

      // Check if LLM emitted the handover tag
      if (replyText.includes('[DERIVAR_HUMANO]')) {
        const cleanedReply = replyText.replace(/\[DERIVAR_HUMANO\]/g, '').trim();
        this.logger.log(`LLM requested human handover for chat ${chatId}`);
        await this.triggerHumanHandover(sessionId, chatId, combinedUserMessage, rawMessage, cleanedReply);
        return;
      }

      const messageService = this.resolveMessageService();
      if (!messageService) {
        this.logger.warn('MessageService not available to send AI reply', { sessionId });
        return;
      }

      // Send the reply with smart message chunking (<= 750 chars per message)
      const chunks = chunkMessage(replyText, 750);

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];

        if (i > 0) {
          // Emit typing presence for subsequent chunks
          try {
            const engine = this.engineRegistry?.get(sessionId);
            if (engine) {
              await engine.sendChatState(chatId, 'typing').catch(() => {});
            }
          } catch {}

          // Natural delay between chunks: 1.2s - 2.0s
          const delayMs = 1200 + Math.floor(Math.random() * 800);
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }

        const sent = await messageService.sendText(sessionId, {
          chatId,
          text: chunk,
        });
        if (sent?.messageId) this.aiSentMessageIds.add(sent.messageId);
      }

      this.logger.log(`AI Agent replied successfully to ${chatId}`, {
        sessionId,
        model: config.model,
        chars: replyText.length,
        chunks: chunks.length,
      });
    } catch (err) {
      this.logger.error(
        `Failed to execute AI reply for ${sessionId}/${chatId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * Silences the AI for this chat (60 min), sends confirmation to client,
   * and sends an urgent notification alert to WhatsApp personal number +56993005959.
   */
  async triggerHumanHandover(
    sessionId: string,
    chatId: string,
    lastUserMessage: string,
    rawMessage?: Record<string, unknown>,
    customReply?: string,
  ): Promise<void> {
    try {
      // 1. Mark chat as silenced for 60 minutes
      const normalizedChatId = normalizeChatId(chatId);
      const handoverKey = `${sessionId}:${normalizedChatId}`;
      this.handoverMap.set(handoverKey, Date.now() + 60 * 60 * 1000);

      const messageService = this.resolveMessageService();
      if (!messageService) {
        this.logger.warn('MessageService not available for handover trigger', { sessionId });
        return;
      }

      // 2. Send friendly confirmation to client
      const clientReply =
        customReply && customReply.trim().length > 0
          ? customReply.trim()
          : 'Te estoy transfiriendo con un asesor humano de nuestro equipo. En breve te responderemos directamente por este chat. ¡Muchas gracias por tu paciencia!';

      const sent = await messageService.sendText(sessionId, {
        chatId,
        text: clientReply,
      });
      if (sent?.messageId) this.aiSentMessageIds.add(sent.messageId);

      // 3. Send WhatsApp alert to personal number +56993005959
      const clientPhone = chatId.replace(/[^0-9]/g, '');
      const pushName =
        (rawMessage?.pushName as string) ||
        (rawMessage?.notifyName as string) ||
        (rawMessage?.senderName as string) ||
        'Cliente WhatsApp';

      const chileTime = new Intl.DateTimeFormat('es-CL', {
        timeZone: 'America/Santiago',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }).format(new Date());

      const alertMessage =
        `🚨 *ALERTA: DERIVACIÓN A HUMANO - OPENWA* 🚨\n\n` +
        `👤 *Cliente:* ${pushName}\n` +
        `📱 *Número:* +${clientPhone}\n` +
        `🕒 *Hora:* ${chileTime}\n` +
        `💬 *Última consulta:* "${lastUserMessage.slice(0, 300)}"\n` +
        `⚠️ *Acción:* La IA se ha silenciado para este chat por 60 minutos. Por favor responde directamente.`;

      await messageService
        .sendText(sessionId, {
          chatId: '56993005959@s.whatsapp.net',
          text: alertMessage,
        })
        .catch((err) => {
          this.logger.warn('Failed to send handover alert to personal WhatsApp (+56993005959)', {
            error: err instanceof Error ? err.message : String(err),
          });
        });

      this.logger.log(`Handover alert dispatched to +56993005959 for chat ${chatId}`);
    } catch (err) {
      this.logger.error(
        `Error executing human handover for ${sessionId}/${chatId}: ${err instanceof Error ? err.message : String(err)}`,
        err instanceof Error ? err.stack : undefined,
      );
    }
  }

  /**
   * Test prompt simulator endpoint: allows testing provider, model, prompt and knowledge base
   * without sending any message to WhatsApp.
   */
  async testPrompt(dto: TestAiPromptDto, sessionId?: string): Promise<{ reply: string; durationMs: number }> {
    const start = Date.now();

    let knowledgeContext = '';
    if (sessionId && this.knowledgeBaseService) {
      try {
        knowledgeContext = await this.knowledgeBaseService.getContextText(sessionId);
      } catch {}
    }

    const fullSystemPrompt = `${dto.systemPrompt || 'Eres un asistente útil.'}${knowledgeContext}`;

    const config: Partial<SessionAiConfig> = {
      provider: dto.provider,
      apiKey: dto.apiKey,
      model: dto.model,
      baseUrl: dto.baseUrl,
      systemPrompt: fullSystemPrompt,
      temperature: dto.temperature ?? 0.7,
      maxTokens: dto.maxTokens ?? 1200,
    };

    const messagesForLlm = [
      { role: 'system' as const, content: fullSystemPrompt },
      { role: 'user' as const, content: dto.userMessage?.trim() || 'Hola, ¿qué servicios o productos ofrecen y cuáles son sus precios?' },
    ];

    try {
      let reply = await this.callLlm(config as SessionAiConfig, messagesForLlm);
      reply = stripThinkingProcess(reply);
      return {
        reply,
        durationMs: Date.now() - start,
      };
    } catch (err) {
      return {
        reply: `⚠️ Error de conexión con el proveedor (${dto.provider}): ${err instanceof Error ? err.message : String(err)}`,
        durationMs: Date.now() - start,
      };
    }
  }

  private async callLlm(
    config: SessionAiConfig,
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  ): Promise<string> {
    const provider = config.provider || 'openrouter';

    switch (provider) {
      case 'openrouter':
        return this.callOpenRouter(config, messages);
      case 'openai':
        return this.callOpenAiCompatible(
          config.baseUrl || 'https://api.openai.com/v1',
          config.apiKey || '',
          config.model || 'gpt-4o-mini',
          config,
          messages,
        );
      case 'gemini':
        return this.callGemini(config, messages);
      case 'custom':
        return this.callOpenAiCompatible(
          config.baseUrl || 'https://api.openai.com/v1',
          config.apiKey || '',
          config.model,
          config,
          messages,
        );
      default:
        throw new Error(`Unsupported AI provider: ${provider}`);
    }
  }

  private async callOpenRouter(
    config: SessionAiConfig,
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  ): Promise<string> {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey?.trim()}`,
        'HTTP-Referer': 'https://openwa.dev',
        'X-Title': 'OpenWA AI Agent',
      },
      body: JSON.stringify({
        model: config.model || 'deepseek/deepseek-chat',
        messages,
        temperature: config.temperature ?? 0.7,
        max_tokens: Math.max(config.maxTokens ?? 1200, 2500),
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`OpenRouter error (${response.status}): ${err}`);
    }

    const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    return data.choices?.[0]?.message?.content || '';
  }

  private async callOpenAiCompatible(
    baseUrl: string,
    apiKey: string,
    model: string,
    config: SessionAiConfig,
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  ): Promise<string> {
    const cleanBaseUrl = baseUrl.replace(/\/+$/, '');
    const url = cleanBaseUrl.endsWith('/chat/completions')
      ? cleanBaseUrl
      : `${cleanBaseUrl}/chat/completions`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey.trim()}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: config.temperature ?? 0.7,
        max_tokens: Math.max(config.maxTokens ?? 1200, 2500),
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`API error (${response.status}): ${err}`);
    }

    const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    return data.choices?.[0]?.message?.content || '';
  }

  private async callGemini(
    config: SessionAiConfig,
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  ): Promise<string> {
    const model = config.model || 'gemini-1.5-flash';
    const apiKey = config.apiKey?.trim();
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const contents: Array<{ role: string; parts: Array<{ text: string }> }> = [];
    let systemInstruction: string | undefined;

    for (const msg of messages) {
      if (msg.role === 'system') {
        systemInstruction = msg.content;
      } else {
        contents.push({
          role: msg.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: msg.content }],
        });
      }
    }

    const body: Record<string, unknown> = {
      contents,
      generationConfig: {
        temperature: config.temperature ?? 0.7,
        maxOutputTokens: Math.max(config.maxTokens ?? 1200, 2500),
      },
    };

    if (systemInstruction) {
      body.systemInstruction = {
        parts: [{ text: systemInstruction }],
      };
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Gemini error (${response.status}): ${err}`);
    }

    const data = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  }

  private resolveMessageService(): MessageService | undefined {
    if (this.messageService) return this.messageService;
    try {
      if (this.moduleRef) {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { MessageService } = require('../message/message.service');
        this.messageService = this.moduleRef.get(MessageService, { strict: false });
      }
    } catch {
      // MessageService not yet resolved
    }
    return this.messageService;
  }

  /**
   * Clears the human handover silence for a specific chat or all chats of a session.
   */
  resetHandoverSilence(sessionId: string, chatId?: string): { success: boolean; clearedCount: number } {
    let clearedCount = 0;
    if (chatId) {
      const norm = normalizeChatId(chatId);
      const key1 = `${sessionId}:${chatId}`;
      const key2 = `${sessionId}:${norm}`;
      if (this.handoverMap.delete(key1)) clearedCount++;
      if (this.handoverMap.delete(key2)) clearedCount++;
    } else {
      for (const [k] of this.handoverMap.entries()) {
        if (k.startsWith(`${sessionId}:`)) {
          this.handoverMap.delete(k);
          clearedCount++;
        }
      }
    }
    this.logger.log(`Handover silence reset for session ${sessionId} (cleared: ${clearedCount})`);
    return { success: true, clearedCount };
  }
}
