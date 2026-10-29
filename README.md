# NetAtlas — Unified WMTC / WHIL / DC / NDC Architecture

NetAtlas is an offline-ready, IP-centric network architecture explorer and editable local workspace. It merges the main network register, the dedicated DataCenter inventory, and the sanitized peering/IPAM workbook into one canonical model. The original Google Sheets remain read-only.

## Run

```bash
npm start
```

Open `http://localhost:3000`. The server listens on `0.0.0.0:3000`; set `PORT` to use another port. There are no runtime package, CDN, login, or internet requirements. `public/index.html` can also be opened directly from disk, using the local `data.js` snapshot.

## Primary experience: Unified IP architecture

**Architecture → Unified IP map** is the default view. It is an architectural model, not a spreadsheet table:

- **IP is the primary identity signal.** Strong management/inventory, loopback, HQ Access, and device-peering IPs merge duplicate representations.
- A canonical device gets **one best display name**, a primary IP, all other IP evidence, and a searchable alias list.
- A device drawer shows its **connected canonical devices and their IPs**, connection types, grouped evidence, aliases, shared-IP conflicts, and incomplete source rows.
- A→B and B→A evidence is grouped into one bidirectional architectural connection. Parallel rows remain available as evidence.
- Global search matches canonical names, source aliases, IPs, serials, models, and normalized source formatting.
- **Export IP mapping** downloads canonical device/IP → connected device/IP rows, including aliases, layers, sites, evidence counts, and source sheets.
- Scope controls cover **All infrastructure**, **DC / NDC**, **WMTC**, and **WHIL**. External, WAN/Edge, Core, Fabric, and Distribution layers are shown initially; Access, Services, Management, and Other can be enabled to avoid an unreadable first render.
- **Register topology** remains available as the editable, site-perspective fallback with the original Core → Distribution → Access hierarchy and source-gap register.

### Current validated unified model

| Measure | Count | Meaning |
| --- | ---: | --- |
| Raw device-name candidates | 547 | Names seen across the merged sources |
| Canonical identities | 504 | After conflict-aware identity resolution |
| Duplicate representations merged | 43 | Audited alias/name merges |
| Connected canonical devices | 317 | Devices with at least one drawable connection |
| Unique architectural connections | 462 | Canonical, bidirectionally grouped pairs |
| Drawn evidence rows | 753 | Explicit rows behind those connections |
| IP-mapped endpoints | 411 | Endpoints resolved through IP evidence |
| Unresolved/incomplete rows | 40 | Preserved without invented endpoints |
| Internal/self evidence | 3 | Not drawn as self-loops |
| Shared-IP conflict keys | 58 | Different physical identities kept separate |

Coverage reconciliation is explicit: **796 connection inputs = 753 drawn evidence rows + 40 unresolved rows + 3 internal/self rows**. No connection input is silently discarded.

### Identity safeguards

- VIP, Standby, Side A/B, failover, multi-IP, and similar shared values are not strong identity keys.
- Different physical ordinals such as `01` and `02` are not blindly unioned, even when worksheets repeat an IP.
- Exact role/name signatures are supporting evidence; names alone are not the primary identity.
- Port-row IPs support connection mapping but do not force unsafe physical-device merges.
- Contradictory shared addresses remain visible as conflicts. Examples include repeated firewall, core-switch, leaf, and WHIL addresses.
- Blank targets stay blank. No neighbor, cable, or reachability is invented.
- ISP `R1`/`R2` columns are explicit evidence; role/scope fallback is used only when their IP is not already present in the canonical index.

## Views

- **Architecture:** the unified IP map described above, plus the editable Register topology. Register mode retains WMTC/WHIL perspectives, referenced-only neighbours, parallel-link grouping, source gaps, pan/zoom, branch/direct focus, and Access→Access daisy-chain grouping under the documented Distribution.
- **Live operations:** LibreNMS status, alerts, utilization, sync warnings, and auto-discovered devices. Unified nodes and links match live data through canonical aliases and IPs. Zabbix remains deferred and disabled.
- **DC / NDC:**
  - **Source devices** uses only the dedicated **Data Center Devices** source: 64 included IP devices, with DC Rack 1 (16), DC Rack 2 (9), NDC Rack 1 (23), NDC Rack 2 (10), and separate NDC NOC (2), F5 (2), and DR (2) groups. No links are inferred from this inventory.
  - **Core links** now uses the same canonical IP resolver as Architecture. The four core worksheets contribute **188 raw rows**, of which **181 resolve** into **158 canonical connections among 82 canonical devices**. Seven blank-target rows and nine total partial rows remain visible as evidence. Core CSV still exports all 188 raw rows.
  - **Main register** separately preserves the previous register-based Core topology and its 38 Core rows.
