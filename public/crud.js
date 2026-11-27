(() => {
  'use strict';
  const text = value => value === null || value === undefined ? '' : String(value).trim();
  const field = (key, label, type = 'text', extra = {}) => ({ key, label, type, ...extra });
  const provenance = () => [field('scope', 'Scope'), field('category', 'Category'), field('sourceSheet', 'Source tab'), field('sourceRow', 'Source row', 'number')];

  const schemas = {
    dataCenter: {
      title: 'DataCenter entry', shared: true, default: { side: 'DC', kind: 'device', sourceSheet: 'Data Center Devices' },
      fields: [field('node', 'Device / label', 'text', { required: true }), field('ip', 'IP address'), field('side', 'Side', 'select', { options: ['DC', 'NDC'] }), field('zone', 'VLAN / zone'), field('row', 'Source row', 'number'), field('kind', 'Entry kind', 'select', { options: ['device', 'label', 'note'] })],
    },
    dmzMz: {
      title: 'DMZ / MZ entry', shared: true, default: { side: 'DMZ', zone: 'DC' },
      fields: [field('node', 'Node / service', 'text', { required: true }), field('ip', 'IP address'), field('side', 'Side', 'select', { options: ['DMZ', 'MZ'] }), field('zone', 'Zone / ownership'), field('row', 'Source row', 'number')],
    },
    links: {
      title: 'Port connection', default: { scope: 'Local', category: 'Local port evidence', sourceSheet: 'Local workspace' },
      fields: [...provenance(), field('fromDevice', 'From device'), field('fromLocation', 'From location'), field('fromPort', 'From port'), field('fromConfig', 'From config'), field('fromVlan', 'From VLAN'), field('fromIp', 'From IP'), field('toDevice', 'To device'), field('toLocation', 'To location'), field('toPort', 'To port'), field('toConfig', 'To config'), field('toVlan', 'To VLAN'), field('toIp', 'To IP'), field('speed', 'Speed'), field('status', 'Worksheet status'), field('connectionType', 'Connection type'), field('portDescription', 'Port description', 'textarea'), field('remarks', 'Remarks', 'textarea')],
    },
    accessDevices: {
      title: 'Access inventory row', default: { scope: 'HQ', category: 'Access switch', sourceSheet: 'HQ-ACCESS-SW-INFO' },
      fields: [...provenance(), field('sl', 'Serial number', 'number'), field('hostname', 'Hostname'), field('ip', 'IP address'), field('model', 'Model'), field('block', 'Block'), field('building', 'Building'), field('floor', 'Floor'), field('uplinkPort', 'Uplink port'), field('uplinkDevice', 'Uplink device'), field('uplinkSwitchPort', 'Uplink switch port'), field('remarks', 'Remarks', 'textarea')],
    },
    labels: {
      title: 'Cable label', default: { scope: 'Local', category: 'Cable label', sourceSheet: 'Local workspace' },
      fields: [...provenance(), field('text', 'Cable label text', 'textarea', { required: true })],
    },
    blocks: {
      title: 'IP block / allocation', default: { scope: 'Local', category: 'Local allocation', sourceSheet: 'Local workspace', addressKind: 'network' },
      fields: [...provenance(), field('cidr', 'CIDR / IP'), field('purpose', 'Purpose', 'textarea'), field('remarks', 'Remarks', 'textarea'), field('sourceColumns', 'Source columns'), field('addressKind', 'Address kind')],
    },
    vlans: {
      title: 'VLAN row', default: { scope: 'HQ', category: 'VLAN', sourceSheet: 'HQ-VLAN' },
      fields: [...provenance(), field('vlan', 'VLAN ID', 'number'), field('owner', 'Owner'), field('building', 'Building'), field('floor', 'Floor / location'), field('description', 'Description', 'textarea')],
    },
    devicePeers: {
      title: 'Device peering row', default: { scope: 'Local', category: 'Device peering', sourceSheet: 'Local workspace' },
      fields: [...provenance(), field('fromDevice', 'From device'), field('fromIp', 'From IP'), field('fromVip', 'From VIP / Standby'), field('toDevice', 'To device'), field('toIp', 'To IP'), field('toVip', 'To VIP / Standby'), field('network', 'Network'), field('remarks', 'Remarks', 'textarea')],
    },
    ispPeers: {
      title: 'ISP peering row', default: { scope: 'Local', category: 'ISP peering', sourceSheet: 'Local workspace' },
      fields: [...provenance(), field('isp', 'ISP'), field('linkType', 'Link type'), field('network', 'Network'), field('vlan', 'VLAN', 'number'), field('r1Ip', 'R1 IP'), field('r2Ip', 'R2 IP'), field('ispEndIp', 'ISP end IP'), field('bgpNeighborIp', 'BGP neighbour'), field('asn', 'ASN', 'number'), field('remarks', 'Remarks', 'textarea')],
    },
    loopbacks: {
      title: 'Loopback', default: { scope: 'Local', category: 'Loopback', sourceSheet: 'Local workspace' },
      fields: [...provenance(), field('device', 'Device'), field('interface', 'Interface'), field('cidr', 'IP / CIDR'), field('remarks', 'Remarks', 'textarea')],
    },
  };

  function targets(DATA, collection, site) {
    const schema = schemas[collection];
    if (!schema) return [];
    if (schema.shared) return Object.entries(DATA.sites || {}).map(([key, bundle]) => ({ site: key, bundle, records: bundle[collection] || (bundle[collection] = []) }));
    const view = Object.prototype.hasOwnProperty.call(DATA.connectivity || {}, collection) ? 'connectivity' : 'ipam';
    DATA[view] ||= {};
    return [{ view, records: DATA[view][collection] || (DATA[view][collection] = []) }];
  }
  function get(DATA, collection, site) {
    return targets(DATA, collection, site)[0]?.records || [];
  }
  function getRecord(DATA, collection, id, site) {
    return get(DATA, collection, site).find(record => record.id === id) || null;
  }
  function newId(collection) {
    return `local:${collection}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
  }
  function upsert(DATA, collection, record, site) {
    const schema = schemas[collection];
    if (!schema || !record.id) throw new Error('Invalid local collection or record ID');
    targets(DATA, collection, site).forEach(target => {
      const index = target.records.findIndex(item => item.id === record.id);
      const previous = index >= 0 ? target.records[index] : null;
      const merged = { ...(previous || {}), ...(schema.default || {}), ...record };
      if (collection === 'labels' && (!previous || text(previous.text) !== text(merged.text))) merged.values = [{ column: previous ? 'EDITED' : 'LOCAL', text: merged.text }];
      if (collection === 'links') merged.partial = !(text(merged.fromDevice) && text(merged.toDevice) && text(merged.fromPort) && text(merged.toPort));
      if (collection === 'dataCenter' && !merged.kind) merged.kind = text(merged.ip) ? 'device' : 'label';
      if (index >= 0) target.records[index] = merged; else target.records.push(merged);
    });
    return record;
  }
  function remove(DATA, collection, id, site) {
    let removed = 0;
    targets(DATA, collection, site).forEach(target => {
      const before = target.records.length;
      target.records.splice(0, target.records.length, ...target.records.filter(record => record.id !== id));
      removed += before - target.records.length;
    });
    return removed;
  }
  function recomputeStats(DATA) {
    if (DATA.connectivity) {
      const c = DATA.connectivity, links = c.links || [];
      links.forEach(record => { record.partial = !(text(record.fromDevice) && text(record.toDevice) && text(record.fromPort) && text(record.toPort)); });
      c.stats = { ...(c.stats || {}), links: links.length, completeLinks: links.filter(record => !record.partial).length, partialLinks: links.filter(record => record.partial).length, accessDevices: (c.accessDevices || []).length, labels: (c.labels || []).length, sourceSheets: new Set(links.map(record => text(record.sourceSheet)).filter(Boolean)).size };
    }
    if (DATA.ipam) {
      const ip = DATA.ipam;
      ip.stats = { ...(ip.stats || {}), blocks: (ip.blocks || []).length, vlans: (ip.vlans || []).length, devicePeers: (ip.devicePeers || []).length, ispPeers: (ip.ispPeers || []).length, loopbacks: (ip.loopbacks || []).length };
    }
    Object.values(DATA.sites || {}).forEach(bundle => {
      bundle.stats ||= {};
      bundle.stats.dataCenter = { NDC: (bundle.dataCenter || []).filter(entry => entry.side === 'NDC').length, DC: (bundle.dataCenter || []).filter(entry => entry.side === 'DC').length };
      bundle.stats.dmzMz = { DMZ: (bundle.dmzMz || []).filter(entry => entry.side === 'DMZ').length, MZ: (bundle.dmzMz || []).filter(entry => entry.side === 'MZ').length };
    });
    DATA.meta ||= {}; DATA.meta.workspaceSchema = 2;
  }

  const api = { schemas, targets, get, getRecord, newId, upsert, remove, recomputeStats };
  if (typeof window !== 'undefined') window.WorkspaceCrud = api;
  if (typeof globalThis !== 'undefined') globalThis.WorkspaceCrud = api;
})();
