# NetArch — IP-centric Network Infrastructure Inventory

Strict-TypeScript, offline, IP-first network inventory. Three authoritative source
workbooks are ingested into a local SQLite snapshot and served through a Fastify
API and a self-contained web SPA — no external services, no internet calls.

**The sources are read-only.** NetArch never modifies the input workbooks.

## Quick start

```bash
# 1. Place the three read-only workbooks in data/sources/
#    (see "Inputs" below)
npm install
npm run ingest     # parse → normalize → resolve → merge → persist (a few seconds)
npm start          # serve API + UI on http://0.0.0.0:3000
```

Open `http://localhost:3000`. Set `PORT`/`HOST`/`NETARCH_DB_PATH`/`NETARCH_SOURCES_DIR`
to override. The server refuses to start without a snapshot — run `npm run ingest` first.

## Inputs

`data/sources/` holds the three read-only, authoritative source workbooks:

| File | Contents |
| --- | --- |
| `HQ-ACCESS-SWITCH-INFO.xlsx` | HQ access/distribution/core register (5 tabs) |
| `All Building VLAN & Floor Information(NOC).xlsx` | Full tenant inventory — WHIL/WMTC buildings, DC/NDC, network blocks, CCTV/WiFi/Machine IT, serial numbers (22 tabs) |
| `ISP Real IPs.xlsx` | By-site ISP provider allocations — Corporate/DC-HQ/NDC-HQ × BracNet/AGNI/ADN, one `/28` per row (9 rows) |

Both are committed nowhere — they are real, sensitive network data and stay out of git.
The snapshot the app serves from is `data/netarch.db` (also generated, also ignored).

## How it works

```
workbooks (xlsx)
  → src/ingest  (exceljs: parse sheets → RawRecord[], sheet-by-sheet, per-config parsers)
  → src/normalize (IPs: 8-bit/6-bit, CIDRs, ranges ≤1024, ports, IPv6; names: clean + canonical key)
  → src/resolve (per-IP canonical-name scoring; register sheet > inventory sheet > IP-only)
  → src/merge (IP-first identity: one MasterDevice per canonical device; one MasterIp per IP;
               connections by attested IP or resolved name, flagged by matchKind)
  → src/db (node:sqlite snapshot: devices / ips / connections + ingest metadata + sheet stats)
  → src/api (Fastify: /api/*)  +  src/web (hash-routed SPA: overview, devices, IPs, graph, sources, device & IP detail)
```

- **IP is the primary identity signal** — devices merge by IP/canonical name, never the other way around.
- **Names are display labels.** Every device carries one canonical name plus all its
  aliases (each with source sheet/file, confidence, and the sheet-count evidence).
- **Unmatched neighbors are never invented.** Edges without IP evidence stay flagged
  `name`; edges without either are recorded as unmatched, not drawn.
- **The UI is exportable.** One click downloads the full inventory as CSV
  (one row per device — name, type, IPs, aliases, serial, model, location,
  confidence, chain position, sources) or the full JSON snapshot.
- **The device list is filterable by type** (all / typed / UNKNOWN / each
  device type) via chips above the table — the filter is URL-driven and
  shareable.
- **Every record is accounted for** — records, IPs, devices, connections, and the 3
  known warnings are all visible on the Sources page.
- **Provider ranges are carried as evidence** — the 9 `/28` allocations ingest as
  network records and are merged by IP like everything else, so a provider range
  that matches an existing record is one row, never two.

## API

All endpoints served under `/api`:

| Endpoint | Purpose |
| --- | --- |
| `GET /api/health` | Snapshot health + validation details |
| `GET /api/summary` | Headline counts + ingest metadata |
| `GET /api/sources` | Per-sheet record/warning inventory |
| `GET /api/devices?q&type&page&pageSize` | Device list (named devices first) — `type` = all / named / unknown / a device type |
| `GET /api/devices/:id` | Device detail — aliases, IPs, connections, chain uplink/downlink |
| `GET /api/devices/:id/ips` · `/connections` | Device IPs / connections |
| `GET /api/ips?q&page&pageSize` | IP index (IPv4 first) |
| `GET /api/ips/:ip` | IP detail — owning devices, connections, aliases |
| `GET /api/graph` | IP-anchored layered graph (nodes + edges + summary) |
| `GET /api/export?format=csv\|json` | Inventory export — one CSV row per device (IPs, aliases, sources, confidence) or the full JSON snapshot |
| `GET /api/search?q` | Devices + IPs matched by name, alias, IP, serial, model, location |

## Development

```bash
npm test           # vitest: ip/name normalization + merge + API + real-source ingest
npm run check      # strict TS, no emit
npm run ingest     # rebuild the snapshot
npm start          # API + UI on :3000
npm run dev        # same, with tsx watch
```

`scripts/smoke-spa.mjs` boots the API and drives the SPA in jsdom (overview →
device → graph → sources → IPs → search → type filter + chip click
→ export link) — it is the regression harness for front-end wiring
without a browser.

## Layout

```
src/
  config/index.ts    central env/paths (never reads process.env elsewhere)
  types/index.ts     RawRecord, NormalizedIp, MergeResult, MasterDevice/Ip/Connection
  ingest/            workbook loading, per-sheet parsers + configs, CLI
  normalize/         IP parser (ports/prefixes/ranges/IPv6), name cleaner
  resolve/           per-IP canonical-name scoring + device classification
  merge/             IP-first identity resolution + connections
  graph/             layered, IP-anchored graph builder
  db/                node:sqlite snapshot (load/save/search helpers)
  api/server.ts      Fastify app + static SPA
  web/public/        self-contained SPA — index.html, styles.css, app.js (no build step)
scripts/smoke-spa.mjs   jsdom front-end smoke harness
tests/               vitest suites
```

## Data quality notes (current snapshot)

- 539 devices resolve to `UNKNOWN` type (no per-device model/type evidence).
- `Old-Acc-Sw-Sheet` neighbor IPs detect at column 10 while the config says col 1 —
  auto-detection wins and the difference is logged as a warning.
- `New-Acc-Sw-Sheet` is header-only and is skipped by config.
- `Core Device` carries no neighbor-IP column — Core edges are name-only.
- Conflict evidence and per-IP devices are kept separate; IP-only placeholder
  devices show an `(IP only)` badge.

## Legacy

This repo also contains the pre-existing **NetAtlas** app (`server.mjs`, `live.mjs`,
`public/`, `start-netatlas.*`, `peering-safe.xlsx`, `source.xlsx`, `scripts_inventory_dump.mjs`).
It is **not** part of the strict-TS pipeline and is only documented for reference —
see `LOCAL-RUN.md` for its original usage. NetArch (this README) is the default path.
