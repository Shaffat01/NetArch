import http from 'node:http';
import https from 'node:https';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

let ENV = {};
const number = (v, fallback = null) => Number.isFinite(Number(v)) ? Number(v) : fallback;
const text = v => String(v ?? '').trim();
const norm = v => text(v).toUpperCase().replace(/_/g, '-').replace(/\s*-\s*/g, '-').replace(/\s+/g, '-').replace(/-{2,}/g, '-').replace(/^-|-$/g, '');
const array = v => Array.isArray(v) ? v : v && typeof v === 'object' ? Object.values(v) : [];

export async function loadLiveEnv(projectDir) {
  try {
    const raw = await readFile(path.join(projectDir, '.env'), 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!match || line.trim().startsWith('#')) continue;
      let value = match[2];
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
      if (process.env[match[1]] === undefined) process.env[match[1]] = value;
    }
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  ENV = {
    LIBRENMS_URL: text(process.env.LIBRENMS_URL).replace(/\/+$/, ''),
    LIBRENMS_TOKEN: text(process.env.LIBRENMS_TOKEN),
    ZABBIX_URL: text(process.env.ZABBIX_URL).replace(/\/+$/, ''),
    ZABBIX_TOKEN: text(process.env.ZABBIX_TOKEN),
    ZABBIX_USERNAME: text(process.env.ZABBIX_USERNAME),
    ZABBIX_PASSWORD: text(process.env.ZABBIX_PASSWORD),
    LIVE_TIMEOUT_MS: number(process.env.LIVE_TIMEOUT_MS, 15000),
    LIVE_REFRESH_SECONDS: number(process.env.LIVE_REFRESH_SECONDS, 60),
    LIVE_TLS_REJECT_UNAUTHORIZED: text(process.env.LIVE_TLS_REJECT_UNAUTHORIZED) !== 'false',
    AUTO_DISCOVER: text(process.env.AUTO_DISCOVER) !== 'false',
  };
  return config();
}
export function config() {
  return {
    librenms: Boolean(ENV.LIBRENMS_URL && ENV.LIBRENMS_TOKEN),
    zabbix: Boolean(ENV.ZABBIX_URL && (ENV.ZABBIX_TOKEN || (ENV.ZABBIX_USERNAME && ENV.ZABBIX_PASSWORD))),
    autoDiscover: ENV.AUTO_DISCOVER !== false,
    refreshSeconds: ENV.LIVE_REFRESH_SECONDS || 60,
  };
}
export function emptyLive() {
  const c = config();
  return { configured: c.librenms || c.zabbix, config: c, status: c.librenms || c.zabbix ? 'idle' : 'unconfigured', devices: [], links: [], alerts: [], errors: [], added: [], assigned: [], lastSync: null };
}

function requestJson(url, { method = 'GET', headers = {}, body = null } = {}) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const client = target.protocol === 'https:' ? https : http;
    const req = client.request(target, {
      method,
      headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers },
      rejectUnauthorized: ENV.LIVE_TLS_REJECT_UNAUTHORIZED !== false,
      timeout: ENV.LIVE_TIMEOUT_MS || 15000,
    }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        if (res.statusCode < 200 || res.statusCode >= 300) { reject(new Error(`${res.statusCode} ${target.hostname}${target.pathname}: ${raw.slice(0, 180)}`)); return; }
        try { resolve(raw ? JSON.parse(raw) : {}); } catch { reject(new Error(`Invalid JSON from ${target.hostname}${target.pathname}`)); }
      });
    });
    req.on('timeout', () => req.destroy(new Error(`Timeout connecting to ${target.hostname}`)));
    req.on('error', reject);
    if (body) req.write(typeof body === 'string' ? body : JSON.stringify(body));
    req.end();
  });
}

async function fetchLibreNMS() {
  const headers = { 'X-Auth-Token': ENV.LIBRENMS_TOKEN };
  const base = ENV.LIBRENMS_URL;
  const [devices, ports, links] = await Promise.allSettled([
    requestJson(`${base}/api/v0/devices`, { headers }),
    requestJson(`${base}/api/v0/ports`, { headers }),
    requestJson(`${base}/api/v0/links`, { headers }),
  ]);
  const errors = [];
  if (devices.status === 'rejected') errors.push(`LibreNMS devices: ${devices.reason.message}`);
  if (ports.status === 'rejected') errors.push(`LibreNMS ports: ${ports.reason.message}`);
  if (links.status === 'rejected') errors.push(`LibreNMS links: ${links.reason.message}`);
  return {
    devicesOk: devices.status === 'fulfilled',
    devices: devices.status === 'fulfilled' ? array(devices.value.devices) : [],
    ports: ports.status === 'fulfilled' ? array(ports.value.ports) : [],
    links: links.status === 'fulfilled' ? array(links.value.links) : [],
    errors,
  };
}

