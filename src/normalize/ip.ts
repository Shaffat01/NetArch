/**
 * IPv4 / IPv6 token normalization.
 *
 * Handles the cell formats observed in the source workbooks:
 *   - plain IPv4:                 "10.0.0.1"
 *   - with prefix:                "10.0.0.1/24"
 *   - with port:                  "10.0.0.1:22"
 *   - with prefix+port:           "10.0.0.1/24:22"
 *   - multiple in one cell:       "10.0.0.1, 10.0.0.2" / "10.0.0.1 / 10.0.0.2"
 *   - IPv4 ranges:                "10.0.0.1-10.0.0.5"
 *   - IPv6 (lower priority):      "2001:DB8::1", "[fe80::1]:443"
 *   - whitespace, trailing dots, leading zeros, uppercase hex (IPv6)
 */
import net from 'node:net';

export interface NormalizedIp {
  ip: string;
  family: 4 | 6;
  prefix: number | null;
  port: number | null;
  raw: string;
  fromRange: boolean;
}

const MAX_RANGE_EXPANSION = 1024;

function stripJunk(s: string): string {
  return s
    .replace(/[‘’“”"'`]/g, '')
    .replace(/\\/g, '')
    .trim();
}

function ipv4ToNumber(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  const nums = parts.map((p) => Number(p));
  if (nums.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
  return (((nums[0]! << 24) | (nums[1]! << 16) | (nums[2]! << 8) | nums[3]!) >>> 0);
}

function numberToIpv4(n: number): string {
  return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');
}

/** Strip leading zeros from an IPv4 octet. */
function canonicalIpv4(ip: string): string | null {
  // Re-parse with each octet normalized (handles '010.000.000.001').
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  const nums = parts.map((p) => Number(p));
  if (nums.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
  return nums.join('.');
}

function normalizeToken(family: 4 | 6, raw: string): string | null {
  if (family === 4) return canonicalIpv4(raw);
  return raw.toLowerCase().replace(/%[^/:;]+$/, ''); // drop zone id (not supported as identity)
}

function parseIPv4Range(cell: string): { start: string; end: string }[] {
  const ranges: { start: string; end: string }[] = [];
  const re = /(\d{1,3}(?:\.\d{1,3}){3})\s*(?:-|–|—|~|\.\.| to )\s*(\d{1,3}(?:\.\d{1,3}){3})/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(cell)) !== null) {
    const start = canonicalIpv4(m[1]!);
    const end = canonicalIpv4(m[2]!);
    if (start && end) ranges.push({ start, end });
  }
  return ranges;
}

/** Strip IPv4 ranges out of the cell so generic parsing doesn't re-match them. */
function removeRangeText(cell: string): string {
  return cell.replace(/(\d{1,3}(?:\.\d{1,3}){3})\s*(?:-|–|—|~|\.\.| to )\s*(\d{1,3}(?:\.\d{1,3}){3})/g, ' ');
}

function dedupList(list: NormalizedIp[]): NormalizedIp[] {
  const seen = new Set<string>();
  const out: NormalizedIp[] = [];
  for (const r of list) {
    const key = `${r.family}|${r.ip}|${r.prefix ?? ''}|${r.port ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

function parseChunk(chunk: string, rawCell: string, out: NormalizedIp[]): void {
  const raw = chunk.trim();
  if (!raw) return;

  // [v6]:port — bracketed zone/port form
  const bracketed = raw.match(/^\[([^\]]+)\](?::(\d{1,5}))?$/);
  if (bracketed) {
    const ip = bracketed[1]!.trim().replace(/%[^/:;]+$/, '').toLowerCase();
    if (!net.isIP(ip)) return;
    const family = net.isIP(ip) as 4 | 6;
    const port = bracketed[2] ? Number(bracketed[2]) : null;
    if (port !== null && !(port >= 1 && port <= 65535)) return;
    out.push({ ip, family, prefix: null, port, raw: rawCell, fromRange: false });
    return;
  }

  // a/prefix:port — combined
  const combined = raw.match(/^(\S+?)\/(\d{1,3}):(\d{1,5})$/);
  if (combined) {
    const ipRaw = combined[1]!.trim().replace(/[.,;]$/, '');
    // strip leading zeros from IPv4; validate with net.isIP on the canonical form
    const canon = canonicalIpv4(ipRaw) ?? ipRaw.toLowerCase();
    if (net.isIP(canon)) {
      const family = net.isIP(canon) as 4 | 6;
      const prefix = Number(combined[2]);
      const port = Number(combined[3]);
      const maxP = family === 4 ? 32 : 128;
      if (prefix >= 0 && prefix <= maxP && port >= 1 && port <= 65535) {
        out.push({ ip: canon, family, prefix, port, raw: rawCell, fromRange: false });
        return;
      }
    }
  }

  // a/prefix
  const prefixMatch = raw.match(/^(\S+?)\/(\d{1,3})$/);
  if (prefixMatch) {
    let ipRaw = prefixMatch[1]!.trim().replace(/[.,;]$/, '');
    let port: number | null = null;
    const portSub = ipRaw.match(/^(.+?):(\d{1,5})$/);
    if (portSub) {
      const p = Number(portSub[2]);
      const ipPart = portSub[1]!.trim();
      const canonPart = canonicalIpv4(ipPart) ?? ipPart.toLowerCase();
      if (p >= 1 && p <= 65535 && net.isIP(canonPart)) {
        port = p;
        ipRaw = ipPart;
      }
    }
    const canon = canonicalIpv4(ipRaw) ?? ipRaw.toLowerCase();
    if (net.isIP(canon)) {
      const family = net.isIP(canon) as 4 | 6;
      const prefix = Number(prefixMatch[2]);
      const maxP = family === 4 ? 32 : 128;
      if (prefix >= 0 && prefix <= maxP && (port === null || (port >= 1 && port <= 65535))) {
        out.push({ ip: canon, family, prefix, port, raw: rawCell, fromRange: false });
        return;
      }
    }
  }

  // v4/v6:port — only when the pre-':' part is a complete valid IP
  const portMatch = raw.match(/^(.*\S):(\d{1,5})$/);
  if (portMatch) {
    const ipRaw = portMatch[1]!.trim();
    const canon = canonicalIpv4(ipRaw) ?? ipRaw.toLowerCase();
    if (net.isIP(canon)) {
      const family = net.isIP(canon) as 4 | 6;
      const port = Number(portMatch[2]);
      if (port >= 1 && port <= 65535) {
        out.push({ ip: canon, family, prefix: null, port, raw: rawCell, fromRange: false });
        return;
      }
    }
  }

  // bare IP (strip zone ids; lowercase IPv6)
  const bare = raw.replace(/[.,;]$/, '').trim();
  const canon = canonicalIpv4(bare) ?? bare.toLowerCase();
  if (net.isIP(canon)) {
    const family = net.isIP(canon) as 4 | 6;
    out.push({ ip: canon, family, prefix: null, port: null, raw: rawCell, fromRange: false });
  }
}

/**
 * Parse a raw IP cell into normalized IP records.
 * Returns an empty array when the cell contains no usable IP.
 */
export function parseIps(rawInput: string): NormalizedIp[] {
  const raw = String(rawInput ?? '');
  if (!raw.trim()) return [];
  const cell = stripJunk(raw.replace(/[\r\n\t]+/g, ' ').trim());
  if (!cell) return [];
  if (!/\d/.test(cell)) return [];

  // 1) IPv4 ranges — expand in place.
  const results: NormalizedIp[] = [];
  const ranges = parseIPv4Range(cell);
  for (const r of ranges) {
    const s = ipv4ToNumber(r.start)!;
    const e = ipv4ToNumber(r.end)!;
    const lo = Math.min(s, e);
    const hi = Math.max(s, e);
    if (hi - lo <= MAX_RANGE_EXPANSION) {
      for (let n = lo; n <= hi; n++) {
        results.push({ ip: numberToIpv4(n), family: 4, prefix: null, port: null, raw: cell, fromRange: true });
      }
    } else {
      results.push({ ip: r.start, family: 4, prefix: null, port: null, raw: cell, fromRange: true });
      results.push({ ip: r.end, family: 4, prefix: null, port: null, raw: cell, fromRange: true });
    }
  }

  // 2) Plain/multiple/prefix/port/IPv6 tokens.
  const working = ranges.length > 0 ? removeRangeText(cell) : cell;
  const chunks = working
    .split(/[,;]|\s+\/\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  for (const chunk of chunks) {
    parseChunk(chunk, cell, results);
  }
  return dedupList(results);
}

/** Parse an IPv4 prefix string ("24") into an integer with bounds. */
export function sanitizeIpv4Prefix(p: number | null): number | null {
  if (p === null || !Number.isInteger(p) || p < 0 || p > 32) return null;
  return p;
}
