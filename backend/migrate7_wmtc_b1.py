"""
Migration 7: Apply WMTC-B1-CORE-SW details from the actual LibreNMS data the user pasted.
Key corrections:
- 2-chassis stack (master FOC2532LLB2 + standby FOC2530L13K)
- Po11 to DC = 2×10G, ~403Mbps/110Mbps, IP 172.16.2.66/29
- Po10 to NDC = 1×1G (single member Te2/1/5), IP 172.16.8.178/29, ~208bps idle
- Po13 to WMTC-B3 = 2×10G, IP 172.16.2.89/29, direct L3
- Gi2/0/22 direct to WMTC-B2 (1G, 172.16.2.137/29)
- OSPF RID 192.168.214.1, ASBR, 4 neighbors
- Fo1/1/1-2 = 40G (future spine, idle); Twe1/1/1-2 = 25G (future)
- Uptime 4h41m (recent reboot)
- B3 confirmed as C9300-24T; B2 confirmed as C9300-24T
"""
import sys, os, copy
sys.path.insert(0, os.path.dirname(__file__))
from database import SessionLocal
from models import Topology
from sqlalchemy.orm.attributes import flag_modified
import json

s = SessionLocal()

for site in ['full']:  # only full has wmtc nodes; dc/ndc don't
    topo = s.query(Topology).filter(Topology.site == site).order_by(Topology.id.desc()).first()
    nodes = copy.deepcopy(topo.nodes)
    edges = copy.deepcopy(topo.edges)
    nb = {n['id']: n for n in nodes}

    # === Update wmtc-b1-core ===
    if 'wmtc-b1-core' in nb:
        d = nb['wmtc-b1-core']['data']
        d['hostname'] = 'WMTC-B1-CORE-SW01 (StackWise, 2 chassis)'
        d['mgmtIp'] = '192.168.137.1 (Gi0/0 Mgmt VRF)'
        d['model'] = 'Cisco C9300-24T (StackWise Virtual / Stack of 2)'
        d['ios'] = 'IOS-XE 17.6.5 (Bengaluru)'
        d['serialNumber'] = 'FOC2532LLB2 (master chassis1); FOC2530L13K (standby chassis2)'
        d['ospfRouterId'] = '192.168.214.1'
        d['ospfRole'] = 'ASBR (1 area, 4 neighbors, 22 enabled ports)'
        d['uptime'] = '4h 41m (recently rebooted)'
        d['uplinks'] = (
            'Po11 = Te1/1/8 + Te2/1/8 → DC-CORE-SW Te2/0/3 + Te1/0/3 (2×10G = 20G LAG, PRIMARY, 172.16.2.66/29, ~403Mbps↓/110Mbps↑); '
            'Po10 = Te2/1/5 → NDC-CORE-SW Te2/0/10 (1×1G, BACKUP, 172.16.8.178/29, ~208bps idle; Te1/1/5 10G unused/standby)'
        )
        d['downlinks'] = (
            'Po13 = Te1/1/6 + Te2/1/6 → WMTC-B3 (2×10G = 20G LAG, 172.16.2.89/29); '
            'Gi2/0/22 → WMTC-B2 (1G, 172.16.2.137/29); '
            'Gi1/0/11 → B4/Compressor C9300 (1G, 172.16.2.129/29); '
            'Gi1/0/19 → PowerPlant SG300 (100M); '
            'Te1/1/7+Te2/1/7 → Al-Amin L3 ACC (1G, VLAN126); '
            'Gi1/0/1+Gi2/0/1 → B1 4F CBS350; '
            'Gi1/0/3+Gi2/0/3 → Al-Amin City Gate CBS350; '
            'Gi1/0/16+Gi2/0/16 → B1 WiFi AP; '
            'Te2/1/2 → Entry Gate SG350; '
            'Te2/1/1 → Battery Project CBS350; '
            'Fo1/1/1-2 = 40G (future spine, idle); Twe1/1/1-2 = 25G (future, idle)'
        )
        d['notes'] = (
            '2-chassis stack at WMTC Building 1 (master chassis1 FOC2532LLB2, standby chassis2 FOC2530L13K). '
            'Primary DC path via Po11 (2×10G, ~513Mbps combined); NDC backup Po10 is single-member 1G (idle). '
            'OSPF ASBR (RID 192.168.214.1 from Vlan214). SVI Vlan10 (172.28.100.116/28) = WMTC→WHIL-DC. '
            'VLANs span 124–615: B1 floors (131/132/137/138), B2 (133), B3 (134/143/146), B4 (135), B5 (136), '
            'B7 (140/144/145/148), B8 (212), B9 (154/609), CCTV (441/443/450/460/493), WiFi (601/605/609/615), '
            'Al-Amin L3 (126, ~40Mbps). Po1 (100M VLAN10) = WHIL tertiary/bundle links.'
        )
        d['interfaces'] = (
            'Po11 (DC uplink 2×10G, 172.16.2.66/29, members Te1/1/8+Te2/1/8); '
            'Po10 (NDC backup 1×1G, 172.16.8.178/29, member Te2/1/5; Te1/1/5 unused); '
            'Po13 (B3 uplink 2×10G, 172.16.2.89/29, members Te1/1/6+Te2/1/6); '
            'Gi2/0/22 (B2 uplink 1G, 172.16.2.137/29 → WMTC-B2 C9300); '
            'Gi1/0/11 (B4/Compressor 1G, 172.16.2.129/29 → 192.168.135.1); '
            'Gi0/0 (Mgmt VRF, a4:78:06:c1:12:00); '
            'Fo1/1/1-2 (40G, VLAN1, idle → future spine); '
            'Twe1/1/1-2 (25G, VLAN1, idle)'
        )
        d['vlans'] = (
            'Vlan10 WMTC→WHIL-DC 172.28.100.116/28; Vlan124 BBS_PROJECT 192.168.124.1/24; '
            'Vlan126 AL-AMIN-L3 192.168.126.1/24; Vlan131 B1_1&2F; Vlan132 B1_2&3F; '
            'Vlan133 B2 192.168.133.1; Vlan134 B3-3&5F; Vlan135 B4; Vlan136 B5 192.168.136.1; '
            'Vlan137 B1_4F 192.168.137.1; Vlan138 B1_Maj_line 192.168.138.1; Vlan140 B7; '
            'Vlan146 B3_TVRND 192.168.146.1; Vlan212 B8; Vlan214 RID/TEST 192.168.214.1; '
            'Vlan441 B1-CCTV 10.8.141.1; Vlan493 PowerPlant-IIT 10.8.193.1; Vlan601 B1-WiFi 10.9.1.1; '
            'Vlan609 B9-Wifi; plus 140/142/143/144/145/148/149/152/153/154/161/168/211/443/450/460/497/600/602/605/606/615'
        )
        d['stack'] = {
            'role': 'mixed',
            'chassis': [
                {'role': 'master', 'model': 'C9300-24T', 'serial': 'FOC2532LLB2', 'macBase': 'a4:78:06:c1:12:00'},
                {'role': 'standby', 'model': 'C9300-24T', 'serial': 'FOC2530L13K', 'macBase': 'd0:e0:42:7f:95:01'}
            ],
            'stackPorts': 'StackPort1/2 @ 480Gbps (480G backplane)'
        }

    # === Update WMTC-B2 (confirmed C9300-24T, connected via Gi2/0/22) ===
    if 'wmtc-b2' in nb:
        d = nb['wmtc-b2']['data']
        d['model'] = 'Cisco C9300-24T'
        d['ios'] = 'IOS-XE'
        d['uplinks'] = 'Gi1/0/24 → WMTC-B1-CORE Gi2/0/22 (1G, 172.16.2.137/29, VLAN133)'
        d['mgmtIp'] = '10.8.142.1 / 192.168.133.1'
        d['vlan'] = '133 (WMTC-B2)'
        d['notes'] = 'WMTC Building 2 distribution switch. C9300-24T per CDP. Directly connected to B1-CORE Gi2/0/22 at 1G.'

    # === Update WMTC-B3 (confirmed C9300-24T, connected via Po13 2×10G) ===
    if 'wmtc-b3' in nb:
        d = nb['wmtc-b3']['data']
        d['model'] = 'Cisco C9300-24T'
        d['ios'] = 'IOS-XE'
        d['uplinks'] = 'Po13 = Te1/1/4 + Te1/1/3 → WMTC-B1-CORE Te1/1/6+Te2/1/6 (2×10G = 20G LAG, 172.16.2.89/29)'
        d['mgmtIp'] = '10.8.143.1 / 192.168.134.1'
        d['notes'] = 'WMTC Building 3 distribution switch. C9300-24T per CDP. Connected via Po13 (2×10G LAG) to B1-CORE. ~18.66Mbps/10.84Mbps active. Hostname typo in CDP: "waltonbdc.om" instead of .com.'

    # === Update wmtc-b4 (connected via Gi1/0/11 Compressor port to C9300 at 192.168.135.1) ===
    if 'wmtc-b4' in nb:
        d = nb['wmtc-b4']['data']
        d['model'] = 'Cisco C9300-24T'
        d['uplinks'] = 'Gi1/0/20 → WMTC-B1-CORE Gi1/0/11 (1G, 172.16.2.129/29, VLAN135)'
        d['mgmtIp'] = '192.168.135.1'
        d['notes'] = 'WMTC Building 4 (labeled "Compressor" on B1-CORE Gi1/0/11 — actually B4). C9300-24T. ~25.8Mbps/73Mbps active.'
        d['trafficNote'] = '~73 Mbps — one of the heaviest B1 downlinks'

    # === Update wmtc-pp-comp (PowerPlant + Compressor area) ===
    if 'wmtc-pp-comp' in nb:
        d = nb['wmtc-pp-comp']['data']
        d['model'] = 'Cisco SG300-28 (PowerPlant) + C9300-24T (B4/Compressor area)'
        d['uplinks'] = 'Gi1/0/19 → B1-CORE (PowerPlant SG300, VLAN46/136, 100M); Gi1/0/11 → B4 C9300 (1G)'
        d['mgmtIp'] = '192.168.136.250 (PowerPlant SG300); 192.168.135.1 (B4)'
        d['notes'] = 'WMTC PowerPlant (SG300 at .136.250, VLAN46/136, ~63/67Mbps) and Compressor/B4 area (C9300 at .135.1, ~25/73Mbps, VLAN135). These are separate switches but grouped on diagram.'

    # === Update edges ===
    for e in edges:
        # Fix DC↔B1 triangle: Po11 2×10G, update bandwidth and traffic
        if e['id'] == 'e-tri-dc-wmtc':
            e['data']['portChannel'] = 'Po11'
            e['data']['bandwidth'] = '2×10G = 20 Gbps LAG'
            e['data']['label'] = '2×10G Po11 (PRIMARY, ~403M↓/110M↑ bps)'
            e['data']['ip'] = '172.16.2.66/29'
            e['data']['sourcePort'] = 'Te1/0/3 + Te2/0/3 (DC-Core SV)'
            e['data']['targetPort'] = 'Te1/1/8 + Te2/1/8 (B1-Core Po11)'
            e['data']['mtu'] = 1500
            e['data']['fullLabel'] = (
                '★ PRIMARY: DC↔B1 Po11, 2×10G LAG (20G), 172.16.2.66/29, OSPF point-to-point, '
                'IP SLA tracked; ~403 Mbps down / 110 Mbps up (~513 Mbps combined, heaviest backbone link)'
            )
        # Fix NDC↔B1: Po10 is 1×1G (single member Te2/1/5), NOT 2×1G
        elif e['id'] == 'e-tri-ndc-wmtc':
            e['data']['portChannel'] = 'Po10'
            e['data']['bandwidth'] = '1×1G (single-member Po10)'
            e['data']['label'] = '1×1G Po10 (BACKUP, ~208 bps idle)'
            e['data']['ip'] = '172.16.8.178/29'
            e['data']['sourcePort'] = 'Te2/0/10 (NDC-Core SV)'
            e['data']['targetPort'] = 'Te2/1/5 (B1-Core Po10; Te1/1/5 10G unused)'
            e['data']['mtu'] = 1500
            e['data']['role'] = 'backup'
            e['data']['linkType'] = 'triangle'
            e['data']['fullLabel'] = (
                '⚠ BACKUP: NDC↔B1 Po10, single-member 1G, 172.16.8.178/29, floating static AD 3. '
                'Te1/1/5 is a 10G port but VLAN1/0 bps (unused, future second member). Traffic idle ~208 bps.'
            )

    # Add new edge: WMTC-B1 → WMTC-B3 via Po13 (direct 2×10G L3)
    # Check if already exists
    existing_b3 = [e for e in edges if (e['source']=='wmtc-b1-core' and e['target']=='wmtc-b3') or (e['source']=='wmtc-b3' and e['target']=='wmtc-b1-core')]
    if not existing_b3:
        edges.append({
            'id': 'e-b1-b3-po13',
            'source': 'wmtc-b1-core',
            'target': 'wmtc-b3',
            'animated': False,
            'data': {
                'linkType': 'building-uplink',
                'category': 'backbone',
                'bandwidth': '2×10G = 20 Gbps LAG',
                'portChannel': 'Po13',
                'speed': '10 Gbps',
                'protocol': 'OSPF/routed',
                'ip': '172.16.2.89/29',
                'label': '2×10G Po13 (172.16.2.89/29)',
                'sourcePort': 'Te1/1/6 + Te2/1/6 (B1-CORE)',
                'targetPort': 'Te1/1/3 + Te1/1/4 (B3 C9300)',
                'fullLabel': 'B1→B3 direct L3 Po13: 2×10G LAG, 172.16.2.89/29; ~18.66/10.84 Mbps active'
            }
        })
        print('Added B1→B3 Po13 edge')
    else:
        for e in existing_b3:
            e['data']['portChannel'] = 'Po13'
            e['data']['bandwidth'] = '2×10G = 20 Gbps LAG'
            e['data']['label'] = '2×10G Po13 (172.16.2.89/29)'
            e['data']['ip'] = '172.16.2.89/29'
            e['data']['fullLabel'] = 'B1→B3 direct L3 Po13: 2×10G LAG, 172.16.2.89/29; ~18.66/10.84 Mbps'
        print(f'Updated existing B3 edge(s): {[e["id"] for e in existing_b3]}')

    # Add B1→B2 direct edge via Gi2/0/22 (1G)
    existing_b2 = [e for e in edges if (e['source']=='wmtc-b1-core' and e['target']=='wmtc-b2') or (e['source']=='wmtc-b2' and e['target']=='wmtc-b1-core')]
    if not existing_b2:
        edges.append({
            'id': 'e-b1-b2-gi2-0-22',
            'source': 'wmtc-b1-core',
            'target': 'wmtc-b2',
            'animated': False,
            'data': {
                'linkType': 'building-uplink',
                'category': 'access',
                'bandwidth': '1 Gbps',
                'speed': '1 Gbps',
                'protocol': 'L3/routed',
                'ip': '172.16.2.137/29',
                'vlan': '133 (B2)',
                'label': '1G Gi2/0/22 (VLAN133, 172.16.2.137/29)',
                'sourcePort': 'Gi2/0/22 (B1-CORE)',
                'targetPort': 'Gi1/0/24 (B2 C9300)',
                'fullLabel': 'B1→B2 direct: 1G, 172.16.2.137/29, VLAN133; ~59Mbps/7.5Mbps active'
            }
        })
        print('Added B1→B2 Gi2/0/22 edge')
    else:
        for e in existing_b2:
            e['data']['sourcePort'] = 'Gi2/0/22 (B1-CORE)'
            e['data']['targetPort'] = 'Gi1/0/24 (B2 C9300)'
            e['data']['label'] = '1G Gi2/0/22 (VLAN133, 172.16.2.137/29)'
            e['data']['ip'] = '172.16.2.137/29'
        print(f'Updated existing B2 edge(s): {[e["id"] for e in existing_b2]}')

    # Update wmtc-b5: VLAN136, connected to B1-CORE indirectly via SG300 at 192.168.136.250 (PowerPlant area)
    if 'wmtc-b5' in nb:
        d = nb['wmtc-b5']['data']
        d['notes'] = 'WMTC B5 distribution. VLAN 136 subnet 192.168.136.0/24. Reachable via B1-CORE VLAN136, SVI .136.1. SG300 at .136.250 (PowerPlant area).'
        d['mgmtIp'] = 'Vlan136 SVI 192.168.136.1'

    topo.nodes = nodes
    topo.edges = edges
    flag_modified(topo, 'nodes')
    flag_modified(topo, 'edges')
    print(f'{site}: wmtc-b1-core updated, edges now {len(edges)}')

s.commit()
s.close()
print('✅ Migration 7 complete')
