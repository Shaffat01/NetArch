import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const data = JSON.parse(await readFile(new URL('../public/data.json', import.meta.url), 'utf8'));
const source = await readFile(new URL('../public/crud.js', import.meta.url), 'utf8');
const context = { console }; context.window = context; context.globalThis = context;
vm.createContext(context); vm.runInContext(source, context);
const { WorkspaceCrud } = context;

for (const [collection, schema] of Object.entries(WorkspaceCrud.schemas)) {
  const edited = JSON.parse(JSON.stringify(data));
  const before = WorkspaceCrud.get(edited, collection, 'WMTC').length;
  const id = WorkspaceCrud.newId(collection);
  const record = { ...schema.default, id, custom: true };
  const required = schema.fields.find(field => field.required);
  if (required) record[required.key] = `Test ${schema.title}`;
  WorkspaceCrud.upsert(edited, collection, record, 'WMTC');
  assert.equal(WorkspaceCrud.get(edited, collection, 'WMTC').length, before + 1, `${collection}: add`);
  if (schema.shared) assert.equal(WorkspaceCrud.get(edited, collection, 'WHIL').length, before + 1, `${collection}: shared add`);
  const update = { id, [schema.fields[0].key]: `Edited ${schema.title}` };
  WorkspaceCrud.upsert(edited, collection, update, 'WMTC');
  assert.equal(WorkspaceCrud.getRecord(edited, collection, id, 'WMTC')[schema.fields[0].key], `Edited ${schema.title}`, `${collection}: update`);
  if (schema.shared) assert.equal(WorkspaceCrud.getRecord(edited, collection, id, 'WHIL')[schema.fields[0].key], `Edited ${schema.title}`, `${collection}: shared update`);
  WorkspaceCrud.recomputeStats(edited);
  WorkspaceCrud.remove(edited, collection, id, 'WMTC');
  assert.equal(WorkspaceCrud.get(edited, collection, 'WMTC').length, before, `${collection}: delete`);
  if (schema.shared) assert.equal(WorkspaceCrud.get(edited, collection, 'WHIL').length, before, `${collection}: shared delete`);
  WorkspaceCrud.recomputeStats(edited);
}

const labels = JSON.parse(JSON.stringify(data));
WorkspaceCrud.upsert(labels, 'labels', { id: 'local:label:test', text: 'New local cable', scope: 'Local', sourceSheet: 'Local workspace' }, 'WMTC');
assert.equal(WorkspaceCrud.getRecord(labels, 'labels', 'local:label:test').values[0].text, 'New local cable');
WorkspaceCrud.upsert(labels, 'labels', { id: 'local:label:test', text: 'Edited local cable' }, 'WMTC');
assert.equal(WorkspaceCrud.getRecord(labels, 'labels', 'local:label:test').values[0].text, 'Edited local cable');

const links = JSON.parse(JSON.stringify(data));
WorkspaceCrud.upsert(links, 'links', { id: 'local:port:test', fromDevice: 'A', toDevice: 'B', fromPort: '1', toPort: null, sourceSheet: 'Local workspace' }, 'WMTC');
WorkspaceCrud.recomputeStats(links);
assert.equal(WorkspaceCrud.getRecord(links, 'links', 'local:port:test').partial, true);
assert.equal(links.connectivity.stats.partialLinks, data.connectivity.stats.partialLinks + 1);
WorkspaceCrud.upsert(links, 'links', { id: 'local:port:test', toPort: '2' }, 'WMTC');
WorkspaceCrud.recomputeStats(links);
assert.equal(WorkspaceCrud.getRecord(links, 'links', 'local:port:test').partial, false);
assert.equal(links.connectivity.stats.partialLinks, data.connectivity.stats.partialLinks);

console.log(`Workspace CRUD tests passed for ${Object.keys(WorkspaceCrud.schemas).length} collections, including shared DataCenter/DMZ edits and derived stats.`);
