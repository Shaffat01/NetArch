/**
 * Merge + resolve layer.
 *
 * Takes RawRecords from the ingest layer and builds:
 *   - devices: canonical device identity (best name, type, aliases), IP-keyed
 *   - ips: one master row per normalized IP (canonical name, aliases, devices)
 *   - connections: IP-keyed edges (src/dst, match kind, evidence)
 *
 * Identity is IP-first: the same device (name) with multiple IPs is one device;
 * unnamed records produce IP-only devices; names that match one IP are kept as aliases.
 */
import { canonicalKeyOf } from '../normalize/name.js';
import type { NormalizedIp, RecordKind, DeviceType, RawRecord } from '../types/index.js';
import { deviceTypeOf, pickDeviceType, chainPosition } from '../resolve/device-type.js';
import type { AliasCandidate } from '../resolve/canonical.js';
import { scoreAlias } from '../resolve/canonical.js';
import { cleanName } from '../normalize/name.js';

export interface MasterDevice {
  id: string;
  canonicalName: string;
  canonicalKey: string;
  deviceType: DeviceType;
  location: string | null;
  confidence: number;
  model: string | null;
  serial: string | null;
  tag: string | null;
  ips: string[];
  aliases: AliasCandidate[];
  records: number;
  sources: string[];
  originSheets: string[];
  hasName: boolean;
  hasSerial: boolean;
  modelBySource: string | null;
  chainPosition: number;
}

export interface MasterIp {
  ip: string;
  family: 4 | 6;
  prefix: number | null;
  ports: number[];
  kind: RecordKind;
  devices: string[];
  canonicalName: string | null;
  aliases: AliasCandidate[];
  records: number;
  fromRange: boolean;
  sources: string[];
  originSheets: string[];
}

export interface MasterConnection {
  srcIp: string;
  dstIp: string;
  kind: 'CONNECTION' | 'TUNNEL';
  matchKind: 'ip' | 'name';
  evidence: Array<{ sheet: string; file: string; row: number; detail: string }>;
  raw: string;
}

export interface MergeResult {
  devices: MasterDevice[];
  ips: MasterIp[];
  connections: MasterConnection[];
  networkStats: { networkRecords: number; deviceRecords: number; serialRecords: number };
  warnings: string[];
  stats: {
    sheets: number;
    records: number;
    ips: number;
    devices: number;
    connections: number;
    aliases: number;
  };
  sheetStats: Array<{ file: string; sheet: string; records: number; warnings: number }>;
}

function deviceIdForKey(canonicalKey: string): string {
  return `dev_${canonicalKey}`;
}

function deviceIdForIp(ip: string): string {
  return `dev_ip_${ip.replace(/[^a-z0-9.-]/g, '_')}`;
}

interface IpAcc {
  ip: string;
  family: 4 | 6;
  prefix: number | null;
  ports: Set<number>;
  kind: RecordKind;
  deviceIds: Set<string>;
  aliases: AliasCandidate[];
  records: number;
  fromRange: boolean;
  sources: Set<string>;
  originSheets: Set<string>;
}

interface DeviceAcc {
  id: string;
  canonicalName: string;
  canonicalKey: string;
  deviceTypes: DeviceType[];
  location: string | null;
  locationCounts: Map<string, number>;
  confidence: number;
  model: string | null;
  serial: string | null;
  tag: string | null;
  ips: string[];
  ipSources: Map<string, number>;
  aliases: AliasCandidate[];
  records: number;
  sources: Set<string>;
  originSheets: Set<string>;
  hasName: boolean;
  hasSerial: boolean;
  isIpOnly: boolean;
}

