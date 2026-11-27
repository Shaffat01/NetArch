import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const data = JSON.parse(await readFile(new URL('../public/data.json', import.meta.url), 'utf8'));
const source = await readFile(new URL('../public/unified.js', import.meta.url), 'utf8');
const context = { console };
context.window = context; context.globalThis = context;
vm.createContext(context); vm.runInContext(source, context);
const { UnifiedAtlas } = context;
const atlas = UnifiedAtlas.build(data);
const byCandidate = name => {
  const key = UnifiedAtlas.nameKey(name);
  const node = atlas.allNodes.find(n => n.candidateKeys.includes(key));
  assert.ok(node, `canonical node contains ${name}`);
  return node;
};
const byLabel = label => {
  const node = atlas.allNodes.find(n => n.label === label);
  assert.ok(node, `canonical node ${label}`);
  return node;
};

assert.equal(atlas.stats.candidateDevices, 547);
assert.equal(atlas.stats.canonicalDevices, 504);
assert.equal(atlas.stats.mergedDuplicates, 43);
assert.equal(atlas.stats.mergeDecisions, 43);
assert.equal(atlas.stats.devices, 317);
assert.equal(atlas.stats.connections, 462);
assert.equal(atlas.stats.evidenceRows, 753);
assert.equal(atlas.stats.ipMappedEndpoints, 411);
assert.equal(atlas.stats.unresolvedRows, 40);
assert.equal(atlas.stats.internalRows, 3);
assert.equal(atlas.stats.ipConflicts, 58);
let expectedConnectionInputs = 0;
for (const bundle of Object.values(data.sites)) expectedConnectionInputs += bundle.rows.filter(r => String(r.neighbor ?? '').trim()).length;
expectedConnectionInputs += (data.discovered?.rows || []).filter(r => String(r.neighbor ?? '').trim()).length;
expectedConnectionInputs += data.connectivity.accessDevices.filter(r => String(r.uplinkDevice ?? '').trim()).length;
expectedConnectionInputs += data.connectivity.links.length + data.ipam.devicePeers.length;
for (const row of data.ipam.ispPeers) for (const ip of [row.r1Ip, row.r2Ip]) if (String(ip ?? '').trim() && String(ip).trim().toUpperCase() !== 'N/A') expectedConnectionInputs += 1;
assert.equal(atlas.stats.evidenceRows + atlas.stats.unresolvedRows + atlas.stats.internalRows, expectedConnectionInputs, 'every explicit connection input is drawn, unresolved or explicitly internal—never dropped');

const rt1 = byCandidate('DC-CORE-RT-01'), rt2 = byCandidate('DC-CORE-RT-02');
assert.equal(rt1.label, 'DC-CORE-RT-01');
assert.equal(rt1.primaryIp, '172.16.0.19');
assert.ok(rt1.candidateKeys.includes('DC-RT-01'));
assert.ok(rt1.candidateKeys.includes('DC-CORE-RT-01'));
assert.notEqual(rt1.id, rt2.id, 'physical routers 01 and 02 remain separate');
assert.equal(byCandidate('NDC-CORE_RT 01').label, 'NDC-CORE-RT-01', 'best display name cleans source formatting');

const fw1 = byCandidate('DC-FIREWALL-01'), fw2 = byCandidate('DC-FIREWALL-02');
assert.ok(fw1.candidateKeys.includes('DC-FTD-FW-01'));
assert.ok(fw1.candidateKeys.includes('DC-SFR-MGMT'));
assert.ok(fw2.candidateKeys.includes('DC-FTD-FW-02'));
assert.notEqual(fw1.id, fw2.id, 'HA firewall members are not blindly merged');
assert.ok(atlas.conflicts.some(c => c.ip === '172.16.2.17' && c.nodeIds.includes(fw1.id) && c.nodeIds.includes(fw2.id)), 'shared firewall IP remains a visible conflict');

const core1 = byCandidate('DC-CORE-SW-01'), core2 = byCandidate('DC-CORE-SW-02');
assert.ok(core1.candidateKeys.includes('DC-CORE-SWITCH-01'));
assert.ok(core2.candidateKeys.includes('DC-CORE-SWITCH-02'));
assert.notEqual(core1.id, core2.id);
assert.ok(!core1.candidateKeys.includes('DC-CORE-SWITCH-02'));

const mbSwitches = [1, 2, 3, 4].map(number => byCandidate(`WHIL-MB-F1-ACC-SW${number}`));
assert.equal(new Set(mbSwitches.map(n => n.id)).size, 4, 'WHIL Access 1–4 never merge through shifted worksheet IPs');
assert.notEqual(byCandidate('WMTC-B1-CORE-SW01').id, byCandidate('WMTC-B1-CORE-SW02').id);
assert.notEqual(byCandidate('B4-CBO-OFFICE-SW-01').id, byCandidate('B4-Mezonine-office-SW01').id, 'different B4 office devices remain separate');
assert.equal(byCandidate('B3-COMPUTER-RND-02').id, byCandidate('computerRND2').id);
assert.equal(byCandidate('B9-ACCESS-SW-02').id, byCandidate('B9-ACCESS-SW-2').id);
assert.equal(byCandidate('TV-RND-Access-Sw').id, byCandidate('WMTC-B1-TVRND-SW').id);
assert.equal(byCandidate('NDC-NOC-Room-SW 1').id, byCandidate('NOC-Switch').id);

