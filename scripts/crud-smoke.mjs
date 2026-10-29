import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';

const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
const dataJs = await readFile(new URL('../public/data.js', import.meta.url), 'utf8');
const unifiedJs = await readFile(new URL('../public/unified.js', import.meta.url), 'utf8');
const crudJs = await readFile(new URL('../public/crud.js', import.meta.url), 'utf8');
const appJs = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
const original = JSON.parse(await readFile(new URL('../public/data.json', import.meta.url), 'utf8'));
const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'http://localhost/' });
const { window } = dom, { document } = window;
const errors = [];
window.addEventListener('error', event => errors.push(event.error || event.message));
window.addEventListener('unhandledrejection', event => errors.push(event.reason));
window.CSS ||= {}; window.CSS.escape ||= value => String(value).replace(/[^a-zA-Z0-9_-]/g, character => `\\${character}`);
window.HTMLElement.prototype.scrollIntoView = () => {};
window.HTMLAnchorElement.prototype.click = () => {};
window.SVGElement.prototype.setPointerCapture = () => {};
window.URL.createObjectURL = () => 'blob:crud-smoke'; window.URL.revokeObjectURL = () => {};
window.confirm = () => true;
let savedWorkspace = null;
let mockLive = { configured: false, config: { librenms: false, zabbix: false, autoDiscover: true }, status: 'unconfigured', devices: [], links: [], alerts: [], errors: [], added: [], lastSync: null };
let mockSyncData = null;
window.fetch = async (url, options = {}) => {
  if (url === '/api/live') return { ok: true, status: 200, json: async () => mockLive };
  if (url === '/api/live/sync') return { ok: true, status: 200, json: async () => ({ live: mockLive, data: mockSyncData }) };
  if (url !== '/api/state') throw new Error(`Unexpected fetch: ${url}`);
  const method = options.method || 'GET';
  if (method === 'GET') return savedWorkspace ? { ok: true, status: 200, json: async () => savedWorkspace } : { ok: true, status: 204, json: async () => ({}) };
  if (method === 'PUT') { savedWorkspace = JSON.parse(options.body); return { ok: true, status: 200, json: async () => ({ ok: true }) }; }
  if (method === 'DELETE') { savedWorkspace = null; return { ok: true, status: 200, json: async () => ({ ok: true }) }; }
  throw new Error(`Unexpected method: ${method}`);
};
window.eval(dataJs); window.eval(unifiedJs); window.eval(crudJs); window.eval(appJs);
const tick = (ms = 60) => new Promise(resolve => setTimeout(resolve, ms));
const click = element => { assert.ok(element, 'click target exists'); element.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true })); };
const input = (element, value) => { assert.ok(element, 'input target exists'); element.value = value; element.dispatchEvent(new window.Event('input', { bubbles: true })); };
const change = (element, value) => { assert.ok(element, 'change target exists'); element.value = value; element.dispatchEvent(new window.Event('change', { bubbles: true })); };
const submit = selector => document.querySelector(selector).dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
const text = selector => document.querySelector(selector)?.textContent || '';
const count = selector => document.querySelectorAll(selector).length;
const actionButton = (kind, collection, id) => [...document.querySelectorAll(`[data-generic-${kind}="${collection}"]`)].find(element => element.dataset.genericId === id);
const current = () => savedWorkspace || original;
await tick(100);

// Canonical unified device add → edit → connection add/edit/delete → device delete.
click(document.querySelector('[data-action="add-unified-device"]'));
assert.equal(document.getElementById('editorModal').hidden, false, 'unified device editor opens');
input(document.querySelector('[data-unified-field="label"]'), 'LOCAL-UNIFIED-TEST-SW');
input(document.querySelector('[data-unified-field="primaryIp"]'), '10.250.0.1');
input(document.querySelector('[data-unified-field="aliases"]'), 'LOCAL-TEST-ALIAS\n10.250.0.1-alias');
change(document.querySelector('[data-unified-field="layer"]'), 'Other');
input(document.querySelector('[data-unified-field="site"]'), 'WMTC');
input(document.querySelector('[data-unified-field="model"]'), 'Test switch');
submit('#unifiedEditorForm'); await tick(120);
let customDevice = savedWorkspace.unifiedWorkspace.devices.find(record => record.label === 'LOCAL-UNIFIED-TEST-SW');
assert.ok(customDevice, 'custom unified device persisted');
assert.ok(document.querySelector(`[data-node-id="${customDevice.id}"]`), 'custom unified device renders immediately');
assert.ok(JSON.parse(window.localStorage.getItem('netatlas-user-state-v1')).unifiedWorkspace.devices.some(record => record.id === customDevice.id), 'browser fallback contains unified add');

