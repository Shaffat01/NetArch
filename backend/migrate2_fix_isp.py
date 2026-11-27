"""
Migration 3: Fix substring bug for NDC edges, remove duplicate l2-trunk edge, 
add missing ispName for NDC ISPs.
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

# 1. Remove duplicate L2 trunk edge (e-ndc-wmtc-l2-trunk is redundant with e-tri-ndc-wmtc)
edges_to_remove = {'e-ndc-wmtc-l2-trunk'}
edges = [e for e in edges if e['id'] not in edges_to_remove]
print(f"Removed edges: {edges_to_remove}")

# 2. Fix triangle edges with EXACT matching (not substring)
for e in edges:
    src, tgt = e.get('source',''), e.get('target','')
    if e['id'] in ('e-tri-dc-wmtc',):
        # DC → B1 (PRIMARY)
        e['data']['portChannel'] = 'Po11'
        e['data']['bandwidth'] = '2×10G = 20 Gbps LAG'
        e['data']['label'] = '2×10G Po11 (PRIMARY, ~106Mbps active)'
        e['data']['role'] = 'primary'
        e['data']['linkType'] = 'triangle'
        e['data']['mtu'] = 1500
        e['data']['fullLabel'] = '★ PRIMARY: DC↔B1 (Po11, 2×10G LAG, OSPF p2p area 0/11, tracked by IP SLA)'
        e['data']['sourcePort'] = 'Te1/0/3 + Te2/0/3 (DC-Core)'
        e['data']['targetPort'] = 'Te2/1/8 (B1-Core)'
    elif e['id'] in ('e-tri-ndc-wmtc',):
        # NDC → B1 (BACKUP, 2×1G Po10)
        e['data']['portChannel'] = 'Po10'
        e['data']['bandwidth'] = '2×1G = 2 Gbps LAG'
        e['data']['label'] = '2×1G Po10 (BACKUP, ~0 bps idle)'
        e['data']['role'] = 'backup'
        e['data']['linkType'] = 'triangle'
        e['data']['mtu'] = 1500
        e['data']['fullLabel'] = '⚠ BACKUP: NDC↔B1 (Po10, 2×1G LAG, floating static AD 3, idle ~0bps)'
        e['data']['sourcePort'] = 'Te1/0/10 + Te2/0/10 (NDC-Core)'
        e['data']['targetPort'] = 'Te2/1/5 (B1-Core)'
    elif e['id'] == 'e-tri-dc-ndc':
        # DC ↔ NDC DCI
        e['data']['portChannel'] = 'Po5'
        e['data']['bandwidth'] = '4×10G = 40 Gbps LAG'
        e['data']['label'] = '4×10G Po5, MTU 9150 (DCI)'
        e['data']['mtu'] = 9150
        e['data']['linkType'] = 'dci'
        e['data']['sourcePort'] = 'Te1/0/31-34 (DC-Core SV)'
        e['data']['targetPort'] = 'Te1/0/33-36 (NDC-Core SV)'
        e['data']['fullLabel'] = 'DC↔NDC Inter-DC Link: 4×10G Po5, MTU 9150 (jumbo)'

# 3. Add ispName and priority for NDC ISP edges
ndc_isp_map = {
    'e-ndc-isp1-wan1': ('ADN Telecom', 'PRI'),
    'e-ndc-isp1-wan2': ('ADN Telecom', 'SEC'),
    'e-ndc-isp2-wan1': ('Agni Systems', 'PRI'),
    'e-ndc-isp2-wan2': ('Agni Systems', 'SEC'),
    'e-ndc-isp3-wan1': ('BracNet', 'PRI'),
    'e-ndc-isp3-wan2': ('BracNet', 'SEC'),
}
for e in edges:
    if e['id'] in ndc_isp_map:
        e.setdefault('data', {})
        name, pri = ndc_isp_map[e['id']]
        e['data']['ispName'] = name
        e['data']['priority'] = pri
        e['data']['bandwidth'] = '1 Gbps'
        wan = 'wan-sw-01' if 'wan1' in e['id'] else 'wan-sw-02'
        site_wan = 'ndc-' + wan
        if 'adn' in e['id']:
            vlans = 'VLAN 182(INT), 181(DATA)' if 'wan1' in e['id'] else 'VLAN 206(INT), 205(DATA)'
        elif 'agni' in e['id']:
            vlans = 'VLAN 505(INT), 506(DATA)' if 'wan1' in e['id'] else 'VLAN 507(INT), 508(DATA)'
        elif 'isp3' in e['id']:
            vlans = 'VLAN 705(INT&DATA), 501(DATA)' if 'wan1' in e['id'] else 'VLAN 706(INT&DATA), 502(DATA)'
        else:
            vlans = ''
        e['data']['vlans'] = vlans
        e['data']['label'] = f"{'PRI' if pri == 'PRI' else 'SEC'} ({vlans})"

# 4. Fix DC RT→FW edges (transit via WAN-SW)
for e in edges:
    if e['id'] in ('e-dc-rt1-fw',):
        e['data']['sourcePort'] = 'Te0/1/0 (172.16.2.1/29)'
        e['data']['transitVia'] = 'DC-WAN-SW-01 Twe1/0/23→Twe1/0/22'
        e['data']['targetPort'] = 'Eth1/1 (FW-01)'
        e['data']['vlan'] = '1626 (RT-FW)'
        e['data']['subnet'] = '172.16.2.0/29'
        e['data']['bandwidth'] = '10 Gbps'
        e['data']['linkType'] = 'pbr-transit'
        e['data']['label'] = 'via WAN-SW-01 (VLAN 1626, 172.16.2.0/29)'
        # This edge logically represents RT-01 → FW-01 path, going THROUGH WAN-SW-01
        e['source'] = 'dc-core-rt-01'
        e['target'] = 'dc-fw-01'
    elif e['id'] in ('e-dc-rt2-fw',):
        e['data']['sourcePort'] = 'Te0/1/0 (172.16.2.2/29)'
        e['data']['transitVia'] = 'DC-WAN-SW-02 Twe1/0/23→Twe1/0/22'
        e['data']['targetPort'] = 'Eth1/1 (FW-02)'
        e['data']['vlan'] = '1626 (RT-FW)'
        e['data']['subnet'] = '172.16.2.0/29'
        e['data']['bandwidth'] = '10 Gbps'
        e['data']['linkType'] = 'pbr-transit'
        e['data']['label'] = 'via WAN-SW-02 (VLAN 1626, 172.16.2.0/29)'
        e['source'] = 'dc-core-rt-02'
        e['target'] = 'dc-fw-02'
    elif e['id'] in ('e-ndc-rt1-fw',):
        e['data']['sourcePort'] = 'Te0/1/0 (172.16.8.1/29)'
        e['data']['transitVia'] = 'NDC-WAN-SW-01 Twe1/0/23→Twe1/0/22'
        e['data']['targetPort'] = 'Eth1/1 (FW-01)'
        e['data']['vlan'] = '1680 (RT-FW)'
        e['data']['subnet'] = '172.16.8.0/29'
        e['data']['bandwidth'] = '10 Gbps'
        e['data']['linkType'] = 'pbr-transit'
        e['data']['label'] = 'via WAN-SW-01 (VLAN 1680, 172.16.8.0/29)'
        e['source'] = 'ndc-core-rt-01'
        e['target'] = 'ndc-fw-01'
    elif e['id'] in ('e-ndc-rt2-fw',):
        e['data']['sourcePort'] = 'Te0/1/0 (172.16.8.2/29)'
        e['data']['transitVia'] = 'NDC-WAN-SW-02 Twe1/0/23→Twe1/0/22'
        e['data']['targetPort'] = 'Eth1/1 (FW-02)'
        e['data']['vlan'] = '1680 (RT-FW)'
        e['data']['subnet'] = '172.16.8.0/29'
        e['data']['bandwidth'] = '10 Gbps'
        e['data']['linkType'] = 'pbr-transit'
        e['data']['label'] = 'via WAN-SW-02 (VLAN 1680, 172.16.8.0/29)'
        e['source'] = 'ndc-core-rt-02'
        e['target'] = 'ndc-fw-02'

# 5. Fix FW→Core edges (vPC cross-connected)
for e in edges:
    if e['id'] in ('e-dc-fw1-core',):
        e['data']['portChannel'] = 'Po1 (vPC cross-connected)'
        e['data']['bandwidth'] = '2×10G vPC (20G)'
        e['data']['vlan'] = '1628 (Core-FW)'
        e['data']['label'] = 'Po1 vPC, VLAN 1628 (cross to both SV chassis)'
        e['data']['sourcePort'] = 'Eth1/2 (FW-01) → Te1/0/1 (chassis1) + Eth1/3 → Te2/0/2 (chassis2)'
        e['data']['targetPort'] = 'Te1/0/1 + Te2/0/2 (DC-Core-SV)'
        e['data']['note'] = 'Cross-connected vPC: FW-01 Eth1/2→chassis1 Te1/0/1, Eth1/3→chassis2 Te2/0/2'
        e['data']['linkType'] = 'pbr'
    elif e['id'] in ('e-dc-fw2-core',):
        e['data']['portChannel'] = 'Po2 (vPC cross-connected)'
        e['data']['bandwidth'] = '2×10G vPC (20G)'
        e['data']['vlan'] = '1628 (Core-FW)'
        e['data']['label'] = 'Po2 vPC, VLAN 1628 (cross to both SV chassis)'
        e['data']['sourcePort'] = 'Eth1/3 (FW-02) → Te1/0/2 (chassis1) + Eth1/2 → Te2/0/1 (chassis2)'
        e['data']['targetPort'] = 'Te1/0/2 + Te2/0/1 (DC-Core-SV)'
        e['data']['note'] = 'Cross-connected vPC: FW-02 Eth1/3→chassis1 Te1/0/2, Eth1/2→chassis2 Te2/0/1'
        e['data']['linkType'] = 'pbr'
    elif e['id'] in ('e-ndc-fw1-core',):
        e['data']['portChannel'] = 'Po1 (vPC cross-connected)'
        e['data']['bandwidth'] = '2×10G vPC (20G)'
        e['data']['vlan'] = '1688 (Core-FW)'
        e['data']['label'] = 'Po1 vPC, VLAN 1688 (cross to both SV chassis)'
        e['data']['sourcePort'] = 'Eth1/2→Te1/0/1 (chassis1) + Eth1/3→Te2/0/1 (chassis2)'
        e['data']['targetPort'] = 'Te1/0/1 + Te2/0/1 (NDC-Core-SV)'
        e['data']['linkType'] = 'pbr'
    elif e['id'] in ('e-ndc-fw2-core',):
        e['data']['portChannel'] = 'Po2 (vPC cross-connected)'
        e['data']['bandwidth'] = '2×10G vPC (20G)'
        e['data']['vlan'] = '1688 (Core-FW)'
        e['data']['label'] = 'Po2 vPC, VLAN 1688 (cross to both SV chassis)'
        e['data']['sourcePort'] = 'Eth1/2→Te1/0/2 (chassis1) + Eth1/3→Te2/0/2 (chassis2)'
        e['data']['targetPort'] = 'Te1/0/2 + Te2/0/2 (NDC-Core-SV)'
        e['data']['linkType'] = 'pbr'

topo.nodes = nodes
topo.edges = edges
session.commit()
session.close()

print(f"✅ Migration 3 done: {len(nodes)} nodes, {len(edges)} edges")
