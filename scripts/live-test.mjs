import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadLiveEnv, buildLivePayload, emptyLive } from '../live.mjs';

for (const key of ['LIBRENMS_URL', 'LIBRENMS_TOKEN', 'ZABBIX_URL', 'ZABBIX_TOKEN', 'ZABBIX_USERNAME', 'ZABBIX_PASSWORD']) delete process.env[key];
await loadLiveEnv(new URL('../scripts/', import.meta.url).pathname);
assert.equal(emptyLive().configured, false, 'blank .env stays unconfigured; no fake live data');
const data = JSON.parse(await readFile(new URL('../public/data.json', import.meta.url), 'utf8'));
const raw = {
  librenms: {
    devicesOk: true,
    devices: [
      { device_id: 1, hostname: 'WMTC-B1-CORE-SW', ip: '192.168.137.1', status: 1, hardware: 'C9300', uptime: 1000 },
      { device_id: 2, hostname: 'NEW-LIVE-SW', ip: '10.99.0.10', status: 1, hardware: 'CBS350', serial: 'NEW-SERIAL' },
      { device_id: 3, hostname: 'UNCONNECTED-LIVE-SW', ip: '10.99.0.11', status: 0 },
    ],
    ports: [
      { port_id: 11, ifName: 'Gi1/0/1', ifSpeed: 100000000, ifInOctets_rate: 1000000, ifOutOctets_rate: 500000, ifInErrors_rate: 2, ifOutDiscards_rate: 1 },
      { port_id: 22, ifName: 'Gi1/0/2', ifSpeed: 100000000 },
    ],
    links: [{ local_device_id: 1, remote_device_id: 2, local_port_id: 11, remote_port_id: 22, remote_hostname: 'NEW-LIVE-SW' }],
    errors: [],
  },
  zabbix: { problems: [{ eventid: 99, name: 'High CPU usage', severity: 4, clock: 1700000000, hosts: [{ host: 'WMTC-B1-CORE-SW' }] }], errors: [] },
};
const first = buildLivePayload(data, raw);
assert.equal(first.dataChanged, true);
assert.deepEqual(first.live.added.sort(), ['NEW-LIVE-SW', 'UNCONNECTED-LIVE-SW']);
assert.equal(first.live.links[0].utilization, 12, 'octet rates converted to bits and divided by ifSpeed');
assert.equal(first.live.links[0].errors, 2);
assert.equal(first.live.alerts[0].hostname, 'WMTC-B1-CORE-SW');
assert.equal(data.discovered.rows.filter(r => r.device === 'NEW-LIVE-SW').length, 1);
assert.equal(data.discovered.rows.find(r => r.device === 'NEW-LIVE-SW').neighbor, 'WMTC-B1-CORE-SW');
assert.equal(data.discovered.rows.find(r => r.device === 'UNCONNECTED-LIVE-SW').noLinkExpected, true);
assert.equal(data.sites.WMTC.rows.length, 153, 'source workbook rows untouched');

const count = data.discovered.rows.length;
const second = buildLivePayload(data, raw);
assert.equal(second.live.added.length, 0, 'same API devices never duplicate');
assert.equal(data.discovered.rows.length, count);

const removal = structuredClone(raw);
removal.librenms.devices = removal.librenms.devices.slice(0, 1);
removal.librenms.links = [];
buildLivePayload(data, removal);
assert.ok(data.discovered.rows.filter(r => r.discovery?.stale).length >= 2, 'missing API devices become stale, not deleted');
assert.equal(data.discovered.rows.length, count, 'stale discovery never auto-deletes rows');
// Third-octet VLAN assignment: a unique Distribution receives an Access row;
// no-match and ambiguous matches stay in Discovered.
const assignData = JSON.parse(await readFile(new URL('../public/data.json', import.meta.url), 'utf8'));
const assignRaw = {
  librenms: {
    devicesOk: true,
    devices: [
      { device_id: 10, hostname: 'WMTC Building-4', ip: '192.168.135.1', status: 1 },
      { device_id: 11, hostname: 'B4-VLAN-AUTO-SW', ip: '192.168.135.44', status: 1, hardware: 'CBS350', serial: 'B4-AUTO-SERIAL' },
      { device_id: 12, hostname: 'NO-VLAN-MATCH-SW', ip: '192.168.222.44', status: 1 },
      { device_id: 13, hostname: 'INVALID-IP-SW', ip: 'not-an-ip', status: 1 },
    ],
    ports: [{ port_id: 110, ifName: 'Gi1/0/1' }, { port_id: 101, ifName: 'Gi1/0/24' }],
    links: [{ local_device_id: 11, remote_device_id: 10, local_port_id: 110, remote_port_id: 101 }],
    errors: [],
  },
  zabbix: { problems: [], errors: [] },
};
const assignedResult = buildLivePayload(assignData, assignRaw);
assert.deepEqual(assignedResult.live.assigned, ['B4-VLAN-AUTO-SW'], 'only the unique VLAN match is assigned');
assert.deepEqual(assignedResult.live.added.sort(), ['B4-VLAN-AUTO-SW', 'INVALID-IP-SW', 'NO-VLAN-MATCH-SW']);
assert.equal(assignData.sites.WMTC.rows.length, 154, 'matched device joins WMTC Access register');
assert.equal(assignData.sites.WHIL.rows.length, 98, 'other site remains unchanged');
const assignedRow = assignData.sites.WMTC.rows.find(r => r.device === 'B4-VLAN-AUTO-SW');
assert.equal(assignedRow.roleShort, 'Access');
assert.equal(assignedRow.neighbor, 'WMTC Building-4', 'duplicate B4 workbook rows still produce one unique Distribution');
assert.equal(assignedRow.buildingVlan, 135, 'third octet becomes the building VLAN');
assert.equal(assignedRow.localVlan, '135');
assert.equal(assignedRow.uplinkPort, 'Gi1/0/1', 'matching real LibreNMS ports are retained');
assert.equal(assignedRow.neighborPort, 'Gi1/0/24');
assert.equal(assignedRow.discovery.assignment, 'third-octet');
assert.equal(assignedRow.discovery.inferredNeighbor, false);
assert.equal(assignData.discovered.rows.some(r => r.device === 'B4-VLAN-AUTO-SW'), false, 'assigned device leaves Discovered');
const unmatchedRow = assignData.discovered.rows.find(r => r.device === 'NO-VLAN-MATCH-SW');
assert.equal(unmatchedRow.roleShort, 'Discovered');
assert.equal(unmatchedRow.buildingVlan, 222);
assert.equal(unmatchedRow.discovery.assignmentStatus, 'unmatched');
assert.equal(assignData.discovered.rows.find(r => r.device === 'INVALID-IP-SW').discovery.assignmentStatus, 'invalid-ip');
const assignedRowCount = assignData.sites.WMTC.rows.length, discoveredRowCount = assignData.discovered.rows.length;
const assignedAgain = buildLivePayload(assignData, assignRaw);
assert.equal(assignedAgain.live.added.length, 0, 'VLAN-assigned and unassigned devices both dedupe');
assert.equal(assignedAgain.live.assigned.length, 0);
assert.equal(assignData.sites.WMTC.rows.length, assignedRowCount);
assert.equal(assignData.discovered.rows.length, discoveredRowCount);
const assignedRemoval = structuredClone(assignRaw);
assignedRemoval.librenms.devices = assignedRemoval.librenms.devices.slice(0, 1);
assignedRemoval.librenms.links = [];
buildLivePayload(assignData, assignedRemoval);
assert.equal(assignData.sites.WMTC.rows.find(r => r.device === 'B4-VLAN-AUTO-SW').discovery.stale, true, 'stale assigned device is retained');

