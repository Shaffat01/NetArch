#!/usr/bin/env python3
"""Extract the merged workbook into a self-contained browser dataset.

The workbook is the only source of truth. Missing neighbours stay missing; no
links are inferred. The script also creates source-grounded node aliases using
normalised names, the explicit -01/base-name pattern, and unique serial matches.
"""
from __future__ import annotations

import json
import re
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

import openpyxl

from extract_peering import extract_peering

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "source.xlsx"
PEERING_SOURCE = ROOT / "peering-safe.xlsx"
OUT = ROOT / "public"
OUT.mkdir(parents=True, exist_ok=True)

COLUMNS = {
    "role": 1,       # A
    "device": 6,     # F
    "model": 7,      # G
    "serial": 8,     # H
    "ip": 10,        # J
    "uplinkPort": 11,# K
    "localVlan": 12, # L
    "neighbor": 13,  # M
    "neighborPort": 14, # N
    "neighborVlan": 15, # O
    "neighborSerial": 16, # P
    "buildingVlan": 21, # U
    "floor": 22,     # V
    "zone": 23,      # W
    "direct": 24,    # X
    "path": 25,      # Y
}
ROLES = {"Core Device", "Distribution Device", "Access SW"}
ROLE_SHORT = {
    "Core Device": "Core",
    "Distribution Device": "Distribution",
    "Access SW": "Access",
}


def value(v):
    """Keep source values, while converting openpyxl-specific scalars to JSON."""
    if v is None or isinstance(v, (str, int, float, bool)):
        return v
    return str(v)


def text(v):
    return "" if v is None else str(v).strip()


def norm_name(v):
    """Conservative display-name normalisation for exact alias matching."""
    s = text(v).upper().replace("_", "-")
    s = re.sub(r"\s*-\s*", "-", s)
    s = re.sub(r"\s+", "-", s)
    s = re.sub(r"-{2,}", "-", s)
    return s.strip("-")


def norm_serial(v):
    return re.sub(r"\s+", "", text(v).upper())


def extract_main(ws):
    rows = []
    for r in range(7, ws.max_row + 1):
        role = ws.cell(r, 1).value
        if role not in ROLES:
            continue
        item = {key: value(ws.cell(r, col).value) for key, col in COLUMNS.items()}
        item["row"] = r
        item["id"] = f"{ws.title}-{r}"
        item["roleShort"] = ROLE_SHORT[role]
        item["sourceGap"] = not bool(text(item["neighbor"]))
        rows.append(item)
    return rows


def extract_side_by_side(ws, start, end, left, right, left_name, right_name):
    records = []
    for r in range(start, end + 1):
        for side, cols in ((left_name, left), (right_name, right)):
            node = ws.cell(r, cols[0]).value
            ip = ws.cell(r, cols[1]).value
            third = ws.cell(r, cols[2]).value
            if node is None and ip is None and third is None:
                continue
            records.append({
                "id": f"{ws.title}-{side}-{r}",
                "row": r,
                "side": side,
                "node": value(node),
                "ip": value(ip),
                "zone": value(third),
            })
    return records


def new_node(key, label, referenced=False):
    return {
        "id": key,
        "label": text(label),
        "role": "Referenced" if referenced else None,
        "roles": [],
        "zone": None,
        "zones": [],
        "model": None,
        "models": [],
        "serial": None,
        "serials": [],
        "ip": None,
        "ips": [],
        "buildingVlan": None,
        "buildingVlans": [],
        "floor": None,
        "floors": [],
        "rows": [],
        "referencedRows": [],
        "gapRows": [],
        "referencedOnly": referenced,
    }


def add_unique(node, plural, singular, v):
    if v is None or text(v) == "":
        return
    if node[singular] is None:
        node[singular] = value(v)
    rendered = text(v)
    if all(text(x) != rendered for x in node[plural]):
        node[plural].append(value(v))


