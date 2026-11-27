/**
 * Name cleaning + canonicalization.
 *
 * Cleaning: trim, collapse whitespace, strip zero-width / decorative chars,
 * collapse runs of underscores/hyphens/dots, trim trailing separators.
 * Canonical key: lowercased, non-alphanumeric runs -> '_'.
 */

import net from 'node:net';

export interface NameInfo {
  raw: string;               // raw as-written cell text (cleaned of whitespace, not transformed)
  cleaned: string;           // cleaning-protocol result (display name)
  canonicalKey: string;      // lowercase canonical match key ('' for unusable input)
  isIp: boolean;             // the raw name IS an IP (never a canonical name)
}

export function cleanName(raw: unknown): NameInfo {
  const rawText = String(raw ?? '').trim();
  if (!rawText) return { raw: '', cleaned: '', canonicalKey: '', isIp: false };
  // Detect an IP-as-name: is a complete IP (optionally with prefix/port)
  const bare = rawText.replace(/[^\w.\-:/]/g, ' ').trim();
  const looksLikeIp = (net.isIP(bare) !== 0) || /^(\d{1,3}(?:\.\d{1,3}){2}\.\d{1,3})(?:\/\d{1,2})?$/.test(bare);
  const cleaned = cleanNameText(rawText);
  const canonicalKey = canonicalKeyOf(cleaned);
  return { raw: cleanWhitespaceSafe(rawText), cleaned, canonicalKey, isIp: looksLikeIp };
}


/** Strip a matching wrapping pair (quotes, square/paren/brace) — only when both ends are that same pair. */
function wrapPair(s: string): string | null {
  const t = s.trim();
  if (t.length < 2) return null;
  const first = t[0]!;
  const last = t[t.length - 1]!;
  const pairs: Record<string, string> = { '"': '"', "'": "'", '`': '`', '(': ')', '[': ']', '{': '}' };
  if (!(first in pairs)) return null;
  const inner = t.slice(1, -1).trim();
  if (!inner) return null;
  if (pairs[first] !== last) return null;
  return inner;
}

function cleanWhitespaceSafe(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

function cleanNameText(raw: string): string {
  let s = raw;
  // strip zero-width + combining marks
  s = s.replace(/[\u200B-\u200D\uFEFF\u2060]/g, '');
  // strip surrounding wrapping pairs / quotes (only if the same bracket type closes both ends)
  const wrapped = wrapPair(s);
  if (wrapped !== null) s = wrapped;
  // strip leading/trailing decoration: trailing dots/commas/dashes/underscores
  s = s.replace(/^[.,;:!?\-_\s]+/, '').replace(/[.,;:!?\-_\s]+$/, '');
  // collapse whitespace
  s = s.replace(/\s+/g, ' ').trim();
  // collapse repeated underscores/hyphens/dots ("A---B" -> "A-B", "A___B" -> "A_B")
  s = s.replace(/([-_.])\1+/g, '$1');
  // " - " / " - " style separators become unspaced hyphens ("NDC - CORE" -> "NDC-CORE")
  s = s.replace(/\s*-\s*/g, '-');
  // collapse repeated spaces
  s = s.replace(/\s{2,}/g, ' ');
  return s;
}

/** Canonical match key: lowercase, non-alnum runs -> single underscore. */
export function canonicalKeyOf(cleaned: string): string {
  if (!cleaned) return '';
  return (
    cleaned
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || ''
  );
}

/** Human-readable display cleaned name: keep original casing but canonical-collapsed. */
export function displayNameOf(cleaned: string): string {
  if (!cleaned) return '';
  // trim/collapse done upstream; keep original for display
  return cleaned.trim();
}
