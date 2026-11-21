// Smoke: load the SPA in jsdom and drive the overview + a device detail page.
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import Fastify from 'fastify';
import { buildApp } from '../src/api/server.ts';

const app = await buildApp();
await app.listen({ port: 0, host: '127.0.0.1' });
const { port } = app.server.address();
console.log('API on port', port);

const html = readFileSync(new URL('../src/web/public/index.html', import.meta.url), 'utf8');
const appJs = readFileSync(new URL('../src/web/public/app.js', import.meta.url), 'utf8');

const dom = new JSDOM(html, {
  url: `http://127.0.0.1:${port}/`,
  runScripts: 'outside-only',
  beforeParse(win) {
    win.scrollTo = () => {};
    win.Element.prototype.scrollIntoView = win.Element.prototype.scrollIntoView || (() => {});
    // fetch shim: route to the API and only return relative paths
    win.fetch = async (url, opts) => {
      const abs = new URL(url, `http://127.0.0.1:${port}`);
      const res = await fetch(abs, opts);
      const text = await res.text();
      return {
        ok: res.ok,
        status: res.status,
        json: async () => JSON.parse(text),
        text: async () => text,
      };
    };
  },
});
const { window } = dom;
window.addEventListener('error', (e) => console.log('[jsdom error]', e.error || e.message));
window.addEventListener('unhandledrejection', (e) => console.log('[jsdom rejection]', e.reason?.message || e.reason));
// execute app.js in the jsdom context
window.eval(appJs);

async function waitFor(cond, label, ms = 10000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    try { if (await cond()) return; } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('timeout waiting for ' + label);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await waitFor(async () => window.document.querySelector('.stat-card') !== null, 'stat cards', 8000).catch((e) => { console.log('content HTML:', window.document.getElementById('content').innerHTML.slice(0, 500)); console.log('topbar stats:', window.document.getElementById('topbar-stats').innerHTML.slice(0, 300)); });
console.log('overview title:', window.document.getElementById('topbar-title').textContent);
console.log('overview stats spans:', window.document.getElementById('topbar-stats').children.length);
console.log('stat cards:', window.document.querySelectorAll('.stat-card').length);
console.log('device rows in sidebar:', window.document.querySelectorAll('#device-list .device-row').length);

// navigate to a device — pick the first device from sidebar
const firstRow = window.document.querySelector('#device-list .device-row');
const firstId = firstRow?.dataset?.id;
if (firstId) {
  window.location.hash = `#/device/${encodeURIComponent(firstId)}`;
  await waitFor(async () => window.document.querySelector('.device-hero') !== null, 'device hero');
  console.log('device hero present:', !!window.document.querySelector('.device-hero'));
  console.log('device hero text:', window.document.querySelector('.device-hero .name')?.textContent ?? window.document.querySelector('.device-hero')?.textContent?.slice(0, 200));
}

// graph view
window.location.hash = '#/graph';
await waitFor(async () => window.document.querySelector('.graph-wrap svg') !== null, 'graph svg', 20000).catch(() => {
  console.log('GRAPH content:', window.document.getElementById('content').innerHTML.slice(0, 1200));
});
const nodes = window.document.querySelectorAll('.graph-node').length;
const edges = window.document.querySelectorAll('.graph-edge').length;
console.log('graph nodes:', nodes, 'edges:', edges);

// sources view
window.location.hash = '#/sources';
await waitFor(async () => window.document.body.innerHTML.includes('Sheet inventory'), 'sources sections', 15000);
console.log('sources sections:', window.document.querySelectorAll('.section').length);
console.log('warnings list present:', window.document.body.innerHTML.includes('Warnings'));
console.log('warnings count rendered:', window.document.querySelectorAll('.section ul.small li').length);

// ips list view
window.location.hash = '#/ips';
await waitFor(async () => window.document.querySelector('#topbar-title')?.textContent?.trim() === 'IP Index', 'ips rows', 15000);
console.log('ips table rows:', window.document.querySelectorAll('.table tbody tr').length);

// search flow: devices view with query
window.location.hash = '#/devices?q=NDC-CORE';
await waitFor(async () => window.document.querySelector('#topbar-title')?.textContent?.trim() === 'Devices', 'search rows', 15000);
console.log('search result rows:', window.document.querySelectorAll('.table tbody tr').length);

console.log('SMOKE_OK');
await app.close();
process.exit(0);
