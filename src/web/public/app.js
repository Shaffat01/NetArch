/* NetArch web app — vanilla JS + hash router. */

const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = (n) => (n ?? 0).toLocaleString();
const confPct = (c) => Math.round((c ?? 0) * 100);
const badgeCls = (t) => `badge type-${t}`;
const TYPE_META = {
  CORE_DEVICE: { label: 'Core Device', color: '#c084fc', icon: '▣' },
  CORE_RT: { label: 'Core RT', color: '#f472b6', icon: '⬢' },
  SW: { label: 'Switch', color: '#4dd0e1', icon: '◉' },
  DIST_SW: { label: 'Distribution SW', color: '#60a5fa', icon: '◈' },
  ACCESS_SW: { label: 'Access SW', color: '#4ade80', icon: '◇' },
  ISP: { label: 'ISP', color: '#f5b453', icon: '☄' },
  UNKNOWN: { label: 'Unknown', color: '#66707f', icon: '◇' },
};
const CONNECTION_KIND_META = { CONNECTION: 'Connection', TUNNEL: 'Tunnel' };

/* ---------------- API ---------------- */
async function api(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${res.status} ${path}`);
  return res.json();
}

/* ---------------- view state ---------------- */
const state = {
  view: 'overview',
  q: '',
  page: 1,
  pageSize: 40,
  deviceId: null,
  ip: null,
};

function route(hash) {
  const parts = hash.replace(/^#\/?/, '').split('?');
  const path = parts[0] || 'overview';
  const query = new URLSearchParams(parts[1] || '');
  state.q = query.get('q') || '';
  state.page = Number(query.get('page') || 1);
  const seg = path.split('/').filter(Boolean);
  if (seg[0] === 'device' && seg[1]) {
    state.view = 'device';
    state.deviceId = decodeURIComponent(seg[1]);
  } else if (seg[0] === 'ip' && seg[1]) {
    state.view = 'ip';
    state.ip = decodeURIComponent(seg[1]);
  } else if (seg[0] === 'graph') {
    state.view = 'graph';
  } else if (seg[0] === 'ips') {
    state.view = 'ips';
  } else if (seg[0] === 'sources') {
    state.view = 'sources';
  } else if (seg[0] === 'devices') {
    state.view = 'devices';
  } else {
    state.view = 'overview';
  }
  render();
  renderSidebar();
}

/* ---------------- render ---------------- */
async function render() {
  window.scrollTo(0, 0);
  const navLinks = $$('.nav-item');
  navLinks.forEach((a) => {
    const key = a.dataset.nav;
    const active =
      (state.view === 'devices' && key === 'devices') ||
      (state.view === 'ips' && key === 'ips') ||
      (state.view === 'graph' && key === 'graph') ||
      (state.view === 'sources' && key === 'sources') ||
      (state.view === 'device' && key === 'devices') ||
      (state.view === 'ip' && key === 'ips');
    a.classList.toggle('active', active);
  });

  const content = $('#content');
  content.innerHTML = '<div class="empty">Loading…</div>';
  const topbarTitle = $('#topbar-title');
  const topbarStats = $('#topbar-stats');

  try {
    const summary = await api('/api/summary');
    const stats = summary.stats || {};
    const sCount = (v) => num(v ?? 0);
    topbarStats.innerHTML = `
      <span><b>${sCount(stats.ips)}</b> IPs</span>
      <span><b>${sCount(stats.devices)}</b> devices</span>
      <span><b>${sCount(stats.connections)}</b> connections</span>
      <span><b>${sCount(stats.records)}</b> records</span>`;
    $('#topbar-title').textContent =
      state.view === 'overview' ? 'Overview' :
      state.view === 'device' ? 'Device' :
      state.view === 'ip' ? 'IP' :
      state.view === 'graph' ? 'Connectivity Graph' :
      state.view === 'ips' ? 'IP Index' :
      state.view === 'sources' ? 'Sources' : 'Devices';

    if (state.view === 'overview') await renderOverview(content, summary);
    else if (state.view === 'device') await renderDevice(content, state.deviceId);
    else if (state.view === 'ip') await renderIp(content, state.ip);
    else if (state.view === 'devices') await renderDevices(content);
    else if (state.view === 'ips') await renderIps(content);
    else if (state.view === 'graph') await renderGraph(content);
    else if (state.view === 'sources') await renderSources(content);
  } catch (err) {
    content.innerHTML = `<div class="error-box">Failed to load: ${esc(err.message)}</div>`;
    topbarStats.innerHTML = '';
  }
}

/* ---------------- overview ---------------- */
async function renderOverview(el, summary) {
  const graph = await api('/api/graph');
  const s = summary.stats || {};
  el.innerHTML = `
    <div class="breadcrumbs">Overview</div>
    <div class="overview-grid">
      <div class="stat-card">
        <div class="label">Records parsed</div>
        <div class="value">${num(s.records)}</div>
        <div class="sub">from ${num(s.sheets)} sheets · 2 sources</div>
      </div>
      <div class="stat-card">
        <div class="label">IPs</div>
        <div class="value">${num(s.ips)}</div>
        <div class="sub">${num(graph.summary.unmatchedNeighbors)} unmatched edges skipped</div>
      </div>
      <div class="stat-card">
        <div class="label">Devices</div>
        <div class="value">${num(s.devices)}</div>
        <div class="sub">${num(graph.summary.ipOnlyNodes)} IP-only records</div>
      </div>
      <div class="stat-card">
        <div class="label">Connections</div>
        <div class="value">${num(s.connections)}</div>
        <div class="sub">${num(graph.edges.filter((e) => e.matchKind === 'ip').length)} attested by IP</div>
      </div>
    </div>
    <div class="section">
      <div class="section-title">What this is</div>
      <p style="color:var(--text-2);font-size:13px;max-width:72ch;">
        NetArch is an <b>IP-centric</b> network infrastructure inventory. Every device, host, network block and
        neighbor is merged by <b>IP address</b> — never by name. Names are display labels only; each IP keeps its
        canonical name <i>plus</i> all aliases with their source sheet/file. Use the <b>Devices</b> list to browse,
        the <b>Search</b> box to find an IP/hostname/name, or the <b>Graph</b> view to see the layered chain.
      </p>
    </div>
    <div class="section">
      <div class="section-title">Layered chain (Access → ISP)</div>
      <div class="scroll-x"><table class="table"><thead><tr><th>Layer</th><th>Device type</th><th>Source sheets</th></tr></thead><tbody>
        ${chainTableRows()}
      </table></div>
    </div>
    <div class="section">
      <div class="section-title">Legend</div>
      <div class="two-col">
        <div>
          <div class="muted small" style="margin-bottom:6px;">Connectivity edges</div>
          <div class="small"><span class="pill">solid line</span>&nbsp;&nbsp;attested by IP address</div>
          <div class="small" style="margin-top:6px;"><span class="pill">dashed line</span>&nbsp;&nbsp;resolved by name only</div>
        </div>
        <div>
          <div class="muted small" style="margin-bottom:6px;">Device types</div>
          ${Object.values(TYPE_META).map((t) => `<div class="small" style="margin:4px 0;"><span class="badge" style="color:${t.color};border-color:${t.color}44;background:${t.color}22;">${t.label}</span></div>`).join('')}
        </div>
      </div>
    </div>`;
}

function chainTableRows() {
  const rows = [
    ['Access', 'ACCESS_SW', 'Access SW · Old-Acc-Sw-Sheet · WHIL/WMTC'],
    ['Distribution', 'DIST_SW', 'Distribution Device · WHIL/WMTC'],
    ['Switch', 'SW', 'Data Center Devices · HQ Core'],
    ['Core RT', 'CORE_RT', 'Core Device · Data Center Devices'],
    ['Core Device', 'CORE_DEVICE', 'Core Device · serial number'],
    ['ISP', 'ISP', '—'],
  ];
  return rows.map(([l, t, src]) => `<tr><td class="mono" style="color:${TYPE_META[t]?.color ?? '#66707f'};">${l}</td><td><span class="badge ${badgeCls(t)}">${TYPE_META[t]?.label ?? t}</span></td><td class="small" style="color:var(--text-2);">${src}</td></tr>`).join('');
}

/* ---------------- device view ---------------- */
async function renderDevice(el, id) {
  const d = await api(`/api/devices/${encodeURIComponent(id)}`);
  if (!d) { el.innerHTML = '<div class="error-box">Device not found.</div>'; return; }
  const typeMeta = TYPE_META[d.deviceType] ?? TYPE_META.UNKNOWN;
  const aliases = d.aliases || [];
  const ips = d.ips || [];
  const connections = d.connections || [];
  const directions = d.directions || {};
  const hasIps = ips.length > 0;

  el.innerHTML = `
    <div class="breadcrumbs"><a href="#/devices">Devices</a><span class="sep">/</span>${esc(d.canonicalName)}</div>
    <div class="device-hero">
      <div class="icon" style="border-color:${typeMeta.color}44;background:${typeMeta.color}18;">${typeMeta.icon}</div>
      <div style="flex:1;min-width:280px;">
        <h1>${esc(d.canonicalName)}</h1>
        <div class="sub">${d.location ? esc(d.location) : '—'} &nbsp;·&nbsp; ${d.originSheets?.length ?? 0} source sheet(s)</div>
        <div class="badges">
          <span class="badge ${badgeCls(d.deviceType)}">${typeMeta.label}</span>
          <span class="badge conf">${confPct(d.confidence)}% confidence</span>
          ${d.hasSerial ? '<span class="badge conf">serial evidence</span>' : ''}
        </div>
        <div class="confidence"><div class="bar"><div class="fill" style="width:${confPct(d.confidence)}%"></div></div><div class="pct">${confPct(d.confidence)}%</div></div>
      </div>
    </div>

    <div class="two-col">
      <div class="section">
        <div class="section-title">Identity</div>
        <dl class="kv">
          <dt>Owner</dt><dd>${esc(d.canonicalName)}</dd>
          <dt>Type</dt><dd><span class="badge ${badgeCls(d.deviceType)}">${typeMeta.label}</span></dd>
          <dt>IP(s)</dt><dd>${hasIps ? ips.map((i) => `<a class="linkable mono" href="#/ip/${encodeURIComponent(i.ip)}">${esc(i.ip)}</a>`).join(', ') : '<span class="muted">none (equipment without IP evidence)</span>'}</dd>
          <dt>Location</dt><dd>${esc(d.location ?? '—')}</dd>
          <dt>Model</dt><dd class="mono">${esc(d.model ?? '—')}</dd>
          <dt>Serial</dt><dd class="mono">${esc(d.serial ?? '—')}</dd>
          <dt>Source sheets</dt><dd>${esc((d.originSheets || []).join(', ') || '—')}</dd>
        </dl>
      </div>
      <div class="section">
        <div class="section-title">Uplink chain position</div>
        <div class="small" style="color:var(--text-2);">
          Access → Distribution → SW → Core RT → Core Device → ISP
        </div>
        <div class="small" style="margin-top:10px;"><span class="pill">rank ${d.chainPosition ?? 0}</span></div>
        <dl class="kv" style="margin-top:12px;">
          <dt>Upstream</dt><dd>${(directions.upstream || []).map((n) => `<a class="linkable" href="#/device/${encodeURIComponent(n.deviceId)}">${esc(n.name)}</a> <span class="pill">${n.position}</span>`).join('<br>') || '<span class="muted">none toward ISP</span>'}</dd>
          <dt>Downstream</dt><dd>${(directions.downstream || []).map((n) => `<a class="linkable" href="#/device/${encodeURIComponent(n.deviceId)}">${esc(n.name)}</a> <span class="pill">${n.position}</span>`).join('<br>') || '<span class="muted">none toward access</span>'}</dd>
        </dl>
      </div>
    </div>

    <div class="section">
      <div class="section-title">Aliases with source (${aliases.length})</div>
      ${aliases.length === 0 ? '<div class="empty">No alias evidence — device identified by IP.</div>' : `
        <div class="scroll-x"><table class="table"><thead><tr><th>Name</th><th>Source file</th><th>Source sheet</th><th>Confidence</th><th></th></tr></thead><tbody>
        ${aliases.map((a) => `
          <tr>
            <td class="mono">${esc(a.cleanedName)}</td>
            <td class="small">${esc(a.sourceFile)}</td>
            <td class="small">${esc(a.sourceSheet)} <span class="muted">· row ${a.sourceRow}</span></td>
            <td><span class="pill">${Math.round(a.confidence * 100)}%</span></td>
            <td><span class="muted small">${a.sourceSheetCount} sheet(s)</span></td>
          </tr>`).join('')}
        </tbody></table></div>`}
    </div>

    <div class="section">
      <div class="section-title">Connections (${connections.length})</div>
      ${connections.length === 0 ? '<div class="empty">No connections found for this device.</div>' : connections.map((c) => `
        <div class="conn-row">
          <div class="head">
            <span class="badge conf">${esc(c.matchKind)}</span>
            <span class="mono">${esc(c.srcIp)}</span><span class="arrow">→</span><span class="mono">${esc(c.dstIp)}</span>
            <span class="dir">${esc(CONNECTION_KIND_META[c.kind] ?? c.kind)}</span>
          </div>
          <div class="detail">${esc(c.srcLabel)} → ${esc(c.dstLabel)} &nbsp;·&nbsp; ${c.evidenceCount} evidence row(s)</div>
        </div>`).join('')}
    </div>
  `;
}

/* ---------------- IP view ---------------- */
async function renderIp(el, ip) {
  const rec = await api(`/api/ips/${encodeURIComponent(ip)}`);
  if (!rec) { el.innerHTML = '<div class="error-box">IP not found.</div>'; return; }
  const devices = rec.devices || [];
  const aliases = rec.aliases || [];
  const connections = rec.connections || [];
  const kindLabel = rec.kind === 'network' ? 'Network' : 'Host';

  el.innerHTML = `
    <div class="breadcrumbs"><a href="#/ips">IPs</a><span class="sep">/</span><span class="mono">${esc(rec.ip)}</span></div>
    <div class="device-hero">
      <div class="icon" style="border-color:rgba(77,208,225,.35);background:rgba(77,208,225,.14);">◆</div>
      <div style="flex:1;">
        <h1 class="mono" style="letter-spacing:-0.3px;">${esc(rec.ip)}</h1>
        <div class="sub">${rec.family === 4 ? 'IPv4' : 'IPv6'} · ${kindLabel}${rec.prefix !== null ? ' · /' + rec.prefix : ''}</div>
        <div class="badges">
          <span class="badge">${rec.kind === 'network' ? 'Network' : 'Host'}</span>
          <span class="badge conf">${rec.records} record(s)</span>
          ${rec.fromRange ? '<span class="badge conf">from range expansion</span>' : ''}
          ${devices.length === 0 ? '<span class="badge conf">no device</span>' : ''}
        </div>
      </div>
    </div>

    <div class="two-col">
      <div class="section">
        <div class="section-title">Best name</div>
        <div class="small" style="margin-bottom:10px;color:var(--text-2);">Canonical name = best-scoring alias across ${devices.length} device(s)</div>
        <div class="mono" style="font-size:22px;font-weight:700;">${esc(rec.canonicalName ?? '—')}</div>
        ${aliases.length === 0 ? '<div class="empty" style="margin-top:10px;">No alias evidence — that is fine.</div>' : `
          <table class="table" style="margin-top:14px;"><thead><tr><th>Alias</th><th>Source</th><th></th></tr></thead><tbody>
            ${aliases.map((a) => `<tr><td class="mono">${esc(a.cleanedName)}</td><td class="small">${esc(a.sourceFile.replace(/\.xlsx$/i, ''))} · ${esc(a.sourceSheet)}</td><td><span class="pill">${Math.round(a.confidence * 100)}%</span></td></tr>`).join('')}
          </tbody></table>`}
      </div>
      <div class="section">
        <div class="section-title">Devices (${devices.length})</div>
        ${devices.length === 0 ? '<div class="empty">IP has no matching device record.</div>' : devices.map((d) => `
          <div class="device-row" style="border:1px solid var(--border);margin-bottom:8px;">
            <a class="linkable" href="#/device/${encodeURIComponent(d.id)}"><div class="name">${esc(d.canonicalName)}</div></a>
            <div class="meta">${esc(d.deviceType)}${d.ips?.length ? ' · ' + num(d.ips.length) + ' IP(s)' : ''}</div>
          </div>`).join('')}
      </div>
    </div>

    <div class="section">
      <div class="section-title">Connections (${connections.length})</div>
      ${connections.length === 0 ? '<div class="empty">No connections involving this IP.</div>' : connections.map((c) => `
        <div class="conn-row">
          <div class="head">
            <span class="badge conf">${esc(c.matchKind)}</span>
            <span class="mono">${esc(c.srcIp)}</span><span class="arrow">→</span><span class="mono">${esc(c.dstIp)}</span>
            <span class="dir">${esc(CONNECTION_KIND_META[c.kind] ?? c.kind)}</span>
          </div>
          <div class="detail">${esc(c.srcLabel)} → ${esc(c.dstLabel)}</div>
        </div>`).join('')}
    </div>

    <div class="section">
      <div class="section-title">Origin sheets</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;">${(rec.originSheets || []).map((s) => `<span class="pill">${esc(s)}</span>`).join('')}</div>
    </div>
  `;
}

/* ---------------- device list ---------------- */
async function renderDevices(el) {
  const page = state.page;
  const data = await api(`/api/devices?q=${encodeURIComponent(state.q)}&page=${page}&pageSize=${state.pageSize}`);
  el.innerHTML = `
    <div class="breadcrumbs">Devices <span class="muted">(${num(data.total)} · page ${page})</span></div>
    <div class="section" style="padding:8px 14px;">
      <table class="table">
        <thead><tr><th>Name</th><th>Type</th><th>IPs</th><th>Conf</th></tr></thead>
        <tbody>
          ${data.items.map((d) => `
            <tr style="cursor:pointer;" data-id="${esc(d.id)}">
              <td><a class="linkable" href="#/device/${encodeURIComponent(d.id)}">${esc(d.canonicalName)}</a>${d.hasName ? '' : ' <span class="muted small">(IP only)</span>'}</td>
              <td><span class="badge ${badgeCls(d.deviceType)}">${(TYPE_META[d.deviceType] ?? TYPE_META.UNKNOWN).label}</span></td>
              <td class="mono small">${(d.ips || []).slice(0, 3).map((ip) => esc(ip)).join(', ')}${(d.ips || []).length > 3 ? ` <span class="muted">+${d.ips.length - 3}</span>` : ''}</td>
              <td><span class="pill">${confPct(d.confidence)}%</span></td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>
    <div style="display:flex;gap:8px;justify-content:center;margin-top:14px;">
      <a class="badge" href="#/devices?q=${encodeURIComponent(state.q)}&page=${page - 1}" style="${page <= 1 ? 'opacity:.35;pointer-events:none;' : ''}">← Prev</a>
      <span class="small" style="align-self:center;color:var(--text-3);">${page}</span>
      <a class="badge" href="#/devices?q=${encodeURIComponent(state.q)}&page=${page + 1}" style="${page * state.pageSize >= data.total ? 'opacity:.35;pointer-events:none;' : ''}">Next →</a>
    </div>
  `;
  $$('tr[data-id]', el).forEach((row) => {
    row.addEventListener('click', (e) => {
      if (e.target.closest('a[href]')) return;
      location.hash = `#/device/${encodeURIComponent(row.dataset.id)}`;
    });
  });
}

/* ---------------- IP list ---------------- */
async function renderIps(el) {
  const page = state.page;
  const data = await api(`/api/ips?q=${encodeURIComponent(state.q)}&page=${page}&pageSize=${state.pageSize}`);
  el.innerHTML = `
    <div class="breadcrumbs">IPs <span class="muted">(${num(data.total)} · page ${page})</span></div>
    <div class="section" style="padding:8px 14px;">
      <table class="table">
        <thead><tr><th>IP</th><th>Kind</th><th>Device(s)</th><th>Records</th></tr></thead>
        <tbody>
          ${data.items.map((i) => `
            <tr style="cursor:pointer;" data-ip="${esc(i.ip)}">
              <td><a class="linkable mono" href="#/ip/${encodeURIComponent(i.ip)}">${esc(i.ip)}</a>${i.prefix !== null ? '<span class="muted"> /' + i.prefix + '</span>' : ''}</td>
              <td><span class="pill">${i.kind === 'network' ? 'network' : 'host'}</span></td>
              <td class="small">${(i.devices || []).length === 0 ? '<span class="muted">—</span>' : esc((i.canonicalName ?? '—'))}</td>
              <td><span class="pill">${i.records}</span></td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>
    <div style="display:flex;gap:8px;justify-content:center;margin-top:14px;">
      <a class="badge" href="#/ips?q=${encodeURIComponent(state.q)}&page=${page - 1}" style="${page <= 1 ? 'opacity:.35;pointer-events:none;' : ''}">← Prev</a>
      <span class="small" style="align-self:center;color:var(--text-3);">${page}</span>
      <a class="badge" href="#/ips?q=${encodeURIComponent(state.q)}&page=${page + 1}" style="${page * state.pageSize >= data.total ? 'opacity:.35;pointer-events:none;' : ''}">Next →</a>
    </div>
  `;
  $$('tr[data-ip]', el).forEach((row) => {
    row.addEventListener('click', (e) => {
      if (e.target.closest('a[href]')) return;
      location.hash = `#/ip/${encodeURIComponent(row.dataset.ip)}`;
    });
  });
}

