"""
Migration script to update the 'full' topology with LibreNMS-verified data.
Applies corrections without touching the seed file structure.
"""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))

from database import SessionLocal, engine, Base
from models import Topology
import json

session = SessionLocal()
topo = session.query(Topology).filter(Topology.site == 'full').order_by(Topology.id.desc()).first()
if not topo:
    print("ERROR: no 'full' topology found"); sys.exit(1)

nodes = topo.nodes if isinstance(topo.nodes, list) else (json.loads(topo.nodes) if topo.nodes else [])
edges = topo.edges if isinstance(topo.edges, list) else (json.loads(topo.edges) if topo.edges else [])

print(f"Loaded: {len(nodes)} nodes, {len(edges)} edges")

# Build lookup
node_by_id = {n['id']: n for n in nodes}

# =========================================================
# 1. REMOVE METRONET ISP (DC and NDC)
# =========================================================
metro_ids = {'dc-isp-metro'}  # ndc-isp-metro doesn't exist separately; check
for nid in list(node_by_id.keys()):
    if 'metro' in nid or 'mnet' in nid.lower():
        if nid not in metro_ids:
            metro_ids.add(nid)
print(f"Removing MetroNet nodes: {metro_ids}")
nodes = [n for n in nodes if n['id'] not in metro_ids]
edges = [e for e in edges if e['source'] not in metro_ids and e['target'] not in metro_ids]
node_by_id = {n['id']: n for n in nodes}

# =========================================================
# 2. UPDATE DEVICE DATA WITH LIBRENMS INFO
# =========================================================

# --- DC Core RT-01 (172.16.0.19) - note: hostname misconfigured as ndc-core-rt-01 ---
if 'dc-core-rt-01' in node_by_id:
    d = node_by_id['dc-core-rt-01']['data']
    d['hostname'] = 'DC-CORE-RT-01'
    d['mgmtIp'] = '172.16.0.19 (Gi0 Mgmt, VRF Mgmt-intf)'
    d['model'] = 'Cisco ASR 1001-X'
    d['ios'] = 'IOS-XE 17.6.6a (Bengaluru)'
    d['serial'] = 'FXS2439Q09N'
    d['ospfRouterId'] = '172.16.2.228'
    d['uplinks'] = 'Te0/0/0→DC-WAN-SW-01 Twe1/0/1 (ISP PRI trunk, 10G); Te0/0/1→DC-WAN-SW-02 Twe1/0/1 (ISP SEC trunk, 10G)'
    d['downlinks'] = 'Te0/1/0→DC-WAN-SW-01 Twe1/0/23 (VLAN 1626 RT-FW transit, 172.16.2.1/29); Gi0/0/0→RT-02 (172.16.2.98/29)'
    d['notes'] = '⚠ HOSTNAME BUG: device shows "ndc-core-rt-01.waltonbd.com" but is physically in DC (connected to DC WAN switches, MGMT VLAN 1600). Primary L3 edge. BGP+NAT on outside, PBR on inside (vlan1626) redirects to tracked ISP next-hops. Local AS 59209.'
    d['interfaces'] = 'Te0/0/0 (ISP PRI trunk, subints .120/.219/.502/.504/.701/.601); Te0/0/1 (ISP SEC trunk, subints .501/.503/.702/.1900/.1924/.602); Te0/1/0 (FW PBR via WAN-SW-01, vlan1626); Gi0/0/0 (RT HA 172.16.2.98/29); Lo0 (BGP peering 103.243.141.253/32); Lo1 (ADN BGP 103.243.142.253); Lo2 (AGNI BGP 103.243.143.253); Lo3 (ADN-DATA 10.168.221.247); Lo4 (AGNI-DATA 172.16.74.80); Lo5 (ADN NAT 202.51.187.67); Lo6 (AGNI NAT 182.252.64.176); Lo7 (MNET NAT 103.36.101.177); Lo8 (BracNet INT&DATA 115.127.145.128); Lo9 (BracNet INT 172.22.41.171)'
    d['tunnels'] = [
        {'name': 'Tunnel51-576+', 'desc': 'GRE/IPsec to ~76 remote CSM/WSMS sites (10.5.x.1/29 addressing)', 'count': '~76 branch tunnels', 'mtu': 9976},
        {'name': 'Tunnel117', 'desc': 'Walton→PrimeBank (81.80.81.1/30)', 'mtu': 9938},
        {'name': 'Tunnel31156/29156', 'desc': 'DC↔DR RT tunnels (AGNI-DATA/ADN-DATA to DR) — 172.31.1.58/29, 172.29.1.58/29', 'speed': '100G'},
        {'name': 'Tunnel3021xx', 'desc': 'DC-to-Mirour RT BracNet-DATA (172.30.2.x/29)'}
    ]
    d['bgpNeighbors'] = [
        {'peer': '10.101.62.169', 'asn': 38203, 'isp': 'ADN', 'type': 'INT', 'priority': 'PRI', 'subint': 'Te0/0/0.120', 'vlan': 120, 'ip': '10.101.62.173/29', 'uptime': '5d'},
        {'peer': '10.101.62.177', 'asn': 38203, 'isp': 'ADN', 'type': 'INT', 'priority': 'SEC', 'subint': 'Te0/0/1.1900', 'vlan': 1900, 'ip': '10.101.62.179/29', 'uptime': '3mo'},
        {'peer': '10.168.221.225', 'asn': 38203, 'isp': 'ADN', 'type': 'DATA', 'priority': 'PRI', 'subint': 'Te0/0/0.219', 'vlan': 219, 'ip': '10.168.221.228/29', 'uptime': '5d'},
        {'peer': '10.168.221.233', 'asn': 38203, 'isp': 'ADN', 'type': 'DATA', 'priority': 'SEC', 'subint': 'Te0/0/1.1924', 'vlan': 1924, 'ip': '10.168.221.236/29', 'uptime': '3mo'},
        {'peer': '119.148.14.169', 'asn': 65006, 'isp': 'AGNI', 'type': 'INT', 'priority': 'PRI', 'subint': 'Te0/0/0.502', 'vlan': 502, 'ip': '119.148.14.172/29', 'uptime': '4d'},
        {'peer': '119.148.38.185', 'asn': 65006, 'isp': 'AGNI', 'type': 'INT', 'priority': 'SEC', 'subint': 'Te0/0/1.501', 'vlan': 501, 'ip': '119.148.38.188/29', 'uptime': '1mo'},
        {'peer': '172.16.74.65', 'asn': 65006, 'isp': 'AGNI', 'type': 'DATA', 'priority': 'PRI', 'subint': 'Te0/0/0.504', 'vlan': 504, 'ip': '172.16.74.76/29', 'uptime': '1mo'},
        {'peer': '172.16.74.73', 'asn': 65006, 'isp': 'AGNI', 'type': 'DATA', 'priority': 'SEC', 'subint': 'Te0/0/1.503', 'vlan': 503, 'ip': '172.16.74.68/29', 'uptime': '4d'},
        {'peer': '172.22.41.152', 'asn': 24342, 'isp': 'BracNet', 'type': 'INT', 'priority': 'PRI', 'subint': 'Te0/0/0.701', 'vlan': 701, 'ip': '172.22.41.139/29', 'uptime': '1y2mo'},
        {'peer': '172.22.41.154', 'asn': 24342, 'isp': 'BracNet', 'type': 'DATA', 'priority': 'PRI', 'subint': 'Te0/0/0.601', 'vlan': 601, 'ip': '172.22.111.123/29', 'uptime': '1y2mo'},
        {'peer': '172.31.131.177', 'asn': 65040, 'isp': '?', 'type': '?', 'priority': '?', 'state': 'active (down)', 'note': 'Peer in active state (not established)'}
    ]
    d['natPools'] = [
        {'name': 'ADN_NAT_POOL', 'loopback': 'Lo5 = 202.51.187.67', 'range': '202.51.187.68-78/28', 'type': 'PAT'},
        {'name': 'AGNI_NAT_POOL', 'loopback': 'Lo6 = 182.252.64.176', 'range': '182.252.64.178-190/28', 'type': 'PAT'},
        {'name': 'MNET_NAT_POOL', 'loopback': 'Lo7 = 103.36.101.177', 'range': '103.36.101.177/32', 'type': 'PAT'},
        {'name': 'BracNet_NAT_POOL', 'loopback': 'Lo8 = 115.127.145.128', 'range': '115.127.145.128/28', 'type': 'PAT'}
    ]
    # Remove MNET-specific notes but keep pool (it's configured on Lo7 even if ISP removed)
    d['vlans'] = 'Subinterfaces: .120(ADN-INT-PRI), .219(ADN-DATA-PRI), .502(AGNI-INT-PRI), .504(AGNI-DATA-PRI), .601(BRAC-DATA-PRI), .701(BRAC-INT-PRI), .501(AGNI-INT-SEC), .503(AGNI-DATA-SEC), .602(BRAC-DATA-SEC), .702(BRAC-INT-SEC), .1900(ADN-INT-SEC), .1924(ADN-DATA-SEC); VLAN1626 (RT-FW via WAN-SW-01)'
    d['trafficFlow'] = 'LAN→Core-SV (default 0/0 → FW via vlan1628) → FW inspection → VLAN1626 (WAN-SW-01 L2 transit) → RT-01 Te0/1/0 (PBR UPLOAD_POLICY) → NAT PAT → selected ISP subint → Internet. Reverse: incoming traffic → ISP subint → RT (NAT outside→inside) → PBR next-hop or direct → FW → Core-SW'
    d['ipsecTunnels'] = 2  # per LibreNMS

