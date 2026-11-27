"""
Migration 4: Restructure RT→FW path to show physical topology (RT→WAN-SW→FW),
add proper labels to all edges, fix NDC ISP VLAN labels.
"""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))

from database import SessionLocal
from models import Topology
import json

session = SessionLocal()
topo = session.query(Topology).filter(Topology.site == 'full').order_by(Topology.id.desc()).first()
nodes = topo.nodes if isinstance(topo.nodes, list) else json.loads(topo.nodes)
edges = topo.edges if isinstance(topo.edges, list) else json.loads(topo.edges)

# 1. Remove direct RT→FW logical edges (replace with physical RT→WAN→FW path)
edges_to_remove = {'e-dc-rt1-fw', 'e-dc-rt2-fw', 'e-ndc-rt1-fw', 'e-ndc-rt2-fw'}
edges = [e for e in edges if e['id'] not in edges_to_remove]

# 2. Add RT→WAN-SW FW-transit edges (Te0/1/0 → Twe1/0/23)
new_edges = [
    # DC
    {"id": "e-dc-rt1-wan1-fw", "source": "dc-core-rt-01", "target": "dc-wan-sw-01", "animated": False,
     "data": {"linkType": "pbr-transit", "bandwidth": "10 Gbps", "vlan": "1626 (RT-FW)",
              "subnet": "172.16.2.1/29", "label": "Te0/1/0→Twe1/0/23 (PBR VLAN1626)",
              "sourcePort": "Te0/1/0 (172.16.2.1/29)", "targetPort": "Twe1/0/23",
              "note": "RT-01 FW-side interface, carries PBR policy UPLOAD_POLICY"}},
    {"id": "e-dc-rt2-wan2-fw", "source": "dc-core-rt-02", "target": "dc-wan-sw-02", "animated": False,
     "data": {"linkType": "pbr-transit", "bandwidth": "10 Gbps", "vlan": "1626 (RT-FW)",
              "subnet": "172.16.2.2/29", "label": "Te0/1/0→Twe1/0/23 (PBR VLAN1626)",
              "sourcePort": "Te0/1/0 (172.16.2.2/29)", "targetPort": "Twe1/0/23",
              "note": "RT-02 FW-side interface"}},
    # NDC
    {"id": "e-ndc-rt1-wan1-fw", "source": "ndc-core-rt-01", "target": "ndc-wan-sw-01", "animated": False,
     "data": {"linkType": "pbr-transit", "bandwidth": "10 Gbps", "vlan": "1680 (RT-FW)",
              "subnet": "172.16.8.1/29", "label": "Te0/1/0→Twe1/0/23 (PBR VLAN1680)",
              "sourcePort": "Te0/1/0 (172.16.8.1/29)", "targetPort": "Twe1/0/23",
              "note": "NDC RT-01 FW-side"}},
    {"id": "e-ndc-rt2-wan2-fw", "source": "ndc-core-rt-02", "target": "ndc-wan-sw-02", "animated": False,
     "data": {"linkType": "pbr-transit", "bandwidth": "10 Gbps", "vlan": "1680 (RT-FW)",
              "subnet": "172.16.8.2/29", "label": "Te0/1/0→Twe1/0/23 (PBR VLAN1680)",
              "sourcePort": "Te0/1/0 (172.16.8.2/29)", "targetPort": "Twe1/0/23",
              "note": "NDC RT-02 FW-side"}},
    # 3. Add WAN-SW→FW edges (Twe1/0/22 → Eth1/1)
    {"id": "e-dc-wan1-fw1", "source": "dc-wan-sw-01", "target": "dc-fw-01", "animated": False,
     "data": {"linkType": "pbr-transit", "bandwidth": "10 Gbps", "vlan": "1626 (RT-FW)",
              "label": "Twe1/0/22→Eth1/1 (VLAN 1626 L2)",
              "sourcePort": "Twe1/0/22", "targetPort": "Eth1/1 (172.16.0.15)",
              "note": "L2 handoff to FW-01 outside interface, VLAN 1626"}},
    {"id": "e-dc-wan2-fw2", "source": "dc-wan-sw-02", "target": "dc-fw-02", "animated": False,
     "data": {"linkType": "pbr-transit", "bandwidth": "10 Gbps", "vlan": "1626 (RT-FW)",
              "label": "Twe1/0/22→Eth1/1 (VLAN 1626 L2)",
              "sourcePort": "Twe1/0/22", "targetPort": "Eth1/1",
              "note": "L2 handoff to FW-02 outside"}},
    {"id": "e-ndc-wan1-fw1", "source": "ndc-wan-sw-01", "target": "ndc-fw-01", "animated": False,
     "data": {"linkType": "pbr-transit", "bandwidth": "10 Gbps", "vlan": "1680 (RT-FW)",
              "label": "Twe1/0/22→Eth1/1 (VLAN 1680 L2)",
              "sourcePort": "Twe1/0/22", "targetPort": "Eth1/1",
              "note": "NDC FW-01 outside"}},
    {"id": "e-ndc-wan2-fw2", "source": "ndc-wan-sw-02", "target": "ndc-fw-02", "animated": False,
     "data": {"linkType": "pbr-transit", "bandwidth": "10 Gbps", "vlan": "1680 (RT-FW)",
              "label": "Twe1/0/22→Eth1/1 (VLAN 1680 L2)",
              "sourcePort": "Twe1/0/22", "targetPort": "Eth1/1",
              "note": "NDC FW-02 outside"}},
]
edges.extend(new_edges)