click(document.querySelector(`[data-node-id="${customDevice.id}"]`));
click(document.querySelector('#drawer [data-unified-edit-device]'));
input(document.querySelector('[data-unified-field="label"]'), 'LOCAL-UNIFIED-TEST-SW-EDITED');
input(document.querySelector('[data-unified-field="primaryIp"]'), '10.250.0.2');
submit('#unifiedEditorForm'); await tick(120);
customDevice = savedWorkspace.unifiedWorkspace.devices.find(record => record.id === customDevice.id);
assert.equal(customDevice.label, 'LOCAL-UNIFIED-TEST-SW-EDITED', 'unified device update persisted');
assert.equal(customDevice.primaryIp, '10.250.0.2', 'unified device IP update persisted');

click(document.querySelector('[data-action="add-unified-connection"]'));
const sourceSelect = document.querySelector('[data-unified-field="source"]'), targetSelect = document.querySelector('[data-unified-field="target"]');
change(sourceSelect, customDevice.id); change(targetSelect, 'u:DC-CORE-RT-01');
input(document.querySelector('[data-unified-field="fromPort"]'), 'Gi1/0/1'); input(document.querySelector('[data-unified-field="toPort"]'), 'Gi1/0/48');
input(document.querySelector('[data-unified-field="kind"]'), 'Local test link');
submit('#unifiedEditorForm'); await tick(120);
let customLink = savedWorkspace.unifiedWorkspace.connections.find(record => record.source === customDevice.id && record.target === 'u:DC-CORE-RT-01');
assert.ok(customLink, 'custom unified connection persisted');
assert.ok(document.querySelector(`[data-link-id="${customLink.id}"]`), 'custom unified connection renders immediately');

click(document.querySelector(`[data-link-id="${customLink.id}"]`));
click(document.querySelector('#drawer [data-unified-edit-connection]'));
input(document.querySelector('[data-unified-field="fromPort"]'), 'Gi1/0/2');
submit('#unifiedEditorForm'); await tick(120);
customLink = savedWorkspace.unifiedWorkspace.connections.find(record => record.id === customLink.id);
assert.equal(customLink.fromPort, 'Gi1/0/2', 'unified connection update persisted');
click(document.querySelector(`[data-link-id="${customLink.id}"]`));
click(document.querySelector('#drawer [data-unified-delete-connection]')); await tick(100);
assert.equal(savedWorkspace.unifiedWorkspace.connections.some(record => record.id === customLink.id), false, 'unified connection delete persisted');
click(document.querySelector(`[data-node-id="${customDevice.id}"]`));
click(document.querySelector('#drawer [data-unified-delete-device]')); await tick(100);
assert.equal(savedWorkspace.unifiedWorkspace.devices.some(record => record.id === customDevice.id), false, 'unified device delete persisted');

// Canonical edit and tombstone are separate from source-row deletion.
click(document.querySelector('[data-unified-layer="Core"]'));
const canonical = document.querySelector('[data-node-id="u:DC-CORE-RT-01"]');
assert.ok(canonical, 'canonical device available for edit test');
click(canonical); click(document.querySelector('#drawer [data-unified-edit-device]'));
input(document.querySelector('[data-unified-field="model"]'), 'Local canonical model');
submit('#unifiedEditorForm'); await tick(100);
assert.equal(savedWorkspace.unifiedWorkspace.deviceEdits['u:DC-CORE-RT-01'].model, 'Local canonical model', 'canonical metadata edit persisted');
click(document.querySelector('[data-node-id="u:DC-CORE-RT-01"]'));
click(document.querySelector('#drawer [data-unified-delete-device]')); await tick(100);
assert.ok(savedWorkspace.unifiedWorkspace.deletedDevices.includes('u:DC-CORE-RT-01'), 'canonical delete stored as tombstone');
assert.equal(document.querySelector('[data-node-id="u:DC-CORE-RT-01"]'), null, 'canonical deleted device disappears');

