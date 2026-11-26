"""
seed_dc_all.py - Complete Enterprise Topology Seeder for Walton DC
Includes:
- Multi-Homed ISPs (ADN, Agni, BracNet, MetroNet)
- Dual WAN Core Switches (DC-WAN-SW-01, DC-WAN-SW-02)
- Dual DC Core BGP/OSPF Routers (DC-CORE-RT-01, DC-CORE-RT-02)
- Complete Active Interfaces, VLANs, BGP Neighbors, and OSPF Areas mapping.
"""

from database import engine, SessionLocal, Base
from models import Topology
import datetime

# Clean create tables
Base.metadata.create_all(bind=engine)

def seed_topology():
    db = SessionLocal()

    # Clear previous topology records cleanly
    db.query(Topology).delete()
    db.commit()

    # -------------------------------------------------------------
    # 1. NODES DEFINITION
    # -------------------------------------------------------------
    nodes = [
        # ================= ISP TIER =================
        {
            "id": "isp-adn",
            "type": "customDevice",
            "position": {"x": 100, "y": 40},
            "data": {
                "label": "ADN Telecom",
                "hostname": "ISP-ADN-TRANSIT",
                "deviceType": "isp",
                "role": "Tier-1 Internet & MPLS Provider",
                "ip": "10.101.62.169",
                "mgmtIp": "10.101.62.169 / 10.168.221.225",
                "bgpAs": "AS 38203",
                "interfaces": [
                    {"name": "ADN-INT-PRI", "ip": "10.101.62.169/29", "vlan": 120, "description": "Primary Internet Transit BGP"},
                    {"name": "ADN-DATA-PRI", "ip": "10.168.221.225/29", "vlan": 219, "description": "Primary Corporate MPLS BGP"},
                    {"name": "ADN-INT-SEC", "ip": "10.101.62.177/29", "vlan": 1900, "description": "Secondary Internet Transit BGP"},
                    {"name": "ADN-DATA-SEC", "ip": "10.168.221.233/29", "vlan": 1924, "description": "Secondary Corporate MPLS BGP"}
                ]
            }
        },
        {
            "id": "isp-agni",
            "type": "customDevice",
            "position": {"x": 480, "y": 40},
            "data": {
                "label": "Agni Systems",
                "hostname": "ISP-AGNI-TRANSIT",
                "deviceType": "isp",
                "role": "Tier-1 Internet & MPLS Provider",
                "ip": "119.148.14.169",
                "mgmtIp": "119.148.14.169 / 172.16.74.73",
                "bgpAs": "AS 65006",
                "interfaces": [
                    {"name": "AGNI-INT-PRI", "ip": "119.148.14.169/29", "vlan": 502, "description": "Primary Internet Transit BGP"},
                    {"name": "AGNI-DATA-PRI", "ip": "172.16.74.73/29", "vlan": 504, "description": "Primary Corporate MPLS BGP"},
                    {"name": "AGNI-INT-SEC", "ip": "119.148.38.185/29", "vlan": 501, "description": "Secondary Internet Transit BGP"},
                    {"name": "AGNI-DATA-SEC", "ip": "172.16.74.65/29", "vlan": 503, "description": "Secondary Corporate MPLS BGP"}
                ]
            }
        },
        {
            "id": "isp-bracnet",
            "type": "customDevice",
            "position": {"x": 860, "y": 40},
            "data": {
                "label": "BracNet",
                "hostname": "ISP-BRACNET-TRANSIT",
                "deviceType": "isp",
                "role": "Tier-1 Internet & Data Provider",
                "ip": "172.22.41.152",
                "mgmtIp": "172.22.41.152 / 172.22.41.154",
                "bgpAs": "AS 24342",
                "interfaces": [
                    {"name": "BRAC-INT&DATA-PRI", "ip": "172.22.41.152/29", "vlan": 701, "description": "Primary Internet & Data BGP"},
                    {"name": "BRAC-DATA-PRI", "ip": "172.22.41.154/29", "vlan": 601, "description": "Primary Corporate MPLS BGP"},
                    {"name": "BRAC-INT&DATA-SEC", "ip": "172.22.41.152/29", "vlan": 702, "description": "Secondary Internet & Data BGP"},
                    {"name": "BRAC-DATA-SEC", "ip": "172.22.41.154/29", "vlan": 602, "description": "Secondary Corporate MPLS BGP"}
                ]
            }
        },
        {
            "id": "isp-metronet",
            "type": "customDevice",
            "position": {"x": 1240, "y": 40},
            "data": {
                "label": "MetroNet",
                "hostname": "ISP-METRONET-TRANSIT",
                "deviceType": "isp",
                "role": "Enterprise Data Provider",
                "ip": "10.229.5.5",
                "mgmtIp": "10.229.5.5 / 103.36.101.177",
                "bgpAs": "Direct Peering",
                "interfaces": [
                    {"name": "METRONET-DATA", "ip": "10.229.5.5/29", "vlan": 1800, "description": "Corporate Backbone Transit"}
                ]
            }
        },

        # ================= WAN CORE SWITCH TIER =================
        {
            "id": "dc-wan-sw-01",
            "type": "customDevice",
            "position": {"x": 260, "y": 280},
            "data": {
                "label": "DC-WAN-SW-01",
                "hostname": "DC-WAN-SW-01",
                "deviceType": "switch",
                "role": "WAN Aggregation Switch 1 (Primary)",
                "ip": "172.16.0.23/24",
                "mgmtIp": "172.16.0.23/24",
                "vrf": "Mgmt-vrf",
                "model": "Cisco Catalyst 9500 / 9300",
                "os": "IOS-XE 17.3.3a",
                "tacacsServer": "172.21.1.18",
                "ntpServer": "192.168.119.168",
                "syslogHost": "192.168.100.121",
                "vlans": [
                    {"id": 120, "name": "ADN-INT-PRI", "ports": "Twe1/0/3 (ADN), Twe1/0/1 (RT-01), Twe1/0/2 (RT-02)"},
                    {"id": 219, "name": "ADN-DATA-PRI", "ports": "Twe1/0/3 (ADN), Twe1/0/1 (RT-01), Twe1/0/2 (RT-02)"},
                    {"id": 502, "name": "AGNI-INT-PRI", "ports": "Twe1/0/7 (Agni), Twe1/0/1 (RT-01), Twe1/0/2 (RT-02)"},
                    {"id": 504, "name": "AGNI-DATA-PRI", "ports": "Twe1/0/7 (Agni), Twe1/0/1 (RT-01), Twe1/0/2 (RT-02)"},
                    {"id": 601, "name": "BRAC-DATA-PRI", "ports": "Twe1/0/9 (BracNet), Twe1/0/1 (RT-01), Twe1/0/2 (RT-02)"},
                    {"id": 701, "name": "BRAC-INT-DATA-PRI", "ports": "Twe1/0/9 (BracNet), Twe1/0/1 (RT-01), Twe1/0/2 (RT-02)"},
                    {"id": 1800, "name": "METRONET-DATA", "ports": "Twe1/0/16 (MetroNet), Twe1/0/1 (RT-01), Twe1/0/2 (RT-02)"},
                    {"id": 1626, "name": "RT-FW-TRANSIT", "ports": "Twe1/0/22 (DC-FW-01), Twe1/0/23 (DC-CORE-RT-01), Twe1/0/24 (Trunk Peer)"}
                ],
                "interfaces": [
                    {"name": "GigabitEthernet0/0", "ip": "172.16.0.23/24", "description": "Out-of-band Mgmt Interface (Mgmt-vrf)"},
                    {"name": "TwentyFiveGigE1/0/1", "ip": "Trunk (VLAN 120, 219, 502, 504, 601, 701, 1800)", "description": "Downlink to DC-CORE-RT-01 (Te0/0/0)"},
                    {"name": "TwentyFiveGigE1/0/2", "ip": "Trunk (VLAN 120, 219, 502, 504, 601, 701, 1800)", "description": "Downlink to DC-CORE-RT-02 (Te0/0/0)"},
                    {"name": "TwentyFiveGigE1/0/3", "ip": "Trunk (VLAN 120, 219)", "description": "Uplink to ADN Telecom Primary"},
                    {"name": "TwentyFiveGigE1/0/7", "ip": "Trunk (VLAN 502, 504)", "description": "Uplink to Agni Systems Primary"},
                    {"name": "TwentyFiveGigE1/0/9", "ip": "Trunk (VLAN 601, 701)", "description": "Uplink to BracNet Primary"},
                    {"name": "TwentyFiveGigE1/0/16", "ip": "Access VLAN 1800", "description": "Uplink to MetroNet Primary"},
                    {"name": "TwentyFiveGigE1/0/22", "ip": "Access VLAN 1626", "description": "Downlink to DC-FW-01 (Eth1/1)"},
                    {"name": "TwentyFiveGigE1/0/23", "ip": "Access VLAN 1626", "description": "Downlink to DC-CORE-RT-01 (Te0/1/0)"},
                    {"name": "TwentyFiveGigE1/0/24", "ip": "Trunk VLAN 1626", "description": "Peer Link to DC-WAN-SW-02 (Twe1/0/24)"}
                ]
            }
        },
        {
            "id": "dc-wan-sw-02",
            "type": "customDevice",
            "position": {"x": 880, "y": 280},
            "data": {
                "label": "DC-WAN-SW-02",
                "hostname": "DC-WAN-SW-02",
                "deviceType": "switch",
                "role": "WAN Aggregation Switch 2 (Secondary)",
                "ip": "172.16.0.24/24",
                "mgmtIp": "172.16.0.24/24",
                "vrf": "Mgmt-vrf",
                "model": "Cisco Catalyst 9500 / 9300",
                "os": "IOS-XE 17.3.3a",
                "tacacsServer": "172.21.1.18",
                "ntpServer": "192.168.119.168",
                "syslogHost": "192.168.100.121",
                "vlans": [
                    {"id": 501, "name": "AGNI-INT-SEC", "ports": "Twe1/0/7 (Agni), Twe1/0/1 (RT-01), Twe1/0/2 (RT-02)"},
                    {"id": 503, "name": "AGNI-DATA-SEC", "ports": "Twe1/0/7 (Agni), Twe1/0/1 (RT-01), Twe1/0/2 (RT-02)"},
                    {"id": 602, "name": "BRAC-DATA-SEC", "ports": "Twe1/0/9 (BracNet), Twe1/0/1 (RT-01), Twe1/0/2 (RT-02)"},
                    {"id": 702, "name": "BRAC-INT-DATA-SEC", "ports": "Twe1/0/9 (BracNet), Twe1/0/1 (RT-01), Twe1/0/2 (RT-02)"},
                    {"id": 1900, "name": "ADN-INT-SEC", "ports": "Po10 (Twe1/0/3, 1/0/4), Twe1/0/1, Twe1/0/2"},
                    {"id": 1924, "name": "ADN-DATA-SEC", "ports": "Po10 (Twe1/0/3, 1/0/4), Twe1/0/1, Twe1/0/2"},
                    {"id": 1626, "name": "RT-FW-TRANSIT", "ports": "Twe1/0/22 (DC-FW-02), Twe1/0/23 (DC-CORE-RT-02), Twe1/0/24 (Trunk Peer)"}
                ],
                "interfaces": [
                    {"name": "GigabitEthernet0/0", "ip": "172.16.0.24/24", "description": "Out-of-band Mgmt Interface (Mgmt-vrf)"},
                    {"name": "TwentyFiveGigE1/0/1", "ip": "Trunk (VLAN 501, 503, 602, 702, 1900, 1924)", "description": "Downlink to DC-CORE-RT-01 (Te0/0/1)"},
                    {"name": "TwentyFiveGigE1/0/2", "ip": "Trunk (VLAN 501, 503, 602, 702, 1900, 1924)", "description": "Downlink to DC-CORE-RT-02 (Te0/0/1)"},
                    {"name": "Port-channel 10", "ip": "Trunk (Twe1/0/3, Twe1/0/4 - VLAN 1900, 1924)", "description": "LACP Bundle to ADN Telecom Secondary"},
                    {"name": "TwentyFiveGigE1/0/7", "ip": "Trunk (VLAN 501, 503)", "description": "Uplink to Agni Systems Secondary"},
                    {"name": "TwentyFiveGigE1/0/9", "ip": "Trunk (VLAN 602, 702)", "description": "Uplink to BracNet Secondary"},
                    {"name": "TwentyFiveGigE1/0/22", "ip": "Access VLAN 1626", "description": "Downlink to DC-FW-02 (Eth1/1)"},
                    {"name": "TwentyFiveGigE1/0/23", "ip": "Access VLAN 1626", "description": "Downlink to DC-CORE-RT-02 (Te0/1/0)"},
                    {"name": "TwentyFiveGigE1/0/24", "ip": "Trunk VLAN 1626", "description": "Peer Link to DC-WAN-SW-01 (Twe1/0/24)"}
                ]
            }
        },

        # ================= DC CORE ROUTER TIER =================
        {
            "id": "dc-core-rt-01",
            "type": "customDevice",
            "position": {"x": 260, "y": 540},
            "data": {
                "label": "DC-CORE-RT-01",
                "hostname": "DC-CORE-RT-01",
                "deviceType": "router",
                "role": "Enterprise DC Core Router 1 (ASR 1001-X)",
                "ip": "172.16.0.19/24",
                "mgmtIp": "172.16.0.19/24",
                "vrf": "Mgmt-intf",
                "model": "Cisco ASR 1001-X",
                "os": "IOS-XE 17.6.6a AdvIPServices",
                "serialNumber": "JAE244207DL",
                "bgpAs": "AS 59209",
                "ospfProcess": "OSPF 1 (Router-ID: 172.16.2.228)",
                "tacacsServer": "172.21.1.18 (ISE-tacacs)",
                "ntpServer": "192.168.119.168",
                "syslogHost": "192.168.100.121",
                "interfaces": [
                    {"name": "GigabitEthernet0", "ip": "172.16.0.19/24", "description": "Out-of-band Mgmt (Mgmt-intf, GW: 172.16.0.1)"},
                    {"name": "TenGigabitEthernet0/0/0.120", "ip": "10.101.62.170/29", "vlan": 120, "nat": "Outside", "description": "Connected-To-ADN-INT-PRI (BGP Neighbor 10.101.62.169)"},
                    {"name": "TenGigabitEthernet0/0/0.219", "ip": "10.168.221.226/29", "vlan": 219, "description": "Connected-To-ADN-DATA-PRI (BGP Neighbor 10.168.221.225)"},
                    {"name": "TenGigabitEthernet0/0/0.502", "ip": "119.148.14.170/29", "vlan": 502, "nat": "Outside", "description": "Connected-To-AGNI-INT-PRI (BGP Neighbor 119.148.14.169)"},
                    {"name": "TenGigabitEthernet0/0/0.504", "ip": "172.16.74.74/29", "vlan": 504, "description": "Connected-To-AGNI-DATA-PRI (BGP Neighbor 172.16.74.73)"},
                    {"name": "TenGigabitEthernet0/0/0.601", "ip": "172.22.111.122/29", "vlan": 601, "description": "BracNet-DATA-PRI (BGP Neighbor 172.22.41.154)"},
                    {"name": "TenGigabitEthernet0/0/0.701", "ip": "172.22.41.138/29", "vlan": 701, "nat": "Outside", "description": "BracNet-INT&DATA-PRI (BGP Neighbor 172.22.41.152)"},
                    {"name": "TenGigabitEthernet0/0/1.501", "ip": "119.148.38.186/29", "vlan": 501, "nat": "Outside", "description": "Connected-To-AGNI-INT-SEC (BGP Neighbor 119.148.38.185)"},
                    {"name": "TenGigabitEthernet0/0/1.503", "ip": "172.16.74.66/29", "vlan": 503, "description": "Connected-To-AGNI-DATA-SEC (BGP Neighbor 172.16.74.65)"},
                    {"name": "TenGigabitEthernet0/0/1.602", "ip": "172.22.111.130/29", "vlan": 602, "description": "BracNet-DATA-SEC (BGP Failover)"},
                    {"name": "TenGigabitEthernet0/0/1.702", "ip": "172.22.41.146/29", "vlan": 702, "nat": "Outside", "description": "BracNet-INT&DATA-SEC (BGP Failover)"},
                    {"name": "TenGigabitEthernet0/0/1.1900", "ip": "10.101.62.178/29", "vlan": 1900, "nat": "Outside", "description": "Connected-To-ADN-INT-SEC (BGP Neighbor 10.101.62.177)"},
                    {"name": "TenGigabitEthernet0/0/1.1924", "ip": "10.168.221.234/29", "vlan": 1924, "description": "Connected-To-ADN-DATA-SEC (BGP Neighbor 10.168.221.233)"},
                    {"name": "GigabitEthernet0/0/0", "ip": "172.16.2.98/29", "description": "Direct Inter-Router Link to DC-CORE-RT-02 (OSPF Area 11)"},
                    {"name": "TenGigabitEthernet0/1/0", "ip": "172.16.2.1/29", "nat": "Inside", "description": "Downlink to DC-FW-01 via WAN-01 VLAN 1626 (PBR UPLOAD_POLICY)"},
                    {"name": "Loopback0", "ip": "103.243.141.253/32", "description": "BGP Peering Loopback"},
                    {"name": "Loopback1", "ip": "103.243.142.253/32", "description": "ADN BGP Peering Loopback"},
                    {"name": "Loopback2", "ip": "103.243.143.253/32", "description": "Agni BGP Peering Loopback"}
                ],
                "bgpNeighbors": [
                    {"ip": "10.101.62.169", "as": 38203, "desc": "ADN-INT-PRI-BGP (Weight 8000, BFD Enabled)"},
                    {"ip": "10.101.62.177", "as": 38203, "desc": "ADN-INT-SEC-BGP (Weight 7500, BFD Enabled)"},
                    {"ip": "10.168.221.225", "as": 38203, "desc": "ADN-DATA-PRI-BGP (Weight 3000, BFD Enabled)"},
                    {"ip": "10.168.221.233", "as": 38203, "desc": "ADN-DATA-SEC-BGP (BFD Enabled)"},
                    {"ip": "119.148.14.169", "as": 65006, "desc": "AGNI-INT-PRI-BGP (Weight 7000, BFD Enabled)"},
                    {"ip": "119.148.38.185", "as": 65006, "desc": "AGNI-INT-SEC-BGP (Weight 6000, BFD Enabled)"},
                    {"ip": "172.16.74.73", "as": 65006, "desc": "AGNI-DATA-PRI-BGP (Weight 3000, BFD Enabled)"},
                    {"ip": "172.16.74.65", "as": 65006, "desc": "AGNI-DATA-SEC-BGP (BFD Enabled)"},
                    {"ip": "172.22.41.152", "as": 24342, "desc": "BracNet-INT&DATA-BGP (eBGP Multihop 5)"},
                    {"ip": "172.22.41.154", "as": 24342, "desc": "BracNet-DATA-BGP-RT-1 (eBGP Multihop 5)"}
                ],
                "ospfAreas": [
                    {"area": "Area 0 (Backbone / DCI)", "networks": ["172.29.1.40/29 (DCI ADN PRI)", "172.30.1.40/29 (DCI Brac PRI)", "172.31.1.40/29 (DCI Agni PRI)", "172.29.2.0/29", "172.30.2.0/29", "172.31.2.0/29"]},
                    {"area": "Area 11 (Transit & Inter-Core)", "networks": ["172.16.2.0/29 (RT-FW Transit)", "172.16.2.96/29 (RT01-RT02 Inter-Router)"]},
                    {"area": "Area 25 (Mirpur Complex)", "networks": ["172.29.2.168/29 (Mirpur RT01)", "172.30.2.168/29 (Mirpur RT02)"]},
                    {"area": "Area 101 - 199 (Branch GRE)", "networks": ["Branch GRE Tunnels across BD CSM & Plazas"]}
                ],
                "dciTunnels": [
                    "Tunnel29140 (100G DR-RT1 ADN PRI)", "Tunnel29240 (100G DR-RT2 ADN SEC)",
                    "Tunnel30140 (100G DR-RT1 BracNet PRI)", "Tunnel30240 (100G DR-RT2 BracNet SEC)",
                    "Tunnel31140 (100G DR-RT1 Agni PRI)", "Tunnel31240 (100G DR-RT2 Agni SEC)",
                    "Tunnel117 (PrimeBank IPsec VPN 81.80.81.1/30)", "Tunnel131176 (DBBL Dumni DC 172.31.131.178/30)"
                ]
            }
        },
        {
            "id": "dc-core-rt-02",
            "type": "customDevice",
            "position": {"x": 880, "y": 540},
            "data": {
                "label": "DC-CORE-RT-02",
                "hostname": "DC-CORE-RT-02",
                "deviceType": "router",
                "role": "Enterprise DC Core Router 2 (ASR 1001-X)",
                "ip": "172.16.0.20/24",
                "mgmtIp": "172.16.0.20/24",
                "vrf": "Mgmt-intf",
                "model": "Cisco ASR 1001-X",
                "os": "IOS-XE 17.9.8 AdvIPServices",
                "serialNumber": "JAE244207DZ",
                "bgpAs": "AS 59209",
                "ospfProcess": "OSPF 1 (Router-ID: 172.16.2.227)",
                "tacacsServer": "172.21.1.18 (ISE-tacacs)",
                "ntpServer": "192.168.119.168",
                "syslogHost": "192.168.100.121",
                "interfaces": [
                    {"name": "GigabitEthernet0", "ip": "172.16.0.20/24", "description": "Out-of-band Mgmt (Mgmt-intf, GW: 172.16.0.1)"},
                    {"name": "TenGigabitEthernet0/0/0.120", "ip": "10.101.62.173/29", "vlan": 120, "nat": "Outside", "description": "Connected-To-ADN-INT-PRI (BGP Neighbor 10.101.62.169)"},
                    {"name": "TenGigabitEthernet0/0/0.219", "ip": "10.168.221.228/29", "vlan": 219, "description": "Connected-To-ADN-DATA-PRI (BGP Neighbor 10.168.221.225)"},
                    {"name": "TenGigabitEthernet0/0/0.502", "ip": "119.148.14.172/29", "vlan": 502, "nat": "Outside", "description": "Connected-To-AGNI-INT-PRI (BGP Neighbor 119.148.14.169)"},
                    {"name": "TenGigabitEthernet0/0/0.504", "ip": "172.16.74.76/29", "vlan": 504, "description": "Connected-To-AGNI-DATA-PRI (BGP Neighbor 172.16.74.73)"},
                    {"name": "TenGigabitEthernet0/0/0.601", "ip": "172.22.111.123/29", "vlan": 601, "description": "BracNet-DATA-PRI (BGP Neighbor 172.22.41.154)"},
                    {"name": "TenGigabitEthernet0/0/0.701", "ip": "172.22.41.139/29", "vlan": 701, "nat": "Outside", "description": "BracNet-INT&DATA-PRI (BGP Neighbor 172.22.41.152)"},
                    {"name": "TenGigabitEthernet0/0/1.501", "ip": "119.148.38.188/29", "vlan": 501, "nat": "Outside", "description": "Connected-To-AGNI-INT-SEC (BGP Neighbor 119.148.38.185)"},
                    {"name": "TenGigabitEthernet0/0/1.503", "ip": "172.16.74.68/29", "vlan": 503, "description": "Connected-To-AGNI-DATA-SEC (BGP Neighbor 172.16.74.65)"},
                    {"name": "TenGigabitEthernet0/0/1.602", "ip": "172.22.111.131/29", "vlan": 602, "description": "BracNet-DATA-SEC (BGP Failover)"},
                    {"name": "TenGigabitEthernet0/0/1.702", "ip": "172.22.41.147/29", "vlan": 702, "nat": "Outside", "description": "BracNet-INT&DATA-SEC (BGP Failover)"},
                    {"name": "TenGigabitEthernet0/0/1.1900", "ip": "10.101.62.179/29", "vlan": 1900, "nat": "Outside", "description": "Connected-To-ADN-INT-SEC (BGP Neighbor 10.101.62.177)"},
                    {"name": "TenGigabitEthernet0/0/1.1924", "ip": "10.168.221.236/29", "vlan": 1924, "description": "Connected-To-ADN-DATA-SEC (BGP Neighbor 10.168.221.233)"},
                    {"name": "GigabitEthernet0/0/0", "ip": "172.16.2.99/29", "description": "Direct Inter-Router Link to DC-CORE-RT-01 (OSPF Area 11)"},
                    {"name": "TenGigabitEthernet0/1/0", "ip": "172.16.2.2/29", "nat": "Inside", "description": "Downlink to DC-FW-02 via WAN-02 VLAN 1626 (PBR UPLOAD_POLICY)"},
                    {"name": "Loopback0", "ip": "103.243.141.254/32", "description": "BGP Peering Loopback"},
                    {"name": "Loopback1", "ip": "103.243.142.254/32", "description": "ADN BGP Peering Loopback"},
                    {"name": "Loopback2", "ip": "103.243.143.254/32", "description": "Agni BGP Peering Loopback"},
                    {"name": "Loopback3", "ip": "10.168.221.248/32", "description": "ADN Data Peering Loopback"},
                    {"name": "Loopback8", "ip": "115.127.145.129/32", "description": "BracNet INT&DATA Peering"}
                ],
                "bgpNeighbors": [
                    {"ip": "10.101.62.169", "as": 38203, "desc": "ADN-INT-PRI-BGP (Weight 8000, BFD Enabled)"},
                    {"ip": "10.101.62.177", "as": 38203, "desc": "ADN-INT-SEC-BGP (Weight 7500, BFD Enabled)"},
                    {"ip": "10.168.221.225", "as": 38203, "desc": "ADN-DATA-PRI-BGP (Weight 3000, BFD Enabled)"},
                    {"ip": "10.168.221.233", "as": 38203, "desc": "ADN-DATA-SEC-BGP (BFD Enabled)"},
                    {"ip": "119.148.14.169", "as": 65006, "desc": "AGNI-INT-PRI-BGP (Weight 7000, BFD Enabled)"},
                    {"ip": "119.148.38.185", "as": 65006, "desc": "AGNI-INT-SEC-BGP (Weight 6000, BFD Enabled)"},
                    {"ip": "172.16.74.73", "as": 65006, "desc": "AGNI-DATA-PRI-BGP (Weight 3000, BFD Enabled)"},
                    {"ip": "172.16.74.65", "as": 65006, "desc": "AGNI-DATA-SEC-BGP (BFD Enabled)"},
                    {"ip": "172.22.41.152", "as": 24342, "desc": "BracNet-INT&DATA-BGP (via Loopback8)"},
                    {"ip": "172.22.41.154", "as": 24342, "desc": "BracNet-DATA-BGP-RT-2 (via Loopback10)"}
                ],
                "ospfAreas": [
                    {"area": "Area 0 (Backbone / DCI)", "networks": ["172.29.1.48/29 (DCI ADN PRI)", "172.30.1.48/29 (DCI Brac PRI)", "172.31.1.48/29 (DCI Agni PRI)", "172.29.2.48/29", "172.30.2.48/29", "172.31.2.48/29"]},
                    {"area": "Area 11 (Transit & Inter-Core)", "networks": ["172.16.2.0/29 (RT-FW Transit)", "172.16.2.96/29 (RT01-RT02 Inter-Router)"]},
                    {"area": "Area 25 (Mirpur Complex)", "networks": ["172.29.2.176/29 (Mirpur RT01)", "172.30.2.176/29 (Mirpur RT01)", "172.30.2.184/29 (Mirpur RT02)"]},
                    {"area": "Area 101 - 199 (Branch GRE)", "networks": ["Branch GRE Tunnels across BD CSM & Plazas (Tunnel 61 to 699)"]}
                ],
                "dciTunnels": [
                    "Tunnel29148 (100G DR-RT1 ADN PRI)", "Tunnel29248 (100G DR-RT2 ADN SEC)",
                    "Tunnel30148 (100G DR-RT1 BracNet PRI)", "Tunnel30248 (100G DR-RT2 BracNet SEC)",
                    "Tunnel31148 (100G DR-RT1 Agni PRI)", "Tunnel31248 (100G DR-RT2 Agni SEC)",
                    "Tunnel2011 (Corp ADN 100G)", "Tunnel2012 (Corp Metro 100G)", "Tunnel2013 (Corp Agni 100G)"
                ]
            }
        }
    ]

    # -------------------------------------------------------------
    # 2. EDGES DEFINITION
    # -------------------------------------------------------------
    edges = [
        # ISPs to WAN Switches
        {"id": "e-adn-wan1", "source": "isp-adn", "target": "dc-wan-sw-01", "animated": True, "style": {"stroke": "#00ffcc", "strokeWidth": 2.5}, "label": "ADN Primary Trunk (VLAN 120, 219)"},
        {"id": "e-adn-wan2", "source": "isp-adn", "target": "dc-wan-sw-02", "animated": True, "style": {"stroke": "#00ffcc", "strokeWidth": 2.5, "strokeDasharray": "5,5"}, "label": "ADN Secondary Po10 (VLAN 1900, 1924)"},
        {"id": "e-agni-wan1", "source": "isp-agni", "target": "dc-wan-sw-01", "animated": True, "style": {"stroke": "#ff9900", "strokeWidth": 2.5}, "label": "Agni Primary (VLAN 502, 504)"},
        {"id": "e-agni-wan2", "source": "isp-agni", "target": "dc-wan-sw-02", "animated": True, "style": {"stroke": "#ff9900", "strokeWidth": 2.5, "strokeDasharray": "5,5"}, "label": "Agni Secondary (VLAN 501, 503)"},
        {"id": "e-brac-wan1", "source": "isp-bracnet", "target": "dc-wan-sw-01", "animated": True, "style": {"stroke": "#a855f7", "strokeWidth": 2.5}, "label": "BracNet Primary (VLAN 601, 701)"},
        {"id": "e-brac-wan2", "source": "isp-bracnet", "target": "dc-wan-sw-02", "animated": True, "style": {"stroke": "#a855f7", "strokeWidth": 2.5, "strokeDasharray": "5,5"}, "label": "BracNet Secondary (VLAN 602, 702)"},
        {"id": "e-met-wan1", "source": "isp-metronet", "target": "dc-wan-sw-01", "animated": True, "style": {"stroke": "#38bdf8", "strokeWidth": 2.5}, "label": "MetroNet Trunk (VLAN 1800)"},

        # WAN Switch Inter-Switch Link
        {"id": "e-wan1-wan2-peer", "source": "dc-wan-sw-01", "target": "dc-wan-sw-02", "animated": False, "style": {"stroke": "#ec4899", "strokeWidth": 3}, "label": "Inter-WAN Trunk (25GE1/0/24 - VLAN 1626)"},

        # WAN Switches to DC Core Routers (Full Mesh Cross-Connect)
        {"id": "e-wan1-rt1", "source": "dc-wan-sw-01", "target": "dc-core-rt-01", "animated": True, "style": {"stroke": "#00ffcc", "strokeWidth": 3}, "label": "WAN1 -> RT1 Cross-Connect (25GE1/0/1 <-> Te0/0/0)"},
        {"id": "e-wan1-rt2", "source": "dc-wan-sw-01", "target": "dc-core-rt-02", "animated": True, "style": {"stroke": "#00ffcc", "strokeWidth": 3}, "label": "WAN1 -> RT2 Cross-Connect (25GE1/0/2 <-> Te0/0/0)"},
        {"id": "e-wan2-rt1", "source": "dc-wan-sw-02", "target": "dc-core-rt-01", "animated": True, "style": {"stroke": "#00ffcc", "strokeWidth": 3, "strokeDasharray": "4,4"}, "label": "WAN2 -> RT1 Cross-Connect (25GE1/0/1 <-> Te0/0/1)"},
        {"id": "e-wan2-rt2", "source": "dc-wan-sw-02", "target": "dc-core-rt-02", "animated": True, "style": {"stroke": "#00ffcc", "strokeWidth": 3, "strokeDasharray": "4,4"}, "label": "WAN2 -> RT2 Cross-Connect (25GE1/0/2 <-> Te0/0/1)"},

        # Core Router to Core Router (Inter-Router Link)
        {"id": "e-rt1-rt2-direct", "source": "dc-core-rt-01", "target": "dc-core-rt-02", "animated": True, "style": {"stroke": "#3b82f6", "strokeWidth": 3.5}, "label": "Core Router Inter-Link (Gi0/0/0 <-> Gi0/0/0 - OSPF Area 11 172.16.2.96/29)"}
    ]

    topo = Topology(
        name="Walton DC Production Core Architecture",
        nodes=nodes,
        edges=edges,
        viewport={"x": 50, "y": 20, "zoom": 0.85},
        updated_at=datetime.datetime.now(datetime.timezone.utc)
    )

    db.add(topo)
    db.commit()
    db.close()
    print(">>> SUCCESS: Walton DC Topology Database Seeded with DC-CORE-RT-01 and DC-CORE-RT-02!")

if __name__ == "__main__":
    seed_topology()