/* ---------------- graph view ---------------- */
const TYPE_FILTERS = [
  { id: 'all', label: 'All layers', types: null },
  { id: 'access', label: 'Access', types: ['ACCESS_SW'] },
  { id: 'dist', label: 'Distribution', types: ['DIST_SW'] },
  { id: 'core', label: 'Core', types: ['CORE_RT', 'CORE_DEVICE', 'ISP'] },
  { id: 'sw', label: 'Switches', types: ['SW'] },
];
let graphFilter = 'all';

async function renderGraph(el) {
  const graph = await api('/api/graph');
  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));

  const active = TYPE_FILTERS.find((f) => f.id === graphFilter) || TYPE_FILTERS[0];
  const visibleIds = new Set(graph.nodes.filter((n) => active.types ? active.types.includes(n.type) : true).map((n) => n.id));
  const visibleEdges = graph.edges.filter((e) => visibleIds.has(e.src) && visibleIds.has(e.dst));
  const visibleNodes = graph.nodes.filter((n) => visibleIds.has(n.id));

  el.innerHTML = `
    <div class="breadcrumbs">Graph <span class="muted">— uplink chain</span></div>
    <div class="section">
      <div class="section-title">Filter</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;" id="graph-filters">
        ${TYPE_FILTERS.map((f) => `<button data-filter="${f.id}" class="badge ${f.id === graphFilter ? 'type-ACCESS_SW' : ''}" style="cursor:pointer;">${f.label}</button>`).join('')}
      </div>
    </div>
    <div class="section">
      <div class="section-title">Chain view — ${num(visibleNodes.length)} nodes · ${num(visibleEdges.length)} edges</div>
      <div class="graph-wrap" id="graph-wrap"><svg class="graph-svg" id="graph-svg" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet"></svg></div>
      <div class="small muted" style="margin-top:8px;">Click a node to open the device. Solid lines are attested by IP; dashed lines are resolved by name only. Layered top→bottom: Access → Distribution → SW → Core RT → Core Device → ISP.</div>
    </div>`;

  // layered layout
  const byLayer = new Map();
  for (const n of visibleNodes) {
    const layer = n.layerRank;
    const arr = byLayer.get(layer) ?? [];
    arr.push(n);
    byLayer.set(layer, arr);
  }
  const layerSpacing = 100 / (Math.max(...visibleNodes.map((n) => n.layerRank), 0) + 2);
  const svg = $('#graph-svg');
  const positions = new Map();
  let maxRowIps = 1;
  for (const [layer, nodes] of byLayer) {
    maxRowIps = Math.max(maxRowIps, nodes.length);
  }
  const layerCount = byLayer.size || 1;
  const width = 1000, height = Math.max(420, 120 * layerCount + 100);
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.style.height = height + 'px';

  const nodesByLayer = new Map();
  for (const [layer, nodes] of byLayer) {
    nodes.sort((a, b) => (a.label < b.label ? -1 : 1));
    nodesByLayer.set(layer, nodes);
  }
  const positionsMap = new Map();
  for (const [layer, nodes] of nodesByLayer) {
    const y = 60 + (Math.max(...nodesByLayer.keys(), 0) - layer + 1) * 80;
    const count = nodes.length;
    nodes.forEach((n, i) => {
      const x = count === 1 ? width / 2 : (i + 1) * (width / (count + 1));
      positionsMap.set(n.id, { x, y });
    });
  }

  // draw edges
  const edgeSvg = visibleEdges.map((e) => {
    const a = positionsMap.get(e.src), b = positionsMap.get(e.dst);
    if (!a || !b) return '';
    const dash = e.matchKind === 'name' ? 'stroke-dasharray="5 5"' : '';
    const color = e.matchKind === 'name' ? '#8b96a8' : '#4dd0e1';
    const midy = (a.y + b.y) / 2;
    return `<path class="graph-edge" d="M ${a.x} ${a.y + 14} C ${a.x} ${midy}, ${b.x} ${midy}, ${b.x} ${b.y - 14}" fill="none" stroke="${color}" stroke-width="1.6" stroke-opacity="0.75" ${dash} />`;
  }).join('');

  // draw nodes
  const nodeSvg = visibleNodes.map((n) => {
    const p = positionsMap.get(n.id);
    if (!p) return '';
    const t = TYPE_META[n.type] ?? TYPE_META.UNKNOWN;
    const label = n.label.length > 24 ? n.label.slice(0, 22) + '…' : n.label;
    const w = Math.min(220, Math.max(110, label.length * 6.2 + 20));
    return `
      <g class="graph-node" data-id="${esc(n.id)}" style="cursor:pointer;">
        <rect x="${p.x - w / 2}" y="${p.y - 20}" width="${w}" height="40" rx="9" fill="#151a25" stroke="${t.color}" stroke-width="1.6" />
        <text x="${p.x}" y="${p.y - 2}" text-anchor="middle" fill="#e6e9ef" font-size="11" font-weight="600" style="font-family:var(--sans)">${esc(label)}</text>
        <text x="${p.x}" y="${p.y + 13}" text-anchor="middle" fill="${t.color}" font-size="9.5" font-family="var(--mono)">${esc(n.type)}</text>
      </g>`;
  }).join('');

  svg.innerHTML = `<defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#4dd0e1"/></marker></defs>${edgeSvg}${nodeSvg}`;

  // interactions
  $$('.graph-node', svg).forEach((g) => {
    g.addEventListener('click', () => {
      const id = g.dataset.id;
      const ipRec = graph.nodes.find((n) => n.id === id);
      if (!ipRec) return;
      location.hash = `#/ip/${encodeURIComponent(id)}`;
    });
  });
  $$('#graph-filters button').forEach((btn) => {
    btn.addEventListener('click', () => {
      graphFilter = btn.dataset.filter;
      renderGraph(el);
    });
  });
}

