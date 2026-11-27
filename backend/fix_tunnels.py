"""
Fix Core RT tunnels — add missing DR and special tunnels, correct NDC-RT-02 tunnel IDs.
"""
import sys, os, copy, re
sys.path.insert(0, os.path.dirname(__file__))
from database import SessionLocal
from models import Topology
from sqlalchemy.orm.attributes import flag_modified

s = SessionLocal()

for site in ['full', 'dc', 'ndc']:
    topo = s.query(Topology).filter(Topology.site == site).order_by(Topology.id.desc()).first()
    if not topo:
        continue
    nodes = copy.deepcopy(topo.nodes)
    nb = {n['id']: n for n in nodes}

    # ===== DC-RT-01 (172.16.0.19) =====
    if 'dc-core-rt-01' in nb:
        d = nb['dc-core-rt-01']['data']
        d['tunnels'] = [
            {
                'name': 'Tunnel51 → Tunnel576+',
                'desc': 'GRE/IPsec to ~76 remote CSM/WSMS branch sites (10.5.x.1/29 addressing, MTU 9976)',
                'count': '~76 branch tunnels',
                'mtu': 9976,
                'category': 'branch'
            },
            {
                'name': 'Tunnel117',
                'desc': 'Walton DC ↔ PrimeBank (81.80.81.1/30, partner bank link)',
                'mtu': 9938,
                'category': 'special'
            },
            {
                'name': 'Tunnel31156',
                'desc': 'DC-RT01 → DR-RT01 AGNI-DATA-PRI (172.31.1.58/29, 100G, DR AGNI path)',
                'speed': '100 Gbps',
                'category': 'dr'
            },
            {
                'name': 'Tunnel29156',
                'desc': 'DC-RT01 → DR-RT01 ADN-DATA-PRI (172.29.1.58/29, 100G, DR ADN path)',
                'speed': '100 Gbps',
                'category': 'dr'
            },
            {
                'name': 'Tunnel30256',
                'desc': 'DC-RT01 → DR-RT01 BracNet-DATA-PRI (172.30.2.58/29, DR BracNet path)',
                'speed': '100 Gbps',
                'category': 'dr'
            },
            {
                'name': 'Tunnel3021xx',
                'desc': 'DC-RT01 → MIROUR-RT BracNet-DATA (172.30.2.x/29, Mirror/DR site BracNet)',
                'category': 'special'
            },
            {
                'name': 'Tunnel100-199 (mpls/vpn)',
                'desc': 'MPLS/VPN segment tunnels for internal VRF routing (varies by customer VRF)',
                'count': 'multiple VRF tunnels',
                'category': 'special'
            },
        ]
        # Ensure NAT pools are complete
        d['natPools'] = [
            {'name': 'ADN_NAT_POOL', 'loopback': 'Lo5 = 202.51.187.67', 'range': '202.51.187.68-78/28', 'type': 'PAT', 'isp': 'ADN'},
            {'name': 'AGNI_NAT_POOL', 'loopback': 'Lo6 = 182.252.64.176', 'range': '182.252.64.178-190/28', 'type': 'PAT', 'isp': 'AGNI'},
            {'name': 'BracNet_NAT_POOL', 'loopback': 'Lo8 = 115.127.145.128', 'range': '115.127.145.128/28', 'type': 'PAT', 'isp': 'BracNet'},
        ]

    # ===== DC-RT-02 (172.16.0.20) =====
    if 'dc-core-rt-02' in nb:
        d = nb['dc-core-rt-02']['data']
        d['tunnels'] = [
            {
                'name': 'Tunnel61 → Tunnel676+',
                'desc': 'GRE/IPsec to ~76 remote CSM/WSMS branch sites (10.6.x.1/29 addressing, HA mirror of RT-01)',
                'count': '~76 branch tunnels',
                'mtu': 9976,
                'category': 'branch'
            },
            {
                'name': 'Tunnel31164',
                'desc': 'DC-RT02 → DR-RT02 AGNI-DATA-SEC (172.31.1.66/29, 100G, DR AGNI backup)',
                'speed': '100 Gbps',
                'category': 'dr'
            },
            {
                'name': 'Tunnel29164',
                'desc': 'DC-RT02 → DR-RT02 ADN-DATA-SEC (172.29.1.66/29, 100G, DR ADN backup)',
                'speed': '100 Gbps',
                'category': 'dr'
            },
            {
                'name': 'Tunnel30264',
                'desc': 'DC-RT02 → DR-RT02 BracNet-DATA-SEC (DR BracNet backup)',
                'speed': '100 Gbps',
                'category': 'dr'
            },
            {
                'name': 'Tunnel302176',
                'desc': 'DC-RT02 → MIROUR-RT BracNet-DATA (172.30.2.177/29)',
                'category': 'special'
            },
            {
                'name': 'Tunnel302184',
                'desc': 'DC-RT02 → MIROUR-RT BracNet-INT (172.30.2.185/29)',
                'category': 'special'
            },
        ]
        d['natPools'] = [
            {'name': 'AGNI_NAT_POOL', 'loopback': 'Lo6 = 182.252.64.177', 'range': '182.252.64.191-203/28', 'type': 'PAT', 'isp': 'AGNI'},
            {'name': 'BracNet_NAT_POOL', 'loopback': 'Lo8 = 115.127.145.129', 'range': '115.127.145.129/28', 'type': 'PAT', 'isp': 'BracNet'},
            {'name': 'BracNet-DATA_POOL', 'loopback': 'Lo10 = 172.22.111.139', 'range': 'Lo10 BracNet-DATA', 'type': 'PAT', 'isp': 'BracNet'},
        ]
        d['notes'] = (
            'HA peer to DC-CORE-RT-01. Mirrors BGP/PBR/NAT config. Takes over on RT-01 failure. '
            'Note: Lo5 = 202.51.187.66 used as "ADN-INT-TRACKING" (not NAT pool — IP SLA target for ADN INT track). '
            'Lo10 added for BracNet-DATA tunnel termination. Total ~76 branch GRE/IPsec + 3×100G DR + 2 BracNet mirror tunnels.'
        )

    # ===== NDC-RT-01 (172.16.6.19) =====
    if 'ndc-core-rt-01' in nb:
        d = nb['ndc-core-rt-01']['data']
        d['tunnels'] = [
            {
                'name': 'Tunnel11 → Tunnel162+',
                'desc': 'GRE/IPsec to ~75 remote CSM/WSMS branch sites (10.1.x.1/29 addressing)',
                'count': '~75 branch tunnels',
                'mtu': 9976,
                'category': 'branch'
            },
            {
                'name': 'Tunnel1031',
                'desc': 'NDC-RT01 AGNI-DATA-PRI → AGNI-DATA VRF (172.31.1.34/29)',
                'category': 'special'
            },
            {
                'name': 'Tunnel1032',
                'desc': 'NDC-RT01 ADN-DATA-PRI → ADN-DATA VRF (172.29.1.34/29)',
                'category': 'special'
            },
            {
                'name': 'Tunnel31156',
                'desc': 'NDC-RT01 → DR-RT01 AGNI-DATA-PRI (172.31.1.58/29, 100G)',
                'speed': '100 Gbps',
                'category': 'dr'
            },
            {
                'name': 'Tunnel29156',
                'desc': 'NDC-RT01 → DR-RT01 ADN-DATA-PRI (172.29.1.58/29, 100G)',
                'speed': '100 Gbps',
                'category': 'dr'
            },
            {
                'name': 'Tunnel30256',
                'desc': 'NDC-RT01 → DR-RT01 BracNet-DATA-PRI (172.30.2.58/29)',
                'speed': '100 Gbps',
                'category': 'dr'
            },
        ]

    # ===== NDC-RT-02 (172.16.6.20) =====
    if 'ndc-core-rt-02' in nb:
        d = nb['ndc-core-rt-02']['data']
        d['tunnels'] = [
            {
                'name': 'Tunnel21 → Tunnel276+',
                'desc': 'GRE/IPsec to ~75 remote CSM/WSMS branch sites (10.2.x.1/29, HA mirror of RT-01)',
                'count': '~75 branch tunnels',
                'mtu': 9976,
                'category': 'branch'
            },
            {
                'name': 'Tunnel2031',
                'desc': 'NDC-RT02 AGNI-DATA-SEC (172.31.2.34/29)',
                'category': 'special'
            },
            {
                'name': 'Tunnel2032',
                'desc': 'NDC-RT02 ADN-DATA-SEC (172.29.2.34/29)',
                'category': 'special'
            },
            {
                'name': 'Tunnel31164',
                'desc': 'NDC-RT02 → DR-RT02 AGNI-DATA-SEC (172.31.1.66/29, 100G)',
                'speed': '100 Gbps',
                'category': 'dr'
            },
            {
                'name': 'Tunnel29164',
                'desc': 'NDC-RT02 → DR-RT02 ADN-DATA-SEC (172.29.1.66/29, 100G)',
                'speed': '100 Gbps',
                'category': 'dr'
            },
            {
                'name': 'Tunnel30264',
                'desc': 'NDC-RT02 → DR-RT02 BracNet-DATA-SEC (172.30.2.66/29)',
                'speed': '100 Gbps',
                'category': 'dr'
            },
        ]
        d['bgpNeighbors'] = [
            # NDC-RT-02 SEC peers (mirror of RT-01 but on Te0/0/1 SEC trunk)
            {'peer': '10.101.62.185', 'asn': 38203, 'isp': 'ADN', 'type': 'INT', 'priority': 'SEC', 'subint': 'Te0/0/1.206', 'vlan': 206},
            {'peer': '10.168.221.241', 'asn': 38203, 'isp': 'ADN', 'type': 'DATA', 'priority': 'SEC', 'subint': 'Te0/0/1.205', 'vlan': 205},
            {'peer': '119.148.41.249', 'asn': 23923, 'isp': 'AGNI', 'type': 'INT', 'priority': 'SEC', 'subint': 'Te0/0/1.507', 'vlan': 507},
            {'peer': '172.16.203.121', 'asn': 23923, 'isp': 'AGNI', 'type': 'DATA', 'priority': 'SEC', 'subint': 'Te0/0/1.508', 'vlan': 508},
            {'peer': '172.22.41.196', 'asn': 24342, 'isp': 'BracNet', 'type': 'INT', 'priority': 'SEC', 'subint': 'Te0/0/1.706', 'vlan': 706},
            {'peer': '172.22.41.202', 'asn': 24342, 'isp': 'BracNet', 'type': 'DATA-SEC', 'priority': 'SEC', 'subint': 'Te0/0/1.502', 'vlan': 502},
            # PRI cross-connected via ISL to WAN-SW-01
            {'peer': '10.101.62.177', 'asn': 38203, 'isp': 'ADN', 'type': 'INT', 'priority': 'PRI', 'subint': 'Te0/0/0.182', 'vlan': 182, 'note': 'via ISL from WAN-SW-01'},
            {'peer': '10.168.221.233', 'asn': 38203, 'isp': 'ADN', 'type': 'DATA', 'priority': 'PRI', 'subint': 'Te0/0/0.181', 'vlan': 181, 'note': 'via ISL'},
            {'peer': '119.148.41.241', 'asn': 23923, 'isp': 'AGNI', 'type': 'INT', 'priority': 'PRI', 'subint': 'Te0/0/0.505', 'vlan': 505, 'note': 'via ISL'},
            {'peer': '172.16.203.113', 'asn': 23923, 'isp': 'AGNI', 'type': 'DATA', 'priority': 'PRI', 'subint': 'Te0/0/0.506', 'vlan': 506, 'note': 'via ISL'},
        ]

    topo.nodes = nodes
    flag_modified(topo, 'nodes')
    print(f'{site}: RT tunnels fixed')

s.commit()
s.close()
print('✅ Tunnel fix complete')
