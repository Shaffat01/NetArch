/**
 * Cell value -> clean string.
 * Handles hyperlink objects ({ text, hyperlink }), rich-text objects,
 * formula cells ({ formula, result }), dates, and numbers.
 */
export function cellText(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (Array.isArray(v)) {
    // rich-text array: [{ text }, ...]
    if (v.every((x) => x !== null && typeof x === 'object' && 'text' in (x as Record<string, unknown>))) {
      return (v as Array<{ text: string }>).map((x) => x.text).join('').trim();
    }
    return v.map((x) => cellText(x)).filter(Boolean).join(' ').trim();
  }
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if (typeof o.text === 'string') return o.text.trim(); // hyperlink object { text, hyperlink }
    if (typeof o.result === 'string') return o.result.trim(); // formula cell
    if (typeof o.result === 'number') return String(o.result);
    if (Array.isArray(o.richText)) return o.richText.map((x) => String(x)).join('').trim();
    if (typeof o.error === 'string') return '';
    return '';
  }
  return '';
}

/** Collapse runs of whitespace + stray punctuation into single spaces. */
export function cleanWhitespace(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}