/* ---------------- sources view ---------------- */
async function renderSources(el) {
  const data = await api('/api/sources');
  const summary = await api('/api/summary');
  const files = summary.files || [];
  el.innerHTML = `
    <div class="breadcrumbs">Sources</div>
    <div class="section">
      <div class="section-title">Source files</div>
      ${files.map((f) => `<div class="small" style="color:var(--text-2);margin:4px 0;">${esc(f)}</div>`).join('')}
      <div class="small muted" style="margin-top:10px">Read-only. NetArch never modifies source workbooks.</div>
    </div>
    <div class="section">
      <div class="section-title">Sheet inventory (${(data.sources || []).length})</div>
      <div class="scroll-x"><table class="table">
        <thead><tr><th>File</th><th>Sheet</th><th>Records</th><th>Warnings</th></tr></thead>
        <tbody>${(data.sources || []).map((s) => `<tr><td class="small">${esc(s.file)}</td><td class="mono small">${esc(s.sheet)}</td><td><span class="pill">${s.records}</span></td><td>${s.warnings > 0 ? '<span class="badge conf">' + s.warnings + '</span>' : '<span class="muted">—</span>'}</td></tr>`).join('')}</tbody>
      </table></div>
    </div>
    <div class="section">
      <div class="section-title">Warnings (${(data.warnings || []).length})</div>
      ${(data.warnings || []).length === 0 ? '<div class="empty">No warnings.</div>' : `<ul class="small" style="padding-left:20px;color:var(--text-2);">${(data.warnings || []).map((w) => `<li>${esc(w)}</li>`).join('')}</ul>`}
    </div>
  `;
}

