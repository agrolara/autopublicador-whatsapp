import { AiTelemetryService } from './ai-telemetry.service';
import { AiUsageLog } from './entities/ai-usage-log.entity';
import { AiBudgetConfig } from './entities/ai-budget-config.entity';

describe('AiTelemetryService - Unit Tests', () => {
  let service: AiTelemetryService;
  let mockUsageRepo: any;
  let mockBudgetRepo: any;
  let mockSessionConfigRepo: any;
  let mockRadarSettingsRepo: any;
  let mockRadarLeadLogsRepo: any;

  beforeEach(() => {
    mockUsageRepo = {
      create: jest.fn((dto) => ({ id: 'mock-uuid', ...dto })),
      save: jest.fn(async (entity) => entity),
      clear: jest.fn().mockResolvedValue(undefined),
      query: jest.fn().mockResolvedValue([]),
      createQueryBuilder: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({
          count: '10',
          tokens: '5000',
          cost: '0.05',
          seconds: '120',
          total: '5',
          approved: '4',
          discarded: '1',
          lastDate: new Date().toISOString(),
        }),
        getMany: jest.fn().mockResolvedValue([
          { id: '1', provider: 'openrouter', costUsd: 0.001 },
          { id: '2', provider: 'groq', costUsd: 0.0005 },
        ]),
      }),
    };

    mockBudgetRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: 'default',
        groqInitialBalance: 5.0,
        typesafeInitialBalance: 5.0,
        openrouterInitialBalance: 10.0,
        costAlertThresholdUsd: 1.0,
      }),
      create: jest.fn((dto) => dto),
      save: jest.fn(async (entity) => entity),
      query: jest.fn().mockResolvedValue([]),
    };

    mockSessionConfigRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      find: jest.fn().mockResolvedValue([]),
    };

    mockRadarSettingsRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: 'default',
        typesafeApiKey: 'test-typesafe-key',
      }),
    };

    mockRadarLeadLogsRepo = {
      createQueryBuilder: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({
          total: '20',
          approved: '15',
          discarded: '5',
          lastDate: new Date().toISOString(),
        }),
      }),
    };

    service = new AiTelemetryService(
      mockUsageRepo,
      mockBudgetRepo,
      mockSessionConfigRepo,
      mockRadarSettingsRepo,
      mockRadarLeadLogsRepo,
    );
  });

  describe('Budget configuration', () => {
    it('returns existing budget config if present', async () => {
      const budget = await service.getBudgetConfig();
      expect(budget.id).toBe('default');
      expect(budget.groqInitialBalance).toBe(5.0);
      expect(budget.typesafeInitialBalance).toBe(5.0);
      expect(budget.openrouterInitialBalance).toBe(10.0);
    });

    it('creates default budget config if not present', async () => {
      mockBudgetRepo.findOne.mockResolvedValueOnce(null);
      const budget = await service.getBudgetConfig();
      expect(mockBudgetRepo.create).toHaveBeenCalled();
      expect(budget.groqInitialBalance).toBe(5.0);
    });

    it('updates budget initial balance values and threshold', async () => {
      const updated = await service.updateBudget({
        groqInitialBalance: 15.0,
        typesafeInitialBalance: 20.0,
        costAlertThresholdUsd: 2.5,
      });

      expect(updated.groqInitialBalance).toBe(15.0);
      expect(updated.typesafeInitialBalance).toBe(20.0);
      expect(updated.costAlertThresholdUsd).toBe(2.5);
      expect(mockBudgetRepo.save).toHaveBeenCalled();
    });
  });

  describe('Usage recording and cost estimation', () => {
    it('records OpenRouter usage and calculates estimated cost for DeepSeek', async () => {
      const logged = await service.recordUsage({
        provider: 'openrouter',
        serviceType: 'chat_llm',
        model: 'deepseek/deepseek-chat',
        sessionId: 'test-session',
        promptTokens: 1000,
        completionTokens: 500,
      });

      expect(mockUsageRepo.create).toHaveBeenCalled();
      expect(mockUsageRepo.save).toHaveBeenCalled();
      expect(logged.provider).toBe('openrouter');
      expect(logged.totalTokens).toBe(1500);
      // Cost: (1000 * 0.14 + 500 * 0.28) / 1,000,000 = (140 + 140) / 1,000,000 = 0.00028
      expect(logged.costUsd).toBeCloseTo(0.00028, 5);
    });

    it('records Groq Whisper usage and calculates estimated cost for turbo', async () => {
      const logged = await service.recordUsage({
        provider: 'groq',
        serviceType: 'audio_stt',
        model: 'whisper-large-v3-turbo',
        audioSeconds: 360, // 0.1 hours -> 0.1 * 0.04 = $0.004
      });

      expect(logged.provider).toBe('groq');
      expect(logged.audioSeconds).toBe(360);
      expect(logged.costUsd).toBeCloseTo(0.004, 5);
    });

    it('records TypeSafe evaluation usage at $0.042 per 1M tokens', async () => {
      const logged = await service.recordUsage({
        provider: 'typesafe',
        serviceType: 'radar_eval',
        model: 'jev-latest',
        promptTokens: 500,
        totalTokens: 500,
      });

      expect(logged.provider).toBe('typesafe');
      // 500 tokens * $0.042 / 1,000,000 = $0.000021
      expect(logged.costUsd).toBeCloseTo((500 * 0.042) / 1_000_000, 6);
    });
  });

  describe('Balances aggregation & telemetry', () => {
    it('returns consolidated balances and alert flags', async () => {
      const balances = await service.getBalances();

      expect(balances.combined).toBeDefined();
      expect(balances.openrouter).toBeDefined();
      expect(balances.groq).toBeDefined();
      expect(balances.typesafe).toBeDefined();
      expect(typeof balances.combined.totalRemainingBalanceUsd).toBe('number');
      expect(typeof balances.combined.totalSpentUsd).toBe('number');
      expect(typeof balances.combined.totalRequestsCount).toBe('number');
    });

    it('triggers low-balance alerts when remaining credit is below threshold', async () => {
      mockBudgetRepo.findOne.mockResolvedValueOnce({
        id: 'default',
        groqInitialBalance: 0.05, // very low initial balance
        typesafeInitialBalance: 0.05,
        openrouterInitialBalance: 0.05,
        costAlertThresholdUsd: 1.0,
      });

      const balances = await service.getBalances();
      expect(balances.combined.hasLowBalanceAlert).toBe(true);
      expect(balances.combined.alertMessages.length).toBeGreaterThan(0);
    });
  });

  describe('History logs retrieval & clearing', () => {
    it('queries usage logs with pagination and filters', async () => {
      const logs = await service.getLogs({ provider: 'openrouter', limit: 20 });
      expect(Array.isArray(logs)).toBe(true);
      expect(logs.length).toBe(2);
    });

    it('clears all telemetry logs', async () => {
      const result = await service.clearLogs();
      expect(mockUsageRepo.clear).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });
  });
});