const collections = [
  ['dataCenter', 'node'], ['dmzMz', 'node'], ['links', 'fromDevice'], ['accessDevices', 'hostname'], ['labels', 'text'],
  ['blocks', 'cidr'], ['vlans', 'owner'], ['devicePeers', 'fromDevice'], ['ispPeers', 'isp'], ['loopbacks', 'device'],
];
function showCollection(collection) {
  if (collection === 'dataCenter') click(document.querySelector('[data-view="datacenter"]'));
  else if (collection === 'dmzMz') click(document.querySelector('[data-view="dmz"]'));
  else if (['links', 'accessDevices', 'labels'].includes(collection)) {
    click(document.querySelector('[data-view="connectivity"]')); click(document.querySelector(`[data-connectivity-tab="${collection}"]`));
  } else {
    click(document.querySelector('[data-view="ipam"]')); click(document.querySelector(`[data-ipam-tab="${collection}"]`));
  }
}
function clearSearch(collection) {
  if (collection === 'dataCenter') input(document.querySelector('[data-dc-search]'), '');
  else if (collection === 'dmzMz') input(document.querySelector('[data-dmz-search]'), '');
  else if (['links', 'accessDevices', 'labels'].includes(collection)) input(document.getElementById('connectivitySearch'), '');
  else input(document.getElementById('ipamSearch'), '');
}
function searchFor(collection, value) {
  if (collection === 'dataCenter') input(document.querySelector('[data-dc-search]'), value);
  else if (collection === 'dmzMz') input(document.querySelector('[data-dmz-search]'), value);
  else if (['links', 'accessDevices', 'labels'].includes(collection)) input(document.getElementById('connectivitySearch'), value);
  else input(document.getElementById('ipamSearch'), value);
}

// Every requested source collection gets a real browser add, update and delete.
for (const [collection, markerField] of collections) {
  showCollection(collection); clearSearch(collection);
  const before = window.WorkspaceCrud.get(current(), collection, 'WMTC').length;
  click(document.querySelector(`[data-generic-add="${collection}"]`));
  assert.equal(document.getElementById('editorModal').hidden, false, `${collection}: add editor`);
  const addedMarker = `CRUD-${collection}-ADD`;
  const markerControl = document.querySelector(`[data-generic-field="${markerField}"]`);
  if (markerControl.tagName === 'SELECT') change(markerControl, addedMarker); else input(markerControl, addedMarker);
  if (collection === 'dataCenter') input(document.querySelector('[data-generic-field="ip"]'), '10.250.1.1');
  if (collection === 'links') input(document.querySelector('[data-generic-field="toDevice"]'), 'CRUD-LINK-TARGET');
  if (collection === 'vlans') input(document.querySelector('[data-generic-field="vlan"]'), '999');
  submit('#genericEditorForm'); await tick(90);
  const added = window.WorkspaceCrud.get(savedWorkspace, collection, 'WMTC').find(record => record[markerField] === addedMarker);
  assert.ok(added, `${collection}: add persisted`);
  assert.equal(window.WorkspaceCrud.get(savedWorkspace, collection, 'WMTC').length, before + 1, `${collection}: add count`);
  if (['dataCenter', 'dmzMz'].includes(collection)) assert.equal(window.WorkspaceCrud.get(savedWorkspace, collection, 'WHIL').length, before + 1, `${collection}: shared add`);

  searchFor(collection, addedMarker);
  const editButton = actionButton('edit', collection, added.id);
  assert.ok(editButton, `${collection}: row edit action`); click(editButton);
  const editedMarker = `CRUD-${collection}-EDITED`;
  const editControl = document.querySelector(`[data-generic-field="${markerField}"]`);
  if (editControl.tagName === 'SELECT') change(editControl, editedMarker); else input(editControl, editedMarker);
  submit('#genericEditorForm'); await tick(90);
  assert.equal(window.WorkspaceCrud.getRecord(savedWorkspace, collection, added.id, 'WMTC')[markerField], editedMarker, `${collection}: update persisted`);
  if (['dataCenter', 'dmzMz'].includes(collection)) assert.equal(window.WorkspaceCrud.getRecord(savedWorkspace, collection, added.id, 'WHIL')[markerField], editedMarker, `${collection}: shared update`);

  searchFor(collection, editedMarker);
  const deleteButton = actionButton('delete', collection, added.id);
  assert.ok(deleteButton, `${collection}: row delete action`); click(deleteButton); await tick(90);
  assert.equal(window.WorkspaceCrud.getRecord(savedWorkspace, collection, added.id, 'WMTC'), null, `${collection}: delete persisted`);
  assert.equal(window.WorkspaceCrud.get(savedWorkspace, collection, 'WMTC').length, before, `${collection}: delete count`);
  if (['dataCenter', 'dmzMz'].includes(collection)) assert.equal(window.WorkspaceCrud.get(savedWorkspace, collection, 'WHIL').length, before, `${collection}: shared delete`);
}

