/**
 * Persistence layer (node:sqlite).
 *
 * Prisma/Postgres is the mandated stack but is blocked in this environment
 * (binaries.prisma.sh unreachable over TLS) — see docs/OPEN_QUESTIONS.md.
 * This module isolates ALL SQL behind a tiny interface so a Prisma/Postgres
 * swap is a single-file change.
 *
 * Tables: devices, ips, connections (+ ingest metadata + sheet stats).
 * Aliases live as JSON columns on devices/ips (dense, small, read-mostly).
 */
import { DatabaseSync } from 'node:sqlite';
import type { MasterDevice, MasterIp, MasterConnection, MergeResult } from '../merge/index.js';
import type { DeviceType, RecordKind } from '../types/index.js';

export interface DbHandle {
  db: DatabaseSync;
  close(): void;
}

export function openDb(path: string): DbHandle {
  const db = new DatabaseSync(path);
  db.exec(`
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS devices (
      id TEXT PRIMARY KEY,
      canonical_name TEXT NOT NULL,
      canonical_key TEXT NOT NULL,
      device_type TEXT NOT NULL,
      location TEXT,
      confidence REAL NOT NULL DEFAULT 0,
      model TEXT,
      serial TEXT,
      tag TEXT,
      has_name INTEGER NOT NULL DEFAULT 0,
      has_serial INTEGER NOT NULL DEFAULT 0,
      model_by_source TEXT,
      chain_position INTEGER NOT NULL DEFAULT 0,
      ips TEXT NOT NULL DEFAULT '[]',
      aliases TEXT NOT NULL DEFAULT '[]',
      records INTEGER NOT NULL DEFAULT 0,
      sources TEXT NOT NULL DEFAULT '[]',
      origin_sheets TEXT NOT NULL DEFAULT '[]',
      created_at TEXT,
      updated_at TEXT
    );
    CREATE TABLE IF NOT EXISTS ips (
      ip TEXT PRIMARY KEY,
      family INTEGER NOT NULL,
      prefix INTEGER,
      ports TEXT NOT NULL DEFAULT '[]',
      kind TEXT NOT NULL DEFAULT 'device',
      canonical_name TEXT,
      devices TEXT NOT NULL DEFAULT '[]',
      aliases TEXT NOT NULL DEFAULT '[]',
      records INTEGER NOT NULL DEFAULT 0,
      from_range INTEGER NOT NULL DEFAULT 0,
      sources TEXT NOT NULL DEFAULT '[]',
      origin_sheets TEXT NOT NULL DEFAULT '[]'
    );
    CREATE TABLE IF NOT EXISTS connections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      src_ip TEXT NOT NULL,
      dst_ip TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'CONNECTION',
      match_kind TEXT NOT NULL DEFAULT 'ip',
      evidence TEXT NOT NULL DEFAULT '[]',
      raw TEXT
    );
    CREATE TABLE IF NOT EXISTS sheet_stats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file TEXT NOT NULL,
      sheet TEXT NOT NULL,
      records INTEGER NOT NULL DEFAULT 0,
      warnings INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_ips_devices ON ips (devices);
    CREATE INDEX IF NOT EXISTS idx_connections_src ON connections (src_ip);
    CREATE INDEX IF NOT EXISTS idx_connections_dst ON connections (dst_ip);
  `);
  return { db, close: () => db.close() };
}

function safeJson(v: string | null | undefined): unknown {
  if (!v) return null;
  try { return JSON.parse(v); } catch { return null; }
}

export function clearIngest(db: DatabaseSync): void {
  db.exec(`
    DELETE FROM connections;
    DELETE FROM ips;
    DELETE FROM devices;
    DELETE FROM sheet_stats;
    DELETE FROM meta;
  `);
}