# 4. Update labels for existing WAN-SW ↔ RT ISP trunk edges
rt_wan_labels = {
    'e-dc-wan1-rt1': {'sourcePort': 'Twe1/0/1', 'targetPort': 'Te0/0/0', 'bandwidth': '10 Gbps',
                      'label': 'PRI ISP Trunk (VLAN 120/219/502/504/601/701)', 'linkType': 'isp-trunk'},
    'e-dc-wan2-rt2': {'sourcePort': 'Twe1/0/2', 'targetPort': 'Te0/0/1', 'bandwidth': '10 Gbps',
                      'label': 'SEC ISP Trunk (VLAN 501/503/602/702/1900/1924)', 'linkType': 'isp-trunk'},
    'e-dc-wan1-rt2': {'sourcePort': 'Twe1/0/2', 'targetPort': 'Te0/0/0', 'bandwidth': '10 Gbps',
                      'label': 'PRI ISP Trunk (parallel to RT-01)', 'linkType': 'isp-trunk'},
    'e-dc-wan2-rt1': {'sourcePort': 'Twe1/0/1', 'targetPort': 'Te0/0/1', 'bandwidth': '10 Gbps',
                      'label': 'SEC ISP Trunk (parallel to RT-02)', 'linkType': 'isp-trunk'},
    'e-ndc-wan1-rt1': {'sourcePort': 'Twe1/0/1', 'targetPort': 'Te0/0/0', 'bandwidth': '10 Gbps',
                       'label': 'PRI ISP Trunk (VLAN 181/182/505/506/501/705)', 'linkType': 'isp-trunk'},
    'e-ndc-wan2-rt2': {'sourcePort': 'Twe1/0/2', 'targetPort': 'Te0/0/1', 'bandwidth': '10 Gbps',
                       'label': 'SEC ISP Trunk (VLAN 205/206/507/508/502/706)', 'linkType': 'isp-trunk'},
    'e-ndc-wan1-rt2': {'sourcePort': 'Twe1/0/2', 'targetPort': 'Te0/0/0', 'bandwidth': '10 Gbps',
                       'label': 'PRI ISP Trunk (parallel to RT-01)', 'linkType': 'isp-trunk'},
    'e-ndc-wan2-rt1': {'sourcePort': 'Twe1/0/1', 'targetPort': 'Te0/0/1', 'bandwidth': '10 Gbps',
                       'label': 'SEC ISP Trunk (parallel to RT-02)', 'linkType': 'isp-trunk'},
}
for e in edges:
    if e['id'] in rt_wan_labels:
        e.setdefault('data', {})
        e['data'].update(rt_wan_labels[e['id']])

