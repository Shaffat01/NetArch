# NetArch NOC — Network Topology Visualizer

A real-time Enterprise Network Operations Center (NOC) topology visualizer built for Walton DC & NDC infrastructure. Features interactive network diagrams for multiple sites, deep device inspection, and persistent layout storage.

## 🏗 Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                   NetArch NOC Stack                         │
├─────────────────────────────────────────────────────────────┤
│  Frontend (React 19 + Vite + ReactFlow + TailwindCSS)      │
│  ├── Multi-site tab system (DC / NDC)                       │
│  ├── Interactive topology canvas (drag, zoom, pan)           │
│  ├── Device inspector drawer (interfaces, BGP, VLANs)        │
│  ├── Device palette for adding new nodes                     │
│  ├── Search & highlight per site                             │
│  └── Export to PNG / PDF (per-site)                          │
├─────────────────────────────────────────────────────────────┤
│  Backend API (FastAPI + SQLAlchemy + SQLite)                │
│  ├── GET  /api/sites           – List all sites             │
│  ├── GET  /api/topology?site=  – Load site topology          │
│  ├── POST /api/topology        – Save full topology          │
│  ├── POST /api/topology/layout – Save positions only         │
│  ├── POST /api/topology/reset  – Reset site to default       │
│  └── GET  /api/health          – Health check                │
└─────────────────────────────────────────────────────────────┘
```

## 🚀 Quick Start

### Backend Setup

```bash
cd backend
python3 -m venv ../.venv
source ../.venv/bin/activate
pip install -r requirements.txt

# Seed both DC and NDC topologies
python seed_complete.py   # DC site
python seed_ndc.py        # NDC site

# Run the API server
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

### Frontend Setup

```bash
cd net-diagram-app
npm install
npm run dev
```

Frontend runs at: http://localhost:5173 (proxies `/api` to backend)

## 🏢 Sites

The application currently supports two physical data center sites, switchable via tabs in the top navigation:

| Tab | Site | Location | Mgmt Subnet | Devices |
|-----|------|----------|-------------|---------|
| **DC** (cyan) | Primary Data Center | Kaliakair | 172.16.0.0/24 | 12 devices, 23 links |
| **NDC** (violet) | Near/Non-Data Center (DR) | Chandra | 172.16.6.0/24 | 10 devices, 19 links |

### DC Site Devices (from real backups)
- 4× ISP (ADN, Agni, BracNet, MetroNet)
- 2× WAN Switch (DC-WAN-SW-01/02, C9500)
- 2× Firewall (DC-FW-01/02)
- 2× Core Router (DC-CORE-RT-01/02, ASR 1001-X)
- 2× Core Switch (DC-CORE-SW-01/02, vPC pair)

### NDC Site Devices (from real config backups)
- 3× ISP (ADN, Agni, BracNet — NDC handoffs)
- 2× WAN Switch (NDC-WAN-SW-01/02, C9500, IOS-XE 17.6.4)
- 2× Firewall (NDC-FW-01/02)
- 2× Core Router (NDC-CORE-RT-01/02, ASR 1001-X, IOS-XE 17.6.3a)
- 1× Core Switch (NDC-CORE-SW-01, C9500 StackWise Virtual — 2×C9500-40X)

## 📂 Project Structure

```
NetArch/
├── backend/
│   ├── main.py              # FastAPI app with multi-site endpoints
│   ├── models.py            # SQLAlchemy model with site field
│   ├── database.py          # SQLite engine & session
│   ├── seed_complete.py     # DC site seed (12 devices)
│   ├── seed_ndc.py          # NDC site seed (10 devices)
│   ├── seed_dc_all.py       # Legacy DC seed
│   ├── seed_dc_wan.py       # Legacy WAN seed
│   ├── requirements.txt
│   └── network_topology.db
├── net-diagram-app/
│   ├── src/
│   │   ├── App.jsx          # Main app with site tabs
│   │   ├── components/
│   │   │   └── CustomDeviceNode.jsx
│   │   ├── index.css        # Tailwind + NOC styles
│   │   └── main.jsx
│   ├── index.html
│   ├── vite.config.js       # Vite + API proxy
│   └── package.json
└── README.md
```

## 🎨 Features

- **Multi-Site Tabs**: Switch between DC (cyan theme) and NDC (violet theme) topologies
- **Interactive Canvas**: Drag, pan, zoom with ReactFlow; per-site state preserved
- **Custom Device Nodes**: Color-coded by role with live status LEDs & port matrix
- **Deep Inspection Drawer**: Per-device tabs for Overview, Interfaces, BGP/OSPF, VLANs, DCI Tunnels, System details
- **Add Devices**: Palette for dropping new nodes onto the current site
- **Connect Nodes**: Drag from handles to create new links
- **Search**: Highlight devices by hostname/IP/model (per site)
- **Export**: Download current site as PNG or PDF
- **Save Layout**: Persist positions/connections per site to SQLite
- **Dark NOC Theme**: Professional dark mode optimized for operations centers

## 📡 NDC VLAN Scheme (from actual configs)

| VLAN | Name | Purpose |
|------|------|---------|
| 181 | ADN_DATA_PRI | ADN primary data |
| 182 | ADN_INT_PRI | ADN primary internet |
| 205 | ADN_DATA_SEC | ADN secondary data |
| 206 | ADN_INT_SEC | ADN secondary internet |
| 501 | BracNet-DATA-PRI | BracNet primary data |
| 502 | BracNet-DATA-SEC | BracNet secondary data |
| 505 | AGNI_INT_PRI | Agni primary internet |
| 506 | AGNI_DATA_PRI | Agni primary data |
| 507 | AGNI_INT_SEC | Agni secondary internet |
| 508 | AGNI_DATA_SEC | Agni secondary data |
| 705 | BracNet-INT&DATA-PRI | BracNet primary |
| 706 | BracNet-INT&DATA-SEC | BracNet secondary |
| 1606 | MGMT | Management VLAN |
| 1680 | RT-FW | Router-Firewall transit |

## 🔧 Source Config Files

Device configurations sourced from Google Drive backup files (Walton real devices):
- `backup_DC_WAN-SW1.txt`, `backup_DC_WAN_SW2.txt`
- `backup_DC_CORE_RT1.txt`, `backup_DC_CorE_RT2.txt`
- `backup_DC_CORE_SW.txt`
- `backup_NDC_WAN_SW1.txt`, `backup_NDC_WAN_SW2.txt`
- `backup_NDC_RT1.txt`, `backup_NDC_RT2.txt`
- `backup_NDC_CORE_SW.txt`
