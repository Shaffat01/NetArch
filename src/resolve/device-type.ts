/**
 * Device type derivation. Explicit mapping from evidence only, never guessed.
 * Types are kept on devices as a best-effort classification; uncertain devices stay UNKNOWN.
 */
import type { DeviceType, RawRecord } from '../types/index.js';

export function deviceTypeOf(name: string | null, model: string | null, sourceSheet: string, kind: string): DeviceType {
  const n = (name ?? '').toLowerCase();
  const m = (model ?? '').toLowerCase();
  const s = sourceSheet.toLowerCase();

  // network/subnet records are not devices
  if (kind === 'network') return 'UNKNOWN';

  // serial/model model-token based
  if (/asr\s*1000|asr1001|core[-\s_]?rt|core[-\s_]?rt[\s_-]/.test(n) || /asr\s*1000/.test(m)) return 'CORE_RT';
  if (/firewall|fmc\b|fw\b|f5\b|api[c|c]/.test(n) && /(firewall|fmc|fw)/.test(n)) return 'CORE_DEVICE';
  if (/n9k|core[-\s_]?sw|core[-\s_]?switch|c9500|spine|leaf/.test(n)) return 'CORE_DEVICE';
  if (/core[-\s_]?rt|asr/.test(n + m)) return 'CORE_RT';
  if (/distribution|dist[-\s_]?sw|dist[-\s_]?switch/.test(n)) return 'DIST_SW';
  if (/access|acc[-\s_]?sw|acc[-\s_]?switch|l3[-\s_]?acc|l3[-\s_]?access/.test(n)) return 'ACCESS_SW';
  if (s === 'old-acc-sw-sheet') return 'ACCESS_SW';
  if (s === 'access sw') return 'ACCESS_SW';
  if (s.startsWith('distribution')) return 'DIST_SW';
  if (s === 'core device') return 'CORE_DEVICE';
  if (/\bsw\b|\bswitch\b|\bsw\d/.test(n)) return 'SW';
  if (s.includes('data center devices') || s.includes('serial number')) {
    if (/core/.test(n)) return 'CORE_DEVICE';
    if (/access/.test(n)) return 'ACCESS_SW';
    if (/dist/.test(n)) return 'DIST_SW';
  }
  return 'UNKNOWN';
}

/**
 * Priority order used when merging devices: the highest-priority type wins.
 * (Rule: more upstream/specific beats generic.)
 */
export const TYPE_PRIORITY: DeviceType[] = ['CORE_DEVICE', 'CORE_RT', 'ISP', 'DIST_SW', 'SW', 'ACCESS_SW', 'UNKNOWN'];
export function pickDeviceType(types: DeviceType[]): DeviceType {
  for (const t of TYPE_PRIORITY) if (types.includes(t)) return t;
  return 'UNKNOWN';
}

/**
 * Chain position for directional reasoning (upstream toward ISP).
 * Higher position = closer to ISP. UNKNOWN → 0 (attached at access layer).
 */
export function chainPosition(type: DeviceType): number {
  switch (type) {
    case 'ACCESS_SW': return 0;
    case 'DIST_SW': return 1;
    case 'SW': return 2;
    case 'CORE_RT': return 3;
    case 'CORE_DEVICE': return 4;
    case 'ISP': return 5;
    default: return 0;
  }
}
