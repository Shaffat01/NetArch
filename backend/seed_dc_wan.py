import json
from database import SessionLocal, engine, Base
from models import Topology

Base.metadata.create_all(bind=engine)

def seed_wan_switches():
    db = SessionLocal()
    
    nodes = [
        # --- Upstream ISPs ---
        {
            "id": "isp-adn",
            "type": "customDevice",
            "position": { "x": 80, "y": 60 },
            "data": {
                "hostname": "ADN Telecom (ISP)",
                "deviceType": "ISP / Cloud",
                "site": "Global",
                "mgmtIP": "Public IP Pool",
                "status": "online",
                "model": "Carrier Upstream Tier-1",
                "interfaces": [
                    { "port": "Handover-1", "status": "up", "type": "10G/25G", "desc": "Primary to DC-WAN-SW-01 (VLAN 120, 219)" },
                    { "port": "Handover-2", "status": "up", "type": "10G/25G", "desc": "Secondary to DC-WAN-SW-02 (Po10 - VLAN 1900, 1924)" }
                ]
            }
        },
        {
            "id": "isp-agni",
            "type": "customDevice",
            "position": { "x": 320, "y": 60 },
            "data": {
                "hostname": "Agni Systems (ISP)",
                "deviceType": "ISP / Cloud",
                "site": "Global",
                "mgmtIP": "Public IP Pool",
                "status": "online",
                "model": "Carrier Upstream Tier-1",
                "interfaces": [
                    { "port": "Handover-1", "status": "up", "type": "10G/25G", "desc": "Primary to DC-WAN-SW-01 (VLAN 502, 504)" },
                    { "port": "Handover-2", "status": "up", "type": "10G/25G", "desc": "Secondary to DC-WAN-SW-02 (VLAN 501, 503)" }
                ]
            }
        },
        {
            "id": "isp-brac",
            "type": "customDevice",
            "position": { "x": 560, "y": 60 },
            "data": {
                "hostname": "BracNet (ISP)",
                "deviceType": "ISP / Cloud",
                "site": "Global",
                "mgmtIP": "Public IP Pool",
                "status": "online",
                "model": "Carrier Upstream Tier-1",
                "interfaces": [
                    { "port": "Handover-1", "status": "up", "type": "10G/25G", "desc": "Primary Trunk to DC-WAN-SW-01" },
                    { "port": "Handover-2", "status": "up", "type": "10G/25G", "desc": "Secondary Trunk to DC-WAN-SW-02" }
                ]
            }
        },
        {
            "id": "isp-metro",
            "type": "customDevice",
            "position": { "x": 800, "y": 60 },
            "data": {
                "hostname": "MetroNet (ISP)",
                "deviceType": "ISP / Cloud",
                "site": "Global",
                "mgmtIP": "Public IP Pool",
                "status": "online",
                "model": "Carrier Upstream Tier-1",
                "interfaces": [
                    { "port": "Handover-1", "status": "up", "type": "10G/25G", "desc": "Primary to DC-WAN-SW-01 (VLAN 1015)" }
                ]
            }
        },

        # --- DC WAN Switches (Tier-1) ---
        {
            "id": "dc-wan-sw-01",
            "type": "customDevice",
            "position": { "x": 200, "y": 280 },
            "data": {
                "hostname": "DC-WAN-SW-01",
                "deviceType": "WAN Switch",
                "site": "DC",
                "model": "Cisco Catalyst 9500/9300 (24x25GE + 4x100GE)",
                "osVersion": "IOS-XE 17.3.3a",
                "mgmtIP": "172.16.0.23/24",
                "mgmtVrf": "Mgmt-vrf",
                "status": "online",
                "domain": "waltonbd.com",
                "tacacsServer": "172.21.1.18",
                "ntpServer": "192.168.119.168",
                "syslogServer": "192.168.100.121",
                "vlans": [
                    { "id": 120, "name": "ADN_PRI" },
                    { "id": 219, "name": "ADN_SEC" },
                    { "id": 502, "name": "AGNI_INT" },
                    { "id": 504, "name": "AGNI_DATA" },
                    { "id": 1013, "name": "AGNI_DATA_PRI" },
                    { "id": 1014, "name": "AGNI_DATA_SEC" },
                    { "id": 1015, "name": "METRO_INT_PRI" },
                    { "id": 1016, "name": "METRO_INT_SEC" },
                    { "id": 1017, "name": "METRO_DATA_PRI" },
                    { "id": 1018, "name": "METRO_DATA_SEC" },
                    { "id": 1626, "name": "RT-FW" },
                    { "id": 1900, "name": "ADN_INT_SEC" },
                    { "id": 1924, "name": "ADN_DATA_SEC" }
                ],
                "interfaces": [
                    { "port": "Gi0/0", "status": "up", "type": "1G Copper", "desc": "Out-of-Band Management (Mgmt-vrf)", "ip": "172.16.0.23/24" },
                    { "port": "25GE1/0/1", "status": "up", "type": "25G Fiber", "desc": "CONNECTED_To_RT-01_Te0/0/0", "mode": "Trunk" },
                    { "port": "25GE1/0/2", "status": "up", "type": "25G Fiber", "desc": "CONNECTED-To_RT-02_Te0/0/0", "mode": "Trunk" },
                    { "port": "25GE1/0/3", "status": "up", "type": "25G Fiber", "desc": "ADN-INT&DATA-PRI", "mode": "Trunk (VLAN 120, 219)" },
                    { "port": "25GE1/0/7", "status": "up", "type": "25G Fiber", "desc": "AGNI-INT&DATA-PRI", "mode": "Trunk (VLAN 502, 504)" },
                    { "port": "25GE1/0/9", "status": "up", "type": "25G Fiber", "desc": "BracNet_INT&DATA_PRI", "mode": "Trunk" },
                    { "port": "25GE1/0/16", "status": "up", "type": "25G Fiber", "desc": "MetroNet Primary Access", "mode": "Access (VLAN 1015)" },
                    { "port": "25GE1/0/22", "status": "up", "type": "25G Fiber", "desc": "WAN-01-To-FW-01_ETH1/1", "mode": "Access (VLAN 1626: RT-FW)" },
                    { "port": "25GE1/0/23", "status": "up", "type": "25G Fiber", "desc": "WAN-01-To-RT-01_TE0/1/0", "mode": "Access (VLAN 1626: RT-FW)" },
                    { "port": "25GE1/0/24", "status": "up", "type": "25G Fiber", "desc": "WAN-01-To-WAN-02_P-24 (HA Inter-Switch)", "mode": "Trunk (VLAN 1626)" },
                    { "port": "100GE1/0/25", "status": "down", "type": "100G QSFP28", "desc": "Uplink Spine Reserved", "mode": "Routed" }
                ]
            }
        },
        {
            "id": "dc-wan-sw-02",
            "type": "customDevice",
            "position": { "x": 680, "y": 280 },
            "data": {
                "hostname": "DC-WAN-SW-02",
                "deviceType": "WAN Switch",
                "site": "DC",
                "model": "Cisco Catalyst 9500/9300 (24x25GE + 4x100GE)",
                "osVersion": "IOS-XE 17.3.3a",
                "mgmtIP": "172.16.0.24/24",
                "mgmtVrf": "Mgmt-vrf",
                "status": "online",
                "domain": "waltonbd.com",
                "tacacsServer": "172.21.1.18",
                "ntpServer": "192.168.119.168",
                "syslogServer": "192.168.100.121",
                "vlans": [
                    { "id": 501, "name": "AGNI_INT_SEC" },
                    { "id": 503, "name": "AGNI_DATA_SEC" },
                    { "id": 1013, "name": "AGNI_DATA_PRI" },
                    { "id": 1014, "name": "AGNI_DATA_SEC" },
                    { "id": 1015, "name": "METRO_INT_PRI" },
                    { "id": 1016, "name": "METRO_INT_SEC" },
                    { "id": 1017, "name": "METRO_DATA_PRI" },
                    { "id": 1018, "name": "METRO_DATA_SEC" },
                    { "id": 1626, "name": "RT-FW" },
                    { "id": 1900, "name": "ADN_INT_SEC" },
                    { "id": 1924, "name": "ADN_DATA_SEC" }
                ],
                "interfaces": [
                    { "port": "Gi0/0", "status": "up", "type": "1G Copper", "desc": "Out-of-Band Management (Mgmt-vrf)", "ip": "172.16.0.24/24" },
                    { "port": "Port-channel10", "status": "up", "type": "LACP Bundle", "desc": "ADN Secondary LACP", "mode": "Trunk (VLAN 1900, 1924)" },
                    { "port": "25GE1/0/1", "status": "up", "type": "25G Fiber", "desc": "CONNECTED_To_RT-01_Te0/0/1", "mode": "Trunk" },
                    { "port": "25GE1/0/2", "status": "up", "type": "25G Fiber", "desc": "CONNECTED_To_RT-02_Te0/0/1", "mode": "Trunk" },
                    { "port": "25GE1/0/3", "status": "up", "type": "25G Fiber", "desc": "ADN-INT&DATA-SEC (Po10)", "mode": "Trunk (VLAN 1900, 1924)" },
                    { "port": "25GE1/0/4", "status": "up", "type": "25G Fiber", "desc": "ADN-INT&DATA-SEC (Po10 Member)", "mode": "Trunk" },
                    { "port": "25GE1/0/7", "status": "up", "type": "25G Fiber", "desc": "AGNI-INT&DATA-SEC", "mode": "Trunk (VLAN 501, 503)" },
                    { "port": "25GE1/0/9", "status": "up", "type": "25G Fiber", "desc": "BRACNET-INT&DATA-SEC", "mode": "Trunk" },
                    { "port": "25GE1/0/22", "status": "up", "type": "25G Fiber", "desc": "WAN-02-To-FW-02_ETH1/1", "mode": "Access (VLAN 1626: RT-FW)" },
                    { "port": "25GE1/0/23", "status": "up", "type": "25G Fiber", "desc": "WAN-02-To-RT-02_TEN0/1/0", "mode": "Access (VLAN 1626: RT-FW)" },
                    { "port": "25GE1/0/24", "status": "up", "type": "25G Fiber", "desc": "WAN-02-To-WAN-01_P-24 (HA Inter-Switch)", "mode": "Trunk (VLAN 1626)" }
                ]
            }
        }
    ]

    edges = [
        # ADN Links
        { "id": "e-adn-wan1", "source": "isp-adn", "target": "dc-wan-sw-01", "label": "ADN Primary (25G P3)", "animated": True, "style": { "stroke": "#38bdf8", "strokeWidth": 2.5 } },
        { "id": "e-adn-wan2", "source": "isp-adn", "target": "dc-wan-sw-02", "label": "ADN Sec Po10 (25G P3/P4)", "animated": True, "style": { "stroke": "#0284c7", "strokeWidth": 2.5 } },
        
        # Agni Links
        { "id": "e-agni-wan1", "source": "isp-agni", "target": "dc-wan-sw-01", "label": "Agni Primary (25G P7)", "animated": True, "style": { "stroke": "#f59e0b", "strokeWidth": 2.5 } },
        { "id": "e-agni-wan2", "source": "isp-agni", "target": "dc-wan-sw-02", "label": "Agni Sec (25G P7)", "animated": True, "style": { "stroke": "#d97706", "strokeWidth": 2.5 } },
        
        # BracNet Links
        { "id": "e-brac-wan1", "source": "isp-brac", "target": "dc-wan-sw-01", "label": "BracNet Primary (25G P9)", "animated": True, "style": { "stroke": "#10b981", "strokeWidth": 2.5 } },
        { "id": "e-brac-wan2", "source": "isp-brac", "target": "dc-wan-sw-02", "label": "BracNet Sec (25G P9)", "animated": True, "style": { "stroke": "#059669", "strokeWidth": 2.5 } },
        
        # MetroNet Link
        { "id": "e-metro-wan1", "source": "isp-metro", "target": "dc-wan-sw-01", "label": "MetroNet Primary (25G P16)", "animated": True, "style": { "stroke": "#a855f7", "strokeWidth": 2.5 } },

        # Inter-WAN HA Trunk Link
        { 
            "id": "e-wan1-wan2", 
            "source": "dc-wan-sw-01", 
            "target": "dc-wan-sw-02", 
            "label": "HA Trunk (25G P24 - VLAN 1626)", 
            "animated": True, 
            "style": { "stroke": "#ec4899", "strokeWidth": 3.5, "strokeDasharray": "5,5" } 
        }
    ]

    viewport = { "x": 80, "y": 40, "zoom": 0.95 }

    # Query existing or create new
    topo = db.query(Topology).filter(Topology.name == "production").first()
    if not topo:
        topo = Topology(
            name="production",
            nodes=nodes,
            edges=edges,
            viewport=viewport
        )
        db.add(topo)
    else:
        topo.nodes = nodes
        topo.edges = edges
        topo.viewport = viewport

    db.commit()
    print(">>> Success: DC-WAN-SW-01 & DC-WAN-SW-02 with ISPs added to SQLite database!")
    db.close()

if __name__ == "__main__":
    seed_wan_switches()