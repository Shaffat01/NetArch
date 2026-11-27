#!/usr/bin/env python3
"""Extract safe IPAM, peering and port-connectivity evidence.

The source is peering-safe.xlsx, a derivative of the user's peering workbook.
Credential worksheets are absent and the HQ Access username column is blank.
Merged cells are expanded explicitly; blank unmerged cells are never filled by
guesswork. Every record retains its worksheet and row number.
"""
from __future__ import annotations

import json
import re
from collections import Counter
from pathlib import Path

import openpyxl
from openpyxl.utils import get_column_letter

EXCLUDED_SHEETS = {
    "DC Devies IP & Credential",
    "NDC Devies IP & Credential",
    "Cacti",
}


def text(value):
    return "" if value is None else str(value).strip()


def scalar(value):
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    return str(value)


class SheetReader:
    """Read cells while expanding only genuine workbook merged ranges."""

    def __init__(self, ws):
        self.ws = ws
        self.merged = {}
        for merged_range in ws.merged_cells.ranges:
            top_left = ws.cell(merged_range.min_row, merged_range.min_col).value
            for row in range(merged_range.min_row, merged_range.max_row + 1):
                for col in range(merged_range.min_col, merged_range.max_col + 1):
                    if (row, col) != (merged_range.min_row, merged_range.min_col):
                        self.merged[(row, col)] = top_left

    def value(self, row, col):
        raw = self.ws.cell(row, col).value
        if raw is None and (row, col) in self.merged:
            return self.merged[(row, col)]
        return raw

    def any(self, row, columns):
        return any(text(self.value(row, col)) for col in columns)


def raw_any(ws, row, columns):
    """Require actual row content; merged labels alone must not create phantom rows."""
    return any(text(ws.cell(row, col).value) for col in columns)


def record_id(prefix, sheet, row, suffix=""):
    safe = re.sub(r"[^A-Za-z0-9]+", "-", sheet).strip("-")
    return f"{prefix}:{safe}:{row}{suffix}"


def base_record(prefix, sheet, row, scope, category, suffix=""):
    return {
        "id": record_id(prefix, sheet, row, suffix),
        "scope": scope,
        "category": category,
        "sourceSheet": sheet,
        "sourceRow": row,
    }


def extract_ip_blocks(wb):
    ws = wb["HQ Data Center IP Block"]
    reader = SheetReader(ws)
    rows = []

    def add(row, scope, category, cidr, purpose, note, columns):
        if not any(text(v) for v in (cidr, purpose, note)):
            return
        item = base_record("block", ws.title, row, scope, category, ":" + columns.replace(":", "-"))
        item.update({
            "cidr": scalar(cidr),
            "purpose": scalar(purpose),
            "remarks": scalar(note),
            "sourceColumns": columns,
            "addressKind": "network" if "/" in text(cidr) else "address",
        })
        rows.append(item)

    # Summary register on the left.
    for row in range(2, 25):
        add(row, "HQ summary", "Summary", reader.value(row, 1), reader.value(row, 2), None, "A:B")

    # Detailed DC / NDC / shared-server register on the right. Section labels
    # come from actual merged cells and explicit worksheet section rows.
    for row in range(2, 37):
        if row <= 12:
            scope = "DC"
            category = "VTEP" if row <= 5 else "Management"
        elif row <= 24:
            scope = "NDC"
            category = "VTEP" if row <= 18 else "Management"
        else:
            scope = "DC & NDC"
            category = "Server / cluster"
        add(row, scope, category, reader.value(row, 7), reader.value(row, 8), reader.value(row, 9), "G:I")

    # Additional HQ service blocks stored as label + CIDR in D:E.
    for row in range(37, 40):
        add(row, "HQ services", "Service block", reader.value(row, 5), reader.value(row, 4), None, "D:E")

    return rows


def extract_vlans(wb):
    ws = wb["HQ-VLAN"]
    reader = SheetReader(ws)
    rows = []
    for row in range(3, ws.max_row + 1):
        if not reader.any(row, range(1, 6)):
            continue
        item = base_record("vlan", ws.title, row, "HQ", "VLAN")
        item.update({
            "vlan": scalar(reader.value(row, 1)),
            "owner": scalar(reader.value(row, 2)),
            "building": scalar(reader.value(row, 3)),
            "floor": scalar(reader.value(row, 4)),
            "description": scalar(reader.value(row, 5)),
        })
        rows.append(item)
    return rows


