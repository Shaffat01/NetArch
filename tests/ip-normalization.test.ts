import { describe, it, expect } from 'vitest';
import { parseIps } from '../src/normalize/ip.ts';

describe('parseIps — cell formats', () => {
  it('plain IPv4', () => {
    const r = parseIps('10.0.0.1');
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ ip: '10.0.0.1', family: 4, prefix: null, port: null, fromRange: false });
  });

  it('IPv4 with prefix', () => {
    const r = parseIps('192.168.101.2/24');
    expect(r[0]).toMatchObject({ ip: '192.168.101.2', prefix: 24 });
  });

  it('IPv4 with port', () => {
    const r = parseIps('10.0.0.1:22');
    expect(r[0]).toMatchObject({ ip: '10.0.0.1', port: 22 });
  });

  it('IPv4 with prefix + port', () => {
    const r = parseIps('10.0.0.1/24:22');
    expect(r[0]).toMatchObject({ ip: '10.0.0.1', prefix: 24, port: 22 });
  });

  it('multiple in one cell (comma)', () => {
    const r = parseIps('10.0.0.1, 10.0.0.2');
    expect(r.map((x) => x.ip).sort()).toEqual(['10.0.0.1', '10.0.0.2']);
  });

  it('multiple in one cell (spaced slash)', () => {
    const r = parseIps('10.0.0.1 / 10.0.0.2');
    expect(r.map((x) => x.ip).sort()).toEqual(['10.0.0.1', '10.0.0.2']);
  });

  it('IPv4 range expansion', () => {
    const r = parseIps('10.0.0.1-10.0.0.5');
    expect(r.map((x) => x.ip)).toEqual(['10.0.0.1', '10.0.0.2', '10.0.0.3', '10.0.0.4', '10.0.0.5']);
    expect(r.every((x) => x.fromRange)).toBe(true);
  });

  it('trailing dots / whitespace / leading zeros', () => {
    expect(parseIps('10.0.0.1.')[0].ip).toBe('10.0.0.1');
    expect(parseIps('  010.0.0.001  ')[0].ip).toBe('10.0.0.1');
  });

  it('IPv6 plain + bracketed port', () => {
    expect(parseIps('2001:DB8::1')[0]).toMatchObject({ ip: '2001:db8::1', family: 6 });
    expect(parseIps('[fe80::1]:443')[0]).toMatchObject({ ip: 'fe80::1', port: 443 });
  });

  it('IPv4 range with prefix', () => {
    const r = parseIps('192.168.1.0/24');
    expect(r[0]).toMatchObject({ ip: '192.168.1.0', prefix: 24 });
  });

  it('garbage / empty -> empty', () => {
    expect(parseIps('garbage')).toEqual([]);
    expect(parseIps('')).toEqual([]);
  });
});
