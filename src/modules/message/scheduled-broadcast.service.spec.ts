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
});
