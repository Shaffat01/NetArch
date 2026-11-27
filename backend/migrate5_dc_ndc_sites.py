"""
Migration 5: Update the per-site (dc/ndc) topologies to match the full topology corrections.
"""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))

from database import SessionLocal
from models import Topology
import json

session = SessionLocal()

# Get full topology
full_topo = session.query(Topology).filter(Topology.site == 'full').order_by(Topology.id.desc()).first()
full_nodes = full_topo.nodes if isinstance(full_topo.nodes, list) else json.loads(full_topo.nodes)
full_edges = full_topo.edges if isinstance(full_topo.edges, list) else json.loads(full_topo.edges)

# ---- DC SITE ----
dc_node_ids = {
    'dc-isp-adn', 'dc-isp-agni', 'dc-isp-brac',
    'dc-wan-sw-01', 'dc-wan-sw-02',
    'dc-core-rt-01', 'dc-core-rt-02',
    'dc-fw-01', 'dc-fw-02',
    'dc-core-sw'
}
# Remap ids (strip 'dc-' prefix where needed for compatibility with existing site)
# Actually the existing dc site uses different IDs (isp-adn vs dc-isp-adn).
# Let me just rebuild DC site from full nodes, with id remapping for ISP/core-sw.

dc_nodes = []
id_map_dc = {}
for n in full_nodes:
    if n['id'] in dc_node_ids:
        new_n = json.loads(json.dumps(n))  # deep copy
        # Position adjustment for DC-only view
        new_n['position'] = {'x': n['position']['x'] - 80, 'y': n['position']['y'] - 60}
        # Use simplified id for ISP nodes (matches old dc site)
        old_id = new_n['id']
        if old_id == 'dc-isp-adn': new_id = 'isp-adn'
        elif old_id == 'dc-isp-agni': new_id = 'isp-agni'
        elif old_id == 'dc-isp-brac': new_id = 'isp-bracnet'
        elif old_id == 'dc-core-sw': new_id = 'dc-core-sw-01'
        else: new_id = old_id
        id_map_dc[old_id] = new_id
        new_n['id'] = new_id
        dc_nodes.append(new_n)

dc_edges = []
for e in full_edges:
    src, tgt = e['source'], e['target']
    if src in dc_node_ids or tgt in dc_node_ids:
        # Only include if both endpoints are DC nodes
        if src in dc_node_ids and tgt in dc_node_ids:
            new_e = json.loads(json.dumps(e))
            new_e['source'] = id_map_dc.get(src, src)
            new_e['target'] = id_map_dc.get(tgt, tgt)
            dc_edges.append(new_e)

# Reposition DC nodes for the single-site view
dc_positions = {
    'isp-adn': (80, 60), 'isp-agni': (200, 60), 'isp-bracnet': (320, 60),
    'dc-wan-sw-01': (140, 200), 'dc-wan-sw-02': (360, 200),
    'dc-core-rt-01': (140, 360), 'dc-core-rt-02': (360, 360),
    'dc-fw-01': (200, 500), 'dc-fw-02': (400, 500),
    'dc-core-sw-01': (300, 640),
}
for n in dc_nodes:
    if n['id'] in dc_positions:
        n['position'] = {'x': dc_positions[n['id']][0], 'y': dc_positions[n['id']][1]}

# Update ISP node hostnames for DC site (drop "(DC)" suffix for clarity in single-site view)
for n in dc_nodes:
    if n['id'] == 'isp-adn': n['data']['hostname'] = 'ADN Telecom'
    if n['id'] == 'isp-agni': n['data']['hostname'] = 'Agni Systems ★'
    if n['id'] == 'isp-bracnet': n['data']['hostname'] = 'BracNet'
    if n['id'] == 'dc-core-sw-01': n['data']['hostname'] = 'DC-CORE-SW (SV pair)'

# ---- NDC SITE ----
ndc_node_ids = {
    'ndc-isp-adn', 'ndc-isp-agni', 'ndc-isp-brac',
    'ndc-wan-sw-01', 'ndc-wan-sw-02',
    'ndc-core-rt-01', 'ndc-core-rt-02',
    'ndc-fw-01', 'ndc-fw-02',
    'ndc-core-sw'
}
ndc_nodes = []
id_map_ndc = {}
for n in full_nodes:
    if n['id'] in ndc_node_ids:
        new_n = json.loads(json.dumps(n))
        new_n['position'] = {'x': n['position']['x'] - 2000 + 100, 'y': n['position']['y'] - 60}
        old_id = new_n['id']
        if old_id == 'ndc-isp-adn': new_id = 'ndc-isp-adn'
        elif old_id == 'ndc-isp-agni': new_id = 'ndc-isp-agni'
        elif old_id == 'ndc-isp-brac': new_id = 'ndc-isp-bracnet'
        elif old_id == 'ndc-core-sw': new_id = 'ndc-core-sw-01'
        else: new_id = old_id
        id_map_ndc[old_id] = new_id
        new_n['id'] = new_id
        ndc_nodes.append(new_n)

ndc_edges = []
for e in full_edges:
    src, tgt = e['source'], e['target']
    if src in ndc_node_ids and tgt in ndc_node_ids:
        new_e = json.loads(json.dumps(e))
        new_e['source'] = id_map_ndc.get(src, src)
        new_e['target'] = id_map_ndc.get(tgt, tgt)
        ndc_edges.append(new_e)

ndc_positions = {
    'ndc-isp-adn': (80, 60), 'ndc-isp-agni': (200, 60), 'ndc-isp-bracnet': (320, 60),
    'ndc-wan-sw-01': (140, 200), 'ndc-wan-sw-02': (360, 200),
    'ndc-core-rt-01': (140, 360), 'ndc-core-rt-02': (360, 360),
    'ndc-fw-01': (200, 500), 'ndc-fw-02': (400, 500),
    'ndc-core-sw-01': (300, 640),
}
for n in ndc_nodes:
    if n['id'] in ndc_positions:
        n['position'] = {'x': ndc_positions[n['id']][0], 'y': ndc_positions[n['id']][1]}

for n in ndc_nodes:
    if n['id'] == 'ndc-isp-adn': n['data']['hostname'] = 'ADN Telecom'
    if n['id'] == 'ndc-isp-agni': n['data']['hostname'] = 'Agni Systems'
    if n['id'] == 'ndc-isp-bracnet': n['data']['hostname'] = 'BracNet'
    if n['id'] == 'ndc-core-sw-01': n['data']['hostname'] = 'NDC-CORE-SW (SV pair)'

# Save DC site
dc_topo = session.query(Topology).filter(Topology.site == 'dc').order_by(Topology.id.desc()).first()
if dc_topo:
    dc_topo.nodes = dc_nodes
    dc_topo.edges = dc_edges
    print(f"DC site updated: {len(dc_nodes)} nodes, {len(dc_edges)} edges")
else:
    print("WARNING: No DC topology found to update")

# Save NDC site
ndc_topo = session.query(Topology).filter(Topology.site == 'ndc').order_by(Topology.id.desc()).first()
if ndc_topo:
    ndc_topo.nodes = ndc_nodes
    ndc_topo.edges = ndc_edges
    print(f"NDC site updated: {len(ndc_nodes)} nodes, {len(ndc_edges)} edges")
else:
    print("WARNING: No NDC topology found to update")

session.commit()
session.close()
print("✅ DC/NDC site migrations complete")