# --- DC Core RT-02 (172.16.0.20) ---
if 'dc-core-rt-02' in node_by_id:
    d = node_by_id['dc-core-rt-02']['data']
    d['hostname'] = 'DC-CORE-RT-02'
    d['mgmtIp'] = '172.16.0.20 (Gi0 Mgmt, VRF Mgmt-intf)'
    d['model'] = 'Cisco ASR 1001-X'
    d['ios'] = 'IOS-XE 17.9.8 (Cupertino)'
    d['serial'] = 'FXS2434Q3HU'
    d['ospfRouterId'] = '172.16.2.227'
    d['uplinks'] = 'Te0/0/0→DC-WAN-SW-01 Twe1/0/2 (ISP PRI trunk, 10G); Te0/0/1→DC-WAN-SW-02 Twe1/0/2 (ISP SEC trunk, 10G)'
    d['downlinks'] = 'Te0/1/0→DC-WAN-SW-02 Twe1/0/23 (VLAN 1626 RT-FW transit, 172.16.2.2/29); Gi0/0/0→RT-01 (172.16.2.99/29)'
    d['notes'] = 'HA peer to DC-CORE-RT-01. Mirrors BGP/PBR/NAT config. Takes over on RT-01 failure. Note: Lo5 used as "ADN-INT-TRACKING" (202.51.187.66) instead of NAT pool; Lo10 added for BracNet-DATA.'
    d['interfaces'] = 'Te0/0/0 (ISP PRI trunk, subints .120/.219/.502/.504/.601/.701); Te0/0/1 (ISP SEC trunk, subints .501/.503/.602/.702/.1900/.1924); Te0/1/0 (FW PBR via WAN-SW-02, vlan1626); Gi0/0/0 (RT HA 172.16.2.99/29); Lo0 (103.243.141.254); Lo1 (103.243.142.254 ADN BGP); Lo2 (103.243.143.254 AGNI BGP); Lo3 (10.168.221.248 ADN-DATA); Lo4 (172.16.74.81 AGNI-DATA); Lo5 (202.51.187.66 ADN-INT tracking); Lo6 (182.252.64.177 AGNI NAT); Lo7 (103.36.101.177 MNET NAT); Lo8 (115.127.145.129 BracNet); Lo9 (172.22.41.172 BracNet-INT); Lo10 (172.22.111.139 BracNet-DATA)'
    d['tunnels'] = [
        {'name': 'Tunnel61-676+', 'desc': 'GRE/IPsec to ~76 remote CSM/WSMS sites (10.6.x.1/29)', 'count': '~76 branch tunnels', 'mtu': 9976},
        {'name': 'Tunnel302176/302184', 'desc': 'DC-RT02-to-MIROUR-RT BracNet-DATA (172.30.2.177/185/29)'}
    ]
    d['bgpAsn'] = 59209
    d['vlans'] = 'Mirror of RT-01 subints; VLAN1626 (RT-FW via WAN-SW-02)'
    d['trafficFlow'] = 'Same as RT-01, HA standby; activates when RT-01 or WAN-SW-01 fails'

# --- DC FW-01 (172.16.0.15 confirmed) ---
if 'dc-fw-01' in node_by_id:
    d = node_by_id['dc-fw-01']['data']
    d['hostname'] = 'DC-FW-01 (Active)'
    d['model'] = 'Cisco FTD NGFW (HA Active)'
    d['mgmtIp'] = '172.16.0.15'
    d['uplinks'] = 'Eth1/1→DC-WAN-SW-01 Twe1/0/22 (VLAN 1626, RT-FW transit)'
    d['downlinks'] = 'Eth1/2→DC-CORE-SW Te1/0/1 (chassis 1); Eth1/3→DC-CORE-SW Te2/0/2 (chassis 2) — Port-Channel1 vPC, VLAN 1628 (Core-FW)'
    d['notes'] = 'Active NGFW. Outside: VLAN 1626 (via WAN-SW-01 L2 to RT Te0/1/0). Inside: Po1 cross-connected to BOTH Core-SV members (vPC to both chassis for chassis redundancy). VLAN 1628 inside, VLAN 1626 outside.'
    d['interfaces'] = 'Eth1/1 (outside, VLAN 1626 via WAN-SW-01 Twe1/0/22); Eth1/2 (inside Po1 member, VLAN 1628 to Core-SV chassis1 Te1/0/1); Eth1/3 (inside Po1 member, VLAN 1628 to Core-SV chassis2 Te2/0/2)'

# --- DC FW-02 ---
if 'dc-fw-02' in node_by_id:
    d = node_by_id['dc-fw-02']['data']
    d['hostname'] = 'DC-FW-02 (Standby)'
    d['model'] = 'Cisco FTD NGFW (HA Standby)'
    d['uplinks'] = 'Eth1/1→DC-WAN-SW-02 Twe1/0/22 (VLAN 1626, RT-FW transit)'
    d['downlinks'] = 'Eth1/3→DC-CORE-SW Te1/0/2 (chassis 1); Eth1/2→DC-CORE-SW Te2/0/1 (chassis 2) — Port-Channel2 vPC, VLAN 1628 (Core-FW)'
    d['notes'] = 'Standby NGFW. Cross-patched (opposite order from FW-01) so that any single chassis failure keeps both FWs connected. Outside: VLAN 1626 via WAN-SW-02 Twe1/0/22. Inside: Po2 cross-connected.'
    d['interfaces'] = 'Eth1/1 (outside, VLAN 1626 via WAN-SW-02 Twe1/0/22); Eth1/2 (inside Po2 member, VLAN 1628 to Core-SV chassis2 Te2/0/1); Eth1/3 (inside Po2 member, VLAN 1628 to Core-SV chassis1 Te1/0/2)'

