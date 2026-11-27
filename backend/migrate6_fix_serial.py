"""
Migration 6: Fix 'serial' → 'serialNumber' on all nodes (the frontend expects serialNumber).
Also alias any other fields that might be misnamed, add bgpAsn, set deviceTypes.
"""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))

from database import SessionLocal
from models import Topology
import json

session = SessionLocal()

# ASN mapping for RTs
ASN = {
    'dc-core-rt-01': 59209, 'dc-core-rt-02': 59209,
    'ndc-core-rt-01': 59209, 'ndc-core-rt-02': 59209,
}
# NDC ISP ASNs for AGNI (different from DC)
for site in ['full', 'dc', 'ndc']:
    topo = session.query(Topology).filter(Topology.site == site).order_by(Topology.id.desc()).first()
    if not topo:
        continue
    nodes = topo.nodes if isinstance(topo.nodes, list) else json.loads(topo.nodes)
    edges = topo.edges if isinstance(topo.edges, list) else json.loads(topo.edges)
    changed = 0
    for n in nodes:
        d = n.get('data', {})
        if 'serial' in d and 'serialNumber' not in d:
            d['serialNumber'] = d.pop('serial')
            changed += 1
        # bgpAsn
        if 'core-rt' in n['id'] and 'bgpAsn' not in d:
            nid = n['id'] if n['id'] in ASN else n['id'].replace('core-rt-0','core-rt-0')
            d['bgpAsn'] = ASN.get(n['id'], 59209)
        # deviceType
        if 'fw' in n['id']:
            d['deviceType'] = 'Firewall'
            if d.get('model','') == '':
                d['model'] = 'Cisco Firepower NGFW (FTD)'
        elif 'wan-sw' in n['id'] or n['id'].endswith('-sw') or n['id'] in ('dc-core-sw','ndc-core-sw','wmtc-b1-core') or n['id'] == 'dc-core-sw-01' or n['id'] == 'ndc-core-sw-01':
            if d.get('deviceType','') in ('', 'Unknown'):
                d['deviceType'] = 'Switch'
        elif 'core-rt' in n['id'] or '-rt-' in n['id']:
            d['deviceType'] = 'Router'
        elif 'isp' in n['id']:
            d['deviceType'] = 'ISP / Cloud'
        elif 'dist' in n['id'] or 'bldg' in n['id'] or n['id'].startswith('wmtc-b') or n['id'].startswith('whil-b') or n['id'].startswith('whil-shed') or n['id'] in ('wmtc-shed10','wmtc-pp-comp','res-proj','ndc-whil-b1-dist'):
            if d.get('deviceType','') in ('', 'Unknown'):
                d['deviceType'] = 'Switch'

    # Fix AGNI AS on NDC ISP edges - note that AGNI at NDC is AS23923, DC is AS65006
    for e in edges:
        d = e.get('data', {})
        # Add 40G label for spine uplinks (not spine nodes, but spine-facing ports)
        if 'Fo1/1' in d.get('sourcePort','') or 'Fo1/1' in d.get('label',''):
            if 'spine' not in d.get('label','').lower():
                d['label'] = d.get('label','') + ' → Spine (40G)'
    topo.nodes = nodes
    topo.edges = edges
    print(f"{site}: {len(nodes)} nodes, {changed} serial keys renamed")

session.commit()
session.close()
print("✅ Migration 6 complete")
