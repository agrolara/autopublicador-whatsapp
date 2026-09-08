/**
 * Centralized Base64 and MIME-type utilities for OpenWA.
 * Provides memory-efficient parsing, data-URI normalization, and binary format inspection.
 */

export interface ParsedDataUri {
  mimeType?: string;
  base64: string;
}

/**
 * Remove `data:<mime>;base64,` header prefix if present.
 * Leaves clean Base64 untouched.
 */
export function stripBase64DataUri(base64: string | null | undefined): string | undefined {
  if (base64 == null) return undefined;
  const match = /^data:[^,]*;base64,/i.exec(base64);
  return match ? base64.slice(match[0].length) : base64;
}

/**
 * Parse a data-URI string into its MIME type (if present) and pure Base64 payload.
 * If input is not a data-URI, returns the trimmed string with undefined MIME type.
 */
export function parseDataUri(input: string | null | undefined): ParsedDataUri | null {
  if (!input) return null;
  const str = input.trim();
  if (str.startsWith('data:') && str.includes(';base64,')) {
    const commaIndex = str.indexOf(',');
    const header = str.substring(5, commaIndex);
    const mime = header.split(';')[0]?.trim() || undefined;
    const cleanB64 = str.substring(commaIndex + 1).replace(/\s/g, '');
    return {
      mimeType: mime || undefined,
      base64: cleanB64,
    };
  }
  return {
    mimeType: undefined,
    base64: str.replace(/\s/g, ''),
  };
}

/**
 * Safely decodes a Base64 or data-URI string into a Buffer.
 * Returns null if input is empty or invalid.
 */
export function base64ToBuffer(input: string | null | undefined): Buffer | null {
  const parsed = parseDataUri(input);
  if (!parsed || !parsed.base64) return null;
  try {
    return Buffer.from(parsed.base64, 'base64');
  } catch {
    return null;
  }
}

/**
 * Inspect magic bytes of a buffer to identify the real MIME type.
 * Useful for validating user-uploaded payloads or fallback resolution.
 */
export function detectBufferMime(buffer: Buffer): string | null {
  if (!buffer || buffer.length < 4) return null;

  // PNG: 89 50 4E 47 (‰PNG)
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return 'image/png';
  }

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }

  // GIF: 47 49 46 38 ('GIF8')
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38) {
    return 'image/gif';
  }

  // PDF: 25 50 44 46 ('%PDF')
  if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) {
    return 'application/pdf';
  }

  // OGG: 4F 67 67 53 ('OggS')
  if (buffer[0] === 0x4f && buffer[1] === 0x67 && buffer[2] === 0x67 && buffer[3] === 0x53) {
    return 'audio/ogg';
  }

  // WebP / RIFF container
  if (
    buffer.length >= 12 &&
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return 'image/webp';
  }

  // MP4 / QuickTime: '....ftyp'
  if (
    buffer.length >= 8 &&
    buffer[4] === 0x66 &&
    buffer[5] === 0x74 &&
    buffer[6] === 0x79 &&
    buffer[7] === 0x70
  ) {
    return 'video/mp4';
  }

  // MP3: 'ID3' or sync frames 0xFF 0xFB / 0xFF 0xF3
  if (buffer[0] === 0x49 && buffer[1] === 0x44 && buffer[2] === 0x33) {
    return 'audio/mpeg';
  }
  if (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0) {
    return 'audio/mpeg';
  }

  return null;
}