// Existing Discovered state is migrated on a later sync, even without a port link.
const migrationData = JSON.parse(await readFile(new URL('../public/data.json', import.meta.url), 'utf8'));
migrationData.discovered = { rows: [{ id: 'DISC-77-0', row: null, role: 'Discovered Device', roleShort: 'Discovered', device: 'LEGACY-B4-DISC', model: null, serial: null, ip: '192.168.135.77', uplinkPort: null, localVlan: null, neighbor: null, neighborPort: null, neighborVlan: null, neighborSerial: null, buildingVlan: null, floor: 'LibreNMS auto-discovery', zone: 'Live Discovery', direct: 'LEGACY-B4-DISC', path: '', sourceGap: false, noLinkExpected: true, custom: false, modified: false, derivedByApp: false, discovery: { source: 'LibreNMS', deviceId: '77', firstSeen: '2026-01-01T00:00:00.000Z', stale: false } }], nodes: [], edges: [], links: [], stats: {} };
const migrationRaw = { librenms: { devicesOk: true, devices: [{ device_id: 77, hostname: 'LEGACY-B4-DISC', ip: '192.168.135.77', status: 1 }], ports: [], links: [], errors: [] }, zabbix: { problems: [], errors: [] } };
const migrated = buildLivePayload(migrationData, migrationRaw);
assert.deepEqual(migrated.live.assigned, ['LEGACY-B4-DISC']);
assert.equal(migrated.live.added.length, 0, 'migration is not counted as a new discovery');
assert.equal(migrationData.discovered.rows.length, 0);
const migratedRow = migrationData.sites.WMTC.rows.find(r => r.device === 'LEGACY-B4-DISC');
assert.equal(migratedRow.neighbor, 'WMTC Building-4');
assert.equal(migratedRow.discovery.inferredNeighbor, true, 'VLAN-only assignment is explicitly marked as inferred');
assert.equal(migratedRow.discovery.firstSeen, '2026-01-01T00:00:00.000Z', 'discovery history survives migration');

const ambiguousData = JSON.parse(await readFile(new URL('../public/data.json', import.meta.url), 'utf8'));
ambiguousData.sites.WHIL.rows.push({ id: 'WHIL-TEST-ALT', role: 'Distribution Device', roleShort: 'Distribution', device: 'WHIL-B4-ALT', ip: '192.168.135.1', zone: 'WHIL Site' });
const ambiguousRaw = { librenms: { devicesOk: true, devices: [{ device_id: 88, hostname: 'AMBIGUOUS-VLAN-SW', ip: '192.168.135.88', status: 1 }], ports: [], links: [], errors: [] }, zabbix: { problems: [], errors: [] } };
buildLivePayload(ambiguousData, ambiguousRaw);
const ambiguousRow = ambiguousData.discovered.rows.find(r => r.device === 'AMBIGUOUS-VLAN-SW');
assert.equal(ambiguousRow.roleShort, 'Discovered', 'multiple Distributions never cause arbitrary assignment');
assert.equal(ambiguousRow.discovery.assignmentStatus, 'ambiguous');
assert.equal(ambiguousData.sites.WMTC.rows.length, 153);
assert.equal(ambiguousData.sites.WHIL.rows.length, 99);

console.log('Live integration fixture tests passed: status, alerts, utilization, auto-add, dedupe, stale handling, third-octet VLAN assignment, migration, and ambiguity safety');
