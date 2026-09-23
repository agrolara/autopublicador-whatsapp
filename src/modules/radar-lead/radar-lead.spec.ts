import {
  RadarLeadService,
  matchesKeywords,
  normalizeTextForSearch,
  normalizePhoneDigits,
} from './radar-lead.service';
import { RadarSetting } from './entities/radar-setting.entity';
import { RadarClient, DEFAULT_RADAR_ALERT_TEMPLATE } from './entities/radar-client.entity';

describe('RadarLeadService - Unit Tests', () => {
  describe('Text normalization & Keyword matching', () => {
    it('normalizes accents and casing correctly', () => {
      expect(normalizeTextForSearch('Pizzería')).toBe('pizzeria');
      expect(normalizeTextForSearch('¿Valle Lo Campiño?')).toBe('¿valle lo campino?');
      expect(normalizeTextForSearch('BAJÓN')).toBe('bajon');
    });

    it('matches single-word keywords with word boundary', () => {
      const keywords = 'pizza, bajon, sushi';
      expect(matchesKeywords('Hola, tienen pizza familiar?', keywords).matched).toBe(true);
      expect(matchesKeywords('Hola, tengo tremendo bajón', keywords).matched).toBe(true);
      expect(matchesKeywords('Vendo repuestos de auto', keywords).matched).toBe(false);
    });

    it('matches multi-word phrases correctly', () => {
      const keywords = 'valle lo campino, quilicura centro';
      expect(matchesKeywords('Busco flete en Valle Lo Campino', keywords).matched).toBe(true);
      expect(matchesKeywords('Estamos en Quilicura Centro', keywords).matched).toBe(true);
      expect(matchesKeywords('En Maipú oriente', keywords).matched).toBe(false);
    });

    it('normalizes phone digits', () => {
      expect(normalizePhoneDigits('+56 9 9300 5959')).toBe('56993005959');
      expect(normalizePhoneDigits('56912345678@s.whatsapp.net')).toBe('56912345678');
      expect(normalizePhoneDigits('whatsapp:+56988887777')).toBe('56988887777');
    });
  });

  describe('Alert template formatting', () => {
    let service: RadarLeadService;
    let mockSettingsRepo: any;
    let mockClientsRepo: any;

    beforeEach(() => {
      mockSettingsRepo = {
        findOne: jest.fn(),
        create: jest.fn(),
        save: jest.fn(),
        query: jest.fn().mockResolvedValue([]),
      };
      mockClientsRepo = {
        find: jest.fn().mockResolvedValue([]),
        findOne: jest.fn(),
        create: jest.fn(),
        save: jest.fn(),
        query: jest.fn().mockResolvedValue([]),
      };
      service = new RadarLeadService(mockSettingsRepo, mockClientsRepo);
    });

    it('formats template replacing all variables including wa.me link', () => {
      const client: RadarClient = {
        id: 'client-1',
        name: 'Pizzería La Mascada',
        rubroKey: 'pizza',
        targetPhone: '56993005959',
        senderSessionId: 'pizzeria',
        localKeywords: 'pizza,pizzer,bajon',
        jevPromptCriteria: null,
        alertTemplate: DEFAULT_RADAR_ALERT_TEMPLATE,
        active: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = service.formatAlertMessage(client, {
        groupName: 'Vecinos Valle Lo Campino',
        buyerPhone: '56911223344',
        buyerMessage: 'Alguien que venda pizza con despacho?',
      });

      expect(result).toContain('*Rubro:* pizza');
      expect(result).toContain('*Grupo:* Vecinos Valle Lo Campino');
      expect(result).toContain('*Comprador:* +56911223344');
      expect(result).toContain('"Alguien que venda pizza con despacho?"');
      expect(result).toContain('https://wa.me/56911223344');
    });
  });

  describe('0 ms Discard Gate & evaluateInbound', () => {
    let service: RadarLeadService;
    let mockSettingsRepo: any;
    let mockClientsRepo: any;
    let mockEngineRegistry: any;
    let mockEngine: any;

    beforeEach(async () => {
      mockSettingsRepo = {
        findOne: jest.fn().mockResolvedValue({
          id: 'default',
          enabled: true,
          minTextLength: 8,
          ignoreMediaWithoutCaption: true,
          groupFilterMode: 'ALL',
          groupCategoryKeywords: 'quilicura,valle lo campino',
          whitelistedGroupIds: '[]',
          activeScanningSessions: '["ventas-online","pizzeria"]',
          dedupWindowSeconds: 30,
        }),
        save: jest.fn(),
        create: jest.fn(dto => dto),
        query: jest.fn().mockResolvedValue([]),
      };

      mockClientsRepo = {
        find: jest.fn().mockResolvedValue([
          {
            id: 'client-pizza',
            name: 'Pizzería La Mascada',
            rubroKey: 'pizza',
            targetPhone: '56993005959',
            senderSessionId: 'pizzeria',
            localKeywords: 'pizza,pizzer,bajon',
            alertTemplate: DEFAULT_RADAR_ALERT_TEMPLATE,
            active: true,
          },
        ]),
        findOne: jest.fn(),
        save: jest.fn(),
        create: jest.fn(dto => dto),
        query: jest.fn().mockResolvedValue([]),
      };

      mockEngine = {
        getGroups: jest.fn().mockResolvedValue([
          { id: '120363001@g.us', name: 'Vecinos Quilicura' },
        ]),
        sendTextMessage: jest.fn().mockResolvedValue({ id: 'msg-alert-1' }),
      };

      mockEngineRegistry = {
        get: jest.fn().mockReturnValue(mockEngine),
        getAll: jest.fn().mockReturnValue([mockEngine]),
      };

      service = new RadarLeadService(mockSettingsRepo, mockClientsRepo, mockEngineRegistry);
      await service.reloadCache();
    });

    it('discards in 0ms when master switch enabled is false', async () => {
      const disabledSettings: RadarSetting = {
        id: 'default',
        enabled: false,
        minTextLength: 8,
        ignoreMediaWithoutCaption: true,
        groupFilterMode: 'ALL',
        groupCategoryKeywords: '',
        whitelistedGroupIds: '[]',
        activeScanningSessions: '[]',
        dedupWindowSeconds: 30,
        updatedAt: new Date(),
      };
      (service as any).cachedSettings = disabledSettings;

      await service.evaluateInbound('ventas-online', {
        id: 'msg-1',
        from: '120363001@g.us',
        isGroup: true,
        fromMe: false,
        body: 'Hola, alguien vende pizza ahora?',
      });

      expect(mockEngine.sendTextMessage).not.toHaveBeenCalled();
    });

    it('discards outgoing messages (fromMe === true)', async () => {
      await service.evaluateInbound('ventas-online', {
        id: 'msg-2',
        from: '120363001@g.us',
        isGroup: true,
        fromMe: true,
        body: 'Hola, alguien vende pizza ahora?',
      });

      expect(mockEngine.sendTextMessage).not.toHaveBeenCalled();
    });

    it('discards private non-group messages', async () => {
      await service.evaluateInbound('ventas-online', {
        id: 'msg-3',
        from: '56911223344@c.us',
        isGroup: false,
        fromMe: false,
        body: 'Hola, alguien vende pizza ahora?',
      });

      expect(mockEngine.sendTextMessage).not.toHaveBeenCalled();
    });

    it('discards messages from unauthorized sessions', async () => {
      await service.evaluateInbound('unauthorized-session', {
        id: 'msg-4',
        from: '120363001@g.us',
        isGroup: true,
        fromMe: false,
        body: 'Hola, alguien vende pizza ahora?',
      });

      expect(mockEngine.sendTextMessage).not.toHaveBeenCalled();
    });

    it('discards messages shorter than minTextLength', async () => {
      await service.evaluateInbound('ventas-online', {
        id: 'msg-5',
        from: '120363001@g.us',
        isGroup: true,
        fromMe: false,
        body: 'hola', // length 4 < 8
      });

      expect(mockEngine.sendTextMessage).not.toHaveBeenCalled();
    });

    it('evaluates and dispatches alert when group and keywords match', async () => {
      await service.evaluateInbound('ventas-online', {
        id: 'msg-6',
        from: '120363001@g.us',
        author: '56987654321@s.whatsapp.net',
        isGroup: true,
        fromMe: false,
        body: 'Buenas noches, ¿alguien vende pizzas con entrega rápida?',
      });

      expect(mockEngine.sendTextMessage).toHaveBeenCalledTimes(1);
      expect(mockEngine.sendTextMessage).toHaveBeenCalledWith(
        '56993005959@c.us',
        expect.stringContaining('https://wa.me/56987654321'),
      );
    });

    it('deduplicates identical messages arriving across two sessions in the same group', async () => {
      // First session receives message
      await service.evaluateInbound('ventas-online', {
        id: 'shared-msg-1',
        from: '120363001@g.us',
        author: '56987654321@s.whatsapp.net',
        isGroup: true,
        fromMe: false,
        body: 'Buenas noches, ¿alguien vende pizzas familiares?',
      });

      expect(mockEngine.sendTextMessage).toHaveBeenCalledTimes(1);

      // Second session receives exact same group message 100ms later
      await service.evaluateInbound('pizzeria', {
        id: 'shared-msg-1',
        from: '120363001@g.us',
        author: '56987654321@s.whatsapp.net',
        isGroup: true,
        fromMe: false,
        body: 'Buenas noches, ¿alguien vende pizzas familiares?',
      });

      // Should still be called only 1 time!
      expect(mockEngine.sendTextMessage).toHaveBeenCalledTimes(1);
    });
  });

  describe('TypeSafe AI Semantic Evaluation', () => {
    let originalFetch: any;

    beforeAll(() => {
      originalFetch = global.fetch;
    });

    afterAll(() => {
      global.fetch = originalFetch;
    });

    it('approves buyer leads when TypeSafe noul score >= 0.5', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          answers: { es_intencion_compra: { noul: 0.95 } },
        }),
      }) as any;

      const { evaluateSemanticCriteriaWithTypeSafe } = require('./radar-lead.service');
      const res = await evaluateSemanticCriteriaWithTypeSafe(
        'Hola alguien vende cuentas google?',
        'El usuario busca comprar o contratar, no está ofreciendo ni vendiendo',
        'test-key',
      );

      expect(res.isMatch).toBe(true);
      expect(res.score).toBe(0.95);
    });

    it('discards seller messages when TypeSafe noul score < 0.5', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          answers: { es_intencion_compra: { noul: 0.16 } },
        }),
      }) as any;

      const { evaluateSemanticCriteriaWithTypeSafe } = require('./radar-lead.service');
      const res = await evaluateSemanticCriteriaWithTypeSafe(
        'Vendo cuentas google drive de 5tb baratas',
        'El usuario busca comprar o contratar, no está ofreciendo ni vendiendo',
        'test-key',
      );

      expect(res.isMatch).toBe(false);
      expect(res.score).toBe(0.16);
    });

    it('fails open when TypeSafe API encounters network error', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('Network timeout')) as any;

      const { evaluateSemanticCriteriaWithTypeSafe } = require('./radar-lead.service');
      const res = await evaluateSemanticCriteriaWithTypeSafe(
        'Hola alguien vende pizza?',
        'El usuario busca comprar',
        'test-key',
      );

      expect(res.isMatch).toBe(true);
      expect(res.error).toContain('Network timeout');
    });
  });

  describe('Telemetry & Metrics', () => {
    let service: RadarLeadService;
    let mockSettingsRepo: any;
    let mockClientsRepo: any;
    let mockLogsRepo: any;

    beforeEach(() => {
      mockSettingsRepo = {
        findOne: jest.fn(),
        create: jest.fn(),
        save: jest.fn(),
        query: jest.fn().mockResolvedValue([]),
      };
      mockClientsRepo = {
        find: jest.fn().mockResolvedValue([
          { id: 'c-1', name: 'Sushi Kura', rubroKey: 'sushi' },
          { id: 'c-2', name: 'Google AI Pro', rubroKey: 'cuentas google' },
        ]),
        findOne: jest.fn(),
        create: jest.fn(),
        save: jest.fn(),
        query: jest.fn().mockResolvedValue([]),
      };
      mockLogsRepo = {
        create: jest.fn(d => d),
        save: jest.fn(d => Promise.resolve(d)),
        find: jest.fn().mockResolvedValue([
          { clientId: 'c-1', status: 'DISPATCHED' },
          { clientId: 'c-1', status: 'DISPATCHED' },
          { clientId: 'c-1', status: 'DISCARDED_AI' },
          { clientId: 'c-2', status: 'DISPATCHED' },
          { clientId: 'c-2', status: 'DISCARDED_AI' },
        ]),
        clear: jest.fn().mockResolvedValue(undefined),
      };
      service = new RadarLeadService(mockSettingsRepo, mockClientsRepo, mockLogsRepo);
    });

    it('computes global and per-client metrics correctly', async () => {
      const metrics = await service.getMetrics();

      expect(metrics.global.totalMatches).toBe(5);
      expect(metrics.global.approvedLeads).toBe(3);
      expect(metrics.global.discardedAds).toBe(2);
      expect(metrics.global.accuracyRate).toBe(60);

      const sushi = metrics.byClient.find(c => c.clientId === 'c-1');
      expect(sushi).toBeDefined();
      expect(sushi?.totalMatches).toBe(3);
      expect(sushi?.approvedLeads).toBe(2);
      expect(sushi?.discardedAds).toBe(1);
      expect(sushi?.accuracyRate).toBe(66.7);

      const google = metrics.byClient.find(c => c.clientId === 'c-2');
      expect(google).toBeDefined();
      expect(google?.totalMatches).toBe(2);
      expect(google?.approvedLeads).toBe(1);
      expect(google?.discardedAds).toBe(1);
      expect(google?.accuracyRate).toBe(50);
    });

    it('retrieves recent logs with filtering', async () => {
      await service.getLogs({ limit: 10, clientId: 'c-1', status: 'DISPATCHED' });
      expect(mockLogsRepo.find).toHaveBeenCalledWith({
        where: { clientId: 'c-1', status: 'DISPATCHED' },
        order: { createdAt: 'DESC' },
        take: 10,
      });
    });

    it('clears logs when requested', async () => {
      const res = await service.clearLogs();
      expect(res.success).toBe(true);
      expect(mockLogsRepo.clear).toHaveBeenCalled();
    });
  });
});