for (const node of atlas.allNodes) {
  for (const ip of node.ips) assert.ok(/^(?:\d{1,3}\.){3}\d{1,3}$/.test(ip) && ip.split('.').every(o => Number(o) <= 255), `valid canonical IP ${ip}`);
  assert.ok(!['WMTC Site', 'WHIL Site', 'N5K / 9300', 'DC ↔ WHIL-DC'].includes(node.site), `normalized site for ${node.label}`);
}
assert.equal(JSON.stringify(UnifiedAtlas.parseIps('999.1.1.1/99')), JSON.stringify({ ips: [], shared: true }));
assert.equal(JSON.stringify(UnifiedAtlas.parseIps('172.16.2.6\nStandby 172.16.2.7').ips), JSON.stringify(['172.16.2.6', '172.16.2.7']));
assert.equal(UnifiedAtlas.parseIps('172.16.2.6\nStandby 172.16.2.7').shared, true);

const nodeIds = new Set(atlas.nodes.map(n => n.id));
for (const link of atlas.links) {
  assert.ok(nodeIds.has(link.source) && nodeIds.has(link.target), 'every drawn connection has two canonical endpoints');
  assert.notEqual(link.source, link.target, 'identity merges do not draw self loops');
  assert.equal(link.count, link.links.length);
  assert.ok(link.sourceAliases.length && link.targetAliases.length);
  for (const row of link.links) assert.ok(row.sourceSheet && row.sourceRow !== null && row.sourceRow !== undefined, 'evidence provenance retained');
}
const adn = byLabel('ADN');
const dcAdn = atlas.links.filter(l => l.types.includes('ISP peering') && ((l.source === rt1.id && l.target === adn.id) || (l.source === adn.id && l.target === rt1.id)));
assert.equal(dcAdn.length, 1);
assert.equal(dcAdn[0].count, 4, 'four explicit DC ADN R1 rows aggregate into one canonical ISP connection');
const rtPair = atlas.links.filter(l => (l.source === rt1.id && l.target === rt2.id) || (l.source === rt2.id && l.target === rt1.id));
assert.equal(rtPair.length, 1, 'A→B and B→A register evidence forms one bidirectional connection');
assert.ok(rtPair[0].count >= 4 && rtPair[0].types.includes('Register'));
assert.equal(atlas.unresolved.filter(r => r.sourceSheet === 'WHIL-DC Port Maping' && !r.toName).length, 7, 'seven blank workbook targets remain unresolved');
assert.ok(!atlas.allNodes.some(n => !n.label.trim()), 'blank targets never become invented devices');

const edited = JSON.parse(JSON.stringify(data));
edited.sites.WMTC.rows.push({
  id: 'custom:ip-alias', row: 999, role: 'Core Device', roleShort: 'Core', device: 'DC-RT-01-NEWALIAS', ip: '172.16.0.19',
  neighbor: 'DC-WAN-SWITCH-01', uplinkPort: 'Eth1/1', neighborPort: 'Eth1/1', model: 'Test model', serial: 'TEST-SERIAL-1',
  buildingVlan: null, floor: 'Test floor', zone: 'DC',
});
const editedAtlas = UnifiedAtlas.build(edited);
const editedAlias = editedAtlas.allNodes.find(n => n.candidateKeys.includes('DC-RT-01-NEWALIAS'));
assert.ok(editedAlias, 'new GUI alias is rebuilt into the unified model');
assert.equal(editedAlias.id, rt1.id, 'matching strong IP merges a new alias into the existing canonical device');
assert.ok(editedAlias.serials.includes('TEST-SERIAL-1'));
assert.ok(editedAtlas.links.some(l => l.links.some(r => r.id === 'custom:ip-alias')), 'new explicit GUI connection is drawn');

const physical = JSON.parse(JSON.stringify(data));
physical.sites.WHIL.rows.push({ id: 'custom:physical', row: 1000, role: 'Access SW', roleShort: 'Access', device: 'WHIL-MB-F1-ACC-SW5', ip: '192.168.101.251', neighbor: null, zone: 'WHIL Site' });
const physicalAtlas = UnifiedAtlas.build(physical);
assert.notEqual(physicalAtlas.allNodes.find(n => n.candidateKeys.includes('WHIL-MB-F1-ACC-SW5')).id, mbSwitches[2].id, 'a different physical ordinal is not merged by a conflicting shared IP');