/* ---------------- sidebar ---------------- */
async function renderSidebar() {
  const list = $('#device-list');
  if (!list) return;
  try {
    const data = await api(`/api/devices?q=${encodeURIComponent(state.q)}&page=1&pageSize=28`);
    const items = (data.items || [])
      .filter((d) => d.hasName)
      .sort((a, b) => (b.records ?? 0) - (a.records ?? 0) || a.canonicalName.localeCompare(b.canonicalName));
    $('#sidebar-list .caption')?.remove();
    list.innerHTML = `<div class="sidebar-caption">${state.q ? 'Search results' : 'Top devices'}</div>` + items.map((d) => `
      <div class="device-row ${state.deviceId === d.id ? 'active' : ''}" data-id="${esc(d.id)}" title="${esc(d.canonicalName)}">
        <div class="name">${esc(d.canonicalName)}</div>
        <div class="meta">${(d.ips || []).slice(0, 2).map((ip) => esc(ip)).join(' · ')}</div>
      </div>`).join('');
    $$('.device-row', list).forEach((row) => {
      row.addEventListener('click', () => { location.hash = `#/device/${encodeURIComponent(row.dataset.id)}`; });
    });
  } catch { /* keep sidebar quiet on failure */ }
}

/* ---------------- events ---------------- */
function wireEvents() {
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && document.activeElement !== $('#search-input')) {
      e.preventDefault();
      $('#search-input')?.focus();
    }
    if (e.key === 'Escape') {
      $('#search-input')?.blur();
    }
  });
  let searchTimer = null;
  const input = $('#search-input');
  input?.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.q = input.value.trim();
      state.page = 1;
      if (state.view !== 'devices' && state.view !== 'ips') {
        location.hash = `#/devices?q=${encodeURIComponent(state.q)}`;
      } else {
        renderSidebar();
        render();
      }
    }, 220);
  });
  window.addEventListener('hashchange', () => route(location.hash));
}

async function boot() {
  wireEvents();
  route(location.hash);
  renderSidebar();
}
boot();