function ensureDevice(devices: Map<string, DeviceAcc>, key: string, name: string | null): DeviceAcc {
  const existing = devices.get(key);
  if (existing) return existing;
  const id = name ? deviceIdForKey(key) : deviceIdForIp(key.replace(/^ip:/, ''));
  const acc: DeviceAcc = {
    id,
    canonicalName: name ?? key.replace(/^ip:/, ''),
    canonicalKey: key,
    deviceTypes: [],
    location: null,
    locationCounts: new Map(),
    confidence: 0,
    model: null,
    serial: null,
    tag: null,
    ips: [],
    ipSources: new Map(),
    aliases: [],
    records: 0,
    sources: new Set(),
    originSheets: new Set(),
    hasName: !!name,
    hasSerial: false,
    isIpOnly: !name,
  };
  devices.set(key, acc);
  return acc;
}

function aliasForRecord(
  rec: RawRecord,
  deviceName: string | null,
  ip: string,
  sheetNames: Set<string>
): AliasCandidate | null {
  const cleaned = deviceName ?? (rec.raw.hostname || null);
  if (!cleaned) return null;
  const isIp = netFamily(ip) === 4 && /^\d{1,3}(\.\d{1,3}){3}$/.test(cleaned);
  const score = scoreAlias({
    cleanedName: cleaned,
    rawName: rec.rawName ?? cleaned,
    sourceSheet: rec.sourceSheet,
    sheetNames,
    isIp: false,
  });
  return {
    rawName: rec.rawName ?? cleaned,
    cleanedName: cleaned,
    confidence: Math.min(0.95, score.score / 5),
    sourceFile: rec.sourceFile,
    sourceSheet: rec.sourceSheet,
    sourceRow: rec.sourceRow,
    sourceSheetCount: sheetNames.size,
    matchSource: score.matchSource,
    isIp,
  };
}

function netFamily(ip: string): 4 | 6 {
  return ip.includes(':') ? 6 : 4;
}

function topOf(m: Map<string, number>): string | null {
  if (m.size === 0) return null;
  let best: string | null = null;
  let bestCount = -1;
  for (const [k, v] of m) if (v > bestCount) { best = k; bestCount = v; }
  return best;
}

function pickBestAlias(aliases: AliasCandidate[]): AliasCandidate | null {
  const usable = aliases.filter((a) => !a.isIp && a.cleanedName);
  if (usable.length === 0) return null;
  const sorted = [...usable].sort((a, b) => b.confidence - a.confidence || b.sourceSheetCount - a.sourceSheetCount);
  return sorted[0]!;
}

function sortedUniqueAliases(aliases: AliasCandidate[], _includeRow = true): AliasCandidate[] {
  // Dedupe by (cleanedName, sourceFile, sourceSheet) — rows of the same name+sheet are equivalent evidence
  const byKey = new Map<string, AliasCandidate>();
  for (const a of aliases) {
    if (!a.cleanedName) continue;
    const key = `${canonicalKeyOf(a.cleanedName)}|${a.sourceFile}|${a.sourceSheet}`;
    const existing = byKey.get(key);
    if (!existing || a.confidence > existing.confidence) byKey.set(key, a);
  }
  return [...byKey.values()].sort((a, b) => b.confidence - a.confidence || b.sourceSheetCount - a.sourceSheetCount || a.sourceFile.localeCompare(b.sourceFile) || a.sourceSheet.localeCompare(b.sourceSheet) || a.sourceRow - b.sourceRow);
}

function pickPrimaryIp(acc: DeviceAcc): string | null {
  if (acc.ips.length === 0) return null;
  let best = acc.ips[0]!;
  let bestCount = -1;
  for (const ip of acc.ips) {
    const c = acc.ipSources.get(ip) ?? 0;
    if (c > bestCount) { best = ip; bestCount = c; }
  }
  return best;
}

