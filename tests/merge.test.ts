import { describe, it, expect } from 'vitest';
import { mergeRecords } from '../src/merge/index.ts';
import type { RawRecord, NormalizedIp } from '../src/types/index.ts';

function ip(ip: string, prefix: number | null = null): NormalizedIp {
  return { ip, family: 4, prefix, port: null, raw: ip, fromRange: false };
}

function rec(partial: Partial<RawRecord> & { name: string | null }): RawRecord {
  return {
    sourceFile: 'test.xlsx',
    sourceSheet: 'Test Sheet',
    sourceRow: 1,
    block: null,
    rawName: partial.name ?? null,
    ips: [ip('192.168.1.1')],
    kind: 'device',
    networkPurpose: null,
    location: null,
    serial: null,
    model: null,
    tag: null,
    neighborName: null,
    neighborRaw: null,
    neighborIps: [],
    secondaryIps: [],
    port: null,
    neighborPort: null,
    remarks: null,
    raw: { nameCell: partial.name ?? '', ipCell: '192.168.1.1' },
    ...partial,
  } as RawRecord;
}

describe('mergeRecords — IP-first identity', () => {
  it('two names for one IP merge into one device (register sheet wins)', () => {
    const r1 = rec({ name: 'NDC-CORE-SW', ips: [ip('172.16.6.1')], sourceSheet: 'Data Center Devices', sourceRow: 7 });
    const r2 = rec({ name: 'NDC_Core SW', ips: [ip('172.16.6.1')], sourceSheet: 'WHIL', sourceRow: 1 });
    const out = mergeRecords([r1, r2], [
      { file: 'test.xlsx', sheet: 'Data Center Devices', records: 1, warnings: 0 },
      { file: 'test.xlsx', sheet: 'WHIL', records: 1, warnings: 0 },
    ], []);
    expect(out.ips).toHaveLength(1);
    expect(out.devices).toHaveLength(1);
    expect(out.devices[0].canonicalName).toBe('NDC-CORE-SW');
    expect(out.devices[0].aliases.length).toBeGreaterThanOrEqual(1);
  });

  it('one device with multiple IPs stays one device (CISCO Hyperflex DC)', () => {
    const recs = [
      rec({ name: 'CISCO Hyperflex DC', ips: [ip('172.16.12.50')], sourceSheet: 'Servers hardware IP', sourceRow: 2 }),
      rec({ name: 'CISCO Hyperflex DC', ips: [ip('172.16.12.51')], sourceSheet: 'Servers hardware IP', sourceRow: 3 }),
    ];
    const out = mergeRecords(recs, [], []);
    expect(out.devices).toHaveLength(1);
    expect(out.devices[0].ips).toEqual(['172.16.12.50', '172.16.12.51']);
    expect(out.ips).toHaveLength(2);
    expect(out.ips.find((i) => i.ip === '172.16.12.50')?.devices).toContain('dev_cisco_hyperflex_dc');
  });

  it('device type comes from register sheets', () => {
    const r = rec({ name: 'WHIL-MB-F1-ACC-SW6', ips: [ip('192.168.101.248')], sourceSheet: 'WHIL', sourceRow: 6 });
    const out = mergeRecords([r], [], []);
    expect(out.devices[0].deviceType).toBe('ACCESS_SW');
  });

  it('connections: neighbor IP edge', () => {
    const r = rec({
      name: 'A-DIST-SW', ips: [ip('192.168.101.2')], sourceSheet: 'Distribution Device',
      neighborName: 'NDC-CORE-SW', neighborRaw: 'NDC-CORE-SW', neighborIps: [ip('172.16.6.1')],
      sourceRow: 4,
    });
    const out = mergeRecords([r], [], []);
    expect(out.connections).toHaveLength(1);
    expect(out.connections[0]).toMatchObject({ srcIp: '192.168.101.2', dstIp: '172.16.6.1', matchKind: 'ip' });
  });

  it('connections: name-only edge resolved via neighbors', () => {
    const a = rec({ name: 'A-ACCESS-SW', ips: [ip('192.168.101.2')], sourceSheet: 'Access SW', neighborName: 'B-DIST-SW', neighborRaw: 'B-DIST-SW', sourceRow: 1 });
    const b = rec({ name: 'B-DIST-SW', ips: [ip('192.168.101.1')], sourceSheet: 'Access SW', sourceRow: 2 });
    const out = mergeRecords([b, a], [], []);
    expect(out.connections.length).toBeGreaterThanOrEqual(1);
    const edge = out.connections.find((c) => c.srcIp === '192.168.101.2' && c.dstIp === '192.168.101.1');
    expect(edge).toBeTruthy();
    expect(edge?.matchKind).toBe('name');
  });

  it('IP-only record creates per-IP device', () => {
    const r = rec({ name: null, rawName: null, ips: [ip('10.8.151.20')], sourceSheet: 'DMZ-Block151', sourceRow: 8 });
    const out = mergeRecords([r], [], []);
    expect(out.devices).toHaveLength(1);
    expect(out.devices[0].canonicalName).toBe('10.8.151.20');
  });

  it('connect network blocks by CIDR: gateway secondary IP merged', () => {
    const r = rec({ name: 'WHIL MB NOC', ips: [ip('192.168.102.0', 24)], secondaryIps: [ip('192.168.102.1')], kind: 'network', sourceSheet: 'Network BLocks' });
    const out = mergeRecords([r], [], []);
    expect(out.ips.some((i) => i.ip === '192.168.102.0')).toBe(true);
    expect(out.ips.some((i) => i.ip === '192.168.102.1')).toBe(true);
    const nw = out.ips.find((i) => i.ip === '192.168.102.0');
    expect(nw?.kind).toBe('network');
  });
});