let zabbixAuth = null;
async function zabbixCall(method, params) {
  const endpoint = ENV.ZABBIX_URL.endsWith('.php') ? ENV.ZABBIX_URL : `${ENV.ZABBIX_URL}/api_jsonrpc.php`;
  if (!ENV.ZABBIX_TOKEN && !zabbixAuth) {
    const login = await requestJson(endpoint, { method: 'POST', body: { jsonrpc: '2.0', method: 'user.login', params: { username: ENV.ZABBIX_USERNAME, password: ENV.ZABBIX_PASSWORD }, id: 1 } });
    if (login.error) throw new Error(`Zabbix login: ${login.error.data || login.error.message}`);
    zabbixAuth = login.result;
  }
  const headers = ENV.ZABBIX_TOKEN ? { Authorization: `Bearer ${ENV.ZABBIX_TOKEN}` } : {};
  const body = { jsonrpc: '2.0', method, params, id: 2 };
  if (!ENV.ZABBIX_TOKEN) body.auth = zabbixAuth;
  const response = await requestJson(endpoint, { method: 'POST', headers, body });
  if (response.error) throw new Error(`Zabbix ${method}: ${response.error.data || response.error.message}`);
  return response.result;
}
async function fetchZabbix() {
  try {
    const result = await zabbixCall('problem.get', {
      output: ['eventid', 'name', 'severity', 'clock', 'acknowledged', 'suppressed'],
      selectHosts: ['host', 'name', 'status'], recent: false, suppressed: false,
      sortfield: 'eventid', sortorder: 'DESC', limit: 500,
    });
    return { problems: array(result), errors: [] };
  } catch (error) { return { problems: [], errors: [error.message] }; }
}

function normalize(raw) {
  const devicesRaw = raw.librenms.devices;
  const deviceById = new Map(devicesRaw.map(d => [String(d.device_id ?? d.id), d]));
  const portsRaw = raw.librenms.ports;
  const portById = new Map(portsRaw.map(p => [String(p.port_id ?? p.id), p]));
  const devices = devicesRaw.map(d => ({
    source: 'LibreNMS', deviceId: String(d.device_id ?? d.id ?? norm(d.hostname)),
    hostname: text(d.hostname || d.sysName || d.ip), ip: text(d.ip),
    status: d.disabled ? 'unknown' : Number(d.status) === 1 ? 'up' : Number(d.status) === 0 ? 'down' : 'unknown',
    disabled: Boolean(d.disabled), hardware: text(d.hardware), serial: text(d.serial),
    uptimeSeconds: number(d.uptime), lastPoll: text(d.last_polled || d.last_polled_timetaken),
  })).filter(d => d.hostname || d.ip);
  const portName = p => text(p?.ifName || p?.ifDescr || p?.ifAlias || p?.port_id);
  const rate = (p, key) => number(p?.[key], 0) || 0;
  const links = raw.librenms.links.map(l => {
    const localPort = portById.get(String(l.local_port_id ?? l.port_id));
    const remotePort = portById.get(String(l.remote_port_id));
    const localDevice = deviceById.get(String(l.local_device_id ?? l.device_id));
    const remoteDevice = deviceById.get(String(l.remote_device_id));
    const source = text(l.local_hostname || localDevice?.hostname || localDevice?.sysName);
    const target = text(l.remote_hostname || remoteDevice?.hostname || remoteDevice?.sysName);
    const inBps = rate(localPort, 'ifInOctets_rate') * 8;
    const outBps = rate(localPort, 'ifOutOctets_rate') * 8;
    const speed = number(localPort?.ifSpeed);
    return {
      source, target, localPort: portName(localPort), remotePort: portName(remotePort),
      inBps, outBps, speedBps: speed,
      utilization: speed ? Math.min(999, ((inBps + outBps) / speed) * 100) : null,
      errors: rate(localPort, 'ifInErrors_rate') + rate(localPort, 'ifOutErrors_rate'),
      discards: rate(localPort, 'ifInDiscards_rate') + rate(localPort, 'ifOutDiscards_rate'),
    };
  }).filter(l => l.source && l.target);
  const severityNames = ['Not classified', 'Information', 'Warning', 'Average', 'High', 'Disaster'];
  const alerts = raw.zabbix.problems.map(p => ({
    source: 'Zabbix', eventId: String(p.eventid), name: text(p.name), severity: number(p.severity, 0),
    severityName: severityNames[number(p.severity, 0)] || 'Unknown', lastChange: number(p.clock),
    acknowledged: text(p.acknowledged) === '1', hostname: text(p.hosts?.[0]?.host || p.hosts?.[0]?.name),
  }));
  return { devices, links, alerts };
}

