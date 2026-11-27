import { describe, it, expect } from 'vitest';
import { cleanName, canonicalKeyOf } from '../src/normalize/name.ts';

describe('name cleaning + canonical key', () => {
  it('trims whitespace / collapses separators', () => {
    expect(cleanName('  WHIL-MB-F1-M-ACC-SW1  ').cleaned).toBe('WHIL-MB-F1-M-ACC-SW1');
    expect(canonicalKeyOf('WHIL-MB-F1-M-ACC-SW1')).toBe('whil_mb_f1_m_acc_sw1');
  });

  it('collapses repeated separators', () => {
    expect(cleanName('A---B___C.').cleaned).toBe('A-B_C');
  });

  it('flags IP-as-name', () => {
    expect(cleanName('192.168.200.61').isIp).toBe(true);
    expect(cleanName('NDC-CORE-SW').isIp).toBe(false);
  });

  it('normalizes padded hyphens', () => {
    expect(cleanName('NDC - CORE - RT - 01').cleaned).toBe('NDC-CORE-RT-01');
    expect(cleanName('WHIL - MB - F1').cleaned).toBe('WHIL-MB-F1');
    expect(cleanName('DCNAS01.WHILDC.COM').cleaned).toBe('DCNAS01.WHILDC.COM');
  });

  it('preserves balanced parens (no bracket-stripping of interiors)', () => {
    expect(cleanName('WMTC CCTV (General)').cleaned).toBe('WMTC CCTV (General)');
    expect(cleanName('(Name)').cleaned).toBe('Name');
    expect(cleanName('[Name]').cleaned).toBe('Name');
    expect(cleanName("'quoted'").cleaned).toBe('quoted');
  });

  it('canonical key is lowercase + alnum-run', () => {
    expect(canonicalKeyOf('DC Hi-Tech_app01-Primary')).toBe('dc_hi_tech_app01_primary');
  });
});
