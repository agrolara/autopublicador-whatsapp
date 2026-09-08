import {
  normalizePhoneDigits,
  parseBlacklist,
  isPhoneBlacklisted,
} from './ai-agent.service';
import { BlacklistEntry } from './entities/session-ai-config.entity';

describe('AI Agent Blacklist Logic', () => {
  describe('normalizePhoneDigits', () => {
    it('strips whatsapp suffixes and non-digit characters', () => {
      expect(normalizePhoneDigits('56993005959@s.whatsapp.net')).toBe('56993005959');
      expect(normalizePhoneDigits('+56 9 9300 5959')).toBe('56993005959');
      expect(normalizePhoneDigits('56993005959@c.us')).toBe('56993005959');
      expect(normalizePhoneDigits('+1 (555) 234-5678')).toBe('15552345678');
      expect(normalizePhoneDigits('')).toBe('');
    });
  });

  describe('parseBlacklist', () => {
    it('returns empty array on null/undefined/empty', () => {
      expect(parseBlacklist(null)).toEqual([]);
      expect(parseBlacklist(undefined)).toEqual([]);
      expect(parseBlacklist('')).toEqual([]);
      expect(parseBlacklist('[]')).toEqual([]);
    });

    it('parses array of strings', () => {
      const parsed = parseBlacklist(JSON.stringify(['+56993005959', '123456789']));
      expect(parsed).toHaveLength(2);
      expect(parsed[0].phone).toBe('+56993005959');
      expect(parsed[0].cleanPhone).toBe('56993005959');
      expect(parsed[1].cleanPhone).toBe('123456789');
    });

    it('parses structured entries preserving reason and dates', () => {
      const data: BlacklistEntry[] = [
        {
          phone: '+56993005959',
          cleanPhone: '56993005959',
          addedAt: '2026-09-08T00:00:00.000Z',
          reason: 'Atención manual',
        },
      ];
      const parsed = parseBlacklist(JSON.stringify(data));
      expect(parsed).toHaveLength(1);
      expect(parsed[0].phone).toBe('+56993005959');
      expect(parsed[0].reason).toBe('Atención manual');
    });
  });

  describe('isPhoneBlacklisted', () => {
    const blacklist: BlacklistEntry[] = [
      {
        phone: '+56 9 9300 5959',
        cleanPhone: '56993005959',
        addedAt: new Date().toISOString(),
        reason: 'Personal',
      },
      {
        phone: '1234567890',
        cleanPhone: '1234567890',
        addedAt: new Date().toISOString(),
      },
    ];

    it('matches exact digits', () => {
      expect(isPhoneBlacklisted('56993005959@s.whatsapp.net', blacklist)).toBe(true);
      expect(isPhoneBlacklisted('56993005959@c.us', blacklist)).toBe(true);
      expect(isPhoneBlacklisted('1234567890', blacklist)).toBe(true);
    });

    it('matches suffix with/without country code', () => {
      // 993005959 is suffix of 56993005959
      expect(isPhoneBlacklisted('993005959@s.whatsapp.net', blacklist)).toBe(true);
    });

    it('returns false for unlisted numbers', () => {
      expect(isPhoneBlacklisted('56911112222@s.whatsapp.net', blacklist)).toBe(false);
      expect(isPhoneBlacklisted('', blacklist)).toBe(false);
      expect(isPhoneBlacklisted('56993005959', [])).toBe(false);
    });
  });
});
