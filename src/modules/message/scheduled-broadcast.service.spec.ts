import { ScheduledBroadcastService } from './scheduled-broadcast.service';
import { EngineRegistry } from '../../engine/engine-registry.service';

describe('ScheduledBroadcastService', () => {
  let service: ScheduledBroadcastService;
  let mockBulkMessageService: any;
  let engines: EngineRegistry;

  beforeEach(() => {
    mockBulkMessageService = {
      createBatch: jest.fn().mockResolvedValue({ batchId: 'batch_123', totalMessages: 2 }),
    };
    engines = new EngineRegistry();
    service = new ScheduledBroadcastService(mockBulkMessageService, engines);
  });

  afterEach(() => {
    service.onModuleDestroy();
  });

  it('creates and retrieves scheduled broadcast', () => {
    const created = service.addBroadcast('s1', {
      scheduledTime: '10:00',
      frequency: 'daily',
      payload: { messages: [{ chatId: '123@g.us', type: 'text', content: { text: 'Hello' } }] } as any,
      name: 'Test Campaign',
    });

    expect(created.id).toBeDefined();
    expect(created.name).toBe('Test Campaign');
    expect(created.status).toBe('active');

    const list = service.getBroadcasts('s1');
    expect(list.some(b => b.id === created.id)).toBe(true);

    service.deleteBroadcast('s1', created.id);
  });

  it('preserves one-time broadcast as paused upon execution instead of deleting it', async () => {
    const created = service.addBroadcast('s1', {
      scheduledTime: '00:00', // matches or earlier than current time
      frequency: 'once',
      payload: { messages: [{ chatId: '123@g.us', type: 'text', content: { text: 'Hello once' } }] } as any,
      name: 'One-time Campaign',
    });

    // Manually trigger processDueBroadcasts
    await (service as any).processDueBroadcasts();

    const list = service.getBroadcasts('s1');
    const found = list.find(b => b.id === created.id);
    expect(found).toBeDefined();
    expect(found?.status).toBe('paused');
    expect(found?.lastRunAt).toBeDefined();

    service.deleteBroadcast('s1', created.id);
  });

  it('handles ISO scheduledTime for once frequency without crashing or premature deletion', async () => {
    const futureDate = '2099-12-31T23:59:00';
    const created = service.addBroadcast('s1', {
      scheduledTime: futureDate,
      frequency: 'once',
      payload: { messages: [{ chatId: '123@g.us', type: 'text', content: { text: 'Future message' } }] } as any,
      name: 'Future Campaign',
    });

    // Manually trigger processDueBroadcasts - should NOT execute because it's far in the future
    await (service as any).processDueBroadcasts();

    const list = service.getBroadcasts('s1');
    const found = list.find(b => b.id === created.id);
    expect(found).toBeDefined();
    expect(found?.status).toBe('active');
    expect(found?.lastRunAt).toBeUndefined();

    service.deleteBroadcast('s1', created.id);
  });

  it('isolates campaigns by session and returns empty list for sessions with no campaigns', () => {
    const s1Campaign = service.addBroadcast('session-alpha', {
      scheduledTime: '11:00',
      frequency: 'daily',
      payload: { messages: [{ chatId: '123@g.us', type: 'text', content: { text: 'Alpha' } }] } as any,
      name: 'Alpha Campaign',
    });

    const s2Campaign = service.addBroadcast('session-beta', {
      scheduledTime: '12:00',
      frequency: 'daily',
      payload: { messages: [{ chatId: '456@g.us', type: 'text', content: { text: 'Beta' } }] } as any,
      name: 'Beta Campaign',
    });

    // session-alpha should only see its own campaign
    const alphaList = service.getBroadcasts('session-alpha');
    expect(alphaList.length).toBe(1);
    expect(alphaList[0].id).toBe(s1Campaign.id);

    // session-beta should only see its own campaign
    const betaList = service.getBroadcasts('session-beta');
    expect(betaList.length).toBe(1);
    expect(betaList[0].id).toBe(s2Campaign.id);

    // session-gamma (has 0 campaigns) MUST return empty array, NOT leak alpha or beta
    const gammaList = service.getBroadcasts('session-gamma');
    expect(gammaList.length).toBe(0);

    // Security: cross-session update/toggle/delete must be rejected
    const updateResult = service.updateBroadcast('session-gamma', s1Campaign.id, { name: 'Hacked' });
    expect(updateResult).toBeNull();

    const toggleResult = service.toggleBroadcastStatus('session-gamma', s1Campaign.id);
    expect(toggleResult).toBeNull();

    const deleteResult = service.deleteBroadcast('session-gamma', s1Campaign.id);
    expect(deleteResult).toBe(false);

    // Cleanup
    service.deleteBroadcast('session-alpha', s1Campaign.id);
    service.deleteBroadcast('session-beta', s2Campaign.id);
  });
});
