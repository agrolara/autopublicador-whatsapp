// The backend caps a bulk batch at 100 messages (ArrayMaxSize on SendBulkMessageDto).
export const BULK_MAX_RECIPIENTS = 100;

/**
 * Parse the bulk-recipients textarea (one entry per line) into chat IDs: trims whitespace,
 * drops blank lines, de-dupes, and normalizes bare phone numbers to `<digits>@c.us`. Lines
 * containing '@' are treated as full chat IDs and pass through untouched; lines with no '@'
 * and no digits at all are dropped rather than sent as the meaningless '@c.us'.
 */
export function parseBulkRecipients(text: string): string[] {
  const seen = new Set<string>();
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim().split(' ')[0];
    if (!line) continue;

    const base = line.split('@')[0];
    const cleanBase = base.replace(/[^0-9-]/g, '');
    const digits = cleanBase.replace(/[^0-9]/g, '');
    if (!digits) continue;

    // Detect group JID: WhatsApp Group WIDs start with '120363' (17+ digits) or contain hyphen
    const isGroup = cleanBase.includes('-') || (digits.length >= 17 && digits.startsWith('120363'));

    if (isGroup) {
      seen.add(`${cleanBase}@g.us`);
    } else {
      seen.add(`${digits}@c.us`);
    }
  }
  return [...seen];
}
