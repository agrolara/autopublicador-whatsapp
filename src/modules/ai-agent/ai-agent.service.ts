import { Injectable, OnModuleInit, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ModuleRef } from '@nestjs/core';
import { SessionAiConfig, AiProvider } from './entities/session-ai-config.entity';
import { UpdateAiConfigDto, TestAiPromptDto } from './dto/ai-config.dto';
import { Message, MessageDirection } from '../message/entities/message.entity';
import { createLogger } from '../../common/services/logger.service';
import type { MessageService } from '../message/message.service';

interface DebounceEntry {
  timer: NodeJS.Timeout;
  messages: string[];
}

@Injectable()
export class AiAgentService implements OnModuleInit {
  private readonly logger = createLogger('AiAgentService');
  private messageService?: MessageService;
  private readonly debounceMap = new Map<string, DebounceEntry>();

  constructor(
    @InjectRepository(SessionAiConfig, 'data')
    private readonly configRepository: Repository<SessionAiConfig>,
    @InjectRepository(Message, 'data')
    private readonly messageRepository: Repository<Message>,
    @Optional()
    private readonly moduleRef?: ModuleRef,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.ensureTable();
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
          createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
          updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `).catch(() => {});

      await this.configRepository.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_session_ai_config_session ON session_ai_configs(sessionId)
      `).catch(() => {});
    } catch (err) {
      this.logger.warn('Failed to run session_ai_configs ensureTable migration', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async getConfig(sessionId: string): Promise<SessionAiConfig> {
    let config = await this.configRepository.findOne({ where: { sessionId } });
    if (!config) {
      config = this.configRepository.create({
        sessionId,
        enabled: false,
        provider: 'openrouter',
        apiKey: null,
        model: 'deepseek/deepseek-chat',
        baseUrl: null,
        systemPrompt: 'Eres un asistente virtual amable y profesional. Responde de forma concisa y útil a los clientes.',
        temperature: 0.7,
        maxTokens: 400,
        humanTakeoverMinutes: 30,
        debounceSeconds: 3,
      });
      try {
        config = await this.configRepository.save(config);
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

    return this.configRepository.save(config);
  }

  /**
   * Evaluates inbound messages and triggers AI response under strict privacy rules:
   * 1. ONLY private 1:1 chats (@s.whatsapp.net / @c.us).
   * 2. NEVER in groups (@g.us).
   * 3. NEVER for status broadcasts or newsletters.
   * 4. NEVER for messages sent by ourselves (fromMe).
   * 5. Freshness gate: skips stale messages (> 180s old).
   * 6. Human takeover gate: silences AI if human replied recently.
   * 7. Debounce gate: buffers rapid-fire customer messages.
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

      // Freshness gate: ignore messages older than 3 minutes
      const timestamp = typeof message.timestamp === 'number' ? message.timestamp : null;
      if (timestamp !== null && Date.now() / 1000 - timestamp > 180) {
        return;
      }

      const text = typeof message.body === 'string' ? message.body.trim() : '';
      if (!text) return; // Only process messages with text content for now

      // Load session config
      const config = await this.configRepository.findOne({ where: { sessionId } });
      if (!config || !config.enabled || !config.apiKey || !config.systemPrompt) {
        return;
      }

      // Human takeover check: did the human operator reply in this chat recently?
      const humanMinutes = config.humanTakeoverMinutes ?? 30;
      if (humanMinutes > 0) {
        const cutoff = new Date(Date.now() - humanMinutes * 60 * 1000);
        const recentHumanMsg = await this.messageRepository.findOne({
          where: {
            sessionId,
            chatId: rawChatId,
            direction: MessageDirection.OUTGOING,
          },
          order: { createdAt: 'DESC' },
        });

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
      const bufferKey = `${sessionId}:${rawChatId}`;
      const debounceDelay = (config.debounceSeconds || 3) * 1000;

      const existing = this.debounceMap.get(bufferKey);
      if (existing) {
        clearTimeout(existing.timer);
        existing.messages.push(text);
        existing.timer = setTimeout(() => {
          this.debounceMap.delete(bufferKey);
          void this.executeAiReply(sessionId, rawChatId, config, existing.messages);
        }, debounceDelay);
      } else {
        const entry: DebounceEntry = {
          messages: [text],
          timer: setTimeout(() => {
            this.debounceMap.delete(bufferKey);
            void this.executeAiReply(sessionId, rawChatId, config, entry.messages);
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

  private async executeAiReply(
    sessionId: string,
    chatId: string,
    config: SessionAiConfig,
    userMessages: string[],
  ): Promise<void> {
    try {
      const combinedUserMessage = userMessages.join('\n');

      // Fetch recent message history (last 8 messages) for conversational memory
      const historyRows = await this.messageRepository.find({
        where: { sessionId, chatId },
        order: { createdAt: 'DESC' },
        take: 8,
      });
      historyRows.reverse();

      const messagesForLlm: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
        { role: 'system', content: config.systemPrompt || 'Eres un asistente útil.' },
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

      const replyText = await this.callLlm(config, messagesForLlm);
      if (!replyText || !replyText.trim()) return;

      const messageService = this.resolveMessageService();
      if (!messageService) {
        this.logger.warn('MessageService not available to send AI reply', { sessionId });
        return;
      }

      // Send the reply
      await messageService.sendText(sessionId, {
        chatId,
        text: replyText.trim(),
      });

      this.logger.log(`AI Agent replied successfully to ${chatId}`, {
        sessionId,
        model: config.model,
        chars: replyText.length,
      });
    } catch (err) {
      this.logger.error(
        `Failed to execute AI reply for ${sessionId}/${chatId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * Test prompt simulator endpoint: allows testing provider, model and prompt
   * without sending any message to WhatsApp.
   */
  async testPrompt(dto: TestAiPromptDto): Promise<{ reply: string; durationMs: number }> {
    const start = Date.now();
    const config: Partial<SessionAiConfig> = {
      provider: dto.provider,
      apiKey: dto.apiKey,
      model: dto.model,
      baseUrl: dto.baseUrl,
      systemPrompt: dto.systemPrompt,
      temperature: dto.temperature ?? 0.7,
      maxTokens: dto.maxTokens ?? 400,
    };

    const messages = [
      { role: 'system' as const, content: dto.systemPrompt },
      { role: 'user' as const, content: dto.userMessage },
    ];

    const reply = await this.callLlm(config as SessionAiConfig, messages);
    const durationMs = Date.now() - start;
    return { reply, durationMs };
  }

  private async callLlm(
    config: SessionAiConfig,
    messages: Array<{ role: string; content: string }>,
  ): Promise<string> {
    const provider = config.provider || 'openrouter';
    const apiKey = config.apiKey?.trim();
    if (!apiKey) {
      throw new Error(`API key is required for provider ${provider}`);
    }

    let endpoint = 'https://openrouter.ai/api/v1/chat/completions';
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    };

    if (provider === 'openrouter') {
      endpoint = 'https://openrouter.ai/api/v1/chat/completions';
      headers['HTTP-Referer'] = 'https://github.com/agrolara/autopublicador-whatsapp';
      headers['X-Title'] = 'OpenWA AI Agent';
    } else if (provider === 'openai') {
      endpoint = 'https://api.openai.com/v1/chat/completions';
    } else if (provider === 'gemini') {
      // Google Gemini supports OpenAI-compatible chat completions endpoint
      endpoint = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
    } else if (provider === 'custom') {
      if (!config.baseUrl) {
        throw new Error('Base URL is required for custom AI provider');
      }
      const base = config.baseUrl.replace(/\/+$/, '');
      endpoint = base.endsWith('/chat/completions') ? base : `${base}/chat/completions`;
    }

    const payload = {
      model: config.model || 'deepseek/deepseek-chat',
      messages,
      temperature: config.temperature ?? 0.7,
      max_tokens: config.maxTokens ?? 400,
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 35000);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        throw new Error(`LLM provider returned status ${response.status}: ${errorText.slice(0, 300)}`);
      }

      const json = await response.json() as any;
      const reply = json?.choices?.[0]?.message?.content;
      if (typeof reply !== 'string') {
        throw new Error('LLM provider response missing message content');
      }
      return reply;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private resolveMessageService(): MessageService | undefined {
    if (!this.messageService && this.moduleRef) {
      try {
        const { MessageService: Svc } = require('../message/message.service');
        this.messageService = this.moduleRef.get(Svc, { strict: false });
      } catch (err) {
        this.logger.warn('Could not resolve MessageService via ModuleRef', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    return this.messageService;
  }
}
