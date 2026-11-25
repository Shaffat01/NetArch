/** Shared types for the IP-centric network inventory pipeline. */

export type DeviceType =
  | 'CORE_DEVICE'
  | 'ISP'
  | 'CORE_RT'
  | 'SW'
  | 'DIST_SW'
  | 'ACCESS_SW'
  | 'UNKNOWN';

export type ConnectionKind = 'CONNECTION' | 'TUNNEL';

export type RecordKind = 'device' | 'network' | 'serial';

/** A normalized IP token parsed from a raw cell. */
export interface NormalizedIp {
  /** Canonical dotted-quad (IPv4) or lowercase compressed-ish IPv6 string. */
  ip: string;
  family: 4 | 6;
  /** Prefix length 0-32 / 0-128 if explicitly written, else null. */
  prefix: number | null;
  /** Port parsed from the cell (e.g. "10.0.0.1:22") — kept for audit, not stored as identity. */
  port: number | null;
  /** The raw cell text that produced this record. */
  raw: string;
  /** true when this record came from a range expansion ("10.0.0.1-10.0.0.5"). */
  fromRange: boolean;
}

/** Intermediate raw record extracted from one sheet row. Never reaches the DB directly. */
export interface RawRecord {
  sourceFile: string;
  sourceSheet: string;
  sourceRow: number;
  /** Multi-block sheet label, e.g. "NDC" / "DC" / "DMZ DC" / "MZ NDC". */
  block: string | null;
  /** Cleaned device name (or null when the sheet has no name evidence). */
  name: string | null;
  /** Raw (uncleaned) cell text for `name`. */
  rawName: string | null;
  /** Parsed IPs from the main IP cell of this record. */
  ips: NormalizedIp[];
  /** 'device' for inventory/connection sheets, 'network' for CIDR block/subnet sheets. */
  kind: RecordKind;
  /** Human-readable purpose for network records (e.g. "WHIL MB NOC"). */
  networkPurpose: string | null;
  /** Location/building/floor context for the device. */
  location: string | null;
  serial: string | null;
  model: string | null;
  tag: string | null;
  /** Neighbor device name as written in the sheet (local+neighbor connection sheets). */
  neighborName: string | null;
  neighborRaw: string | null;
  /** Neighbor IPs when the neighbor IP cell is present ("" when absent). */
  neighborIps: NormalizedIp[];
  /** Secondary IPs of the same record (e.g. gateway next to a CIDR block). */
  secondaryIps: NormalizedIp[];
  /** Local uplink port as written (e.g. "GigabitEthernet1/0/24"). */
  port: string | null;
  /** Neighbor connected port as written. */
  neighborPort: string | null;
  /** Remarks/notes column. */
  remarks: string | null;
  /** Header-name → raw cell text map for audit. */
  raw: Record<string, string>;
}

/** A (best-scored) name alias attached to an IP. */
export interface AliasCandidate {
  rawName: string;
  cleanedName: string;
  confidence: number;
  sourceFile: string;
  sourceSheet: string;
  sourceRow: number;
  /** Number of distinct source sheets this cleaned name appears in. */
  sourceSheetCount: number;
  matchSource: 'sheet-register' | 'sheet-inventory' | 'sheet-physical' | 'sheet-attachment';
}

/** A canonical device resolved from one normalized IP. */
export interface DeviceRecord {
  /** The normalized IP that is the device identity. */
  id: string;
  canonicalName: string;
  deviceType: DeviceType;
  primaryIp: string;
  primaryIpPrefix: number | null;
  location: string | null;
  networkPurpose: string | null;
  /** Merged raw evidence from one-per-sheet alias candidates. */
  aliases: AliasCandidate[];
  /** All IPs this device also appears with (rare; identical identity by IP). */
  ips: string[];
  netBlocks: string[];
  meta: Record<string, string>;
}

export interface IpRecord {
  ip: string;
  family: 4 | 6;
  prefix: number | null;
  port: number | null;
  deviceId: string | null;
  kind: RecordKind;
  role: string;
  raw: string;
}

export interface ConnectionRecord {
  /** Canonical (sorted) endpoints. */
  srcIp: string;
  dstIp: string;
  kind: ConnectionKind;
  matchKind: 'ip' | 'name';
  sourceSheet: string;
  sourceFile: string;
  /** Merged evidence — one object per raw row that fed this connection. */
  evidence: Array<{ sheet: string; file: string; row: number; detail: string }>;
  raw: string;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: Array<{ src: string; dst: string; kind: ConnectionKind; matchKind: 'ip' | 'name'; evidenceCount: number }>;
}

export interface GraphNode {
  id: string;
  deviceId: string;
  label: string;
  type: DeviceType;
  layerRank: number;
  location: string | null;
}
