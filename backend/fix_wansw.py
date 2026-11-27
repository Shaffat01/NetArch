"""
Fix only the 4 WAN-SWs: clean remaining Metro VLAN residues, correct port mappings.
"""
import sys, os, copy
sys.path.insert(0, os.path.dirname(__file__))
from database import SessionLocal
from models import Topology
from sqlalchemy.orm.attributes import flag_modified
import json, re

s = SessionLocal()

for site in ['full','dc','ndc']:
    topo = s.query(Topology).filter(Topology.site==site).order_by(Topology.id.desc()).first()
    if not topo: continue
    nodes = copy.deepcopy(topo.nodes)
    edges = copy.deepcopy(topo.edges)
    nb = {n['id']:n for n in nodes}

    # ===== DC-WAN-SW-01 (172.16.0.23, FDO2447191X, 17.3.3) =====
    if 'dc-wan-sw-01' in nb:
        d = nb['dc-wan-sw-01']['data']
        d['hostname'] = 'DC-WAN-SW-01'
        d['mgmtIp'] = '172.16.0.23 (Vlan1 MGMT)'
        d['model'] = 'Cisco C9500-24Y4C'
        d['ios'] = 'IOS-XE 17.3.3 (Amsterdam)'
        d['serialNumber'] = 'FDO2447191X'
        d['deviceType'] = 'Switch'
        d['uplinks'] = (
            'Twe1/0/3 → ADN INT+DATA PRI (1G fiber, ether1 ADN-MikroTik-PRI, VLAN 120/219); '
            'Twe1/0/7 → AGNI INT+DATA PRI (1G fiber, Chandra-PoP-1 sfp-sfpplus4, VLAN 502/504); '
            'Twe1/0/9 → BracNet INT+DATA PRI (1G fiber, sfp-sfpplus3 Walton-DC-Chandra, VLAN 701/601)'
        )
        d['downlinks'] = (
            'Twe1/0/1 → DC-CORE-RT-01 Te0/0/0 (10G, ISP PRI trunk, subint .120/.219/.502/.504/.601/.701); '
            'Twe1/0/2 → DC-CORE-RT-02 Te0/0/0 (10G, ISP PRI trunk parallel to RT-01, subint .120/.219/.502/.504/.601/.701); '
            'Twe1/0/22 → DC-FW-01 Eth1/1 (10G, L2 handoff VLAN 1626 RT→FW outside); '
            'Twe1/0/23 → DC-CORE-RT-01 Te0/1/0 (10G, VLAN 1626 PBR return-path FW→RT); '
            'Twe1/0/24 → DC-WAN-SW-02 Twe1/0/24 (10G ISL VLAN trunk)'
        )
        d['vlans'] = (
            '120(ADN-INT-PRI), 219(ADN-DATA-PRI), '
            '502(AGNI-INT-PRI), 504(AGNI-DATA-PRI), '
            '601(BracNet-DATA-PRI), 701(BracNet-INT+DATA-PRI), '
            '1626(RT-FW PBR transit), '
            '1900/1924(ADN SEC via ISL from WAN-SW-02), '
            '501/503(AGNI SEC via ISL), '
            '702/602(BracNet SEC via ISL)'
        )
        d['interfaces'] = (
            'Twe1/0/1 → RT-01 Te0/0/0 (10G PRI ISP trunk); '
            'Twe1/0/2 → RT-02 Te0/0/0 (10G PRI trunk parallel); '
            'Twe1/0/3 → ADN PRI (1G, MikroTik, v120/219); '
            'Twe1/0/5 — SHUT (former MetroNet INT, link removed); '
            'Twe1/0/6 — SHUT (former MetroNet DATA, link removed); '
            'Twe1/0/7 → AGNI PRI (1G, Chandra-POP-1, v502/504); '
            'Twe1/0/9 → BracNet PRI (1G, Chandra, v701/601); '
            'Twe1/0/22 → FW-01 Eth1/1 (10G, VLAN1626 L2 handoff); '
            'Twe1/0/23 → RT-01 Te0/1/0 (10G, VLAN1626 PBR); '
            'Twe1/0/24 → WAN-SW-02 ISL (10G VLAN trunk); '
            'Vlan1 MGMT (172.16.0.23)'
        )
        d['notes'] = (
            'DC primary L2 aggregation switch. All ISP handoffs terminate here: ADN (Twe1/0/3, 1G), AGNI (Twe1/0/7, 1G), '
            'BracNet (Twe1/0/9, 1G). Twe1/0/5-6 were formerly MetroNet handoffs — cables removed, ports shut after MetroNet decommission. '
            'ISP PRI trunks to RT-01/RT-02 run at 10G and carry tagged subinterfaces for each ISP INT/DATA VLAN. '
            'VLAN 1626 carries L2 traffic between RT PBR interface (Te0/1/0) and FW outside (Eth1/1) — RT and FW do NOT connect directly. '
            'Twe1/0/24 is a 10G ISL trunk to WAN-SW-02 that carries SEC VLANs from WAN-SW-02 ISP handoffs across to PRI RT trunks (allows HSRP/HA failover).'
        )
        d['ospfAreas'] = 'L2 only (no IP routing — pure switch)'
        d['routingProtocols'] = 'None (L2 switch only, no ip routing)'

    # ===== DC-WAN-SW-02 (172.16.0.24, FDO244800W7, 17.3.3) =====
    if 'dc-wan-sw-02' in nb:
        d = nb['dc-wan-sw-02']['data']
        d['hostname'] = 'DC-WAN-SW-02'
        d['mgmtIp'] = '172.16.0.24 (Vlan1 MGMT)'
        d['model'] = 'Cisco C9500-24Y4C'
        d['ios'] = 'IOS-XE 17.3.3 (Amsterdam)'
        d['serialNumber'] = 'FDO244800W7'
        d['deviceType'] = 'Switch'
        d['uplinks'] = (
            'Twe1/0/3 → ADN INT+DATA SEC (1G fiber, Chandra-PoP-1 sfp-sfpplus4, VLAN 1900/1924); '
            'Twe1/0/7 → AGNI INT+DATA SEC (1G fiber, Chandra-POP-1 sfp-sfpplus7, VLAN 501/503); '
            'Twe1/0/9 → BracNet INT+DATA SEC (1G fiber, sfp-sfpplus4, VLAN 702/602)'
        )
        d['downlinks'] = (
            'Twe1/0/1 → DC-CORE-RT-01 Te0/0/1 (10G, ISP SEC trunk, subint .1900/.1924/.501/.503/.602/.702); '
            'Twe1/0/2 → DC-CORE-RT-02 Te0/0/1 (10G, ISP SEC trunk parallel to RT-02); '
            'Twe1/0/22 → DC-FW-02 Eth1/1 (10G, L2 handoff VLAN 1626 RT→FW standby); '
            'Twe1/0/23 → DC-CORE-RT-02 Te0/1/0 (10G, VLAN 1626 PBR return-path FW→RT); '
            'Twe1/0/24 → DC-WAN-SW-01 Twe1/0/24 (10G ISL VLAN trunk)'
        )
        d['vlans'] = (
            '501(AGNI-INT-SEC), 503(AGNI-DATA-SEC), '
            '602(BracNet-DATA-SEC), 702(BracNet-INT+DATA-SEC), '
            '1626(RT-FW PBR transit), '
            '1900(ADN-INT-SEC), 1924(ADN-DATA-SEC); '
            'Vlan702 SVI 172.22.41.194/29 (BracNet SEC next-hop tracking)'
        )
        d['interfaces'] = (
            'Twe1/0/1 → RT-01 Te0/0/1 (10G SEC ISP trunk); '
            'Twe1/0/2 → RT-02 Te0/0/1 (10G SEC trunk parallel); '
            'Twe1/0/3 → ADN SEC (1G, Chandra-PoP-1, v1900/1924); '
            'Twe1/0/6 — SHUT (former MetroNet DATA SEC, link removed); '
            'Twe1/0/7 → AGNI SEC (1G, Chandra-PoP-1, v501/503); '
            'Twe1/0/9 → BracNet SEC (1G, sfp-sfpplus4, v702/602); '
            'Twe1/0/22 → FW-02 Eth1/1 (10G, VLAN1626 L2); '
            'Twe1/0/23 → RT-02 Te0/1/0 (10G, VLAN1626 PBR); '
            'Twe1/0/24 → WAN-SW-01 ISL (10G VLAN trunk); '
            'Vlan1 MGMT (172.16.0.24); Vlan702 SVI 172.22.41.194/29'
        )
        d['notes'] = (
            'DC secondary (HA) L2 aggregation. Carries SECONDARY ISP links from Chandra-PoP-1: ADN SEC (Twe1/0/3, VLAN 1900/1924), '
            'AGNI SEC (Twe1/0/7, VLAN 501/503), BracNet SEC (Twe1/0/9, VLAN 702/602). Twe1/0/6 was MetroNet DATA SEC — cable removed, port shut. '
            'SEC VLANs are trunked to WAN-SW-01 via Twe1/0/24 ISL so RT-01/02 can see both PRI and SEC BGP peers on their single physical uplink to WAN-SW-01. '
            'RT-02 uses Te0/1/0 on this switch as its FW-side PBR interface (VLAN 1626).'
        )
        d['ospfAreas'] = 'L2 only'
        d['routingProtocols'] = 'None (L2 switch only, no ip routing)'

    # ===== NDC-WAN-SW-01 (172.16.6.23, FDO25340DAA, 17.6.4) =====
    if 'ndc-wan-sw-01' in nb:
        d = nb['ndc-wan-sw-01']['data']
        d['hostname'] = 'NDC-WAN-SW-01'
        d['mgmtIp'] = '172.16.6.23 (Vlan1 MGMT)'
        d['model'] = 'Cisco C9500-24Y4C'
        d['ios'] = 'IOS-XE 17.6.4 (Bengaluru)'
        d['serialNumber'] = 'FDO25340DAA'
        d['deviceType'] = 'Switch'
        d['uplinks'] = (
            'Twe1/0/3 → ADN INT+DATA PRI (1G fiber, VLAN 182/181); '
            'Twe1/0/7 → AGNI INT+DATA PRI (1G fiber, Chandra-POP-1 sfp-sfpplus9, VLAN 505/506); '
            'Twe1/0/9 → BracNet INT+DATA PRI (1G fiber, VLAN 705/501)'
        )
        d['downlinks'] = (
            'Twe1/0/1 → NDC-CORE-RT-01 Te0/0/0 (10G, ISP PRI trunk, subint .182/.181/.505/.506/.705/.501); '
            'Twe1/0/2 → NDC-CORE-RT-02 Te0/0/0 (10G, ISP PRI trunk parallel to RT-02); '
            'Twe1/0/22 → NDC-FW-01 Eth1/1 (10G, L2 handoff VLAN 1680 RT→FW); '
            'Twe1/0/23 → NDC-CORE-RT-01 Te0/1/0 (10G, VLAN 1680 PBR FW→RT); '
            'Twe1/0/24 → NDC-WAN-SW-02 Twe1/0/24 (10G ISL VLAN trunk)'
        )
        d['vlans'] = (
            '181(ADN-DATA-PRI), 182(ADN-INT-PRI), '
            '501(BracNet-DATA-PRI), 505(AGNI-INT-PRI), 506(AGNI-DATA-PRI), '
            '705(BracNet-INT+DATA-PRI), '
            '1680(RT-FW PBR transit), '
            '205/206(ADN SEC via ISL), '
            '507/508(AGNI SEC via ISL, AS23923), '
            '706/502(BracNet SEC via ISL)'
        )
        d['interfaces'] = (
            'Twe1/0/1 → RT-01 Te0/0/0 (10G PRI ISP trunk); '
            'Twe1/0/2 → RT-02 Te0/0/0 (10G PRI trunk parallel); '
            'Twe1/0/3 → ADN PRI (1G, v182/181); '
            'Twe1/0/5 — empty (no MetroNet at NDC); '
            'Twe1/0/6 — empty; '
            'Twe1/0/7 → AGNI PRI (1G, Chandra-POP-1 sfp-sfpplus9, v505/506, AS23923); '
            'Twe1/0/9 → BracNet PRI (1G, v705/501); '
            'Twe1/0/22 → FW-01 Eth1/1 (10G, VLAN1680); '
            'Twe1/0/23 → RT-01 Te0/1/0 (10G, VLAN1680 PBR); '
            'Twe1/0/24 → WAN-SW-02 ISL (10G VLAN trunk); '
            'Vlan1 MGMT (172.16.6.23)'
        )
        d['notes'] = (
            'NDC primary L2 aggregation switch. NO MetroNet at NDC site (Twe1/0/5-6 unused). '
            'AGNI at NDC uses AS23923 (different from DC AGNI AS65006) — different POP/hand-off. '
            'ISP PRI trunks to NDC-RT-01/02 at 10G. VLAN 1680 is the RT-FW PBR transit VLAN at NDC (equivalent to VLAN 1626 at DC). '
            'Twe1/0/24 ISL to WAN-SW-02 carries SEC VLANs for HA failover.'
        )
        d['ospfAreas'] = 'L2 only'
        d['routingProtocols'] = 'None (L2 switch only)'

    # ===== NDC-WAN-SW-02 (172.16.6.24, FDO25340D7L, 17.6.4) =====
    if 'ndc-wan-sw-02' in nb:
        d = nb['ndc-wan-sw-02']['data']
        d['hostname'] = 'NDC-WAN-SW-02'
        d['mgmtIp'] = '172.16.6.24 (Vlan1 MGMT)'
        d['model'] = 'Cisco C9500-24Y4C'
        d['ios'] = 'IOS-XE 17.6.4 (Bengaluru)'
        d['serialNumber'] = 'FDO25340D7L'
        d['deviceType'] = 'Switch'
        d['uplinks'] = (
            'Twe1/0/3 → ADN INT+DATA SEC (1G fiber, VLAN 206/205); '
            'Twe1/0/7 → AGNI INT+DATA SEC (1G fiber, Chandra-2-PoP sfp-sfpplus8, VLAN 507/508); '
            'Twe1/0/9 → BracNet INT+DATA SEC (1G fiber, VLAN 706/502)'
        )
        d['downlinks'] = (
            'Twe1/0/1 → NDC-CORE-RT-01 Te0/0/1 (10G, ISP SEC trunk, subint .206/.205/.507/.508/.706/.502); '
            'Twe1/0/2 → NDC-CORE-RT-02 Te0/0/1 (10G, ISP SEC trunk parallel); '
            'Twe1/0/22 → NDC-FW-02 Eth1/1 (10G, L2 handoff VLAN 1680 standby); '
            'Twe1/0/23 → NDC-CORE-RT-02 Te0/1/0 (10G, VLAN 1680 PBR return); '
            'Twe1/0/24 → NDC-WAN-SW-01 Twe1/0/24 (10G ISL VLAN trunk)'
        )
        d['vlans'] = (
            '205(ADN-DATA-SEC), 206(ADN-INT-SEC), '
            '502(BracNet-DATA-SEC), 507(AGNI-INT-SEC, AS23923), 508(AGNI-DATA-SEC), '
            '706(BracNet-INT+DATA-SEC), '
            '1680(RT-FW PBR transit); '
            'Vlan706 SVI 172.22.41.204/29 (BracNet SEC tracking); plus PRI VLANs via ISL'
        )
        d['interfaces'] = (
            'Twe1/0/1 → RT-01 Te0/0/1 (10G SEC ISP trunk); '
            'Twe1/0/2 → RT-02 Te0/0/1 (10G SEC trunk parallel); '
            'Twe1/0/3 → ADN SEC (1G, v206/205); '
            'Twe1/0/7 → AGNI SEC (1G, Chandra-2-PoP sfp-sfpplus8, v507/508, AS23923); '
            'Twe1/0/9 → BracNet SEC (1G, v706/502); '
            'Twe1/0/22 → FW-02 Eth1/1 (10G, VLAN1680); '
            'Twe1/0/23 → RT-02 Te0/1/0 (10G, VLAN1680 PBR); '
            'Twe1/0/24 → WAN-SW-01 ISL (10G VLAN trunk); '
            'Vlan1 MGMT (172.16.6.24); Vlan706 SVI 172.22.41.204/29'
        )
        d['notes'] = (
            'NDC secondary (HA) L2 aggregation. Carries SECONDARY ISP links: ADN SEC (Twe1/0/3, VLAN 206/205), '
            'AGNI SEC (Twe1/0/7, Chandra-2-PoP, VLAN 507/508, AS23923), BracNet SEC (Twe1/0/9, VLAN 706/502). '
            'NO MetroNet at NDC. SEC VLANs trunked to WAN-SW-01 via Twe1/0/24 ISL so RTs see PRI+SEC on single uplink. '
            'RT-02 uses Te0/1/0 on this switch for FW-side PBR (VLAN 1680). Vlan706 SVI used for IP SLA tracking of BracNet SEC.'
        )
        d['ospfAreas'] = 'L2 only'
        d['routingProtocols'] = 'None (L2 switch only)'

    # Also fix the WAN-HA edge labels for all sites
    for e in edges:
        if e.get('id') in ('e-dc-wan-ha','e-ndc-wan-ha'):
            e.setdefault('data', {})
            is_ndc = 'ndc' in e.get('id','')
            e['data']['sourcePort'] = 'Twe1/0/24'
            e['data']['targetPort'] = 'Twe1/0/24'
            e['data']['bandwidth'] = '10 Gbps'
            e['data']['speed'] = '10 Gbps'
            e['data']['vlan'] = 'All ISP SEC VLANs trunked across ISL'
            e['data']['linkType'] = 'ha'
            e['data']['label'] = 'ISL Twe1/0/24 ↔ Twe1/0/24 (10G VLAN trunk, SEC VLANs carried for HA)'
            e['data']['fullLabel'] = 'WAN-SW Inter-Switch Link: 10G, carries SEC VLANs (1900/1924 ADN, 501/503 AGNI, 702/602 BracNet) from secondary WAN-SW across to primary so RTs see both PRI and SEC peers on a single physical uplink.'

    topo.nodes = nodes
    topo.edges = edges
    flag_modified(topo, 'nodes')
    flag_modified(topo, 'edges')
    print(f'{site}: WAN-SWs updated, edges={len(edges)}')

s.commit()
s.close()
print('✅ WAN-SW fix complete')
