/**
 * Connectivity graph builder: IP-anchored, type-layered.
 * Edges come from the merge layer (never from name matching alone unless flagged 'name').
 */
import type { MasterDevice, MasterIp, MasterConnection } from '../merge/index.js';
import type { DeviceType, ConnectionKind } from '../types/index.js';
import { chainPosition } from '../resolve/device-type.js';

export interface GraphNode {
  id: string;          // IP string
  deviceId: string;
  label: string;       // canonical name (or IP for IP-only devices)
  type: DeviceType;
  location: string | null;
  layerRank: number;   // 0 = access layer ... 5 = ISP; direction of uplink chain
  hasName: boolean;
  fromRange: boolean;
}

export interface GraphEdge {
  src: string;
  dst: string;
  kind: ConnectionKind;
  matchKind: 'ip' | 'name';
  evidenceCount: number;
}

export interface GraphResult {
  nodes: GraphNode[];
  edges: GraphEdge[];
  summary: { nodes: number; edges: number; devices: number; ipOnlyNodes: number; unmatchedNeighbors: number };
}

export function buildGraph(devices: MasterDevice[], ips: MasterIp[], connections: MasterConnection[]): GraphResult {
  const deviceById = new Map(devices.map((d) => [d.id, d]));
  const nodeMap = new Map<string, GraphNode>();

  for (const ip of ips) {
    const device = ip.devices.length > 0 ? deviceById.get(ip.devices[0]!) : null;
    const node: GraphNode = {
      id: ip.ip,
      deviceId: ip.devices[0] ?? '',
      label: ip.canonicalName ?? ip.ip,
      type: device?.deviceType ?? 'UNKNOWN',
      location: device?.location ?? null,
      layerRank: device?.chainPosition ?? 0,
      // hasName comes from the owning device, not the label (an IP-only record
      // has canonicalName = its IP but hasName === false)
      hasName: device ? device.hasName : !!ip.canonicalName,
      fromRange: ip.fromRange,
    };
    nodeMap.set(ip.ip, node);
  }

  // unmatched neighbors: edges whose dstIp is not an IP in the master (name-only)
  let unmatched = 0;
  const edgeList: GraphEdge[] = [];
  const ipSet = new Set(ips.map((i) => i.ip));
  for (const c of connections) {
    if (!ipSet.has(c.srcIp)) { unmatched++; continue; }
    if (!ipSet.has(c.dstIp)) { unmatched++; continue; }
    edgeList.push({ src: c.srcIp, dst: c.dstIp, kind: c.kind, matchKind: c.matchKind, evidenceCount: c.evidence.length });
  }

  const nodes = [...nodeMap.values()];
  const ipOnlyNodes = nodes.filter((n) => !n.hasName).length;
  return {
    nodes,
    edges: edgeList,
    summary: {
      nodes: nodes.length,
      edges: edgeList.length,
      devices: devices.length,
      ipOnlyNodes,
      unmatchedNeighbors: unmatched,
    },
  };
}

/** Directional grouping of neighbors for the device panel (uplink chain). */
export function directionalNeighborsFor(
  device: MasterDevice,
  connections: MasterConnection[],
  devices: MasterDevice[],
  ips: MasterIp[]
): {
  upstream: Array<{ deviceId: string; name: string; type: DeviceType; position: number; via: 'ip' | 'name' }>;
  downstream: Array<{ deviceId: string; name: string; type: DeviceType; position: number; via: 'ip' | 'name' }>;
  lateral: Array<{ deviceId: string; name: string; type: DeviceType; position: number; via: 'ip' | 'name' }>;
  other: Array<{ deviceId: string; name: string; type: DeviceType; position: number; via: 'ip' | 'name' }>;
} {
  const deviceIds = new Set(device.ips.length ? device.ips : ['']);
  // include any other peripheral device (e.g. hostname fallback) — we need device lookup by id
  const deviceById = new Map(devices.map((d) => [d.id, d]));
  const nodeByIp = new Map(ips.map((i) => [i.ip, i]));
  const neighbors = new Map<string, { deviceId: string; name: string; type: DeviceType; position: number; via: 'ip' | 'name' }>();

  const myIps = device.ips;
  const myPosition = chainPosition(device.deviceType);

  for (const c of connections) {
    const isSrc = myIps.includes(c.srcIp);
    const isDst = myIps.includes(c.dstIp);
    if (!isSrc && !isDst) continue;
    const otherIp = isSrc ? c.dstIp : c.srcIp;
    const otherIpRecord = nodeByIp.get(otherIp);
    if (!otherIpRecord) continue;
    // resolve neighbor device (the device owning that IP)
    let neighborId = otherIpRecord.devices[0] ?? '';
    // prefer the device whose id appears in the connection? simpler: use otherIpRecord.deviceIds[0]
    if (!neighborId) continue;
    const neighborDevice = deviceById.get(neighborId);
    if (!neighborDevice) continue;
    const pos = chainPosition(neighborDevice.deviceType);
    if (neighborDevice.id === device.id) continue;
    neighbors.set(neighborDevice.id, { deviceId: neighborDevice.id, name: neighborDevice.canonicalName, type: neighborDevice.deviceType, position: pos, via: c.matchKind });
  }

  const upstream: typeof neighbors extends Map<string, infer V> ? V[] : never = [];
  const downstream: typeof neighbors extends Map<string, infer V> ? V[] : never = [];
  const lateral: typeof neighbors extends Map<string, infer V> ? V[] : never = [];
  const other: typeof neighbors extends Map<string, infer V> ? V[] : never = [];
  for (const v of neighbors.values()) {
    if (v.position > myPosition) upstream.push(v);
    else if (v.position < myPosition) downstream.push(v);
    else lateral.push(v);
  }
  upstream.sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));
  downstream.sort((a, b) => b.position - a.position || a.name.localeCompare(b.name));
  lateral.sort((a, b) => a.name.localeCompare(b.name));

  return { upstream, downstream, lateral, other };
}
