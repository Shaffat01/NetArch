import http from 'node:http';
import { readFile, stat, mkdir, writeFile, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadLiveEnv, syncLive, emptyLive } from './live.mjs';

const project = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(project, 'public');
const dataDir = path.join(project, 'data');
const stateFile = path.join(dataDir, 'user-state.json');
const port = Number(process.env.PORT || 8000);
const types = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
};
let liveCache = emptyLive();
let liveSyncPromise = null;

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}
async function bodyJson(req) {
  let size = 0; const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 12 * 1024 * 1024) throw new Error('Payload too large');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
async function saveState(data) {
  await mkdir(dataDir, { recursive: true });
  const temp = stateFile + `.${process.pid}.tmp`;
  await writeFile(temp, JSON.stringify(data), 'utf8');
  await rename(temp, stateFile);
}
async function currentData() {
  try { return JSON.parse(await readFile(stateFile, 'utf8')); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return JSON.parse(await readFile(path.join(root, 'data.json'), 'utf8'));
  }
}
async function refreshLive() {
  if (liveSyncPromise) return liveSyncPromise;
  liveSyncPromise = (async () => {
    const data = await currentData();
    const result = await syncLive(data);
    if (result.dataChanged) await saveState(data);
    liveCache = result.live;
    return { live: liveCache, data: result.dataChanged ? data : null };
  })().catch(error => {
    liveCache = { ...liveCache, status: 'error', errors: [error.message], lastSync: new Date().toISOString() };
    return { live: liveCache, data: null };
  }).finally(() => { liveSyncPromise = null; });
  return liveSyncPromise;
}

async function handleState(req, res) {
  if (req.method === 'GET') {
    try {
      const body = await readFile(stateFile, 'utf8');
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(body);
    } catch (error) {
      if (error.code === 'ENOENT') { res.writeHead(204); res.end(); }
      else json(res, 500, { ok: false, error: 'Could not read saved workspace' });
    }
    return;
  }
  if (req.method === 'PUT') {
    try {
      const data = await bodyJson(req);
      if (!data?.sites?.WMTC?.rows || !data?.sites?.WHIL?.rows || !Array.isArray(data.sites.WMTC.rows) || !Array.isArray(data.sites.WHIL.rows)) {
        json(res, 400, { ok: false, error: 'Invalid NetAtlas dataset' }); return;
      }
      await saveState(data);
      json(res, 200, { ok: true, savedAt: data.meta?.updatedAt || new Date().toISOString() });
    } catch (error) { json(res, 400, { ok: false, error: error.message || 'Could not save workspace' }); }
    return;
  }
  if (req.method === 'DELETE') {
    try { await unlink(stateFile); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    json(res, 200, { ok: true }); return;
  }
  json(res, 405, { ok: false, error: 'Method not allowed' });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/api/state') { await handleState(req, res); return; }
    if (url.pathname === '/api/live' && req.method === 'GET') { json(res, 200, liveCache); return; }
    if (url.pathname === '/api/live/sync' && req.method === 'POST') { json(res, 200, await refreshLive()); return; }
    let pathname = decodeURIComponent(url.pathname);
    if (pathname === '/') pathname = '/index.html';
    const file = path.resolve(root, '.' + pathname);
    if (!file.startsWith(root + path.sep)) { res.writeHead(403); res.end('Forbidden'); return; }
    const info = await stat(file);
    if (!info.isFile()) throw new Error('Not a file');
    const body = await readFile(file);
    res.writeHead(200, {
      'Content-Type': types[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff',
    });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Not found');
  }
});

await loadLiveEnv(project);
liveCache = emptyLive();
server.listen(port, '0.0.0.0', () => console.log(`NetAtlas running on http://0.0.0.0:${port}`));
if (liveCache.configured) {
  refreshLive();
  const timer = setInterval(refreshLive, Math.max(15, liveCache.config.refreshSeconds) * 1000);
  timer.unref();
}
