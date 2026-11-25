import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { runIngest } from '../src/ingest/cli.ts';

const sourcesDir = path.resolve('data/sources');
const filesExist = fs.existsSync(path.join(sourcesDir, 'HQ-ACCESS-SWITCH-INFO.xlsx'))
  && fs.existsSync(path.join(sourcesDir, 'All Building VLAN & Floor Information(NOC).xlsx'));

describe('ingest pipeline (real sources)', () => {
  beforeAll(() => {
    if (!filesExist) {
      throw new Error('source workbooks missing from data/sources — run ingest manually to verify');
    }
  });

  it('produces a sane master table', async () => {
    const out = await runIngest({ sourcesDir });
    const m = out.merged;
    expect(m.stats.records).toBeGreaterThan(1500);
    expect(m.stats.ips).toBeGreaterThan(700);
    expect(m.stats.devices).toBeGreaterThan(700);
    expect(m.stats.connections).toBeGreaterThan(200);

    // every device name must be a non-empty canonical name, not a network IP
    for (const d of m.devices) {
      expect(d.canonicalKey).toBeTruthy();
    }
    // every connection must have distinct endpoints
    for (const c of m.connections) {
      expect(c.srcIp).not.toBe(c.dstIp);
    }
    // no IPv4 with invalid octets
    for (const ip of m.ips) {
      if (ip.family === 4) {
        const parts = ip.ip.split('.');
        expect(parts.length).toBe(4);
        for (const p of parts) {
          const n = Number(p);
          expect(n).toBeGreaterThanOrEqual(0);
          expect(n).toBeLessThanOrEqual(255);
        }
      }
    }
  }, 60_000);
});
