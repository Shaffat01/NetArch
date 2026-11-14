import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { meta, isps, devices, links, ispNodes, priSecFlows, explanations } from "./data/topology.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 5000;

app.use(express.json());

// ---------- helpers ----------
const deviceById = (id) => devices.find((d) => d.id === id);
const linksForDevice = (id) => links.filter((l) => l.from === id || l.to === id);
const peerOf = (link, id) => (link.from === id ? link.to : link.from);

// ---------- API ----------
app.get("/api/health", (_req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

app.get("/api/topology", (_req, res) => {
  res.json({ meta, isps, devices, links, ispNodes, priSecFlows, explanations });
});

app.get("/api/devices", (req, res) => {
  const { site, role } = req.query;
  let out = devices;
  if (site) out = out.filter((d) => d.site === site);
  if (role) out = out.filter((d) => d.role.toLowerCase().includes(role.toLowerCase()));
  res.json(out);
});

app.get("/api/devices/:id", (req, res) => {
  const d = deviceById(req.params.id);
  if (!d) return res.status(404).json({ error: "Device not found" });
  const connectedLinks = linksForDevice(d.id).map((l) => ({
    ...l,
    peer: peerOf(l, d.id),
    peerDevice: deviceById(peerOf(l, d.id)) || ispNodes.find((n) => n.id === peerOf(l, d.id)) || null,
  }));
  res.json({ ...d, links: connectedLinks });
});

app.get("/api/links", (req, res) => {
  const { path: p, isp, site } = req.query;
  let out = links;
  if (p) out = out.filter((l) => l.path === p);
  if (isp) out = out.filter((l) => l.isp === isp);
  if (site) {
    const ids = new Set(devices.filter((d) => d.site === site).map((d) => d.id));
    out = out.filter((l) => ids.has(l.from) || ids.has(l.to));
  }
  res.json(out);
});

app.get("/api/vlans", (req, res) => {
  const map = new Map();
  for (const d of devices) {
    for (const v of d.vlans || []) {
      const key = `${d.site}-${v.id}`;
      if (!map.has(key)) map.set(key, { id: v.id, name: v.name, site: d.site, isp: v.isp, path: v.path, devices: [] });
      map.get(key).devices.push(d.hostname);
    }
  }
  res.json([...map.values()].sort((a, b) => a.site.localeCompare(b.site) || a.id - b.id));
});

app.get("/api/routes", (req, res) => {
  const out = [];
  for (const d of devices) for (const r of d.routes || []) out.push({ device: d.hostname, site: d.site, ...r });
  res.json(out);
});

app.get("/api/flows", (req, res) => {
  const { isp, site } = req.query;
  let out = priSecFlows;
  if (isp) out = out.filter((f) => f.isp === isp);
  if (site) out = out.filter((f) => f.site === site);
  res.json(out);
});

app.get("/api/search", (req, res) => {
  const q = (req.query.q || "").toLowerCase().trim();
  if (!q) return res.json({ devices: [], vlans: [], links: [] });
  res.json({
    devices: devices.filter(
      (d) =>
        d.hostname.toLowerCase().includes(q) ||
        d.role.toLowerCase().includes(q) ||
        (d.interfaces || []).some((i) => (i.name + " " + (i.desc || "")).toLowerCase().includes(q))
    ),
    vlans: devices.flatMap((d) =>
      (d.vlans || [])
        .filter((v) => String(v.id) === q || (v.name || "").toLowerCase().includes(q))
        .map((v) => ({ ...v, device: d.hostname, site: d.site }))
    ),
    links: links.filter(
      (l) =>
        (l.label || "").toLowerCase().includes(q) ||
        (l.fromInt || "").toLowerCase().includes(q) ||
        (l.toInt || "").toLowerCase().includes(q) ||
        (Array.isArray(l.vlans) && l.vlans.map(String).includes(q))
    ),
  });
});

// ---------- serve built frontend (production) ----------
const clientDist = path.join(__dirname, "../client/dist");
app.use(express.static(clientDist));
app.get("*", (_req, res) => {
  res.sendFile(path.join(clientDist, "index.html"), (err) => {
    if (err) res.status(200).json({ msg: "API running. Build frontend: cd client && npm run build" });
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`[server] Walton Network GUI API on http://0.0.0.0:${PORT}`);
  console.log(`[server] ${devices.length} devices, ${links.length} links, ${isps.length} ISPs`);
});