# 5. Fix WAN HA links and RT HA links
ha_fixes = {
    'e-dc-wan-ha': {'bandwidth': '10 Gbps', 'label': 'ISL Twe1/0/24 (VLAN trunk)', 'linkType': 'ha', 'sourcePort': 'Twe1/0/24', 'targetPort': 'Twe1/0/24'},
    'e-ndc-wan-ha': {'bandwidth': '10 Gbps', 'label': 'ISL Twe1/0/24 (VLAN trunk)', 'linkType': 'ha', 'sourcePort': 'Twe1/0/24', 'targetPort': 'Twe1/0/24'},
    'e-dc-fw-ha': {'bandwidth': 'HA Sync', 'label': 'FW HA Failover Link', 'linkType': 'ha'},
    'e-ndc-fw-ha': {'bandwidth': 'HA Sync', 'label': 'FW HA Failover Link', 'linkType': 'ha'},
}
for e in edges:
    if e['id'] in ha_fixes:
        e.setdefault('data', {})
        e['data'].update(ha_fixes[e['id']])

# 6. Fix RT↔RT HA link labels
rt_ha_fixes = {}
for e in edges:
    if 'rt1' in e['id'] and 'rt2' in e['id'] and 'fw' not in e['id'] and 'wan' not in e['id']:
        site = 'dc' if e['id'].startswith('e-dc') else 'ndc'
        subnet = '172.16.2.96/29' if site == 'dc' else '172.16.8.96/29'
        e.setdefault('data', {})
        e['data']['bandwidth'] = '1 Gbps'
        e['data']['label'] = f'RT HA Gi0/0/0 ({subnet})'
        e['data']['subnet'] = subnet
        e['data']['sourcePort'] = 'Gi0/0/0'
        e['data']['targetPort'] = 'Gi0/0/0'
        e['data']['linkType'] = 'ha'

# 7. Fix NDC ISP VLAN labels that are empty
ndc_isp_vlan_fixes = {
    'e-ndc-isp1-wan1': 'PRI (VLAN 182 INT, 181 DATA)',
    'e-ndc-isp1-wan2': 'SEC (VLAN 206 INT, 205 DATA)',
    'e-ndc-isp2-wan1': 'PRI (VLAN 505 INT, 506 DATA)',
    'e-ndc-isp2-wan2': 'SEC (VLAN 507 INT, 508 DATA)',
}
for e in edges:
    if e['id'] in ndc_isp_vlan_fixes:
        e.setdefault('data', {})
        e['data']['label'] = ndc_isp_vlan_fixes[e['id']]
        e['data']['vlans'] = ndc_isp_vlan_fixes[e['id']]

# 8. Fix Core-RT edges (RT→Core-SW direct links? Actually RT doesn't connect directly to Core-SW)
# Check if these exist
rt_core_edges = [e for e in edges if ('core-rt' in e['source'] and 'core-sw' in e['target']) or ('core-sw' in e['source'] and 'core-rt' in e['target'])]
print(f"RT→Core-SW edges: {[e['id'] for e in rt_core_edges]}")
# Note: RT does NOT connect directly to Core-SW — path is RT→FW→CoreSW via PBR/VLANs
# These edges from the original seed may represent the "default route" path but physical is RT→FW→CoreSW
# Let's check
for e in rt_core_edges:
    print(f"  {e['id']}: {e['source']} -> {e['target']}, label={e.get('data',{}).get('label','')}")
    # Mark these as "routing path only" since physical path is RT→FW→CoreSW
    e.setdefault('data', {})
    e['data']['label'] = '⚠ Logical only (physical: RT→FW→CoreSW)'
    e['data']['note'] = 'RT does NOT have a direct physical link to Core-SW. Traffic path is RT→WAN-SW(VLAN1626/1680)→FW→Core-SW(VLAN1628/1688)'
    e['data']['linkType'] = 'inferred'

# 9. Also fix ndc-coresw→whilb1dist edge
for e in edges:
    if e['id'] == 'e-ndc-coresw-whilb1dist':
        e['data']['sourcePort'] = 'Te1/0/15'
        e['data']['targetPort'] = 'Gi1/0/24'
        e['data']['vlans'] = 'VLANs 130-149, 1606 MGMT'
        e['data']['trafficNote'] = '~389 Mbps active — heaviest NDC distribution'

# 10. Fix Core-SW→Spine uplinks (add labels; these don't have edges since spine nodes aren't modeled)
# Add a note in the core-sw data instead (already done in migration 1)

topo.nodes = nodes
topo.edges = edges
session.commit()
session.close()

print(f"✅ Migration 4 done: {len(nodes)} nodes, {len(edges)} edges")
print(f"New edges added: {len(new_edges)}")