# --- DC WAN-SW-01 ---
if 'dc-wan-sw-01' in node_by_id:
    d = node_by_id['dc-wan-sw-01']['data']
    d['hostname'] = 'DC-WAN-SW-01'
    d['model'] = 'Cisco C9500-24Y4C'
    d['ios'] = 'IOS-XE 17.3.3 (Amsterdam)'
    d['serial'] = 'FDO2447191X'
    d['mgmtIp'] = '172.16.0.23'
    d['uplinks'] = 'Twe1/0/3 (ADN INT&DATA PRI, 1G); Twe1/0/5-6 (MNET/Metro INT/DATA PRI, 1G); Twe1/0/7 (AGNI INT&DATA PRI, 1G); Twe1/0/9 (BracNet INT&DATA PRI, 1G)'
    d['downlinks'] = 'Twe1/0/1→DC-CORE-RT-01 Te0/0/0 (10G, ISP PRI trunk); Twe1/0/2→DC-CORE-RT-02 Te0/0/0 (10G, ISP PRI trunk); Twe1/0/22→DC-FW-01 Eth1/1 (VLAN 1626, 10G); Twe1/0/23→DC-CORE-RT-01 Te0/1/0 (VLAN 1626, 10G); Twe1/0/24→DC-WAN-SW-02 Twe1/0/24 (10G inter-switch)'
    d['vlans'] = '120(ADN-INT-PRI), 219(ADN-DATA-PRI), 502(AGNI-INT-SEC), 504(AGNI-DATA-SEC), 601(METRO-INT-PRI/Brac-DATA-PRI), 603(METRO-DATA-PRI), 701(BracNet-INT&DATA-PRI), 1015(METRO-INT-PRI), 1626(RT-FW), 1900(ADN-INT-SEC), 1924(ADN-DATA-SEC) + others'
    d['notes'] = 'L2 aggregation switch. ISP handoff ports connect directly to provider MikroTik/Chandra-PoP routers. VLAN 1626 "RT-FW" carries PBR transit between RT Te0/1/0 and FW Eth1/1. Twe1/0/24 is 10G inter-switch link (ISL) to WAN-SW-02.'
    d['interfaces'] = 'Twe1/0/1 (→RT-01 Te0/0/0); Twe1/0/2 (→RT-02 Te0/0/0); Twe1/0/3 (ADN PRI); Twe1/0/5 (MNET INT PRI, ether8-INT_PRI MikroTik); Twe1/0/6 (MNET DATA PRI, ether12-Data_PRI); Twe1/0/7 (AGNI PRI, Chandra-2-PoP sfp-sfpplus4); Twe1/0/9 (BracNet PRI, Walton DC Chandra sfp-sfpplus3); Twe1/0/22 (→FW-01 Eth1/1); Twe1/0/23 (→RT-01 Te0/1/0); Twe1/0/24 (→WAN-SW-02 P-24); Hu1/0/25-28 (100G, unused); 40G uplinks → Spine (Twe1/0/4 etc.)'
    d['ospfAreas'] = ''

# --- DC WAN-SW-02 ---
if 'dc-wan-sw-02' in node_by_id:
    d = node_by_id['dc-wan-sw-02']['data']
    d['hostname'] = 'DC-WAN-SW-02'
    d['model'] = 'Cisco C9500-24Y4C'
    d['ios'] = 'IOS-XE 17.3.3 (Amsterdam)'
    d['serial'] = 'FDO244800W7'
    d['mgmtIp'] = '172.16.0.24'
    d['uplinks'] = 'Twe1/0/3 (ADN INT&DATA SEC, 1G); Twe1/0/6 (MNET DATA SEC, 1G); Twe1/0/7 (AGNI INT&DATA SEC, 1G); Twe1/0/9 (BracNet INT&DATA SEC, 1G)'
    d['downlinks'] = 'Twe1/0/1→DC-CORE-RT-01 Te0/0/1 (10G, ISP SEC trunk); Twe1/0/2→DC-CORE-RT-02 Te0/0/1 (10G, ISP SEC trunk); Twe1/0/22→DC-FW-02 Eth1/1 (VLAN 1626, 10G); Twe1/0/23→DC-CORE-RT-02 Te0/1/0 (VLAN 1626, 10G); Twe1/0/24→DC-WAN-SW-01 Twe1/0/24 (10G inter-switch); Po10 (100M)'
    d['vlans'] = '501(AGNI-INT-PRI/SEC), 503(AGNI-DATA-PRI/SEC), 602(BracNet-DATA-SEC/METRO-INT-SEC), 604(METRO-DATA-SEC), 702(BracNet-INT&DATA-SEC), 1626(RT-FW), 1900(ADN-INT-SEC), 1924(ADN-DATA-SEC), 702(SVI 172.22.41.196/29 for Brac SEC)'
    d['notes'] = 'L2 aggregation (secondary/HA). ISP handoff ports connect to secondary ISP routers (Chandra-POP-1 for AGNI SEC). VLAN 1626 "RT-FW" same as WAN-SW-01.'
    d['interfaces'] = 'Twe1/0/1 (→RT-01 Te0/0/1); Twe1/0/2 (→RT-02 Te0/0/1); Twe1/0/3 (ADN SEC); Twe1/0/6 (MNET DATA SEC, ether11-Data_SEC); Twe1/0/7 (AGNI SEC, Chandra-POP-1 sfp-sfpplus7); Twe1/0/9 (BracNet SEC, sfp-sfpplus4); Twe1/0/22 (→FW-02 Eth1/1); Twe1/0/23 (→RT-02 Te0/1/0); Twe1/0/24 (→WAN-SW-01 P-24)'
    d['ospfAreas'] = ''

# --- DC Core-SW ---
if 'dc-core-sw' in node_by_id:
    d = node_by_id['dc-core-sw']['data']
    d['hostname'] = 'DC-CORE-SW (SV pair)'
    d['model'] = 'Cisco C9500-40X (StackWise Virtual, 2 chassis, domain 1)'
    d['ios'] = 'IOS-XE 17.3.3 (Amsterdam)'
    d['serial'] = 'FOC2445LDCH (master, chassis1)'
    d['mgmtIp'] = '172.16.0.21 (Gi0/0 chassis1)'
    d['uplinks'] = 'Po1 = Te1/0/1 + Te2/0/2 → FW-01 Eth1/2+Eth1/3 (vPC, VLAN 1628); Po2 = Te1/0/2 + Te2/0/1 → FW-02 Eth1/3+Eth1/2 (vPC, VLAN 1628); FortyGig1/1/1 → 172.16.0.7 (→ Spine, 40G); FortyGig1/1/2 → 172.16.0.8 (→ Spine, 40G); Po5 = Te1/0/31-34 → NDC-CORE-SW (4×10G = 40G LAG, MTU 9150, DCI); Po11 = Te1/0/3 + Te2/0/3 → WMTC-B1-CORE (2×10G LAG)'
    d['downlinks'] = 'Po22 (Te1/0/14+Te2/0/14) → NDC-Dist-SW gi27-28; Te1/0/7→WMTC-B7 (1G); Te1/0/9→WMTC-B9 (1G); Te2/0/8→WMTC-B8 (1G); Te1/0/13+Te2/0/13 Po21→WMTC-Shed10; Te1/0/18→VPN-Server-Mikrotik (172.16.2.249/29); Te1/0/37→OOB-SW-01 (1G)'
    d['notes'] = 'StackWise Virtual (SV) — 2× C9500-40X acting as single logical switch. Te1/x/x = chassis1, Te2/x/x = chassis2. FW connections are vPC port-channels cross-connected to both chassis for full redundancy. 40G DCI to NDC uses jumbo frames (MTU 9150). Te1/0/38-40 = StackWise Virtual Link (SVL) to chassis2.'
    d['interfaces'] = 'Te1/0/1 (→FW-01 Eth1/2, Po1 member); Te1/0/2 (→FW-02 Eth1/3, Po2 member); Te1/0/3 (→WMTC-B1 Po11 member); Te1/0/31-34 (→NDC Po5 DCI, MTU 9150); Te2/0/1 (→FW-02 Eth1/2, Po2 member); Te2/0/2 (→FW-01 Eth1/3, Po1 member); Te2/0/3 (→WMTC-B1 Po11 member); Fo1/1/1-2 (→ Spine 40G)'
    d['vlans'] = '1600(MGMT), 1608(ND-DAT-NETWORK), 1628(Core-FW), plus user VLANs 11-12, 101-609, etc.'

