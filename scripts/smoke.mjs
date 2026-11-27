import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';

const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
const dataJs = await readFile(new URL('../public/data.js', import.meta.url), 'utf8');
const unifiedJs = await readFile(new URL('../public/unified.js', import.meta.url), 'utf8');
const crudJs = await readFile(new URL('../public/crud.js', import.meta.url), 'utf8');
const appJs = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
const data = JSON.parse(await readFile(new URL('../public/data.json', import.meta.url), 'utf8'));
const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'http://localhost/' });
const { window } = dom;
const { document } = window;
const errors = [];
window.addEventListener('error', e => errors.push(e.error || e.message));
window.CSS ||= {};
window.CSS.escape ||= s => String(s).replace(/[^a-zA-Z0-9_-]/g, c => `\\${c}`);
window.HTMLElement.prototype.scrollIntoView = () => {};
window.HTMLAnchorElement.prototype.click = () => {};
window.SVGElement.prototype.setPointerCapture = () => {};
window.URL.createObjectURL = () => 'blob:smoke-test';
window.URL.revokeObjectURL = () => {};
window.confirm = () => true;
let savedWorkspace = null;
let mockSyncData = null;
let mockLive = { configured: false, config: { librenms: false, zabbix: false, autoDiscover: true }, status: 'unconfigured', devices: [], links: [], alerts: [], errors: [], added: [], lastSync: null };
window.fetch = async (url, options = {}) => {
  if (url === '/api/live') return { ok: true, status: 200, json: async () => mockLive };
  if (url === '/api/live/sync') return { ok: true, status: 200, json: async () => ({ live: mockLive, data: mockSyncData }) };
  if (url !== '/api/state') throw new Error('Unexpected fetch: ' + url);
  const method = options.method || 'GET';
  if (method === 'GET') {
    return savedWorkspace
      ? { ok: true, status: 200, json: async () => savedWorkspace }
      : { ok: true, status: 204, json: async () => ({}) };
  }
  if (method === 'PUT') {
    savedWorkspace = JSON.parse(options.body);
    return { ok: true, status: 200, json: async () => ({ ok: true }) };
  }
  if (method === 'DELETE') {
    savedWorkspace = null;
    return { ok: true, status: 200, json: async () => ({ ok: true }) };
  }
  throw new Error('Unexpected method: ' + method);
};

window.eval(dataJs);
window.eval(unifiedJs);
window.eval(crudJs);
window.eval(appJs);
const tick = (ms = 30) => new Promise(resolve => setTimeout(resolve, ms));
const click = el => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
const input = (el, value) => { el.value = value; el.dispatchEvent(new window.Event('input', { bubbles: true })); };
const change = (el, value) => { el.value = value; el.dispatchEvent(new window.Event('change', { bubbles: true })); };
const text = selector => document.querySelector(selector)?.textContent || '';
const count = selector => document.querySelectorAll(selector).length;
await tick();

// Unified IP architecture is the primary experience; register topology remains editable fallback.
const unified = window.UnifiedAtlas.build(data);
const defaultUnifiedLayers = new Set(['External', 'WAN / Edge', 'Core', 'Fabric', 'Distribution']);
const defaultUnifiedNodes = unified.nodes.filter(n => defaultUnifiedLayers.has(n.layer));
const defaultUnifiedIds = new Set(defaultUnifiedNodes.map(n => n.id));
const defaultUnifiedLinks = unified.links.filter(l => defaultUnifiedIds.has(l.source) && defaultUnifiedIds.has(l.target));
assert.match(text('h1'), /Unified infrastructure architecture/);
assert.equal(document.getElementById('siteSwitch').hidden, true, 'unified architecture is not split by site perspective');
assert.equal(count('#graphSvg .node'), defaultUnifiedNodes.length, 'default unified backbone devices rendered');
assert.equal(count('#graphSvg .graph-link'), defaultUnifiedLinks.length, 'default unified canonical links rendered');
assert.match(text('main'), /43 duplicates merged/);
assert.match(text('main'), /58/);
const canonicalRouter = document.querySelector('[data-node-id="u:DC-CORE-RT-01"]');
assert.ok(canonicalRouter, 'best canonical router name rendered');
click(canonicalRouter);
assert.match(text('#drawer'), /CANONICAL IP DEVICE/);
assert.match(text('#drawer'), /DC-RT-01/);
assert.match(text('#drawer'), /172\.16\.0\.19/);
assert.match(text('#drawer'), /Connected canonical devices/);
click(document.querySelector('[data-close-drawer]'));
click(document.querySelector('[data-unified-scope="DC / NDC"]'));
assert.ok(document.querySelector('[data-unified-scope="DC / NDC"]').classList.contains('active'));
assert.ok(count('#graphSvg .node') < defaultUnifiedNodes.length, 'datacenter scope reduces the unified map');
click(document.querySelector('[data-unified-scope="All"]'));
click(document.querySelector('[data-unified-layer="Access"]'));
assert.ok(document.querySelector('[data-node-id="u:WMTC-B4-ACC-SW02"]'), 'Access layer reveals canonical campus devices');
click(document.querySelector('[data-unified-layer="Access"]'));
click(document.querySelector('[data-action="export"]'));
assert.match(text('#toast'), /unified-ip-architecture-all\.csv.*rows prepared/, 'unified export contains IP-wise canonical mapping');
click(document.querySelector('[data-arch-mode="register"]'));
assert.match(text('h1'), /WMTC architecture/);
assert.equal(count('#graphSvg .node'), data.sites.WMTC.nodes.length, 'all WMTC nodes rendered');
assert.equal(count('#graphSvg .graph-link'), data.sites.WMTC.links.length, 'all WMTC aggregated links rendered');
assert.equal(count('.gap-chip'), 11, 'ten gap devices plus more button');
assert.equal(count('#graphSvg .node.has-gap'), 20, 'WMTC gap devices marked');