function ipThirdOctet(ip) {
  const parts = text(ip).split('.');
  if (parts.length !== 4 || parts.some(part => !/^\d{1,3}$/.test(part))) return null;
  const values = parts.map(Number);
  return values.every(value => Number.isInteger(value) && value >= 0 && value <= 255) ? values[2] : null;
}

function distributionIndexByOctet(data) {
  const index = new Map(), seen = new Set();
  for (const [site, bundle] of Object.entries(data.sites || {})) {
    for (const row of bundle.rows || []) {
      const role = row.roleShort || ({ 'Distribution Device': 'Distribution' }[row.role] || row.role);
      const vlan = ipThirdOctet(row.ip), device = text(row.device);
      if (role !== 'Distribution' || vlan === null || !device) continue;
      const key = `${site}|${norm(device)}|${vlan}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (!index.has(vlan)) index.set(vlan, []);
      index.get(vlan).push({ site, device, vlan, zone: text(row.zone) || `${site} Site`, floor: text(row.floor), ip: text(row.ip) });
    }
  }
  return index;
}

function autoDiscover(data, devices, links) {
  if (!ENV.AUTO_DISCOVER || !devices.length) return { changed: false, added: [], assigned: [] };
  data.discovered ||= { rows: [], nodes: [], edges: [], links: [], stats: {} };
  data.discovered.rows ||= [];
  const distributions = distributionIndexByOctet(data);
  const added = [], assigned = [], now = new Date().toISOString();
  let changed = false;
  const seenDiscoveryIds = new Set(devices.map(d => String(d.deviceId)));
  const uniqueMatch = ip => {
    const vlan = ipThirdOctet(ip), candidates = vlan === null ? [] : distributions.get(vlan) || [];
    return candidates.length === 1 ? candidates[0] : null;
  };
  const discoveryStatus = ip => {
    const vlan = ipThirdOctet(ip), candidates = vlan === null ? [] : distributions.get(vlan) || [];
    return vlan === null ? 'invalid-ip' : candidates.length > 1 ? 'ambiguous' : candidates.length === 0 ? 'unmatched' : 'matched';
  };
  const linkToAssignment = (device, match, related) => {
    const key = norm(device.hostname);
    return related.find(link => {
      const reverse = norm(link.target) === key;
      return norm(reverse ? link.source : link.target) === norm(match.device);
    }) || null;
  };
  const makeAssignedRow = (device, match, related, existing = null) => {
    const key = norm(device.hostname), link = linkToAssignment(device, match, related);
    const reverse = link && norm(link.target) === key;
    const uplinkPort = link ? (reverse ? link.remotePort : link.localPort) : null;
    const neighborPort = link ? (reverse ? link.localPort : link.remotePort) : null;
    const previous = existing?.discovery || {};
    return {
      id: `${match.site}-DISC-${device.deviceId}`, row: null, role: 'Access SW', roleShort: 'Access',
      device: device.hostname, model: device.hardware || existing?.model || null, serial: device.serial || existing?.serial || null, ip: device.ip || existing?.ip || null,
      uplinkPort, localVlan: String(match.vlan), neighbor: match.device, neighborPort, neighborVlan: null, neighborSerial: null,
      buildingVlan: match.vlan, floor: 'LibreNMS auto-discovery', zone: match.zone,
      direct: `${device.hostname} [${uplinkPort || ''}] → ${match.device} [${neighborPort || ''}]`,
      path: '', sourceGap: false, noLinkExpected: false, custom: false, modified: false, derivedByApp: true,
      discovery: {
        ...previous, source: 'LibreNMS', deviceId: String(device.deviceId), firstSeen: previous.firstSeen || now, lastSeen: now, stale: false,
        assignment: 'third-octet', assignedSite: match.site, assignedDistribution: match.device, vlan: match.vlan, inferredNeighbor: !link,
      },
    };
  };

  // Re-evaluate previously discovered rows too. A unique third-octet match moves
  // every row for that LibreNMS device into the matching site's Access register.
  const groups = new Map();
  for (const row of data.discovered.rows) {
    if (!row.discovery) continue;
    const key = norm(row.device) || text(row.ip);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  const migratedIds = new Set();
  for (const rows of groups.values()) {
    const first = rows[0], match = uniqueMatch(first.ip);
    if (!match) continue;
    const liveDevice = devices.find(d => String(d.deviceId) === String(first.discovery.deviceId));
    const device = liveDevice || { deviceId: first.discovery.deviceId, hostname: first.device, hardware: first.model, serial: first.serial, ip: first.ip };
    const related = links.filter(l => norm(l.source) === norm(device.hostname) || norm(l.target) === norm(device.hostname));
    const targetRows = data.sites[match.site].rows;
    const duplicate = targetRows.some(r => norm(r.device) === norm(first.device) || (text(first.ip) && text(r.ip) === text(first.ip)));
    if (!duplicate) { targetRows.push(makeAssignedRow(device, match, related, first)); assigned.push(first.device); }
    rows.forEach(row => migratedIds.add(row.id));
    changed = true;
  }
  if (migratedIds.size) data.discovered.rows = data.discovered.rows.filter(row => !migratedIds.has(row.id));

  const allRows = [...Object.values(data.sites || {}).flatMap(s => s.rows || []), ...data.discovered.rows];
  const knownNames = new Set(allRows.flatMap(r => [norm(r.device), norm(r.neighbor)]).filter(Boolean));
  const knownIps = new Set(allRows.map(r => text(r.ip)).filter(Boolean));
  for (const row of allRows) {
    if (!row.discovery) continue;
    const stale = !seenDiscoveryIds.has(String(row.discovery.deviceId));
    if (row.discovery.stale !== stale) { row.discovery.stale = stale; changed = true; }
    if (!stale) row.discovery.lastSeen = now;
  }
  for (const row of data.discovered.rows) {
    if (!row.discovery) continue;
    const status = discoveryStatus(row.ip), vlan = ipThirdOctet(row.ip);
    if (row.discovery.assignmentStatus !== status || row.discovery.vlan !== vlan) {
      row.discovery.assignmentStatus = status; row.discovery.vlan = vlan; changed = true;
    }
  }

  for (const device of devices) {
    const key = norm(device.hostname), ip = text(device.ip);
    if ((key && knownNames.has(key)) || (ip && knownIps.has(ip)) || device.disabled) continue;
    const related = links.filter(l => norm(l.source) === key || norm(l.target) === key);
    const match = uniqueMatch(ip);
    if (match) {
      data.sites[match.site].rows.push(makeAssignedRow(device, match, related));
      assigned.push(device.hostname);
    } else {
      const makeRow = (link = null, index = 0) => {
        const reverse = link && norm(link.target) === key;
        const neighbor = link ? (reverse ? link.source : link.target) : null;
        const uplinkPort = link ? (reverse ? link.remotePort : link.localPort) : null;
        const neighborPort = link ? (reverse ? link.localPort : link.remotePort) : null;
        const vlan = ipThirdOctet(ip);
        return {
          id: `DISC-${device.deviceId}-${index}`, row: null, role: 'Discovered Device', roleShort: 'Discovered',
          device: device.hostname, model: device.hardware || null, serial: device.serial || null, ip: device.ip || null,
          uplinkPort, localVlan: vlan === null ? null : String(vlan), neighbor, neighborPort, neighborVlan: null, neighborSerial: null,
          buildingVlan: vlan, floor: 'LibreNMS auto-discovery', zone: 'Live Discovery',
          direct: neighbor ? `${device.hostname} [${uplinkPort || ''}] → ${neighbor} [${neighborPort || ''}]` : device.hostname,
          path: '', sourceGap: false, noLinkExpected: !neighbor, custom: false, modified: false, derivedByApp: false,
          discovery: { source: 'LibreNMS', deviceId: String(device.deviceId), firstSeen: now, lastSeen: now, stale: false, vlan, assignmentStatus: discoveryStatus(ip) },
        };
      };
      const rows = related.length ? related.map((link, i) => makeRow(link, i)) : [makeRow()];
      data.discovered.rows.push(...rows);
    }
    if (key) knownNames.add(key); if (ip) knownIps.add(ip);
    added.push(device.hostname); changed = true;
  }
  return { changed, added, assigned };
}

export function buildLivePayload(data, raw) {
  const normalized = normalize(raw);
  const discovery = raw.librenms.devicesOk ? autoDiscover(data, normalized.devices, normalized.links) : { changed: false, added: [], assigned: [] };
  const errors = [...raw.librenms.errors, ...raw.zabbix.errors];
  const c = config();
  return {
    dataChanged: discovery.changed,
    live: {
      configured: c.librenms || c.zabbix, config: c,
      status: errors.length ? (normalized.devices.length || normalized.alerts.length ? 'partial' : 'error') : 'ok',
      ...normalized, errors, added: discovery.added, assigned: discovery.assigned, lastSync: new Date().toISOString(),
    },
  };
}

export async function syncLive(data) {
  const c = config();
  if (!c.librenms && !c.zabbix) return { dataChanged: false, live: emptyLive() };
  const empty = { devicesOk: false, devices: [], ports: [], links: [], errors: [] };
  const [librenms, zabbix] = await Promise.all([
    c.librenms ? fetchLibreNMS() : Promise.resolve(empty),
    c.zabbix ? fetchZabbix() : Promise.resolve({ problems: [], errors: [] }),
  ]);
  return buildLivePayload(data, { librenms, zabbix });
}
