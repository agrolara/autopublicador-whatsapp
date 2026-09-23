import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiUsageLog, AiTelemetryProvider, AiServiceType } from './entities/ai-usage-log.entity';
import { AiBudgetConfig } from './entities/ai-budget-config.entity';
import { SessionAiConfig } from '../ai-agent/entities/session-ai-config.entity';
import { RadarSetting } from '../radar-lead/entities/radar-setting.entity';
import { RadarLeadLog } from '../radar-lead/entities/radar-lead-log.entity';
import {
  AiBalanceSummaryDto,
  UpdateAiBudgetDto,
  QueryAiLogsDto,
  OpenRouterBalanceInfo,
  GroqBalanceInfo,
  TypeSafeBalanceInfo,
} from './dto/ai-telemetry.dto';

const DEFAULT_TYPESAFE_API_KEY =
  'apikey_2199a480d31c3450450c8efa2ecc4c6d9d0d_6c18d62803e10160629944a9079e8ffcf825fa1f40caba0ebeea8e1fcfd57e5b';

@Injectable()
export class AiTelemetryService implements OnModuleInit {
  private readonly logger = new Logger(AiTelemetryService.name);

  constructor(
    @InjectRepository(AiUsageLog, 'data')
    private readonly usageLogsRepo: Repository<AiUsageLog>,
    @InjectRepository(AiBudgetConfig, 'data')
    private readonly budgetConfigRepo: Repository<AiBudgetConfig>,
    @InjectRepository(SessionAiConfig, 'data')
    private readonly sessionAiConfigRepo: Repository<SessionAiConfig>,
    @InjectRepository(RadarSetting, 'data')
    private readonly radarSettingsRepo: Repository<RadarSetting>,
    @InjectRepository(RadarLeadLog, 'data')
    private readonly radarLeadLogsRepo: Repository<RadarLeadLog>,
  ) {}

  async onModuleInit() {
    await this.ensureTables();
  }