# --- NDC Core RT-01 ---
if 'ndc-core-rt-01' in node_by_id:
    d = node_by_id['ndc-core-rt-01']['data']
    d['hostname'] = 'NDC-CORE-RT-01'
    d['model'] = 'Cisco ASR 1001-X'
    d['ios'] = 'IOS-XE 17.6.3a (Bengaluru)'
    d['serial'] = 'FXS2532Q1S0'
    d['mgmtIp'] = '172.16.6.19 (Gi0 Mgmt, VRF Mgmt-intf)'
    d['ospfRouterId'] = '172.16.8.228'
    d['uplinks'] = 'Te0/0/0→NDC-WAN-SW-01 Twe1/0/1 (ISP PRI trunk); Te0/0/1→NDC-WAN-SW-02 Twe1/0/1 (ISP SEC trunk)'
    d['downlinks'] = 'Te0/1/0→NDC-WAN-SW-01 Twe1/0/23 (VLAN 1680 RT-FW transit, 172.16.8.1/29); Gi0/0/0→RT-02 (172.16.8.98/29)'
    d['notes'] = 'Primary NDC L3 edge. Local AS 59209. BGP+NAT on outside, PBR on inside (VLAN 1680). AGNI AS = 23923 at NDC (different from DC AS65006).'
    d['interfaces'] = 'Te0/0/0 sub: .181(ADN-DATA-PRI 10.168.221.194/29), .182(ADN-INT-PRI 10.101.31.106/29), .505(AGNI-INT-PRI 119.148.41.242/29), .506(AGNI-DATA-PRI 172.16.203.114/29), .705(BracNet-INT&DATA-PRI 172.22.41.186/29), .501(BracNet-DATA-PRI 172.22.111.146/29); Te0/0/1 sub: .205(ADN-DATA-SEC 10.168.221.202/29), .206(ADN-INT-SEC 10.101.31.114/29), .507(AGNI-INT-SEC 119.148.41.250/29), .508(AGNI-DATA-SEC 172.16.203.122/29), .706(BracNet-INT&DATA-SEC 172.22.41.194/29), .502(BracNet-DATA-SEC 172.22.111.154/29); Lo0 (103.243.140.253); Lo3 (ADN TUNNEL 10.168.221.241); Lo4 (AGNI TUNNEL 172.16.200.136); Lo5 (ADN NAT 103.219.163.32); Lo7 (BracNet 115.127.145.144); Lo8 (BracNet-INT 172.22.41.201)'
    d['tunnels'] = [
        {'name': 'Tunnel11-162+', 'desc': 'GRE/IPsec to ~75 remote CSM/WSMS sites (10.1.x.1/29)', 'mtu': 9976},
        {'name': 'Tunnel1031', 'desc': 'NDC AGNI RT-01-DATA (172.31.1.34/29)', 'mtu': 9976},
        {'name': 'Tunnel1032', 'desc': 'NDC ADN RT-01-DATA (172.29.1.34/29)', 'mtu': 10000},
        {'name': 'Tunnel31156/29156', 'desc': 'NDC-RT01→DR-RT01 AGNI/ADN-DATA-PRI (172.31.1.58/29, 172.29.1.58/29)', 'speed': '100G', 'mtu': 9976},
        {'name': 'Tunnel30256', 'desc': 'NDC-RT1→DR-RT2 BracNet-DATA-PRI (172.30.2.58/29)', 'speed': '100G', 'mtu': 9976}
    ]
    d['bgpNeighbors'] = [
        {'peer': '10.101.31.105', 'asn': 38203, 'isp': 'ADN', 'type': 'INT', 'priority': 'PRI', 'ip': '10.101.31.106/29', 'vlan': 182},
        {'peer': '10.101.31.113', 'asn': 38203, 'isp': 'ADN', 'type': 'INT', 'priority': 'SEC', 'ip': '10.101.31.114/29', 'vlan': 206},
        {'peer': '10.168.221.193', 'asn': 38203, 'isp': 'ADN', 'type': 'DATA', 'priority': 'PRI', 'ip': '10.168.221.194/29', 'vlan': 181},
        {'peer': '10.168.221.201', 'asn': 38203, 'isp': 'ADN', 'type': 'DATA', 'priority': 'SEC', 'ip': '10.168.221.202/29', 'vlan': 205},
        {'peer': '119.148.41.241', 'asn': 23923, 'isp': 'AGNI', 'type': 'INT', 'priority': 'PRI', 'ip': '119.148.41.242/29', 'vlan': 505},
        {'peer': '119.148.41.249', 'asn': 23923, 'isp': 'AGNI', 'type': 'INT', 'priority': 'SEC', 'ip': '119.148.41.250/29', 'vlan': 507},
        {'peer': '172.16.203.113', 'asn': 23923, 'isp': 'AGNI', 'type': 'DATA', 'priority': 'PRI', 'ip': '172.16.203.114/29', 'vlan': 506},
        {'peer': '172.16.203.121', 'asn': 23923, 'isp': 'AGNI', 'type': 'DATA', 'priority': 'SEC', 'ip': '172.16.203.122/29', 'vlan': 508},
        {'peer': '172.22.41.208', 'asn': 24342, 'isp': 'BracNet', 'type': 'INT&DATA', 'priority': 'PRI', 'ip': '172.22.41.186/29', 'vlan': 705},
        {'peer': '172.22.111.118', 'asn': 24342, 'isp': 'BracNet', 'type': 'DATA', 'priority': 'PRI', 'ip': '172.22.111.146/29', 'vlan': 501}
    ]
    d['natPools'] = [
        {'name': 'ADN_NAT_POOL', 'loopback': 'Lo5 = 103.219.163.32', 'type': 'PAT'},
        {'name': 'AGNI_NAT_POOL', 'loopback': 'Lo1 = 119.148.40.233', 'type': 'PAT'},
        {'name': 'BracNet_NAT_POOL', 'loopback': 'Lo7 = 115.127.145.144', 'type': 'PAT'}
    ]
    d['bgpAsn'] = 59209
    d['vlans'] = 'VLAN 1680 (RT-FW transit via WAN-SW-01); subints 181/182/205/206/505/506/507/508/705/706/501/502'
    d['trafficFlow'] = 'Same pattern as DC: LAN→NDC-Core-SW → VLAN 1688 → NDC-FW → VLAN 1680 (via WAN-SW-01 L2) → RT-01 Te0/1/0 → PBR → NAT → ISP'