// A raw source deletion is local and shared, while the immutable original snapshot remains intact.
showCollection('dataCenter'); clearSearch('dataCenter');
click(document.querySelector('[data-action="raw-dc"]'));
assert.match(text('#drawer'), /All DataCenter raw rows/);
assert.ok(actionButton('edit', 'dataCenter', 'SRC_DataCenter-DC-9'), 'hidden source rows remain deliberately editable in raw manager');
click(document.querySelector('[data-close-drawer]'));
const rawId = 'SRC_DataCenter-DC-15', rawBefore = window.WorkspaceCrud.get(savedWorkspace, 'dataCenter', 'WMTC').length;
searchFor('dataCenter', 'DC-FIREWALL-01');
click(actionButton('delete', 'dataCenter', rawId)); await tick(90);
assert.equal(window.WorkspaceCrud.get(savedWorkspace, 'dataCenter', 'WMTC').length, rawBefore - 1, 'raw DataCenter delete persisted');
assert.equal(window.WorkspaceCrud.get(savedWorkspace, 'dataCenter', 'WHIL').some(record => record.id === rawId), false, 'raw DataCenter delete shared');
assert.equal(original.sites.WMTC.dataCenter.length, 109, 'original source fixture remains untouched');

// Stale live responses cannot replace local unified edits or source collection edits.
mockLive = { ...mockLive, configured: true, config: { librenms: true, zabbix: false, autoDiscover: true }, status: 'ok', devices: [], links: [], alerts: [], errors: [] };
mockSyncData = structuredClone(original);
click(document.querySelector('[data-view="live"]')); click(document.querySelector('[data-action="sync-live"]')); await tick(150);
assert.ok(savedWorkspace.unifiedWorkspace.deletedDevices.includes('u:DC-CORE-RT-01'), 'live sync preserves unified tombstone');
assert.equal(window.WorkspaceCrud.get(savedWorkspace, 'dataCenter', 'WMTC').some(record => record.id === rawId), false, 'live sync preserves local raw delete');