// B4 building-name evidence wins over the conflicting serial, and Access→Access
// chains stay in the same upstream Distribution branch without inventing links.
const b4sw02 = data.sites.WMTC.nodes.find(n => n.id === 'WMTC-B4-ACC-SW02');
assert.equal(b4sw02.rootKey, 'WMTC-BUILDING-4', 'B4 SW02 uses its explicit Distribution branch');
assert.ok(data.sites.WMTC.links.some(l => l.source === 'WMTC-B4-ACC-SW02' && l.target === 'WMTC-BUILDING-4'), 'B4 SW02 documented link targets Building-4');
const b4Chain = ['B4-COMPRESSOR-RND02', 'B4-MEZONINE-OFFICE-SW01', 'WMTC-B4-DINNING-SW', 'WMTC-B4-CCTV-SW'];
b4Chain.forEach(id => assert.equal(data.sites.WMTC.nodes.find(n => n.id === id)?.rootKey, 'WMTC-BUILDING-4', `${id} remains under B4 Distribution`));
const b4Header = [...document.querySelectorAll('#graphSvg .access-group')].find(el => el.textContent.startsWith('WMTC Building-4'));
assert.match(b4Header?.textContent || '', /26 devices/, 'B4 Access branch header groups all 26 Access devices');
const b4Dist = [...document.querySelectorAll('#graphSvg .node')].find(el => el.dataset.nodeId === 'WMTC-BUILDING-4');
click(b4Dist);
const chainedNode = [...document.querySelectorAll('#graphSvg .node')].find(el => el.dataset.nodeId === 'B4-COMPRESSOR-RND02');
assert.ok(chainedNode.classList.contains('neighbor'), 'full-branch focus includes chained Access device');
assert.match(text('#focusBanner'), /branch devices/, 'branch focus is the default');
click(document.querySelector('[data-action="toggle-focus-mode"]'));
assert.ok(chainedNode.classList.contains('dimmed'), 'direct-only focus excludes indirect Access→Access hop');
assert.ok(![...document.querySelectorAll('#graphSvg .node')].find(el => el.dataset.nodeId === 'WMTC-B4-ACC-SW02').classList.contains('dimmed'), 'direct-only focus retains direct B4 Access link');
click(document.querySelector('[data-action="clear-focus"]'));
click(document.querySelector('[data-close-drawer]'));
click(document.querySelector('[data-view="live"]'));
assert.match(text('h1'), /Live operations/);
assert.equal(count('.setup-card'), 1, 'unconfigured live view shows setup, not fake data');
assert.match(text('.setup-card'), /No fake status or metrics/);
click(document.querySelector('[data-view="architecture"]'));

click(document.querySelector('[data-site="WHIL"]'));
assert.match(text('h1'), /WHIL architecture/);
assert.equal(count('#graphSvg .node'), data.sites.WHIL.nodes.length, 'all WHIL nodes rendered');
assert.equal(count('#graphSvg .graph-link'), data.sites.WHIL.links.length, 'all WHIL aggregated links rendered');
assert.equal(count('#graphSvg .node.has-gap'), 13, 'WHIL gap devices marked');