def extract_loopbacks(wb):
    ws = wb["DC Loopback IP"]
    reader = SheetReader(ws)
    rows = []
    for row in range(2, ws.max_row + 1):
        if not reader.any(row, range(1, 5)):
            continue
        item = base_record("loopback", ws.title, row, "DC", "Loopback")
        item.update({
            "device": scalar(reader.value(row, 1)),
            "interface": scalar(reader.value(row, 2)),
            "cidr": scalar(reader.value(row, 3)),
            "remarks": scalar(reader.value(row, 4)),
        })
        rows.append(item)
    return rows


def extract_device_peers(wb, blocks):
    peers = []
    layouts = [
        ("DC  Device Peering IP", "DC", 3, 49),
        ("NDC Devices Peering IP", "NDC", 3, 51),
    ]
    for sheet_name, scope, start, end in layouts:
        ws = wb[sheet_name]
        reader = SheetReader(ws)
        for row in range(start, min(end, ws.max_row) + 1):
            if not reader.any(row, range(1, 9)):
                continue
            item = base_record("device-peer", sheet_name, row, scope, "Device peering")
            item.update({
                "fromDevice": scalar(reader.value(row, 1)),
                "fromIp": scalar(reader.value(row, 2)),
                "fromVip": scalar(reader.value(row, 3)),
                "toDevice": scalar(reader.value(row, 4)),
                "toIp": scalar(reader.value(row, 5)),
                "toVip": scalar(reader.value(row, 6)),
                "network": scalar(reader.value(row, 7)),
                "remarks": scalar(reader.value(row, 8)),
            })
            peers.append(item)

    # The lower DC table is an OSPF router-ID register, not a From→To row.
    ws = wb["DC  Device Peering IP"]
    reader = SheetReader(ws)
    for row in range(50, 61):
        if not reader.any(row, range(1, 5)):
            continue
        item = base_record("block", ws.title, row, "DC", "OSPF router ID", ":router-id")
        item.update({
            "cidr": scalar(reader.value(row, 2)),
            "purpose": scalar(reader.value(row, 3)),
            "remarks": scalar(reader.value(row, 4)),
            "sourceColumns": "A:D",
            "addressKind": "address",
        })
        blocks.append(item)

    # Independent NDC tenant Side A / Side B allocations in K:L. They are not
    # joined to the From→To records merely because they share a worksheet row.
    ws = wb["NDC Devices Peering IP"]
    reader = SheetReader(ws)
    for row in range(3, 7):
        tenant = reader.value(row, 11)
        for col, side in ((12, "Side A"), (13, "Side B")):
            address = reader.value(row, col)
            if not any(text(v) for v in (tenant, address)):
                continue
            item = base_record("block", ws.title, row, "NDC", "Tenant allocation", ":" + side.replace(" ", "-").lower())
            item.update({
                "cidr": scalar(address),
                "purpose": scalar(tenant),
                "remarks": side,
                "sourceColumns": "K:M",
                "addressKind": "address",
            })
            blocks.append(item)
    return peers


def extract_isp_peers(wb, blocks):
    peers = []
    layouts = [
        ("DC ISP Peering IP", "DC", 8, 10, 11, 12),
        ("NDC ISP Peering", "NDC", 8, 11, 12, 13),
        ("WHIL-DC ISP Peering IP", "WHIL-DC", 10, None, None, None),
    ]
    for sheet_name, scope, main_end, public_col, advert_col, owner_col in layouts:
        ws = wb[sheet_name]
        reader = SheetReader(ws)
        for row in range(2, ws.max_row + 1):
            if raw_any(ws, row, range(1, main_end + 1)):
                item = base_record("isp-peer", sheet_name, row, scope, "ISP peering")
                item.update({
                    "isp": scalar(reader.value(row, 1)),
                    "linkType": scalar(reader.value(row, 2)),
                    "network": scalar(reader.value(row, 3)),
                    "vlan": scalar(reader.value(row, 4)),
                    "r1Ip": scalar(reader.value(row, 5)),
                    "r2Ip": scalar(reader.value(row, 6)),
                    "ispEndIp": scalar(reader.value(row, 7)),
                    "bgpNeighborIp": scalar(reader.value(row, 8)) if main_end >= 8 else None,
                    "asn": scalar(reader.value(row, 9)) if main_end >= 9 else None,
                    "remarks": scalar(reader.value(row, 10)) if main_end >= 10 else None,
                })
                # DC/NDC have ASN in H, not a BGP-neighbor column.
                if main_end == 8:
                    item["asn"] = scalar(reader.value(row, 8))
                    item["bgpNeighborIp"] = None
                peers.append(item)

            # Independent public-IP table; never align it with the main peer.
            if public_col and raw_any(ws, row, (public_col, advert_col, owner_col)):
                item = base_record("block", sheet_name, row, scope, "ISP public IP", ":public-ip")
                item.update({
                    "cidr": scalar(reader.value(row, public_col)),
                    "purpose": scalar(reader.value(row, advert_col)),
                    "remarks": scalar(reader.value(row, owner_col)),
                    "sourceColumns": f"{get_column_letter(public_col)}:{get_column_letter(owner_col)}",
                    "addressKind": "network" if "/" in text(reader.value(row, public_col)) else "address",
                })
                blocks.append(item)
    return peers