// Keep one ordinary collection edit and one unified add, then boot a fresh browser DOM
// from the saved payload to verify real reload persistence rather than only PUT calls.
showCollection('vlans'); clearSearch('vlans'); click(document.querySelector('[data-generic-add="vlans"]'));
input(document.querySelector('[data-generic-field="owner"]'), 'RELOAD-VLAN-OWNER');
input(document.querySelector('[data-generic-field="vlan"]'), '998');
submit('#genericEditorForm'); await tick(90);
assert.ok(window.WorkspaceCrud.get(savedWorkspace, 'vlans', 'WMTC').some(record => record.owner === 'RELOAD-VLAN-OWNER'));
click(document.querySelector('[data-view="architecture"]')); click(document.querySelector('[data-action="add-unified-device"]'));
input(document.querySelector('[data-unified-field="label"]'), 'RELOAD-UNIFIED-SW'); input(document.querySelector('[data-unified-field="primaryIp"]'), '10.250.9.1'); change(document.querySelector('[data-unified-field="layer"]'), 'Other');
submit('#unifiedEditorForm'); await tick(100);
const reloadSnapshot = structuredClone(savedWorkspace);
const reloadDom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'http://localhost/' });
const rw = reloadDom.window, rd = rw.document, reloadErrors = [];
rw.addEventListener('error', event => reloadErrors.push(event.error || event.message)); rw.addEventListener('unhandledrejection', event => reloadErrors.push(event.reason));
rw.CSS ||= {}; rw.CSS.escape ||= value => String(value).replace(/[^a-zA-Z0-9_-]/g, character => `\\${character}`);
rw.HTMLElement.prototype.scrollIntoView = () => {}; rw.HTMLAnchorElement.prototype.click = () => {}; rw.SVGElement.prototype.setPointerCapture = () => {};
rw.URL.createObjectURL = () => 'blob:reload'; rw.URL.revokeObjectURL = () => {}; rw.confirm = () => true;
rw.fetch = async (url, options = {}) => {
  if (url === '/api/live') return { ok: true, status: 200, json: async () => ({ configured: false, config: { librenms: false, zabbix: false }, devices: [], links: [], alerts: [], errors: [] }) };
  if (url === '/api/state' && (options.method || 'GET') === 'GET') return { ok: true, status: 200, json: async () => reloadSnapshot };
  if (url === '/api/state') return { ok: true, status: 200, json: async () => ({ ok: true }) };
  throw new Error(`Unexpected reload fetch: ${url}`);
};
rw.eval(dataJs); rw.eval(unifiedJs); rw.eval(crudJs); rw.eval(appJs); await tick(120);
assert.equal(rd.querySelector('[data-node-id="u:DC-CORE-RT-01"]'), null, 'reload preserves canonical tombstone');
rd.querySelector('[data-view="datacenter"]').dispatchEvent(new rw.MouseEvent('click', { bubbles: true }));
const reloadDcSearch = rd.querySelector('[data-dc-search]'); reloadDcSearch.value = 'DC-FIREWALL-01'; reloadDcSearch.dispatchEvent(new rw.Event('input', { bubbles: true }));
assert.equal(rd.querySelector('[data-entry-id="SRC_DataCenter-DC-15"]'), null, 'reload preserves raw source deletion');
rd.querySelector('[data-view="ipam"]').dispatchEvent(new rw.MouseEvent('click', { bubbles: true })); rd.querySelector('[data-ipam-tab="vlans"]').dispatchEvent(new rw.MouseEvent('click', { bubbles: true }));
const reloadVlanSearch = rd.getElementById('ipamSearch'); reloadVlanSearch.value = 'RELOAD-VLAN-OWNER'; reloadVlanSearch.dispatchEvent(new rw.Event('input', { bubbles: true }));
assert.match(rd.getElementById('ipamBody').textContent, /RELOAD-VLAN-OWNER/, 'reload restores ordinary collection addition');
rd.querySelector('[data-view="architecture"]').dispatchEvent(new rw.MouseEvent('click', { bubbles: true })); rd.querySelector('[data-unified-layer="Other"]').dispatchEvent(new rw.MouseEvent('click', { bubbles: true }));
assert.ok([...rd.querySelectorAll('#graphSvg .node')].some(node => node.dataset.nodeId.startsWith('custom-unified-device:') && node.textContent.includes('RELOAD-UNIFIED-SW')), 'reload restores unified custom device');
assert.deepEqual(reloadErrors, [], 'no runtime errors in reloaded workspace'); reloadDom.window.close();

// Reset restores every source collection and clears local unified overrides.
click(document.querySelector('[data-view="records"]')); click(document.querySelector('[data-action="reset-workspace"]')); await tick(120);
assert.equal(savedWorkspace, null, 'reset clears server-style saved workspace');
assert.equal(count('#recordsBody tr[data-record-id]') > 0, true, 'reset renders restored records');

assert.deepEqual(errors, [], 'no browser runtime errors during full CRUD');
console.log('Full workspace CRUD smoke passed: unified device/connection add-edit-delete, canonical overrides, all 10 source collections, raw-row management, shared-site persistence, stale-live protection, real reload persistence and reset.');
window.close();