- **Port connectivity:** 431 explicit port/cabling rows from 11 structured worksheets: 389 complete endpoint rows plus 42 partial rows. Includes 27 safe HQ Access inventory rows and 112 cable-label rows, with filters, pagination, provenance drawers, search, and CSV export.
- **IPAM & peering:** 90 IP blocks/allocations, 98 HQ VLAN rows, 64 device-peering rows, 34 ISP-peering rows, and 12 loopbacks. Blank VLAN 91 remains visible.
- **DMZ / MZ:** all 155 DMZ/MZ node/IP/ownership entries with filtering and source details.
- **Source records:** paginated access to every main-register row, role/zone/gap filters, editing/reset controls, and CSV export.

The WMTC/WHIL selector remains relevant to Register topology, Source records, and the site-perspective inventory views. It is hidden for Unified IP architecture, Port connectivity, and IPAM & peering because those experiences combine the sources.

## Editable local workspace

Every local inventory/evidence collection has **Add**, **Edit/Update**, and **Delete** controls. Use the view’s **Add** button, a row’s action icons, or its detail drawer:

- **Unified IP map:** add/edit/delete canonical devices and connections. Device edits cover best display name, primary IP, aliases, layer, site, role, model, serial, and floor. Connection edits cover endpoints, type, ports, IPs, network, and remarks. Canonical deletions use local tombstones; source evidence is not rewritten.
- **Register topology / Source records:** the existing main-register device CRUD remains available. Add device creates explicit connection rows; deleting a device clears incoming references into visible source gaps.
- **DC / NDC and DMZ / MZ:** add/edit/delete inventory entries. Shared source collections stay synchronized across WMTC and WHIL perspectives. **DC / NDC → Raw source rows** provides explicit CRUD for entries hidden by display exclusions without changing the default rack view.
- **Port connectivity:** add/edit/delete port rows, HQ Access inventory rows, and cable labels. Partial-link status and collection totals are recalculated after each mutation.
- **IPAM & peering:** add/edit/delete IP blocks, VLANs, device peers, ISP peers, and loopbacks. Blank source values remain valid where the source permits them.

Changes persist through `PUT /api/state` to `data/user-state.json`; browser localStorage is the direct-file/offline fallback. Dependent unified, Core, inventory, statistics, search, and export views rebuild immediately after a mutation. LibreNMS responses are merged without overwriting local workspace edits.

**Source records → Reset edits** restores the complete exported workbook snapshot and clears local unified overrides/tombstones. GUI changes never modify the original Google Sheets. Display exclusions only hide the six requested DC entries; they do not delete those raw rows.

## Live LibreNMS integration

Only LibreNMS provides live status, alerts, and utilization. No fake health or metrics are shown while the API is unconfigured or unreachable. Zabbix remains off.

1. In the private local package, keep the supplied `.env` private. Otherwise copy `.env.example` to `.env`.
2. Set the LibreNMS base URL and a **read-only** API token.
3. Restart `npm start`, open **Live operations**, and use **Sync now**.

```dotenv
LIBRENMS_URL=http://librenms.example.local:8000
LIBRENMS_TOKEN=read-only-token
LIVE_REFRESH_SECONDS=60
LIVE_TIMEOUT_MS=15000
LIVE_TLS_REJECT_UNAUTHORIZED=true
AUTO_DISCOVER=true
```

- LibreNMS `/api/v0/devices`, `/ports`, `/links`, and `/alerts` supply device and interface evidence.
- Octet rates are converted to bits/sec and divided by `ifSpeed`; missing values remain blank.
- Hostname, canonical alias, and IP matching prevent duplicate auto-adds.
- For a new IPv4 device, the **third octet is treated as its VLAN** and compared with Distribution-switch IP third octets. A unique match assigns Access beneath that Distribution; unmatched or ambiguous devices remain Discovered.
- VLAN-only parent assignments are labeled inferred and drawn dashed. Real LibreNMS ports are retained when available; missing port evidence is not fabricated.
- Devices missing from a later response become stale, not auto-deleted.
- The NetAtlas host must be able to reach LibreNMS. API failures appear as honest sync warnings.

Live endpoints: `GET /api/live` and `POST /api/live/sync`.

## Source coverage

| Perspective | Main rows | Core | Distribution | Access | Blank-neighbour gaps |
| --- | ---: | ---: | ---: | ---: | ---: |
| WMTC | 153 | 38 | 18 | 97 | 20 |
| WHIL | 98 | 38 | 13 | 47 | 13 |

Each perspective also includes **63 NDC + 46 DC DataCenter entries** and **61 DMZ + 94 MZ entries**. The DataCenter source has 109 raw rows. Six requested DC display exclusions leave **103 visible entries / 64 IP devices**; applying those display exclusions never deletes raw rows. A deliberate local CRUD delete can remove an entry until Reset edits restores the snapshot.

| Peering/IPAM collection | Rows | Notes |
| --- | ---: | --- |
| Port / cabling evidence | 431 | 389 complete + 42 partial |
| HQ Access inventory | 27 | Username column excluded |
| Cable labels | 112 | DC and WHIL-DC |
| IP blocks / allocations | 90 | Public, router-ID and tenant tables |
| VLAN directory | 98 | Includes blank VLAN source row |
| Device peering | 64 | DC and NDC |
| ISP peering | 34 | Empty merged-label spacers excluded |
| Loopbacks | 12 | DC router interfaces |