PORT_LAYOUTS = {
    "DC BackBone": {
        "start": 4, "scope": "DC", "category": "Backbone",
        "columns": {"fromDevice": 1, "fromLocation": 2, "fromPort": 3, "fromConfig": 4, "fromVlan": 5, "fromIp": 6, "toPort": 7, "toDevice": 8, "toLocation": 9, "toConfig": 10, "toVlan": 11, "toIp": 12, "speed": 13, "remarks": 14},
    },
    "DC Mgmt": {
        "start": 4, "scope": "DC", "category": "Management",
        "columns": {"fromDevice": 1, "fromLocation": 2, "fromPort": 3, "fromConfig": 4, "fromVlan": 5, "fromIp": 6, "toPort": 7, "toDevice": 8, "toLocation": 9, "toConfig": 10, "toVlan": 11, "toIp": 12, "speed": 13, "remarks": 14, "portDescription": 15},
    },
    "DC Core-Distribution": {
        "start": 4, "scope": "DC", "category": "Core–Distribution",
        "columns": {"fromDevice": 1, "fromLocation": 2, "fromPort": 3, "fromConfig": 4, "fromVlan": 5, "fromIp": 6, "toPort": 7, "toDevice": 8, "toLocation": 9, "toConfig": 10, "toVlan": 11, "toIp": 12, "speed": 13, "remarks": 14},
    },
    "WHIL-DC Port Maping": {
        "start": 4, "scope": "WHIL-DC", "category": "Backbone / port mapping",
        "columns": {"fromDevice": 1, "fromLocation": 2, "fromPort": 3, "fromConfig": 4, "fromVlan": 5, "fromIp": 6, "toPort": 7, "toDevice": 8, "toLocation": 9, "toConfig": 10, "toVlan": 11, "toIp": 12, "remarks": 13},
    },
    "NDC BackBone": {
        "start": 4, "scope": "NDC", "category": "Backbone",
        "columns": {"fromDevice": 1, "fromLocation": 2, "fromPort": 3, "toPort": 4, "toDevice": 5, "toLocation": 6, "speed": 7, "remarks": 8},
    },
    "NDC Mgmt": {
        "start": 4, "scope": "NDC", "category": "Management",
        "columns": {"fromDevice": 1, "fromLocation": 2, "fromPort": 3, "toPort": 4, "toDevice": 5, "toLocation": 6, "speed": 7, "remarks": 8},
    },
    "DC Leaf-Server-": {
        "start": 3, "scope": "DC", "category": "Leaf / Server",
        "columns": {"fromDevice": 1, "fromLocation": 2, "fromPort": 3, "fromConfig": 4, "fromVlan": 5, "toPort": 6, "toDevice": 7, "toLocation": 8, "toConfig": 9, "toVlan": 10, "toIp": 11, "speed": 12, "remarks": 13},
    },
    "DR Leaf-Server": {
        "start": 3, "scope": "DR", "category": "Leaf / Server",
        "columns": {"fromDevice": 1, "fromLocation": 2, "fromPort": 3, "speed": 4, "fromConfig": 5, "toPort": 6, "toDevice": 7, "toLocation": 8, "toConfig": 9},
    },
    "NDC Leaf-Server": {
        "start": 3, "scope": "NDC", "category": "Leaf / Server",
        "columns": {"fromDevice": 1, "fromLocation": 2, "fromPort": 3, "fromConfig": 4, "toPort": 5, "toDevice": 6, "toLocation": 7, "toConfig": 8, "toVlan": 9, "speed": 10, "status": 11, "remarks": 12},
    },
}

PORT_FIELDS = (
    "fromDevice", "fromLocation", "fromPort", "fromConfig", "fromVlan", "fromIp",
    "toDevice", "toLocation", "toPort", "toConfig", "toVlan", "toIp",
    "speed", "status", "remarks", "portDescription", "connectionType",
)


def finish_port_record(item):
    for field in PORT_FIELDS:
        item.setdefault(field, None)
    item["partial"] = not all(text(item.get(field)) for field in ("fromDevice", "fromPort", "toDevice", "toPort"))
    return item