export function mergeRecords(records: RawRecord[], sheetStats: MergeResult['sheetStats'], warnings: string[]): MergeResult {
  const devices = new Map<string, DeviceAcc>();
  const devicesById = new Map<string, DeviceAcc>();
  const ips = new Map<string, IpAcc>();
  const connections = new Map<string, MasterConnection>();
  let deviceRecords = 0;
  let networkRecords = 0;
  let serialRecords = 0;

  // First pass: distinct source sheets per canonical key
  const sheetNameIndex = new Map<string, Set<string>>();
  for (const rec of records) {
    const cleaned = rec.name ?? rec.raw.hostname ?? null;
    if (!cleaned) continue;
    const key = canonicalKeyOf(cleaned);
    if (!key) continue;
    const set = sheetNameIndex.get(key) ?? new Set<string>();
    set.add(rec.sourceSheet);
    sheetNameIndex.set(key, set);
  }

  for (const rec of records) {
    if (rec.kind === 'serial') {
      serialRecords++;
      const cleaned = rec.name ?? null;
      const key = canonicalKeyOf(cleaned ?? '');
      if (!key) continue;
      const device = ensureDevice(devices, key, cleaned);
      devicesById.set(device.id, device);
      device.hasSerial = true;
      device.serial = rec.serial ?? device.serial;
      device.model = rec.model ?? device.model;
      device.records++;
      device.sources.add(rec.sourceFile);
      device.originSheets.add(rec.sourceSheet);
      const alias = aliasForRecord(rec, cleaned, rec.ips[0]?.ip ?? '', sheetNameIndex.get(key) ?? new Set([rec.sourceSheet]));
      if (alias) {
        device.aliases.push(alias);
        device.hasName = true;
        device.confidence = Math.max(device.confidence, alias.confidence);
      }
      continue;
    }

    const cleanedName = rec.name ?? null;
    const hostname = rec.raw.hostname?.trim() || null;
    const useName = cleanedName ?? hostname;
    const key = canonicalKeyOf(useName ?? '');
    const sheetNames = sheetNameIndex.get(key) ?? new Set([rec.sourceSheet]);

    // named device: one device per canonical key; unnamed: one device per IP
    const namedDevice = key ? ensureDevice(devices, key, cleanedName ?? hostname) : null;
    if (namedDevice) devicesById.set(namedDevice.id, namedDevice);

    // alias: record contributes one alias (prefer record name; else hostname)
    const alias = aliasForRecord(rec, cleanedName ?? hostname, rec.ips[0]?.ip ?? '', sheetNames);

    if (namedDevice) {
      // device-level merge
      const device = namedDevice;
      if (cleanedName) device.hasName = true;
      device.records++;
      device.sources.add(rec.sourceFile);
      device.originSheets.add(rec.sourceSheet);
      if (rec.model) device.model = rec.model;
      if (rec.serial) {
        device.serial = rec.serial;
        device.hasSerial = true;
      }
      if (rec.tag) device.tag = rec.tag;
      if (rec.location) device.locationCounts.set(rec.location, (device.locationCounts.get(rec.location) ?? 0) + 1);
      if (alias) device.aliases.push(alias);
      device.confidence = Math.max(device.confidence, alias?.confidence ?? 0);
      const t = deviceTypeOf(cleanedName ?? hostname, rec.model, rec.sourceSheet, rec.kind);
      device.deviceTypes.push(t);
      if (rec.kind === 'network') networkRecords++;
      if (rec.kind === 'device') deviceRecords++;
      // register neighbor-based connection edges
      wireConnection(rec, connections, devices);
    }

    // per-IP processing
    const allIps: NormalizedIp[] = [...rec.ips, ...rec.secondaryIps];
    for (const ipObj of allIps) {
      const ipStr = ipObj.ip;
      const k = `${ipStr}|${ipObj.prefix ?? ''}`;
      const ipAcc = (ips.get(k) ?? {
        ip: ipStr, family: ipObj.family, prefix: ipObj.prefix, ports: new Set<number>(),
        kind: rec.kind, deviceIds: new Set<string>(), aliases: [] as AliasCandidate[],
        records: 0, fromRange: ipObj.fromRange, sources: new Set<string>(), originSheets: new Set<string>(),
      }) as IpAcc;
      if (ipAcc.prefix === null && ipObj.prefix !== null) ipAcc.prefix = ipObj.prefix;
      // network wins over device (more specific)
      if (rec.kind === 'network') ipAcc.kind = 'network';
      if (ipObj.port) ipAcc.ports.add(ipObj.port);
      ipAcc.records++;
      ipAcc.fromRange = ipAcc.fromRange || ipObj.fromRange;
      ipAcc.sources.add(rec.sourceFile);
      ipAcc.originSheets.add(rec.sourceSheet);
      // device binding for this IP
      let ipDevice = namedDevice;
      if (!namedDevice) {
        // IP-only record: if the IP is already claimed by a named device,
        // join that device instead of creating an orphaned per-IP placeholder.
        const existingNamed = [...ipAcc.deviceIds]
          .map((id) => devicesById.get(id))
          .find((d) => d && d.hasName);
        if (existingNamed) {
          ipDevice = existingNamed;
        } else {
          const placeholder = ensureDevice(devices, `ip:${ipStr}`, null);
          devicesById.set(placeholder.id, placeholder);
          placeholder.isIpOnly = true;
          placeholder.records++;
          placeholder.sources.add(rec.sourceFile);
          placeholder.originSheets.add(rec.sourceSheet);
          const t = deviceTypeOf(null, rec.model, rec.sourceSheet, rec.kind);
          placeholder.deviceTypes.push(t);
          ipDevice = placeholder;
        }
      }
      if (namedDevice) devicesById.set(namedDevice.id, namedDevice);
      ipAcc.deviceIds.add(ipDevice!.id);
      if (alias) ipAcc.aliases.push(alias);
      ips.set(k, ipAcc);

      if (!namedDevice) {
        // per-IP device (placeholder or existing named device) owns the IP
        if (!ipDevice!.ips.includes(ipStr)) ipDevice!.ips.push(ipStr);
        ipDevice!.ipSources.set(ipStr, (ipDevice!.ipSources.get(ipStr) ?? 0) + 1);
      } else {
        if (!namedDevice.ips.includes(ipStr)) namedDevice.ips.push(ipStr);
        namedDevice.ipSources.set(ipStr, (namedDevice.ipSources.get(ipStr) ?? 0) + 1);
      }
    }
  }

  // assemble outputs
  const sortedIps = [...ips.values()].sort((a, b) => {
    if (a.family !== b.family) return a.family === 4 ? -1 : 1;
    return a.ip < b.ip ? -1 : a.ip > b.ip ? 1 : 0;
  });
  const prefixByIp = new Map([...ips.values()].map((a) => [a.ip, a.prefix] as const));
  const devicesOut: MasterDevice[] = [];
  for (const acc of devices.values()) {
    const canonical = pickBestAlias(acc.aliases);
    const aliases = sortedUniqueAliases(acc.aliases, true);
    const deviceType = pickDeviceType(acc.deviceTypes);
    const location = topOf(acc.locationCounts);
    // IP-only placeholder device: surface the subnet (or first IP) incl. prefix
    let fallbackName = acc.canonicalName;
    if (!acc.hasName) {
      const first = acc.ips[0];
      if (first) {
        const prefix = prefixByIp.get(first);
        fallbackName = prefix != null ? `${first}/${prefix}` : first;
      }
    }
    devicesOut.push({
      id: acc.id,
      canonicalName: canonical?.cleanedName ?? fallbackName,
      canonicalKey: acc.canonicalKey,
      deviceType,
      location,
      confidence: canonical?.confidence ?? 0,
      model: acc.model,
      serial: acc.serial,
      tag: acc.tag,
      ips: acc.ips,
      aliases,
      records: acc.records,
      sources: [...acc.sources].sort(),
      originSheets: [...acc.originSheets].sort(),
      hasName: acc.hasName,
      hasSerial: acc.hasSerial,
      modelBySource: acc.model,
      chainPosition: chainPosition(deviceType),
    });
  }
  devicesOut.sort((a, b) => (a.canonicalName < b.canonicalName ? -1 : a.canonicalName > b.canonicalName ? 1 : 0));

  const ipsOut: MasterIp[] = sortedIps.map((a) => {
    const aliases = sortedUniqueAliases(a.aliases, true);
    const canonical = aliases.length ? aliases[0]! : null;
    const firstDevice = devicesOut.find((d) => d.ips.includes(a.ip));
    return {
      ip: a.ip,
      family: a.family,
      prefix: a.prefix,
      ports: [...a.ports].sort((x, y) => x - y),
      kind: a.kind,
      devices: [...a.deviceIds],
      canonicalName: canonical?.cleanedName ?? (firstDevice ? firstDevice.canonicalName : null),
      aliases,
      records: a.records,
      fromRange: a.fromRange,
      sources: [...a.sources].sort(),
      originSheets: [...a.originSheets].sort(),
    };
  });

  const connectionsOut: MasterConnection[] = [...connections.values()].sort((a, b) => a.srcIp === b.srcIp ? (a.dstIp < b.dstIp ? -1 : 1) : (a.srcIp < b.srcIp ? -1 : 1));

  const stats = {
    sheets: sheetStats.length,
    records: records.length,
    ips: ipsOut.length,
    devices: devicesOut.length,
    connections: connectionsOut.length,
    aliases: ipsOut.reduce((n, i) => n + i.aliases.length, 0),
  };

  return {
    devices: devicesOut,
    ips: ipsOut,
    connections: connectionsOut,
    networkStats: { networkRecords, deviceRecords, serialRecords },
    warnings,
    stats,
    sheetStats: [...sheetStats],
  };
}