## Data integrity

- Only explicit evidence creates a connection. Main-register blank neighbours, workbook blank targets, and partial rows remain visible as gaps.
- The separate LibreNMS third-octet rule is always labelled as derived/inferred and never modifies the source workbooks.
- DataCenter inventory uses `SRC_DataCenter`, the copied **Data Center Devices** tab. It is not replaced with main-register Core rows and does not invent topology.
- Rack assignment is display-only: ordinary `01`/unnumbered devices use Rack 1 and `02` devices use Rack 2. Only APIC/CIMC `03` uses Rack 2; APIC `01`/`02` remain Rack 1. Other CIMC devices follow their parent. NDC NOC, F5, and DR remain separately grouped.
- Genuine merged Excel cells are expanded from their top-left values; unmerged blanks stay blank. Source anomalies such as `72.16.0.4`, repeated `172.16.0.21`, and blank VLAN 91 remain visible rather than being silently corrected.
- Independent IP/public/tenant tables are not joined merely because they share a worksheet row. No subnet free/used claims or live reachability are inferred.
- Credential-only tabs and HQ Access usernames are excluded from the app snapshot. `peering-safe.xlsx` is the credential-redacted derivative used for regeneration.
- Older saved workspaces are migrated once when source collections are missing; after migration, bootstrap and LibreNMS refreshes preserve local additions, edits, deletes, unified overrides, and tombstones.

### Source IDs

- Main merged workbook: `1THxqtHc4rHOAunVBL3cBU8tI7oPfuoLgIJPgKrA1nWI`
- Converted DataCenter workbook: `1nwpBfj-RrUVM3UfgqsVbmmtiv-OIdmPaJCE5GQaYNUM`, tab **Data Center Devices**, gid `535144583`
- Peering workbook: `1NhH9QWbkjzwla-BlJc9oJSjFEP7GmZxYAtZzSEjZxyE`, linked tab **HQ Data Center IP Block**, gid `2126088890`

## Regenerate data

The checked-in `source.xlsx` and `peering-safe.xlsx` are the local snapshots. With Python and `openpyxl` available:

```bash
python scripts/extract.py
```

This writes `public/data.json` and `public/data.js` and validates expected source counts, gaps, merged-cell behavior, and credential exclusions. `public/unified.js` builds the canonical model in the browser from that data, so saved edits and discovery can be included without regenerating a static topology.

## Validate

```bash
npm install
npm run check
npm test
```

Validation includes:

- LibreNMS fixtures: normalization, utilization, alerts, auto-add/dedupe, stale handling, third-octet assignment, migration, and ambiguity safety.
- Unified resolver tests: IP validation, alias merges, best names, physical 01/02 separation, shared-IP conflicts, bidirectional grouping, ISP mapping, complete 796-row reconciliation, blank-target safety, dynamic GUI aliases, and LibreNMS rebuilds.
- Generic CRUD model tests: all 10 source collections, shared-site mutation, cable-label synchronization, partial-link recalculation, and derived statistics.
- jsdom smoke tests: unified rendering/search/scopes/layers/export/drawers/live matching, all seven views, DataCenter racks/groups, canonical Core links, raw 188-row/38-row exports, source gaps, B4 Access→Access hierarchy, CRUD/persistence, port/IPAM provenance, credential exclusions, and live/discovery behavior.
- Full browser CRUD smoke: unified device/connection add-edit-delete, canonical metadata/tombstones, every requested source collection, shared-site persistence, stale-live protection, localStorage/server-style saving, and reset.

## Files

- `public/index.html` — application shell
- `public/styles.css` — responsive dashboard and unified-architecture styling
- `public/unified.js` — conflict-aware IP identity resolver, canonical connection builder, and local unified overrides
- `public/crud.js` — shared collection schemas, mutation helpers, ID generation, and derived statistics
- `public/app.js` — views, graph interaction, search, drawers, full workspace CRUD, live matching, and exports
- `public/data.js` / `public/data.json` — generated source snapshots
- `source.xlsx` — merged architecture snapshot
- `peering-safe.xlsx` — sanitized peering/IPAM snapshot
- `scripts/extract.py` — validated main extraction
- `scripts/extract_peering.py` — safe port/IPAM extraction
- `scripts/unified-test.mjs` — unified identity and coverage regression tests
- `scripts/crud-test.mjs` — generic collection mutation and derived-stat tests
- `scripts/smoke.mjs` — end-to-end interaction tests
- `scripts/crud-smoke.mjs` — full browser CRUD, persistence, stale-live, and reset tests
- `server.mjs` — static server, persistence API, and live-sync endpoints
- `live.mjs` — LibreNMS normalization and discovery
- `.env.example` — live API configuration template
