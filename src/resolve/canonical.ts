/**
 * Canonical name resolution.
 *
 * A device may be written under many aliases across sheets/files. This module
 * scores each alias and picks the best one. Aliases are preserved.
 *
 * Score (0..5+):
 *   +2.0   register sheet (HQ register + Data Center Devices + serial number + Servers hardware IP)
 *   +1.0   appears in ≥2 distinct source sheets (+0.5 per extra source sheet, cap +2)
 *   +0.5   looks like a physical device name (contains SW/Switch/RT/Core/Router/FW)
 *   +0.25  structural name (contains digits+letters, e.g. "B3-ACC-SW4")
 *   -1.5   hostname-like (dot-separated domain, e.g. DCNAS01.WHILDC.COM)
 *   -0.5   serial/model-like (contains serial codes / model tokens)
 * Confidence = min(0.95, score / 5). Never picks an IP as the canonical name.
 */
import { canonicalKeyOf } from '../normalize/name.js';
import type { NormalizedIp } from '../types/index.js';

export const REGISTER_SHEETS = new Set([
  'Distribution Device ',
  'Access SW',
  'Core Device',
  'Old-Acc-Sw-Sheet',
  'WHIL',
  'WMTC',
  'Data Center Devices',
  'serial number',
]);

export const INVENTORY_SHEETS = new Set([
  'Servers hardware IP',
  'DMZ & MZ',
  'DMZ & MZ (DC,NDC)',
  'MZ-Block200',
  'DMZ-Block117',
  'MZ-Block118',
  'MZ_block 119',
  'DMZ-Block120',
  'DMZ_block 122',
  'DMZ_block 123',
  'MZ-Block-150',
  'DMZ-Block151',
]);

export const NETWORK_SHEETS = new Set(['Network BLocks', 'CCTV', 'WIFI', 'Machine IT ']);

export const HOSTNAME_PATTERN = /^[a-z0-9][a-z0-9-]*(\.[a-z0-9-]+)+$/i;

export interface AliasCandidate {
  rawName: string;
  cleanedName: string;
  confidence: number;
  sourceFile: string;
  sourceSheet: string;
  sourceRow: number;
  sourceSheetCount: number;
  matchSource: 'sheet-register' | 'sheet-inventory' | 'sheet-attach';
  isIp: boolean;
}

function looksHostnameLike(cleaned: string): boolean {
  const n = cleaned.trim();
  if (n.includes(' ')) return false;
  if (HOSTNAME_PATTERN.test(n)) return true;
  // split-domain like "DCNAS01.WHILDC.COM" without dots in parts (e.g. "pos.waltonbd.com")
  const parts = n.split('.');
  return parts.length >= 2 && parts.every((p) => p.length > 1);
}

function isDeviceShaped(cleaned: string): boolean {
  const n = cleaned.toLowerCase();
  return /(sw|switch|router|rtr|rt|core|firewall|fw|fmc|ap|wifi|ac|aci|switch|server|srv|nas|hyperflex|esxi|kibana|grafana|zabbix)/.test(n);
}

export function scoreAlias(candidate: {
  cleanedName: string;
  rawName: string;
  sourceSheet: string;
  sheetNames: Set<string>;
  isIp: boolean;
}): { score: number; matchSource: AliasCandidate['matchSource'] } {
  const cleaned = candidate.cleanedName;
  if (!cleaned || candidate.isIp) return { score: 0, matchSource: 'sheet-attach' };

  let score = 1.0;
  const isRegister = REGISTER_SHEETS.has(candidate.sourceSheet);
  if (isRegister) score += 2.0;
  // distinct sheet boost
  const distinctSheets = candidate.sheetNames.size;
  if (distinctSheets >= 2) score += Math.min(2, 0.5 * (distinctSheets - 1) + 0.5);
  // device-shaped bonus
  if (isDeviceShaped(cleaned)) score += 0.5;
  // structural (contains digits+letters)
  if (/[a-z]/i.test(cleaned) && /\d/.test(cleaned)) score += 0.25;
  // hostname trap
  if (looksHostnameLike(cleaned)) score -= 1.5;
  // serial/model-like
  if (/(^|[\s-])(f\w{7,}|w\w{8,}|f\w{8,}|d\w{8,}|d\w{9,})([\s-]|$)/i.test(cleaned)) score -= 0.5;

  const matchSource: AliasCandidate['matchSource'] = isRegister
    ? 'sheet-register'
    : NETWORK_SHEETS.has(candidate.sourceSheet)
      ? 'sheet-attach'
      : 'sheet-inventory';
  return { score: Math.max(0, score), matchSource };
}