def extract_port_links(wb):
    links = []
    for sheet_name, layout in PORT_LAYOUTS.items():
        ws = wb[sheet_name]
        reader = SheetReader(ws)
        columns = layout["columns"]
        for row in range(layout["start"], ws.max_row + 1):
            if not reader.any(row, columns.values()):
                continue
            item = base_record("port", sheet_name, row, layout["scope"], layout["category"])
            for field, col in columns.items():
                item[field] = scalar(reader.value(row, col))
            links.append(finish_port_record(item))

    # N5K↔9300 has two independent port-mapping tables on each worksheet row.
    ws = wb["N5k-To-9300"]
    reader = SheetReader(ws)
    for row in range(2, ws.max_row + 1):
        for suffix, source_col, target_col, source_name, target_name in (
            (":a", 1, 4, "N5K1", "9300-1"),
            (":b", 6, 9, "N5K2", "9300-2"),
        ):
            if not reader.any(row, range(source_col, target_col + 1)):
                continue
            item = base_record("port", ws.title, row, "N5K / 9300", "Port mapping", suffix)
            item.update({
                "fromDevice": source_name,
                "fromPort": scalar(reader.value(row, source_col)),
                "status": scalar(reader.value(row, source_col + 1)),
                "connectionType": scalar(reader.value(row, source_col + 2)),
                "toDevice": target_name,
                "toPort": scalar(reader.value(row, target_col)),
            })
            links.append(finish_port_record(item))

    # Explicit optical/ODF cross-connect evidence. No device names or ports are
    # inferred where the worksheet leaves them blank.
    ws = wb["DC to WHIL-DC Hard Cord"]
    reader = SheetReader(ws)
    for row in range(3, ws.max_row + 1):
        if not reader.any(row, range(1, 8)):
            continue
        item = base_record("port", ws.title, row, "DC ↔ WHIL-DC", "Physical cross-connect")
        item.update({
            "fromDevice": "NDC",
            "fromPort": scalar(reader.value(row, 1)),
            "odfFrom": scalar(reader.value(row, 2)),
            "n5kSwitch": scalar(reader.value(row, 3)),
            "n5kPort": scalar(reader.value(row, 4)),
            "odfTo": scalar(reader.value(row, 5)),
            "toDevice": scalar(reader.value(row, 6)),
            "toPort": scalar(reader.value(row, 7)),
        })
        links.append(finish_port_record(item))
    return links


def extract_access_devices(wb):
    ws = wb["HQ-ACCESS-SW-INFO"]
    reader = SheetReader(ws)
    rows = []
    # Column C is intentionally never read: it is the credential column.
    safe_columns = (1, 2, 4, 5, 6, 7, 8, 9, 10, 11, 12)
    for row in range(3, ws.max_row + 1):
        if not reader.any(row, safe_columns[1:]):
            continue
        item = base_record("access", ws.title, row, "HQ", "Access switch")
        item.update({
            "sl": scalar(reader.value(row, 1)),
            "ip": scalar(reader.value(row, 2)),
            "hostname": scalar(reader.value(row, 4)),
            "model": scalar(reader.value(row, 5)),
            "block": scalar(reader.value(row, 6)),
            "building": scalar(reader.value(row, 7)),
            "floor": scalar(reader.value(row, 8)),
            "uplinkPort": scalar(reader.value(row, 9)),
            "uplinkDevice": scalar(reader.value(row, 10)),
            "uplinkSwitchPort": scalar(reader.value(row, 11)),
            "remarks": scalar(reader.value(row, 12)),
        })
        rows.append(item)
    return rows


def extract_labels(wb):
    labels = []
    for sheet_name, scope in (("DC-Labeling", "DC"), ("Labeling WHIL-DC", "WHIL-DC")):
        ws = wb[sheet_name]
        for row in range(1, ws.max_row + 1):
            values = []
            for col in range(1, ws.max_column + 1):
                value = ws.cell(row, col).value
                if text(value):
                    values.append({"column": get_column_letter(col), "text": text(value)})
            if not values:
                continue
            item = base_record("label", sheet_name, row, scope, "Cable label")
            item.update({"values": values, "text": " | ".join(v["text"] for v in values)})
            labels.append(item)
    return labels


def extract_notes(wb):
    ws = wb["DC-NAT RULE"]
    notes = []
    for row in range(1, ws.max_row + 1):
        value = ws.cell(row, 14).value
        if row >= 6 and text(value):
            item = base_record("note", ws.title, row, "DC", "Operational note")
            item.update({"title": "NAT rule caution", "text": text(value), "sourceColumn": "N"})
            notes.append(item)
    return notes