# --- NDC Core RT-02 ---
if 'ndc-core-rt-02' in node_by_id:
    d = node_by_id['ndc-core-rt-02']['data']
    d['hostname'] = 'NDC-CORE-RT-02'
    d['model'] = 'Cisco ASR 1001-X'
    d['ios'] = 'IOS-XE 17.6.3a (Bengaluru)'
    d['serial'] = 'FXS2519Q02V'
    d['mgmtIp'] = '172.16.6.20'
    d['ospfRouterId'] = '172.16.8.227'
    d['uplinks'] = 'Te0/0/0→NDC-WAN-SW-01 Twe1/0/2 (ISP PRI trunk); Te0/0/1→NDC-WAN-SW-02 Twe1/0/2 (ISP SEC trunk)'
    d['downlinks'] = 'Te0/1/0→NDC-WAN-SW-02 Twe1/0/23 (VLAN 1680, 172.16.8.2/29); Gi0/0/0→RT-01 (172.16.8.99/29)'
    d['notes'] = 'HA peer to NDC-CORE-RT-01. Lo9 added for BracNet-DATA-TUNNEL (172.22.111.143).'
    d['interfaces'] = 'Mirror of RT-01 subint structure on Te0/0/0 (PRI) and Te0/0/1 (SEC); Lo0 (103.243.140.254); Lo3 (10.168.221.242 ADN); Lo4 (172.16.200.137 AGNI); Lo5 (103.219.163.33 ADN NAT); Lo1 (119.148.40.233 AGNI NAT); Lo7 (115.127.145.145 BracNet); Lo8 (172.22.41.202 BracNet-INT); Lo9 (172.22.111.143 BracNet-DATA tunnel)'
    d['tunnels'] = [
        {'name': 'Tunnel21-276+', 'desc': 'GRE/IPsec to ~75 remote CSM/WSMS (10.2.x.1/29)', 'mtu': 9976},
        {'name': 'Tunnel2031', 'desc': 'NDC AGNI RT-02-DATA (172.31.2.34/29)', 'mtu': 10000},
        {'name': 'Tunnel2032', 'desc': 'NDC ADN RT-02-DATA (172.29.2.34/29)', 'mtu': 10000},
        {'name': 'Tunnel31164/29164', 'desc': 'NDC-RT02→DR-RT01 AGNI/ADN-DATA-PRI (172.31.1.66/29, 172.29.1.66/29)', 'speed': '100G'}
    ]
    d['bgpAsn'] = 59209
    d['natPools'] = [
        {'name': 'ADN_NAT_POOL', 'loopback': 'Lo5 = 103.219.163.33'},
        {'name': 'AGNI_NAT_POOL', 'loopback': 'Lo1 = 119.148.40.233'},
        {'name': 'BracNet_NAT_POOL', 'loopback': 'Lo7 = 115.127.145.145'}
    ]
    d['vlans'] = 'Mirror of RT-01; VLAN 1680 (RT-FW via WAN-SW-02); Vlan706 SVI 172.22.41.196/29'
    d['trafficFlow'] = 'HA standby for NDC'

# --- NDC FW-01 ---
if 'ndc-fw-01' in node_by_id:
    d = node_by_id['ndc-fw-01']['data']
    d['hostname'] = 'NDC-FW-01 (Active)'
    d['model'] = 'Cisco FTD NGFW (HA Active)'
    d['uplinks'] = 'Eth1/1→NDC-WAN-SW-01 Twe1/0/22 (VLAN 1680, RT-FW transit)'
    d['downlinks'] = 'Eth1/2→NDC-CORE-SW Te1/0/1 (chassis1); Eth1/3→NDC-CORE-SW Te2/0/1 (chassis2) — Port-Channel1 vPC, VLAN 1688 (Core-FW)'
    d['notes'] = 'Active NGFW at NDC. Outside: VLAN 1680 via WAN-SW-01. Inside: Po1 cross-connected to both SV members. VLAN 1688 inside, 1680 outside.'
    d['interfaces'] = 'Eth1/1 (outside, VLAN 1680); Eth1/2 (inside Po1 → Te1/0/1); Eth1/3 (inside Po1 → Te2/0/1)'

# --- NDC FW-02 ---
if 'ndc-fw-02' in node_by_id:
    d = node_by_id['ndc-fw-02']['data']
    d['hostname'] = 'NDC-FW-02 (Standby)'
    d['model'] = 'Cisco FTD NGFW (HA Standby)'
    d['uplinks'] = 'Eth1/1→NDC-WAN-SW-02 Twe1/0/22 (VLAN 1680)'
    d['downlinks'] = 'Eth1/2→NDC-CORE-SW Te1/0/2 (chassis1); Eth1/3→NDC-CORE-SW Te2/0/2 (chassis2) — Port-Channel2 vPC, VLAN 1688'
    d['notes'] = 'Standby NGFW at NDC. Cross-patched Po2 to both SV chassis.'
    d['interfaces'] = 'Eth1/1 (outside, VLAN 1680 via WAN-SW-02 Twe1/0/22); Eth1/2 (inside Po2 → Te1/0/2); Eth1/3 (inside Po2 → Te2/0/2)'

# --- NDC WAN-SW-01 ---
if 'ndc-wan-sw-01' in node_by_id:
    d = node_by_id['ndc-wan-sw-01']['data']
    d['hostname'] = 'NDC-WAN-SW-01'
    d['model'] = 'Cisco C9500-24Y4C'
    d['ios'] = 'IOS-XE 17.6.4 (Bengaluru)'
    d['serial'] = 'FDO25340DAA'
    d['mgmtIp'] = '172.16.6.23'
    d['uplinks'] = 'Twe1/0/3 (ADN INT&DATA PRI, 1G); Twe1/0/7 (AGNI INT&DATA PRI, 1G, Chandra-POP-1 sfp-sfpplus9); Twe1/0/9 (BracNet INT&DATA PRI, 1G)'
    d['downlinks'] = 'Twe1/0/1→NDC-CORE-RT-01 Te0/0/0 (10G, ISP PRI trunk); Twe1/0/2→NDC-CORE-RT-02 Te0/0/0 (10G, ISP PRI trunk); Twe1/0/22→NDC-FW-01 Eth1/1 (VLAN 1680, 10G); Twe1/0/23→NDC-CORE-RT-01 Te0/1/0 (VLAN 1680, 10G); Twe1/0/24→NDC-WAN-SW-02 Twe1/0/24 (10G inter-switch)'
    d['vlans'] = '181(ADN-DATA-PRI), 182(ADN-INT-PRI), 501(BracNet-DATA-PRI), 505(AGNI-INT-PRI), 506(AGNI-DATA-PRI), 705(BracNet-INT&DATA-PRI), 1680(RT-FW), 205/206(ADN SEC via ISL), 507/508(AGNI SEC via ISL)'
    d['notes'] = 'NDC L2 aggregation (primary). Note: NO MetroNet ISP at NDC.'
    d['interfaces'] = 'Twe1/0/1-2 (to RTs PRI trunk); Twe1/0/3 (ADN PRI); Twe1/0/7 (AGNI PRI Chandra-POP-1); Twe1/0/9 (Brac PRI); Twe1/0/22 (→FW-01); Twe1/0/23 (→RT-01 FW transit); Twe1/0/24 (ISL to WAN-SW-02)'

# --- NDC WAN-SW-02 ---
if 'ndc-wan-sw-02' in node_by_id:
    d = node_by_id['ndc-wan-sw-02']['data']
    d['hostname'] = 'NDC-WAN-SW-02'
    d['model'] = 'Cisco C9500-24Y4C'
    d['ios'] = 'IOS-XE 17.6.4 (Bengaluru)'
    d['serial'] = 'FDO25340D7L'
    d['mgmtIp'] = '172.16.6.24'
    d['uplinks'] = 'Twe1/0/3 (ADN INT&DATA SEC, 1G); Twe1/0/7 (AGNI INT&DATA SEC, 1G, Chandra-2-PoP sfp-sfpplus8); Twe1/0/9 (BracNet INT&DATA SEC, 1G)'
    d['downlinks'] = 'Twe1/0/1→NDC-CORE-RT-01 Te0/0/1 (10G, ISP SEC trunk); Twe1/0/2→NDC-CORE-RT-02 Te0/0/1 (10G, ISP SEC trunk); Twe1/0/22→NDC-FW-02 Eth1/1 (VLAN 1680, 10G); Twe1/0/23→NDC-CORE-RT-02 Te0/1/0 (VLAN 1680, 10G); Twe1/0/24→NDC-WAN-SW-01 Twe1/0/24 (10G inter-switch)'
    d['vlans'] = '205(ADN-DATA-SEC), 206(ADN-INT-SEC), 502(BracNet-DATA-SEC), 507(AGNI-INT-SEC), 508(AGNI-DATA-SEC), 706(BracNet-INT&DATA-SEC), 1680(RT-FW), plus PRI VLANs via ISL; Vlan706 SVI 172.22.41.196/29'
    d['notes'] = 'NDC L2 aggregation (secondary/HA).'
    d['interfaces'] = 'Twe1/0/1-2 (to RTs SEC trunk); Twe1/0/3 (ADN SEC); Twe1/0/7 (AGNI SEC Chandra-2-PoP); Twe1/0/9 (Brac SEC); Twe1/0/22 (→FW-02); Twe1/0/23 (→RT-02 FW transit); Twe1/0/24 (ISL to WAN-SW-01)'