export function makeAliasCandidate(
  cleanedName: string,
  rawName: string,
  sourceSheet: string,
  sourceFile: string,
  sourceRow: number,
  sheetNames: Set<string>,
  isIp: boolean
): AliasCandidate {
  const { score, matchSource } = scoreAlias({
    cleanedName,
    rawName,
    sourceSheet,
    sheetNames,
    isIp,
  });
  return {
    rawName,
    cleanedName,
    confidence: Math.min(0.95, score / 5),
    sourceFile,
    sourceSheet,
    sourceRow,
    sourceSheetCount: sheetNames.size,
    matchSource,
    isIp,
  };
}

export function resolveName(aliases: AliasCandidate[]): { best: AliasCandidate | null; ranking: AliasCandidate[] } {
  const usable = aliases.filter((a) => !a.isIp && a.cleanedName);
  if (usable.length === 0) return { best: null, ranking: [] };
  const ranking = [...usable].sort((a, b) => b.confidence - a.confidence || b.sourceSheetCount - a.sourceSheetCount || a.sourceFile.localeCompare(b.sourceFile) || a.sourceSheet.localeCompare(b.sourceSheet) || a.sourceRow - b.sourceRow);
  return { best: ranking[0]!, ranking };
}

export interface ResolvedAliasGroup {
  canonical: AliasCandidate | null;
  aliases: AliasCandidate[]; // all distinct cleaned names, best first
  canonicalKey: string;
}

/**
 * Group a set of alias candidates by cleaned-name canonical key, then pick the
 * best within the whole IP's alias set. Returns aliases sorted by confidence.
 */
export function resolveAliasesForIp(candidates: AliasCandidate[], ip: string): ResolvedAliasGroup {
  // dedupe identical (cleanedName, source, sheet, row)
  const byKey = new Map<string, AliasCandidate>();
  for (const c of candidates) {
    const key = `${canonicalKeyOf(c.cleanedName)}|${c.sourceFile}|${c.sourceSheet}|${c.sourceRow}`;
    if (!byKey.has(key)) byKey.set(key, c);
  }
  const deduped = [...byKey.values()].filter((c) => c.cleanedName);

  // group by canonicalKey (keeps distinct cleaned names; merging happens downstream)
  const byCanon = new Map<string, AliasCandidate[]>();
  for (const c of deduped) {
    const k = canonicalKeyOf(c.cleanedName) || c.cleanedName;
    const arr = byCanon.get(k) ?? [];
    arr.push(c);
    byCanon.set(k, arr);
  }

  // best candidate overall = best within all distinct cleaned names
  const bestOverall = deduped.length === 0 ? null : deduped.slice().sort((a, b) => b.confidence - a.confidence || b.sourceSheetCount - a.sourceSheetCount)[0]!;

  // aliases to keep: one per canonical key (the best candidate of each key)
  const perCanon: AliasCandidate[] = [];
  for (const arr of byCanon.values()) {
    arr.sort((a, b) => b.confidence - a.confidence || b.sourceSheetCount - a.sourceSheetCount);
    perCanon.push(arr[0]!);
  }
  perCanon.sort((a, b) => b.confidence - a.confidence || b.sourceSheetCount - a.sourceSheetCount);

  return {
    canonical: bestOverall,
    aliases: perCanon,
    canonicalKey: bestOverall ? canonicalKeyOf(bestOverall.cleanedName) : '',
  };
}