function wireConnection(rec: RawRecord, connections: Map<string, MasterConnection>, devices: Map<string, DeviceAcc>): void {
  if (rec.kind === 'network') return;
  const localIpObj = rec.ips[0];
  if (!localIpObj) return;
  const srcIp = localIpObj.ip;

  if (rec.neighborIps.length > 0) {
    for (const ni of rec.neighborIps) {
      if (ni.ip === srcIp) continue;
      const edgeKey = `${srcIp}|${ni.ip}|ip`;
      const existing = connections.get(edgeKey);
      const detail = rec.neighborRaw ?? rec.raw.neighborName ?? '';
      if (existing) existing.evidence.push({ sheet: rec.sourceSheet, file: rec.sourceFile, row: rec.sourceRow, detail });
      else connections.set(edgeKey, { srcIp, dstIp: ni.ip, kind: 'CONNECTION', matchKind: 'ip', evidence: [{ sheet: rec.sourceSheet, file: rec.sourceFile, row: rec.sourceRow, detail }], raw: rec.neighborRaw ?? rec.neighborName ?? `${srcIp} -> ${ni.ip}` });
    }
  } else if (rec.neighborName) {
    const neighborKey = canonicalKeyOf(rec.neighborName);
    if (!neighborKey) return;
    // find the neighbor's device (by key) — try exact key, else aliases match
    let neighborDevice = devices.get(neighborKey) ?? devices.get(`ip:${neighborKey}`);
    if (!neighborDevice) {
      for (const d of devices.values()) {
        if (d.canonicalKey === neighborKey || d.aliases.some((a) => canonicalKeyOf(a.cleanedName) === neighborKey)) {
          neighborDevice = d;
          break;
        }
      }
    }
    if (!neighborDevice || neighborDevice.ips.length === 0) return;
    for (const ni of neighborDevice.ips) {
      if (ni === srcIp) continue;
      const edgeKey = `${srcIp}|${ni}|name`;
      const existing = connections.get(edgeKey);
      const detail = rec.neighborRaw ?? rec.neighborName ?? '';
      if (existing) existing.evidence.push({ sheet: rec.sourceSheet, file: rec.sourceFile, row: rec.sourceRow, detail });
      else connections.set(edgeKey, { srcIp, dstIp: ni, kind: 'CONNECTION', matchKind: 'name', evidence: [{ sheet: rec.sourceSheet, file: rec.sourceFile, row: rec.sourceRow, detail }], raw: rec.neighborRaw ?? `${srcIp} -> ${ni}` });
    }
  }
}