# --- NDC Core-SW ---
if 'ndc-core-sw' in node_by_id:
    d = node_by_id['ndc-core-sw']['data']
    d['hostname'] = 'NDC-CORE-SW (SV pair)'
    d['model'] = 'Cisco C9500-40X (StackWise Virtual, 2 chassis, domain 1)'
    d['ios'] = 'IOS-XE 17.6.4 (Bengaluru)'
    d['serial'] = 'FOC2547YBL7 (master chassis1), FOC2547YBSG (standby chassis2)'
    d['mgmtIp'] = '172.16.6.2 (Gi0/0 chassis1)'
    d['uplinks'] = 'Po1 = Te1/0/1 + Te2/0/1 → FW-01 Eth1/2+Eth1/3 (vPC, VLAN 1688); Po2 = Te1/0/2 + Te2/0/2 → FW-02 Eth1/2+Eth1/3 (vPC, VLAN 1688); FortyGig1/1/1→SPINE-01 (40G); FortyGig1/1/2→SPINE-02 (40G); Po5 = Te1/0/33-36 → DC-CORE-SW (4×10G = 40G LAG, MTU 9150, DCI); Po10 = Te1/0/10 + Te2/0/10 → WMTC-B1-CORE (2×1G LAG, backup path, ~0 bps idle)'
    d['downlinks'] = 'Te1/0/5→NDC-Sheed5 (1G, 172.16.8.129/29, ~21 Mbps); Te2/0/4→NDC-Sheed3-4 (1G, 172.16.8.153/29, ~28 Mbps); Te2/0/6→NDC-Sheed6 (1G, 172.16.8.137/29, ~28 Mbps); Te1/0/12→WHIL-B2 (1G, 172.16.8.161/29, ~103 Mbps heavy); Te1/0/15→WHIL-B1-Dist (1G, 192.168.101.2, ~389 Mbps heaviest!); Te1/0/31-32→ND-NODE-01/02 (VLAN 1607); Te1/0/37→OOB-01 (1G); Te1/0/30→WHIL-NEXUS-SW01; Po11 = Te1/0/30+Te2/0/30 → WHIL-NEXUS (VLAN 11)'
    d['notes'] = 'StackWise Virtual — 2× C9500-40X. Po10 to WMTC-B1 is 1G (not 10G) and is the BACKUP triangle path (DC is primary via Po11 2×10G). Te1/0/15 → WHIL-B1-Dist (192.168.101.2) is the heaviest NDC distribution link at ~389 Mbps. Te1/0/38-40 = SVL to chassis2.'
    d['interfaces'] = 'Te1/0/1-2 (FW Po1/Po2 members); Te1/0/10 (→WMTC-B1 Po10 member); Te1/0/12 (→WHIL-B2); Te1/0/15 (→WHIL-B1-Dist); Te1/0/33-36 (→DC Po5 DCI, MTU 9150); Fo1/1/1-2 (→SPINE-01/02 40G); Te2/0/1-2 (FW Po1/Po2 members); Te2/0/10 (→WMTC-B1 Po10 member)'
    d['vlans'] = '1606(MGMT), 1607(ND-DAT), 1688(Core-FW), plus user VLANs'

# --- WMTC-B1 Core ---
if 'wmtc-b1-core' in node_by_id:
    d = node_by_id['wmtc-b1-core']['data']
    d['hostname'] = 'WMTC-B1-CORE-SW'
    d['model'] = 'Cisco C9300-24T (single chassis, per LLDP — verify if SV)'
    d['mgmtIp'] = '192.168.137.1'
    d['uplinks'] = 'Te2/1/8→DC-CORE-SW Po11 (2×10G = 20G LAG, PRIMARY path, ~106 Mbps active); Te2/1/5→NDC-CORE-SW Po10 (2×1G = 2G LAG, BACKUP path, ~0 bps idle)'
    d['downlinks'] = 'Te1/1/8 → multiple distribution switches (B2, B3, B7, B8, B9, Shed10, PP-Comp, etc.)'
    d['notes'] = '⚠ LLDP shows single chassis C9300-24T at 192.168.137.1. If SV, second chassis not discovered by LibreNMS. Primary uplink via DC (20G Po11), backup via NDC (2G Po10). Note NDC link is only 1G.'
    d['interfaces'] = 'Te2/1/8 (→DC Po11); Te2/1/5 (→NDC Po10); Te1/1/8 (downlinks to dists)'

# --- Rename unidentified heavy switch to WHIL-B1-Dist ---
if 'whil-b1' in node_by_id:
    d = node_by_id['whil-b1']['data']
    # This is connected to DC core per current edges; user says 192.168.101.2 is WHIL Main Building 1 from NDC
    # Let's rename whil-b1 since we need a new one
    pass

# Need to add a new node for WHIL-Main-Building-1 dist switch at NDC
# Check if it already exists
whil_b1_dist_exists = any(n['id'] == 'ndc-whil-b1-dist' for n in nodes)
if not whil_b1_dist_exists:
    nodes.append({
        "id": "ndc-whil-b1-dist", "type": "customDevice", "position": {"x": 2050, "y": 950},
        "data": {"hostname": "WHIL-MB-1-DIST (NDC)", "deviceType": "Switch", "site": "FULL",
                 "model": "Cisco C9300-24T", "ios": "IOS-XE",
                 "mgmtIp": "192.168.101.2", "uplinks": "Gi1/0/24 → NDC-CORE-SW Te1/0/15 (1G, ~389 Mbps — heaviest NDC dist!)",
                 "downlinks": "WHIL Main Building floors/sheds",
                 "notes": "WHIL Main Building 1 distribution switch. Heaviest NDC distribution uplink at ~389 Mbps. Connected to NDC-CORE-SW Te1/0/15. Port label is just 'Uplink' in LibreNMS.",
                 "vlans": "130-149 (WMTC-B1 user VLANs), 1606 (MGMT)", "interfaces": "Gi1/0/24 (uplink to NDC-CORE)", "ospfAreas": ""}
    })
    node_by_id = {n['id']: n for n in nodes}

# =========================================================
# 3. UPDATE EDGES
# =========================================================

# Build edge lookup
edge_by_id = {e['id']: e for e in edges}

def set_edge_data(eid, **kwargs):
    if eid in edge_by_id:
        e = edge_by_id[eid]
        e.setdefault('data', {})
        for k, v in kwargs.items():
            e['data'][k] = v
        edge_by_id[eid] = e

# First, fix/remove direct RT→FW edges (these go via WAN-SW, not direct)
# Mark old edges as via-wan-sw, add bandwidth and port info