  private async ensureTables() {
    try {
      await this.budgetConfigRepo.query(`
        CREATE TABLE IF NOT EXISTS ai_budget_configs (
          id VARCHAR(32) PRIMARY KEY DEFAULT 'default',
          groqInitialBalance FLOAT NOT NULL DEFAULT 5.0,
          typesafeInitialBalance FLOAT NOT NULL DEFAULT 5.0,
          openrouterInitialBalance FLOAT NOT NULL DEFAULT 10.0,
          costAlertThresholdUsd FLOAT NOT NULL DEFAULT 1.0,
          openrouterApiKeyOverride VARCHAR(255) NULL,
          groqApiKeyOverride VARCHAR(255) NULL,
          typesafeApiKeyOverride VARCHAR(255) NULL,
          updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `).catch(() => {});

      await this.usageLogsRepo.query(`
        CREATE TABLE IF NOT EXISTS ai_usage_logs (
          id VARCHAR(36) PRIMARY KEY,
          provider VARCHAR(32) NOT NULL,
          serviceType VARCHAR(32) NOT NULL,
          model VARCHAR(128) NOT NULL,
          sessionId VARCHAR(64) NULL,
          promptTokens INT NOT NULL DEFAULT 0,
          completionTokens INT NOT NULL DEFAULT 0,
          totalTokens INT NOT NULL DEFAULT 0,
          audioSeconds FLOAT NOT NULL DEFAULT 0.0,
          costUsd FLOAT NOT NULL DEFAULT 0.0,
          success BOOLEAN NOT NULL DEFAULT 1,
          errorDetails TEXT NULL,
          createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `).catch(() => {});
    } catch (err) {
      this.logger.warn('Could not auto-create telemetry tables (may already exist)', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /**
   * Retrieves or creates default budget config.
   */
  async getBudgetConfig(): Promise<AiBudgetConfig> {
    let config = await this.budgetConfigRepo.findOne({ where: { id: 'default' } });
    if (!config) {
      config = this.budgetConfigRepo.create({
        id: 'default',
        groqInitialBalance: 5.0,
        typesafeInitialBalance: 5.0,
        openrouterInitialBalance: 10.0,
        costAlertThresholdUsd: 1.0,
      });
      await this.budgetConfigRepo.save(config);
    }
    return config;
  }

  /**
   * Updates budget and initial balance settings.
   */
  async updateBudget(dto: UpdateAiBudgetDto): Promise<AiBudgetConfig> {
    const config = await this.getBudgetConfig();
    if (dto.groqInitialBalance !== undefined) config.groqInitialBalance = dto.groqInitialBalance;
    if (dto.typesafeInitialBalance !== undefined) config.typesafeInitialBalance = dto.typesafeInitialBalance;
    if (dto.openrouterInitialBalance !== undefined) config.openrouterInitialBalance = dto.openrouterInitialBalance;
    if (dto.costAlertThresholdUsd !== undefined) config.costAlertThresholdUsd = dto.costAlertThresholdUsd;
    if (dto.openrouterApiKeyOverride !== undefined) config.openrouterApiKeyOverride = dto.openrouterApiKeyOverride;
    if (dto.groqApiKeyOverride !== undefined) config.groqApiKeyOverride = dto.groqApiKeyOverride;
    if (dto.typesafeApiKeyOverride !== undefined) config.typesafeApiKeyOverride = dto.typesafeApiKeyOverride;
    return this.budgetConfigRepo.save(config);
  }

  /**
   * Records a single AI usage event in the database.
   */
  async recordUsage(params: {
    provider: AiTelemetryProvider;
    serviceType: AiServiceType;
    model: string;
    sessionId?: string | null;
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
    audioSeconds?: number;
    costUsd?: number;
    success?: boolean;
    errorDetails?: string | null;
  }): Promise<AiUsageLog> {
    const promptTokens = params.promptTokens || 0;
    const completionTokens = params.completionTokens || 0;
    const totalTokens = params.totalTokens || (promptTokens + completionTokens);
    const audioSeconds = params.audioSeconds || 0;

    let costUsd = params.costUsd;
    if (costUsd === undefined) {
      costUsd = this.estimateCost(params.provider, params.model, {
        promptTokens,
        completionTokens,
        audioSeconds,
      });
    }

    const log = this.usageLogsRepo.create({
      provider: params.provider,
      serviceType: params.serviceType,
      model: params.model,
      sessionId: params.sessionId || null,
      promptTokens,
      completionTokens,
      totalTokens,
      audioSeconds,
      costUsd,
      success: params.success !== false,
      errorDetails: params.errorDetails || null,
    });

    return this.usageLogsRepo.save(log);
  }

  /**
   * Estimates cost in USD according to provider and model.
   */
  private estimateCost(
    provider: AiTelemetryProvider,
    model: string,
    usage: { promptTokens: number; completionTokens: number; audioSeconds: number },
  ): number {
    if (provider === 'openrouter') {
      const lowerModel = (model || '').toLowerCase();
      if (lowerModel.includes('deepseek')) {
        // DeepSeek V3/Chat on OpenRouter: ~$0.14/1M input, ~$0.28/1M output
        return (usage.promptTokens * 0.14 + usage.completionTokens * 0.28) / 1_000_000;
      }
      if (lowerModel.includes('llama-3.3-70b')) {
        // Llama 3.3 70B on OpenRouter: ~$0.12/1M input, ~$0.30/1M output
        return (usage.promptTokens * 0.12 + usage.completionTokens * 0.30) / 1_000_000;
      }
      // General fallback average: ~$0.20 per 1M tokens
      return ((usage.promptTokens + usage.completionTokens) * 0.20) / 1_000_000;
    }

    if (provider === 'groq') {
      const lowerModel = (model || '').toLowerCase();
      if (lowerModel.includes('turbo')) {
        // Whisper Large v3 Turbo: $0.04 per hour
        return (usage.audioSeconds / 3600) * 0.04;
      }
      // Whisper Large v3: $0.111 per hour
      return (usage.audioSeconds / 3600) * 0.111;
    }

    if (provider === 'typesafe') {
      // TypeSafe System One (jev-latest): ~$0.0025 per evaluation
      return 0.0025;
    }

    return 0.0;
  }

  /**
   * Consolidated AI balances across OpenRouter, Groq, and TypeSafe.
   */
  async getBalances(): Promise<AiBalanceSummaryDto> {
    const budgetConfig = await this.getBudgetConfig();

    const [openrouterInfo, groqInfo, typesafeInfo] = await Promise.all([
      this.getOpenRouterBalance(budgetConfig),
      this.getGroqBalance(budgetConfig),
      this.getTypeSafeBalance(budgetConfig),
    ]);

    const threshold = budgetConfig.costAlertThresholdUsd || 1.0;
    const alertMessages: string[] = [];

    if (openrouterInfo.status === 'connected' && openrouterInfo.remainingCredits <= threshold) {
      alertMessages.push(
        `OpenRouter: Saldo bajo ($${openrouterInfo.remainingCredits.toFixed(2)} USD restantes). Considera recargar en openrouter.ai.`,
      );
    }
    if (groqInfo.status === 'connected' && groqInfo.remainingBalanceUsd <= threshold) {
      alertMessages.push(
        `Groq Whisper: Saldo restante estimado bajo ($${groqInfo.remainingBalanceUsd.toFixed(2)} USD restantes).`,
      );
    }
    if (typesafeInfo.status === 'connected' && typesafeInfo.remainingBalanceUsd <= threshold) {
      alertMessages.push(
        `TypeSafe Jevs: Saldo restante estimado bajo ($${typesafeInfo.remainingBalanceUsd.toFixed(2)} USD restantes).`,
      );
    }

    const totalRemaining =
      (openrouterInfo.status === 'connected' ? openrouterInfo.remainingCredits : 0) +
      groqInfo.remainingBalanceUsd +
      typesafeInfo.remainingBalanceUsd;

    const totalSpent =
      (openrouterInfo.status === 'connected' ? openrouterInfo.totalUsage : openrouterInfo.localEstimatedCostUsd) +
      groqInfo.estimatedCostUsd +
      typesafeInfo.estimatedCostUsd;

    const totalRequests =
      openrouterInfo.localRequestsCount +
      groqInfo.transcriptionsCount +
      typesafeInfo.evaluationsCount;

    return {
      combined: {
        totalRemainingBalanceUsd: Number(totalRemaining.toFixed(4)),
        totalSpentUsd: Number(totalSpent.toFixed(4)),
        totalRequestsCount: totalRequests,
        hasLowBalanceAlert: alertMessages.length > 0,
        alertMessages,
      },
      openrouter: openrouterInfo,
      groq: groqInfo,
      typesafe: typesafeInfo,
      thresholdUsd: threshold,
    };
  }

  /**
   * Fetches OpenRouter live balance and aggregates local token stats.
   */
  private async getOpenRouterBalance(budgetConfig: AiBudgetConfig): Promise<OpenRouterBalanceInfo> {
    // 1. Locate active OpenRouter API key
    let key = budgetConfig.openrouterApiKeyOverride || process.env.OPENROUTER_API_KEY || '';
    if (!key) {
      const sessionConfig = await this.sessionAiConfigRepo.findOne({
        where: { provider: 'openrouter' },
      });
      if (sessionConfig?.apiKey) {
        key = sessionConfig.apiKey.trim();
      }
    }
    if (!key) {
      // Check any session config with an apiKey starting with 'sk-or'
      const configs = await this.sessionAiConfigRepo.find();
      const orConfig = configs.find(c => c.apiKey && c.apiKey.startsWith('sk-or'));
      if (orConfig?.apiKey) key = orConfig.apiKey.trim();
    }

    // Local usage aggregation
    let localRequests = 0;
    let localTokens = 0;
    let localCost = 0;
    try {
      const q = await this.usageLogsRepo
        .createQueryBuilder('log')
        .select('COUNT(log.id)', 'count')
        .addSelect('SUM(log.totalTokens)', 'tokens')
        .addSelect('SUM(log.costUsd)', 'cost')
        .where('log.provider = :p', { p: 'openrouter' })
        .getRawOne();
      localRequests = Number(q?.count || 0);
      localTokens = Number(q?.tokens || 0);
      localCost = Number(q?.cost || 0);
    } catch {}

    if (!key) {
      return {
        status: 'unconfigured',
        isLiveApi: false,
        totalCredits: budgetConfig.openrouterInitialBalance || 10.0,
        totalUsage: Number(localCost.toFixed(4)),
        remainingCredits: Math.max(0, (budgetConfig.openrouterInitialBalance || 10.0) - localCost),
        localRequestsCount: localRequests,
        localTokensCount: localTokens,
        localEstimatedCostUsd: Number(localCost.toFixed(4)),
        lastChecked: new Date().toISOString(),
      };
    }

    // 2. Query live OpenRouter Credits API
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 6000);

      const [creditsRes, authKeyRes] = await Promise.all([
        fetch('https://openrouter.ai/api/v1/credits', {
          headers: { Authorization: `Bearer ${key}` },
          signal: controller.signal,
        }).catch(err => ({ ok: false, status: 500, statusText: err.message, json: async () => ({}) } as any)),
        fetch('https://openrouter.ai/api/v1/auth/key', {
          headers: { Authorization: `Bearer ${key}` },
          signal: controller.signal,
        }).catch(err => ({ ok: false, status: 500, statusText: err.message, json: async () => ({}) } as any)),
      ]);

      clearTimeout(timeout);

      if (creditsRes.ok) {
        const creditsData = await creditsRes.json();
        const totalCredits = Number(creditsData?.data?.total_credits || 0);
        const totalUsage = Number(creditsData?.data?.total_usage || 0);
        const remaining = Math.max(0, totalCredits - totalUsage);

        let keyLabel: string | undefined;
        let limit: number | null = null;
        let isFreeTier = false;
        let rateLimit: any = undefined;

        if (authKeyRes.ok) {
          const authData = await authKeyRes.json();
          keyLabel = authData?.data?.label;
          limit = authData?.data?.limit;
          isFreeTier = authData?.data?.is_free_tier;
          rateLimit = authData?.data?.rate_limit;
        }

        return {
          status: 'connected',
          isLiveApi: true,
          totalCredits: Number(totalCredits.toFixed(4)),
          totalUsage: Number(totalUsage.toFixed(4)),
          remainingCredits: Number(remaining.toFixed(4)),
          keyLabel,
          limit,
          isFreeTier,
          rateLimit,
          localRequestsCount: localRequests,
          localTokensCount: localTokens,
          localEstimatedCostUsd: Number(localCost.toFixed(4)),
          lastChecked: new Date().toISOString(),
        };
      }

      // If credits failed (e.g. invalid key or network issue)
      return {
        status: 'error',
        isLiveApi: false,
        totalCredits: budgetConfig.openrouterInitialBalance || 10.0,
        totalUsage: Number(localCost.toFixed(4)),
        remainingCredits: Math.max(0, (budgetConfig.openrouterInitialBalance || 10.0) - localCost),
        localRequestsCount: localRequests,
        localTokensCount: localTokens,
        localEstimatedCostUsd: Number(localCost.toFixed(4)),
        lastChecked: new Date().toISOString(),
        error: `OpenRouter HTTP ${creditsRes.status}: ${creditsRes.statusText}`,
      };
    } catch (err: any) {
      return {
        status: 'error',
        isLiveApi: false,
        totalCredits: budgetConfig.openrouterInitialBalance || 10.0,
        totalUsage: Number(localCost.toFixed(4)),
        remainingCredits: Math.max(0, (budgetConfig.openrouterInitialBalance || 10.0) - localCost),
        localRequestsCount: localRequests,
        localTokensCount: localTokens,
        localEstimatedCostUsd: Number(localCost.toFixed(4)),
        lastChecked: new Date().toISOString(),
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * Computes Groq Whisper audio transcriptions and estimated cost.
   */
  private async getGroqBalance(budgetConfig: AiBudgetConfig): Promise<GroqBalanceInfo> {
    let hasKey = Boolean(budgetConfig.groqApiKeyOverride || process.env.GROQ_API_KEY);
    if (!hasKey) {
      const s = await this.sessionAiConfigRepo.findOne({
        where: { transcribeAudio: true },
      });
      if (s?.groqApiKey) hasKey = true;
    }

    let transcriptionsCount = 0;
    let audioSeconds = 0;
    let estimatedCost = 0;
    let lastActivity: string | undefined;

    try {
      const q = await this.usageLogsRepo
        .createQueryBuilder('log')
        .select('COUNT(log.id)', 'count')
        .addSelect('SUM(log.audioSeconds)', 'seconds')
        .addSelect('SUM(log.costUsd)', 'cost')
        .addSelect('MAX(log.createdAt)', 'lastDate')
        .where('log.provider = :p', { p: 'groq' })
        .getRawOne();

      transcriptionsCount = Number(q?.count || 0);
      audioSeconds = Number(q?.seconds || 0);
      estimatedCost = Number(q?.cost || 0);
      if (q?.lastDate) lastActivity = new Date(q.lastDate).toISOString();
    } catch {}

    const initial = budgetConfig.groqInitialBalance || 5.0;
    const remaining = Math.max(0, initial - estimatedCost);

    return {
      status: hasKey ? 'connected' : 'unconfigured',
      initialBalance: initial,
      estimatedCostUsd: Number(estimatedCost.toFixed(4)),
      remainingBalanceUsd: Number(remaining.toFixed(4)),
      transcriptionsCount,
      audioSecondsCount: Math.round(audioSeconds),
      audioMinutesCount: Number((audioSeconds / 60).toFixed(1)),
      ratePerMinuteUsd: 0.00067, // Whisper turbo rate
      freeTierDailyEstimate: {
        maxAudiosPerDay: 2000,
        usedToday: transcriptionsCount, // can be filtered by day if needed
      },
      lastActivity,
    };
  }

  /**
   * Computes TypeSafe (Jevs) radar evaluations and estimated cost.
   */
  private async getTypeSafeBalance(budgetConfig: AiBudgetConfig): Promise<TypeSafeBalanceInfo> {
    let hasKey = Boolean(budgetConfig.typesafeApiKeyOverride || process.env.TYPESAFE_API_KEY);
    if (!hasKey) {
      const s = await this.radarSettingsRepo.findOne({ where: { id: 'default' } });
      if (s?.typesafeApiKey) hasKey = true;
      else hasKey = true; // DEFAULT_TYPESAFE_API_KEY is available
    }

    let evaluationsCount = 0;
    let approvedLeadsCount = 0;
    let discardedAdsCount = 0;
    let lastActivity: string | undefined;

    try {
      // 1. Check radar_lead_logs
      const q = await this.radarLeadLogsRepo
        .createQueryBuilder('log')
        .select('COUNT(log.id)', 'total')
        .addSelect("SUM(CASE WHEN log.status = 'DISPATCHED' THEN 1 ELSE 0 END)", 'approved')
        .addSelect("SUM(CASE WHEN log.status = 'DISCARDED_AI' THEN 1 ELSE 0 END)", 'discarded')
        .addSelect('MAX(log.createdAt)', 'lastDate')
        .where('log.aiEvaluated = :eval', { eval: true })
        .getRawOne();

      evaluationsCount = Number(q?.total || 0);
      approvedLeadsCount = Number(q?.approved || 0);
      discardedAdsCount = Number(q?.discarded || 0);
      if (q?.lastDate) lastActivity = new Date(q.lastDate).toISOString();

      // 2. Also check ai_usage_logs if any
      const qUsage = await this.usageLogsRepo
        .createQueryBuilder('log')
        .select('COUNT(log.id)', 'total')
        .where('log.provider = :p', { p: 'typesafe' })
        .getRawOne();
      const usageCount = Number(qUsage?.total || 0);
      if (usageCount > evaluationsCount) evaluationsCount = usageCount;
    } catch {}

    const ratePerEval = 0.0025; // ~$0.0025 USD por evaluación
    const estimatedCost = evaluationsCount * ratePerEval;
    const initial = budgetConfig.typesafeInitialBalance || 5.0;
    const remaining = Math.max(0, initial - estimatedCost);

    return {
      status: hasKey ? 'connected' : 'unconfigured',
      initialBalance: initial,
      estimatedCostUsd: Number(estimatedCost.toFixed(4)),
      remainingBalanceUsd: Number(remaining.toFixed(4)),
      evaluationsCount,
      approvedLeadsCount,
      discardedAdsCount,
      ratePerEvaluationUsd: ratePerEval,
      lastActivity,
    };
  }

  /**
   * Retrieves recent AI usage logs.
   */
  async getLogs(query: QueryAiLogsDto): Promise<AiUsageLog[]> {
    const qb = this.usageLogsRepo.createQueryBuilder('log');

    if (query.provider) {
      qb.andWhere('log.provider = :provider', { provider: query.provider });
    }
    if (query.serviceType) {
      qb.andWhere('log.serviceType = :serviceType', { serviceType: query.serviceType });
    }

    qb.orderBy('log.createdAt', 'DESC');
    qb.take(query.limit || 50);

    return qb.getMany();
  }

  /**
   * Clears telemetry logs.
   */
  async clearLogs(): Promise<{ success: boolean }> {
    await this.usageLogsRepo.clear();
    return { success: true };
  }
}