export function saveIngest(db: DatabaseSync, result: MergeResult, fileMeta: { files: string[]; ingestedAt: string }): void {
  clearIngest(db);
  const insertMeta = db.prepare(`INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)`);
  insertMeta.run('ingestedAt', fileMeta.ingestedAt);
  insertMeta.run('files', JSON.stringify(fileMeta.files));
  insertMeta.run('stats', JSON.stringify(result.stats));
  insertMeta.run('warnings', JSON.stringify(result.warnings));

  const insertDevice = db.prepare(`
    INSERT INTO devices (id, canonical_name, canonical_key, device_type, location, confidence, model, serial, tag,
      has_name, has_serial, model_by_source, chain_position, ips, aliases, records, sources, origin_sheets, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertIp = db.prepare(`
    INSERT INTO ips (ip, family, prefix, ports, kind, canonical_name, devices, aliases, records, from_range, sources, origin_sheets)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertConnection = db.prepare(`
    INSERT INTO connections (src_ip, dst_ip, kind, match_kind, evidence, raw) VALUES (?, ?, ?, ?, ?, ?)
  `);
  const insertSheetStat = db.prepare(`INSERT INTO sheet_stats (file, sheet, records, warnings) VALUES (?, ?, ?, ?)`);

  const ingestedAt = fileMeta.ingestedAt;
  for (const d of result.devices) {
    insertDevice.run(
      d.id, d.canonicalName, d.canonicalKey, d.deviceType, d.location, d.confidence, d.model, d.serial, d.tag,
      d.hasName ? 1 : 0, d.hasSerial ? 1 : 0, d.modelBySource, d.chainPosition,
      JSON.stringify(d.ips), JSON.stringify(d.aliases), d.records, JSON.stringify(d.sources), JSON.stringify(d.originSheets),
      ingestedAt, ingestedAt
    );
  }
  for (const i of result.ips) {
    insertIp.run(
      i.ip, i.family, i.prefix, JSON.stringify(i.ports), i.kind, i.canonicalName,
      JSON.stringify(i.devices), JSON.stringify(i.aliases), i.records, i.fromRange ? 1 : 0,
      JSON.stringify(i.sources), JSON.stringify(i.originSheets)
    );
  }
  for (const c of result.connections) {
    insertConnection.run(c.srcIp, c.dstIp, c.kind, c.matchKind, JSON.stringify(c.evidence), c.raw);
  }
  for (const s of result.sheetStats) {
    insertSheetStat.run(s.file, s.sheet, s.records, s.warnings);
  }
}

export function getMeta(db: DatabaseSync, key: string): string | null {
  const row = db.prepare(`SELECT value FROM meta WHERE key = ?`).get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function validateDb(db: DatabaseSync): { ok: boolean; details: string[] } {
  const issues: string[] = [];
  const deviceCount = db.prepare(`SELECT COUNT(*) AS c FROM devices`).get() as { c: number };
  const ipCount = db.prepare(`SELECT COUNT(*) AS c FROM ips`).get() as { c: number };
  const connCount = db.prepare(`SELECT COUNT(*) AS c FROM connections`).get() as { c: number };
  const meta = getMeta(db, 'ingestedAt');
  if (!meta) issues.push('missing ingest metadata (ingestedAt)');
  if (deviceCount.c === 0) issues.push('devices table is empty');
  if (ipCount.c === 0) issues.push('ips table is empty');
  if (connCount.c === 0) issues.push('connections table is empty (connection sheets may be under-populated)');
  return { ok: issues.length === 0, details: issues };
}

export function loadDevices(db: DatabaseSync): MasterDevice[] {
  const rows = db.prepare(`SELECT * FROM devices ORDER BY
    has_name DESC,
    records DESC,
    confidence DESC,
    canonical_name ASC`).all() as Array<Record<string, unknown>>;
  return rows.map((r) => ({
    id: r.id as string,
    canonicalName: r.canonical_name as string,
    canonicalKey: r.canonical_key as string,
    deviceType: r.device_type as DeviceType,
    location: (r.location as string) ?? null,
    confidence: r.confidence as number,
    model: (r.model as string) ?? null,
    serial: (r.serial as string) ?? null,
    tag: (r.tag as string) ?? null,
    ips: safeJson(r.ips as string) as string[] ?? [],
    aliases: safeJson(r.aliases as string) as never[] ?? [],
    records: r.records as number,
    sources: safeJson(r.sources as string) as string[] ?? [],
    originSheets: safeJson(r.origin_sheets as string) as string[] ?? [],
    hasName: !!r.has_name,
    hasSerial: !!r.has_serial,
    modelBySource: (r.model_by_source as string) ?? null,
    chainPosition: r.chain_position as number,
  }));
}

export function loadIps(db: DatabaseSync): MasterIp[] {
  const rows = db.prepare(`SELECT * FROM ips ORDER BY family ASC, ip ASC`).all() as Array<Record<string, unknown>>;
  return rows.map((r) => ({
    ip: r.ip as string,
    family: r.family as 4 | 6,
    prefix: r.prefix as number | null,
    ports: safeJson(r.ports as string) as number[] ?? [],
    kind: r.kind as RecordKind,
    devices: safeJson(r.devices as string) as string[] ?? [],
    canonicalName: (r.canonical_name as string) ?? null,
    aliases: safeJson(r.aliases as string) as never[] ?? [],
    records: r.records as number,
    fromRange: !!r.from_range,
    sources: safeJson(r.sources as string) as string[] ?? [],
    originSheets: safeJson(r.origin_sheets as string) as string[] ?? [],
  }));
}

export function loadConnections(db: DatabaseSync): MasterConnection[] {
  const rows = db.prepare(`SELECT src_ip, dst_ip, kind, match_kind, evidence, raw FROM connections ORDER BY src_ip ASC, dst_ip ASC`).all() as Array<Record<string, unknown>>;
  return rows.map((r) => ({
    srcIp: r.src_ip as string,
    dstIp: r.dst_ip as string,
    kind: (r.kind as 'CONNECTION' | 'TUNNEL') ?? 'CONNECTION',
    matchKind: r.match_kind as 'ip' | 'name',
    evidence: safeJson(r.evidence as string) as Array<{ sheet: string; file: string; row: number; detail: string }> ?? [],
    raw: (r.raw as string) ?? '',
  }));
}

export function getDevice(db: DatabaseSync, id: string): MasterDevice | null {
  const row = db.prepare(`SELECT * FROM devices WHERE id = ?`).get(id) as Record<string, unknown> | undefined;
  if (!row) return null;
  return {
    id: row.id as string,
    canonicalName: row.canonical_name as string,
    canonicalKey: row.canonical_key as string,
    deviceType: row.device_type as DeviceType,
    location: (row.location as string) ?? null,
    confidence: row.confidence as number,
    model: (row.model as string) ?? null,
    serial: (row.serial as string) ?? null,
    tag: (row.tag as string) ?? null,
    ips: safeJson(row.ips as string) as string[] ?? [],
    aliases: safeJson(row.aliases as string) as never[] ?? [],
    records: row.records as number,
    sources: safeJson(row.sources as string) as string[] ?? [],
    originSheets: safeJson(row.origin_sheets as string) as string[] ?? [],
    hasName: !!row.has_name,
    hasSerial: !!row.has_serial,
    modelBySource: (row.model_by_source as string) ?? null,
    chainPosition: row.chain_position as number,
  };
}

export function getIp(db: DatabaseSync, ip: string): MasterIp | null {
  const row = db.prepare(`SELECT * FROM ips WHERE ip = ?`).get(ip) as Record<string, unknown> | undefined;
  if (!row) return null;
  return {
    ip: row.ip as string,
    family: row.family as 4 | 6,
    prefix: row.prefix as number | null,
    ports: safeJson(row.ports as string) as number[] ?? [],
    kind: row.kind as RecordKind,
    devices: safeJson(row.devices as string) as string[] ?? [],
    canonicalName: (row.canonical_name as string) ?? null,
    aliases: safeJson(row.aliases as string) as never[] ?? [],
    records: row.records as number,
    fromRange: !!row.from_range,
    sources: safeJson(row.sources as string) as string[] ?? [],
    originSheets: safeJson(row.origin_sheets as string) as string[] ?? [],
  };
}

export function listConnectionsForDevice(db: DatabaseSync, deviceId: string, devices: MasterDevice[]): MasterConnection[] {
  const d = devices.find((x) => x.id === deviceId);
  if (!d || d.ips.length === 0) return [];
  const ipSet = new Set(d.ips);
  const all = loadConnections(db);
  return all.filter((c) => ipSet.has(c.srcIp) || ipSet.has(c.dstIp));
}

export function searchDevices(db: DatabaseSync, q: string, limit = 50): MasterDevice[] {
  const devices = loadDevices(db);
  const needle = q.trim().toLowerCase();
  if (!needle) return devices.slice(0, limit);
  const out: MasterDevice[] = [];
  for (const d of devices) {
    if (d.canonicalName.toLowerCase().includes(needle)) { out.push(d); continue; }
    if (d.canonicalKey.toLowerCase().includes(needle)) { out.push(d); continue; }
    if (d.aliases.some((a) => a.cleanedName.toLowerCase().includes(needle))) { out.push(d); continue; }
    if (d.ips.some((ip) => ip.includes(needle))) { out.push(d); continue; }
    if (d.serial && d.serial.toLowerCase().includes(needle)) { out.push(d); continue; }
    if (d.model && d.model.toLowerCase().includes(needle)) { out.push(d); continue; }
    if (d.location && d.location.toLowerCase().includes(needle)) { out.push(d); continue; }
    if (out.length >= limit) break;
  }
  return out.slice(0, limit);
}

export function searchIps(db: DatabaseSync, q: string, limit = 100): MasterIp[] {
  const ips = loadIps(db);
  const needle = q.trim().toLowerCase();
  if (!needle) return ips.slice(0, limit);
  const out: MasterIp[] = [];
  for (const i of ips) {
    if (i.ip.toLowerCase().includes(needle)) { out.push(i); continue; }
    if (i.canonicalName && i.canonicalName.toLowerCase().includes(needle)) { out.push(i); continue; }
    if (i.aliases.some((a) => a.cleanedName.toLowerCase().includes(needle))) { out.push(i); continue; }
    if (out.length >= limit) break;
  }
  return out.slice(0, limit);
}

export function sheetStats(db: DatabaseSync): Array<{ file: string; sheet: string; records: number; warnings: number }> {
  const rows = db.prepare(`SELECT file, sheet, records, warnings FROM sheet_stats ORDER BY file ASC, sheet ASC`).all() as Array<Record<string, unknown>>;
  return rows.map((r) => ({ file: r.file as string, sheet: r.sheet as string, records: r.records as number, warnings: r.warnings as number }));
}

export function summary(db: DatabaseSync): Record<string, unknown> {
  const ingestedAt = getMeta(db, 'ingestedAt');
  const stats = safeJson(getMeta(db, 'stats') ?? '') as Record<string, number> | null;
  const fileList = safeJson(getMeta(db, 'files') ?? '') as string[] | null;
  return {
    ingestedAt,
    files: fileList ?? [],
    stats: stats ?? null,
  };
}