# Update existing RT→WAN edges with port info and bandwidth
rt_wan_edges_fixes = {
    'e-dc-rt1-wan1': {'sourcePort': 'Te0/0/0', 'targetPort': 'Twe1/0/1', 'subnet': 'VLAN trunks 120/219/502/504/601/701', 'bandwidth': '10 Gbps', 'role': 'primary', 'label': 'PRI ISP Trunk'},
    'e-dc-rt1-wan2': {'sourcePort': 'Te0/0/1', 'targetPort': 'Twe1/0/1', 'subnet': 'VLAN trunks 501/503/602/702/1900/1924', 'bandwidth': '10 Gbps', 'role': 'secondary', 'label': 'SEC ISP Trunk'},
    'e-dc-rt2-wan1': {'sourcePort': 'Te0/0/0', 'targetPort': 'Twe1/0/2', 'subnet': 'PRI VLANs (parallel to RT-01)', 'bandwidth': '10 Gbps', 'role': 'primary', 'label': 'PRI ISP Trunk'},
    'e-dc-rt2-wan2': {'sourcePort': 'Te0/0/1', 'targetPort': 'Twe1/0/2', 'subnet': 'SEC VLANs (parallel to RT-01)', 'bandwidth': '10 Gbps', 'role': 'secondary', 'label': 'SEC ISP Trunk'},
    'e-ndc-rt1-wan1': {'sourcePort': 'Te0/0/0', 'targetPort': 'Twe1/0/1', 'subnet': 'PRI VLANs 181/182/505/506/501/705', 'bandwidth': '10 Gbps', 'role': 'primary', 'label': 'PRI ISP Trunk'},
    'e-ndc-rt1-wan2': {'sourcePort': 'Te0/0/1', 'targetPort': 'Twe1/0/1', 'subnet': 'SEC VLANs 205/206/507/508/502/706', 'bandwidth': '10 Gbps', 'role': 'secondary', 'label': 'SEC ISP Trunk'},
    'e-ndc-rt2-wan1': {'sourcePort': 'Te0/0/0', 'targetPort': 'Twe1/0/2', 'subnet': 'PRI VLANs (parallel)', 'bandwidth': '10 Gbps', 'role': 'primary', 'label': 'PRI ISP Trunk'},
    'e-ndc-rt2-wan2': {'sourcePort': 'Te0/0/1', 'targetPort': 'Twe1/0/2', 'subnet': 'SEC VLANs (parallel)', 'bandwidth': '10 Gbps', 'role': 'secondary', 'label': 'SEC ISP Trunk'},
}
for eid, fix in rt_wan_edges_fixes.items():
    set_edge_data(eid, **fix)

# Update RT↔RT HA links
set_edge_data('e-dc-rt1-rt2', sourcePort='Gi0/0/0', targetPort='Gi0/0/0', subnet='172.16.2.96/29', bandwidth='1 Gbps', label='RT HA Interlink')
set_edge_data('e-ndc-rt1-rt2', sourcePort='Gi0/0/0', targetPort='Gi0/0/0', subnet='172.16.8.96/29', bandwidth='1 Gbps', label='RT HA Interlink')

# Update WAN-SW inter-switch links
for prefix in ['dc', 'ndc']:
    set_edge_data(f'e-{prefix}-wan1-wan2', sourcePort='Twe1/0/24', targetPort='Twe1/0/24', bandwidth='10 Gbps', label='Inter-Switch Link (ISL)', vlan='All VLANs trunked')

# Update RT→FW edges — these go via WAN-SW, so mark them as L2 transit through WAN-SW
# Direct RT→FW edges should be removed and replaced with RT→WAN→FW path representation
# Let's identify direct RT→FW edges:
rt_fw_direct = []
for e in edges:
    src_rt = ('rt' in e.get('source','') and ('core-rt' in e.get('source','')))
    tgt_fw = ('fw' in e.get('target',''))
    if src_rt and tgt_fw:
        rt_fw_direct.append(e['id'])
    src_fw = ('fw' in e.get('source',''))
    tgt_rt = ('rt' in e.get('target','') and 'core-rt' in e.get('target',''))
    if src_fw and tgt_rt:
        rt_fw_direct.append(e['id'])

print(f"Direct RT→FW edges to remove/update: {rt_fw_direct}")
# These edges will now show as: RT Te0/1/0 → WAN-SW (VLAN 1626/1680) → FW
# We'll keep the edges in the graph but add a 'transitVia' note
for eid in rt_fw_direct:
    if eid in edge_by_id:
        e = edge_by_id[eid]
        site = 'dc' if e['source'].startswith('dc') or e['target'].startswith('dc') else 'ndc'
        vlan = '1626 (RT-FW)' if site == 'dc' else '1680 (RT-FW)'
        wan = 'WAN-SW-01' if 'rt-01' in (e['source']+e['target']) and 'fw-01' in (e['source']+e['target']) else ('WAN-SW-02' if 'rt-02' in (e['source']+e['target']) and 'fw-02' in (e['source']+e['target']) else 'WAN-SW')
        subnet = '172.16.2.0/29' if site == 'dc' else '172.16.8.0/29'
        set_edge_data(eid, transitVia=wan, vlan=vlan, subnet=subnet, bandwidth='10 Gbps',
                     label=f'via {wan} (VLAN {vlan})', linkType='pbr-transit',
                     note=f'L2 transit through {wan}: RT Te0/1/0 → WAN-SW Twe1/0/23 → WAN-SW Twe1/0/22 → FW Eth1/1')
        # Add source/target ports
        if 'rt-01' in e['source']:
            e['data']['sourcePort'] = 'Te0/1/0'
        elif 'rt-02' in e['source']:
            e['data']['sourcePort'] = 'Te0/1/0'

# Update FW→Core-SW edges (cross-connected vPC)
fw_core_edges = []
for e in edges:
    has_fw = 'fw' in e.get('source','') or 'fw' in e.get('target','')
    has_core = 'core-sw' in e.get('source','') or 'core-sw' in e.get('target','')
    if has_fw and has_core:
        fw_core_edges.append(e['id'])
print(f"FW→Core-SW edges: {fw_core_edges}")

fw_core_info = {
    # Determine which is which by ID pattern
}
for eid in fw_core_edges:
    e = edge_by_id.get(eid)
    if not e: continue
    src, tgt = e['source'], e['target']
    fw_id = src if 'fw' in src else tgt
    core_id = src if 'core-sw' in src else tgt
    site = 'dc' if fw_id.startswith('dc') else 'ndc'
    vlan = '1628 (Core-FW)' if site == 'dc' else '1688 (Core-FW)'
    fw_num = '01' if 'fw-01' in fw_id else '02'
    po = 'Po1 (vPC cross-connected)' if fw_num == '01' else 'Po2 (vPC cross-connected)'
    # FW-01: Eth1/2→chassis1 Te1/0/1, Eth1/3→chassis2 Te2/0/2
    # FW-02: Eth1/3→chassis1 Te1/0/2, Eth1/2→chassis2 Te2/0/1
    set_edge_data(eid, portChannel=po, bandwidth='2×10G vPC (20G)', vlan=vlan,
                 label=f'{po}, VLAN {vlan}',
                 note=f'Cross-connected vPC to BOTH SV chassis for redundancy', linkType='pbr')

# Update DC↔NDC DCI link
triangle_edges = []
for e in edges:
    if ('dc-core-sw' in e.get('source','') and 'ndc-core-sw' in e.get('target','')) or \
       ('ndc-core-sw' in e.get('source','') and 'dc-core-sw' in e.get('target','')):
        triangle_edges.append(e['id'])
print(f"DC↔NDC edges: {triangle_edges}")
for eid in triangle_edges:
    set_edge_data(eid, portChannel='Po5', bandwidth='4×10G = 40 Gbps LAG', mtu=9150,
                 label='4×10G Po5, MTU 9150 (DCI)', linkType='dci')

# Update triangle edges (Core↔B1)
b1_edges = []
for e in edges:
    if 'wmtc-b1-core' in e.get('source','') or 'wmtc-b1-core' in e.get('target',''):
        if 'core-sw' in e.get('source','') or 'core-sw' in e.get('target',''):
            b1_edges.append(e['id'])
print(f"Core↔B1 edges: {b1_edges}")
for eid in b1_edges:
    e = edge_by_id[eid]
    is_dc = ('dc-core-sw' in e['source'] or 'dc-core-sw' in e['target'])
    if is_dc:
        set_edge_data(eid, portChannel='Po11', bandwidth='2×10G = 20 Gbps LAG',
                     label='2×10G Po11 (PRIMARY, ~106Mbps active)', role='primary', linkType='triangle')
    else:
        set_edge_data(eid, portChannel='Po10', bandwidth='2×1G = 2 Gbps LAG',
                     label='2×1G Po10 (BACKUP, ~0 bps idle)', role='backup', linkType='triangle')