click(document.querySelector('[data-view="datacenter"]'));
assert.match(text('h1'), /WHIL · DC \/ NDC/);
assert.equal(count('.inventory-item[data-entry-type="dc"]'), 103, 'six requested DC rows hidden; other DataCenter entries rendered');
assert.equal(data.sites.WHIL.dataCenter.length, 109, 'all 109 raw DataCenter source rows remain preserved');
assert.equal(count('#graphSvg .node'), 64, '64 included IP-identified devices render in racks/special groups');
assert.equal(count('#graphSvg .graph-link'), 0, 'Data Center Devices source tab creates no invented links');
assert.match(text('#graphSvg'), /DC · RACK 1/);
assert.match(text('#graphSvg'), /DC · RACK 2/);
assert.match(text('#graphSvg'), /NDC · RACK 1/);
assert.match(text('#graphSvg'), /NDC · RACK 2/);
assert.match(text('#graphSvg'), /NDC · NOC/);
assert.match(text('#graphSvg'), /NDC · F5/);
assert.match(text('#graphSvg'), /NDC · DR DEVICES/);
const rackExpectations = [
  ['SRC_DataCenter-DC-20', 'DC_RACK_1'], ['SRC_DataCenter-DC-21', 'DC_RACK_2'],
  ['SRC_DataCenter-DC-41', 'DC_RACK_1'], ['SRC_DataCenter-DC-42', 'DC_RACK_2'],
  ['SRC_DataCenter-DC-12', 'DC_RACK_1'], ['SRC_DataCenter-DC-13', 'DC_RACK_2'],
  ['SRC_DataCenter-NDC-20', 'NDC_RACK_2'], ['SRC_DataCenter-NDC-9', 'NDC_NOC'],
  ['SRC_DataCenter-NDC-63', 'NDC_F5'], ['SRC_DataCenter-NDC-57', 'NDC_DR'],
];
rackExpectations.forEach(([id, group]) => assert.equal(document.querySelector(`[data-node-id="${id}"]`)?.dataset.dcGroup, group, `${id} uses ${group}`));
['SRC_DataCenter-DC-9', 'SRC_DataCenter-DC-36', 'SRC_DataCenter-DC-37', 'SRC_DataCenter-DC-38'].forEach(id => assert.equal(document.querySelector(`[data-node-id="${id}"]`), null, `${id} excluded from DC device view`));
assert.equal(document.querySelector('[data-entry-id="SRC_DataCenter-DC-8"]'), null, 'empty DC NOC group label is hidden too');
assert.equal(document.querySelector('[data-entry-id="SRC_DataCenter-DC-35"]'), null, 'empty DC Access group label is hidden too');
const sourceFirewall = document.querySelector('[data-node-id="SRC_DataCenter-DC-15"]');
assert.ok(sourceFirewall, 'source DC-FIREWALL-01 row is present');
assert.equal(document.querySelector('[data-node-id="DC-FTD-FW-02"]'), null, 'main-register-only device is not mixed into source devices');
click(sourceFirewall);
assert.match(text('#drawer'), /DC-FIREWALL-01/);
assert.match(text('#drawer'), /172\.16\.0\.15/);
assert.match(text('#drawer'), /VLAN \/ note/);
click(document.querySelector('[data-close-drawer]'));
click(document.querySelector('[data-dc-graph="core"]'));
const coreRecordIds = new Set(data.connectivity.links.filter(r => ['DC BackBone', 'NDC BackBone', 'DC Core-Distribution', 'WHIL-DC Port Maping'].includes(r.sourceSheet)).map(r => r.id));
const expectedCoreLinks = unified.links.filter(link => link.links.some(row => coreRecordIds.has(row.id)));
const expectedCoreNodeIds = new Set(expectedCoreLinks.flatMap(link => [link.source, link.target]));
unified.unresolved.filter(row => coreRecordIds.has(row.id)).forEach(row => {
  const key = window.UnifiedAtlas.nameKey(row.fromName), node = unified.allNodes.find(n => n.candidateKeys.includes(key));
  if (node) expectedCoreNodeIds.add(node.id);
});
assert.ok(document.querySelector('[data-node-id="u:DC-FIREWALL-02"]'), 'canonical Core links contain DC-FIREWALL-02');
assert.equal(document.querySelector('[data-node-id="coresrc:DC-FTD-FW-02"]'), null, 'firewall alias is merged rather than drawn as a separate exact-name node');
assert.equal(count('#graphSvg .node'), expectedCoreNodeIds.size, 'canonical workbook core devices rendered');
assert.ok(expectedCoreNodeIds.size < 84, 'IP identity reduces duplicate core device representations');
assert.equal(count('#graphSvg .graph-link'), expectedCoreLinks.length, 'canonical core connections rendered');
assert.ok(expectedCoreLinks.length > 0 && expectedCoreLinks.length <= 181, 'core links remain bounded by resolved source rows');
assert.ok(expectedCoreLinks.some(link => link.count > 1), 'parallel and bidirectional core evidence is grouped where identities agree');
assert.match(text('main'), /188/, '188 core source rows shown in stats');
assert.match(text('main'), /181/, '181 resolved core rows shown in stats');
const partialCoreNode = document.querySelector('[data-node-id="u:WHIL-FW-01"]');
assert.ok(partialCoreNode.classList.contains('has-gap'), 'blank-target WHIL rows mark the canonical source device partial');
click(partialCoreNode);
assert.match(text('#drawer'), /CANONICAL IP DEVICE/);
assert.match(text('#drawer'), /Incomplete source evidence/);
assert.match(text('#drawer'), /Blank target/);
assert.match(text('#drawer'), /WHIL-DC Port Maping/);
click(document.querySelector('[data-close-drawer]'));
click(document.querySelector('#graphSvg .link-hit'));
assert.match(text('#drawer'), /CANONICAL IP CONNECTION/);
assert.match(text('#drawer'), /Explicit evidence/);
click(document.querySelector('[data-close-drawer]'));
click(document.querySelector('[data-action="export"]'));
assert.match(text('#toast'), /188 rows prepared/, 'Core links CSV includes all core source rows, including blank targets');
click(document.querySelector('[data-dc-graph="register"]'));
assert.ok(document.querySelector('[data-node-id="DC-FTD-FW-02"]'), 'separate Main register mode preserves previous evidence');
assert.ok(count('#graphSvg .graph-link') > 0, 'main-register Core links remain available');
click(document.querySelector('[data-action="export"]'));
assert.match(text('#toast'), /38 rows prepared/, 'Main register CSV exports the original Core rows');
click(document.querySelector('[data-dc-graph="devices"]'));
assert.equal(count('#graphSvg .node'), 64, 'rack/grouped source device view restored');
input(document.querySelector('[data-dc-search]'), '172.16.6.1');
assert.ok(count('.inventory-item[data-entry-type="dc"]') > 0, 'DC search returns result');
assert.ok(count('.inventory-item[data-entry-type="dc"]') < 103, 'DC search filters');
input(document.querySelector('[data-dc-search]'), '');
click(document.querySelector('.inventory-item[data-entry-type="dc"]'));
assert.ok(document.getElementById('drawer').classList.contains('open'), 'DC detail opens');
click(document.querySelector('[data-close-drawer]'));

