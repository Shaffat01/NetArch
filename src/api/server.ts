/**
 * Fastify API + static SPA.
 * All data comes from the local node:sqlite snapshot built by the ingest CLI.
 */
import Fastify, { type FastifyInstance } from 'fastify';
import staticPlugin from '@fastify/static';
import path from 'node:path';
import fs from 'node:fs';
import { z } from 'zod';
import { loadConfig, type AppConfig } from '../config/index.js';
import { openDb, loadDevices, loadIps, loadConnections, getDevice, getIp, sheetStats, summary, searchDevices, searchIps, validateDb, getMeta } from '../db/index.js';
import { buildGraph, directionalNeighborsFor } from '../graph/index.js';

export interface AppDeps {
  config: AppConfig;
}

export async function buildApp(deps?: Partial<AppDeps>): Promise<FastifyInstance> {
  const config = { ...loadConfig(), ...(deps?.config ?? {}) } as AppConfig;
  const app = Fastify({ logger: false });

  app.register(staticPlugin, {
    root: config.webPublic,
    prefix: '/',
    wildcard: false,
  });

  if (!fs.existsSync(config.dbPath)) {
    throw new Error(
      `No NetArch snapshot found at ${config.dbPath}.\n` +
      `Run "npm run ingest" first — it reads the read-only workbooks in data/sources/ ` +
      `and builds the local SQLite snapshot the API serves from.`
    );
  }
  const handle = openDb(config.dbPath);
  const db = handle.db;

  // graceful close
  const closeAll = async () => { try { handle.close(); } catch { /* ignore */ } };
  app.addHook('onClose', closeAll);

  // ----- health & status -----
  app.get('/api/health', async () => {
    const validation = validateDb(db);
    return { ok: validation.ok, db: config.dbPath, validation };
  });

  app.get('/api/summary', async () => {
    return summary(db);
  });

  app.get('/api/sources', async () => {
    const raw = getMeta(db, 'warnings');
    let warnings: string[] = [];
    if (raw) { try { warnings = JSON.parse(raw); } catch { warnings = []; } }
    return { sources: sheetStats(db), warnings };
  });

  // ----- search & listing -----
  const qSchema = z.object({ q: z.string().max(200).optional(), page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(200).default(50) });

  app.get('/api/devices', async (req) => {
    const q = qSchema.parse(req.query);
    const all = q.q ? searchDevices(db, q.q, 200) : loadDevices(db);
    const total = all.length;
    const start = (q.page - 1) * q.pageSize;
    const items = all.slice(start, start + q.pageSize);
    return { total, page: q.page, pageSize: q.pageSize, items };
  });

  app.get('/api/devices/:id', async (req, reply) => {
    const id = (req.params as { id: string }).id;
    const device = getDevice(db, id);
    if (!device) return reply.code(404).send({ error: 'not found' });
    const allIps = loadIps(db);
    const allDevices = loadDevices(db);
    const allConns = loadConnections(db);
    const conns = allConns.filter((c) => device.ips.includes(c.srcIp) || device.ips.includes(c.dstIp));
    const neighbors = directionalNeighborsFor(device, allConns, allDevices, allIps);
    const devicesById = new Map(allDevices.map((d) => [d.id, d]));
    const connections = conns.map((c) => {
      const srcDevice = device.ips.includes(c.srcIp) ? device : allDevices.find((d) => d.ips.includes(c.srcIp));
      const dstDevice = device.ips.includes(c.dstIp) ? device : allDevices.find((d) => d.ips.includes(c.dstIp));
      return {
        srcIp: c.srcIp, dstIp: c.dstIp, kind: c.kind, matchKind: c.matchKind,
        srcLabel: srcDevice?.canonicalName ?? c.srcIp,
        dstLabel: dstDevice?.canonicalName ?? c.dstIp,
        evidenceCount: c.evidence.length,
        evidence: c.evidence.slice(0, 20),
      };
    });
    const ips = device.ips.map((ip) => {
      const rec = getIp(db, ip);
      return rec ? {
        ip: rec.ip, family: rec.family, kind: rec.kind, canonicalName: rec.canonicalName,
        devices: rec.devices.map((d) => (devicesById.get(d)?.canonicalName ?? d)),
        records: rec.records,
        aliases: rec.aliases.map((a) => ({ name: a.cleanedName, raw: a.rawName, confidence: a.confidence, sheet: a.sourceSheet, file: a.sourceFile })),
      } : { ip, family: 4, kind: 'device', canonicalName: null, devices: [], records: 0, aliases: [] };
    });
    return {
      ...device,
      ips,
      connections,
      directions: neighbors,
      deviceTypeChain: device.chainPosition,
    };
  });

  app.get('/api/devices/:id/ips', async (req, reply) => {
    const id = (req.params as { id: string }).id;
    const device = getDevice(db, id);
    if (!device) return reply.code(404).send({ error: 'not found' });
    return device.ips.map((ip) => getIp(db, ip)).filter(Boolean);
  });

  app.get('/api/devices/:id/connections', async (req, reply) => {
    const id = (req.params as { id: string }).id;
    const device = getDevice(db, id);
    if (!device) return reply.code(404).send({ error: 'not found' });
    const allConns = loadConnections(db);
    return allConns.filter((c) => device.ips.includes(c.srcIp) || device.ips.includes(c.dstIp));
  });

  app.get('/api/ips', async (req) => {
    const q = qSchema.parse(req.query);
    const all = q.q ? searchIps(db, q.q, 200) : loadIps(db);
    const start = (q.page - 1) * q.pageSize;
    return { total: all.length, page: q.page, pageSize: q.pageSize, items: all.slice(start, start + q.pageSize) };
  });

  app.get('/api/ips/:ip', async (req, reply) => {
    const ip = decodeURIComponent((req.params as { ip: string }).ip);
    const rec = getIp(db, ip);
    if (!rec) return reply.code(404).send({ error: 'not found' });
    const devices = loadDevices(db);
    const connections = loadConnections(db).filter((c) => c.srcIp === ip || c.dstIp === ip);
    const devicesById = new Map(devices.map((d) => [d.id, d]));
    return {
      ...rec,
      devices: rec.devices.map((d) => {
        const dev = devicesById.get(d);
        return dev ? { id: dev.id, canonicalName: dev.canonicalName, deviceType: dev.deviceType, ips: dev.ips, location: dev.location } : { id: d, canonicalName: d, deviceType: 'UNKNOWN', ips: [], location: null };
      }),
      connections: connections.map((c) => {
        const src = devices.find((d) => d.ips.includes(c.srcIp));
        const dst = devices.find((d) => d.ips.includes(c.dstIp));
        return {
          srcIp: c.srcIp, dstIp: c.dstIp, kind: c.kind, matchKind: c.matchKind,
          srcLabel: src?.canonicalName ?? c.srcIp, dstLabel: dst?.canonicalName ?? c.dstIp,
          evidence: c.evidence,
        };
      }),
    };
  });

  app.get('/api/graph', async () => {
    const devices = loadDevices(db);
    const ips = loadIps(db);
    const connections = loadConnections(db);
    const graph = buildGraph(devices, ips, connections);
    return graph;
  });

  app.get('/api/search', async (req) => {
    const q = req.query as { q?: string };
    const needle = (q?.q ?? '').trim();
    if (!needle) return { devices: [], ips: [] };
    return {
      devices: searchDevices(db, needle, 20).map((d) => ({ id: d.id, canonicalName: d.canonicalName, deviceType: d.deviceType, ips: d.ips, confidence: d.confidence })),
      ips: searchIps(db, needle, 20).map((i) => ({ ip: i.ip, canonicalName: i.canonicalName, devices: i.devices })),
    };
  });

  return app;
}

export async function startServer(overrides?: Partial<AppConfig>): Promise<FastifyInstance> {
  const cfg = { ...loadConfig(), ...(overrides ?? {}) };
  const app = await buildApp({ config: cfg });
  await app.listen({ port: cfg.port, host: cfg.host });
  return app;
}