# Add edge: ndc-core-sw → ndc-whil-b1-dist (WHIL Main Building 1)
# Check if edge exists
whil_edge_exists = any(
    (('ndc-core-sw' in e.get('source','') and 'ndc-whil-b1-dist' in e.get('target','')) or
     ('ndc-whil-b1-dist' in e.get('source','') and 'ndc-core-sw' in e.get('target','')))
    for e in edges
)
if not whil_edge_exists:
    edges.append({
        "id": "e-ndc-coresw-whilb1dist",
        "source": "ndc-core-sw", "target": "ndc-whil-b1-dist",
        "animated": False,
        "data": {"linkType": "access", "bandwidth": "1 Gbps", "label": "Te1/0/15 → Gi1/0/24",
                 "sourcePort": "Te1/0/15", "targetPort": "Gi1/0/24",
                 "note": "~389 Mbps active — heaviest NDC distribution link"}
    })

# Update existing whil-b1 (which is DC side, connected to DC core)
# Per user, WHIL-B1-Dist at NDC is the new node we just added. The existing whil-b1 in nodes 
# might be DC connected, rename it for clarity
if 'whil-b1' in node_by_id:
    d = node_by_id['whil-b1']['data']
    if 'DC' not in d.get('hostname', '') and 'dc' not in d.get('hostname', '').lower():
        d['hostname'] = 'WHIL-B1-DIST (DC side)'
        d['notes'] = d.get('notes', '') + ' Connected to DC-CORE-SW.'

# Add label "→ Spine" for 40G uplinks (these don't exist as explicit edges currently since
# spine nodes aren't modeled; we'll add a note in the device drawers instead which we did above)

# Update ISP edges with VLAN info and remove any metro edges
# Check for metro edges to remove explicitly
edges_to_remove = set()
for e in edges:
    if 'metro' in e.get('source','') or 'metro' in e.get('target','') or 'mnet' in e.get('source','').lower() or 'mnet' in e.get('target','').lower():
        edges_to_remove.add(e['id'])
if edges_to_remove:
    print(f"Removing edges: {edges_to_remove}")
    edges = [e for e in edges if e['id'] not in edges_to_remove]

# Update ISP edge labels with VLAN info  
for e in edges:
    if 'isp' in e.get('source','') or 'isp' in e.get('target',''):
        e.setdefault('data', {})
        is_dc = e['source'].startswith('dc') or e['target'].startswith('dc')
        is_ndc = e['source'].startswith('ndc') or e['target'].startswith('ndc')
        is_adn = 'adn' in (e['source']+e['target'])
        is_agni = 'agni' in (e['source']+e['target'])
        is_brac = 'brac' in (e['source']+e['target'])
        wan = 'wan-sw-01' if 'wan-sw-01' in (e['source']+e['target']) else 'wan-sw-02'
        pri = 'wan-sw-01' in (e['source']+e['target'])
        if is_dc:
            if is_adn:
                vlans = 'VLAN 120(INT), 219(DATA)' if pri else 'VLAN 1900(INT), 1924(DATA)'
            elif is_agni:
                vlans = 'VLAN 502(INT), 504(DATA)' if pri else 'VLAN 501(INT), 503(DATA)'
            elif is_brac:
                vlans = 'VLAN 701(INT), 601(DATA)' if pri else 'VLAN 702(INT), 602(DATA)'
            else:
                vlans = ''
            e['data']['vlans'] = vlans
            e['data']['bandwidth'] = '1 Gbps'
            e['data']['label'] = f"{'PRI' if pri else 'SEC'} ({vlans})"
        elif is_ndc:
            if is_adn:
                vlans = 'VLAN 182(INT), 181(DATA)' if pri else 'VLAN 206(INT), 205(DATA)'
            elif is_agni:
                vlans = 'VLAN 505(INT), 506(DATA)' if pri else 'VLAN 507(INT), 508(DATA)'
            elif is_brac:
                vlans = 'VLAN 705(INT), 501(DATA)' if pri else 'VLAN 706(INT), 502(DATA)'
            else:
                vlans = ''
            e['data']['vlans'] = vlans
            e['data']['bandwidth'] = '1 Gbps'
            e['data']['label'] = f"{'PRI' if pri else 'SEC'} ({vlans})"

# =========================================================
# 4. Update ISP cloud node data (NDC: remove metro, update AS info)
# =========================================================
# DC ISP nodes - update AGNI AS (DC RT-01 shows AS65006 but NDC shows AS23923)
if 'dc-isp-adn' in node_by_id:
    node_by_id['dc-isp-adn']['data']['notes'] = 'ADN Telecom AS38203 — INT via VLAN 120(PRI)/1900(SEC); DATA VPN via VLAN 219(PRI)/1924(SEC); public NAT pool 202.51.187.64/28 via Lo5/Lo6'
if 'dc-isp-agni' in node_by_id:
    node_by_id['dc-isp-agni']['data']['notes'] = 'Agni Systems AS65006 (DC side) — PRIMARY Internet ISP; VLAN 502/504 PRI via Chandra-2-PoP, VLAN 501/503 SEC via Chandra-POP-1; NAT pool 182.252.64.176/28 via Lo6'
if 'dc-isp-brac' in node_by_id:
    node_by_id['dc-isp-brac']['data']['notes'] = 'BracNet AS24342 — VLAN 701(INT&DATA PRI), VLAN 601(DATA PRI) via Walton DC Chandra MikroTik sfp-sfpplus3; SEC via VLAN 702/602 on WAN-SW-02; NAT pool 115.127.145.128/28'

# NDC ISP nodes
if 'ndc-isp-adn' in node_by_id:
    node_by_id['ndc-isp-adn']['data']['notes'] = 'ADN Telecom AS38203 (NDC side) — INT via VLAN 182(PRI)/206(SEC); DATA via VLAN 181(PRI)/205(SEC); NAT pool 103.219.163.32/33 via Lo5'
    node_by_id['ndc-isp-adn']['data']['hostname'] = 'ADN Telecom (NDC)'
if 'ndc-isp-agni' in node_by_id:
    node_by_id['ndc-isp-agni']['data']['notes'] = 'Agni Systems AS23923 (NDC side — different AS from DC AS65006!); VLAN 505(INT PRI)/506(DATA PRI) via Chandra-POP-1 sfp-sfpplus9, VLAN 507/508 SEC via Chandra-2-PoP sfp-sfpplus8; NAT pool 119.148.40.233 via Lo1'
    node_by_id['ndc-isp-agni']['data']['hostname'] = 'Agni Systems (NDC)'
if 'ndc-isp-brac' in node_by_id:
    node_by_id['ndc-isp-brac']['data']['notes'] = 'BracNet AS24342 (NDC) — VLAN 705(INT&DATA PRI)/501(DATA PRI) via Walton NDC Chandra sfp-sfpplus3; SEC via VLAN 706/502 on WAN-SW-02; NAT pool 115.127.145.144/145 via Lo7'
    node_by_id['ndc-isp-brac']['data']['hostname'] = 'BracNet (NDC)'

# Check if ndc-isp-metro exists and remove it
ndc_metro_nodes = [n['id'] for n in nodes if 'metro' in n['id'] or 'mnet' in n['id'].lower()]
if ndc_metro_nodes:
    print(f"Removing NDC metro nodes: {ndc_metro_nodes}")
    nodes = [n for n in nodes if n['id'] not in ndc_metro_nodes]
    edges = [e for e in edges if e['source'] not in ndc_metro_nodes and e['target'] not in ndc_metro_nodes]

# =========================================================
# 5. Save back to DB
# =========================================================
topo.nodes = json.dumps(nodes)
topo.edges = json.dumps(edges)
session.commit()
session.close()

print(f"\n✅ Migration complete!")
print(f"Final: {len(nodes)} nodes, {len(edges)} edges")