click(document.querySelector('[data-view="dmz"]'));
assert.equal(count('.inventory-item[data-entry-type="dmz"]'), 155, 'all DMZ/MZ entries rendered');
input(document.querySelector('[data-dmz-search]'), 'OneEye');
assert.ok(count('.inventory-item[data-entry-type="dmz"]') >= 2, 'DMZ/MZ search finds both source entries');
input(document.querySelector('[data-dmz-search]'), '');

// Peering-workbook upgrade: port evidence, safe access inventory and labels.
assert.equal(data.connectivity.stats.links, 431, 'all normalized port/cabling rows extracted');
assert.equal(data.connectivity.stats.completeLinks, 389, 'complete endpoint count');
assert.equal(data.connectivity.stats.partialLinks, 42, 'partial source rows retained');
assert.equal(data.ipam.stats.blocks, 90, 'IP blocks and independent allocations');
assert.equal(data.ipam.stats.vlans, 98, 'full HQ-VLAN coverage');
assert.equal(data.ipam.stats.devicePeers, 64, 'device peering coverage');
assert.equal(data.ipam.stats.ispPeers, 34, 'ISP peering coverage excludes empty merged-label spacers');
assert.equal(data.ipam.stats.loopbacks, 12, 'loopback coverage');
assert.ok(!JSON.stringify(data.connectivity).includes('UserName'), 'HQ Access usernames never enter app data');
assert.ok(!JSON.stringify(data).includes('ALL ISP CACTI LOGIN INFORMATION'), 'credential-only Cacti tab excluded');

click(document.querySelector('[data-view="connectivity"]'));
assert.match(text('h1'), /Port connectivity/);
assert.equal(document.getElementById('siteSwitch').hidden, true, 'workbook-wide view hides irrelevant site perspective switch');
assert.match(text('#connectivityCount'), /431 matching rows/, 'all port rows filterable');
assert.equal(count('#connectivityBody tr[data-upgrade-id]'), 25, 'port table paginates');
change(document.getElementById('connectivityScope'), 'DC');
assert.match(text('#connectivityCount'), /143 matching rows/, 'DC scope filter');
change(document.getElementById('connectivityEvidence'), 'partial');
assert.doesNotMatch(text('#connectivityCount'), /143 matching rows|0 matching rows/, 'partial evidence filter is selective');
change(document.getElementById('connectivityEvidence'), '');
change(document.getElementById('connectivityScope'), '');
input(document.getElementById('connectivitySearch'), 'NDC-CORE-SW-01');
assert.ok(count('#connectivityBody tr[data-upgrade-id]') > 0, 'port text search returns evidence');
click(document.querySelector('#connectivityBody tr[data-upgrade-id]'));
assert.match(text('#drawer'), /Source provenance/);
assert.match(text('#drawer'), /NDC BackBone|DC BackBone|NDC Devices Peering IP/);
assert.match(text('#drawer'), /not live|No live reachability/i, 'worksheet status is not presented as live health');
click(document.querySelector('[data-close-drawer]'));
input(document.getElementById('connectivitySearch'), '');
click(document.querySelector('[data-connectivity-page="next"]'));
assert.match(text('#connectivityPageInfo'), /Page 2/, 'port pagination controls');
click(document.querySelector('[data-connectivity-tab="accessDevices"]'));
assert.match(text('#connectivityCount'), /27 matching rows/, 'safe HQ Access inventory count');
assert.equal(count('#connectivityBody tr[data-upgrade-id]'), 25, 'access inventory first page');
click(document.querySelector('[data-connectivity-page="next"]'));
assert.equal(count('#connectivityBody tr[data-upgrade-id]'), 2, 'access inventory second page');
click(document.querySelector('#connectivityBody tr[data-upgrade-id]'));
assert.doesNotMatch(text('#drawer'), /UserName|Password/, 'access drawer contains no credential fields');
click(document.querySelector('[data-close-drawer]'));
click(document.querySelector('[data-connectivity-tab="labels"]'));
assert.match(text('#connectivityCount'), /112 matching rows/, 'all cable label rows');

