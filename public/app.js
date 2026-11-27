(() => {
  'use strict';

  let DATA = window.NETWORK_DATA;
  const ORIGINAL_DATA = JSON.parse(JSON.stringify(window.NETWORK_DATA || {}));
  const STORAGE_KEY = 'netatlas-user-state-v1';
  const main = document.getElementById('main');
  const drawer = document.getElementById('drawer');
  const drawerBackdrop = document.getElementById('drawerBackdrop');
  const editorModal = document.getElementById('editorModal');
  const editorBackdrop = document.getElementById('editorBackdrop');
  const searchInput = document.getElementById('globalSearch');
  const searchResults = document.getElementById('searchResults');
  const ALL_LAYERS = ['Core', 'Distribution', 'Access', 'Discovered', 'Referenced'];
  const UNIFIED_LAYERS = window.UnifiedAtlas?.layerOrder || ['External', 'WAN / Edge', 'Core', 'Fabric', 'Services', 'Distribution', 'Access', 'Management', 'Other'];
  const UNIFIED_DEFAULT_LAYERS = ['External', 'WAN / Edge', 'Core', 'Fabric', 'Distribution'];
  const state = {
    site: 'WMTC', view: 'architecture', layers: new Set(ALL_LAYERS),
    archMode: 'unified', unifiedScope: 'All', unifiedLayers: new Set(UNIFIED_DEFAULT_LAYERS),
    record: { query: '', role: '', zone: '', gap: false, page: 1, perPage: 25 },
    dcQuery: '', dmzQuery: '', dcGraphMode: 'devices', pendingFocus: null,
    connectivity: { tab: 'links', query: '', scope: '', filter: '', evidence: '', page: 1, perPage: 25 },
    ipam: { tab: 'blocks', query: '', scope: '', filter: '', page: 1, perPage: 25 },
    live: { configured: false, config: { librenms: false, zabbix: false }, status: 'unconfigured', devices: [], links: [], alerts: [], errors: [], added: [], assigned: [], lastSync: null },
    liveSyncing: false,
    focusMode: 'branch', focusedNodeId: null,
  };
  let graphRuntime = null;
  let editorDraft = null, genericDraft = null, unifiedDraft = null;
  let toastTimer = null;
  let currentSearchResults = [];

  const ICONS = {
    topology: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="8" y="3" width="8" height="5" rx="1.2"/><rect x="2" y="16" width="8" height="5" rx="1.2"/><rect x="14" y="16" width="8" height="5" rx="1.2"/><path d="M12 8v4M6 16v-2.5h12V16M12 12v1.5"/></svg>',
    activity: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M3 12h4l2.5-7 5 14 2.5-7h4"/></svg>',
    server: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="3" y="3" width="18" height="7" rx="2"/><rect x="3" y="14" width="18" height="7" rx="2"/><path d="M7 6.5h.01M7 17.5h.01M11 6.5h6M11 17.5h6"/></svg>',
    shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M12 3 20 6v5c0 5-3.4 8.3-8 10-4.6-1.7-8-5-8-10V6l8-3Z"/><path d="m8.5 12 2.2 2.2 4.8-5"/></svg>',
    table: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M9 9v11M15 9v11"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 5 5"/></svg>',
    download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3v12m0 0 4-4m-4 4-4-4M4 16v4h16v-4"/></svg>',
    menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 6h16M4 12h16M4 18h16"/></svg>',
    devices: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4M7 9h.01M10 9h7M7 12h.01M10 12h4"/></svg>',
    link: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="m10 13.8-1.2 1.2a3.8 3.8 0 0 1-5.4-5.4l3-3a3.8 3.8 0 0 1 5.4 0M14 10.2l1.2-1.2a3.8 3.8 0 0 1 5.4 5.4l-3 3a3.8 3.8 0 0 1-5.4 0M8 16l8-8"/></svg>',
    rows: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M5 5h14M5 12h14M5 19h14"/><circle cx="2.5" cy="5" r=".7" fill="currentColor"/><circle cx="2.5" cy="12" r=".7" fill="currentColor"/><circle cx="2.5" cy="19" r=".7" fill="currentColor"/></svg>',
    alert: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M12 3 22 20H2L12 3Z"/><path d="M12 9v5M12 17h.01"/></svg>',
    fit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5M3 8l5-5M21 8l-5-5M3 16l5 5M21 16l-5 5"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 5v14M5 12h14"/></svg>',
    minus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M5 12h14"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m6 6 12 12M18 6 6 18"/></svg>',
    info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/></svg>',
    locate: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>',
    edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="m4 16-.7 4.7L8 20l11-11-4-4L4 16Z"/><path d="m13.5 6.5 4 4"/></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 11v6M14 11v6"/></svg>',
    save: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M4 3h13l3 3v15H4V3Z"/><path d="M8 3v6h8V3M8 21v-7h8v7"/></svg>',
  };

  function hydrateIcons(root = document) {
    root.querySelectorAll('[data-icon]').forEach(el => {
      const name = el.dataset.icon;
      if (ICONS[name]) el.innerHTML = ICONS[name];
    });
  }
  function esc(v) {
    return String(v ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
  }
  function txt(v) { return v === null || v === undefined ? '' : String(v).trim(); }
  function show(v, fallback = '—') { return txt(v) || fallback; }
  function bundle() { return DATA.sites[state.site]; }
  function discoveryBundle() {
    if (!DATA.discovered) DATA.discovered = { rows: [], nodes: [], edges: [], links: [], stats: {} };
    return DATA.discovered;
  }
  function refreshSourceSnapshots() {
    DATA.meta ||= {};
    const missing = !DATA.upgradeMeta || !DATA.ipam || !DATA.connectivity || Object.keys(DATA.sites || {}).some(site => !Array.isArray(DATA.sites[site].dataCenter) || !Array.isArray(DATA.sites[site].dmzMz));
    if ((DATA.meta.sourceSnapshotVersion || 0) >= 1 && !missing) return;
    const mergeSource = (current, source) => Array.isArray(current) ? mergeLiveRecords(source, current, source) : JSON.parse(JSON.stringify(source || []));
    Object.keys(DATA.sites || {}).forEach(site => {
      ['dataCenter', 'dmzMz'].forEach(collection => {
        const sourceEntries = ORIGINAL_DATA.sites?.[site]?.[collection];
        if (sourceEntries) DATA.sites[site][collection] = mergeSource(DATA.sites[site][collection], sourceEntries);
      });
    });
    if (!DATA.upgradeMeta && ORIGINAL_DATA.upgradeMeta) DATA.upgradeMeta = JSON.parse(JSON.stringify(ORIGINAL_DATA.upgradeMeta));
    ['ipam', 'connectivity'].forEach(view => {
      if (!ORIGINAL_DATA[view]) return;
      if (!DATA[view]) { DATA[view] = JSON.parse(JSON.stringify(ORIGINAL_DATA[view])); return; }
      Object.keys(ORIGINAL_DATA[view]).forEach(collection => {
        const source = ORIGINAL_DATA[view][collection];
        if (Array.isArray(source)) DATA[view][collection] = mergeSource(DATA[view][collection], source);
        else if (DATA[view][collection] === undefined) DATA[view][collection] = JSON.parse(JSON.stringify(source));
      });
    });
    DATA.meta.sourceSnapshotVersion = 1;
  }
  function mergeLiveRecords(incoming, current, original) {
    const map = new Map((Array.isArray(incoming) ? incoming : []).filter(record => record?.id).map(record => [record.id, record]));
    const currentMap = new Map((Array.isArray(current) ? current : []).filter(record => record?.id).map(record => [record.id, record]));
    const originalMap = new Map((Array.isArray(original) ? original : []).filter(record => record?.id).map(record => [record.id, record]));
    originalMap.forEach((source, id) => {
      const local = currentMap.get(id);
      if (!local) map.delete(id); // a local delete must survive a stale live response
      else if (JSON.stringify(local) !== JSON.stringify(source)) map.set(id, local);
    });
    currentMap.forEach((record, id) => { if (!originalMap.has(id)) map.set(id, record); });
    return [...map.values()];
  }
  function mergeLiveWorkspace(current, incoming) {
    if (!current || !incoming) return incoming || current;
    const merged = { ...incoming };
    merged.meta = { ...(incoming.meta || {}), ...(current.meta || {}) };
    merged.unifiedWorkspace = current.unifiedWorkspace || incoming.unifiedWorkspace;
    merged.sites = {};
    const siteNames = new Set([...Object.keys(current.sites || {}), ...Object.keys(incoming.sites || {})]);
    siteNames.forEach(site => {
      const oldSite = current.sites?.[site] || {}, newSite = incoming.sites?.[site] || oldSite, sourceSite = ORIGINAL_DATA.sites?.[site] || {};
      merged.sites[site] = { ...newSite,
        rows: mergeLiveRecords(newSite.rows, oldSite.rows, sourceSite.rows),
        dataCenter: mergeLiveRecords(newSite.dataCenter, oldSite.dataCenter, sourceSite.dataCenter),
        dmzMz: mergeLiveRecords(newSite.dmzMz, oldSite.dmzMz, sourceSite.dmzMz),
      };
    });
    ['connectivity', 'ipam'].forEach(view => {
      if (!current[view] && !incoming[view]) return;
      merged[view] = { ...(incoming[view] || current[view] || {}) };
      const collections = new Set([...Object.keys(current[view] || {}), ...Object.keys(incoming[view] || {}), ...Object.keys(ORIGINAL_DATA[view] || {})]);
      collections.forEach(collection => {
        if (!Array.isArray(current[view]?.[collection]) && !Array.isArray(incoming[view]?.[collection]) && !Array.isArray(ORIGINAL_DATA[view]?.[collection])) return;
        merged[view][collection] = mergeLiveRecords(incoming[view]?.[collection], current[view]?.[collection], ORIGINAL_DATA[view]?.[collection]);
      });
      if (current[view]?.stats || incoming[view]?.stats) merged[view].stats = { ...(incoming[view]?.stats || {}), ...(current[view]?.stats || {}) };
    });
    merged.discovered = incoming.discovered || current.discovered;
    return merged;
  }
  function allRegisterRows() { return [...bundle().rows, ...discoveryBundle().rows]; }
  function rowById(id) { return bundle().rows.find(r => r.id === id) || discoveryBundle().rows.find(r => r.id === id); }
  function nodeById(id) { return bundle().nodes.find(n => n.id === id) || discoveryBundle().nodes.find(n => n.id === id); }
  function combinedGraph() {
    const base = bundle(), discovered = discoveryBundle();
    const nodes = new Map(base.nodes.map(n => [n.id, n])), aliases = new Map();
    discovered.nodes.forEach(n => {
      if (n.referencedOnly && nodes.has(n.id.replace(/^ref:/, ''))) { aliases.set(n.id, n.id.replace(/^ref:/, '')); return; }
      if (nodes.has(n.id)) {
        aliases.set(n.id, n.id);
        const existing = nodes.get(n.id);
        nodes.set(n.id, { ...existing, rows: [...new Set([...existing.rows, ...n.rows])], referencedRows: [...new Set([...existing.referencedRows, ...n.referencedRows])], gapRows: [...new Set([...existing.gapRows, ...n.gapRows])] });
      } else { nodes.set(n.id, n); aliases.set(n.id, n.id); }
    });
    const links = [...base.links];
    discovered.links.forEach(link => {
      const source = aliases.get(link.source) || link.source, target = aliases.get(link.target) || link.target;
      if (nodes.has(source) && nodes.has(target)) links.push({ ...link, id: `discovery:${link.id}`, source, target });
    });
    return { nodes: [...nodes.values()], links };
  }
  let unifiedCacheData = null, unifiedCacheStamp = null, unifiedCacheModel = null;
  function unifiedAtlas() {
    const stamp = DATA.meta?.updatedAt || 'snapshot';
    if (unifiedCacheData !== DATA || unifiedCacheStamp !== stamp || !unifiedCacheModel) {
      unifiedCacheData = DATA; unifiedCacheStamp = stamp;
      unifiedCacheModel = window.UnifiedAtlas.build(DATA);
    }
    return unifiedCacheModel;
  }
  function unifiedWorkspace() {
    DATA.unifiedWorkspace ||= {};
    const workspace = DATA.unifiedWorkspace;
    ['devices', 'connections', 'deletedDevices', 'deletedConnections'].forEach(key => { if (!Array.isArray(workspace[key])) workspace[key] = []; });
    workspace.deviceEdits ||= {}; workspace.connectionEdits ||= {};
    return workspace;
  }
  function filteredUnifiedAtlas() {
    const atlas = unifiedAtlas(), scope = state.unifiedScope;
    let scoped = new Set(atlas.nodes.map(n => n.id));
    if (scope !== 'All') {
      const baseSites = scope === 'DC / NDC' ? new Set(['DC', 'NDC', 'WHIL-DC', 'DR']) : scope === 'WHIL' ? new Set(['WHIL', 'WHIL-DC']) : new Set(['WMTC']);
      scoped = new Set(atlas.nodes.filter(n => baseSites.has(n.site)).map(n => n.id));
      const base = new Set(scoped), byId = new Map(atlas.nodes.map(n => [n.id, n]));
      atlas.links.forEach(link => {
        const source = byId.get(link.source), target = byId.get(link.target);
        if (base.has(link.source) && target?.site === 'External') scoped.add(target.id);
        if (base.has(link.target) && source?.site === 'External') scoped.add(source.id);
        if (scope === 'WMTC' || scope === 'WHIL') {
          if (base.has(link.source) && ['DC', 'NDC', 'WHIL-DC'].includes(target?.site)) scoped.add(target.id);
          if (base.has(link.target) && ['DC', 'NDC', 'WHIL-DC'].includes(source?.site)) scoped.add(source.id);
        }
      });
    }
    const nodes = atlas.nodes.filter(n => scoped.has(n.id) && state.unifiedLayers.has(n.layer));
    const ids = new Set(nodes.map(n => n.id));
    const links = atlas.links.filter(l => ids.has(l.source) && ids.has(l.target));
    return { nodes, links, atlas };
  }

  function truncate(v, n = 30) { const s = txt(v); return s.length > n ? s.slice(0, n - 1) + '…' : s; }
  function liveDeviceForNode(node) {
    if (!state.live.configured || !node) return null;
    const id = node.id.replace(/^ref:/, ''), ips = new Set(node.ips.map(txt).filter(Boolean));
    const names = node.unified ? new Set([node.label, ...(node.aliases || []), ...(node.candidateKeys || [])].map(normName)) : null;
    return state.live.devices.find(d => (names ? names.has(normName(d.hostname)) : normName(d.hostname) === id) || (txt(d.ip) && ips.has(txt(d.ip)))) || null;
  }
  function liveAlertsForNode(node) {
    if (!state.live.configured || !node) return [];
    const id = node.id.replace(/^ref:/, '');
    const names = node.unified ? new Set([node.label, ...(node.aliases || []), ...(node.candidateKeys || [])].map(normName)) : null;
    return state.live.alerts.filter(a => names ? names.has(normName(a.hostname)) : normName(a.hostname) === id);
  }
  function liveMetricForLink(link) {
    if (!state.live.configured) return null;
    const source = link.source.replace(/^ref:/, ''), target = link.target.replace(/^ref:/, '');
    const sourceNames = link.unified ? new Set((link.sourceAliases || []).map(normName)) : null;
    const targetNames = link.unified ? new Set((link.targetAliases || []).map(normName)) : null;
    const candidates = state.live.links.filter(l => {
      const s = normName(l.source), t = normName(l.target);
      if (link.unified) return (sourceNames.has(s) && targetNames.has(t)) || (sourceNames.has(t) && targetNames.has(s));
      return (s === source && t === target) || (s === target && t === source);
    });
    if (!candidates.length) return null;
    const ports = new Set(link.links.flatMap(e => [txt(e.uplinkPort).toLowerCase(), txt(e.neighborPort).toLowerCase(), txt(e.fromPort).toLowerCase(), txt(e.toPort).toLowerCase()]).filter(Boolean));
    const matched = candidates.filter(l => ports.has(txt(l.localPort).toLowerCase()) || ports.has(txt(l.remotePort).toLowerCase()));
    return [...(matched.length ? matched : candidates)].sort((a, b) => (b.utilization || 0) - (a.utilization || 0))[0];
  }
  function formatBps(value) {
    const n = Number(value); if (!Number.isFinite(n)) return '—';
    if (n >= 1e9) return `${(n / 1e9).toFixed(2)} Gbps`;
    if (n >= 1e6) return `${(n / 1e6).toFixed(2)} Mbps`;
    if (n >= 1e3) return `${(n / 1e3).toFixed(1)} Kbps`;
    return `${Math.round(n)} bps`;
  }
  function liveStrip() {
    const live = state.live, down = live.devices.filter(d => d.status === 'down').length;
    const discovered = discoveryBundle().nodes.filter(n => !n.referencedOnly).length;
    return `<section class="live-strip ${live.configured ? 'configured' : 'unconfigured'}"><div class="live-strip-status"><span class="status-dot" style="background:${live.configured ? (live.status === 'error' ? 'var(--red)' : 'var(--green)') : 'var(--faint)'}"></span><div><strong>${live.configured ? `Live monitoring · ${esc(live.status)}` : 'Live API not configured'}</strong><span>${live.configured ? `${live.devices.length} devices · ${down} down · ${live.alerts.length} active alerts · ${discovered} discovered${live.lastSync ? ' · ' + new Date(live.lastSync).toLocaleTimeString() : ''}` : 'Add LibreNMS/Zabbix credentials in .env to enable status, alerts and utilization.'}</span></div></div><button class="button secondary small" data-action="${live.configured ? 'sync-live' : 'open-live'}"><span data-icon="activity"></span>${live.configured ? (state.liveSyncing ? 'Syncing…' : 'Sync now') : 'Setup live'}</button></section>`;
  }
  async function loadLive() {
    try { const response = await fetch('/api/live'); if (response.ok) state.live = await response.json(); } catch { /* offline/file mode */ }
  }
  async function syncLive(silent = false) {
    if (state.liveSyncing) return;
    state.liveSyncing = true;
    try {
      const response = await fetch('/api/live/sync', { method: 'POST' });
      const result = await response.json();
      if (result.live) state.live = result.live;
      if (!state.live.configured) { state.liveSyncing = false; render(); if (!silent) toast('Live API is not configured in .env'); return; }
      if (result.data) { DATA = mergeLiveWorkspace(DATA, result.data); refreshSourceSnapshots(); rebuildAllGraphs(); await persist(); }
      state.liveSyncing = false; render();
      if (!silent) toast(`Live sync complete${state.live.added?.length ? ` · ${state.live.added.length} new device(s)` : ''}${state.live.assigned?.length ? ` · ${state.live.assigned.length} VLAN-assigned` : ''}`);
    } catch (error) { state.liveSyncing = false; if (!silent) toast(`Live sync failed: ${error.message}`); }
  }

  function toast(message) {
    const el = document.getElementById('toast');
    el.textContent = message; el.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
  }
  function statCard(label, value, foot, icon, cls = '') {
    return `<article class="stat-card ${cls}"><div class="stat-label"><span>${esc(label)}</span><span data-icon="${icon}"></span></div><div class="stat-value">${esc(value)}</div><div class="stat-foot">${esc(foot)}</div></article>`;
  }
  function pageHead(kicker, title, description, actions = '') {
    return `<div class="page-head"><div><div class="eyebrow">${esc(kicker)}</div><h1>${esc(title)}</h1><p>${esc(description)}</p></div><div class="head-actions">${actions}</div></div>`;
  }
  function unifiedGraphCard() {
    const model = filteredUnifiedAtlas();
    const scopes = ['All', 'DC / NDC', 'WMTC', 'WHIL'];
    return `<section class="card graph-card unified-graph-card">
      <div class="graph-toolbar">
        <div><strong style="font-size:12px">Unified IP architecture</strong><div style="color:var(--faint);font-size:10px;margin-top:3px">${model.nodes.length} visible canonical devices · ${model.links.length} unique connections</div></div>
        <div class="graph-actions"><button class="button primary small" data-arch-mode="unified">Unified IP map</button><button class="button secondary small" data-arch-mode="register">Register topology</button><button class="button ghost small" data-action="reset-graph">Fit map</button><button class="button secondary small" data-action="export"><span data-icon="download"></span>CSV</button></div>
      </div>
      <div class="graph-subtoolbar"><div class="scope-filters"><span>Scope</span>${scopes.map(scope => `<button class="scope-button ${state.unifiedScope === scope ? 'active' : ''}" data-unified-scope="${esc(scope)}">${esc(scope === 'All' ? 'All infrastructure' : scope)}</button>`).join('')}</div><div class="layer-filters unified-layer-filters">${UNIFIED_LAYERS.map(layer => `<button class="layer-button ${state.unifiedLayers.has(layer) ? 'active' : ''}" data-unified-layer="${esc(layer)}"><i></i>${esc(layer)}</button>`).join('')}</div></div>
      <div class="graph-wrap" id="graphWrap">
        <svg class="graph-svg" id="graphSvg" role="img" aria-label="Unified IP-centric infrastructure architecture"></svg>
        <div class="graph-badge"><span class="status-dot"></span><strong>${esc(state.unifiedScope)}</strong><span>3 sources · canonical IP identity</span></div>
        <div class="focus-banner" id="focusBanner" hidden><span></span><button class="button secondary small" data-action="toggle-focus-mode">Direct only</button><button class="button secondary small" data-action="clear-focus">Clear focus</button></div>
        <div class="zoom-stack"><button class="icon-button" data-zoom="in" aria-label="Zoom in"><span data-icon="plus"></span></button><button class="icon-button" data-zoom="out" aria-label="Zoom out"><span data-icon="minus"></span></button><button class="icon-button" data-zoom="fit" aria-label="Fit graph"><span data-icon="fit"></span></button></div>
      </div>
      <div class="graph-footer"><div class="graph-legend"><span><i style="background:var(--core)"></i>Core / edge</span><span><i style="background:var(--distribution)"></i>Fabric / distribution</span><span><i style="background:var(--access)"></i>Access</span><span><i style="background:var(--amber)"></i>IP conflict</span><span><i class="legend-line"></i>Logical peering dashed</span></div><div class="graph-tip">Backbone layers are shown first · enable more layers or click a device for IP-wise neighbours</div></div>
    </section>`;
  }

  function graphCard(mode = 'architecture') {
    if (mode === 'unified') return unifiedGraphCard();
    const dc = mode === 'dc' || mode === 'dc-devices' || mode === 'dc-core-source';
    const sourceDevices = mode === 'dc-devices', coreSource = mode === 'dc-core-source';
    const deviceCount = sourceDevices ? bundle().dataCenter.filter(e => txt(e.ip) && dcSourceGroup(e)).length : 0;
    const coreRows = coreSource ? coreEvidenceRecords() : [];
    const drawable = coreRows.filter(r => txt(r.fromDevice) && txt(r.toDevice)).length;
    const dcTitle = sourceDevices ? `Data Center Devices · ${deviceCount} IP devices` : coreSource ? `Unified Core links · ${coreRows.length} source rows` : 'Main register topology';
    const dcSubtitle = sourceDevices ? 'Linked source tab · no inferred connections' : coreSource ? `${drawable} resolved · ${coreRows.length - drawable} blank-target gaps · canonical IP identity` : 'Explicit main-register links only';
    const modeButtons = dc ? `<button class="button ${state.dcGraphMode === 'devices' ? 'primary' : 'secondary'} small" data-dc-graph="devices">Source devices</button><button class="button ${state.dcGraphMode === 'core' ? 'primary' : 'secondary'} small" data-dc-graph="core">Core links</button><button class="button ${state.dcGraphMode === 'register' ? 'primary' : 'secondary'} small" data-dc-graph="register">Main register</button>` : '';
    const legend = sourceDevices ? '<span><i style="background:var(--distribution)"></i>NDC</span><span><i style="background:var(--core)"></i>DC</span>' : coreSource ? '<span><i style="background:var(--core)"></i>Core / fabric</span><span><i style="background:var(--distribution)"></i>Distribution</span><span><i style="background:var(--amber)"></i>Partial source</span>' : '<span><i style="background:var(--core)"></i>Core</span><span><i style="background:var(--distribution)"></i>Distribution</span><span><i style="background:var(--access)"></i>Access</span><span><i style="background:var(--amber)"></i>Source gap</span>';
    return `<section class="card graph-card">
      <div class="graph-toolbar">
        ${dc ? `<div><strong style="font-size:12px">${dcTitle}</strong><div style="color:var(--faint);font-size:10px;margin-top:3px">${dcSubtitle}</div></div>` : `<div class="layer-filters">${ALL_LAYERS.map(layer => `<button class="layer-button ${state.layers.has(layer) ? 'active' : ''}" data-layer="${layer}"><i></i>${layer}</button>`).join('')}</div>`}
        <div class="graph-actions">${modeButtons}<button class="button ghost small" data-action="reset-graph">${sourceDevices ? 'Fit devices' : coreSource ? 'Fit core' : dc ? 'Fit register' : 'Full view'}</button><button class="button secondary small" data-action="export"><span data-icon="download"></span>CSV</button></div>
      </div>
      <div class="graph-wrap ${dc ? 'dc-graph' : ''}" id="graphWrap">
        <svg class="graph-svg" id="graphSvg" role="img" aria-label="${sourceDevices ? 'Data Center Devices source inventory' : coreSource ? 'DC NDC and WHIL-DC workbook core port topology' : dc ? 'DC and NDC main-register core topology' : 'Full network topology'}"></svg>
        <div class="graph-badge"><span class="status-dot"></span><strong>${dc ? 'DC / NDC' : state.site}</strong><span>${sourceDevices ? 'linked source devices' : coreSource ? 'canonical IP core architecture' : dc ? 'main-register links' : 'full architecture'}</span></div>
        <div class="focus-banner" id="focusBanner" hidden><span></span><button class="button secondary small" data-action="toggle-focus-mode">Direct only</button><button class="button secondary small" data-action="clear-focus">Clear focus</button></div>
        <div class="zoom-stack"><button class="icon-button" data-zoom="in" aria-label="Zoom in"><span data-icon="plus"></span></button><button class="icon-button" data-zoom="out" aria-label="Zoom out"><span data-icon="minus"></span></button><button class="icon-button" data-zoom="fit" aria-label="Fit graph"><span data-icon="fit"></span></button></div>
      </div>
      <div class="graph-footer"><div class="graph-legend">${legend}</div><div class="graph-tip">Scroll to zoom · drag to pan · click a ${sourceDevices ? 'device for source details' : 'device or link'}</div></div>
    </section>`;
  }

  function render() {
    graphRuntime = null;
    document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.view === state.view));
    document.querySelectorAll('#siteSwitch button').forEach(b => b.classList.toggle('active', b.dataset.site === state.site));
    const viewTitles = { architecture: 'Architecture', live: 'Live Operations', datacenter: 'DC / NDC', connectivity: 'Port Connectivity', ipam: 'IPAM & Peering', dmz: 'DMZ / MZ', records: 'Records' };
    const workbookWide = state.view === 'connectivity' || state.view === 'ipam';
    const unifiedWide = state.view === 'architecture' && state.archMode === 'unified';
    document.getElementById('siteSwitch').hidden = workbookWide || unifiedWide;
    document.title = unifiedWide ? 'Unified IP architecture — NetAtlas' : workbookWide ? `${viewTitles[state.view]} — NetAtlas` : `${state.site} ${viewTitles[state.view] || 'NetAtlas'} — NetAtlas`;
    if (state.view === 'architecture') renderArchitecture();
    else if (state.view === 'live') renderLive();
    else if (state.view === 'datacenter') renderDatacenter();
    else if (state.view === 'connectivity') renderConnectivity();
    else if (state.view === 'ipam') renderIpam();
    else if (state.view === 'dmz') renderDmz();
    else renderRecords();
    hydrateIcons(main);
    handlePendingFocus();
  }

  function unifiedArchitectureFlows(atlas) {
    const byId = new Map(atlas.allNodes.map(n => [n.id, n])), flows = new Map();
    atlas.links.forEach(link => {
      const source = byId.get(link.source), target = byId.get(link.target);
      if (!source || !target) return;
      const key = `${source.layer} → ${target.layer}`;
      flows.set(key, (flows.get(key) || 0) + 1);
    });
    return [...flows.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 6);
  }

  function renderUnifiedArchitecture() {
    const atlas = unifiedAtlas(), s = atlas.stats, flows = unifiedArchitectureFlows(atlas);
    const localChanges = (s.customDevices || 0) + (s.customConnections || 0) + (s.editedDevices || 0) + (s.editedConnections || 0) + (s.deletedDevices || 0) + (s.deletedConnections || 0);
    const actions = `<button class="button secondary" data-arch-mode="register">Register topology</button><button class="button secondary" data-action="add-unified-connection"><span data-icon="link"></span>Add connection</button><button class="button primary" data-action="add-unified-device"><span data-icon="plus"></span>Add device</button><button class="button secondary" data-action="fit-head"><span data-icon="fit"></span>Fit view</button><button class="button secondary" data-action="export"><span data-icon="download"></span>Export IP mapping</button>`;
    main.innerHTML = `
      ${pageHead('THREE SOURCES · ONE NETWORK MODEL', 'Unified infrastructure architecture', 'IP-led identity across the main register, DataCenter inventory and peering workbook. Best names are display labels; shared-IP and physical-member conflicts are preserved.', actions)}
      <section class="stats-grid four">
        ${statCard('CANONICAL DEVICES', s.devices, `${s.mergedDuplicates} duplicates merged · ${localChanges} local workspace changes`, 'devices', 'violet')}
        ${statCard('UNIQUE CONNECTIONS', s.connections, `${s.evidenceRows} explicit evidence rows grouped bidirectionally`, 'link', 'green')}
        ${statCard('IP-MAPPED ENDPOINTS', s.ipMappedEndpoints, 'IP first, then canonical alias; no blank-target invention', 'info')}
        ${statCard('SHARED-IP CONFLICTS', s.ipConflicts, `${s.unresolvedRows} incomplete or unresolved source rows retained`, 'alert', s.ipConflicts ? 'gap' : '')}
      </section>
      ${liveStrip()}
      ${graphCard('unified')}
      <section class="card subsection-card">
        <div class="subsection-head"><div><h2>Architecture flow</h2><p>Unique canonical-device connections by infrastructure layer—not worksheet rows.</p></div><span class="badge role">${s.mergeDecisions} identity decisions</span></div>
        <div class="architecture-flow">${flows.map(([name, count]) => `<div class="flow-item"><span>${esc(name)}</span><strong>${count}</strong><small>unique links</small></div>`).join('')}</div>
        <div class="unified-policy"><span data-icon="info"></span><div><strong>Identity safeguard:</strong> inventory, management, loopback and device-peering IPs drive merges. VIP/Standby values do not. Different physical 01/02 members stay separate; port rows support connection mapping rather than forcing unsafe identity unions.</div></div>
      </section>`;
    initGraph('unified');
  }

  function renderArchitecture() {
    if (state.archMode === 'unified') return renderUnifiedArchitecture();
    const b = bundle(), s = b.stats;
    const uniqueRoles = Object.fromEntries(ALL_LAYERS.map(role => [role, b.nodes.filter(n => n.role === role && !n.referencedOnly).length]));
    const gapNodes = b.nodes.filter(n => n.gapRows.length);
    const actions = `<button class="button secondary" data-arch-mode="unified">Unified IP map</button><button class="button primary" data-action="add-device"><span data-icon="plus"></span>Add device</button><button class="button secondary" data-action="fit-head"><span data-icon="fit"></span>Fit view</button><button class="button secondary" data-action="export"><span data-icon="download"></span>Export CSV</button>`;
    main.innerHTML = `
      ${pageHead('WORKBOOK NETWORK MODEL', `${state.site} architecture`, 'Core → Distribution → Access, with every documented register connection and visible source gaps.', actions)}
      <section class="stats-grid">
        ${statCard('REGISTER DEVICES', s.devices, `${uniqueRoles.Core} Core · ${uniqueRoles.Distribution} Distribution · ${uniqueRoles.Access} Access`, 'devices', 'violet')}
        ${statCard('DOCUMENTED LINKS', s.documentedLinks, `${s.aggregatedLinks} drawn after parallel-link grouping`, 'link', 'green')}
        ${statCard('SOURCE ROWS', s.rows, `${s.roles.Core} Core · ${s.roles.Distribution} Distribution · ${s.roles.Access} Access`, 'rows')}
        ${statCard('SOURCE GAPS', s.sourceGaps, `${gapNodes.length} devices with blank raw neighbour`, 'alert', 'gap')}
        ${statCard('REFERENCED ONLY', s.referenced, 'Neighbour names without a local register row', 'info')}
      </section>
      ${liveStrip()}
      ${graphCard('architecture')}
      <section class="card subsection-card">
        <div class="subsection-head"><div><h2>Source-gap register</h2><p>Blank Neighbor Device cells remain unconnected in the graph.</p></div><button class="button ghost small" data-action="view-gaps">Open all ${s.sourceGaps} rows</button></div>
        <div class="gap-summary"><div class="gap-callout"><strong><span data-icon="alert"></span>No inferred connections</strong><p>Amber dashed devices have at least one source row with no raw neighbour. Port, VLAN or serial fields—if present—are still preserved in the detail drawer.</p></div><div class="gap-chips">${gapNodes.slice(0, 10).map(n => `<button class="gap-chip" data-focus-node="${esc(n.id)}">${esc(truncate(n.label, 36))}</button>`).join('')}${gapNodes.length > 10 ? `<button class="gap-chip" data-action="view-gaps">+${gapNodes.length - 10} more</button>` : ''}</div></div>
      </section>`;
    main.querySelectorAll('[data-layer]').forEach(btn => btn.addEventListener('click', () => {
      const layer = btn.dataset.layer;
      if (state.layers.has(layer) && state.layers.size === 1) { toast('Keep at least one architecture layer visible.'); return; }
      state.layers.has(layer) ? state.layers.delete(layer) : state.layers.add(layer);
      render();
    }));
    initGraph('architecture');
  }

  function graphModel(mode) {
    if (mode === 'unified') return filteredUnifiedAtlas();
    if (mode === 'dc-core-source') return coreEvidenceGraph();
    if (mode === 'dc-devices') {
      const nodes = bundle().dataCenter.filter(e => txt(e.ip) && dcSourceGroup(e)).map(e => ({
        id: e.id, label: txt(e.node), role: 'Datacenter', roles: ['Datacenter'], side: e.side, sourceGroup: dcSourceGroup(e),
        zone: e.side, zones: [e.side], model: null, models: [], serial: null, serials: [],
        ip: txt(e.ip), ips: [txt(e.ip)], buildingVlan: e.vlan ?? e.zone ?? null,
        buildingVlans: txt(e.vlan ?? e.zone) ? [e.vlan ?? e.zone] : [],
        floor: null, floors: [], rows: [], referencedRows: [], gapRows: [], referencedOnly: false,
        parentHint: null, rootHint: null, rootKey: null,
      }));
      return { nodes, links: [] };
    }
    const b = combinedGraph();
    let nodes, links;
    if (mode === 'dc') {
      const coreIds = new Set(b.nodes.filter(n => n.role === 'Core').map(n => n.id));
      const ids = new Set(coreIds);
      b.links.forEach(l => {
        if (coreIds.has(l.source) && nodeById(l.target)?.referencedOnly) ids.add(l.target);
        if (coreIds.has(l.target) && nodeById(l.source)?.referencedOnly) ids.add(l.source);
      });
      nodes = b.nodes.filter(n => ids.has(n.id));
      links = b.links.filter(l => ids.has(l.source) && ids.has(l.target));
    } else {
      nodes = b.nodes.filter(n => state.layers.has(n.role));
      const ids = new Set(nodes.map(n => n.id));
      links = b.links.filter(l => ids.has(l.source) && ids.has(l.target));
    }
    return { nodes, links };
  }

  function dcSourceGroup(entry) {
    const side = entry.side, key = normName(entry.node);
    if (side === 'DC' && (key === 'DC-NOC-SW' || key === 'DC-NOC-SWITCH' || key === 'DC-ACC-SW' || key.startsWith('DC-ACC-SW-'))) return null;
    if (side === 'NDC' && key.startsWith('NDC-NOC-ROOM')) return 'NDC_NOC';
    if (side === 'NDC' && (key === 'F5' || key.startsWith('F5-'))) return 'NDC_F5';
    if (side === 'NDC' && (key.startsWith('DR-') || key === 'NDC-FMC-INFRASTRUCTURE' || key === 'NDC-CORPORATE-SERVICE')) return 'NDC_DR';
    const match = key.match(/-(0[123]|[123])(?:-CIMC)?(?:[^0-9]*)$/);
    const number = match ? String(Number(match[1])) : null;
    const rack2 = key.includes('APIC') ? number === '3' : number === '2';
    return `${side}_${rack2 ? 'RACK_2' : 'RACK_1'}`;
  }
  function dcSourceGroupName(group) {
    return ({ DC_RACK_1: 'DC · Rack 1', DC_RACK_2: 'DC · Rack 2', NDC_RACK_1: 'NDC · Rack 1', NDC_RACK_2: 'NDC · Rack 2', NDC_NOC: 'NDC · NOC', NDC_F5: 'NDC · F5', NDC_DR: 'NDC · DR devices' })[group] || 'Source entry';
  }

  const CORE_SOURCE_SHEETS = new Set(['DC BackBone', 'NDC BackBone', 'DC Core-Distribution', 'WHIL-DC Port Maping']);
  function coreEvidenceRecords() {
    return (DATA.connectivity?.links || []).filter(r => CORE_SOURCE_SHEETS.has(r.sourceSheet));
  }
  function coreEvidenceGraph() {
    const atlas = unifiedAtlas(), records = coreEvidenceRecords(), recordIds = new Set(records.map(r => r.id)), recordById = new Map(records.map(r => [r.id, r]));
    const links = atlas.links.filter(link => link.links.some(row => recordIds.has(row.id)));
    const nodes = new Map(), resolvedIds = new Set();
    const canonicalForName = name => {
      const key = window.UnifiedAtlas.nameKey(name);
      return key ? atlas.allNodes.find(n => n.candidateKeys.includes(key)) : null;
    };
    const groupFor = node => ['DC', 'NDC', 'WHIL-DC', 'WMTC'].includes(node.site) ? node.site : node.layer === 'External' || node.site === 'External' ? 'ISP / External' : 'Other';
    const ensureNode = node => {
      if (!node) return null;
      if (!nodes.has(node.id)) nodes.set(node.id, { ...node, rows: [], referencedRows: [], gapRows: [], coreGroup: groupFor(node), side: node.site === 'DC' || node.site === 'NDC' ? node.site : null });
      return nodes.get(node.id);
    };
    const addUnique = (list, value) => { if (list && value && !list.includes(value)) list.push(value); };
    links.forEach(link => {
      const source = ensureNode(atlas.allNodes.find(n => n.id === link.source)), target = ensureNode(atlas.allNodes.find(n => n.id === link.target));
      link.links.filter(row => recordIds.has(row.id)).forEach(row => {
        resolvedIds.add(row.id);
        const original = recordById.get(row.id), from = canonicalForName(row.fromName), to = canonicalForName(row.toName);
        const fromNode = from && nodes.has(from.id) ? nodes.get(from.id) : source;
        const toNode = to && nodes.has(to.id) ? nodes.get(to.id) : target;
        addUnique(fromNode?.rows, row.id); addUnique(toNode?.referencedRows, row.id);
        if (original?.partial) { addUnique(fromNode?.gapRows, row.id); addUnique(toNode?.gapRows, row.id); }
      });
    });
    atlas.unresolved.filter(row => recordIds.has(row.id)).forEach(row => {
      const from = ensureNode(canonicalForName(row.fromName)), to = canonicalForName(row.toName);
      addUnique(from?.rows, row.id); addUnique(from?.gapRows, row.id);
      if (to && nodes.has(to.id)) { addUnique(nodes.get(to.id).referencedRows, row.id); addUnique(nodes.get(to.id).gapRows, row.id); }
    });
    return {
      nodes: [...nodes.values()].sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true })),
      links, records,
      drawableRows: records.filter(r => resolvedIds.has(r.id)).length,
      blankTargets: records.filter(r => !txt(r.toDevice)).length,
      unified: true,
    };
  }

  function dcGroup(n) {
    if (n.side === 'DC' || n.side === 'NDC') return n.side;
    if (n.referencedOnly) return 'Referenced';
    const zones = (n.zones.length ? n.zones : [n.zone]).map(txt).join(' ').toUpperCase();
    if (zones.includes('NDC') || txt(n.label).toUpperCase().startsWith('NDC')) return 'NDC';
    return 'DC';
  }

  function layoutDcSource(nodes) {
    const nodeW = 230, nodeH = 54, colGap = 18, rowGap = 14, lanePad = 18, laneHead = 50, laneGap = 18, sectionGap = 28;
    const laneW = 2 * nodeW + colGap + lanePad * 2;
    const groups = {};
    nodes.forEach(n => { (groups[n.sourceGroup] ||= []).push(n); });
    Object.values(groups).forEach(list => list.sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true })));
    const positions = {}, lanes = [];
    const sections = [
      { x: 20, groups: ['DC_RACK_1', 'DC_RACK_2'] },
      { x: 20 + laneW + sectionGap, groups: ['NDC_RACK_1', 'NDC_RACK_2', 'NDC_NOC', 'NDC_F5', 'NDC_DR'] },
    ];
    let maxH = 100;
    sections.forEach(section => {
      let y = 10;
      section.groups.forEach(group => {
        const list = groups[group] || [];
        if (!list.length) return;
        const rows = Math.ceil(list.length / 2), laneH = laneHead + rows * (nodeH + rowGap) + lanePad;
        list.forEach((n, i) => {
          const col = i % 2, row = Math.floor(i / 2);
          positions[n.id] = { x: section.x + lanePad + col * (nodeW + colGap), y: y + laneHead + row * (nodeH + rowGap), w: nodeW, h: nodeH, node: n };
        });
        lanes.push({ name: dcSourceGroupName(group), x: section.x, y, w: laneW, h: laneH, count: list.length, alt: lanes.length % 2 });
        y += laneH + laneGap;
      });
      maxH = Math.max(maxH, y + 10);
    });
    return { positions, lanes, accessGroups: [], width: 20 + laneW * 2 + sectionGap + 20, height: maxH, nodeW, nodeH };
  }

  function layoutCoreEvidence(nodes) {
    const order = ['DC', 'NDC', 'WHIL-DC', 'WMTC', 'ISP / External', 'Other'];
    const nodeW = 230, nodeH = 54, colGap = 18, rowGap = 14, lanePad = 18, laneHead = 50, laneGap = 18;
    const positions = {}, lanes = [];
    let x = 20, maxH = 100;
    order.forEach((name, groupIndex) => {
      const list = nodes.filter(n => n.coreGroup === name).sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
      if (!list.length) return;
      const cols = name === 'ISP / External' ? 1 : 2;
      const laneW = cols * nodeW + (cols - 1) * colGap + lanePad * 2;
      const rows = Math.ceil(list.length / cols), laneH = laneHead + rows * (nodeH + rowGap) + lanePad;
      list.forEach((n, i) => {
        const col = i % cols, row = Math.floor(i / cols);
        positions[n.id] = { x: x + lanePad + col * (nodeW + colGap), y: 10 + laneHead + row * (nodeH + rowGap), w: nodeW, h: nodeH, node: n };
      });
      lanes.push({ name, x, y: 10, w: laneW, h: laneH, count: list.length, alt: groupIndex % 2 });
      x += laneW + laneGap; maxH = Math.max(maxH, laneH + 20);
    });
    return { positions, lanes, accessGroups: [], width: Math.max(x + 2, 500), height: maxH, nodeW, nodeH };
  }

  function layoutUnified(nodes) {
    const nodeW = 230, nodeH = 54, colGap = 18, rowGap = 14, lanePad = 18, laneHead = 50, laneGap = 18;
    const columnPlan = { External: 1, 'WAN / Edge': 2, Core: 2, Fabric: 2, Services: 3, Distribution: 3, Access: 4, Management: 2, Other: 2 };
    const positions = {}, lanes = [];
    let x = 20, maxH = 100;
    UNIFIED_LAYERS.forEach((name, groupIndex) => {
      const list = nodes.filter(n => n.layer === name).sort((a, b) => txt(a.site).localeCompare(txt(b.site)) || b.degree - a.degree || a.label.localeCompare(b.label, undefined, { numeric: true }));
      if (!list.length) return;
      const cols = Math.max(1, Math.min(columnPlan[name] || 2, list.length));
      const laneW = cols * nodeW + (cols - 1) * colGap + lanePad * 2;
      const rows = Math.ceil(list.length / cols), laneH = laneHead + rows * (nodeH + rowGap) + lanePad;
      list.forEach((n, i) => {
        const col = i % cols, row = Math.floor(i / cols);
        positions[n.id] = { x: x + lanePad + col * (nodeW + colGap), y: 10 + laneHead + row * (nodeH + rowGap), w: nodeW, h: nodeH, node: n };
      });
      lanes.push({ name, x, y: 10, w: laneW, h: laneH, count: list.length, alt: groupIndex % 2 });
      x += laneW + laneGap; maxH = Math.max(maxH, laneH + 20);
    });
    return { positions, lanes, accessGroups: [], width: Math.max(x + 2, 500), height: maxH, nodeW, nodeH };
  }

  function layoutGraph(nodes, mode) {
    if (mode === 'unified') return layoutUnified(nodes);
    if (mode === 'dc-devices') return layoutDcSource(nodes);
    if (mode === 'dc-core-source') return layoutCoreEvidence(nodes);
    const dcLayout = mode === 'dc' || mode === 'dc-devices';
    const groupNames = dcLayout ? (mode === 'dc-devices' ? ['DC', 'NDC'] : ['DC', 'NDC', 'Referenced']) : ALL_LAYERS;
    const groups = Object.fromEntries(groupNames.map(g => [g, []]));
    nodes.forEach(n => groups[dcLayout ? dcGroup(n) : n.role].push(n));
    const sorters = {
      Core: (a, b) => txt(a.zone).localeCompare(txt(b.zone)) || a.label.localeCompare(b.label),
      Distribution: (a, b) => txt(a.floor).localeCompare(txt(b.floor)) || a.label.localeCompare(b.label),
      Access: (a, b) => txt(a.rootHint).localeCompare(txt(b.rootHint)) || txt(a.parentHint).localeCompare(txt(b.parentHint)) || a.label.localeCompare(b.label),
      Discovered: (a, b) => a.label.localeCompare(b.label),
      Referenced: (a, b) => a.label.localeCompare(b.label),
      DC: (a, b) => a.label.localeCompare(b.label), NDC: (a, b) => a.label.localeCompare(b.label),
    };
    const nodeW = 230, nodeH = 54, colGap = 18, rowGap = 14, lanePad = 18, laneHead = 50, laneGap = 18;
    let x = 20, maxH = 100;
    const positions = {}, lanes = [], accessGroups = [];
    groupNames.forEach((name, groupIndex) => {
      const list = groups[name].sort(sorters[name] || sorters.Referenced);
      if (!list.length) return;
      let cols = name === 'Access' ? 3 : name === 'Referenced' ? 1 : name === 'DC' ? 3 : 2;
      if (mode === 'dc-devices' && (name === 'DC' || name === 'NDC')) cols = 3;
      cols = Math.max(1, Math.min(cols, list.length));
      const laneW = cols * nodeW + (cols - 1) * colGap + lanePad * 2;
      let laneH;
      if (name === 'Access') {
        const byRoot = {};
        list.forEach(n => { const root = n.rootHint || 'Unassigned / source gap'; (byRoot[root] ||= []).push(n); });
        let cursorY = 10 + laneHead;
        Object.keys(byRoot).sort((a, b) => (a.startsWith('Unassigned') - b.startsWith('Unassigned')) || a.localeCompare(b)).forEach(root => {
          const branch = byRoot[root].sort((a, b) => txt(a.parentHint).localeCompare(txt(b.parentHint)) || a.label.localeCompare(b.label));
          accessGroups.push({ x: x + 10, y: cursorY, w: laneW - 20, label: root, count: branch.length });
          cursorY += 24;
          branch.forEach((n, i) => {
            const col = i % cols, row = Math.floor(i / cols);
            positions[n.id] = { x: x + lanePad + col * (nodeW + colGap), y: cursorY + row * (nodeH + rowGap), w: nodeW, h: nodeH, node: n };
          });
          cursorY += Math.ceil(branch.length / cols) * (nodeH + rowGap) + 12;
        });
        laneH = cursorY - 10 + lanePad;
      } else {
        const rows = Math.ceil(list.length / cols);
        laneH = laneHead + rows * (nodeH + rowGap) + lanePad;
        list.forEach((n, i) => {
          const col = i % cols, row = Math.floor(i / cols);
          positions[n.id] = { x: x + lanePad + col * (nodeW + colGap), y: 10 + laneHead + row * (nodeH + rowGap), w: nodeW, h: nodeH, node: n };
        });
      }
      lanes.push({ name, x, y: 10, w: laneW, h: laneH, count: list.length, alt: groupIndex % 2 });
      x += laneW + laneGap; maxH = Math.max(maxH, laneH + 20);
    });
    return { positions, lanes, accessGroups, width: Math.max(x + 2, 500), height: maxH, nodeW, nodeH };
  }

  function edgeGeometry(link, positions) {
    const a = positions[link.source], b = positions[link.target];
    if (!a || !b) return null;
    const ay = a.y + a.h / 2, by = b.y + b.h / 2;
    if (a === b) {
      const sx = a.x + a.w - 42, tx = sx;
      return { d: `M ${sx} ${a.y + 5} C ${a.x + a.w + 65} ${a.y - 35}, ${a.x + a.w + 65} ${a.y + a.h + 35}, ${tx} ${a.y + a.h - 5}`, mx: a.x + a.w + 38, my: a.y + a.h / 2 };
    }
    let sx, tx, d;
    if (b.x > a.x + 10) {
      sx = a.x + a.w; tx = b.x;
      const dx = Math.max(55, Math.abs(tx - sx) * .42);
      d = `M ${sx} ${ay} C ${sx + dx} ${ay}, ${tx - dx} ${by}, ${tx} ${by}`;
    } else if (b.x < a.x - 10) {
      sx = a.x; tx = b.x + b.w;
      const dx = Math.max(55, Math.abs(tx - sx) * .42);
      d = `M ${sx} ${ay} C ${sx - dx} ${ay}, ${tx + dx} ${by}, ${tx} ${by}`;
    } else {
      sx = a.x + a.w; tx = b.x + b.w;
      d = `M ${sx} ${ay} C ${sx + 85} ${ay}, ${tx + 85} ${by}, ${tx} ${by}`;
    }
    return { d, mx: (sx + tx) / 2 + (Math.abs(b.x - a.x) < 10 ? 38 : 0), my: (ay + by) / 2 };
  }

  function initGraph(mode) {
    const svg = document.getElementById('graphSvg');
    const wrap = document.getElementById('graphWrap');
    if (!svg || !wrap) return;
    const { nodes, links } = graphModel(mode);
    const layout = layoutGraph(nodes, mode);
    const laneSvg = layout.lanes.map(l => `<g><rect class="lane-bg ${l.alt ? 'alt' : ''}" x="${l.x}" y="${l.y}" width="${l.w}" height="${l.h}" rx="12"/><text class="lane-title" x="${l.x + 18}" y="${l.y + 23}">${esc(l.name.toUpperCase())}</text><text class="lane-count" x="${l.x + 18}" y="${l.y + 38}">${l.count} ${l.count === 1 ? 'device' : 'devices'}</text></g>`).join('');
    const accessGroupSvg = (layout.accessGroups || []).map(g => `<g class="access-group"><rect x="${g.x}" y="${g.y}" width="${g.w}" height="20" rx="5"/><text x="${g.x + 9}" y="${g.y + 14}">${esc(g.label)} · ${g.count} devices</text></g>`).join('');
    const linkSvg = links.map(link => {
      const g = edgeGeometry(link, layout.positions);
      if (!g) return '';
      const role = (layout.positions[link.source].node.role || 'referenced').toLowerCase();
      const badge = link.count > 1 ? `<g data-link-id="${esc(link.id)}" class="link-badge" style="cursor:pointer"><rect class="link-count" x="${g.mx - 14}" y="${g.my - 8}" width="28" height="16" rx="7"/><text class="link-count-text" x="${g.mx}" y="${g.my + 3}" text-anchor="middle">×${link.count}</text></g>` : '';
      const metric = liveMetricForLink(link), utilClass = metric?.utilization >= 85 ? 'util-high' : metric?.utilization >= 60 ? 'util-warn' : '';
      const vlanAssigned = link.inferred || link.links.some(edge => edge.discoveryAssignment === 'third-octet');
      const logical = link.unified && link.types?.length && link.types.every(type => type === 'IP peering' || type === 'ISP peering');
      const metricBadge = metric ? `<g data-link-id="${esc(link.id)}" class="link-badge link-metric" style="cursor:pointer"><rect class="link-count" x="${g.mx - 24}" y="${g.my + (link.count > 1 ? 10 : -8)}" width="48" height="16" rx="7"/><text class="link-count-text" x="${g.mx}" y="${g.my + (link.count > 1 ? 21 : 3)}" text-anchor="middle">${metric.utilization === null ? '—' : metric.utilization.toFixed(1) + '%'}</text></g>` : '';
      return `<path class="graph-link ${role} ${utilClass} ${vlanAssigned ? 'vlan-assigned' : ''} ${logical ? 'logical' : ''}" data-link-id="${esc(link.id)}" d="${g.d}" marker-end="url(#graphArrow)"/><path class="link-hit" data-link-id="${esc(link.id)}" d="${g.d}"/>${badge}${metricBadge}`;
    }).join('');
    const nodeSvg = nodes.map(n => {
      const p = layout.positions[n.id];
      const role = (n.role || 'Referenced').toLowerCase();
      const sub = n.referencedOnly ? 'Referenced neighbour only' : n.unified ? `${show(n.primaryIp, 'No IP recorded')}${n.mergedCount ? ` · +${n.mergedCount} aliases` : ''}` : show(n.ip, show(n.zone, 'No IP recorded'));
      const live = liveDeviceForNode(n), alerts = liveAlertsForNode(n);
      return `<g class="node role-${role} ${n.side ? `side-${n.side.toLowerCase()}` : ''} ${n.gapRows.length ? 'has-gap' : ''} ${n.conflict ? 'has-conflict' : ''} ${live ? `live-${live.status}` : ''}" data-node-id="${esc(n.id)}" ${n.sourceGroup ? `data-dc-group="${esc(n.sourceGroup)}"` : ''} transform="translate(${p.x},${p.y})"><title>${esc(n.label)}${n.ip ? ' · ' + esc(n.ip) : ''}${n.mergedCount ? ` · ${n.mergedCount} merged aliases` : ''}${n.conflict ? ' · shared-IP conflict preserved' : ''}${live ? ` · LibreNMS ${live.status}` : ''}</title><rect class="node-box" width="${p.w}" height="${p.h}" rx="8"/><rect class="node-stripe" width="3" height="${p.h - 12}" x="0" y="6" rx="1.5"/><text class="node-title" x="13" y="22">${esc(truncate(n.label, 31))}</text><text class="node-sub" x="13" y="39">${esc(truncate(sub, 34))}</text>${n.conflict || n.gapRows.length ? '<circle class="node-gap-mark" cx="216" cy="12" r="8"/><text class="node-gap-text" x="216" y="15" text-anchor="middle">!</text>' : ''}${n.referencedOnly ? '<circle class="node-ref-mark" cx="216" cy="13" r="3"/>' : ''}${live ? `<circle class="live-status ${live.status}" cx="216" cy="42" r="5"><title>LibreNMS: ${esc(live.status)}</title></circle>` : ''}${alerts.length ? `<g class="node-alert"><rect x="178" y="5" width="26" height="15" rx="6"/><text x="191" y="15" text-anchor="middle">${alerts.length}</text><title>${alerts.length} active alert(s)</title></g>` : ''}</g>`;
    }).join('');
    // Keep SVG user units equal to CSS pixels; fit/pan/zoom is managed explicitly.
    svg.removeAttribute('viewBox');
    svg.innerHTML = `<defs><marker id="graphArrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M 0 1 L 8 5 L 0 9 z" fill="#7891aa" opacity=".75"/></marker></defs><g id="graphViewport">${laneSvg}${accessGroupSvg}<g class="links-layer">${linkSvg}</g><g class="nodes-layer">${nodeSvg}</g></g>${nodes.length ? '' : '<text x="40" y="70" fill="#8fa2ba">No visible devices. Enable a layer to continue.</text>'}`;
    const viewport = svg.querySelector('#graphViewport');
    const view = { scale: 1, tx: 0, ty: 0 };
    const apply = () => viewport.setAttribute('transform', `translate(${view.tx} ${view.ty}) scale(${view.scale})`);
    const fit = () => {
      const cw = wrap.clientWidth || 900, ch = wrap.clientHeight || 600;
      const scale = Math.max(.12, Math.min(1, Math.min((cw - 34) / layout.width, (ch - 34) / layout.height)));
      view.scale = scale; view.tx = (cw - layout.width * scale) / 2; view.ty = (ch - layout.height * scale) / 2; apply();
    };
    const zoomAt = (factor, cx = wrap.clientWidth / 2, cy = wrap.clientHeight / 2) => {
      const next = Math.max(.12, Math.min(3, view.scale * factor));
      const actual = next / view.scale;
      view.tx = cx - (cx - view.tx) * actual; view.ty = cy - (cy - view.ty) * actual; view.scale = next; apply();
    };
    const focusBanner = document.getElementById('focusBanner');
    const clearFocus = () => {
      state.focusedNodeId = null;
      svg.classList.remove('focus-active');
      svg.querySelectorAll('.node,.graph-link,.link-badge').forEach(el => el.classList.remove('selected', 'neighbor', 'dimmed', 'highlighted'));
      if (focusBanner) focusBanner.hidden = true;
    };
    const focusNeighborhood = id => {
      state.focusedNodeId = id;
      const connected = new Set([id]);
      if (state.focusMode === 'branch') {
        const downstream = [id], downstreamSeen = new Set([id]);
        while (downstream.length) {
          const current = downstream.shift();
          links.filter(l => l.target === current).forEach(l => {
            if (!downstreamSeen.has(l.source)) { downstreamSeen.add(l.source); downstream.push(l.source); connected.add(l.source); }
          });
        }
        const upstream = [id], upstreamSeen = new Set([id]);
        while (upstream.length) {
          const current = upstream.shift();
          links.filter(l => l.source === current).forEach(l => {
            if (!upstreamSeen.has(l.target)) { upstreamSeen.add(l.target); upstream.push(l.target); connected.add(l.target); }
          });
        }
      } else {
        links.forEach(link => {
          if (link.source === id) connected.add(link.target);
          if (link.target === id) connected.add(link.source);
        });
      }
      svg.classList.add('focus-active');
      svg.querySelectorAll('.node').forEach(el => {
        const nodeId = el.dataset.nodeId;
        el.classList.toggle('selected', nodeId === id);
        el.classList.toggle('neighbor', nodeId !== id && connected.has(nodeId));
        el.classList.toggle('dimmed', !connected.has(nodeId));
      });
      svg.querySelectorAll('.graph-link,.link-badge').forEach(el => {
        const link = links.find(item => item.id === el.dataset.linkId);
        const active = link && (state.focusMode === 'branch' ? connected.has(link.source) && connected.has(link.target) : link.source === id || link.target === id);
        el.classList.toggle('highlighted', Boolean(active));
        el.classList.toggle('dimmed', !active);
      });
      if (focusBanner) {
        const count = Math.max(0, connected.size - 1), modeLabel = state.focusMode === 'branch' ? 'branch devices' : 'direct connections';
        focusBanner.querySelector('span').textContent = `${layout.positions[id]?.node.label || id} · ${count} ${modeLabel}`;
        focusBanner.querySelector('[data-action="toggle-focus-mode"]').textContent = state.focusMode === 'branch' ? 'Direct only' : 'Full branch';
        focusBanner.hidden = false;
      }
    };
    const centerOnNode = (id, open = true) => {
      const p = layout.positions[id];
      if (!p) { toast('Device is hidden by the current layer filter.'); return; }
      view.scale = 1;
      view.tx = wrap.clientWidth / 2 - (p.x + p.w / 2) * view.scale;
      view.ty = wrap.clientHeight / 2 - (p.y + p.h / 2) * view.scale; apply();
      if (mode !== 'dc-devices') focusNeighborhood(id);
      if (open) {
        if (mode === 'dc-devices') openEntry('dc', id);
        else if (mode === 'dc-core-source') openUnifiedNode(id);
        else if (mode === 'unified') openUnifiedNode(id);
        else openNode(id);
      }
    };
    svg.querySelectorAll('.node').forEach(el => el.addEventListener('click', e => {
      e.stopPropagation();
      if (mode === 'dc-devices') openEntry('dc', el.dataset.nodeId);
      else if (mode === 'dc-core-source') { focusNeighborhood(el.dataset.nodeId); openUnifiedNode(el.dataset.nodeId); }
      else if (mode === 'unified') { focusNeighborhood(el.dataset.nodeId); openUnifiedNode(el.dataset.nodeId); }
      else { focusNeighborhood(el.dataset.nodeId); openNode(el.dataset.nodeId); }
    }));
    svg.querySelectorAll('[data-link-id]').forEach(el => el.addEventListener('click', e => {
      e.stopPropagation();
      if (mode === 'dc-core-source') openUnifiedLink(el.dataset.linkId);
      else if (mode === 'unified') openUnifiedLink(el.dataset.linkId);
      else openLink(el.dataset.linkId);
    }));
    wrap.querySelectorAll('[data-zoom]').forEach(btn => btn.addEventListener('click', () => {
      if (btn.dataset.zoom === 'in') zoomAt(1.25); else if (btn.dataset.zoom === 'out') zoomAt(.8); else fit();
    }));
    svg.addEventListener('wheel', e => {
      e.preventDefault(); const rect = wrap.getBoundingClientRect();
      zoomAt(e.deltaY < 0 ? 1.12 : .89, e.clientX - rect.left, e.clientY - rect.top);
    }, { passive: false });
    let pan = null;
    svg.addEventListener('pointerdown', e => {
      if (e.target.closest('.node,.link-hit,.link-badge')) return;
      pan = { x: e.clientX, y: e.clientY, tx: view.tx, ty: view.ty };
      svg.classList.add('panning'); svg.setPointerCapture(e.pointerId);
    });
    svg.addEventListener('pointermove', e => {
      if (!pan) return; view.tx = pan.tx + e.clientX - pan.x; view.ty = pan.ty + e.clientY - pan.y; apply();
    });
    const stopPan = () => { pan = null; svg.classList.remove('panning'); };
    svg.addEventListener('pointerup', stopPan); svg.addEventListener('pointercancel', stopPan);
    graphRuntime = { fit, centerOnNode, clearFocus, focusNeighborhood, zoomAt, mode, layout };
    requestAnimationFrame(fit);
  }

  function openDrawer(html) {
    drawer.innerHTML = html; hydrateIcons(drawer);
    drawer.classList.add('open'); drawer.setAttribute('aria-hidden', 'false'); drawerBackdrop.hidden = false;
  }
  function closeDrawer() { drawer.classList.remove('open'); drawer.setAttribute('aria-hidden', 'true'); drawerBackdrop.hidden = true; }
  function detailField(label, value, wide = false, mono = false) {
    return `<div class="detail-field ${wide ? 'wide' : ''}"><label>${esc(label)}</label><div class="${mono ? 'mono' : ''}">${esc(show(value))}</div></div>`;
  }
  function connectionCard(row) {
    const noLink = !txt(row.neighbor), gap = noLink && !row.noLinkExpected;
    const autoAssigned = row.discovery?.assignment === 'third-octet';
    const title = noLink ? (row.noLinkExpected ? 'No discovered link' : 'Source gap') : truncate(row.neighbor, 35);
    const meta = autoAssigned
      ? `LibreNMS IP third octet / VLAN <strong>${esc(row.discovery.vlan)}</strong> uniquely matched Distribution <strong>${esc(row.discovery.assignedDistribution)}</strong>. ${row.discovery.inferredNeighbor ? 'No matching port-level link was returned; this dashed link represents the VLAN assignment rule.' : `Matching LibreNMS ports: ${esc(show(row.uplinkPort))} → ${esc(show(row.neighborPort))}`}`
      : row.noLinkExpected ? `LibreNMS third-octet assignment: ${esc(row.discovery?.assignmentStatus || 'unmatched')}. This device remains in the Discovered layer.` : gap ? 'Neighbor Device is blank in the workbook. No link was created.' : `Ports: ${esc(show(row.uplinkPort))} → ${esc(show(row.neighborPort))}<br>VLAN: ${esc(show(row.localVlan))} / ${esc(show(row.neighborVlan))}`;
    const badge = autoAssigned ? `AUTO VLAN ${row.discovery.vlan}` : `Row ${row.row ?? 'NEW'}`;
    return `<div class="connection-card ${gap ? 'gap' : ''}"><div class="connection-top"><span>${esc(truncate(row.device, 35))} → ${esc(title)}</span><span class="badge ${gap ? 'gap' : 'role'}">${esc(badge)}</span></div><div class="connection-meta">${meta}</div>${txt(row.path) ? `<div class="connection-path">${esc(row.path)}</div>` : ''}</div>`;
  }

  function unifiedEvidenceCard(row) {
    const fromIp = txt(row.fromIp), toIp = txt(row.toIp);
    const from = txt(row.fromName) || (fromIp && fromIp.toUpperCase() !== 'N/A' ? fromIp : 'Unresolved source'), to = txt(row.toName) || (toIp && toIp.toUpperCase() !== 'N/A' ? toIp : 'Blank target');
    const ports = txt(row.fromPort) || txt(row.toPort) ? `Ports: ${esc(show(row.fromPort))} ↔ ${esc(show(row.toPort))}<br>` : '';
    const ips = txt(row.fromIp) || txt(row.toIp) ? `IPs: ${esc(show(row.fromIp))} ↔ ${esc(show(row.toIp))}<br>` : '';
    const network = txt(row.network) ? `Network: ${esc(row.network)}${txt(row.fromVlan) ? ` · VLAN ${esc(row.fromVlan)}` : ''}<br>` : '';
    return `<div class="connection-card"><div class="connection-top"><span>${esc(truncate(`${from} ↔ ${to}`, 68))}</span><span class="badge role">${esc(row.kind)}</span></div><div class="connection-meta">${ports}${ips}${network}${txt(row.remarks) ? esc(row.remarks) : ''}</div><div class="connection-path">${esc(row.sourceSheet)} · row ${esc(show(row.sourceRow))}${row.viaFrom === 'ip' || row.viaTo === 'ip' ? ' · IP-resolved' : ''}${row.viaFrom === 'r1r2' ? ' · explicit R1/R2 role mapping' : ''}</div></div>`;
  }

  function openUnifiedNode(id) {
    const atlas = unifiedAtlas(), n = atlas.allNodes.find(node => node.id === id); if (!n) return;
    const byId = new Map(atlas.allNodes.map(node => [node.id, node]));
    const connections = atlas.links.filter(link => link.source === id || link.target === id).map(link => {
      const neighbor = byId.get(link.source === id ? link.target : link.source);
      return { link, neighbor };
    }).filter(item => item.neighbor).sort((a, b) => UNIFIED_LAYERS.indexOf(a.neighbor.layer) - UNIFIED_LAYERS.indexOf(b.neighbor.layer) || a.neighbor.label.localeCompare(b.neighbor.label));
    const conflicts = atlas.conflicts.filter(conflict => conflict.nodeIds.includes(id));
    const unresolved = atlas.unresolved.filter(row => n.candidateKeys.includes(window.UnifiedAtlas.nameKey(row.fromName)) || n.candidateKeys.includes(window.UnifiedAtlas.nameKey(row.toName)));
    const live = liveDeviceForNode(n), alerts = liveAlertsForNode(n);
    const locate = `<button class="button secondary small" data-locate-node="${esc(id)}"><span data-icon="locate"></span>Locate</button>`;
    openDrawer(`<div class="drawer-head"><button class="icon-button drawer-close" data-close-drawer><span data-icon="close"></span></button><div class="drawer-kicker">CANONICAL IP DEVICE</div><h2>${esc(n.label)}</h2><div class="drawer-badges"><span class="badge role">${esc(n.layer)}</span><span class="badge ${n.site === 'NDC' ? 'ndc' : 'dc'}">${esc(n.site)}</span>${n.mergedCount ? `<span class="badge role">${n.mergedCount} aliases merged</span>` : ''}${conflicts.length ? `<span class="badge gap">${conflicts.length} shared-IP conflicts</span>` : ''}${unresolved.length ? `<span class="badge gap">${unresolved.length} incomplete</span>` : ''}${locate}</div><div class="drawer-actions"><button class="button secondary small" data-action="add-unified-connection" data-unified-source="${esc(id)}"><span data-icon="link"></span>Add connection</button><button class="button secondary small" data-unified-edit-device="${esc(id)}"><span data-icon="edit"></span>Edit</button><button class="button danger small" data-unified-delete-device="${esc(id)}"><span data-icon="trash"></span>Delete</button></div></div><div class="drawer-body">
      ${live || alerts.length ? `<section class="detail-section"><h3>Live monitoring</h3><div class="detail-grid">${live ? `${detailField('LibreNMS status', live.status.toUpperCase())}${detailField('Matched live IP', live.ip, false, true)}${detailField('Last poll', live.lastPoll)}` : ''}${detailField('Active alerts', alerts.length)}</div></section>` : ''}
      <section class="detail-section"><h3>Canonical identity</h3><div class="detail-grid">${detailField('Best display name', n.label, true)}${detailField('Primary IP', n.primaryIp, false, true)}${detailField('Architecture layer', n.layer)}${detailField('Site', n.site)}${detailField('All IP evidence', n.ips.join(', '), true, true)}${detailField('Merged source names', n.mergedCount)}${detailField('Evidence sources', n.sources.join(' · '), true)}</div>${n.aliases.length ? `<div class="alias-list">${n.aliases.map(alias => `<span>${esc(alias)}</span>`).join('')}</div>` : ''}</section>
      ${conflicts.length ? `<section class="detail-section"><h3>Shared-IP conflicts preserved</h3>${conflicts.map(conflict => `<div class="conflict-row"><strong class="mono">${esc(conflict.ip)}</strong><span>${esc(conflict.labels.filter(Boolean).join(' ↔ '))}</span></div>`).join('')}<div class="drawer-note">These identities were not blindly merged. A shared worksheet IP can represent a stack, HA pair, VIP or a source error.</div></section>` : ''}
      <section class="detail-section"><h3>Connected canonical devices · ${connections.length}</h3>${connections.length ? connections.map(({ link, neighbor }) => {
        const samples = link.links.slice(0, 2).map(row => txt(row.fromPort) || txt(row.toPort) ? `${show(row.fromPort)} ↔ ${show(row.toPort)}` : txt(row.network) ? row.network : null).filter(Boolean);
        return `<button class="unified-neighbor" data-open-unified-node="${esc(neighbor.id)}"><span class="neighbor-main"><strong>${esc(neighbor.label)}</strong><span class="mono">${esc(show(neighbor.primaryIp, 'No IP recorded'))}</span></span><span class="neighbor-meta"><span>${esc(neighbor.layer)} · ${esc(neighbor.site)}</span><span>${link.types.map(esc).join(' + ')} · ${link.count} evidence row${link.count > 1 ? 's' : ''}</span>${samples.length ? `<span>${esc(samples.join(' · '))}</span>` : ''}</span><span class="badge role">${link.count}</span></button>`;
      }).join('') : '<div class="empty-state">No drawable connections. Incomplete evidence remains in the source views.</div>'}</section>
      ${unresolved.length ? `<section class="detail-section"><h3>Incomplete source evidence · ${unresolved.length}</h3>${unresolved.map(unifiedEvidenceCard).join('')}</section>` : ''}
      <div class="drawer-note">This canonical identity is derived from preserved source evidence plus local workspace overrides. Use Edit to change its display/IP/layer metadata, or Delete to hide it until Reset edits.</div>
    </div>`);
  }

  function openUnifiedLink(id) {
    const atlas = unifiedAtlas(), link = atlas.links.find(item => item.id === id); if (!link) return;
    const source = atlas.allNodes.find(n => n.id === link.source), target = atlas.allNodes.find(n => n.id === link.target);
    const rows = [...link.links].sort((a, b) => a.sourceSheet.localeCompare(b.sourceSheet) || (a.sourceRow || 0) - (b.sourceRow || 0));
    const metric = liveMetricForLink(link);
    openDrawer(`<div class="drawer-head"><button class="icon-button drawer-close" data-close-drawer><span data-icon="close"></span></button><div class="drawer-kicker">CANONICAL IP CONNECTION</div><h2 style="font-size:16px">${esc(source?.label || link.source)} ↔ ${esc(target?.label || link.target)}</h2><div class="drawer-badges"><span class="badge role">${link.count} evidence row${link.count > 1 ? 's' : ''}</span><span class="badge">Bidirectional duplicate group</span></div><div class="drawer-actions"><button class="button secondary small" data-unified-edit-connection="${esc(id)}"><span data-icon="edit"></span>Edit</button><button class="button danger small" data-unified-delete-connection="${esc(id)}"><span data-icon="trash"></span>Delete</button></div></div><div class="drawer-body"><section class="detail-section"><h3>IP-wise mapping</h3><div class="detail-grid">${detailField('Source IP', source?.primaryIp, false, true)}${detailField('Target IP', target?.primaryIp, false, true)}${detailField('Connection types', link.types.join(' · '), true)}${detailField('Evidence sheets', link.sourceSheets.join(' · '), true)}</div></section>${metric ? `<section class="detail-section"><h3>Live utilization</h3><div class="detail-grid">${detailField('Utilization', metric.utilization === null ? '—' : metric.utilization.toFixed(1) + '%')}${detailField('Interface speed', formatBps(metric.speedBps))}${detailField('Inbound', formatBps(metric.inBps))}${detailField('Outbound', formatBps(metric.outBps))}</div></section>` : ''}<section class="detail-section"><h3>Explicit evidence · ${rows.length}</h3>${rows.map(unifiedEvidenceCard).join('')}</section><div class="drawer-note">A→B and B→A worksheet rows are grouped only for architectural display. Original endpoint names, IPs, ports and source rows remain in each evidence card.</div></div>`);
  }

  function openNode(id) {
    const n = nodeById(id); if (!n) return;
    const ids = [...new Set([...n.rows, ...n.referencedRows])];
    const rows = ids.map(rowById).filter(Boolean).sort((a, b) => (a.row || 999999) - (b.row || 999999));
    const live = liveDeviceForNode(n), activeAlerts = liveAlertsForNode(n);
    const assignment = n.rows.map(rowById).find(row => row?.discovery?.assignment === 'third-octet');
    const locate = (state.view === 'architecture' || state.view === 'datacenter') ? `<button class="button secondary small" data-locate-node="${esc(id)}"><span data-icon="locate"></span>Locate</button>` : '';
    openDrawer(`<div class="drawer-head"><button class="icon-button drawer-close" data-close-drawer aria-label="Close"><span data-icon="close"></span></button><div class="drawer-kicker">${n.referencedOnly ? 'REFERENCED NEIGHBOUR' : 'DEVICE DETAILS'}</div><h2>${esc(n.label)}</h2><div class="drawer-badges"><span class="badge role">${esc(n.role || 'Referenced')}</span>${assignment ? `<span class="badge role">Auto VLAN ${esc(assignment.discovery.vlan)}</span>` : ''}${n.zone ? `<span class="badge ${txt(n.zone).toLowerCase().includes('ndc') ? 'ndc' : 'dc'}">${esc(n.zone)}</span>` : ''}${n.gapRows.length ? `<span class="badge gap">${n.gapRows.length} source gap${n.gapRows.length > 1 ? 's' : ''}</span>` : ''}${locate}</div><div class="drawer-actions"><button class="button secondary small" data-edit-node="${esc(id)}"><span data-icon="edit"></span>Edit</button><button class="button danger small" data-delete-node="${esc(id)}"><span data-icon="trash"></span>Delete</button></div></div><div class="drawer-body">
      ${n.referencedOnly ? '<div class="drawer-note">This name appears only as a neighbour in the current register. No local model, IP or extra connection has been inferred.</div>' : ''}
      ${live || activeAlerts.length ? `<section class="detail-section"><h3>Live monitoring</h3><div class="detail-grid">${live ? `${detailField('LibreNMS status', live.status.toUpperCase())}${detailField('Live IP', live.ip, false, true)}${detailField('Uptime', live.uptimeSeconds ? `${Math.floor(live.uptimeSeconds / 3600)} h` : '—')}${detailField('Last poll', live.lastPoll)}` : ''}${detailField('Active alerts', activeAlerts.length)}</div>${activeAlerts.map(a => `<div class="connection-card gap"><div class="connection-top"><span>${esc(a.name)}</span><span class="badge gap">${esc(a.severityName)}</span></div><div class="connection-meta">Zabbix · ${a.lastChange ? new Date(a.lastChange * 1000).toLocaleString() : ''}</div></div>`).join('')}</section>` : ''}
      <section class="detail-section"><h3>Register attributes</h3><div class="detail-grid">${detailField('IP address', n.ips.join(', '), false, true)}${detailField('Model', n.models.join(', '))}${detailField('Serial / Asset ID', n.serials.join(', '), false, true)}${detailField('Building VLAN', n.buildingVlans.join(', '))}${detailField('Floor / location', n.floors.join(', '), true)}${detailField('Workbook rows', n.rows.length ? n.rows.map(rowById).filter(Boolean).map(r => r.row ?? 'NEW').join(', ') : 'Referenced only', true)}</div></section>
      <section class="detail-section"><h3>Documented rows · ${rows.length}</h3>${rows.length ? rows.map(connectionCard).join('') : '<div class="empty-state">No register rows</div>'}</section>
    </div>`);
  }

  function openLink(id) {
    const link = combinedGraph().links.find(l => l.id === id); if (!link) return;
    const source = nodeById(link.source), target = nodeById(link.target);
    const rows = link.links.map(e => rowById(e.rowId)).filter(Boolean);
    const autoAssigned = rows.some(row => row.discovery?.assignment === 'third-octet');
    const metric = liveMetricForLink(link);
    openDrawer(`<div class="drawer-head"><button class="icon-button drawer-close" data-close-drawer><span data-icon="close"></span></button><div class="drawer-kicker">${autoAssigned ? 'VLAN-ASSIGNED LINK' : 'DOCUMENTED LINK'}</div><h2 style="font-size:16px">${esc(source?.label || link.source)} → ${esc(target?.label || link.target)}</h2><div class="drawer-badges"><span class="badge role">${link.count} source row${link.count > 1 ? 's' : ''}</span><span class="badge">Parallel links grouped in graph</span></div></div><div class="drawer-body">${metric ? `<section class="detail-section"><h3>Live utilization</h3><div class="detail-grid">${detailField('Utilization', metric.utilization === null ? '—' : metric.utilization.toFixed(1) + '%')}${detailField('Interface speed', formatBps(metric.speedBps))}${detailField('Inbound', formatBps(metric.inBps))}${detailField('Outbound', formatBps(metric.outBps))}${detailField('Errors', metric.errors)}${detailField('Discards', metric.discards)}</div></section>` : ''}<section class="detail-section"><h3>${autoAssigned ? 'VLAN assignment evidence' : 'Port-level evidence'}</h3>${rows.map(connectionCard).join('')}</section></div>`);
  }

  function openRawDataCenter() {
    const entries = bundle().dataCenter || [];
    const rows = entries.slice().sort((a, b) => String(a.side).localeCompare(String(b.side)) || (a.row || 999999) - (b.row || 999999));
    openDrawer(`<div class="drawer-head"><button class="icon-button drawer-close" data-close-drawer><span data-icon="close"></span></button><div class="drawer-kicker">DATACENTER SOURCE SNAPSHOT</div><h2>All DataCenter raw rows</h2><div class="drawer-badges"><span class="badge role">${entries.length} local rows</span><span class="badge">Shared WMTC / WHIL</span></div><div class="drawer-actions"><button class="button primary small" data-generic-add="dataCenter"><span data-icon="plus"></span>Add entry</button></div></div><div class="drawer-body"><div class="drawer-note">This manager includes rows hidden by the six display exclusions. Editing or deleting here is deliberate local CRUD; the normal rack inventory still keeps those exclusions hidden. Reset edits restores every source row.</div><section class="detail-section"><h3>Source entries · ${rows.length}</h3>${rows.map(entry => `<div class="raw-source-row"><div><strong>${esc(show(entry.node, 'Unnamed source label'))}</strong><span>${esc(entry.side)} · row ${esc(show(entry.row, 'NEW'))} · ${esc(show(entry.ip, 'No IP'))}${dcSourceGroup(entry) ? '' : ' · hidden by display rule'}</span></div><div class="raw-source-actions"><button class="icon-button" title="Edit raw entry" data-generic-edit="dataCenter" data-generic-id="${esc(entry.id)}"><span data-icon="edit"></span></button><button class="icon-button danger-icon" title="Delete raw entry" data-generic-delete="dataCenter" data-generic-id="${esc(entry.id)}"><span data-icon="trash"></span></button></div></div>`).join('')}</section></div>`);
  }

  function openEntry(type, id) {
    const list = type === 'dc' ? bundle().dataCenter : bundle().dmzMz;
    const entry = list.find(e => e.id === id); if (!entry) return;
    const dc = type === 'dc', kind = dc ? (entry.kind || (txt(entry.ip) ? 'device' : txt(entry.zone) ? 'note' : 'label')) : 'inventory';
    const thirdLabel = dc ? 'VLAN / note' : 'Zone / location';
    const sourceTab = dc ? 'Data Center Devices' : 'DMZ & MZ';
    const badge = dc && entry.zone ? `VLAN ${entry.zone}` : entry.zone;
    openDrawer(`<div class="drawer-head"><button class="icon-button drawer-close" data-close-drawer><span data-icon="close"></span></button><div class="drawer-kicker">${dc ? 'DATACENTER INVENTORY' : 'DMZ / MZ INVENTORY'}</div><h2>${esc(show(entry.node, 'Unnamed entry'))}</h2><div class="drawer-badges"><span class="badge ${entry.side === 'NDC' || entry.side === 'MZ' ? 'ndc' : 'dc'}">${esc(entry.side)}</span><span class="badge role">${esc(kind)}</span>${badge ? `<span class="badge role">${esc(badge)}</span>` : ''}</div><div class="drawer-actions"><button class="button secondary small" data-generic-edit="${dc ? 'dataCenter' : 'dmzMz'}" data-generic-id="${esc(id)}"><span data-icon="edit"></span>Edit</button><button class="button danger small" data-generic-delete="${dc ? 'dataCenter' : 'dmzMz'}" data-generic-id="${esc(id)}"><span data-icon="trash"></span>Delete</button></div></div><div class="drawer-body"><section class="detail-section"><h3>Source attributes</h3><div class="detail-grid">${detailField('Node / service', entry.node, true)}${detailField('IP address', entry.ip, false, true)}${detailField(thirdLabel, entry.zone)}${detailField('Source row', entry.row)}${detailField('Source tab', sourceTab)}${dc && kind === 'device' ? detailField('Display group', dcSourceGroupName(dcSourceGroup(entry))) : ''}</div></section><div class="drawer-note">This is an inventory ${esc(kind)} from the linked source tab. The source section provides no port-level neighbour here, so the application does not invent one.</div></div>`);
  }

  function focusLiveHost(hostname) {
    const id = normName(hostname);
    const unified = unifiedAtlas().allNodes.find(n => n.candidateKeys.includes(id) || n.ips.some(ip => txt(ip) === txt(hostname)));
    if (unified) {
      state.view = 'architecture'; state.archMode = 'unified'; state.unifiedScope = 'All'; state.unifiedLayers.add(unified.layer);
      state.pendingFocus = { type: 'unified-node', id: unified.id }; render(); return;
    }
    const node = combinedGraph().nodes.find(n => n.id === id || n.id === `ref:${id}` || n.ips.some(ip => txt(ip) === txt(hostname)));
    if (!node) { toast(`${hostname} is not in the current architecture`); return; }
    state.view = 'architecture'; state.archMode = 'register'; state.layers.add(node.role); state.pendingFocus = { type: 'node', id: node.id }; render();
  }
  function renderLive() {
    const live = state.live, down = live.devices.filter(d => d.status === 'down').length;
    const discovered = discoveryBundle().nodes.filter(n => !n.referencedOnly);
    const actions = `<button class="button primary" data-action="sync-live"><span data-icon="activity"></span>${state.liveSyncing ? 'Syncing…' : 'Sync now'}</button>`;
    const alerts = [...live.alerts].sort((a, b) => b.severity - a.severity || b.lastChange - a.lastChange);
    const links = [...live.links].sort((a, b) => (b.utilization || 0) - (a.utilization || 0)).slice(0, 30);
    main.innerHTML = `${pageHead('LIVE MONITORING', `${state.site} · Live operations`, 'LibreNMS status, alerts, utilization, and automatic device discovery.', actions)}
      <section class="stats-grid four">${statCard('LIVE DEVICES', live.devices.length, live.configured ? `${live.devices.filter(d => d.status === 'up').length} up · ${down} down` : 'API not configured', 'activity', 'green')}${statCard('ACTIVE ALERTS', live.alerts.length, live.config.zabbix ? 'Current Zabbix problems' : 'Zabbix not configured', 'alert', down ? 'gap' : '')}${statCard('DISCOVERED', discovered.length, 'No unique Distribution VLAN match', 'devices', 'violet')}${statCard('LAST SYNC', live.lastSync ? new Date(live.lastSync).toLocaleTimeString() : '—', live.lastSync ? new Date(live.lastSync).toLocaleDateString() : 'No live sync yet', 'rows')}</section>
      <div class="source-note"><span data-icon="info"></span><div><strong>Discovery assignment:</strong> IPv4 third octet = VLAN. A unique Distribution with the same third octet receives the device as <strong>Access</strong>. Unmatched or ambiguous devices remain in <strong>Discovered</strong>.</div></div>
      ${!live.configured ? `<section class="card subsection-card setup-card"><div class="subsection-head"><div><h2>Live API setup required</h2><p>No fake status or metrics are shown while credentials are missing.</p></div><span class="badge gap">NOT CONFIGURED</span></div><p class="setup-text">Fill <strong>network-atlas/.env</strong>, then restart the NetAtlas server. Use read-only API credentials. LibreNMS supplies devices, links and port rates; Zabbix supplies active problems.</p><pre class="setup-code">LIBRENMS_URL=https://your-librenms
LIBRENMS_TOKEN=read-only-token
ZABBIX_URL=https://your-zabbix
ZABBIX_TOKEN=read-only-api-token
LIVE_REFRESH_SECONDS=60
AUTO_DISCOVER=true</pre><p class="setup-note">For self-signed internal HTTPS, set <code>LIVE_TLS_REJECT_UNAUTHORIZED=false</code> only after verifying the server. Zabbix username/password login is also supported.</p></section>` : ''}
      ${live.errors?.length ? `<section class="live-errors"><strong>Sync warnings</strong>${live.errors.map(e => `<div>${esc(e)}</div>`).join('')}</section>` : ''}
      <div class="inventory-grid live-grid"><section class="card inventory-panel"><div class="inventory-head"><div class="inventory-title"><span class="zone-emblem">AL</span><div><h2>Active alerts</h2><p>Zabbix current problems</p></div></div><span class="count-pill">${alerts.length}</span></div><div class="inventory-list live-alerts">${alerts.length ? alerts.map(a => `<button class="inventory-item alert-item severity-${a.severity}" data-live-host="${esc(a.hostname)}"><span class="inventory-item-name"><strong>${esc(a.name)}</strong><span>${esc(a.hostname)} · ${a.lastChange ? new Date(a.lastChange * 1000).toLocaleString() : ''}</span></span><span class="badge ${a.severity >= 4 ? 'gap' : 'role'}">${esc(a.severityName)}</span></button>`).join('') : `<div class="empty-state"><strong>${live.config.zabbix ? 'No active problems' : 'Zabbix not configured'}</strong>${live.config.zabbix ? 'The last sync returned no current problems.' : 'Add Zabbix credentials to load alerts.'}</div>`}</div></section>
      <section class="card inventory-panel"><div class="inventory-head"><div class="inventory-title"><span class="zone-emblem ndc">DI</span><div><h2>Unassigned discovered devices</h2><p>Unmatched or ambiguous third-octet VLANs</p></div></div><span class="count-pill">${discovered.length}</span></div><div class="inventory-list">${discovered.length ? discovered.map(n => `<button class="inventory-item" data-live-host="${esc(n.label)}"><span class="inventory-item-name"><strong>${esc(n.label)}</strong><span>${esc(show(n.ip, 'No IP'))} · ${esc(show(n.floor, 'LibreNMS'))}</span></span><span class="inventory-ip">${esc(show(n.model))}</span><span class="badge role">Discovered</span></button>`).join('') : '<div class="empty-state"><strong>No unassigned discovered devices</strong>Unique third-octet VLAN matches are placed as Access under their Distribution; only unmatched or ambiguous devices remain here.</div>'}</div></section></div>
      <section class="card records-card live-links-card"><div class="inventory-head"><div class="inventory-title"><span class="zone-emblem dmz">BW</span><div><h2>Link utilization</h2><p>LibreNMS octet rates converted to bits/sec; sorted by utilization</p></div></div><span class="count-pill">${live.links.length} links</span></div><div class="table-wrap"><table class="data-table live-table"><thead><tr><th>Connection</th><th>Local port</th><th>Remote port</th><th>Utilization</th><th>In</th><th>Out</th><th>Errors</th><th>Discards</th></tr></thead><tbody>${links.length ? links.map(l => `<tr data-live-host="${esc(l.source)}"><td class="device-cell">${esc(l.source)} → ${esc(l.target)}</td><td>${esc(show(l.localPort))}</td><td>${esc(show(l.remotePort))}</td><td><span class="util-badge ${l.utilization >= 85 ? 'high' : l.utilization >= 60 ? 'warn' : ''}">${l.utilization === null ? '—' : l.utilization.toFixed(1) + '%'}</span></td><td class="mono">${formatBps(l.inBps)}</td><td class="mono">${formatBps(l.outBps)}</td><td>${l.errors || 0}</td><td>${l.discards || 0}</td></tr>`).join('') : `<tr><td colspan="8"><div class="empty-state"><strong>${live.config.librenms ? 'No link metrics returned' : 'LibreNMS not configured'}</strong>Port/link API data will appear here after a successful sync.</div></td></tr>`}</tbody></table></div></section>`;
  }

  function renderDatacenter() {
    const b = bundle(), entries = b.dataCenter, visibleEntries = entries.filter(e => dcSourceGroup(e));
    const ipDevices = visibleEntries.filter(e => txt(e.ip));
    const ndcDevices = ipDevices.filter(e => e.side === 'NDC').length, dcDevices = ipDevices.filter(e => e.side === 'DC').length;
    const ndcEntries = visibleEntries.filter(e => e.side === 'NDC').length, dcEntries = visibleEntries.filter(e => e.side === 'DC').length;
    const excludedCount = entries.length - visibleEntries.length;
    const isCore = state.dcGraphMode === 'core', isRegister = state.dcGraphMode === 'register';
    const graphMode = isCore ? 'dc-core-source' : isRegister ? 'dc' : 'dc-devices';
    const coreModel = isCore ? coreEvidenceGraph() : null, registerModel = isRegister ? graphModel('dc') : null;
    const exportLabel = isCore ? 'Export core rows' : isRegister ? 'Export register rows' : 'Export inventory';
    const actions = `<button class="button secondary" data-action="raw-dc"><span data-icon="table"></span>Raw source rows</button><button class="button secondary" data-generic-add="dataCenter"><span data-icon="plus"></span>Add DC / NDC entry</button><button class="button primary" data-action="export"><span data-icon="download"></span>${exportLabel}</button>`;
    let statsHtml, modeNote, description;
    if (isCore) {
      const records = coreModel.records, partial = records.filter(r => r.partial).length;
      const scopeCount = scope => records.filter(r => r.scope === scope).length;
      statsHtml = `${statCard('CORE SOURCE ROWS', records.length, `${scopeCount('DC')} DC · ${scopeCount('NDC')} NDC · ${scopeCount('WHIL-DC')} WHIL-DC`, 'rows', 'violet')}${statCard('RESOLVED ROWS', coreModel.drawableRows, `${coreModel.links.length} unique canonical connections`, 'link', 'green')}${statCard('CANONICAL DEVICES', coreModel.nodes.length, `${coreModel.blankTargets} blank-target rows preserved`, 'server')}${statCard('PARTIAL ROWS', partial, 'Blank workbook evidence retained', 'alert', 'gap')}`;
      modeNote = `<strong>Unified Core links:</strong> ${records.length} explicit rows come from DC BackBone, NDC BackBone, DC Core-Distribution and WHIL-DC Port Maping. Canonical devices use the same IP-led resolver as Architecture; aliases and A→B/B→A duplicates are grouped while physical 01/02 conflicts stay separate. ${coreModel.blankTargets} rows have no target device and are not drawn. The old main-register topology is preserved separately under <strong>Main register</strong>.`;
      description = 'Canonical datacenter connectivity from Backbone, Core–Distribution and WHIL-DC evidence, enriched by IP-wise aliases across all sources.';
    } else if (isRegister) {
      const coreRows = allRegisterRows().filter(r => r.roleShort === 'Core'), gaps = coreRows.filter(r => r.sourceGap).length;
      statsHtml = `${statCard('REGISTER CORE ROWS', coreRows.length, 'Original main-register evidence', 'rows', 'violet')}${statCard('GRAPH DEVICES', registerModel.nodes.length, 'Core plus referenced neighbours', 'server')}${statCard('AGGREGATED LINKS', registerModel.links.length, 'Parallel register rows grouped', 'link', 'green')}${statCard('SOURCE GAPS', gaps, 'Blank main-register neighbours', 'alert', 'gap')}`;
      modeNote = '<strong>Main register:</strong> This is the previous register-based Core topology, retained separately for comparison. It is not mixed into the new workbook Core links graph.';
      description = 'Previous main-register Core relationships, preserved separately from the new workbook port-level Core links.';
    } else {
      statsHtml = `${statCard('IP DEVICES', ipDevices.length, `${ndcDevices} NDC · ${dcDevices} DC`, 'server', 'violet')}${statCard('NDC ENTRIES', ndcEntries, `${ndcDevices} devices + ${ndcEntries - ndcDevices} labels/notes`, 'server')}${statCard('DC ENTRIES', dcEntries, `${dcDevices} devices + ${dcEntries - dcDevices} labels/notes`, 'server', 'green')}${statCard('VISIBLE ROWS', visibleEntries.length, `${excludedCount} excluded · ${entries.length} raw source rows`, 'rows')}`;
      modeNote = `<strong>Rack layout:</strong> 01-numbered and unnumbered devices use Rack 1; other 02-numbered devices use Rack 2. For APIC/CIMC, only 03 uses Rack 2—01 and 02 stay in Rack 1. NDC NOC, F5 and DR devices have separate groups inside NDC. ${excludedCount} DC source rows are hidden from this view as requested; the raw workbook remains unchanged. No links are inferred from this inventory tab.`;
      description = 'Rack 1 / Rack 2 layouts from the linked Data Center Devices tab, with separate NDC NOC, F5 and DR groups.';
    }
    main.innerHTML = `${pageHead('DATACENTER PERSPECTIVE', `${state.site} · DC / NDC`, description, actions)}
      <section class="stats-grid four">${statsHtml}</section>
      ${graphCard(graphMode)}
      <div class="inventory-grid">${['NDC', 'DC'].map(side => `<section class="card inventory-panel"><div class="inventory-head"><div class="inventory-title"><span class="zone-emblem ${side.toLowerCase()}">${side}</span><div><h2>${side} inventory</h2><p>Data Center Devices source tab</p></div></div><span class="count-pill" id="dcCount${side}">${visibleEntries.filter(e => e.side === side).length} entries</span></div><div class="inventory-tools"><div class="inline-search"><span data-icon="search"></span><input data-dc-search placeholder="Filter ${side} device, IP or VLAN…" value="${esc(state.dcQuery)}"></div></div><div class="inventory-list" id="dcList${side}"></div></section>`).join('')}</div>
      <div class="source-note"><span data-icon="info"></span><div>${modeNote}</div></div>`;
    main.querySelectorAll('[data-dc-search]').forEach(input => input.addEventListener('input', () => {
      state.dcQuery = input.value;
      main.querySelectorAll('[data-dc-search]').forEach(other => { if (other !== input) other.value = input.value; });
      renderDcLists();
    }));
    renderDcLists(); initGraph(graphMode);
  }

  function filteredDc(side) {
    const q = state.dcQuery.toLowerCase().trim();
    return bundle().dataCenter.filter(e => e.side === side && dcSourceGroup(e) && (!q || `${txt(e.node)} ${txt(e.ip)} ${txt(e.zone)}`.toLowerCase().includes(q)));
  }
  function renderDcLists() {
    ['NDC', 'DC'].forEach(side => {
      const list = filteredDc(side), container = document.getElementById(`dcList${side}`);
      if (!container) return;
      document.getElementById(`dcCount${side}`).textContent = `${list.length} entries`;
      container.innerHTML = list.length ? list.map(e => {
        const kind = e.kind || (txt(e.ip) ? 'device' : txt(e.zone) ? 'note' : 'label');
        const vlan = txt(e.zone) ? `VLAN ${e.zone}` : side;
        const group = kind === 'device' ? dcSourceGroupName(dcSourceGroup(e)) : `Source ${kind}`;
        return `<div class="inventory-entry"><button class="inventory-item" data-entry-type="dc" data-entry-id="${esc(e.id)}"><span class="inventory-item-name"><strong>${esc(show(e.node, 'Unnamed source label'))}</strong><span>${esc(group)} · row ${e.row ?? 'NEW'}</span></span><span class="inventory-ip">${esc(show(e.ip))}</span><span class="badge ${side === 'NDC' ? 'ndc' : 'dc'}">${esc(vlan)}</span></button><div class="inventory-entry-actions"><button class="icon-button" title="Edit entry" data-generic-edit="dataCenter" data-generic-id="${esc(e.id)}"><span data-icon="edit"></span></button><button class="icon-button danger-icon" title="Delete entry" data-generic-delete="dataCenter" data-generic-id="${esc(e.id)}"><span data-icon="trash"></span></button></div></div>`;
      }).join('') : '<div class="empty-state"><strong>No matching entries</strong>Clear the filter to see the full inventory.</div>';
    });
  }

  function renderDmz() {
    const b = bundle(), s = b.stats;
    const dcCount = b.dmzMz.filter(e => txt(e.zone).toUpperCase() === 'DC').length;
    const ndcCount = b.dmzMz.filter(e => txt(e.zone).toUpperCase() === 'NDC').length;
    const actions = `<button class="button secondary" data-generic-add="dmzMz"><span data-icon="plus"></span>Add DMZ / MZ entry</button><button class="button primary" data-action="export"><span data-icon="download"></span>Export inventory</button>`;
    main.innerHTML = `${pageHead('SERVICE ZONES', `${state.site} · DMZ / MZ`, 'All DMZ and MZ nodes with IP and source ownership, kept separate from the port-level topology.', actions)}
      <section class="stats-grid four">${statCard('DMZ NODES', s.dmzMz.DMZ || 0, 'Complete source inventory', 'shield', 'green')}${statCard('MZ NODES', s.dmzMz.MZ || 0, 'Complete source inventory', 'shield', 'violet')}${statCard('DC ASSIGNMENTS', dcCount, 'Entries explicitly marked DC', 'server')}${statCard('NDC ASSIGNMENTS', ndcCount, 'Entries explicitly marked NDC', 'server')}</section>
      <div class="inventory-grid">${['DMZ', 'MZ'].map(side => `<section class="card inventory-panel"><div class="inventory-head"><div class="inventory-title"><span class="zone-emblem ${side.toLowerCase()}">${side}</span><div><h2>${side} services & nodes</h2><p>Rows 945–1038 · shared source section</p></div></div><span class="count-pill" id="dmzCount${side}">${s.dmzMz[side] || 0} nodes</span></div><div class="inventory-tools"><div class="inline-search"><span data-icon="search"></span><input data-dmz-search placeholder="Filter ${side} service, node or IP…" value="${esc(state.dmzQuery)}"></div></div><div class="inventory-list" id="dmzList${side}"></div></section>`).join('')}</div>
      <div class="source-note"><span data-icon="info"></span><div>The DMZ & MZ source contains node/IP/ownership inventory, not neighbour-port records. These panels therefore do not draw invented connections.</div></div>`;
    main.querySelectorAll('[data-dmz-search]').forEach(input => input.addEventListener('input', () => {
      state.dmzQuery = input.value;
      main.querySelectorAll('[data-dmz-search]').forEach(other => { if (other !== input) other.value = input.value; });
      renderDmzLists();
    }));
    renderDmzLists();
  }

  function filteredDmz(side) {
    const q = state.dmzQuery.toLowerCase().trim();
    return bundle().dmzMz.filter(e => e.side === side && (!q || `${txt(e.node)} ${txt(e.ip)} ${txt(e.zone)}`.toLowerCase().includes(q)));
  }
  function renderDmzLists() {
    ['DMZ', 'MZ'].forEach(side => {
      const list = filteredDmz(side), container = document.getElementById(`dmzList${side}`);
      if (!container) return;
      document.getElementById(`dmzCount${side}`).textContent = `${list.length} nodes`;
      container.innerHTML = list.length ? list.map(e => `<div class="inventory-entry"><button class="inventory-item" data-entry-type="dmz" data-entry-id="${esc(e.id)}"><span class="inventory-item-name"><strong>${esc(show(e.node, 'Unnamed entry'))}</strong><span>Workbook row ${e.row ?? 'NEW'}</span></span><span class="inventory-ip">${esc(show(e.ip))}</span><span class="badge ${txt(e.zone).toUpperCase() === 'NDC' ? 'ndc' : 'dc'}">${esc(show(e.zone, 'Unspecified'))}</span></button><div class="inventory-entry-actions"><button class="icon-button" title="Edit entry" data-generic-edit="dmzMz" data-generic-id="${esc(e.id)}"><span data-icon="edit"></span></button><button class="icon-button danger-icon" title="Delete entry" data-generic-delete="dmzMz" data-generic-id="${esc(e.id)}"><span data-icon="trash"></span></button></div></div>`).join('') : '<div class="empty-state"><strong>No matching nodes</strong>Clear the filter to see the full inventory.</div>';
    });
  }

  function upgradeRecords(view) {
    const s = state[view], dataset = DATA[view] || {};
    return Array.isArray(dataset[s.tab]) ? dataset[s.tab] : [];
  }
  function upgradeFilterConfig(view) {
    const tab = state[view].tab, records = upgradeRecords(view);
    if (view === 'connectivity' && tab === 'links') return { label: 'All categories', values: [...new Set(records.map(r => txt(r.category)).filter(Boolean))].sort() };
    if (view === 'ipam' && tab === 'blocks') return { label: 'All allocation types', values: [...new Set(records.map(r => txt(r.category)).filter(Boolean))].sort() };
    if (view === 'ipam' && tab === 'vlans') return { label: 'All owners', values: [...new Set(records.map(r => txt(r.owner)).filter(Boolean))].sort() };
    return null;
  }
  function filteredUpgrade(view) {
    const s = state[view], q = s.query.toLowerCase().trim();
    return upgradeRecords(view).filter(record => {
      if (s.scope && txt(record.scope) !== s.scope) return false;
      if (s.filter) {
        const candidate = view === 'ipam' && s.tab === 'vlans' ? txt(record.owner) : txt(record.category);
        if (candidate !== s.filter) return false;
      }
      if (view === 'connectivity' && s.tab === 'links' && s.evidence && ((s.evidence === 'partial') !== Boolean(record.partial))) return false;
      if (q && !JSON.stringify(record).toLowerCase().includes(q)) return false;
      return true;
    });
  }
  function optionTags(values, current, allLabel) {
    return `<option value="">${esc(allLabel)}</option>${values.map(value => `<option value="${esc(value)}" ${current === value ? 'selected' : ''}>${esc(value)}</option>`).join('')}`;
  }
  function upgradePage(records, s) {
    const pages = Math.max(1, Math.ceil(records.length / s.perPage));
    s.page = Math.min(Math.max(1, s.page), pages);
    return { pages, visible: records.slice((s.page - 1) * s.perPage, s.page * s.perPage) };
  }
  function upgradeRow(collection, record, cells, gap = false) {
    const actions = `<td class="row-actions"><button class="icon-button" title="Edit record" data-generic-edit="${esc(collection)}" data-generic-id="${esc(record.id)}"><span data-icon="edit"></span></button><button class="icon-button danger-icon" title="Delete record" data-generic-delete="${esc(collection)}" data-generic-id="${esc(record.id)}"><span data-icon="trash"></span></button></td>`;
    return `<tr class="${gap ? 'gap-row' : ''}" data-upgrade-collection="${esc(collection)}" data-upgrade-id="${esc(record.id)}">${cells.join('')}${actions}</tr>`;
  }
  function endpointIp(record, side) {
    return show(record[`${side}Ip`]);
  }
  function connectivityRows(records) {
    const tab = state.connectivity.tab;
    if (tab === 'links') {
      const headers = ['Evidence', 'Scope', 'Category', 'From device', 'From port', 'To device', 'To port', 'VLAN A / B', 'IP A / B', 'Speed', 'Worksheet status', 'Source'];
      const rows = records.map(r => upgradeRow(tab, r, [
        `<td>${r.partial ? '<span class="badge gap">PARTIAL</span>' : '<span class="badge role">DOCUMENTED</span>'}</td>`,
        `<td><span class="badge ${txt(r.scope).includes('NDC') ? 'ndc' : 'dc'}">${esc(r.scope)}</span></td>`,
        `<td>${esc(show(r.category))}</td>`, `<td class="device-cell">${esc(show(r.fromDevice))}</td>`, `<td class="mono">${esc(show(r.fromPort))}</td>`,
        `<td class="device-cell">${esc(show(r.toDevice))}</td>`, `<td class="mono">${esc(show(r.toPort))}</td>`,
        `<td>${esc([r.fromVlan, r.toVlan].map(txt).filter(Boolean).join(' / ') || '—')}</td>`,
        `<td class="mono">${esc([endpointIp(r, 'from'), endpointIp(r, 'to')].filter(v => v !== '—').join(' / ') || '—')}</td>`,
        `<td>${esc(show(r.speed))}</td>`, `<td>${esc(show(r.status))}</td>`, `<td>${esc(r.sourceSheet)} <span class="mono">#${r.sourceRow}</span></td>`,
      ], r.partial));
      return { headers, rows };
    }
    if (tab === 'accessDevices') {
      const headers = ['Row', 'Hostname', 'IP', 'Model', 'Building / floor', 'Uplink port', 'Uplink device', 'Uplink switch port', 'Remarks'];
      const rows = records.map(r => upgradeRow(tab, r, [
        `<td class="mono">${r.sourceRow}</td>`, `<td class="device-cell">${esc(show(r.hostname, 'Unnamed source entry'))}</td>`, `<td class="mono">${esc(show(r.ip))}</td>`,
        `<td>${esc(show(r.model))}</td>`, `<td>${esc([r.building, r.floor].map(txt).filter(Boolean).join(' · ') || '—')}</td>`, `<td class="mono">${esc(show(r.uplinkPort))}</td>`,
        `<td>${esc(show(r.uplinkDevice))}</td>`, `<td class="mono">${esc(show(r.uplinkSwitchPort))}</td>`, `<td>${esc(show(r.remarks))}</td>`,
      ], !txt(r.hostname)));
      return { headers, rows };
    }
    const headers = ['Row', 'Scope', 'Cable label text', 'Source tab'];
    const rows = records.map(r => upgradeRow(tab, r, [
      `<td class="mono">${r.sourceRow}</td>`, `<td>${esc(r.scope)}</td>`, `<td class="path-cell">${esc(r.text)}</td>`, `<td>${esc(r.sourceSheet)}</td>`,
    ]));
    return { headers, rows };
  }
  function ipamRows(records) {
    const tab = state.ipam.tab;
    if (tab === 'blocks') {
      const headers = ['Scope', 'Allocation type', 'CIDR / IP', 'Purpose', 'Remarks', 'Source'];
      const rows = records.map(r => upgradeRow(tab, r, [
        `<td><span class="badge ${txt(r.scope).includes('NDC') ? 'ndc' : 'dc'}">${esc(r.scope)}</span></td>`, `<td>${esc(r.category)}</td>`,
        `<td class="mono device-cell">${esc(show(r.cidr))}</td>`, `<td>${esc(show(r.purpose))}</td>`, `<td>${esc(show(r.remarks))}</td>`,
        `<td>${esc(r.sourceSheet)} <span class="mono">#${r.sourceRow} · ${esc(r.sourceColumns)}</span></td>`,
      ], !txt(r.cidr)));
      return { headers, rows };
    }
    if (tab === 'vlans') {
      const headers = ['VLAN', 'Owner', 'Building', 'Floor / location', 'Description', 'Source row'];
      const rows = records.map(r => upgradeRow(tab, r, [
        `<td class="mono device-cell">${txt(r.vlan) ? esc(r.vlan) : '<span class="badge gap">BLANK IN SOURCE</span>'}</td>`, `<td>${esc(show(r.owner))}</td>`,
        `<td>${esc(show(r.building))}</td>`, `<td>${esc(show(r.floor))}</td>`, `<td class="path-cell">${esc(show(r.description))}</td>`, `<td class="mono">HQ-VLAN #${r.sourceRow}</td>`,
      ], !txt(r.vlan)));
      return { headers, rows };
    }
    if (tab === 'devicePeers') {
      const headers = ['Scope', 'From device', 'From IP / VIP', 'To device', 'To IP / VIP', 'Network', 'Remarks', 'Source'];
      const rows = records.map(r => upgradeRow(tab, r, [
        `<td>${esc(r.scope)}</td>`, `<td class="device-cell">${esc(show(r.fromDevice))}</td>`, `<td class="mono">${esc([r.fromIp, r.fromVip].map(txt).filter(v => v && v !== 'N/A').join(' / ') || '—')}</td>`,
        `<td class="device-cell">${esc(show(r.toDevice))}</td>`, `<td class="mono">${esc([r.toIp, r.toVip].map(txt).filter(v => v && v !== 'N/A').join(' / ') || '—')}</td>`,
        `<td class="mono">${esc(show(r.network))}</td>`, `<td class="path-cell">${esc(show(r.remarks))}</td>`, `<td>${esc(r.sourceSheet)} <span class="mono">#${r.sourceRow}</span></td>`,
      ], !txt(r.fromDevice) || !txt(r.toDevice)));
      return { headers, rows };
    }
    if (tab === 'ispPeers') {
      const headers = ['Scope', 'ISP', 'Link type', 'Network', 'VLAN', 'R1 IP', 'R2 IP', 'ISP end IP', 'BGP neighbour', 'ASN', 'Source'];
      const rows = records.map(r => upgradeRow(tab, r, [
        `<td>${esc(r.scope)}</td>`, `<td class="device-cell">${esc(show(r.isp))}</td>`, `<td>${esc(show(r.linkType))}</td>`, `<td class="mono">${esc(show(r.network))}</td>`,
        `<td class="mono">${esc(show(r.vlan))}</td>`, `<td class="mono">${esc(show(r.r1Ip))}</td>`, `<td class="mono">${esc(show(r.r2Ip))}</td>`,
        `<td class="mono">${esc(show(r.ispEndIp))}</td>`, `<td class="mono">${esc(show(r.bgpNeighborIp))}</td>`, `<td class="mono">${esc(show(r.asn))}</td>`,
        `<td>${esc(r.sourceSheet)} <span class="mono">#${r.sourceRow}</span></td>`,
      ]));
      return { headers, rows };
    }
    const headers = ['Device', 'Interface', 'IP / CIDR', 'Remarks', 'Source row'];
    const rows = records.map(r => upgradeRow(tab, r, [
      `<td class="device-cell">${esc(show(r.device))}</td>`, `<td class="mono">${esc(show(r.interface))}</td>`, `<td class="mono">${esc(show(r.cidr))}</td>`,
      `<td class="path-cell">${esc(show(r.remarks))}</td>`, `<td class="mono">${esc(r.sourceSheet)} #${r.sourceRow}</td>`,
    ]));
    return { headers, rows };
  }
  function renderUpgradeTable(view) {
    const s = state[view], records = filteredUpgrade(view), page = upgradePage(records, s);
    const rendered = view === 'connectivity' ? connectivityRows(page.visible) : ipamRows(page.visible);
    const head = document.getElementById(`${view}Head`), body = document.getElementById(`${view}Body`);
    if (!head || !body) return;
    head.innerHTML = `<tr>${[...rendered.headers, 'Actions'].map(h => `<th>${esc(h)}</th>`).join('')}</tr>`;
    body.innerHTML = rendered.rows.length ? rendered.rows.join('') : `<tr><td colspan="${rendered.headers.length + 1}"><div class="empty-state"><strong>No matching workbook records</strong>Change or clear the filters, or add a local record.</div></td></tr>`;
    document.getElementById(`${view}Count`).textContent = `${records.length} matching rows · showing ${page.visible.length ? (s.page - 1) * s.perPage + 1 : 0}–${(s.page - 1) * s.perPage + page.visible.length}`;
    document.getElementById(`${view}PageInfo`).textContent = `Page ${s.page} / ${page.pages}`;
    document.querySelector(`[data-${view}-page="prev"]`).disabled = s.page <= 1;
    document.querySelector(`[data-${view}-page="next"]`).disabled = s.page >= page.pages;
  }
  function renderConnectivity() {
    const c = DATA.connectivity || { stats: {}, notes: [] }, s = state.connectivity;
    const scopes = [...new Set(upgradeRecords('connectivity').map(r => txt(r.scope)).filter(Boolean))].sort();
    const filter = upgradeFilterConfig('connectivity');
    const tabs = { links: 'Port links', accessDevices: 'Access inventory', labels: 'Cable labels' };
    const actions = `<button class="button secondary" data-generic-add="${esc(s.tab)}"><span data-icon="plus"></span>Add ${esc(tabs[s.tab])}</button><button class="button primary" data-action="export"><span data-icon="download"></span>Export current rows</button>`;
    main.innerHTML = `${pageHead('PEERING WORKBOOK · PORT EVIDENCE', 'Port connectivity', 'From/to devices, exact ports, VLANs, speeds, ODF paths and cable labels—each tied to its worksheet row.', actions)}
      <section class="stats-grid">${statCard('PORT / CABLING ROWS', c.stats.links || 0, `${c.stats.sourceSheets || 0} structured port worksheets`, 'link', 'violet')}${statCard('COMPLETE ENDPOINTS', c.stats.completeLinks || 0, 'Both devices and both ports present', 'topology', 'green')}${statCard('PARTIAL SOURCE ROWS', c.stats.partialLinks || 0, 'Blank endpoint evidence retained', 'alert', 'gap')}${statCard('ACCESS INVENTORY', c.stats.accessDevices || 0, 'HQ switch rows · credentials excluded', 'server')}${statCard('CABLE LABEL ROWS', c.stats.labels || 0, 'DC and WHIL-DC labeling tabs', 'rows')}</section>
      <div class="source-note"><span data-icon="info"></span><div><strong>No inferred connections.</strong> Only explicit port rows are shown. Genuine merged Excel cells are expanded from their top-left value; unmerged blanks stay partial. Any “connected” or “down” value is a copied worksheet status, never live health.</div></div>
      <section class="card records-card upgrade-card"><div class="upgrade-tabs">${Object.entries(tabs).map(([id, label]) => `<button class="${s.tab === id ? 'active' : ''}" data-connectivity-tab="${id}">${esc(label)}<span>${(c[id] || []).length}</span></button>`).join('')}</div>
        <div class="records-toolbar"><div class="inline-search"><span data-icon="search"></span><input id="connectivitySearch" placeholder="Filter device, port, VLAN, IP, label or source row…" value="${esc(s.query)}"></div><select class="select-control" id="connectivityScope">${optionTags(scopes, s.scope, 'All scopes')}</select>${filter ? `<select class="select-control" id="connectivityFilter">${optionTags(filter.values, s.filter, filter.label)}</select>` : ''}${s.tab === 'links' ? `<select class="select-control" id="connectivityEvidence"><option value="">All endpoint evidence</option><option value="complete" ${s.evidence === 'complete' ? 'selected' : ''}>Complete endpoints</option><option value="partial" ${s.evidence === 'partial' ? 'selected' : ''}>Partial source rows</option></select>` : ''}</div>
        <div class="table-wrap"><table class="data-table upgrade-table"><thead id="connectivityHead"></thead><tbody id="connectivityBody"></tbody></table></div><div class="table-footer"><span id="connectivityCount"></span><div class="pagination"><button class="button secondary small" data-connectivity-page="prev">Previous</button><span id="connectivityPageInfo"></span><button class="button secondary small" data-connectivity-page="next">Next</button></div></div></section>
      ${(c.notes || []).map(n => `<div class="source-note operational-note"><span data-icon="alert"></span><div><strong>${esc(n.title)}</strong> · ${esc(n.text)} <span class="source-ref">${esc(n.sourceSheet)} row ${n.sourceRow}</span></div></div>`).join('')}`;
    const reset = () => { s.page = 1; renderUpgradeTable('connectivity'); };
    document.getElementById('connectivitySearch').addEventListener('input', e => { s.query = e.target.value; reset(); });
    document.getElementById('connectivityScope').addEventListener('change', e => { s.scope = e.target.value; reset(); });
    document.getElementById('connectivityFilter')?.addEventListener('change', e => { s.filter = e.target.value; reset(); });
    document.getElementById('connectivityEvidence')?.addEventListener('change', e => { s.evidence = e.target.value; reset(); });
    renderUpgradeTable('connectivity');
  }
  function renderIpam() {
    const ip = DATA.ipam || { stats: {} }, s = state.ipam;
    const scopes = [...new Set(upgradeRecords('ipam').map(r => txt(r.scope)).filter(Boolean))].sort();
    const filter = upgradeFilterConfig('ipam');
    const tabs = { blocks: 'IP blocks', vlans: 'VLAN directory', devicePeers: 'Device peering', ispPeers: 'ISP peering', loopbacks: 'Loopbacks' };
    const blankVlans = (ip.vlans || []).filter(r => !txt(r.vlan)).length;
    const actions = `<button class="button secondary" data-generic-add="${esc(s.tab)}"><span data-icon="plus"></span>Add ${esc(tabs[s.tab])}</button><button class="button primary" data-action="export"><span data-icon="download"></span>Export current rows</button>`;
    main.innerHTML = `${pageHead('IPAM · VLAN · PEERING', 'IPAM & peering', 'A source-row directory for HQ/DC/NDC allocations, VLAN ownership, internal peering, ISP handoffs and loopbacks.', actions)}
      <section class="stats-grid">${statCard('IP BLOCKS / ALLOCATIONS', ip.stats.blocks || 0, 'HQ, DC, NDC and public-IP tables', 'rows', 'violet')}${statCard('VLAN ROWS', ip.stats.vlans || 0, `${blankVlans} blank VLAN ID preserved`, 'table', 'green')}${statCard('DEVICE PEERING', ip.stats.devicePeers || 0, 'DC and NDC From → To records', 'link')}${statCard('ISP PEERING', ip.stats.ispPeers || 0, 'DC, NDC and WHIL-DC handoffs', 'topology')}${statCard('LOOPBACKS', ip.stats.loopbacks || 0, 'DC router loopback interfaces', 'server', 'green')}</section>
      <div class="source-note"><span data-icon="info"></span><div><strong>IPAM without invented utilization.</strong> Allocation text is reproduced from the workbook; no free/used address claims are calculated. Independent tables on the same worksheet row stay independent. ${blankVlans ? `The blank VLAN ID at HQ-VLAN row 91 remains visible.` : ''}</div></div>
      <section class="card records-card upgrade-card"><div class="upgrade-tabs">${Object.entries(tabs).map(([id, label]) => `<button class="${s.tab === id ? 'active' : ''}" data-ipam-tab="${id}">${esc(label)}<span>${(ip[id] || []).length}</span></button>`).join('')}</div>
        <div class="records-toolbar"><div class="inline-search"><span data-icon="search"></span><input id="ipamSearch" placeholder="Filter CIDR, IP, VLAN, device, ISP, owner or purpose…" value="${esc(s.query)}"></div><select class="select-control" id="ipamScope">${optionTags(scopes, s.scope, 'All scopes')}</select>${filter ? `<select class="select-control" id="ipamFilter">${optionTags(filter.values, s.filter, filter.label)}</select>` : ''}</div>
        <div class="table-wrap"><table class="data-table upgrade-table"><thead id="ipamHead"></thead><tbody id="ipamBody"></tbody></table></div><div class="table-footer"><span id="ipamCount"></span><div class="pagination"><button class="button secondary small" data-ipam-page="prev">Previous</button><span id="ipamPageInfo"></span><button class="button secondary small" data-ipam-page="next">Next</button></div></div></section>`;
    const reset = () => { s.page = 1; renderUpgradeTable('ipam'); };
    document.getElementById('ipamSearch').addEventListener('input', e => { s.query = e.target.value; reset(); });
    document.getElementById('ipamScope').addEventListener('change', e => { s.scope = e.target.value; reset(); });
    document.getElementById('ipamFilter')?.addEventListener('change', e => { s.filter = e.target.value; reset(); });
    renderUpgradeTable('ipam');
  }
  function upgradeRecord(collection, id) {
    const pools = { ...(DATA.connectivity || {}), ...(DATA.ipam || {}) };
    return Array.isArray(pools[collection]) ? pools[collection].find(r => r.id === id) : null;
  }
  function openUpgradeRecord(collection, id) {
    const r = upgradeRecord(collection, id); if (!r) return;
    const optional = (label, value, wide = false, mono = false) => txt(value) ? detailField(label, value, wide, mono) : '';
    let title = 'Workbook record', kicker = 'PEERING WORKBOOK', body = '';
    if (collection === 'links') {
      title = `${show(r.fromDevice, 'Blank source endpoint')} → ${show(r.toDevice, 'Blank target endpoint')}`;
      kicker = 'PORT / CABLING EVIDENCE';
      body = `<section class="detail-section"><h3>From endpoint</h3><div class="detail-grid">${detailField('Device', r.fromDevice)}${detailField('Location', r.fromLocation)}${detailField('Port', r.fromPort, false, true)}${detailField('Interface config', r.fromConfig)}${detailField('VLAN', r.fromVlan)}${detailField('IP', r.fromIp, false, true)}</div></section><section class="detail-section"><h3>To endpoint</h3><div class="detail-grid">${detailField('Device', r.toDevice)}${detailField('Location', r.toLocation)}${detailField('Port', r.toPort, false, true)}${detailField('Interface config', r.toConfig)}${detailField('VLAN', r.toVlan)}${detailField('IP', r.toIp, false, true)}</div></section><section class="detail-section"><h3>Link attributes</h3><div class="detail-grid">${optional('Speed', r.speed)}${optional('Worksheet status · not live', r.status)}${optional('Connection type', r.connectionType)}${optional('Remarks', r.remarks, true)}${optional('Switch port description', r.portDescription, true)}${optional('ODF from', r.odfFrom)}${optional('N5K switch', r.n5kSwitch)}${optional('N5K port', r.n5kPort)}${optional('ODF to', r.odfTo)}</div></section>`;
    } else if (collection === 'accessDevices') {
      title = show(r.hostname, r.ip || 'Unnamed access entry'); kicker = 'HQ ACCESS SWITCH INVENTORY';
      body = `<section class="detail-section"><h3>Device attributes</h3><div class="detail-grid">${detailField('Hostname', r.hostname)}${detailField('IP', r.ip, false, true)}${detailField('Model', r.model)}${detailField('Block', r.block)}${detailField('Building', r.building)}${detailField('Floor', r.floor)}${detailField('Uplink port', r.uplinkPort)}${detailField('Uplink device', r.uplinkDevice)}${detailField('Uplink switch port', r.uplinkSwitchPort)}${optional('Remarks', r.remarks, true)}</div></section><div class="drawer-note">The source username column is deliberately excluded from this application snapshot.</div>`;
    } else if (collection === 'labels') {
      title = `${r.sourceSheet} · row ${r.sourceRow}`; kicker = 'CABLE LABEL EVIDENCE';
      body = `<section class="detail-section"><h3>Label cells · ${r.values.length}</h3>${r.values.map(v => `<div class="connection-card"><div class="connection-top"><span>${esc(v.text)}</span><span class="badge role">Column ${esc(v.column)}</span></div></div>`).join('')}</section>`;
    } else {
      const maps = {
        blocks: { title: show(r.cidr, r.purpose), kicker: 'IP BLOCK / ALLOCATION', fields: [['CIDR / IP', 'cidr'], ['Purpose', 'purpose'], ['Remarks', 'remarks'], ['Source columns', 'sourceColumns'], ['Address kind', 'addressKind']] },
        vlans: { title: `VLAN ${show(r.vlan, 'blank in source')}`, kicker: 'VLAN DIRECTORY', fields: [['VLAN', 'vlan'], ['Owner', 'owner'], ['Building', 'building'], ['Floor / location', 'floor'], ['Description', 'description']] },
        devicePeers: { title: `${show(r.fromDevice)} → ${show(r.toDevice)}`, kicker: 'DEVICE PEERING', fields: [['From device', 'fromDevice'], ['From IP', 'fromIp'], ['From VIP', 'fromVip'], ['To device', 'toDevice'], ['To IP', 'toIp'], ['To VIP', 'toVip'], ['Network', 'network'], ['Remarks', 'remarks']] },
        ispPeers: { title: `${show(r.isp)} · ${show(r.linkType)}`, kicker: 'ISP PEERING', fields: [['ISP', 'isp'], ['Link type', 'linkType'], ['Network', 'network'], ['VLAN', 'vlan'], ['R1 IP', 'r1Ip'], ['R2 IP', 'r2Ip'], ['ISP end IP', 'ispEndIp'], ['BGP neighbour', 'bgpNeighborIp'], ['ASN', 'asn'], ['Remarks', 'remarks']] },
        loopbacks: { title: `${show(r.device)} · ${show(r.interface)}`, kicker: 'LOOPBACK INTERFACE', fields: [['Device', 'device'], ['Interface', 'interface'], ['IP / CIDR', 'cidr'], ['Remarks', 'remarks']] },
      };
      const config = maps[collection]; if (!config) return;
      title = config.title; kicker = config.kicker;
      body = `<section class="detail-section"><h3>Workbook attributes</h3><div class="detail-grid">${config.fields.map(([label, key]) => detailField(label, r[key], ['purpose', 'remarks', 'description', 'bgpNeighborIp'].includes(key), ['cidr', 'network', 'fromIp', 'fromVip', 'toIp', 'toVip', 'r1Ip', 'r2Ip', 'ispEndIp', 'bgpNeighborIp'].includes(key))).join('')}</div></section>`;
    }
    openDrawer(`<div class="drawer-head"><button class="icon-button drawer-close" data-close-drawer><span data-icon="close"></span></button><div class="drawer-kicker">${esc(kicker)}</div><h2 style="font-size:16px">${esc(title)}</h2><div class="drawer-badges"><span class="badge role">${esc(r.category || collection)}</span><span class="badge ${txt(r.scope).includes('NDC') ? 'ndc' : 'dc'}">${esc(r.scope || 'HQ')}</span>${r.partial ? '<span class="badge gap">Partial source row</span>' : ''}</div><div class="drawer-actions"><button class="button secondary small" data-generic-edit="${esc(collection)}" data-generic-id="${esc(id)}"><span data-icon="edit"></span>Edit</button><button class="button danger small" data-generic-delete="${esc(collection)}" data-generic-id="${esc(id)}"><span data-icon="trash"></span>Delete</button></div></div><div class="drawer-body">${body}<section class="detail-section"><h3>Source provenance</h3><div class="detail-grid">${detailField('Workbook', DATA.upgradeMeta?.workbook, true)}${detailField('Source tab', r.sourceSheet)}${detailField('Source row', r.sourceRow)}</div></section><div class="drawer-note">Local editable workspace record. Merged cells were expanded only where the workbook defines a merge; other blanks are not guessed. No live reachability, health or IP utilization is implied. Reset edits restores the source snapshot.</div></div>`);
  }
  function upgradeSearchEntry(collection, r) {
    const view = Object.prototype.hasOwnProperty.call(DATA.connectivity || {}, collection) ? 'connectivity' : 'ipam';
    const base = { type: 'upgrade', collection, id: r.id, view, kind: view === 'connectivity' ? 'Port' : 'IPAM' };
    if (collection === 'links') return { ...base, title: `${show(r.fromDevice)} → ${show(r.toDevice)}`, sub: `${show(r.fromPort)} → ${show(r.toPort)} · ${r.sourceSheet} #${r.sourceRow}`, kind: 'Port' };
    if (collection === 'accessDevices') return { ...base, title: show(r.hostname, r.ip), sub: `${show(r.ip)} · ${show(r.building)}`, kind: 'Access' };
    if (collection === 'labels') return { ...base, title: truncate(r.text, 70), sub: `${r.sourceSheet} #${r.sourceRow}`, kind: 'Label' };
    if (collection === 'blocks') return { ...base, title: show(r.cidr, r.purpose), sub: `${show(r.purpose)} · ${r.scope}`, kind: 'IP' };
    if (collection === 'vlans') return { ...base, title: `VLAN ${show(r.vlan, 'blank')} · ${show(r.building, r.owner)}`, sub: show(r.description, r.owner), kind: 'VLAN' };
    if (collection === 'devicePeers') return { ...base, title: `${show(r.fromDevice)} → ${show(r.toDevice)}`, sub: `${show(r.network)} · ${r.sourceSheet} #${r.sourceRow}`, kind: 'Peer' };
    if (collection === 'ispPeers') return { ...base, title: `${show(r.isp)} · ${show(r.linkType)}`, sub: `${show(r.network)} · VLAN ${show(r.vlan)}`, kind: 'ISP' };
    return { ...base, title: `${show(r.device)} · ${show(r.interface)}`, sub: show(r.cidr), kind: 'Loopback' };
  }
  function upgradeSearchResults(q) {
    const pools = { ...(DATA.connectivity || {}), ...(DATA.ipam || {}) };
    const results = [];
    const allowed = new Set(['links', 'accessDevices', 'labels', 'blocks', 'vlans', 'devicePeers', 'ispPeers', 'loopbacks']);
    Object.entries(pools).forEach(([collection, records]) => {
      if (!allowed.has(collection) || !Array.isArray(records)) return;
      records.filter(r => JSON.stringify(r).toLowerCase().includes(q)).slice(0, 5).forEach(r => results.push(upgradeSearchEntry(collection, r)));
    });
    return results;
  }
  function coreEvidenceExportDefinition() {
    const records = coreEvidenceRecords();
    return {
      filename: 'NetAtlas-workbook-core-links.csv',
      headers: ['Scope', 'Category', 'From Device', 'From Location', 'From Port', 'From Config', 'From VLAN', 'From IP', 'To Device', 'To Location', 'To Port', 'To Config', 'To VLAN', 'To IP', 'Speed', 'Partial', 'Remarks', 'Source Sheet', 'Source Row'],
      rows: records.map(r => [r.scope, r.category, r.fromDevice, r.fromLocation, r.fromPort, r.fromConfig, r.fromVlan, r.fromIp, r.toDevice, r.toLocation, r.toPort, r.toConfig, r.toVlan, r.toIp, r.speed, r.partial ? 'YES' : 'NO', r.remarks, r.sourceSheet, r.sourceRow]),
    };
  }
  function upgradeExportDefinition(view) {
    const s = state[view], records = filteredUpgrade(view), tab = s.tab;
    const source = r => [r.sourceSheet, r.sourceRow];
    if (view === 'connectivity' && tab === 'links') return { filename: 'NetAtlas-port-connectivity.csv', headers: ['Scope', 'Category', 'From Device', 'From Location', 'From Port', 'From Config', 'From VLAN', 'From IP', 'To Device', 'To Location', 'To Port', 'To Config', 'To VLAN', 'To IP', 'Speed', 'Worksheet Status', 'Connection Type', 'Partial', 'Remarks', 'Source Sheet', 'Source Row'], rows: records.map(r => [r.scope, r.category, r.fromDevice, r.fromLocation, r.fromPort, r.fromConfig, r.fromVlan, r.fromIp, r.toDevice, r.toLocation, r.toPort, r.toConfig, r.toVlan, r.toIp, r.speed, r.status, r.connectionType, r.partial ? 'YES' : 'NO', r.remarks, ...source(r)]) };
    if (view === 'connectivity' && tab === 'accessDevices') return { filename: 'NetAtlas-HQ-access-inventory.csv', headers: ['Hostname', 'IP', 'Model', 'Block', 'Building', 'Floor', 'Uplink Port', 'Uplink Device', 'Uplink Switch Port', 'Remarks', 'Source Sheet', 'Source Row'], rows: records.map(r => [r.hostname, r.ip, r.model, r.block, r.building, r.floor, r.uplinkPort, r.uplinkDevice, r.uplinkSwitchPort, r.remarks, ...source(r)]) };
    if (view === 'connectivity') return { filename: 'NetAtlas-cable-labels.csv', headers: ['Scope', 'Label Text', 'Source Sheet', 'Source Row'], rows: records.map(r => [r.scope, r.text, ...source(r)]) };
    if (tab === 'blocks') return { filename: 'NetAtlas-IP-blocks.csv', headers: ['Scope', 'Category', 'CIDR / IP', 'Purpose', 'Remarks', 'Source Columns', 'Source Sheet', 'Source Row'], rows: records.map(r => [r.scope, r.category, r.cidr, r.purpose, r.remarks, r.sourceColumns, ...source(r)]) };
    if (tab === 'vlans') return { filename: 'NetAtlas-VLAN-directory.csv', headers: ['VLAN', 'Owner', 'Building', 'Floor', 'Description', 'Source Sheet', 'Source Row'], rows: records.map(r => [r.vlan, r.owner, r.building, r.floor, r.description, ...source(r)]) };
    if (tab === 'devicePeers') return { filename: 'NetAtlas-device-peering.csv', headers: ['Scope', 'From Device', 'From IP', 'From VIP', 'To Device', 'To IP', 'To VIP', 'Network', 'Remarks', 'Source Sheet', 'Source Row'], rows: records.map(r => [r.scope, r.fromDevice, r.fromIp, r.fromVip, r.toDevice, r.toIp, r.toVip, r.network, r.remarks, ...source(r)]) };
    if (tab === 'ispPeers') return { filename: 'NetAtlas-ISP-peering.csv', headers: ['Scope', 'ISP', 'Link Type', 'Network', 'VLAN', 'R1 IP', 'R2 IP', 'ISP End IP', 'BGP Neighbour', 'ASN', 'Remarks', 'Source Sheet', 'Source Row'], rows: records.map(r => [r.scope, r.isp, r.linkType, r.network, r.vlan, r.r1Ip, r.r2Ip, r.ispEndIp, r.bgpNeighborIp, r.asn, r.remarks, ...source(r)]) };
    return { filename: 'NetAtlas-loopbacks.csv', headers: ['Device', 'Interface', 'IP / CIDR', 'Remarks', 'Source Sheet', 'Source Row'], rows: records.map(r => [r.device, r.interface, r.cidr, r.remarks, ...source(r)]) };
  }

  function renderRecords() {
    const b = bundle(), s = b.stats, r = state.record;
    const zones = [...new Set(allRegisterRows().map(row => txt(row.zone)).filter(Boolean))].sort();
    const actions = `<button class="button primary" data-action="add-device"><span data-icon="plus"></span>Add device</button><button class="button secondary" data-action="export"><span data-icon="download"></span>Export filtered CSV</button><button class="button ghost" data-action="reset-workspace">Reset edits</button>`;
    main.innerHTML = `${pageHead('SOURCE OF TRUTH', `${state.site} source records`, 'Inspect every extracted register row, including raw neighbour gaps and derived paths.', actions)}
      <section class="stats-grid four">${statCard('ALL SOURCE ROWS', s.rows, 'Complete main register extract', 'rows')}${statCard('CORE', s.roles.Core, '38 shared rows in each perspective', 'server', 'violet')}${statCard('DISTRIBUTION', s.roles.Distribution, 'Main register rows', 'topology')}${statCard('ACCESS', s.roles.Access, 'Main register rows', 'devices', 'green')}</section>
      <section class="card records-card"><div class="records-toolbar"><div class="inline-search"><span data-icon="search"></span><input id="recordSearch" placeholder="Filter device, neighbour, IP, serial, model or path…" value="${esc(r.query)}"></div><select class="select-control" id="recordRole"><option value="">All roles</option>${['Core', 'Distribution', 'Access', 'Discovered'].map(role => `<option value="${role}" ${r.role === role ? 'selected' : ''}>${role}</option>`).join('')}</select><select class="select-control" id="recordZone"><option value="">All zones</option>${zones.map(zone => `<option value="${esc(zone)}" ${r.zone === zone ? 'selected' : ''}>${esc(zone)}</option>`).join('')}</select><label class="check-control"><input type="checkbox" id="recordGap" ${r.gap ? 'checked' : ''}>Source gaps only</label></div>
        <div class="table-wrap"><table class="data-table"><thead><tr><th>Row</th><th>Role</th><th>Local device</th><th>IP</th><th>Model</th><th>Serial / Asset ID</th><th>Neighbour</th><th>Uplink port</th><th>Neighbour port</th><th>Building VLAN</th><th>Floor / location</th><th>Zone</th><th>Derived topology path</th></tr></thead><tbody id="recordsBody"></tbody></table></div>
        <div class="table-footer"><span id="recordsCount"></span><div class="pagination"><button class="button secondary small" data-page="prev">Previous</button><span id="pageInfo"></span><button class="button secondary small" data-page="next">Next</button></div></div></section>`;
    const resetAndRender = () => { r.page = 1; renderRecordsTable(); };
    document.getElementById('recordSearch').addEventListener('input', e => { r.query = e.target.value; resetAndRender(); });
    document.getElementById('recordRole').addEventListener('change', e => { r.role = e.target.value; resetAndRender(); });
    document.getElementById('recordZone').addEventListener('change', e => { r.zone = e.target.value; resetAndRender(); });
    document.getElementById('recordGap').addEventListener('change', e => { r.gap = e.target.checked; resetAndRender(); });
    renderRecordsTable();
  }

  function filteredRecords() {
    const r = state.record, q = r.query.toLowerCase().trim();
    return allRegisterRows().filter(row => {
      if (r.role && row.roleShort !== r.role) return false;
      if (r.zone && txt(row.zone) !== r.zone) return false;
      if (r.gap && !row.sourceGap) return false;
      if (q && !Object.values(row).join(' ').toLowerCase().includes(q)) return false;
      return true;
    });
  }

  function renderRecordsTable() {
    const body = document.getElementById('recordsBody'); if (!body) return;
    const rows = filteredRecords(), r = state.record;
    const pages = Math.max(1, Math.ceil(rows.length / r.perPage)); r.page = Math.min(r.page, pages);
    const visible = rows.slice((r.page - 1) * r.perPage, r.page * r.perPage);
    body.innerHTML = visible.length ? visible.map(row => `<tr class="${row.sourceGap ? 'gap-row' : ''}" data-record-id="${esc(row.id)}"><td class="mono">${row.row ?? 'NEW'}</td><td><span class="badge role">${esc(row.roleShort)}</span></td><td class="device-cell">${esc(row.device)}</td><td class="mono">${esc(show(row.ip))}</td><td>${esc(show(row.model))}</td><td class="mono">${esc(show(row.serial))}</td><td>${row.sourceGap ? '<span class="badge gap">SOURCE GAP</span>' : esc(row.neighbor)}</td><td>${esc(show(row.uplinkPort))}</td><td>${esc(show(row.neighborPort))}</td><td>${esc(show(row.buildingVlan))}</td><td>${esc(show(row.floor))}</td><td>${esc(show(row.zone))}</td><td class="path-cell">${esc(show(row.path))}</td></tr>`).join('') : '<tr><td colspan="13"><div class="empty-state"><strong>No matching records</strong>Change or clear the filters.</div></td></tr>';
    document.getElementById('recordsCount').textContent = `${rows.length} matching rows · showing ${visible.length ? (r.page - 1) * r.perPage + 1 : 0}–${(r.page - 1) * r.perPage + visible.length}`;
    document.getElementById('pageInfo').textContent = `Page ${r.page} / ${pages}`;
    document.querySelector('[data-page="prev"]').disabled = r.page <= 1;
    document.querySelector('[data-page="next"]').disabled = r.page >= pages;
  }

  function handlePendingFocus() {
    if (!state.pendingFocus) return;
    const pending = state.pendingFocus; state.pendingFocus = null;
    setTimeout(() => {
      if (pending.type === 'node') {
        if (graphRuntime) graphRuntime.centerOnNode(pending.id); else openNode(pending.id);
      } else if (pending.type === 'unified-node') {
        if (graphRuntime) graphRuntime.centerOnNode(pending.id); else openUnifiedNode(pending.id);
      } else if (pending.type === 'upgrade') {
        openUpgradeRecord(pending.collection, pending.id);
        const el = main.querySelector(`[data-upgrade-id="${CSS.escape(pending.id)}"]`);
        el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      } else {
        openEntry(pending.type, pending.id);
        const el = main.querySelector(`[data-entry-id="${CSS.escape(pending.id)}"]`);
        el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
    }, 90);
  }

  function exportCurrent() {
    let filename, headers, rows;
    if (state.view === 'architecture' && state.archMode === 'unified') {
      const model = filteredUnifiedAtlas(), byId = new Map(model.atlas.allNodes.map(n => [n.id, n]));
      filename = `unified-ip-architecture-${state.unifiedScope.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.csv`;
      headers = ['Canonical Device', 'Primary IP', 'Aliases', 'Layer', 'Site', 'Connected Device', 'Connected Primary IP', 'Connected Aliases', 'Connection Types', 'Evidence Rows', 'Source Sheets'];
      rows = model.links.map(link => {
        const source = byId.get(link.source), target = byId.get(link.target);
        return [source?.label, source?.primaryIp, source?.aliases.join(' | '), source?.layer, source?.site, target?.label, target?.primaryIp, target?.aliases.join(' | '), link.types.join(' | '), link.count, link.sourceSheets.join(' | ')];
      });
      model.nodes.filter(n => !model.links.some(link => link.source === n.id || link.target === n.id)).forEach(n => rows.push([n.label, n.primaryIp, n.aliases.join(' | '), n.layer, n.site, '', '', '', '', 0, '']));
    } else if (state.view === 'datacenter' && state.dcGraphMode === 'core') {
      const definition = coreEvidenceExportDefinition();
      filename = definition.filename; headers = definition.headers; rows = definition.rows;
    } else if (state.view === 'connectivity' || state.view === 'ipam') {
      const definition = upgradeExportDefinition(state.view);
      filename = definition.filename; headers = definition.headers; rows = definition.rows;
    } else if (state.view === 'datacenter' && state.dcGraphMode === 'register') {
      filename = `${state.site}-main-register-core.csv`;
      headers = ['Workbook Row', 'Role', 'Local Device', 'IP', 'Neighbor Device', 'Uplink Port', 'Neighbor Port', 'Local VLAN', 'Neighbor VLAN', 'Source Gap'];
      rows = allRegisterRows().filter(r => r.roleShort === 'Core').map(r => [r.row, r.role, r.device, r.ip, r.neighbor, r.uplinkPort, r.neighborPort, r.localVlan, r.neighborVlan, r.sourceGap ? 'YES' : 'NO']);
    } else if (state.view === 'datacenter') {
      filename = `${state.site}-DC-NDC.csv`; headers = ['Side', 'Source Row', 'Node', 'IP', 'VLAN', 'Display Group'];
      rows = ['NDC', 'DC'].flatMap(filteredDc).map(e => [e.side, e.row, e.node, e.ip, e.zone, dcSourceGroupName(dcSourceGroup(e))]);
    } else if (state.view === 'dmz') {
      filename = `${state.site}-DMZ-MZ.csv`; headers = ['Side', 'Workbook Row', 'Node', 'IP', 'Zone'];
      rows = ['DMZ', 'MZ'].flatMap(filteredDmz).map(e => [e.side, e.row, e.node, e.ip, e.zone]);
    } else {
      filename = `${state.site}-network-records.csv`;
      headers = ['Workbook Row', 'Role', 'Local Device', 'Model', 'Serial / Asset ID', 'IP', 'Uplink Port', 'Local VLAN', 'Neighbor Device', 'Neighbor Port', 'Neighbor VLAN', 'Neighbor Serial', 'Building VLAN', 'Floor', 'Zone', 'Direct Connection', 'Derived Topology Path', 'Source Gap'];
      const source = state.view === 'records' ? filteredRecords() : allRegisterRows();
      rows = source.map(r => [r.row, r.role, r.device, r.model, r.serial, r.ip, r.uplinkPort, r.localVlan, r.neighbor, r.neighborPort, r.neighborVlan, r.neighborSerial, r.buildingVlan, r.floor, r.zone, r.direct, r.path, r.sourceGap ? 'YES' : 'NO']);
    }
    const cell = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = '\ufeff' + [headers, ...rows].map(row => row.map(cell).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000); toast(`${filename} · ${rows.length} rows prepared`);
  }

  function updateSearch() {
    const q = searchInput.value.toLowerCase().trim();
    if (!q) { searchResults.hidden = true; currentSearchResults = []; return; }
    const normalizedQuery = normName(q).toLowerCase();
    const b = bundle();
    const nodes = unifiedAtlas().allNodes.filter(n => {
      const haystack = `${n.label} ${(n.aliases || []).join(' ')} ${n.ips.join(' ')} ${n.serials.join(' ')} ${n.models.join(' ')}`;
      return haystack.toLowerCase().includes(q) || normName(haystack).toLowerCase().includes(normalizedQuery);
    }).map(n => ({ type: 'unified', id: n.id, title: n.label, sub: `${show(n.primaryIp, 'No IP recorded')}${n.mergedCount ? ` · ${n.mergedCount} aliases` : ''}`, kind: n.layer }));
    const dc = b.dataCenter.filter(e => dcSourceGroup(e) && `${txt(e.node)} ${txt(e.ip)} ${txt(e.zone)}`.toLowerCase().includes(q)).map(e => ({ type: 'dc', id: e.id, title: show(e.node, 'Unnamed entry'), sub: show(e.ip), kind: e.side }));
    const dmz = b.dmzMz.filter(e => `${txt(e.node)} ${txt(e.ip)} ${txt(e.zone)}`.toLowerCase().includes(q)).map(e => ({ type: 'dmz', id: e.id, title: show(e.node, 'Unnamed entry'), sub: show(e.ip), kind: e.side }));
    currentSearchResults = [...nodes, ...dc, ...dmz, ...upgradeSearchResults(q)].slice(0, 12);
    searchResults.innerHTML = currentSearchResults.length ? currentSearchResults.map((r, i) => `<button class="search-result" data-search-index="${i}"><span class="search-result-icon">${esc(r.kind.slice(0, 2).toUpperCase())}</span><span class="search-result-text"><strong>${esc(r.title)}</strong><span>${esc(r.sub)}</span></span><span class="search-result-type">${esc(r.kind)}</span></button>`).join('') : '<div class="search-empty">No device, IP, VLAN, port, serial or service matches this search.</div>';
    searchResults.hidden = false;
  }

  function chooseSearchResult(index) {
    const result = currentSearchResults[index]; if (!result) return;
    searchResults.hidden = true; searchInput.value = '';
    if (result.type === 'upgrade') {
      state.view = result.view;
      Object.assign(state[result.view], { tab: result.collection, query: '', scope: '', filter: '', page: 1 });
      if (result.view === 'connectivity') state.connectivity.evidence = '';
      state.pendingFocus = { type: 'upgrade', collection: result.collection, id: result.id };
    } else if (result.type === 'unified') {
      const n = unifiedAtlas().allNodes.find(node => node.id === result.id);
      state.view = 'architecture'; state.archMode = 'unified'; state.unifiedScope = 'All';
      if (n) state.unifiedLayers.add(n.layer);
      state.pendingFocus = { type: 'unified-node', id: result.id };
    } else if (result.type === 'node') {
      const n = nodeById(result.id);
      state.view = state.view === 'datacenter' && n.role === 'Core' ? 'datacenter' : 'architecture';
      if (state.view === 'datacenter') state.dcGraphMode = 'register';
      state.layers.add(n.role); state.pendingFocus = { type: 'node', id: result.id };
    } else {
      state.view = result.type === 'dc' ? 'datacenter' : 'dmz';
      if (result.type === 'dc') state.dcGraphMode = 'devices';
      state.pendingFocus = { type: result.type, id: result.id };
    }
    closeDrawer(); render();
  }

  function normName(v) {
    return txt(v).toUpperCase().replace(/_/g, '-').replace(/\s*-\s*/g, '-').replace(/\s+/g, '-').replace(/-{2,}/g, '-').replace(/^-|-$/g, '');
  }
  function normSerial(v) { return txt(v).toUpperCase().replace(/\s+/g, ''); }
  function makeDirect(row) {
    if (!txt(row.neighbor)) return txt(row.device);
    return `${txt(row.device)} [${txt(row.uplinkPort)}] → ${txt(row.neighbor)} [${txt(row.neighborPort)}]`;
  }

  // Rebuild the visual graph from edited rows. Only explicit neighbours create edges.
  function rebuildSite(site, targetBundle = null) {
    const b = targetBundle || DATA.sites[site], rows = b.rows;
    const nodes = {}, serialIndex = new Map();
    const roleShort = row => row.roleShort || ({ 'Core Device': 'Core', 'Distribution Device': 'Distribution', 'Access SW': 'Access', 'Discovered Device': 'Discovered' }[row.role] || 'Access');
    const makeNode = (id, label, referenced = false) => ({ id, label: txt(label), role: referenced ? 'Referenced' : null, roles: referenced ? ['Referenced'] : [], zone: null, zones: [], model: null, models: [], serial: null, serials: [], ip: null, ips: [], buildingVlan: null, buildingVlans: [], floor: null, floors: [], rows: [], referencedRows: [], gapRows: [], referencedOnly: referenced, parentHint: null });
    const addUnique = (node, plural, singular, value) => {
      if (!txt(value)) return;
      if (node[singular] === null || node[singular] === undefined) node[singular] = value;
      if (!node[plural].some(v => txt(v) === txt(value))) node[plural].push(value);
    };
    rows.forEach(row => {
      row.roleShort = roleShort(row);
      row.sourceGap = !txt(row.neighbor) && !row.noLinkExpected;
      const id = normName(row.device);
      if (!id) throw new Error(`Blank local device at ${row.id}`);
      if (!nodes[id]) nodes[id] = makeNode(id, row.device);
      const node = nodes[id]; node.referencedOnly = false; node.rows.push(row.id);
      if (!node.roles.includes(row.roleShort)) node.roles.push(row.roleShort);
      node.role = node.roles[0];
      [['zones', 'zone', 'zone'], ['models', 'model', 'model'], ['serials', 'serial', 'serial'], ['ips', 'ip', 'ip'], ['buildingVlans', 'buildingVlan', 'buildingVlan'], ['floors', 'floor', 'floor']].forEach(([plural, singular, field]) => addUnique(node, plural, singular, row[field]));
      if (row.sourceGap) node.gapRows.push(row.id);
      const serial = normSerial(row.serial);
      if (serial) { if (!serialIndex.has(serial)) serialIndex.set(serial, new Set()); serialIndex.get(serial).add(id); }
    });
    const buildingNumber = key => {
      const match = key.match(/(?:^|-)BUILDING-(\d+)(?:-|$)/) || key.match(/(?:^|-)B-?(\d+)(?:-|$)/);
      return match ? Number(match[1]) : null;
    };
    const buildingAlias = key => {
      if (!key.includes('DIST') && !key.includes('CORE')) return null;
      const number = buildingNumber(key); if (number === null) return null;
      let candidates = Object.values(nodes).filter(n => n.role === 'Distribution' && buildingNumber(n.id) === number);
      if (key.startsWith('WMTC')) candidates = candidates.filter(n => n.id.startsWith('WMTC'));
      else if (key.startsWith('WHIL')) candidates = candidates.filter(n => n.id.startsWith('WHIL'));
      return candidates.length === 1 ? candidates[0].id : null;
    };
    const resolveNeighbor = row => {
      const key = normName(row.neighbor);
      if (nodes[key]) return { id: key, match: 'normalised-name' };
      if (key.endsWith('-01') && nodes[key.slice(0, -3)]) return { id: key.slice(0, -3), match: 'explicit-01-alias' };
      const alias = buildingAlias(key);
      if (alias) return { id: alias, match: 'building-alias' };
      const serial = normSerial(row.neighborSerial);
      if (serial && serialIndex.has(serial)) {
        const candidates = [...serialIndex.get(serial)];
        if (candidates.length === 1) return { id: candidates[0], match: 'unique-neighbor-serial' };
        const base = key.endsWith('-01') || key.endsWith('-02') ? key.slice(0, -3) : key;
        const matches = candidates.filter(c => c === base || c.startsWith(base + '-') || base.startsWith(c + '-'));
        if (matches.length === 1) return { id: matches[0], match: 'serial-and-name' };
      }
      return { id: 'ref:' + key, match: 'referenced-only' };
    };
    const edges = [];
    rows.forEach(row => {
      if (row.sourceGap) return;
      const resolved = resolveNeighbor(row), target = resolved.id;
      if (!nodes[target]) nodes[target] = makeNode(target, row.neighbor, true);
      const node = nodes[target];
      if (!node.referencedRows.includes(row.id)) node.referencedRows.push(row.id);
      addUnique(node, 'serials', 'serial', row.neighborSerial);
      edges.push({ id: 'edge-' + row.id, rowId: row.id, source: normName(row.device), target, match: resolved.match, uplinkPort: row.uplinkPort, neighborPort: row.neighborPort, localVlan: row.localVlan, neighborVlan: row.neighborVlan, direct: row.direct, path: row.path, discoveryAssignment: row.discovery?.assignment === 'third-octet' ? 'third-octet' : null });
    });
    const grouped = {};
    edges.forEach(edge => {
      const key = `${edge.source}=>${edge.target}`;
      if (!grouped[key]) grouped[key] = { id: `link:${edge.source}=>${edge.target}`, source: edge.source, target: edge.target, links: [], count: 0 };
      grouped[key].links.push(edge); grouped[key].count += 1;
    });
    const outgoing = new Map(Object.keys(nodes).map(id => [id, new Set()]));
    edges.forEach(e => outgoing.get(e.source)?.add(e.target));
    Object.values(nodes).forEach(node => {
      const direct = [...(outgoing.get(node.id) || [])].filter(id => nodes[id]).map(id => nodes[id]);
      const distributions = direct.filter(n => n.role === 'Distribution').map(n => n.label);
      const parents = distributions.length ? distributions : direct.map(n => n.label);
      const counts = {}; parents.forEach(p => counts[p] = (counts[p] || 0) + 1);
      node.parentHint = parents.length ? Object.keys(counts).sort((a, b) => counts[b] - counts[a] || a.localeCompare(b))[0] : null;
      node.rootHint = null; node.rootKey = null;
      if (node.role !== 'Access') return;
      const queue = [node.id], seen = new Set([node.id]); let found = null;
      while (queue.length && !found) {
        const current = queue.shift();
        for (const target of [...(outgoing.get(current) || [])].sort()) {
          if (seen.has(target) || !nodes[target]) continue;
          if (nodes[target].role === 'Distribution') { found = target; break; }
          seen.add(target); queue.push(target);
        }
      }
      if (found) { node.rootHint = nodes[found].label; node.rootKey = found; }
    });

    // Derived paths are recalculated only for app-edited rows, from explicit links.
    const adjacency = new Map(Object.keys(nodes).map(id => [id, new Set()]));
    edges.forEach(e => { adjacency.get(e.source)?.add(e.target); adjacency.get(e.target)?.add(e.source); });
    const coreIds = new Set(Object.values(nodes).filter(n => n.role === 'Core').map(n => n.id));
    const pathCache = new Map();
    const pathToCore = start => {
      if (pathCache.has(start)) return pathCache.get(start);
      if (coreIds.has(start)) { pathCache.set(start, [start]); return [start]; }
      const queue = [[start]], seen = new Set([start]); let found = null;
      while (queue.length && !found) {
        const current = queue.shift(), last = current[current.length - 1];
        const next = [...(adjacency.get(last) || [])].sort();
        for (const id of next) {
          if (seen.has(id)) continue;
          const path = [...current, id];
          if (coreIds.has(id)) { found = path; break; }
          seen.add(id); queue.push(path);
        }
      }
      pathCache.set(start, found); return found;
    };
    rows.forEach(row => {
      row.direct = row.derivedByApp ? makeDirect(row) : row.direct;
      if (!row.derivedByApp) return;
      const start = normName(row.device);
      if (nodes[start]?.role === 'Core') row.path = row.neighbor ? `${txt(row.device)} → ${txt(row.neighbor)}` : txt(row.device);
      else {
        const path = pathToCore(start);
        row.path = path && path.length > 1 ? [...path].reverse().map(id => nodes[id]?.label || id).join(' → ') : txt(row.device);
      }
    });
    b.nodes = Object.values(nodes).sort((a, b) => (a.role || '').localeCompare(b.role || '') || a.label.localeCompare(b.label));
    b.edges = edges; b.links = Object.values(grouped);
    const roles = { Core: 0, Distribution: 0, Access: 0, Discovered: 0 }, zones = {};
    rows.forEach(row => { roles[row.roleShort] = (roles[row.roleShort] || 0) + 1; const zone = txt(row.zone) || 'Unspecified'; zones[zone] = (zones[zone] || 0) + 1; });
    const countSide = (list = [], side) => (list || []).filter(e => e.side === side).length;
    b.stats = {
      ...b.stats, rows: rows.length, devices: b.nodes.filter(n => !n.referencedOnly).length,
      referenced: b.nodes.filter(n => n.referencedOnly).length, documentedLinks: edges.length,
      aggregatedLinks: b.links.length, sourceGaps: rows.filter(r => r.sourceGap).length, roles, zones,
      dataCenter: { NDC: countSide(b.dataCenter, 'NDC'), DC: countSide(b.dataCenter, 'DC') },
      dmzMz: { DMZ: countSide(b.dmzMz, 'DMZ'), MZ: countSide(b.dmzMz, 'MZ') },
    };
  }

  function rebuildAllGraphs() {
    unifiedCacheModel = null;
    Object.keys(DATA.sites || {}).forEach(site => rebuildSite(site));
    if (DATA.discovered?.rows) rebuildSite(state.site, discoveryBundle());
  }

  async function persist() {
    unifiedCacheModel = null;
    DATA.meta ||= {}; DATA.meta.sourceSnapshotVersion ||= 1; DATA.meta.updatedAt = new Date().toISOString();
    const payload = JSON.stringify(DATA); let serverSaved = false;
    try {
      const response = await fetch('/api/state', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: payload });
      serverSaved = response.ok;
    } catch { /* file:// or an unavailable preview API uses browser storage */ }
    try { localStorage.setItem(STORAGE_KEY, payload); } catch { /* storage quota/private mode */ }
    const status = document.getElementById('saveStatus');
    if (status) status.textContent = serverSaved ? 'Changes saved' : 'Saved in this browser';
    return serverSaved;
  }

  async function resetWorkspace() {
    if (!confirm('Reset all GUI additions, edits and deletes back to the workbook snapshot?')) return;
    let serverReset = false;
    try { const response = await fetch('/api/state', { method: 'DELETE' }); serverReset = response.ok; } catch { /* browser fallback */ }
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* no-op */ }
    DATA = JSON.parse(JSON.stringify(ORIGINAL_DATA));
    DATA.meta ||= {}; DATA.meta.sourceSnapshotVersion = 1;
    closeEditor(); closeDrawer();
    if (!serverReset) await persist();
    const status = document.getElementById('saveStatus'); if (status) status.textContent = 'Workbook snapshot';
    render(); toast('Workbook snapshot restored');
  }

  function openGenericEditor(collection, id = null) {
    const schema = window.WorkspaceCrud.schemas[collection]; if (!schema) return;
    const existing = id ? window.WorkspaceCrud.getRecord(DATA, collection, id, state.site) : null;
    if (id && !existing) { toast('This record is no longer in the active workspace'); return; }
    genericDraft = { collection, id, values: { ...(schema.default || {}), ...(existing || {}), id: id || window.WorkspaceCrud.newId(collection) } };
    renderGenericEditor();
  }

  function renderGenericEditor() {
    if (!genericDraft) return;
    const d = genericDraft, schema = window.WorkspaceCrud.schemas[d.collection];
    const fields = schema.fields.map(field => {
      const value = d.values[field.key] ?? '', required = field.required ? 'required' : '';
      const wide = field.type === 'textarea' || ['purpose', 'remarks', 'description', 'text'].includes(field.key) ? 'wide' : '';
      let control;
      if (field.type === 'textarea') control = `<textarea data-generic-field="${field.key}" ${required}>${esc(value)}</textarea>`;
      else if (field.type === 'select') control = `<select data-generic-field="${field.key}" ${required}>${(field.options || []).map(option => `<option value="${esc(option)}" ${value === option ? 'selected' : ''}>${esc(option)}</option>`).join('')}</select>`;
      else control = `<input type="${field.type === 'number' ? 'number' : 'text'}" data-generic-field="${field.key}" value="${esc(value)}" ${required}>`;
      return `<div class="form-field ${wide}"><label>${esc(field.label)}${field.required ? ' *' : ''}</label>${control}</div>`;
    }).join('');
    editorModal.innerHTML = `<form id="genericEditorForm"><div class="editor-head"><div><h2>${d.id ? 'Edit' : 'Add'} ${esc(schema.title)}</h2><p>Saved in the local NetAtlas workspace. Original Google Sheets remain unchanged.</p></div><button type="button" class="icon-button" data-close-editor><span data-icon="close"></span></button></div><div class="editor-body"><section class="editor-section"><div class="editor-section-title"><h3>${esc(schema.title)} attributes</h3><span>All supported fields are editable</span></div><div class="form-grid">${fields}</div></section></div><div class="editor-footer">${d.id ? `<button type="button" class="button danger" data-generic-delete-draft><span data-icon="trash"></span>Delete</button>` : '<span></span>'}<div class="editor-footer-right"><button type="button" class="button secondary" data-close-editor>Cancel</button><button type="submit" class="button primary"><span data-icon="save"></span>${d.id ? 'Update' : 'Add'} record</button></div></div></form>`;
    hydrateIcons(editorModal); editorBackdrop.hidden = false; editorModal.hidden = false;
  }

  async function saveGenericEditor(event) {
    event.preventDefault(); if (!genericDraft) return;
    const d = genericDraft, schema = window.WorkspaceCrud.schemas[d.collection], values = { ...d.values };
    for (const field of schema.fields) {
      if (field.required && !txt(values[field.key])) { toast(`${field.label} is required`); return; }
      if (field.type === 'number' && txt(values[field.key]) !== '') {
        const number = Number(values[field.key]);
        if (!Number.isFinite(number)) { toast(`${field.label} must be a number`); return; }
        values[field.key] = number;
      } else if (field.type === 'number') values[field.key] = null;
    }
    values.modified = true; if (!d.id) values.custom = true;
    try {
      window.WorkspaceCrud.upsert(DATA, d.collection, values, state.site);
      rebuildAllGraphs(); window.WorkspaceCrud.recomputeStats(DATA);
      closeEditor(); closeDrawer(); await persist(); render();
      toast(`${schema.title} ${d.id ? 'updated' : 'added'} and saved`);
    } catch (error) { toast(`Save failed: ${error.message}`); }
  }

  async function deleteGenericRecord(collection, id) {
    const schema = window.WorkspaceCrud.schemas[collection]; if (!schema) return;
    const record = window.WorkspaceCrud.getRecord(DATA, collection, id, state.site);
    if (!record) return;
    const label = record.node || record.hostname || record.device || record.fromDevice || record.cidr || record.isp || record.text || id;
    if (!confirm(`Delete ${label} from the active local workspace?\n\nOriginal workbook snapshots remain available through Reset edits.`)) return;
    window.WorkspaceCrud.remove(DATA, collection, id, state.site);
    rebuildAllGraphs(); window.WorkspaceCrud.recomputeStats(DATA);
    closeEditor(); closeDrawer(); await persist(); render(); toast(`${schema.title} deleted and saved`);
  }

  function openUnifiedDeviceEditor(id = null) {
    const atlas = unifiedAtlas(), node = id ? atlas.allNodes.find(item => item.id === id) : null;
    if (id && !node) { toast('This unified device is no longer active'); return; }
    const workspace = unifiedWorkspace(), custom = id ? workspace.devices.find(item => item.id === id) : null;
    const edit = custom || (id ? workspace.deviceEdits[id] : null) || node || {};
    unifiedDraft = { kind: 'device', id, customId: custom?.id || null, values: {
      label: edit.label || '', primaryIp: edit.primaryIp || '', aliases: (edit.aliases || []).join('\n'),
      layer: edit.layer || 'Other', site: edit.site || 'Discovered', role: edit.role || 'Discovered',
      model: edit.model || '', serial: edit.serial || '', floor: edit.floor || ''
    } };
    renderUnifiedEditor();
  }

  function openUnifiedConnectionEditor(id = null, defaultSource = null) {
    const atlas = unifiedAtlas(), link = id ? atlas.links.find(item => item.id === id) : null;
    if (id && !link) { toast('This unified connection is no longer active'); return; }
    const workspace = unifiedWorkspace();
    const custom = id ? (workspace.connections.find(item => item.id === id) || (link?.workspaceCustom ? workspace.connections.find(item => item.id === link.localEdit?.id) : null)) : null;
    const edit = custom || (id ? workspace.connectionEdits[id] : null) || link?.localEdit || {};
    const first = link?.links?.[0] || {};
    unifiedDraft = { kind: 'connection', id, customId: custom?.id || null, values: {
      source: edit.source || link?.source || defaultSource || '', target: edit.target || link?.target || '',
      kind: edit.kind || link?.displayTypes?.[0] || first.kind || 'Link',
      fromPort: edit.fromPort || first.fromPort || '', toPort: edit.toPort || first.toPort || '',
      fromIp: edit.fromIp || first.fromIp || '', toIp: edit.toIp || first.toIp || '',
      network: edit.network || first.network || '', remarks: edit.remarks || first.remarks || ''
    } };
    renderUnifiedEditor();
  }

  function renderUnifiedEditor() {
    if (!unifiedDraft) return;
    const d = unifiedDraft, v = d.values, atlas = unifiedAtlas();
    let fields = '';
    if (d.kind === 'device') {
      const input = (key, label, required = false, wide = false) => `<div class="form-field ${wide ? 'wide' : ''}"><label>${label}${required ? ' *' : ''}</label><input data-unified-field="${key}" value="${esc(v[key])}" ${required ? 'required' : ''}></div>`;
      fields = `${input('label', 'Best display name', true)}${input('primaryIp', 'Primary IPv4')}
        <div class="form-field wide"><label>Aliases / other names</label><textarea data-unified-field="aliases" placeholder="One alias per line">${esc(v.aliases)}</textarea></div>
        <div class="form-field"><label>Architecture layer</label><select data-unified-field="layer">${UNIFIED_LAYERS.map(value => `<option value="${esc(value)}" ${v.layer === value ? 'selected' : ''}>${esc(value)}</option>`).join('')}</select></div>
        ${input('site', 'Site / scope')}${input('role', 'Role')}${input('model', 'Model')}${input('serial', 'Serial')}${input('floor', 'Floor / location')}`;
    } else {
      const options = atlas.allNodes.slice().sort((a, b) => a.label.localeCompare(b.label)).map(node => `<option value="${esc(node.id)}">${esc(node.label)} · ${esc(node.primaryIp || 'No IP')}</option>`).join('');
      const endpoint = key => `<div class="form-field"><label>${key === 'source' ? 'Source device' : 'Target device'} *</label><select data-unified-field="${key}" required><option value="">Select device</option>${options}</select></div>`;
      fields = `${endpoint('source')}${endpoint('target')}
        <div class="form-field wide"><label>Connection type</label><input data-unified-field="kind" value="${esc(v.kind)}" placeholder="Core, Access, Peering, ISP…"></div>
        ${['fromPort', 'toPort', 'fromIp', 'toIp', 'network', 'remarks'].map(key => `<div class="form-field ${key === 'remarks' ? 'wide' : ''}"><label>${({ fromPort: 'Source port', toPort: 'Target port', fromIp: 'Source IPv4', toIp: 'Target IPv4', network: 'Network / VLAN', remarks: 'Remarks' })[key]}</label><input data-unified-field="${key}" value="${esc(v[key])}"></div>`).join('')}`;
    }
    editorModal.innerHTML = `<form id="unifiedEditorForm"><div class="editor-head"><div><h2>${d.id ? 'Edit' : 'Add'} unified ${d.kind}</h2><p>Canonical IP-led architecture · changes persist locally and rebuild dependent views.</p></div><button type="button" class="icon-button" data-close-editor><span data-icon="close"></span></button></div><div class="editor-body"><section class="editor-section"><div class="editor-section-title"><h3>${d.kind === 'device' ? 'Canonical identity' : 'Canonical connection'}</h3><span>Source evidence is preserved</span></div><div class="form-grid">${fields}</div></section></div><div class="editor-footer">${d.id ? `<button type="button" class="button danger" data-unified-delete-draft><span data-icon="trash"></span>Delete</button>` : '<span></span>'}<div class="editor-footer-right"><button type="button" class="button secondary" data-close-editor>Cancel</button><button type="submit" class="button primary"><span data-icon="save"></span>${d.id ? 'Update' : 'Add'} ${d.kind}</button></div></div></form>`;
    if (d.kind === 'connection') ['source', 'target'].forEach(key => { const select = editorModal.querySelector(`[data-unified-field="${key}"]`); if (select) select.value = v[key]; });
    hydrateIcons(editorModal); editorBackdrop.hidden = false; editorModal.hidden = false;
  }

  function normalizeUnifiedIp(value) { const parsed = window.UnifiedAtlas.parseIps(value); return parsed.ips.length === 1 && !parsed.shared ? parsed.ips[0] : ''; }
  function validOptionalIp(value) { return !txt(value) || !!normalizeUnifiedIp(value); }

  async function saveUnifiedEditor(event) {
    event.preventDefault(); if (!unifiedDraft) return;
    const d = unifiedDraft, v = { ...d.values }, workspace = unifiedWorkspace();
    if (d.kind === 'device') {
      if (!txt(v.label)) { toast('Best display name is required'); return; }
      if (!validOptionalIp(v.primaryIp)) { toast('Primary IPv4 must be a valid IPv4 address'); return; }
      const id = d.id || `custom-unified-device:${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
      const record = { id, label: txt(v.label), primaryIp: normalizeUnifiedIp(v.primaryIp) || '', aliases: txt(v.aliases) ? v.aliases.split(/[\n,]+/).map(item => item.trim()).filter(Boolean) : [], layer: v.layer || 'Other', site: txt(v.site) || 'Discovered', role: txt(v.role) || 'Discovered', model: txt(v.model), serial: txt(v.serial), floor: txt(v.floor), custom: true, modified: true };
      const customIndex = workspace.devices.findIndex(item => item.id === (d.customId || id));
      if (d.customId && customIndex >= 0) workspace.devices[customIndex] = { ...workspace.devices[customIndex], ...record, id: d.customId };
      else if (d.id) workspace.deviceEdits[d.id] = { ...record, id: d.id, custom: false };
      else workspace.devices.push(record);
      state.unifiedLayers.add(record.layer); state.unifiedScope = 'All'; state.pendingFocus = { type: 'unified-node', id };
      closeEditor(); await persist(); render(); toast(`Unified device ${d.id ? 'updated' : 'added'} and saved`);
    } else {
      if (!v.source || !v.target || v.source === v.target) { toast('Choose two different canonical devices'); return; }
      if (!validOptionalIp(v.fromIp) || !validOptionalIp(v.toIp)) { toast('Connection IP fields must contain valid IPv4 addresses'); return; }
      const record = { id: d.customId || d.id || `custom-unified-link:${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`, source: v.source, target: v.target, kind: txt(v.kind) || 'Link', fromPort: txt(v.fromPort), toPort: txt(v.toPort), fromIp: normalizeUnifiedIp(v.fromIp) || '', toIp: normalizeUnifiedIp(v.toIp) || '', network: txt(v.network), remarks: txt(v.remarks), custom: true, modified: true };
      if (d.customId) {
        const index = workspace.connections.findIndex(item => item.id === d.customId);
        if (index >= 0) workspace.connections[index] = { ...workspace.connections[index], ...record, id: d.customId };
      } else if (d.id && (record.source !== unifiedAtlas().links.find(link => link.id === d.id)?.source || record.target !== unifiedAtlas().links.find(link => link.id === d.id)?.target)) {
        if (!workspace.deletedConnections.includes(d.id)) workspace.deletedConnections.push(d.id);
        record.id = `custom-unified-link:${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
        workspace.connections.push(record);
      } else if (d.id) workspace.connectionEdits[d.id] = { ...record, id: d.id, custom: false };
      else workspace.connections.push(record);
      const sourceNode = unifiedAtlas().allNodes.find(node => node.id === record.source), targetNode = unifiedAtlas().allNodes.find(node => node.id === record.target);
      if (sourceNode) state.unifiedLayers.add(sourceNode.layer); if (targetNode) state.unifiedLayers.add(targetNode.layer);
      state.unifiedScope = 'All'; closeEditor(); await persist(); render(); toast(`Unified connection ${d.id ? 'updated' : 'added'} and saved`);
    }
  }

  async function deleteUnifiedDevice(id) {
    const node = unifiedAtlas().allNodes.find(item => item.id === id); if (!node) return;
    if (!confirm(`Delete unified device ${node.label} and its local custom connections?\n\nReset edits restores the source snapshot.`)) return;
    const workspace = unifiedWorkspace(), customIndex = workspace.devices.findIndex(item => item.id === id);
    if (customIndex >= 0) workspace.devices.splice(customIndex, 1); else if (!workspace.deletedDevices.includes(id)) workspace.deletedDevices.push(id);
    delete workspace.deviceEdits[id];
    workspace.connections = workspace.connections.filter(link => link.source !== id && link.target !== id);
    closeEditor(); closeDrawer(); await persist(); render(); toast('Unified device deleted and saved');
  }

  async function deleteUnifiedConnection(id) {
    const atlas = unifiedAtlas(), link = atlas.links.find(item => item.id === id); if (!link) return;
    if (!confirm('Delete this unified connection from the active local workspace?\n\nReset edits restores the source snapshot.')) return;
    const workspace = unifiedWorkspace(), custom = workspace.connections.find(item => item.id === id) || (link.workspaceCustom ? workspace.connections.find(item => item.id === link.localEdit?.id) : null);
    if (custom) workspace.connections = workspace.connections.filter(item => item.id !== custom.id);
    else if (!workspace.deletedConnections.includes(id)) workspace.deletedConnections.push(id);
    delete workspace.connectionEdits[id];
    closeEditor(); closeDrawer(); await persist(); render(); toast('Unified connection deleted and saved');
  }

  function blankConnection() {
    return { rowId: null, neighbor: '', uplinkPort: '', neighborPort: '', localVlan: '', neighborVlan: '', neighborSerial: '' };
  }
  function openDeviceEditor(id = null) {
    const node = id ? nodeById(id) : null;
    if (id && !node) return;
    const localRows = node ? node.rows.map(rowById).filter(Boolean).sort((a, b) => (a.row || 999999) - (b.row || 999999)) : [];
    editorDraft = {
      id, originalLabel: node?.label || '', originalSerial: node?.serial || '',
      role: node?.role && node.role !== 'Referenced' ? node.role : 'Access',
      device: node?.label || '', model: node?.model || '', serial: node?.serial || '', ip: node?.ip || '',
      buildingVlan: node?.buildingVlan || '', floor: node?.floor || '', zone: node?.zone || `${state.site} Site`,
      connections: localRows.length ? localRows.map(row => ({ rowId: row.id, neighbor: row.neighbor || '', uplinkPort: row.uplinkPort || '', neighborPort: row.neighborPort || '', localVlan: row.localVlan || '', neighborVlan: row.neighborVlan || '', neighborSerial: row.neighborSerial || '' })) : [blankConnection()],
    };
    renderDeviceEditor();
  }
  function closeEditor() { editorModal.hidden = true; editorBackdrop.hidden = true; editorDraft = null; genericDraft = null; unifiedDraft = null; editorModal.innerHTML = ''; }
  function renderDeviceEditor() {
    if (!editorDraft) return;
    const d = editorDraft, editing = Boolean(d.id);
    const names = bundle().nodes.map(n => n.label).filter(Boolean).sort((a, b) => a.localeCompare(b));
    const field = (key, label, cls = '', type = 'text') => `<div class="form-field ${cls}"><label>${label}</label><input type="${type}" data-editor-field="${key}" value="${esc(d[key])}" ${key === 'device' ? 'required' : ''}></div>`;
    editorModal.innerHTML = `<form id="deviceEditorForm"><div class="editor-head"><div><h2>${editing ? 'Edit device' : 'Add device'}</h2><p>${editing ? `Update ${esc(d.originalLabel)} and its explicit connection rows.` : `Add a device to the ${esc(state.site)} editable workspace.`}</p></div><button type="button" class="icon-button" data-close-editor><span data-icon="close"></span></button></div><div class="editor-body">
      <section class="editor-section"><div class="editor-section-title"><h3>Device attributes</h3><span>Applied to all local rows for this device</span></div><div class="form-grid">${field('device', 'Device name *', 'wide')}<div class="form-field"><label>Architecture role</label><select data-editor-field="role">${['Core', 'Distribution', 'Access', 'Discovered'].map(role => `<option value="${role}" ${d.role === role ? 'selected' : ''}>${role}</option>`).join('')}</select></div>${field('ip', 'IP address')}${field('model', 'Model')}${field('serial', 'Serial / Asset ID')}${field('buildingVlan', 'Building VLAN')}${field('zone', 'Zone (DC / NDC / Site)')}${field('floor', 'Floor / location', 'wide')}</div></section>
      <section class="editor-section"><div class="editor-section-title"><h3>Explicit connections · ${d.connections.length}</h3><button type="button" class="button secondary small" data-add-connection><span data-icon="plus"></span>Add connection</button></div><datalist id="deviceNameSuggestions">${names.map(name => `<option value="${esc(name)}"></option>`).join('')}</datalist>
        ${d.connections.map((c, i) => `<div class="connection-editor"><div class="connection-editor-head"><span>CONNECTION ${i + 1}${c.rowId ? ' · existing row' : ' · new row'}</span><button type="button" class="button danger small" data-remove-connection="${i}">Remove</button></div><div class="form-grid"><div class="form-field wide"><label>Neighbor Device (blank = source gap)</label><input list="deviceNameSuggestions" data-conn-field="neighbor" data-index="${i}" value="${esc(c.neighbor)}"></div><div class="form-field"><label>Neighbor serial</label><input data-conn-field="neighborSerial" data-index="${i}" value="${esc(c.neighborSerial)}"></div><div class="form-field"><label>Local / uplink port</label><input data-conn-field="uplinkPort" data-index="${i}" value="${esc(c.uplinkPort)}"></div><div class="form-field"><label>Neighbor port</label><input data-conn-field="neighborPort" data-index="${i}" value="${esc(c.neighborPort)}"></div><div class="form-field"><label>Local VLAN</label><input data-conn-field="localVlan" data-index="${i}" value="${esc(c.localVlan)}"></div><div class="form-field"><label>Neighbor VLAN</label><input data-conn-field="neighborVlan" data-index="${i}" value="${esc(c.neighborVlan)}"></div></div></div>`).join('')}
        <div class="editor-help"><span data-icon="info"></span><div>Only a nonblank Neighbor Device creates a link. Remove a connection to delete that row. Direct connection and topology path are recalculated for edited rows from the explicit graph.</div></div></section>
      </div><div class="editor-footer">${editing ? `<button type="button" class="button danger" data-delete-draft><span data-icon="trash"></span>Delete device</button>` : '<span></span>'}<div class="editor-footer-right"><button type="button" class="button secondary" data-close-editor>Cancel</button><button type="submit" class="button primary"><span data-icon="save"></span>${editing ? 'Update device' : 'Add device'}</button></div></div></form>`;
    hydrateIcons(editorModal); editorBackdrop.hidden = false; editorModal.hidden = false;
  }

  async function saveDeviceEditor(event) {
    event.preventDefault();
    if (!editorDraft) return;
    const d = editorDraft;
    const b = d.id && discoveryBundle().nodes.some(n => n.id === d.id) ? discoveryBundle() : bundle();
    d.device = txt(d.device);
    if (!d.device) { toast('Device name is required'); return; }
    const newId = normName(d.device);
    const duplicate = b.nodes.find(n => n.id === newId && n.id !== d.id && !n.referencedOnly);
    if (duplicate) { toast(`Device already exists: ${duplicate.label}`); return; }
    const oldNode = d.id ? nodeById(d.id) : null;
    const originalRows = new Map(b.rows.map(row => [row.id, row]));
    const oldLocalIds = new Set(oldNode?.rows || []);
    const inboundIds = d.id ? b.edges.filter(e => e.target === d.id).map(e => e.rowId) : [];
    const renamed = oldNode && txt(oldNode.label) !== d.device;
    const serialChanged = oldNode && txt(oldNode.serial) !== txt(d.serial);
    let connections = d.connections.filter(c => c.rowId || ['neighbor', 'uplinkPort', 'neighborPort', 'localVlan', 'neighborVlan', 'neighborSerial'].some(key => txt(c[key])));
    if (!connections.length) connections = [blankConnection()];
    b.rows = b.rows.filter(row => !oldLocalIds.has(row.id));
    const stamp = Date.now();
    const newRows = connections.map((c, i) => {
      const original = originalRows.get(c.rowId);
      const row = {
        id: c.rowId || `${state.site}-custom-${stamp}-${i}`, row: original?.row ?? null,
        role: { Core: 'Core Device', Distribution: 'Distribution Device', Access: 'Access SW', Discovered: 'Discovered Device' }[d.role], roleShort: d.role,
        device: d.device, model: txt(d.model) || null, serial: txt(d.serial) || null, ip: txt(d.ip) || null,
        uplinkPort: txt(c.uplinkPort) || null, localVlan: txt(c.localVlan) || null,
        neighbor: txt(c.neighbor) || null, neighborPort: txt(c.neighborPort) || null,
        neighborVlan: txt(c.neighborVlan) || null, neighborSerial: txt(c.neighborSerial) || null,
        buildingVlan: txt(d.buildingVlan) || null, floor: txt(d.floor) || null, zone: txt(d.zone) || null,
        direct: '', path: '', sourceGap: !txt(c.neighbor), custom: original?.custom ?? true, modified: true, derivedByApp: true,
        discovery: original?.discovery, noLinkExpected: original?.noLinkExpected || false,
      };
      row.direct = makeDirect(row); return row;
    });
    b.rows.push(...newRows);
    if (renamed || serialChanged) inboundIds.forEach(id => {
      const row = originalRows.get(id);
      if (!row || oldLocalIds.has(id)) return;
      if (renamed) row.neighbor = d.device;
      if (serialChanged) row.neighborSerial = txt(d.serial) || null;
      row.direct = makeDirect(row); row.modified = true; row.derivedByApp = true;
    });
    rebuildSite(state.site, b);
    closeEditor(); closeDrawer(); state.view = 'architecture'; state.layers.add(d.role);
    state.pendingFocus = { type: 'node', id: newId };
    await persist(); render(); toast(d.id ? 'Device updated and saved' : 'Device added and saved');
  }

  async function deleteDevice(id) {
    const node = nodeById(id); if (!node) return;
    const b = discoveryBundle().nodes.some(n => n.id === id) ? discoveryBundle() : bundle(), localIds = new Set(node.rows);
    const inboundIds = b.edges.filter(e => e.target === id).map(e => e.rowId);
    const message = `Delete ${node.label}?\n\n${localIds.size} local row(s) will be removed. ${inboundIds.length} incoming neighbour reference(s) will be cleared and shown as source gaps. Other devices will remain.`;
    if (!confirm(message)) return;
    b.rows = b.rows.filter(row => !localIds.has(row.id));
    inboundIds.forEach(rowId => {
      const row = b.rows.find(r => r.id === rowId);
      if (!row) return;
      row.neighbor = null; row.neighborPort = null; row.neighborVlan = null; row.neighborSerial = null;
      row.sourceGap = true; row.modified = true; row.derivedByApp = true; row.direct = makeDirect(row); row.path = txt(row.device);
    });
    rebuildSite(state.site, b); closeEditor(); closeDrawer(); state.pendingFocus = null;
    await persist(); render(); toast(`${node.label} deleted; incoming references marked as gaps`);
  }

  // Static navigation and delegated controls.
  document.getElementById('mainNav').addEventListener('click', e => {
    const btn = e.target.closest('[data-view]'); if (!btn) return;
    state.view = btn.dataset.view; closeDrawer(); render();
    document.getElementById('sidebar').classList.remove('open');
  });
  document.getElementById('siteSwitch').addEventListener('click', e => {
    const btn = e.target.closest('[data-site]'); if (!btn || btn.dataset.site === state.site) return;
    state.site = btn.dataset.site;
    state.record = { ...state.record, query: '', role: '', zone: '', gap: false, page: 1 };
    state.dcQuery = ''; state.dmzQuery = '';
    closeDrawer(); render();
  });
  document.getElementById('menuToggle').addEventListener('click', () => document.getElementById('sidebar').classList.toggle('open'));
  document.getElementById('topExport').addEventListener('click', exportCurrent);
  main.addEventListener('click', e => {
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (action === 'export') exportCurrent();
    else if (action === 'add-device') openDeviceEditor();
    else if (action === 'add-unified-device') openUnifiedDeviceEditor();
    else if (action === 'add-unified-connection') openUnifiedConnectionEditor();
    else if (action === 'raw-dc') openRawDataCenter();
    else if (action === 'clear-focus') graphRuntime?.clearFocus();
    else if (action === 'toggle-focus-mode') {
      state.focusMode = state.focusMode === 'branch' ? 'direct' : 'branch';
      if (state.focusedNodeId) graphRuntime?.focusNeighborhood(state.focusedNodeId);
      else toast(`Focus mode: ${state.focusMode === 'branch' ? 'full branch' : 'direct only'}.`);
    }
    else if (action === 'reset-workspace') resetWorkspace();
    else if (action === 'open-live') { state.view = 'live'; render(); }
    else if (action === 'sync-live') syncLive();
    else if (action === 'fit-head') graphRuntime?.fit();
    else if (action === 'reset-graph') {
      if (state.view === 'architecture' && state.archMode === 'register') { state.layers = new Set(ALL_LAYERS); render(); } else graphRuntime?.fit();
    } else if (action === 'view-gaps') {
      state.record = { ...state.record, query: '', role: '', zone: '', gap: true, page: 1 }; state.view = 'records'; render();
    }
    const genericAdd = e.target.closest('[data-generic-add]');
    if (genericAdd) { openGenericEditor(genericAdd.dataset.genericAdd); return; }
    const genericEdit = e.target.closest('[data-generic-edit]');
    if (genericEdit) { openGenericEditor(genericEdit.dataset.genericEdit, genericEdit.dataset.genericId); return; }
    const genericDelete = e.target.closest('[data-generic-delete]');
    if (genericDelete) { deleteGenericRecord(genericDelete.dataset.genericDelete, genericDelete.dataset.genericId); return; }
    const archMode = e.target.closest('[data-arch-mode]');
    if (archMode) { state.archMode = archMode.dataset.archMode; state.focusedNodeId = null; closeDrawer(); render(); return; }
    const unifiedScope = e.target.closest('[data-unified-scope]');
    if (unifiedScope) { state.unifiedScope = unifiedScope.dataset.unifiedScope; state.focusedNodeId = null; closeDrawer(); render(); return; }
    const unifiedLayer = e.target.closest('[data-unified-layer]');
    if (unifiedLayer) {
      const layer = unifiedLayer.dataset.unifiedLayer;
      if (state.unifiedLayers.has(layer) && state.unifiedLayers.size === 1) { toast('Keep at least one architecture layer visible.'); return; }
      state.unifiedLayers.has(layer) ? state.unifiedLayers.delete(layer) : state.unifiedLayers.add(layer);
      state.focusedNodeId = null; render(); return;
    }
    const connectivityTab = e.target.closest('[data-connectivity-tab]');
    if (connectivityTab) {
      Object.assign(state.connectivity, { tab: connectivityTab.dataset.connectivityTab, query: '', scope: '', filter: '', evidence: '', page: 1 });
      closeDrawer(); render(); return;
    }
    const ipamTab = e.target.closest('[data-ipam-tab]');
    if (ipamTab) {
      Object.assign(state.ipam, { tab: ipamTab.dataset.ipamTab, query: '', scope: '', filter: '', page: 1 });
      closeDrawer(); render(); return;
    }
    const upgradePageButton = e.target.closest('[data-connectivity-page], [data-ipam-page]');
    if (upgradePageButton) {
      const view = upgradePageButton.hasAttribute('data-connectivity-page') ? 'connectivity' : 'ipam';
      const direction = upgradePageButton.getAttribute(`data-${view}-page`);
      state[view].page += direction === 'next' ? 1 : -1; renderUpgradeTable(view); return;
    }
    const upgrade = e.target.closest('[data-upgrade-id]');
    if (upgrade) { openUpgradeRecord(upgrade.dataset.upgradeCollection, upgrade.dataset.upgradeId); return; }
    const dcGraph = e.target.closest('[data-dc-graph]');
    if (dcGraph) { state.dcGraphMode = dcGraph.dataset.dcGraph; render(); return; }
    const focus = e.target.closest('[data-focus-node]');
    if (focus) graphRuntime?.centerOnNode(focus.dataset.focusNode);
    const liveHost = e.target.closest('[data-live-host]');
    if (liveHost) focusLiveHost(liveHost.dataset.liveHost);
    const entry = e.target.closest('[data-entry-type]');
    if (entry) openEntry(entry.dataset.entryType, entry.dataset.entryId);
    const record = e.target.closest('[data-record-id]');
    if (record) {
      const row = rowById(record.dataset.recordId);
      if (row) openNode(combinedGraph().nodes.find(n => n.rows.includes(row.id))?.id || '');
    }
    const page = e.target.closest('[data-page]')?.dataset.page;
    if (page) { state.record.page += page === 'next' ? 1 : -1; renderRecordsTable(); }
  });
  drawer.addEventListener('click', e => {
    if (e.target.closest('[data-close-drawer]')) closeDrawer();
    const unifiedAddConnection = e.target.closest('[data-unified-source]');
    if (unifiedAddConnection) { openUnifiedConnectionEditor(null, unifiedAddConnection.dataset.unifiedSource); return; }
    const unifiedEditDevice = e.target.closest('[data-unified-edit-device]');
    if (unifiedEditDevice) { openUnifiedDeviceEditor(unifiedEditDevice.dataset.unifiedEditDevice); return; }
    const unifiedDeleteDevice = e.target.closest('[data-unified-delete-device]');
    if (unifiedDeleteDevice) { deleteUnifiedDevice(unifiedDeleteDevice.dataset.unifiedDeleteDevice); return; }
    const unifiedEditConnection = e.target.closest('[data-unified-edit-connection]');
    if (unifiedEditConnection) { openUnifiedConnectionEditor(unifiedEditConnection.dataset.unifiedEditConnection); return; }
    const unifiedDeleteConnection = e.target.closest('[data-unified-delete-connection]');
    if (unifiedDeleteConnection) { deleteUnifiedConnection(unifiedDeleteConnection.dataset.unifiedDeleteConnection); return; }
    const genericAdd = e.target.closest('[data-generic-add]');
    if (genericAdd) { openGenericEditor(genericAdd.dataset.genericAdd); return; }
    const genericEdit = e.target.closest('[data-generic-edit]');
    if (genericEdit) { openGenericEditor(genericEdit.dataset.genericEdit, genericEdit.dataset.genericId); return; }
    const genericDelete = e.target.closest('[data-generic-delete]');
    if (genericDelete) { deleteGenericRecord(genericDelete.dataset.genericDelete, genericDelete.dataset.genericId); return; }
    const edit = e.target.closest('[data-edit-node]');
    if (edit) openDeviceEditor(edit.dataset.editNode);
    const remove = e.target.closest('[data-delete-node]');
    if (remove) deleteDevice(remove.dataset.deleteNode);
    const unifiedNeighbor = e.target.closest('[data-open-unified-node]');
    if (unifiedNeighbor) { openUnifiedNode(unifiedNeighbor.dataset.openUnifiedNode); return; }
    const locate = e.target.closest('[data-locate-node]');
    if (locate) { closeDrawer(); graphRuntime?.centerOnNode(locate.dataset.locateNode); }
  });
  drawerBackdrop.addEventListener('click', closeDrawer);
  editorBackdrop.addEventListener('click', closeEditor);
  editorModal.addEventListener('submit', saveDeviceEditor);
  editorModal.addEventListener('submit', e => {
    if (e.target.id === 'genericEditorForm') saveGenericEditor(e);
    else if (e.target.id === 'unifiedEditorForm') saveUnifiedEditor(e);
  });
  const updateDraft = e => {
    if (!editorDraft || !e.target.dataset) return;
    const field = e.target.dataset.editorField;
    if (field) editorDraft[field] = e.target.value;
    const connectionField = e.target.dataset.connField;
    if (connectionField) {
      const connection = editorDraft.connections[Number(e.target.dataset.index)];
      if (connection) connection[connectionField] = e.target.value;
    }
  };
  editorModal.addEventListener('input', updateDraft);
  editorModal.addEventListener('change', updateDraft);
  const updateLocalDraft = e => {
    const genericField = e.target.dataset?.genericField;
    if (genericField && genericDraft) genericDraft.values[genericField] = e.target.value;
    const unifiedField = e.target.dataset?.unifiedField;
    if (unifiedField && unifiedDraft) unifiedDraft.values[unifiedField] = e.target.value;
  };
  editorModal.addEventListener('input', updateLocalDraft);
  editorModal.addEventListener('change', updateLocalDraft);
  editorModal.addEventListener('click', e => {
    if (e.target.closest('[data-close-editor]')) closeEditor();
    if (e.target.closest('[data-add-connection]') && editorDraft) { editorDraft.connections.push(blankConnection()); renderDeviceEditor(); }
    const remove = e.target.closest('[data-remove-connection]');
    if (remove && editorDraft) { editorDraft.connections.splice(Number(remove.dataset.removeConnection), 1); renderDeviceEditor(); }
    if (e.target.closest('[data-delete-draft]') && editorDraft?.id) deleteDevice(editorDraft.id);
    if (e.target.closest('[data-generic-delete-draft]') && genericDraft?.id) deleteGenericRecord(genericDraft.collection, genericDraft.id);
    if (e.target.closest('[data-unified-delete-draft]') && unifiedDraft?.id) {
      if (unifiedDraft.kind === 'device') deleteUnifiedDevice(unifiedDraft.id); else deleteUnifiedConnection(unifiedDraft.id);
    }
  });
  searchInput.addEventListener('input', updateSearch);
  searchInput.addEventListener('focus', updateSearch);
  searchInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); chooseSearchResult(0); } });
  searchResults.addEventListener('click', e => { const btn = e.target.closest('[data-search-index]'); if (btn) chooseSearchResult(Number(btn.dataset.searchIndex)); });
  document.addEventListener('click', e => { if (!e.target.closest('#searchBox')) searchResults.hidden = true; });
  document.addEventListener('keydown', e => {
    if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) { e.preventDefault(); searchInput.focus(); }
    if (e.key === 'Escape') { closeEditor(); closeDrawer(); graphRuntime?.clearFocus(); searchResults.hidden = true; searchInput.blur(); }
  });

  async function bootstrap() {
    hydrateIcons();
    let restored = false;
    try {
      const response = await fetch('/api/state');
      if (response.ok && response.status !== 204) {
        const saved = await response.json();
        if (saved?.sites?.WMTC?.rows && saved?.sites?.WHIL?.rows) { DATA = saved; restored = true; }
      }
    } catch { /* direct-file mode or unavailable API */ }
    if (!restored) {
      try {
        const local = localStorage.getItem(STORAGE_KEY);
        if (local) {
          const saved = JSON.parse(local);
          if (saved?.sites?.WMTC?.rows && saved?.sites?.WHIL?.rows) { DATA = saved; restored = true; }
        }
      } catch { /* invalid or unavailable local storage */ }
    }
    // Migrate older saved snapshots once, then preserve all local workspace edits.
    refreshSourceSnapshots();
    rebuildAllGraphs();
    await loadLive();
    const status = document.getElementById('saveStatus');
    if (status) status.textContent = restored ? 'Saved workspace' : 'Editable workspace';
    if (!DATA?.sites?.WMTC || !DATA?.sites?.WHIL) main.innerHTML = '<div class="empty-state"><strong>Dataset not loaded</strong>Run the workbook extraction script and reload.</div>';
    else render();
  }
  bootstrap();
  setInterval(() => {
    if (state.live.configured && !state.liveSyncing && document.visibilityState !== 'hidden') syncLive(true);
  }, 60000);
})();
