// Unlimited bulk recipients capacity (supporting thousands of groups)
export const BULK_MAX_RECIPIENTS = 10000;

/**
 * Parse the bulk-recipients textarea (one entry per line) into chat IDs: trims whitespace,
 * drops blank lines, de-dupes, and normalizes bare phone numbers to `<digits>@c.us`. Lines
 * containing '@' are treated as full chat IDs and pass through untouched; lines with no '@'
 * and no digits at all are dropped rather than sent as the meaningless '@c.us'.
 */
export function parseBulkRecipients(text: string): string[] {
  const seen = new Set<string>();
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line.includes('@')) {
      const jid = line.split(/\s+/).find(t => t.includes('@')) || line;
      seen.add(jid.trim());
      continue;
    }

    const digits = line.replace(/[^0-9]/g, '');
    if (!digits) continue;

    const isGroup = line.includes('-') && digits.length >= 15;
    if (isGroup) {
      const groupBase = line.split(/\s+/)[0].replace(/[^0-9-]/g, '');
      seen.add(`${groupBase}@g.us`);
    } else {
      seen.add(`${digits}@c.us`);
    }
  }
  return [...seen];
}