click(document.querySelector('[data-view="ipam"]'));
assert.match(text('h1'), /IPAM & peering/);
assert.match(text('#ipamCount'), /90 matching rows/, 'IP block directory count');
assert.equal(count('#ipamBody tr[data-upgrade-id]'), 25, 'IPAM pagination');
click(document.querySelector('[data-ipam-tab="vlans"]'));
assert.match(text('#ipamCount'), /98 matching rows/, 'VLAN directory count');
change(document.getElementById('ipamFilter'), 'WMTC');
assert.match(text('#ipamCount'), /56 matching rows/, 'VLAN owner filter');
change(document.getElementById('ipamFilter'), '');
input(document.getElementById('ipamSearch'), 'Ground Floor,Top Floor');
assert.match(text('#ipamCount'), /1 matching rows/, 'blank-VLAN source row is findable');
assert.match(text('#ipamBody'), /BLANK IN SOURCE/, 'blank VLAN ID is not dropped or invented');
click(document.querySelector('#ipamBody tr[data-upgrade-id]'));
assert.match(text('#drawer'), /HQ-VLAN/);
assert.match(text('#drawer'), /91/);
click(document.querySelector('[data-close-drawer]'));
click(document.querySelector('[data-ipam-tab="devicePeers"]'));
assert.match(text('#ipamCount'), /64 matching rows/, 'device peering tab');
click(document.querySelector('[data-ipam-tab="ispPeers"]'));
assert.match(text('#ipamCount'), /34 matching rows/, 'ISP peering tab excludes six empty spacer rows');
click(document.querySelector('[data-ipam-tab="loopbacks"]'));
assert.match(text('#ipamCount'), /12 matching rows/, 'loopback tab');
click(document.querySelector('[data-action="export"]'));
assert.match(text('#toast'), /12 rows prepared/, 'IPAM CSV export uses current tab');
input(document.getElementById('globalSearch'), '103.219.163.24/29');
assert.ok(count('.search-result') > 0, 'global search includes ISP peering evidence');
document.getElementById('globalSearch').dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
await tick(120);
assert.match(text('h1'), /IPAM & peering/, 'global search navigates to IPAM');
assert.ok(document.getElementById('drawer').classList.contains('open'), 'global search opens peering provenance');
assert.match(text('#drawer'), /103\.219\.163\.24\/29/);
click(document.querySelector('[data-close-drawer]'));

click(document.querySelector('[data-view="records"]'));
assert.match(text('#recordsCount'), /98 matching rows/, 'WHIL full record count');
assert.equal(count('#recordsBody tr[data-record-id]'), 25, 'record pagination');
change(document.getElementById('recordRole'), 'Core');
assert.match(text('#recordsCount'), /38 matching rows/, 'role filter');
const gap = document.getElementById('recordGap'); gap.checked = true; gap.dispatchEvent(new window.Event('change', { bubbles: true }));
assert.match(text('#recordsCount'), /12 matching rows/, 'core source-gap filter');
click(document.querySelector('#recordsBody tr[data-record-id]'));
assert.ok(document.getElementById('drawer').classList.contains('open'), 'record detail opens');
assert.match(text('#drawer'), /Source gap|Neighbor Device is blank/, 'gap evidence visible');
click(document.querySelector('[data-close-drawer]'));

input(document.getElementById('globalSearch'), 'WMTC -B-1-CCTV-SW');
assert.ok(count('.search-result') > 0, 'global search results');
document.getElementById('globalSearch').dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
await tick(120);
assert.match(text('h1'), /Unified infrastructure architecture/, 'canonical search navigates to unified architecture');
assert.ok(document.getElementById('drawer').classList.contains('open'), 'search opens canonical device details');
assert.match(text('#drawer'), /CANONICAL IP DEVICE/);
click(document.querySelector('[data-close-drawer]'));

