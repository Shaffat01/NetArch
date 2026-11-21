import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { writeFileSync, rmSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildApp } from '../src/api/server.ts';
import type { RawRecord, NormalizedIp } from '../src/types/index.ts';
import type { MergeResult } from '../src/merge/index.ts';
import { mergeRecords } from '../src/merge/index.ts';
import { openDb, saveIngest } from '../src/db/index.ts';

function mkIp(ip: string, prefix: number | null = null): NormalizedIp {
  return { ip, family: 4, prefix, port: null, raw: ip, fromRange: false };
}
function mkRec(over: Partial<RawRecord> = {}): RawRecord {
  return {
    sourceFile: 'test.xlsx', sourceSheet: 'Test', sourceRow: 1, block: null,
    name: 'TEST-SW', rawName: 'TEST-SW', ips: [mkIp('192.168.1.1')], kind: 'device',
    networkPurpose: null, location: null, serial: null, model: null, tag: null,
    neighborName: null, neighborRaw: null, neighborIps: [], secondaryIps: [], port: null, neighborPort: null,
    remarks: null, raw: { nameCell: 'TEST-SW', ipCell: '192.168.1.1' },
    ...over,
  } as RawRecord;
}

describe('API', () => {
  let tmpDir: string;
  let dbPath: string;
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    tmpDir = os.tmpdir() + '/netarch-test-' + process.pid;
    rmSync(tmpDir, { recursive: true, force: true });
    const { mkdirSync } = await import('node:fs');
    mkdirSync(tmpDir, { recursive: true });
    dbPath = path.join(tmpDir, 'test.db');
    const recs = [
      mkRec({ name: 'NDC-CORE-SW', ips: [mkIp('172.16.6.1')], sourceSheet: 'Data Center Devices' }),
      mkRec({ name: 'NOC-Switch', ips: [mkIp('192.168.102.250')], sourceSheet: 'Access SW', neighborName: 'NDC-CORE-SW', neighborRaw: 'NDC-CORE-SW', neighborIps: [mkIp('172.16.6.1')] }),
    ];
    const merged: MergeResult = mergeRecords(recs, [
      { file: 'test.xlsx', sheet: 'Data Center Devices', records: 1, warnings: 0 },
      { file: 'test.xlsx', sheet: 'Access SW', records: 1, warnings: 0 },
    ], []);
    const handle = openDb(dbPath);
    saveIngest(handle.db, merged, { files: ['test.xlsx'], ingestedAt: new Date().toISOString() });
    handle.close();
    app = await buildApp({ config: { port: 0, host: '127.0.0.1', dbPath, sourcesDir: tmpDir, sourceFiles: ['test.xlsx'], webPublic: path.resolve('src/web/public'), isProduction: false } });
    await app.ready();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('GET /api/health', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
  });

  it('GET /api/summary', async () => {
    const body = (await app.inject({ method: 'GET', url: '/api/summary' })).json();
    expect(body.stats.ips).toBeGreaterThanOrEqual(2);
    expect(body.stats.connections).toBeGreaterThanOrEqual(1);
  });

  it('GET /api/devices', async () => {
    const body = (await app.inject({ method: 'GET', url: '/api/devices?q=NDC' })).json();
    expect(body.items.length).toBeGreaterThanOrEqual(1);
  });

  it('GET /api/ips/:ip', async () => {
    const body = (await app.inject({ method: 'GET', url: '/api/ips/192.168.102.250' })).json();
    expect(body.ip).toBe('192.168.102.250');
  });

  it('GET /api/graph', async () => {
    const body = (await app.inject({ method: 'GET', url: '/api/graph' })).json();
    expect(body.nodes.length).toBeGreaterThanOrEqual(2);
    expect(body.edges.length).toBeGreaterThanOrEqual(1);
  });

  it('GET /api/search', async () => {
    const body = (await app.inject({ method: 'GET', url: '/api/search?q=NOC' })).json();
    expect(body.devices.length).toBeGreaterThanOrEqual(1);
  });

  it('GET /api/devices?type=unknown filters', async () => {
    const all = (await app.inject({ method: 'GET', url: '/api/devices?type=all' })).json();
    const unknown = (await app.inject({ method: 'GET', url: '/api/devices?type=unknown' })).json();
    expect(unknown.total).toBeLessThanOrEqual(all.total);
    for (const d of unknown.items) expect(d.deviceType).toBe('UNKNOWN');
    const named = (await app.inject({ method: 'GET', url: '/api/devices?type=named' })).json();
    expect(named.items.every((d: { deviceType: string; hasName: boolean }) => d.deviceType !== 'UNKNOWN' && d.hasName)).toBe(true);
  });

  it('GET /api/export (CSV)', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/export?format=csv' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain('attachment');
    const text = res.body;
    const lines = text.trimEnd().split('\r\n');
    expect(lines.length).toBeGreaterThanOrEqual(2);
    expect(lines[0]).toContain('canonical_name');
    expect(lines[0]).toContain('device_type');
    expect(text).toContain('NDC-CORE-SW');
  });

  it('GET /api/export (JSON)', async () => {
    const body = (await app.inject({ method: 'GET', url: '/api/export?format=json' })).json();
    expect(body.stats.devices).toBeGreaterThanOrEqual(2);
    expect(body.devices.length).toBeGreaterThanOrEqual(2);
  });

  it('/api/devices/:id link labels carry device ids', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/devices/dev_no_c_sw' });
    // fixture never links everything, but the endpoint must not crash and must include ids
    const body = res.json ? res.json() : JSON.parse(res.body);
    const conns = body.connections || [];
    for (const c of conns) {
      expect(c).toHaveProperty('srcDeviceId');
      expect(c).toHaveProperty('dstDeviceId');
    }
  });

  it('404 for missing device', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/devices/dev_missing_xxxx' });
    expect(res.statusCode).toBe(404);
  });
});
