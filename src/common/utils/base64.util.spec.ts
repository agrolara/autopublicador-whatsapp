import {
  stripBase64DataUri,
  parseDataUri,
  base64ToBuffer,
  detectBufferMime,
} from './base64.util';

describe('base64.util', () => {
  describe('stripBase64DataUri', () => {
    it('returns undefined for null or undefined', () => {
      expect(stripBase64DataUri(null)).toBeUndefined();
      expect(stripBase64DataUri(undefined)).toBeUndefined();
    });

    it('strips data uri prefix cleanly', () => {
      const input = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJ';
      expect(stripBase64DataUri(input)).toBe('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJ');
    });

    it('returns original string when prefix is absent', () => {
      const raw = 'SGVsbG8gV29ybGQ=';
      expect(stripBase64DataUri(raw)).toBe(raw);
    });
  });

  describe('parseDataUri', () => {
    it('returns null for empty input', () => {
      expect(parseDataUri('')).toBeNull();
      expect(parseDataUri(null)).toBeNull();
    });

    it('extracts mimeType and clean base64 payload', () => {
      const res = parseDataUri('data:audio/mp3;base64,SUQzBAAAAAAA');
      expect(res).toEqual({
        mimeType: 'audio/mp3',
        base64: 'SUQzBAAAAAAA',
      });
    });

    it('handles payload without data URI prefix', () => {
      const res = parseDataUri('  SUQzBAAAAAAA  \n');
      expect(res).toEqual({
        mimeType: undefined,
        base64: 'SUQzBAAAAAAA',
      });
    });
  });

  describe('base64ToBuffer', () => {
    it('decodes clean base64 to buffer correctly', () => {
      const helloB64 = Buffer.from('Hello OpenWA').toString('base64');
      const buf = base64ToBuffer(helloB64);
      expect(buf).toBeInstanceOf(Buffer);
      expect(buf?.toString('utf-8')).toBe('Hello OpenWA');
    });

    it('decodes data uri to buffer correctly', () => {
      const dataUri = 'data:text/plain;base64,' + Buffer.from('Data URI test').toString('base64');
      const buf = base64ToBuffer(dataUri);
      expect(buf?.toString('utf-8')).toBe('Data URI test');
    });
  });

  describe('detectBufferMime', () => {
    it('detects PNG magic bytes', () => {
      const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      expect(detectBufferMime(pngHeader)).toBe('image/png');
    });

    it('detects JPEG magic bytes', () => {
      const jpgHeader = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
      expect(detectBufferMime(jpgHeader)).toBe('image/jpeg');
    });

    it('detects PDF magic bytes', () => {
      const pdfHeader = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d]);
      expect(detectBufferMime(pdfHeader)).toBe('application/pdf');
    });

    it('detects OGG magic bytes', () => {
      const oggHeader = Buffer.from([0x4f, 0x67, 0x67, 0x53, 0x00]);
      expect(detectBufferMime(oggHeader)).toBe('audio/ogg');
    });

    it('returns null for unknown buffer', () => {
      const random = Buffer.from([0x01, 0x02, 0x03, 0x04]);
      expect(detectBufferMime(random)).toBeNull();
    });
  });
});