const firstNode = document.querySelector('#graphSvg .node');
click(firstNode);
assert.ok(document.getElementById('drawer').classList.contains('open'), 'graph node details');
click(document.querySelector('[data-close-drawer]'));
const firstLink = document.querySelector('#graphSvg .link-hit');
click(firstLink);
assert.match(text('#drawer'), /Explicit evidence/, 'unified graph link details');
click(document.querySelector('[data-close-drawer]'));

click(document.querySelector('[data-site="WMTC"]'));
click(document.querySelector('[data-view="records"]'));
assert.match(text('#recordsCount'), /153 matching rows/, 'WMTC full record count');
change(document.getElementById('recordRole'), '');
const allGap = document.getElementById('recordGap'); allGap.checked = true; allGap.dispatchEvent(new window.Event('change', { bubbles: true }));
assert.match(text('#recordsCount'), /20 matching rows/, 'WMTC all source gaps');
click(document.querySelector('[data-action="export"]'));
assert.match(text('#toast'), /20 rows prepared/, 'filtered CSV export');

// Add → neighbourhood focus → edit/update → delete, with server-style persistence.
click(document.querySelector('[data-view="architecture"]'));
click(document.querySelector('[data-arch-mode="register"]'));
click(document.querySelector('[data-action="add-device"]'));
assert.equal(document.getElementById('editorModal').hidden, false, 'add-device editor opens');
const editorInput = (field, value) => input(document.querySelector(`[data-editor-field="${field}"]`), value);
editorInput('device', 'TEST-ACCESS-SW');
editorInput('ip', '10.99.0.1');
editorInput('model', 'CBS350-24T');
editorInput('serial', 'TEST-SERIAL-01');
input(document.querySelector('[data-conn-field="neighbor"]'), 'WMTC-B1-CORE-SW');
input(document.querySelector('[data-conn-field="uplinkPort"]'), 'Gi1/0/1');
input(document.querySelector('[data-conn-field="neighborPort"]'), 'Gi1/0/24');
document.getElementById('deviceEditorForm').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
await tick(500);
assert.equal(savedWorkspace.sites.WMTC.rows.length, 154, 'add device persisted');
assert.ok(savedWorkspace.sites.WMTC.nodes.some(n => n.label === 'TEST-ACCESS-SW'), 'new node in saved graph');
assert.ok(document.getElementById('graphSvg').classList.contains('focus-active'), 'device click/search activates neighbourhood focus');
assert.ok(count('#graphSvg .node.neighbor') >= 1, 'direct connected devices highlighted');
assert.ok(count('#graphSvg .node.dimmed') > 0, 'unconnected devices dimmed');
assert.equal(document.getElementById('focusBanner').hidden, false, 'focus banner visible');
click(document.querySelector('[data-action="clear-focus"]'));
assert.equal(document.getElementById('graphSvg').classList.contains('focus-active'), false, 'clear focus restores graph');

click(document.querySelector('#drawer [data-edit-node]'));
assert.equal(document.getElementById('editorModal').hidden, false, 'edit button opens editor');
editorInput('ip', '10.99.0.2');
document.getElementById('deviceEditorForm').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
await tick(500);
const updatedRows = savedWorkspace.sites.WMTC.rows.filter(r => r.device === 'TEST-ACCESS-SW');
assert.equal(updatedRows.length, 1, 'updated device keeps one row');
assert.equal(updatedRows[0].ip, '10.99.0.2', 'update device persisted');
assert.equal(updatedRows[0].neighbor, 'WMTC-B1-CORE-SW', 'explicit connection preserved');

// A second device references the first, so deleting the first must preserve the second as a gap.
click(document.querySelector('[data-action="add-device"]'));
editorInput('device', 'TEST-DEPENDENT-SW');
input(document.querySelector('[data-conn-field="neighbor"]'), 'TEST-ACCESS-SW');
document.getElementById('deviceEditorForm').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
await tick(500);
assert.equal(savedWorkspace.sites.WMTC.rows.length, 155, 'dependent device added');
const firstCustomNode = [...document.querySelectorAll('#graphSvg .node')].find(el => el.dataset.nodeId === 'TEST-ACCESS-SW');
click(firstCustomNode);
click(document.querySelector('#drawer [data-delete-node]'));
await tick(100);
assert.equal(savedWorkspace.sites.WMTC.rows.length, 154, 'delete removes only the selected local rows');
assert.equal(savedWorkspace.sites.WMTC.nodes.some(n => n.label === 'TEST-ACCESS-SW'), false, 'deleted node removed from graph');
const dependentRow = savedWorkspace.sites.WMTC.rows.find(r => r.device === 'TEST-DEPENDENT-SW');
assert.ok(dependentRow, 'other device remains after neighbour deletion');
assert.equal(dependentRow.neighbor, null, 'incoming reference cleared');
assert.equal(dependentRow.sourceGap, true, 'cleared incoming reference becomes a source gap');
const dependentNode = [...document.querySelectorAll('#graphSvg .node')].find(el => el.dataset.nodeId === 'TEST-DEPENDENT-SW');
click(dependentNode);
click(document.querySelector('#drawer [data-delete-node]'));
await tick(100);
assert.equal(savedWorkspace.sites.WMTC.rows.length, 153, 'cleanup deletes dependent device');
assert.equal(savedWorkspace.sites.WMTC.rows.some(r => r.neighbor === 'TEST-ACCESS-SW'), false, 'deleted device leaves no dangling neighbour');