def extract_peering(path: Path):
    wb = openpyxl.load_workbook(path, data_only=True)
    assert not EXCLUDED_SHEETS.intersection(wb.sheetnames), "Credential worksheets must not enter extraction"
    blocks = extract_ip_blocks(wb)
    vlans = extract_vlans(wb)
    loopbacks = extract_loopbacks(wb)
    device_peers = extract_device_peers(wb, blocks)
    isp_peers = extract_isp_peers(wb, blocks)
    links = extract_port_links(wb)
    access_devices = extract_access_devices(wb)
    labels = extract_labels(wb)
    notes = extract_notes(wb)

    ipam = {
        "blocks": blocks,
        "vlans": vlans,
        "devicePeers": device_peers,
        "ispPeers": isp_peers,
        "loopbacks": loopbacks,
        "stats": {
            "blocks": len(blocks),
            "vlans": len(vlans),
            "devicePeers": len(device_peers),
            "ispPeers": len(isp_peers),
            "loopbacks": len(loopbacks),
            "owners": dict(Counter(text(v["owner"]) or "Unspecified" for v in vlans)),
        },
    }
    connectivity = {
        "links": links,
        "accessDevices": access_devices,
        "labels": labels,
        "notes": notes,
        "stats": {
            "links": len(links),
            "completeLinks": sum(not link["partial"] for link in links),
            "partialLinks": sum(link["partial"] for link in links),
            "accessDevices": len(access_devices),
            "labels": len(labels),
            "scopes": dict(Counter(link["scope"] for link in links)),
            "categories": dict(Counter(link["category"] for link in links)),
            "sourceSheets": len({link["sourceSheet"] for link in links}),
        },
    }
    meta = {
        "workbook": "DC and NDC Peering IP, Port connectivity Info (1)",
        "spreadsheetId": "1NhH9QWbkjzwla-BlJc9oJSjFEP7GmZxYAtZzSEjZxyE",
        "linkedTab": "HQ Data Center IP Block",
        "linkedTabGid": "2126088890",
        "safeSnapshot": path.name,
        "safeWorksheets": len(wb.sheetnames),
        "excludedCredentialSheets": sorted(EXCLUDED_SHEETS),
        "notes": [
            "Only explicit worksheet rows are extracted; no connections are inferred.",
            "Merged worksheet cells are expanded from their actual top-left value.",
            "Credential worksheets and the HQ Access username column are excluded from the app snapshot.",
            "Every normalized record retains its source worksheet and row.",
        ],
    }

    # Build-time coverage and safety checks.
    assert len(vlans) == 98, len(vlans)
    assert len(loopbacks) == 12, len(loopbacks)
    assert len(links) >= 350, len(links)
    assert len(access_devices) == 27, len(access_devices)
    assert len(device_peers) >= 50, len(device_peers)
    assert len(isp_peers) == 34, len(isp_peers)
    assert all(raw_any(wb[peer["sourceSheet"]], peer["sourceRow"], range(1, 11)) for peer in isp_peers)
    assert next(link for link in links if link["sourceSheet"] == "DC BackBone" and link["sourceRow"] == 4)["toDevice"] == "DC-RT-01"
    assert next(link for link in links if link["sourceSheet"] == "DC Core-Distribution" and link["sourceRow"] == 5)["toDevice"] == "WMTC-B1-CORE-SW"
    assert next(link for link in links if link["sourceSheet"] == "DC Leaf-Server-" and link["sourceRow"] == 3)["fromDevice"] == "VAT"
    assert next(link for link in links if link["sourceSheet"] == "DC Leaf-Server-" and link["sourceRow"] == 4)["fromDevice"] is None
    assert next(link for link in links if link["sourceSheet"] == "NDC BackBone" and link["sourceRow"] == 65)["toDevice"] == "DC-CORE-SW-02"
    assert not any("username" in key.lower() or "password" in key.lower() for collection in (blocks, vlans, loopbacks, device_peers, isp_peers, links, access_devices, labels, notes) for item in collection for key in item)
    serialized = json.dumps({"ipam": ipam, "connectivity": connectivity}, ensure_ascii=False)
    assert "UserName" not in serialized and "Password" not in serialized
    return {"upgradeMeta": meta, "ipam": ipam, "connectivity": connectivity}


if __name__ == "__main__":
    root = Path(__file__).resolve().parents[1]
    result = extract_peering(root / "peering-safe.xlsx")
    print(json.dumps({"upgradeMeta": result["upgradeMeta"], "ipam": result["ipam"]["stats"], "connectivity": result["connectivity"]["stats"]}, indent=2, ensure_ascii=False))
