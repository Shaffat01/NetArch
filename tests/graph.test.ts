import { describe, it, expect } from 'vitest';
import { buildGraph } from '../src/graph/index.ts';
import type { MasterDevice, MasterIp, MasterConnection } from '../src/merge/index.ts';

const dev = (id: string, type: string, ip: string, location: string | null = null): MasterDevice => ({
  id, canonicalName: id, canonicalKey: id.replace(/\s+/g, '_').toLowerCase(), deviceType: type as any,
  location, confidence: 0.9, model: null, serial: null, tag: null, ips: [ip], aliases: [],
  records: 1, sources: ['f.xlsx'], originSheets: ['Test'], hasName: true, hasSerial: false, modelBySource: null,
  chainPosition: 0,
});
const ip = (ip: string, devices: string[]): MasterIp => ({
  ip, family: 4, prefix: null, ports: [], kind: 'device', devices,
  canonicalName: devices[0] ?? null, aliases: [], records: 1, fromRange: false,
  sources: ['f.xlsx'], originSheets: ['Test'],
});
const conn = (src: string, dst: string, matchKind: 'ip' | 'name' = 'ip'): MasterConnection => ({
  srcIp: src, dstIp: dst, kind: 'CONNECTION', matchKind, evidence: [], raw: '',
});

describe('buildGraph', () => {
  it('builds nodes + edges from merged data', () => {
    const devices = [dev('A-ACC-SW', 'ACCESS_SW', '192.168.1.1'), dev('B-CORE-SW', 'CORE_DEVICE', '192.168.1.2')];
    const ips = [ip('192.168.1.1', ['dev_a_acc_sw']), ip('192.168.1.2', ['dev_b_core_sw'])];
    const connections = [conn('192.168.1.1', '192.168.1.2')];
    const g = buildGraph(devices, ips, connections);
    expect(g.nodes).toHaveLength(2);
    expect(g.edges).toHaveLength(1);
    expect(g.edges[0]).toMatchObject({ src: '192.168.1.1', dst: '192.168.1.2', matchKind: 'ip' });
  });

  it('skips edges with unknown endpoints', () => {
    const devices = [dev('A-ACC-SW', 'ACCESS_SW', '192.168.1.1')];
    const ips = [ip('192.168.1.1', ['dev_a_acc_sw'])];
    const connections = [conn('192.168.1.1', '192.168.1.99')];
    const g = buildGraph(devices, ips, connections);
    expect(g.edges).toHaveLength(0);
    expect(g.summary.unmatchedNeighbors).toBeGreaterThanOrEqual(1);
  });
});