def build_graph(rows):
    nodes = {}
    serial_index = defaultdict(set)

    # First pass: only local devices define architectural layers.
    for row in rows:
        key = norm_name(row["device"])
        if not key:
            raise ValueError(f"Blank local device at {row['id']}")
        if key not in nodes:
            nodes[key] = new_node(key, row["device"])
        node = nodes[key]
        node["referencedOnly"] = False
        node["rows"].append(row["id"])
        if row["roleShort"] not in node["roles"]:
            node["roles"].append(row["roleShort"])
        node["role"] = node["roles"][0]
        for plural, singular, field in (
            ("zones", "zone", "zone"),
            ("models", "model", "model"),
            ("serials", "serial", "serial"),
            ("ips", "ip", "ip"),
            ("buildingVlans", "buildingVlan", "buildingVlan"),
            ("floors", "floor", "floor"),
        ):
            add_unique(node, plural, singular, row[field])
        if row["sourceGap"]:
            node["gapRows"].append(row["id"])
        if norm_serial(row["serial"]):
            serial_index[norm_serial(row["serial"])].add(key)

    def building_number(key):
        match = re.search(r"(?:^|-)BUILDING-(\d+)(?:-|$)", key)
        if match:
            return int(match.group(1))
        match = re.search(r"(?:^|-)B-?(\d+)(?:-|$)", key)
        return int(match.group(1)) if match else None

    def building_alias(key):
        # Distribution names in the workbook vary between "Building-4",
        # "B4-DIST-SW", "B-4-DIST-SW" and "B4-Dist". Use the explicit
        # building number before trusting a possibly conflicting serial.
        if "DIST" not in key and "CORE" not in key:
            return None
        number = building_number(key)
        if number is None:
            return None
        candidates = [k for k, n in nodes.items() if n["role"] == "Distribution" and building_number(k) == number]
        if key.startswith("WMTC"):
            candidates = [k for k in candidates if k.startswith("WMTC")]
        elif key.startswith("WHIL"):
            candidates = [k for k in candidates if k.startswith("WHIL")]
        return candidates[0] if len(candidates) == 1 else None

    def resolve_neighbor(row):
        neighbor = row["neighbor"]
        key = norm_name(neighbor)
        if key in nodes:
            return key, "normalised-name"
        # Workbook formulas use -01 aliases for several base devices. Only map
        # to a base that actually exists in the local register.
        if key.endswith("-01") and key[:-3] in nodes:
            return key[:-3], "explicit-01-alias"
        alias = building_alias(key)
        if alias:
            return alias, "building-alias"
        serial = norm_serial(row["neighborSerial"])
        if serial and serial in serial_index:
            candidates = serial_index[serial]
            if len(candidates) == 1:
                return next(iter(candidates)), "unique-neighbor-serial"
            # When stacked rows reuse a serial, prefer the unique base/prefix
            # name match; otherwise keep a referenced node rather than guess.
            base = key[:-3] if key.endswith(("-01", "-02")) else key
            matches = [c for c in candidates if c == base or c.startswith(base + "-") or base.startswith(c + "-")]
            if len(matches) == 1:
                return matches[0], "serial-and-name"
        return "ref:" + key, "referenced-only"

    edges = []
    for row in rows:
        if row["sourceGap"]:
            continue
        target, match = resolve_neighbor(row)
        if target not in nodes:
            nodes[target] = new_node(target, row["neighbor"], referenced=True)
            nodes[target]["role"] = "Referenced"
            nodes[target]["roles"] = ["Referenced"]
        node = nodes[target]
        if row["id"] not in node["referencedRows"]:
            node["referencedRows"].append(row["id"])
        add_unique(node, "serials", "serial", row["neighborSerial"])
        edges.append({
            "id": "edge-" + row["id"],
            "rowId": row["id"],
            "source": norm_name(row["device"]),
            "target": target,
            "match": match,
            "uplinkPort": row["uplinkPort"],
            "neighborPort": row["neighborPort"],
            "localVlan": row["localVlan"],
            "neighborVlan": row["neighborVlan"],
            "direct": row["direct"],
            "path": row["path"],
        })

    # Aggregate parallel links for drawing; every raw row remains in links.
    grouped = {}
    for edge in edges:
        pair = (edge["source"], edge["target"])
        if pair not in grouped:
            grouped[pair] = {
                "id": f"link:{pair[0]}=>{pair[1]}",
                "source": pair[0],
                "target": pair[1],
                "links": [],
                "count": 0,
            }
        grouped[pair]["links"].append(edge)
        grouped[pair]["count"] += 1

    # Display-only parent/root hints. They reorder existing nodes but never add
    # edges, so daisy-chained Access → Access devices stay under their real
    # upstream Distribution branch while raw neighbour gaps remain untouched.
    outgoing = defaultdict(set)
    incoming = defaultdict(set)
    for edge in edges:
        outgoing[edge["source"]].add(edge["target"])
        incoming[edge["target"]].add(edge["source"])
    for node in nodes.values():
        direct = [nodes[t] for t in outgoing[node["id"]] if t in nodes]
        distributions = [n["label"] for n in direct if n["role"] == "Distribution"]
        parents = distributions or [n["label"] for n in direct]
        node["parentHint"] = Counter(parents).most_common(1)[0][0] if parents else None
        node["rootHint"] = None
        node["rootKey"] = None
        if node["role"] != "Access":
            continue
        queue = [node["id"]]
        seen = {node["id"]}
        found = None
        while queue and not found:
            current = queue.pop(0)
            for target in sorted(outgoing[current]):
                if target in seen or target not in nodes:
                    continue
                if nodes[target]["role"] == "Distribution":
                    found = target
                    break
                seen.add(target)
                queue.append(target)
        if found:
            node["rootHint"] = nodes[found]["label"]
            node["rootKey"] = found

    node_list = sorted(nodes.values(), key=lambda n: (n["role"] or "", n["label"].upper()))
    return {
        "nodes": node_list,
        "edges": edges,
        "links": list(grouped.values()),
        "stats": {
            "rows": len(rows),
            "devices": sum(1 for n in node_list if not n["referencedOnly"]),
            "referenced": sum(1 for n in node_list if n["referencedOnly"]),
            "documentedLinks": len(edges),
            "aggregatedLinks": len(grouped),
            "sourceGaps": sum(1 for r in rows if r["sourceGap"]),
            "roles": dict(Counter(r["roleShort"] for r in rows)),
            "zones": dict(Counter(text(r["zone"]) or "Unspecified" for r in rows)),
        },
    }


