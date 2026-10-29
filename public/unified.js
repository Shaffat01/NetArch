(() => {
  'use strict';

  const text = value => value === null || value === undefined ? '' : String(value).trim();
  const normName = value => text(value).toUpperCase().replace(/_/g, '-').replace(/\s*-\s*/g, '-').replace(/\s+/g, '-').replace(/-{2,}/g, '-').replace(/^-|-$/g, '');
  const nameKey = value => normName(value).replace(/["']/g, '');
  const displayName = value => text(value).replace(/_/g, '-').replace(/\s*-\s*/g, '-').replace(/\s+/g, ' ').replace(/\b(SW|RT|FW|CORE|LEAF|SPINE|APIC|OOB)\s+0?(\d{1,2})$/i, '$1-$2');
  const unique = values => [...new Set(values.filter(Boolean))];
  const addScore = (map, key, score) => { if (key) map.set(key, Math.max(map.get(key) || 0, score)); };

  function parseIps(value) {
    const raw = text(value);
    if (!raw || raw.toUpperCase() === 'N/A') return { ips: [], shared: false };
    const matches = raw.match(/(?<![\d.])(?:\d{1,3}\.){3}\d{1,3}(?:\/\d{1,2})?(?![\d.])/g) || [];
    const ips = [];
    matches.forEach(match => {
      const [address, prefix] = match.split('/');
      const octets = address.split('.').map(Number);
      if (octets.length !== 4 || octets.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return;
      if (prefix !== undefined && (!/^\d+$/.test(prefix) || Number(prefix) > 32)) return;
      if (!ips.includes(address)) ips.push(address);
    });
    const shared = ips.length !== 1 || /standby|side\s*a|side\s*b|vip|pri-|failover/i.test(raw) || raw.includes(',') || raw.includes('\n');
    return { ips, shared };
  }

  function ordinal(value) {
    let key = nameKey(value);
    if (!/(?:SW|FW|RT|LEAF|SPINE|APIC|NODE|NOC|RND|CORE|DIST|ACC|SERVER|ROUTER|FIREWALL|SWITCH|OOB|FI)/.test(key)) return null;
    const match = key.match(/(?:-|SW|FW|RT|LEAF|SPINE|APIC|NODE|NOC|RND|CORE|DIST|ACC|OOB|FI)0?([1-9][0-9]?)(?:-(?:CIMC|DC|NDC))?$/);
    if (!match) return null;
    const number = Number(match[1]);
    return number >= 1 && number <= 99 ? number : null;
  }

  function signature(value) {
    let key = nameKey(value);
    const replacements = [
      [/CORE-SWITCH|CORE-SW|CORESW/g, 'CORE'],
      [/CORE-RT|CORE-ROUTER/g, 'RT'],
      [/OOB-SW|OOB-SWITCH/g, 'OOB'],
      [/FIREWALL|FTD-FW|FTD|FW|SFR/g, 'FW'],
      [/ACCESS-SWITCH|ACCESS-SW|ACC-SW|ACCESS|ACC/g, 'ACC'],
      [/DISTRIBUTION-SW|DIST-SW|DISTRIBUTION|DIST/g, 'DIST'],
      [/SERVER|SVR/g, 'SERVER'],
      [/NOC-ROOM/g, 'NOC'],
      [/EDGGING|EDGIN/g, 'EDGE'],
      [/SWITCH/g, 'SW'],
    ];
    replacements.forEach(([pattern, replacement]) => { key = key.replace(pattern, replacement); });
    return key.replace(/[^A-Z0-9]/g, '').replace(/0+([1-9])/g, '$1');
  }

  function genericName(value) {
    const key = nameKey(value);
    return /^SW-?[0-9A-F]{6,}$/.test(key) || /^SWITCH[0-9A-F]+$/.test(key) || /^[0-9A-F]{12}/.test(key) || key.length < 4;
  }

  function normalizeSite(value) {
    const key = text(value).toUpperCase();
    if (!key || key.includes('↔') || key.includes('N5K / 9300')) return null;
    if (key === 'DC' || key === 'NDC' || key === 'DR' || key === 'WHIL-DC' || key === 'WMTC' || key === 'WHIL' || key === 'EXTERNAL') return key === 'EXTERNAL' ? 'External' : key;
    if (key.includes('WHIL-DC')) return 'WHIL-DC';
    if (key.includes('WMTC')) return 'WMTC';
    if (key.includes('WHIL')) return 'WHIL';
    if (key === 'DC SITE') return 'DC';
    if (key === 'NDC SITE') return 'NDC';
    return text(value);
  }

  function siteForName(value) {
    const key = nameKey(value);
    if (/METRONET|AGNI|ADN|BRACNET|ISP|^AND(?:-|$)/.test(key)) return 'External';
    if (key.startsWith('NDC') || key.endsWith('-NDC')) return 'NDC';
    if (key.startsWith('DR-')) return 'DR';
    if (key.startsWith('DC-') || key.endsWith('-DC')) return 'DC';
    if (key.startsWith('WMTC')) return 'WMTC';
    if (key.startsWith('WHIL')) return /N5K|NEXUS|WAN|FW|(?:^|-)RT(?:-|$)|DC/.test(key) ? 'WHIL-DC' : 'WHIL';
    return null;
  }

  function roleForName(value) {
    const key = nameKey(value);
    if (/SPINE|LEAF|APIC|(?:^|-)FI-|ISN/.test(key)) return 'Distribution';
    if (/DIST/.test(key)) return 'Distribution';
    if (/ACC|ACCESS|NOC/.test(key)) return 'Access';
    if (/CORE|N5K|NEXUS|WAN|FIREWALL|FTD|FW|(?:^|-)RT(?:-|$)|ROUTER|OOB|CIMC|FMC|NDO/.test(key)) return 'Core';
    return 'Referenced';
  }

  function layerFor(name, role) {
    const key = nameKey(valueOrEmpty(name));
    if (/METRONET|AGNI|ADN|BRACNET|ISP|^AND(?:-|$)/.test(key)) return 'External';
    if (/OOB|CIMC|FMC|MGMT|NOC/.test(key)) return 'Management';
    if (/WAN|FIREWALL|FTD|FW|(?:^|-)RT(?:-|$)|ROUTER/.test(key)) return 'WAN / Edge';
    if (/SPINE|LEAF|APIC|(?:^|-)FI-|ISN|ND-NODE|NDO/.test(key)) return 'Fabric';
    if (/CORE|N5K|NEXUS/.test(key)) return 'Core';
    if (/DIST/.test(key) || role === 'Distribution') return 'Distribution';
    if (/ACC|ACCESS/.test(key) || role === 'Access') return 'Access';
    if (/SERVER|SVR|F5|DMZ|MZ|EXCHANGE|ORACLE|NAS|POS|HRMS|CRM|VAT|DIGITECH|PRODUCTION/.test(key) || role === 'Service') return 'Services';
    return role === 'Core' ? 'Core' : 'Other';
  }
  function valueOrEmpty(value) { return value || ''; }

  const LAYER_ORDER = ['External', 'WAN / Edge', 'Core', 'Fabric', 'Services', 'Distribution', 'Access', 'Management', 'Other'];
  const layerRank = layer => Math.max(0, LAYER_ORDER.indexOf(layer));

  function build(DATA) {
    const candidates = new Map();
    const evidence = [];
    const sourceless = [];

    function addDevice(name, ipValue, meta = {}) {
      const key = nameKey(name);
      if (!key) return null;
      if (!candidates.has(key)) candidates.set(key, { key, names: new Map(), strongIps: new Set(), allIps: new Set(), ipRanks: new Map(), sharedIps: new Set(), signatures: new Set(), ordinals: new Set(), roles: new Map(), sites: new Map(), models: new Set(), serials: new Set(), floors: new Set(), buildingVlans: new Set(), sources: new Set() });
      const c = candidates.get(key), rawName = text(name);
      const nameMeta = c.names.get(rawName) || { count: 0, rank: 0, sources: new Set() };
      nameMeta.count += 1; nameMeta.rank = Math.max(nameMeta.rank, meta.rank || 50);
      (meta.sources || [meta.source || 'Workbook']).forEach(source => nameMeta.sources.add(source));
      c.names.set(rawName, nameMeta);
      if (text(meta.model)) c.models.add(text(meta.model));
      if (text(meta.serial)) c.serials.add(text(meta.serial));
      if (text(meta.floor)) c.floors.add(text(meta.floor));
      if (text(meta.buildingVlan)) c.buildingVlans.add(text(meta.buildingVlan));
      c.sources.add(meta.source || 'Workbook');
      c.signatures.add(signature(rawName));
      const number = ordinal(rawName); if (number !== null) c.ordinals.add(number);
      addScore(c.roles, meta.role || roleForName(rawName), meta.roleRank || meta.rank || 50);
      addScore(c.sites, normalizeSite(meta.site), meta.siteRank || meta.rank || 40);
      addScore(c.sites, siteForName(rawName), (meta.siteRank || meta.rank || 40) + 12);
      const parsed = parseIps(ipValue);
      parsed.ips.forEach(ip => {
        c.allIps.add(ip); addScore(c.ipRanks, ip, parsed.shared ? Math.min(25, meta.ipRank || 40) : (meta.ipRank || 40));
        if (parsed.shared) c.sharedIps.add(ip);
        else if (meta.strongIdentity) c.strongIps.add(ip);
      });
      return key;
    }

    function addEvidence(item) {
      const row = {
        id: item.id || `evidence-${evidence.length + 1}`,
        fromName: text(item.fromName), toName: text(item.toName),
        fromIp: item.fromIp || null, toIp: item.toIp || null,
        fromPort: item.fromPort || null, toPort: item.toPort || null,
        fromVlan: item.fromVlan || null, toVlan: item.toVlan || null,
        kind: item.kind || 'Connection', sourceSheet: item.sourceSheet || 'Workbook', sourceRow: item.sourceRow ?? null,
        site: item.site || null, network: item.network || null, remarks: item.remarks || null,
        speed: item.speed || null, status: item.status || null, inferred: Boolean(item.inferred),
        ordinalHint: item.ordinalHint ?? null,
      };
      if ((!row.fromName && !row.fromIp) || (!row.toName && !row.toIp)) sourceless.push(row);
      else evidence.push(row);
    }

    Object.entries(DATA.sites || {}).forEach(([site, bundle]) => {
      (bundle.rows || []).forEach(row => {
        const discovered = Boolean(row.discovery);
        addDevice(row.device, row.ip, { source: discovered ? 'LibreNMS' : 'Main register', rank: discovered ? 125 : 120, ipRank: 120, strongIdentity: true, role: row.roleShort, roleRank: 130, site: row.zone || site, model: row.model, serial: row.serial, floor: row.floor, buildingVlan: row.buildingVlan });
        if (text(row.neighbor)) {
          addDevice(row.neighbor, null, { source: discovered ? 'LibreNMS' : 'Main register', rank: 65, site: row.zone || site });
          addEvidence({ id: row.id, fromName: row.device, toName: row.neighbor, fromIp: row.ip, fromPort: row.uplinkPort, toPort: row.neighborPort, fromVlan: row.localVlan, toVlan: row.neighborVlan, kind: discovered ? 'Discovery' : 'Register', sourceSheet: site, sourceRow: row.row, site, inferred: row.discovery?.inferredNeighbor });
        }
      });
      (bundle.dataCenter || []).forEach(entry => {
        if ((entry.kind || (text(entry.ip) ? 'device' : 'label')) !== 'device') return;
        addDevice(entry.node, entry.ip, { source: 'DataCenter', rank: 135, ipRank: 135, strongIdentity: true, role: roleForName(entry.node), roleRank: 105, site: entry.side, siteRank: 140, buildingVlan: entry.zone });
      });
      (bundle.dmzMz || []).forEach(entry => {
        addDevice(entry.node, entry.ip, { source: 'DMZ/MZ', rank: 85, ipRank: 90, strongIdentity: true, role: 'Service', roleRank: 90, site: entry.zone || entry.side, buildingVlan: entry.zone });
      });
    });

    (DATA.discovered?.rows || []).forEach(row => {
      addDevice(row.device, row.ip, { source: 'LibreNMS', rank: 125, ipRank: 125, strongIdentity: true, role: row.roleShort || 'Discovered', roleRank: 130, site: row.zone, model: row.model, serial: row.serial, floor: row.floor, buildingVlan: row.buildingVlan });
      if (text(row.neighbor)) {
        addDevice(row.neighbor, null, { source: 'LibreNMS', rank: 70, site: row.zone });
        addEvidence({ id: row.id, fromName: row.device, toName: row.neighbor, fromIp: row.ip, fromPort: row.uplinkPort, toPort: row.neighborPort, kind: 'Discovery', sourceSheet: 'LibreNMS', sourceRow: row.row, site: row.zone, inferred: row.discovery?.inferredNeighbor });
      }
    });

    (DATA.connectivity?.accessDevices || []).forEach(row => {
      addDevice(row.hostname, row.ip, { source: 'HQ Access', rank: 115, ipRank: 120, strongIdentity: true, role: 'Access', roleRank: 115, site: siteForName(row.hostname) || (text(row.building).includes('WHIL') ? 'WHIL' : 'WMTC') });
      if (text(row.uplinkDevice)) {
        addDevice(row.uplinkDevice, null, { source: 'HQ Access', rank: 65, role: roleForName(row.uplinkDevice) });
        addEvidence({ id: `access-uplink:${row.id}`, fromName: row.hostname, toName: row.uplinkDevice, fromIp: row.ip, fromPort: row.uplinkPort, toPort: row.uplinkSwitchPort, kind: 'Access uplink', sourceSheet: row.sourceSheet, sourceRow: row.sourceRow });
      }
    });

    (DATA.connectivity?.links || []).forEach(row => {
      addDevice(row.fromDevice, row.fromIp, { source: 'Port connectivity', rank: 65, ipRank: 45, strongIdentity: false, site: row.scope });
      addDevice(row.toDevice, row.toIp, { source: 'Port connectivity', rank: 65, ipRank: 45, strongIdentity: false, site: row.scope });
      addEvidence({ id: row.id, fromName: row.fromDevice, toName: row.toDevice, fromIp: row.fromIp, toIp: row.toIp, fromPort: row.fromPort, toPort: row.toPort, fromVlan: row.fromVlan, toVlan: row.toVlan, kind: row.category === 'Management' ? 'Management' : 'Port', sourceSheet: row.sourceSheet, sourceRow: row.sourceRow, site: row.scope, speed: row.speed, status: row.status, remarks: row.remarks });
    });

    (DATA.ipam?.devicePeers || []).forEach(row => {
      addDevice(row.fromDevice, row.fromIp, { source: 'Device peering', rank: 90, ipRank: 90, strongIdentity: true, role: 'Core', roleRank: 75, site: row.scope });
      addDevice(row.toDevice, row.toIp, { source: 'Device peering', rank: 90, ipRank: 90, strongIdentity: true, role: 'Core', roleRank: 75, site: row.scope });
      addDevice(row.fromDevice, row.fromVip, { source: 'Device peering VIP', rank: 55, ipRank: 20, strongIdentity: false, site: row.scope });
      addDevice(row.toDevice, row.toVip, { source: 'Device peering VIP', rank: 55, ipRank: 20, strongIdentity: false, site: row.scope });
      addEvidence({ id: row.id, fromName: row.fromDevice, toName: row.toDevice, fromIp: row.fromIp, toIp: row.toIp, kind: 'IP peering', sourceSheet: row.sourceSheet, sourceRow: row.sourceRow, site: row.scope, network: row.network, remarks: row.remarks });
    });

    (DATA.ipam?.loopbacks || []).forEach(row => addDevice(row.device, row.cidr, { source: 'Loopback', rank: 105, ipRank: 105, strongIdentity: true, role: 'Core', roleRank: 100, site: row.scope }));

    (DATA.ipam?.ispPeers || []).forEach(row => {
      const isp = text(row.isp) || `${row.scope} ISP`;
      addDevice(isp, null, { source: 'ISP peering', rank: 70, role: 'Referenced', roleRank: 100, site: 'External', siteRank: 130 });
      for (const [index, ip] of [[1, row.r1Ip], [2, row.r2Ip]]) {
        if (!text(ip) || text(ip).toUpperCase() === 'N/A') continue;
        addEvidence({ id: `${row.id}:r${index}`, fromIp: ip, toName: isp, kind: 'ISP peering', sourceSheet: row.sourceSheet, sourceRow: row.sourceRow, site: row.scope, network: row.network, fromVlan: row.vlan, ordinalHint: index, remarks: row.remarks });
      }
    });

    const parent = new Map(), members = new Map(), mergeReasons = [];
    candidates.forEach((_, key) => { parent.set(key, key); members.set(key, new Set([key])); });
    function find(key) {
      let root = key;
      while (parent.get(root) !== root) root = parent.get(root);
      let current = key;
      while (parent.get(current) !== current) { const next = parent.get(current); parent.set(current, root); current = next; }
      return root;
    }
    function clusterValues(root, field) {
      const values = new Set();
      members.get(root).forEach(key => candidates.get(key)[field].forEach(value => values.add(value)));
      return values;
    }
    function ordinalConflict(a, b) {
      const left = clusterValues(find(a), 'ordinals'), right = clusterValues(find(b), 'ordinals');
      if (!left.size || !right.size) return false;
      return ![...left].some(value => right.has(value));
    }
    function pairSimilarity(a, b) {
      const ca = candidates.get(a), cb = candidates.get(b);
      const leftSignature = signature(a), rightSignature = signature(b);
      if (ca.signatures.has(rightSignature) || cb.signatures.has(leftSignature) || [...ca.signatures].some(sig => cb.signatures.has(sig))) return 100;
      if (leftSignature.length > 5 && rightSignature.length > 5 && (leftSignature.includes(rightSignature) || rightSignature.includes(leftSignature))) return 75;
      const left = nameKey(a), right = nameKey(b);
      if (left.length > 5 && right.length > 5 && (left.includes(right) || right.includes(left))) return 65;
      if (genericName(a) || genericName(b)) return 35;
      const leftTokens = new Set(left.split('-').filter(v => v.length > 2)), rightTokens = new Set(right.split('-').filter(v => v.length > 2));
      const shared = [...leftTokens].filter(v => rightTokens.has(v)).length;
      return shared * 12;
    }
    function union(a, b, reason) {
      let ra = find(a), rb = find(b);
      if (ra === rb || ordinalConflict(ra, rb)) return false;
      if (members.get(rb).size > members.get(ra).size) [ra, rb] = [rb, ra];
      const right = members.get(rb);
      parent.set(rb, ra);
      right.forEach(key => { members.get(ra).add(key); parent.set(key, ra); });
      members.delete(rb); mergeReasons.push({ a, b, reason });
      return true;
    }

    const strongIndex = new Map();
    candidates.forEach((c, key) => c.strongIps.forEach(ip => {
      if (!strongIndex.has(ip)) strongIndex.set(ip, new Set());
      strongIndex.get(ip).add(key);
    }));
    const pairs = [];
    strongIndex.forEach((keys, ip) => {
      const list = [...keys];
      for (let i = 0; i < list.length; i += 1) for (let j = i + 1; j < list.length; j += 1) {
        const a = list[i], b = list[j], ca = candidates.get(a), cb = candidates.get(b);
        const sameOrdinal = ca.ordinals.size && cb.ordinals.size && [...ca.ordinals].some(v => cb.ordinals.has(v));
        const oneUnnumbered = !ca.ordinals.size || !cb.ordinals.size;
        pairs.push({ a, b, ip, score: pairSimilarity(a, b) + (sameOrdinal ? 25 : 0) + (oneUnnumbered ? 10 : 0), eligible: oneUnnumbered || pairSimilarity(a, b) >= 60 });
      }
    });
    pairs.sort((a, b) => b.score - a.score || a.ip.localeCompare(b.ip));
    pairs.forEach(pair => { if (pair.eligible) union(pair.a, pair.b, `Shared strong IP ${pair.ip}`); });

    const signatureIndex = new Map();
    candidates.forEach((c, key) => c.signatures.forEach(sig => {
      if (!sig) return;
      if (!signatureIndex.has(sig)) signatureIndex.set(sig, new Set());
      signatureIndex.get(sig).add(key);
    }));
    signatureIndex.forEach((keys, sig) => {
      const list = [...keys].sort((a, b) => a.localeCompare(b));
      for (let i = 1; i < list.length; i += 1) union(list[0], list[i], `Matching device signature ${sig}`);
    });

    const clusters = new Map();
    candidates.forEach((_, key) => {
      const root = find(key);
      if (!clusters.has(root)) clusters.set(root, []);
      clusters.get(root).push(key);
    });

    function bestName(keys) {
      const choices = [];
      keys.forEach(key => candidates.get(key).names.forEach((meta, name) => {
        const generic = genericName(name);
        const roleBonus = /CORE|DIST|ACC|ACCESS|SW|FW|FIREWALL|RT|LEAF|SPINE|WAN|N5K|NEXUS|SERVER|NOC|OOB/i.test(name) ? 15 : 0;
        const siteBonus = /^(DC|NDC|WMTC|WHIL|DR)/i.test(text(name)) ? 12 : 0;
        const cleanBonus = (/["']/.test(name) ? -20 : 4) + (name.includes('_') ? -25 : 0);
        choices.push({ name, score: meta.rank + roleBonus + siteBonus + cleanBonus + Math.min(12, meta.count * 2) + (generic ? -75 : 15), length: name.length });
      }));
      choices.sort((a, b) => b.score - a.score || a.length - b.length || a.name.localeCompare(b.name));
      return choices[0]?.name || keys[0];
    }

    function bestFromMap(map, fallback) {
      const sorted = [...map.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])));
      return sorted[0]?.[0] || fallback;
    }

    const rootToNode = new Map(), usedIds = new Set();
    clusters.forEach((keys, root) => {
      const label = displayName(bestName(keys));
      const ips = new Set(), strongIps = new Set(), sharedIps = new Set(), ipRanks = new Map(), roles = new Map(), sites = new Map(), aliases = [], sources = new Set(), ordinals = new Set(), signatures = new Set(), models = new Set(), serials = new Set(), floors = new Set(), buildingVlans = new Set();
      keys.forEach(key => {
        const c = candidates.get(key);
        c.allIps.forEach(ip => ips.add(ip)); c.strongIps.forEach(ip => strongIps.add(ip)); c.sharedIps.forEach(ip => sharedIps.add(ip));
        c.ipRanks.forEach((rank, ip) => addScore(ipRanks, ip, rank));
        c.roles.forEach((rank, role) => addScore(roles, role, rank)); c.sites.forEach((rank, site) => addScore(sites, site, rank));
        c.ordinals.forEach(number => ordinals.add(number)); c.signatures.forEach(sig => signatures.add(sig)); c.sources.forEach(source => sources.add(source));
        c.models.forEach(value => models.add(value)); c.serials.forEach(value => serials.add(value)); c.floors.forEach(value => floors.add(value)); c.buildingVlans.forEach(value => buildingVlans.add(value));
        c.names.forEach((_, name) => { if (nameKey(name) !== nameKey(label) && !aliases.includes(name)) aliases.push(name); });
      });
      const role = bestFromMap(roles, roleForName(label));
      const site = bestFromMap(sites, siteForName(label) || 'Other');
      const primaryIp = [...ips].sort((a, b) => (ipRanks.get(b) || 0) - (ipRanks.get(a) || 0) || a.localeCompare(b, undefined, { numeric: true }))[0] || null;
      let id = `u:${nameKey(label)}`, suffix = 2;
      while (usedIds.has(id)) { id = `u:${nameKey(label)}-${suffix}`; suffix += 1; }
      usedIds.add(id);
      const node = {
        id, label, role, roles: [role], layer: layerFor(label, role), site, zone: site, zones: [site], side: site === 'DC' || site === 'NDC' ? site : null,
        ip: primaryIp, primaryIp, ips: [...ips].sort(), strongIps: [...strongIps].sort(), sharedIps: [...sharedIps].sort(),
        aliases: aliases.sort(), candidateKeys: keys.slice().sort(), signatures: [...signatures], ordinals: [...ordinals].sort(),
        ipRanks: Object.fromEntries(ipRanks), sourceCount: sources.size, sources: [...sources].sort(), mergedCount: keys.length - 1,
        model: [...models][0] || null, models: [...models], serial: [...serials][0] || null, serials: [...serials], buildingVlan: [...buildingVlans][0] || null, buildingVlans: [...buildingVlans], floor: [...floors][0] || null, floors: [...floors],
        rows: [], referencedRows: [], gapRows: [], referencedOnly: false, parentHint: null, rootHint: null, rootKey: null,
        unified: true, degree: 0, conflict: false,
      };
      rootToNode.set(root, node);
    });

    const ipIndex = new Map();
    rootToNode.forEach((node, root) => node.ips.forEach(ip => {
      if (!ipIndex.has(ip)) ipIndex.set(ip, new Set());
      ipIndex.get(ip).add(root);
    }));
    const conflicts = [];
    ipIndex.forEach((roots, ip) => {
      if (roots.size < 2) return;
      const nodeIds = [...roots].map(root => rootToNode.get(root).id);
      nodeIds.forEach(id => { rootToNode.forEach(node => { if (node.id === id) node.conflict = true; }); });
      conflicts.push({ ip, nodeIds, labels: nodeIds.map(id => [...rootToNode.values()].find(n => n.id === id)?.label) });
    });

    function resolve(name, ipValue, options = {}) {
      const key = nameKey(name), namedRoot = key && candidates.has(key) ? find(key) : null;
      const parsed = parseIps(ipValue), ipRoots = new Map();
      if (!parsed.shared) parsed.ips.forEach(ip => (ipIndex.get(ip) || new Set()).forEach(root => ipRoots.set(root, ip)));
      if (ipRoots.size) {
        const scored = [...ipRoots.entries()].map(([root, ip]) => {
          const node = rootToNode.get(root);
          let score = node.strongIps.includes(ip) ? 130 : 65;
          if (root === namedRoot) score += options.preferName ? 220 : 85;
          if (key && node.candidateKeys.includes(key)) score += 40;
          if (key && node.signatures.includes(signature(name))) score += 45;
          const number = ordinal(name);
          if (number !== null && node.ordinals.length) score += node.ordinals.includes(number) ? 30 : -135;
          if (options.ordinalHint !== null && options.ordinalHint !== undefined && node.ordinals.length) score += node.ordinals.includes(Number(options.ordinalHint)) ? 65 : -110;
          if (options.site && node.site === options.site) score += 25;
          return { root, score, via: 'ip' };
        }).sort((a, b) => b.score - a.score);
        if (scored[0]) {
          const requiredOrdinal = options.ordinalHint !== null && options.ordinalHint !== undefined ? Number(options.ordinalHint) : ordinal(name);
          const bestNode = rootToNode.get(scored[0].root);
          if (requiredOrdinal !== null && bestNode.ordinals.length && !bestNode.ordinals.includes(requiredOrdinal)) {
            const compatible = scored.find(item => {
              const node = rootToNode.get(item.root);
              return !node.ordinals.length || node.ordinals.includes(requiredOrdinal);
            });
            if (compatible) return compatible;
            if (namedRoot) return { root: namedRoot, via: 'name' };
            return { root: null, via: null };
          }
          if (scored.length === 1 || scored[0].score > scored[1].score || scored[0].root === namedRoot) return scored[0];
        }
      }
      if (!namedRoot && !ipRoots.size && options.ordinalHint && options.site) {
        const matches = [...rootToNode.values()].filter(node => node.site === options.site && node.ordinals.includes(Number(options.ordinalHint)) && node.candidateKeys.some(candidate => /(?:^|-)RT(?:-|$)|ROUTER/.test(candidate)));
        if (matches.length === 1) {
          const match = matches[0];
          const root = [...rootToNode.entries()].find(([, node]) => node.id === match.id)?.[0] || null;
          if (root) return { root, via: 'r1r2' };
        }
      }
      if (namedRoot) return { root: namedRoot, via: 'name' };
      return { root: null, via: null };
    }

    const grouped = new Map(), resolvedRows = [], unresolved = [], internal = [];
    let ipMappedEndpoints = 0;
    evidence.forEach(row => {
      const from = resolve(row.fromName, row.fromIp, { site: row.site, ordinalHint: row.ordinalHint });
      const to = resolve(row.toName, row.toIp, { site: row.site, preferName: true });
      if (!from.root || !to.root) { unresolved.push({ ...row, resolvedFrom: from.root, resolvedTo: to.root }); return; }
      if (from.root === to.root) { internal.push({ ...row, resolvedFrom: from.root, resolvedTo: to.root }); return; }
      if (from.via === 'ip') ipMappedEndpoints += 1;
      if (to.via === 'ip') ipMappedEndpoints += 1;
      const a = rootToNode.get(from.root), b = rootToNode.get(to.root);
      const ordered = layerRank(a.layer) < layerRank(b.layer) || (a.layer === b.layer && a.label.localeCompare(b.label) <= 0) ? [a, b] : [b, a];
      const key = [ordered[0].id, ordered[1].id].sort().join('|');
      if (!grouped.has(key)) grouped.set(key, { id: `unified-link:${key}`, source: ordered[0].id, target: ordered[1].id, links: [], count: 0, types: new Set(), unified: true, inferred: false });
      const link = grouped.get(key), resolved = { ...row, resolvedFrom: from.root, resolvedTo: to.root, viaFrom: from.via, viaTo: to.via };
      link.links.push(resolved); link.count += 1; link.types.add(row.kind); if (row.inferred) link.inferred = true;
      resolvedRows.push(resolved);
    });

    const connectedIds = new Set();
    grouped.forEach(link => { connectedIds.add(link.source); connectedIds.add(link.target); });
    unresolved.forEach(row => [row.resolvedFrom, row.resolvedTo].filter(Boolean).forEach(root => {
      const node = rootToNode.get(root); if (node && !node.gapRows.includes(row.id)) node.gapRows.push(row.id);
    }));
    const allNodes = [...rootToNode.values()], nodeById = new Map(allNodes.map(node => [node.id, node]));
    allNodes.forEach(node => { node.degree = 0; node.coreGroup = node.site === 'DC' || node.site === 'NDC' || node.site === 'WHIL-DC' || node.site === 'WMTC' ? node.site : node.layer === 'External' ? 'ISP / External' : 'Other'; });
    const links = [...grouped.values()].map(link => {
      const sourceNode = nodeById.get(link.source), targetNode = nodeById.get(link.target);
      return {
        ...link, types: [...link.types].sort(), sourceSheets: unique(link.links.flatMap(row => [row.sourceSheet])),
        sourceAliases: unique([sourceNode?.label, ...(sourceNode?.aliases || []), ...(sourceNode?.candidateKeys || [])]),
        targetAliases: unique([targetNode?.label, ...(targetNode?.aliases || []), ...(targetNode?.candidateKeys || [])]),
      };
    });
    links.forEach(link => {
      const a = nodeById.get(link.source), b = nodeById.get(link.target);
      if (a) a.degree += 1; if (b) b.degree += 1;
    });
    const nodes = allNodes.filter(node => connectedIds.has(node.id));
    const stats = {
      candidateDevices: candidates.size,
      canonicalDevices: allNodes.length,
      mergedDuplicates: candidates.size - allNodes.length,
      devices: nodes.length,
      connections: links.length,
      evidenceRows: resolvedRows.length,
      ipMappedEndpoints,
      unresolvedRows: unresolved.length + sourceless.length,
      internalRows: internal.length,
      ipConflicts: conflicts.length,
      mergeDecisions: mergeReasons.length,
    };
    const result = { nodes, allNodes, links, stats, conflicts, unresolved: [...unresolved, ...sourceless], internal, mergeReasons };
    return applyWorkspace(result, DATA.unifiedWorkspace);
  }

  function applyWorkspace(atlas, workspace) {
    if (!workspace) return atlas;
    const devices = Array.isArray(workspace.devices) ? workspace.devices : [];
    const connections = Array.isArray(workspace.connections) ? workspace.connections : [];
    const deviceEdits = workspace.deviceEdits || {}, connectionEdits = workspace.connectionEdits || {};
    const deletedDevices = new Set(workspace.deletedDevices || []), deletedConnections = new Set(workspace.deletedConnections || []);
    if (!devices.length && !connections.length && !deletedDevices.size && !deletedConnections.size && !Object.keys(deviceEdits).length && !Object.keys(connectionEdits).length) return atlas;

    const deletedCandidateKeys = new Set(atlas.allNodes.filter(n => deletedDevices.has(n.id)).flatMap(n => n.candidateKeys || []));
    const allNodes = atlas.allNodes.filter(n => !deletedDevices.has(n.id)).map(n => ({ ...n, ipRanks: { ...(n.ipRanks || {}) } }));
    const byId = new Map(allNodes.map(n => [n.id, n]));
    const applyDeviceEdit = (node, edit) => {
      const label = displayName(edit.label || node.label);
      node.label = label;
      node.aliases = Array.isArray(edit.aliases) ? unique(edit.aliases.map(text).filter(alias => nameKey(alias) !== nameKey(label))) : node.aliases;
      node.candidateKeys = unique([...(node.candidateKeys || []), nameKey(label), ...(node.aliases || []).map(nameKey)]);
      if (Object.prototype.hasOwnProperty.call(edit, 'primaryIp')) {
        node.primaryIp = text(edit.primaryIp) || null; node.ip = node.primaryIp;
        if (node.primaryIp) {
          if (!node.ips.includes(node.primaryIp)) node.ips.push(node.primaryIp);
          if (!node.strongIps.includes(node.primaryIp)) node.strongIps.push(node.primaryIp);
          node.ipRanks[node.primaryIp] = 1000;
        }
        node.ips.sort(); node.strongIps.sort();
      }
      if (edit.layer) node.layer = edit.layer;
      if (edit.site) { node.site = edit.site; node.zone = edit.site; node.zones = [edit.site]; node.side = edit.site === 'DC' || edit.site === 'NDC' ? edit.site : null; }
      if (edit.role) { node.role = edit.role; node.roles = [edit.role]; }
      if (Object.prototype.hasOwnProperty.call(edit, 'model')) { node.model = text(edit.model) || null; node.models = node.model ? [node.model] : []; }
      if (Object.prototype.hasOwnProperty.call(edit, 'serial')) { node.serial = text(edit.serial) || null; node.serials = node.serial ? [node.serial] : []; }
      if (Object.prototype.hasOwnProperty.call(edit, 'floor')) { node.floor = text(edit.floor) || null; node.floors = node.floor ? [node.floor] : []; }
      node.sources = unique([...(node.sources || []), 'Local unified workspace']);
      node.sourceCount = node.sources.length; node.locallyEdited = true;
    };
    allNodes.forEach(node => { if (deviceEdits[node.id]) applyDeviceEdit(node, deviceEdits[node.id]); });

    const customNode = record => {
      const label = displayName(record.label || 'Unnamed local device'), role = record.role || roleForName(label);
      const primaryIp = text(record.primaryIp) || null;
      const ips = unique([primaryIp, ...(Array.isArray(record.ips) ? record.ips : [])].map(text));
      const aliases = Array.isArray(record.aliases) ? unique(record.aliases.map(text).filter(alias => nameKey(alias) !== nameKey(label))) : [];
      const site = record.site || siteForName(label) || 'Other';
      return {
        id: record.id, label, role, roles: [role], layer: record.layer || layerFor(label, role), site, zone: site, zones: [site], side: site === 'DC' || site === 'NDC' ? site : null,
        ip: primaryIp, primaryIp, ips, strongIps: primaryIp ? [primaryIp] : [], sharedIps: [], aliases,
        candidateKeys: unique([nameKey(label), ...aliases.map(nameKey)]), signatures: [signature(label)], ordinals: ordinal(label) === null ? [] : [ordinal(label)], ipRanks: primaryIp ? { [primaryIp]: 1000 } : {},
        sourceCount: 1, sources: ['Local unified workspace'], mergedCount: 0, model: record.model || null, models: record.model ? [record.model] : [], serial: record.serial || null, serials: record.serial ? [record.serial] : [],
        buildingVlan: null, buildingVlans: [], floor: record.floor || null, floors: record.floor ? [record.floor] : [], rows: [], referencedRows: [], gapRows: [], referencedOnly: false,
        parentHint: null, rootHint: null, rootKey: null, unified: true, custom: true, degree: 0, conflict: false,
      };
    };
    devices.forEach(record => {
      if (!record.id || deletedDevices.has(record.id)) return;
      const node = customNode(record);
      if (byId.has(record.id)) { applyDeviceEdit(byId.get(record.id), record); }
      else { allNodes.push(node); byId.set(node.id, node); }
    });

    const links = atlas.links.filter(link => !deletedConnections.has(link.id) && byId.has(link.source) && byId.has(link.target)).map(link => ({ ...link, links: [...link.links], types: [...link.types], sourceSheets: [...link.sourceSheets] }));
    links.forEach(link => {
      const edit = connectionEdits[link.id];
      if (!edit) return;
      link.localEdit = { ...edit }; link.customized = true;
      if (text(edit.kind)) link.displayTypes = [text(edit.kind)];
    });
    const pairKey = (a, b) => [a, b].sort().join('|');
    const linkByPair = new Map(links.map(link => [pairKey(link.source, link.target), link]));
    connections.forEach(record => {
      if (!record.id || deletedConnections.has(record.id) || !byId.has(record.source) || !byId.has(record.target) || record.source === record.target) return;
      const source = byId.get(record.source), target = byId.get(record.target), kind = text(record.kind) || 'Local connection';
      const row = {
        id: record.id, fromName: source.label, toName: target.label,
        fromIp: text(record.fromIp) || source.primaryIp, toIp: text(record.toIp) || target.primaryIp,
        fromPort: text(record.fromPort) || null, toPort: text(record.toPort) || null,
        fromVlan: record.fromVlan || null, toVlan: record.toVlan || null,
        kind, sourceSheet: 'Local unified workspace', sourceRow: null, site: record.site || source.site,
        network: text(record.network) || null, remarks: text(record.remarks) || null, inferred: false,
        viaFrom: text(record.fromIp) || source.primaryIp ? 'ip' : 'name', viaTo: text(record.toIp) || target.primaryIp ? 'ip' : 'name', local: true,
      };
      const key = pairKey(record.source, record.target);
      let link = linkByPair.get(key);
      if (link) {
        link.links.push(row); link.count += 1; link.types = unique([...link.types, kind]); link.sourceSheets = unique([...link.sourceSheets, row.sourceSheet]); link.custom = true; link.workspaceCustom = true; link.localEdit = { ...record };
      } else {
        link = { id: record.id, source: record.source, target: record.target, links: [row], count: 1, types: [kind], sourceSheets: [row.sourceSheet], unified: true, custom: true, workspaceCustom: true, localEdit: { ...record }, inferred: false };
        links.push(link); linkByPair.set(key, link);
      }
    });

    const connectedIds = new Set();
    links.forEach(link => {
      connectedIds.add(link.source); connectedIds.add(link.target);
      const source = byId.get(link.source), target = byId.get(link.target);
      link.sourceAliases = unique([source.label, ...(source.aliases || []), ...(source.candidateKeys || [])]);
      link.targetAliases = unique([target.label, ...(target.aliases || []), ...(target.candidateKeys || [])]);
    });
    devices.forEach(record => { if (record.id && byId.has(record.id) && !deletedDevices.has(record.id)) connectedIds.add(record.id); });
    allNodes.forEach(node => { node.degree = 0; node.coreGroup = ['DC', 'NDC', 'WHIL-DC', 'WMTC'].includes(node.site) ? node.site : node.layer === 'External' ? 'ISP / External' : 'Other'; });
    links.forEach(link => { byId.get(link.source).degree += 1; byId.get(link.target).degree += 1; });
    const nodes = allNodes.filter(node => connectedIds.has(node.id));
    const unresolved = atlas.unresolved.filter(row => !deletedCandidateKeys.has(nameKey(row.fromName)) && !deletedCandidateKeys.has(nameKey(row.toName)));
    const internal = atlas.internal.filter(row => !deletedCandidateKeys.has(nameKey(row.fromName)) && !deletedCandidateKeys.has(nameKey(row.toName)));
    const conflicts = atlas.conflicts.map(conflict => {
      const nodeIds = conflict.nodeIds.filter(id => byId.has(id));
      return { ...conflict, nodeIds, labels: nodeIds.map(id => byId.get(id).label) };
    }).filter(conflict => conflict.nodeIds.length > 1);
    const stats = {
      ...atlas.stats,
      canonicalDevices: allNodes.length, devices: nodes.length, connections: links.length,
      evidenceRows: links.reduce((sum, link) => sum + link.count, 0),
      ipMappedEndpoints: links.reduce((sum, link) => sum + link.links.reduce((inner, row) => inner + (row.viaFrom === 'ip' ? 1 : 0) + (row.viaTo === 'ip' ? 1 : 0), 0), 0),
      unresolvedRows: unresolved.length, internalRows: internal.length, ipConflicts: conflicts.length,
      customDevices: devices.filter(record => record.id && !deletedDevices.has(record.id)).length,
      customConnections: connections.filter(record => record.id && !deletedConnections.has(record.id)).length,
      editedDevices: Object.keys(deviceEdits).length, editedConnections: Object.keys(connectionEdits).length,
      deletedDevices: deletedDevices.size, deletedConnections: deletedConnections.size,
    };
    return { ...atlas, nodes, allNodes, links, stats, conflicts, unresolved, internal };
  }

  const api = { build, applyWorkspace, normName, nameKey, signature, ordinal, parseIps, layerOrder: LAYER_ORDER };
  if (typeof window !== 'undefined') window.UnifiedAtlas = api;
  if (typeof globalThis !== 'undefined') globalThis.UnifiedAtlas = api;
})();
