import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Poll } from './entities/poll.entity';
import { PollVote } from './entities/poll-vote.entity';
import { CreatePollDto, UpdatePollDto, PollDetailResponse, PollOptionResult } from './dto/poll.dto';
import { EngineRegistry } from '../../engine/engine-registry.service';

interface PendingOtherPrompt {
  pollId: string;
  sessionId: string;
  chatId: string;
  expiresAt: number;
}

@Injectable()
export class PollService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PollService.name);
  private citationInterval?: NodeJS.Timeout;
  private readonly pendingOtherResponses = new Map<string, PendingOtherPrompt>();

  constructor(
    @InjectRepository(Poll, 'data')
    private readonly pollRepo: Repository<Poll>,
    @InjectRepository(PollVote, 'data')
    private readonly voteRepo: Repository<PollVote>,
    private readonly engines: EngineRegistry,
  ) {}

  async onModuleInit() {
    await this.ensureTables();

    // Check every 30 seconds for scheduled poll citations (America/Santiago)
    this.citationInterval = setInterval(() => {
      this.processScheduledCitations().catch(err => {
        this.logger.error('Error in poll citation scheduler:', err?.message || err);
      });
    }, 30000);
    this.logger.log('PollService initialized with automatic Chile citation scheduler active (30s interval)');
  }

  private async ensureTables(): Promise<void> {
    try {
      const isPostgres = this.pollRepo.metadata.connection.options.type === 'postgres';
      if (isPostgres) {
        await this.pollRepo.query(`
          CREATE TABLE IF NOT EXISTS polls (
            id VARCHAR(36) PRIMARY KEY,
            "sessionId" VARCHAR(100) NOT NULL,
            "chatId" VARCHAR(150) NOT NULL,
            "chatName" VARCHAR(255),
            "messageId" VARCHAR(255) NOT NULL,
            question TEXT NOT NULL,
            options TEXT NOT NULL,
            "allowMultipleAnswers" BOOLEAN NOT NULL DEFAULT false,
            "otherOptionKeyword" VARCHAR(50) NOT NULL DEFAULT 'otras',
            status VARCHAR(20) NOT NULL DEFAULT 'active',
            "citationEnabled" BOOLEAN NOT NULL DEFAULT false,
            "baseTime" VARCHAR(10) NOT NULL DEFAULT '10:00',
            "citationTimes" TEXT,
            "endDate" TIMESTAMP,
            "reminderMessage" TEXT,
            "lastCitedAt" TIMESTAMP,
            "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
          );
        `).catch((err: any) => this.logger.warn('polls table check error', { error: err?.message }));

        await this.voteRepo.query(`
          CREATE TABLE IF NOT EXISTS poll_votes (
            id VARCHAR(36) PRIMARY KEY,
            "pollId" VARCHAR(36) NOT NULL,
            "voterJid" VARCHAR(150) NOT NULL,
            "voterPhone" VARCHAR(50),
            "voterName" VARCHAR(255),
            "selectedOptions" TEXT NOT NULL,
            "hasOther" BOOLEAN NOT NULL DEFAULT false,
            "customText" TEXT,
            "customTextReceivedAt" TIMESTAMP,
            "votedAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
          );
          ALTER TABLE poll_votes ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
        `).catch((err: any) => this.logger.warn('poll_votes table check error', { error: err?.message }));
      } else {
        await this.pollRepo.query(`
          CREATE TABLE IF NOT EXISTS polls (
            id TEXT PRIMARY KEY,
            sessionId TEXT NOT NULL,
            chatId TEXT NOT NULL,
            chatName TEXT,
            messageId TEXT NOT NULL,
            question TEXT NOT NULL,
            options TEXT NOT NULL,
            allowMultipleAnswers INTEGER NOT NULL DEFAULT 0,
            otherOptionKeyword TEXT NOT NULL DEFAULT 'otras',
            status TEXT NOT NULL DEFAULT 'active',
            citationEnabled INTEGER NOT NULL DEFAULT 0,
            baseTime TEXT NOT NULL DEFAULT '10:00',
            citationTimes TEXT,
            endDate DATETIME,
            reminderMessage TEXT,
            lastCitedAt DATETIME,
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
          );
        `).catch((err: any) => this.logger.warn('polls sqlite table check', { error: err?.message }));

        await this.voteRepo.query(`
          CREATE TABLE IF NOT EXISTS poll_votes (
            id TEXT PRIMARY KEY,
            pollId TEXT NOT NULL,
            voterJid TEXT NOT NULL,
            voterPhone TEXT,
            voterName TEXT,
            selectedOptions TEXT NOT NULL,
            hasOther INTEGER NOT NULL DEFAULT 0,
            customText TEXT,
            customTextReceivedAt DATETIME,
            votedAt DATETIME DEFAULT CURRENT_TIMESTAMP
          );
        `).catch((err: any) => this.logger.warn('poll_votes sqlite table check', { error: err?.message }));
      }
      this.logger.log('Poll tables verified / created successfully.');
    } catch (err: any) {
      this.logger.warn(`Could not verify poll tables: ${err?.message}`);
    }
  }

  onModuleDestroy() {
    if (this.citationInterval) {
      clearInterval(this.citationInterval);
    }
    this.pendingOtherResponses.clear();
  }

  /**
   * Helper to get current date/time formatted in Chile timezone (America/Santiago)
   */
  private getChileDateTime(): { date: Date; timeHHmm: string } {
    const santiagoStr = new Date().toLocaleString('en-US', { timeZone: 'America/Santiago' });
    const date = new Date(santiagoStr);
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return { date, timeHHmm: `${hours}:${minutes}` };
  }

  /**
   * Creates a new native WhatsApp poll and broadcasts it to the target chat
   */
  async createPoll(dto: CreatePollDto): Promise<Poll> {
    const engine = this.engines.get(dto.sessionId);
    if (!engine) {
      throw new BadRequestException(`Sesión de WhatsApp "${dto.sessionId}" no está activa o conectada.`);
    }

    // Send the poll through WhatsApp Engine
    const cleanOptions = dto.options.map(o => o.trim()).filter(Boolean);
    if (cleanOptions.length < 2 || cleanOptions.length > 12) {
      throw new BadRequestException('Una encuesta nativa requiere entre 2 y 12 opciones de respuesta.');
    }

    const sendResult = await engine.sendPollMessage(dto.chatId, {
      name: dto.question.trim(),
      options: cleanOptions,
      allowMultipleAnswers: dto.allowMultipleAnswers ?? false,
    });

    const messageId = sendResult.id || (sendResult as any)?.messageId || `poll-${Date.now()}`;

    // Resolve chatName if not provided
    let chatName = dto.chatName || null;
    if (!chatName && dto.chatId.includes('@g.us')) {
      try {
        const groupInfo = await engine.getGroupInfo(dto.chatId);
        if (groupInfo?.name) chatName = groupInfo.name;
      } catch {
        // ignore
      }
    }

    const poll = this.pollRepo.create({
      sessionId: dto.sessionId,
      chatId: dto.chatId,
      chatName,
      messageId,
      question: dto.question.trim(),
      options: cleanOptions,
      allowMultipleAnswers: dto.allowMultipleAnswers ?? false,
      otherOptionKeyword: (dto.otherOptionKeyword || 'otras').toLowerCase().trim(),
      status: 'active',
      citationEnabled: dto.citationEnabled ?? false,
      baseTime: dto.baseTime || '10:00',
      citationTimes: Array.isArray(dto.citationTimes) ? dto.citationTimes.slice(0, 2) : [],
      endDate: dto.endDate ? new Date(dto.endDate) : null,
      reminderMessage: dto.reminderMessage?.trim() || '📢 ¡Recordatorio! Recuerda participar y dejar tu voto en la encuesta de arriba ☝️',
      lastCitedAt: null,
    });

    const saved = await this.pollRepo.save(poll);
    this.logger.log(`Created and sent poll ${saved.id} (msg: ${messageId}) in ${saved.chatId}`);
    return saved;
  }

  /**
   * Returns list of polls with summarized vote counts and percentages
   */
  async getPolls(sessionId?: string): Promise<PollDetailResponse[]> {
    const query = this.pollRepo.createQueryBuilder('poll')
      .leftJoinAndSelect('poll.votes', 'vote')
      .orderBy('poll.createdAt', 'DESC');

    if (sessionId) {
      query.andWhere('poll.sessionId = :sessionId', { sessionId });
    }

    const polls = await query.getMany();
    return polls.map(p => this.formatPollDetail(p));
  }

  /**
   * Returns single poll detail with full voter records
   */
  async getPollById(id: string): Promise<PollDetailResponse> {
    const poll = await this.pollRepo.findOne({
      where: { id },
      relations: { votes: true },
    });

    if (!poll) {
      throw new NotFoundException(`Encuesta con id ${id} no encontrada.`);
    }

    return this.formatPollDetail(poll);
  }

  /**
   * Updates an existing poll's citation schedule or status
   */
  async updatePoll(id: string, dto: UpdatePollDto): Promise<PollDetailResponse> {
    const poll = await this.pollRepo.findOne({ where: { id }, relations: { votes: true } });
    if (!poll) {
      throw new NotFoundException(`Encuesta con id ${id} no encontrada.`);
    }

    if (dto.status !== undefined) poll.status = dto.status;
    if (dto.citationEnabled !== undefined) poll.citationEnabled = dto.citationEnabled;
    if (dto.baseTime !== undefined) poll.baseTime = dto.baseTime;
    if (dto.citationTimes !== undefined) {
      poll.citationTimes = Array.isArray(dto.citationTimes) ? dto.citationTimes.slice(0, 2) : [];
    }
    if (dto.endDate !== undefined) {
      poll.endDate = dto.endDate ? new Date(dto.endDate) : null;
    }
    if (dto.reminderMessage !== undefined) {
      poll.reminderMessage = dto.reminderMessage;
    }

    await this.pollRepo.save(poll);
    this.logger.log(`Updated poll ${id} (status: ${poll.status}, citations: ${poll.citationEnabled})`);
    return this.formatPollDetail(poll);
  }

  /**
   * Deletes a poll and all associated votes
   */
  async deletePoll(id: string): Promise<boolean> {
    const poll = await this.pollRepo.findOne({ where: { id } });
    if (!poll) {
      throw new NotFoundException(`Encuesta con id ${id} no encontrada.`);
    }
    await this.pollRepo.remove(poll);
    this.logger.log(`Deleted poll ${id}`);
    return true;
  }

  /**
   * Triggers an immediate citation reminder of the poll in WhatsApp
   */
  async citePollNow(id: string): Promise<{ success: boolean; message: string }> {
    const poll = await this.pollRepo.findOne({ where: { id } });
    if (!poll) {
      throw new NotFoundException(`Encuesta con id ${id} no encontrada.`);
    }

    const engine = this.engines.get(poll.sessionId);
    if (!engine) {
      throw new BadRequestException(`La sesión "${poll.sessionId}" no está disponible para citar.`);
    }

    return this.sendCitationMessage(poll, engine);
  }

  /**
   * Dispatches the citation message quoting the poll
   */
  private async sendCitationMessage(poll: Poll, engine: any): Promise<{ success: boolean; message: string }> {
    const reminderText = poll.reminderMessage || '📢 ¡Recordatorio! Recuerda participar y dejar tu voto en la encuesta de arriba ☝️';

    try {
      // First attempt: quote the original poll message ID
      await engine.replyToMessage(poll.chatId, poll.messageId, reminderText);
      poll.lastCitedAt = new Date();
      await this.pollRepo.save(poll);
      this.logger.log(`Cited poll ${poll.id} successfully in ${poll.chatId}`);
      return { success: true, message: 'Encuesta citada con éxito en el chat.' };
    } catch (err: any) {
      // Fallback: If quoting fails because the original message is purged from engine memory,
      // send a prominent reminder message referencing the poll title
      this.logger.warn(`Quoting poll ${poll.messageId} failed (${err?.message}). Sending context reminder.`);
      const fallbackText = `${reminderText}\n\n📊 *Encuesta:* ${poll.question}`;
      await engine.sendTextMessage(poll.chatId, fallbackText);
      poll.lastCitedAt = new Date();
      await this.pollRepo.save(poll);
      return { success: true, message: 'Recordatorio de encuesta enviado al chat.' };
    }
  }

  /**
   * Scheduler routine executed every 30 seconds
   */
  private async processScheduledCitations(): Promise<void> {
    const { date: nowChile, timeHHmm } = this.getChileDateTime();

    const activePolls = await this.pollRepo.find({
      where: { citationEnabled: true, status: 'active' },
    });

    if (activePolls.length === 0) return;

    for (const poll of activePolls) {
      // 1. Check end date
      if (poll.endDate && nowChile > new Date(poll.endDate)) {
        poll.citationEnabled = false;
        poll.status = 'closed';
        await this.pollRepo.save(poll);
        this.logger.log(`Poll ${poll.id} reached end date (${poll.endDate.toISOString()}). Citations disabled.`);
        continue;
      }

      // 2. Check scheduled citation hours: baseTime + citationTimes (max 3 total daily)
      const scheduledTimes = [poll.baseTime, ...(poll.citationTimes || [])].filter(Boolean);

      if (scheduledTimes.includes(timeHHmm)) {
        // Prevent double triggers within the same 10-minute window
        if (poll.lastCitedAt) {
          const diffMs = nowChile.getTime() - new Date(poll.lastCitedAt).getTime();
          if (diffMs < 10 * 60 * 1000) {
            continue;
          }
        }

        const engine = this.engines.get(poll.sessionId);
        if (!engine) {
          this.logger.warn(`Cannot cite poll ${poll.id}: engine for session ${poll.sessionId} is offline.`);
          continue;
        }

        this.logger.log(`Executing scheduled citation for poll "${poll.question}" at ${timeHHmm} (Chile time)`);
        await this.sendCitationMessage(poll, engine);
      }
    }
  }

  /**
   * Registers a poll vote event and triggers Alternativa A if 'Otras' is chosen
   */
  async handlePollVote(event: {
    sessionId: string;
    pollMessageId: string;
    chatId: string;
    voterJid: string;
    selectedOptions: string[];
    voterName?: string;
  }): Promise<void> {
    const poll = await this.pollRepo.findOne({
      where: { messageId: event.pollMessageId },
    });

    if (!poll) return;

    const normalizedVoterJid = event.voterJid.replace(/:\d+@/, '@');
    const phoneMatch = normalizedVoterJid.match(/^(\d+)/);
    const voterPhone = phoneMatch ? `+${phoneMatch[1]}` : null;

    let vote = await this.voteRepo.findOne({
      where: { pollId: poll.id, voterJid: normalizedVoterJid },
    });

    const isOtherSelected = event.selectedOptions.some(opt => {
      const lower = (opt || '').toLowerCase();
      const kw = (poll.otherOptionKeyword || 'otras').toLowerCase();
      return lower.includes(kw) || lower.includes('otra') || lower.includes('otro');
    });

    if (!vote) {
      vote = this.voteRepo.create({
        pollId: poll.id,
        voterJid: normalizedVoterJid,
        voterPhone,
        voterName: event.voterName || null,
        selectedOptions: event.selectedOptions,
        hasOther: isOtherSelected,
        customText: null,
        customTextReceivedAt: null,
      });
    } else {
      vote.selectedOptions = event.selectedOptions;
      vote.hasOther = isOtherSelected;
      if (event.voterName) vote.voterName = event.voterName;
    }

    await this.voteRepo.save(vote);
    this.logger.log(`Vote saved for poll ${poll.id}: voter ${normalizedVoterJid} selected [${event.selectedOptions.join(', ')}] (isOther: ${isOtherSelected})`);

    // ALTERNATIVA A: If user selected 'Otras', prompt them for written suggestion
    if (isOtherSelected && !vote.customText) {
      this.pendingOtherResponses.set(normalizedVoterJid, {
        pollId: poll.id,
        sessionId: event.sessionId,
        chatId: event.chatId,
        expiresAt: Date.now() + 15 * 60 * 1000, // 15 min window
      });

      const engine = this.engines.get(event.sessionId);
      if (engine) {
        const nameGreeting = event.voterName ? `¡Hola ${event.voterName}! ` : '¡Hola! ';
        const promptMsg = `${nameGreeting}Vimos que elegiste la opción *"Otras"* en la encuesta *"${poll.question}"*.\n\n✍️ Por favor, *responde a este mensaje* escribiendo tu opción o sugerencia para que quede registrada en los resultados.`;

        // Send privately or in group depending on chat context
        const targetChat = event.chatId.includes('@g.us') ? normalizedVoterJid : event.chatId;
        try {
          await engine.sendTextMessage(targetChat, promptMsg);
          this.logger.log(`Dispatched 'Otras' prompt to voter ${normalizedVoterJid}`);
        } catch (e: any) {
          this.logger.warn(`Failed to send 'Otras' prompt to ${normalizedVoterJid}:`, e?.message);
        }
      }
    }
  }

  /**
   * Catches inbound text messages from voters who were asked for their 'Otras' input
   */
  async handleInboundMessage(sessionId: string, message: { from: string; author?: string; body: string; fromMe?: boolean }): Promise<boolean> {
    if (message.fromMe || !message.body?.trim()) return false;

    const senderJid = (message.author || message.from || '').replace(/:\d+@/, '@');
    const pending = this.pendingOtherResponses.get(senderJid);

    if (!pending) return false;

    if (Date.now() > pending.expiresAt) {
      this.pendingOtherResponses.delete(senderJid);
      return false;
    }

    const vote = await this.voteRepo.findOne({
      where: { pollId: pending.pollId, voterJid: senderJid },
    });

    if (vote) {
      const customResponse = message.body.trim();
      vote.customText = customResponse;
      vote.customTextReceivedAt = new Date();
      await this.voteRepo.save(vote);
      this.pendingOtherResponses.delete(senderJid);

      this.logger.log(`Captured custom 'Otras' text from ${senderJid} for poll ${pending.pollId}: "${customResponse}"`);

      // Send confirmation
      const engine = this.engines.get(sessionId);
      if (engine) {
        const confirmMsg = `✅ ¡Muchas gracias! Tu respuesta ha sido registrada exitosamente:\n💬 *"${customResponse}"*`;
        engine.sendTextMessage(message.from, confirmMsg).catch(() => undefined);
      }
      return true;
    }

    return false;
  }

  /**
   * Formats a Poll entity with computed statistics
   */
  private formatPollDetail(poll: Poll): PollDetailResponse {
    const votes = poll.votes || [];
    const totalVotes = votes.length;

    // Count votes per option
    const optionCounts: Record<string, number> = {};
    for (const opt of poll.options) {
      optionCounts[opt] = 0;
    }

    for (const v of votes) {
      const selected = Array.isArray(v.selectedOptions) ? v.selectedOptions : [];
      for (const opt of selected) {
        if (optionCounts[opt] !== undefined) {
          optionCounts[opt]++;
        } else {
          // Case-insensitive match fallback
          const matchKey = Object.keys(optionCounts).find(k => k.toLowerCase() === opt.toLowerCase());
          if (matchKey) optionCounts[matchKey]++;
        }
      }
    }

    const optionResults: PollOptionResult[] = poll.options.map(opt => {
      const count = optionCounts[opt] || 0;
      const percentage = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
      return { option: opt, votes: count, percentage };
    });

    const otherResponsesCount = votes.filter(v => !!v.customText).length;

    return {
      id: poll.id,
      sessionId: poll.sessionId,
      chatId: poll.chatId,
      chatName: poll.chatName,
      messageId: poll.messageId,
      question: poll.question,
      options: poll.options,
      allowMultipleAnswers: poll.allowMultipleAnswers,
      status: poll.status,
      citationEnabled: poll.citationEnabled,
      baseTime: poll.baseTime,
      citationTimes: poll.citationTimes || [],
      endDate: poll.endDate ? poll.endDate.toISOString() : null,
      reminderMessage: poll.reminderMessage,
      lastCitedAt: poll.lastCitedAt ? poll.lastCitedAt.toISOString() : null,
      totalVotes,
      optionResults,
      otherResponsesCount,
      votes: votes.map(v => ({
        id: v.id,
        voterJid: v.voterJid,
        voterPhone: v.voterPhone,
        voterName: v.voterName,
        selectedOptions: v.selectedOptions,
        hasOther: v.hasOther,
        customText: v.customText,
        customTextReceivedAt: v.customTextReceivedAt ? v.customTextReceivedAt.toISOString() : null,
        votedAt: v.votedAt ? v.votedAt.toISOString() : poll.createdAt.toISOString(),
      })),
      createdAt: poll.createdAt.toISOString(),
      updatedAt: poll.updatedAt.toISOString(),
    };
  }
}
