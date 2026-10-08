import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ContactService } from './contact.service';
import { EngineRegistry } from '../../engine/engine-registry.service';
import { IWhatsAppEngine } from '../../engine/interfaces/whatsapp-engine.interface';

describe('ContactService', () => {
  const makeService = (engine: Partial<IWhatsAppEngine> | undefined) => {
    const engines = new EngineRegistry();
    if (engine) engines.set('s1', engine as IWhatsAppEngine);
    return new ContactService(engines);
  };

  it('throws 400 when the session is not started', () => {
    expect(() => makeService(undefined).getContacts('s1')).toThrow(BadRequestException);
  });

  it('getBlockedContacts delegates to the engine and returns the bare id list', async () => {
    const getBlockedContacts = jest.fn().mockResolvedValue(['628111@c.us']);
    await expect(makeService({ getBlockedContacts }).getBlockedContacts('s1')).resolves.toEqual(['628111@c.us']);
    expect(getBlockedContacts).toHaveBeenCalledTimes(1);
  });

  it('getBlockedContacts throws 400 when the session is not started', () => {
    expect(() => makeService(undefined).getBlockedContacts('s1')).toThrow(BadRequestException);
  });

  it('caps an unbounded contacts list at the default limit (10000)', async () => {
    const big = Array.from({ length: 12000 }, (_, i) => ({ id: `${i}@c.us` }));
    const getContacts = jest.fn().mockResolvedValue(big);
    await expect(makeService({ getContacts }).getContacts('s1')).resolves.toHaveLength(10000);
  });

  it('merges participants from lid_mappings when available', async () => {
    const getContacts = jest.fn().mockResolvedValue([{ id: '111@c.us', name: 'Saved Contact' }]);
    const mockLidRepo = {
      find: jest.fn().mockResolvedValue([
        { lid: '123@lid', phone: '222', sessionId: 's1' },
        { lid: '456@lid', phone: '111', sessionId: 's1' },
      ]),
    };
    const mockSessionService = {
      findOne: jest.fn().mockResolvedValue({ id: 's1', name: 'pizzeria' }),
    };
    const engines = new EngineRegistry();
    engines.set('s1', { getContacts, getChats: jest.fn().mockResolvedValue([]) } as any);
    const svc = new ContactService(engines, mockLidRepo as any, mockSessionService as any);

    const result = await svc.getContacts('s1');
    expect(result).toHaveLength(2);
    expect(result.find(c => c.id === '111@c.us')?.name).toBe('Saved Contact');
    expect(result.find(c => c.id === '111@c.us')?.number).toBe('111');
    expect(result.find(c => c.id === '222@c.us')?.number).toBe('222');
  });

  it('transfers pushName from @lid contacts and removes bare @lid entries', async () => {
    const getContacts = jest.fn().mockResolvedValue([
      { id: '74122746937513@lid', pushName: 'Brayan', isMyContact: true },
    ]);
    const mockLidRepo = {
      find: jest.fn().mockResolvedValue([
        { lid: '74122746937513', phone: '56986176136', sessionId: 's1' },
      ]),
    };
    const engines = new EngineRegistry();
    engines.set('s1', { getContacts, getChats: jest.fn().mockResolvedValue([]) } as any);
    const svc = new ContactService(engines, mockLidRepo as any);

    const result = await svc.getContacts('s1');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('56986176136@c.us');
    expect(result[0].pushName).toBe('Brayan');
    expect(result[0].number).toBe('56986176136');
    expect(result[0].isMyContact).toBe(true);
    expect(result.some(c => c.id.endsWith('@lid'))).toBe(false);
  });

  it('applies limit/offset to the contacts list', async () => {
    const big = Array.from({ length: 50 }, (_, i) => ({ id: `${i}@c.us` }));
    const getContacts = jest.fn().mockResolvedValue(big);
    const page = (await makeService({ getContacts }).getContacts('s1', { limit: 5, offset: 10 })) as { id: string }[];
    expect(page).toHaveLength(5);
    expect(page[0].id).toBe('10@c.us');
  });

  it('maps a missing contact to 404', async () => {
    const svc = makeService({ getContactById: jest.fn().mockResolvedValue(null) });
    await expect(svc.getContactById('s1', 'c404')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('delegates checkNumberExists to the engine', async () => {
    const checkNumberExists = jest.fn().mockResolvedValue(true);
    await expect(makeService({ checkNumberExists }).checkNumberExists('s1', '628123')).resolves.toBe(true);
    expect(checkNumberExists).toHaveBeenCalledWith('628123');
  });

  it('delegates getNumberId to the engine (canonical JID resolution)', async () => {
    const getNumberId = jest.fn().mockResolvedValue('628123@c.us');
    await expect(makeService({ getNumberId }).getNumberId('s1', '628123')).resolves.toBe('628123@c.us');
    expect(getNumberId).toHaveBeenCalledWith('628123');
  });

  it('delegates resolveContactPhone to the engine', async () => {
    const resolveContactPhone = jest.fn().mockResolvedValue('628123456789');
    await expect(makeService({ resolveContactPhone }).resolveContactPhone('s1', '123@lid')).resolves.toBe(
      '628123456789',
    );
    expect(resolveContactPhone).toHaveBeenCalledWith('123@lid');
  });

  it('batch-resolves profile pictures, nulling per-id failures without aborting', async () => {
    const getProfilePicture = jest
      .fn()
      .mockResolvedValueOnce('https://pps/1.jpg')
      .mockRejectedValueOnce(new Error('no picture'))
      .mockResolvedValueOnce('https://pps/3.jpg');
    const out = await makeService({ getProfilePicture }).getProfilePictures('s1', ['a@c.us', 'b@c.us', 'c@c.us']);
    expect(out).toEqual({ 'a@c.us': 'https://pps/1.jpg', 'b@c.us': null, 'c@c.us': 'https://pps/3.jpg' });
  });

  it('ignores ids beyond the 50-id batch cap', async () => {
    const getProfilePicture = jest.fn().mockResolvedValue(null);
    const ids = Array.from({ length: 60 }, (_, i) => `${i}@c.us`);
    const out = await makeService({ getProfilePicture }).getProfilePictures('s1', ids);
    expect(Object.keys(out)).toHaveLength(50);
    expect(getProfilePicture).toHaveBeenCalledTimes(50);
  });

  it('runs batch lookups at most 5 concurrently', async () => {
    let active = 0;
    let maxActive = 0;
    const getProfilePicture = jest.fn().mockImplementation(async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise(r => setImmediate(r));
      active -= 1;
      return null;
    });
    const ids = Array.from({ length: 12 }, (_, i) => `${i}@c.us`);
    await makeService({ getProfilePicture }).getProfilePictures('s1', ids);
    expect(maxActive).toBeLessThanOrEqual(5);
  });

  it('yields null (not a stalled batch) when an engine lookup hangs past the per-id deadline', async () => {
    const getProfilePicture = jest
      .fn()
      .mockResolvedValueOnce('https://pps/1.jpg')
      .mockImplementationOnce(() => new Promise(() => undefined)); // never settles
    const started = Date.now();
    const out = await makeService({ getProfilePicture }).getProfilePictures('s1', ['a@c.us', 'b@c.us']);
    expect(out).toEqual({ 'a@c.us': 'https://pps/1.jpg', 'b@c.us': null });
    expect(Date.now() - started).toBeLessThan(12_000);
  }, 15_000);

  describe('addressbook writes reject a privacy id', () => {
    // The lid's digits are NOT a phone number (see the note on
    // MessageService.resolveJidCandidates). whatsapp-web.js takes a bare NUMBER for the
    // addressbook, so an unguarded @lid would be stored as if it were a real phone —
    // silently creating an entry for a number that does not exist.
    it.each([
      ['upsertContact', (svc: ContactService) => svc.upsertContact('s1', '159442138038327@lid', 'Ada')],
      ['deleteContact', (svc: ContactService) => svc.deleteContact('s1', '159442138038327@lid')],
    ])('%s refuses an @lid contact id with a 400', (_name, call) => {
      const upsertContact = jest.fn();
      const deleteContact = jest.fn();
      const svc = makeService({ upsertContact, deleteContact });
      expect(() => call(svc)).toThrow(BadRequestException);
      expect(upsertContact).not.toHaveBeenCalled();
      expect(deleteContact).not.toHaveBeenCalled();
    });

    it('still allows a normal phone-based contact id through to the engine', async () => {
      const upsertContact = jest.fn().mockResolvedValue(undefined);
      await makeService({ upsertContact }).upsertContact('s1', '628123@c.us', 'Ada', 'Lovelace');
      expect(upsertContact).toHaveBeenCalledWith('628123@c.us', 'Ada', 'Lovelace');
    });

    // Same hazard as the lid, different ids: a group/newsletter/broadcast id also carries digits
    // that would be stored as a phone number for a contact that does not exist.
    it.each(['120363000000000000@g.us', '120363000000000000@newsletter', 'status@broadcast'])(
      'refuses the non-person id %s with a 400',
      id => {
        const upsertContact = jest.fn();
        const svc = makeService({ upsertContact });
        expect(() => svc.upsertContact('s1', id, 'Ada')).toThrow(BadRequestException);
        expect(upsertContact).not.toHaveBeenCalled();
      },
    );
  });
});