const discovered = JSON.parse(JSON.stringify(data));
discovered.discovered ||= { rows: [], nodes: [], edges: [], links: [], stats: {} };
discovered.discovered.rows.push({ id: 'live:test', row: null, role: 'Discovered Device', roleShort: 'Discovered', device: 'TEST-DISCOVERED-SW', ip: '192.168.222.10', neighbor: 'WMTC-B1-CORE-SW01', zone: 'WMTC Site', discovery: { inferredNeighbor: true } });
const discoveryAtlas = UnifiedAtlas.build(discovered);
const discoveredNode = discoveryAtlas.allNodes.find(n => n.candidateKeys.includes('TEST-DISCOVERED-SW'));
assert.ok(discoveredNode, 'LibreNMS devices join the canonical model');
assert.ok(discoveryAtlas.links.some(l => (l.source === discoveredNode.id || l.target === discoveredNode.id) && l.inferred), 'explicitly labelled inferred discovery link remains dashed evidence');

const removableLink = atlas.links[0];
const editedConnection = atlas.links.find(l => l.id !== removableLink.id && l.source !== rt2.id && l.target !== rt2.id);
const workspaceAtlas = UnifiedAtlas.applyWorkspace(atlas, {
  deviceEdits: { [rt1.id]: { label: 'DC-ROUTER-PRIMARY', primaryIp: '10.200.0.1', aliases: ['DC-RT-01', 'Edited Router Alias'], layer: 'Core', site: 'DC', role: 'Core' } },
  connectionEdits: { [editedConnection.id]: { kind: 'Edited local trunk', fromPort: 'Eth9/9', toPort: 'Eth9/10' } },
  devices: [{ id: 'custom:local-unified-sw', label: 'LOCAL-UNIFIED-SW', primaryIp: '10.200.0.2', aliases: ['Local test switch'], layer: 'Access', site: 'WMTC', role: 'Access', model: 'CBS350', serial: 'LOCAL-SERIAL' }],
  connections: [{ id: 'custom:local-unified-link', source: 'custom:local-unified-sw', target: rt1.id, kind: 'Local trunk', fromPort: 'Gi1/0/1', toPort: 'Eth9/1' }],
  deletedDevices: [rt2.id], deletedConnections: [removableLink.id],
});
const editedRouter = workspaceAtlas.allNodes.find(n => n.id === rt1.id);
assert.equal(editedRouter.label, 'DC-ROUTER-PRIMARY');
assert.equal(editedRouter.primaryIp, '10.200.0.1');
assert.ok(editedRouter.candidateKeys.includes('EDITED-ROUTER-ALIAS'));
assert.ok(!workspaceAtlas.allNodes.some(n => n.id === rt2.id), 'canonical device delete removes the active node');
assert.ok(workspaceAtlas.links.every(l => l.source !== rt2.id && l.target !== rt2.id), 'canonical device delete removes its active connections');
assert.ok(!workspaceAtlas.links.some(l => l.id === removableLink.id), 'canonical connection delete removes the active link');
const customNode = workspaceAtlas.allNodes.find(n => n.id === 'custom:local-unified-sw');
assert.ok(customNode && workspaceAtlas.nodes.some(n => n.id === customNode.id), 'custom unified device is visible even with one custom connection');
assert.ok(workspaceAtlas.links.some(l => l.id === 'custom:local-unified-link' && l.custom), 'custom unified connection is drawn');
assert.equal(workspaceAtlas.links.find(l => l.id === editedConnection.id).displayTypes[0], 'Edited local trunk');
assert.ok(workspaceAtlas.stats.customDevices === 1 && workspaceAtlas.stats.customConnections === 1);
assert.ok(workspaceAtlas.stats.deletedDevices === 1 && workspaceAtlas.stats.deletedConnections === 1);
const mergedCustom = UnifiedAtlas.applyWorkspace(atlas, { connections: [{ id: 'custom:merged-local-link', source: rt1.id, target: rt2.id, kind: 'Local parallel override', fromPort: 'Gi9/9' }] });
const mergedCustomLink = mergedCustom.links.find(link => link.id === atlas.links.find(link => (link.source === rt1.id && link.target === rt2.id) || (link.source === rt2.id && link.target === rt1.id)).id);
assert.equal(mergedCustomLink.workspaceCustom, true, 'custom connection merged into an existing canonical pair remains identifiable');
assert.equal(mergedCustomLink.localEdit.id, 'custom:merged-local-link', 'merged custom connection retains a stable local edit/delete ID');

console.log(`Unified IP tests passed: ${atlas.stats.candidateDevices} names → ${atlas.stats.canonicalDevices} identities, ${atlas.stats.mergedDuplicates} merges, ${atlas.stats.connections} connections, ${atlas.stats.ipConflicts} preserved shared-IP conflicts.`);