// Configured live payload: status, alerts, utilization and auto-discovered graph merge.
const withDiscovery = structuredClone(savedWorkspace);
delete withDiscovery.upgradeMeta;
delete withDiscovery.ipam;
delete withDiscovery.connectivity;
withDiscovery.discovered = { rows: [{ id: 'DISC-NEW-1', row: null, role: 'Discovered Device', roleShort: 'Discovered', device: 'NEW-LIVE-SW', model: 'CBS350', serial: 'NEW-SERIAL', ip: '10.99.0.10', uplinkPort: 'Gi1/0/2', localVlan: null, neighbor: 'WMTC-B1-CORE-SW', neighborPort: 'Gi1/0/1', neighborVlan: null, neighborSerial: null, buildingVlan: null, floor: 'LibreNMS auto-discovery', zone: 'Live Discovery', direct: 'NEW-LIVE-SW [Gi1/0/2] → WMTC-B1-CORE-SW [Gi1/0/1]', path: '', sourceGap: false, custom: false, modified: false, derivedByApp: false, discovery: { source: 'LibreNMS', deviceId: '2', firstSeen: new Date().toISOString(), stale: false } }], nodes: [], edges: [], links: [], stats: {} };
withDiscovery.sites.WMTC.rows.push({ id: 'WMTC-DISC-3', row: null, role: 'Access SW', roleShort: 'Access', device: 'B4-AUTO-RENDER', model: 'CBS350', serial: 'B4-AUTO-RENDER-SERIAL', ip: '192.168.135.90', uplinkPort: null, localVlan: '135', neighbor: 'WMTC Building-4', neighborPort: null, neighborVlan: null, neighborSerial: null, buildingVlan: 135, floor: 'LibreNMS auto-discovery', zone: 'WMTC Site', direct: 'B4-AUTO-RENDER [] → WMTC Building-4 []', path: '', sourceGap: false, noLinkExpected: false, custom: false, modified: false, derivedByApp: true, discovery: { source: 'LibreNMS', deviceId: '3', firstSeen: new Date().toISOString(), lastSeen: new Date().toISOString(), stale: false, assignment: 'third-octet', assignedSite: 'WMTC', assignedDistribution: 'WMTC Building-4', vlan: 135, inferredNeighbor: true } });
mockSyncData = withDiscovery;
mockLive = {
  configured: true, config: { librenms: true, zabbix: true, autoDiscover: true }, status: 'ok', lastSync: new Date().toISOString(), errors: [], added: ['NEW-LIVE-SW', 'B4-AUTO-RENDER'], assigned: ['B4-AUTO-RENDER'],
  devices: [
    { source: 'LibreNMS', deviceId: '1', hostname: 'WMTC-B1-CORE-SW', ip: '192.168.137.1', status: 'up', uptimeSeconds: 7200 },
    { source: 'LibreNMS', deviceId: '2', hostname: 'NEW-LIVE-SW', ip: '10.99.0.10', status: 'down', uptimeSeconds: 0 },
    { source: 'LibreNMS', deviceId: '3', hostname: 'B4-AUTO-RENDER', ip: '192.168.135.90', status: 'up', uptimeSeconds: 3600 },
  ],
  links: [{ source: 'WMTC-B1-CORE-SW', target: 'NEW-LIVE-SW', localPort: 'Gi1/0/1', remotePort: 'Gi1/0/2', inBps: 8000000, outBps: 4000000, speedBps: 100000000, utilization: 12, errors: 0, discards: 0 }],
  alerts: [{ source: 'Zabbix', eventId: '99', hostname: 'WMTC-B1-CORE-SW', name: 'High CPU usage', severity: 4, severityName: 'High', lastChange: 1700000000 }],
};
click(document.querySelector('[data-view="live"]'));
click(document.querySelector('[data-action="sync-live"]'));
await tick(500);
assert.match(text('h1'), /Live operations/);
assert.match(text('.live-alerts'), /High CPU usage/, 'active Zabbix alert rendered');
assert.match(text('.live-links-card'), /12.0%/, 'link utilization rendered');
assert.ok(savedWorkspace.discovered.nodes.some(n => n.label === 'NEW-LIVE-SW'), 'discovered graph rebuilt and persisted');
assert.equal(savedWorkspace.connectivity.stats.links, 431, 'live sync of an older saved workspace restores port evidence');
assert.equal(savedWorkspace.ipam.stats.blocks, 90, 'live sync of an older saved workspace restores IPAM evidence');
click(document.querySelector('[data-view="architecture"]'));
const assignedNode = [...document.querySelectorAll('#graphSvg .node')].find(el => el.dataset.nodeId === 'B4-AUTO-RENDER');
assert.ok(assignedNode, 'third-octet assigned device renders in architecture');
assert.ok(assignedNode.classList.contains('role-access'), 'VLAN-matched discovery becomes Access, not Discovered');
assert.equal(savedWorkspace.sites.WMTC.nodes.find(n => n.id === 'B4-AUTO-RENDER')?.rootKey, 'WMTC-BUILDING-4', 'assigned device joins the B4 Distribution branch');
assert.ok(document.querySelector('#graphSvg .graph-link.vlan-assigned'), 'VLAN-rule link is visually distinguished from workbook evidence');
const b4HeaderAfterDiscovery = [...document.querySelectorAll('#graphSvg .access-group')].find(el => el.textContent.startsWith('WMTC Building-4'));
assert.match(b4HeaderAfterDiscovery?.textContent || '', /27 devices/, 'assigned Access device joins the existing 26-device B4 group');
click(assignedNode);
assert.match(text('#drawer'), /Auto VLAN 135/, 'assigned device shows its derived VLAN');
assert.match(text('#drawer'), /third octet/, 'drawer explains the assignment evidence');
click(document.querySelector('[data-close-drawer]'));
const liveDiscoveredNode = [...document.querySelectorAll('#graphSvg .node')].find(el => el.dataset.nodeId === 'NEW-LIVE-SW');
assert.ok(liveDiscoveredNode, 'auto-discovered device appears in architecture');
assert.ok(liveDiscoveredNode.classList.contains('role-discovered'), 'Discovered layer badge/style');
assert.ok(liveDiscoveredNode.classList.contains('live-down'), 'live down status on discovered node');
assert.ok(count('#graphSvg .live-status') >= 2, 'live status dots rendered');
assert.ok(count('#graphSvg .node-alert') >= 1, 'active alert badge rendered on topology');
assert.ok(count('#graphSvg .link-metric') >= 1, 'utilization label rendered on topology link');
click(liveDiscoveredNode);
assert.ok(count('#graphSvg .node.neighbor') >= 1, 'discovered device focuses its existing neighbour');
assert.match(text('#drawer'), /Live monitoring|LibreNMS/, 'device drawer contains live details');
click(document.querySelector('[data-close-drawer]'));
click(document.querySelector('[data-arch-mode="unified"]'));
click(document.querySelector('[data-unified-layer="Other"]'));
const unifiedLiveNode = document.querySelector('[data-node-id="u:NEW-LIVE-SW"]');
assert.ok(unifiedLiveNode, 'LibreNMS discovery renders in canonical unified architecture');
assert.ok(unifiedLiveNode.classList.contains('live-down'), 'canonical node uses real live status');
assert.ok(count('#graphSvg .node-alert') >= 1, 'alias-aware canonical node shows live alerts');
assert.ok(count('#graphSvg .link-metric') >= 1, 'alias-aware canonical link shows real utilization');
click(unifiedLiveNode);
assert.match(text('#drawer'), /CANONICAL IP DEVICE/);
assert.match(text('#drawer'), /Live monitoring|LibreNMS/);

assert.deepEqual(errors, [], 'no browser runtime errors');
console.log('Smoke test passed:', {
  wmtcNodes: data.sites.WMTC.nodes.length,
  whilNodes: data.sites.WHIL.nodes.length,
  dcRawSourceRows: 109, dcVisibleEntries: 103, dcVisibleIpDevices: 64,
  dmzMzEntries: 155,
  portConnectivityRows: 431, ipBlocks: 90, vlans: 98, devicePeers: 64, ispPeers: 34, loopbacks: 12,
  workbookCoreRows: 188, workbookCoreCanonicalDevices: expectedCoreNodeIds.size, workbookCoreCanonicalLinks: expectedCoreLinks.length,
  views: ['architecture', 'live', 'datacenter', 'connectivity', 'ipam', 'dmz', 'records'],
  interactions: ['site switch', 'search', 'filters', 'node drawer', 'link drawer', 'CSV export', 'workbook Core links graph', 'Main register separation', 'port/IPAM provenance drawers', 'partial evidence', 'blank VLAN preservation', 'credential exclusion', 'neighbourhood focus', 'add/edit/update/delete', 'workspace persistence', 'live setup', 'live status/alerts/utilization', 'auto-discovery merge'],
});
window.close();
