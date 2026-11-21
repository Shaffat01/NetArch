import { describe, it, expect } from 'vitest';
import { scoreAlias, makeAliasCandidate, resolveAliasesForIp } from '../src/resolve/canonical.ts';

describe('canonical name scoring', () => {
  it('register sheet beats host sheet', () => {
    const reg = scoreAlias({ cleanedName: 'NDC-CORE-SW', rawName: 'NDC-CORE-SW', sourceSheet: 'Core Device', sheetNames: new Set(['Core Device']), isIp: false });
    const host = scoreAlias({ cleanedName: 'NDC-CORE-SW', rawName: 'NDC-CORE-SW', sourceSheet: 'Servers hardware IP', sheetNames: new Set(['Servers hardware IP']), isIp: false });
    expect(reg.score).toBeGreaterThan(host.score);
  });

  it('multi-sheet boost', () => {
    const single = scoreAlias({ cleanedName: 'NOC-Switch', rawName: 'NOC-Switch', sourceSheet: 'WHIL', sheetNames: new Set(['WHIL']), isIp: false });
    const multi = scoreAlias({ cleanedName: 'NOC-Switch', rawName: 'NOC-Switch', sourceSheet: 'WHIL', sheetNames: new Set(['WHIL', 'Access SW']), isIp: false });
    expect(multi.score).toBeGreaterThan(single.score);
  });

  it('hostname-like penalty', () => {
    const host = scoreAlias({ cleanedName: 'DCNAS01.WHILDC.COM', rawName: 'DCNAS01.WHILDC.COM', sourceSheet: 'MZ_block 119', sheetNames: new Set(['MZ_block 119']), isIp: false });
    const name = scoreAlias({ cleanedName: 'NDC_NAS-file server', rawName: 'NDC_NAS-file server', sourceSheet: 'MZ-Block-150', sheetNames: new Set(['MZ-Block-150']), isIp: false });
    expect(name.score).toBeGreaterThan(host.score);
  });
});

describe('resolveAliasesForIp', () => {
  it('picks best candidate as canonical', () => {
    const a = makeAliasCandidate('NDC-CORE-SW', 'NDC-CORE-SW', 'Core Device', 'f.xlsx', 7, new Set(['Core Device']), false);
    const b = makeAliasCandidate('NDC_Core SW', 'NDC_Core SW', 'Data Center Devices', 'f.xlsx', 7, new Set(['Core Device', 'Data Center Devices']), false);
    const r = resolveAliasesForIp([a, b], '172.16.6.1');
    expect(r.canonical).toBeTruthy();
    expect(r.canonicalKey).toBeTruthy();
  });
});