def main():
    wb = openpyxl.load_workbook(SOURCE, data_only=True)
    generated = datetime.now(timezone.utc).isoformat()
    data = {
        "meta": {
            "title": "WMTC / WHIL Network Architecture",
            "workbook": "WMTC-WHIL Merged Network & Topology",
            "spreadsheetId": "1THxqtHc4rHOAunVBL3cBU8tI7oPfuoLgIJPgKrA1nWI",
            "generatedAt": generated,
            "source": "Merged Google Sheets workbook, exported as XLSX",
            "notes": [
                "Only explicit neighbour rows become links.",
                "Blank neighbour cells are shown as source gaps.",
                "DMZ/MZ and DataCenter source sections contain inventory, not inferred port-level links.",
                "Core records are shared by the WMTC and WHIL workbook perspectives.",
                "The separate peering workbook supplies source-row IPAM, VLAN, peering and port-connectivity evidence; credential content is excluded.",
            ],
        },
        "sites": {},
    }
    data.update(extract_peering(PEERING_SOURCE))

    for site in ("WMTC", "WHIL"):
        ws = wb[site]
        rows = extract_main(ws)
        dc_source = wb["SRC_DataCenter"]
        dc_entries = extract_side_by_side(dc_source, 6, dc_source.max_row, (1, 2, 3), (5, 6, 7), "NDC", "DC")
        for entry in dc_entries:
            entry["sourceSheet"] = "Data Center Devices"
            entry["vlan"] = entry["zone"]
            entry["kind"] = "device" if text(entry["ip"]) else ("note" if text(entry["zone"]) else "label")
        dmz_entries = extract_side_by_side(ws, 945, ws.max_row, (1, 2, 3), (5, 6, 7), "DMZ", "MZ")
        graph = build_graph(rows)
        data["sites"][site] = {
            "rows": rows,
            **graph,
            "dataCenter": dc_entries,
            "dmzMz": dmz_entries,
        }
        data["sites"][site]["stats"]["dataCenter"] = dict(Counter(e["side"] for e in dc_entries))
        data["sites"][site]["stats"]["dmzMz"] = dict(Counter(e["side"] for e in dmz_entries))

    # Acceptance checks: fail the build instead of shipping an incomplete view.
    assert len(data["sites"]["WMTC"]["rows"]) == 153
    assert len(data["sites"]["WHIL"]["rows"]) == 98
    assert data["sites"]["WMTC"]["stats"]["roles"] == {"Core": 38, "Distribution": 18, "Access": 97}
    assert data["sites"]["WHIL"]["stats"]["roles"] == {"Core": 38, "Distribution": 13, "Access": 47}
    assert data["sites"]["WMTC"]["stats"]["sourceGaps"] == 20
    assert data["sites"]["WHIL"]["stats"]["sourceGaps"] == 13
    for site in ("WMTC", "WHIL"):
        bundle = data["sites"][site]
        assert len(bundle["edges"]) == len(bundle["rows"]) - bundle["stats"]["sourceGaps"]
        assert all(r["neighbor"] for r in bundle["rows"] if not r["sourceGap"])
        assert all(not r["neighbor"] for r in bundle["rows"] if r["sourceGap"])
        assert bundle["stats"]["dmzMz"] == {"DMZ": 61, "MZ": 94}
        assert bundle["stats"]["dataCenter"] == {"NDC": 63, "DC": 46}
        assert Counter(e["kind"] for e in bundle["dataCenter"]) == {"device": 68, "label": 37, "note": 4}
        assert next(e for e in bundle["dataCenter"] if e["node"] == "(Core SW to Firewall)")["row"] == 68
        assert next(e for e in bundle["dataCenter"] if e["side"] == "NDC" and text(e["node"]).startswith("WAN to Firewall"))["row"] == 70
        for r in bundle["rows"]:
            for v in r.values():
                assert not (isinstance(v, str) and v.startswith("#")), (site, r["id"], v)

    payload = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    (OUT / "data.json").write_text(payload, encoding="utf-8")
    (OUT / "data.js").write_text("window.NETWORK_DATA=" + payload + ";\n", encoding="utf-8")
    print(json.dumps({site: data["sites"][site]["stats"] for site in data["sites"]}, indent=2))
    print(f"Wrote {OUT / 'data.json'} ({len(payload):,} bytes)")


if __name__ == "__main__":
    main()
