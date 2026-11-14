# Walton WAN — Network Topology GUI (Node.js + React)

Google Docs-এর 10টা device config (NDC/DC WAN SW, Core RT, Core SW) থেকে extract করা
**ISP → WAN Switch → Core Router → Firewall → Core SW** architecture-এর interactive web GUI।

## Features
- Interactive SVG topology diagram — device/link-এ click করলে শুধু তার connection highlight হয়
- Device click → Interface, VLAN, Route, Connection, PRI/SEC — সব tab-এ সুন্দরভাবে
- Link click → দুই পাশের interface, VLAN, link type, ব্যাখ্যা
- Site filter (NDC/DC), ISP filter (ADN/AGNI/BracNet/Metro), PRI/SEC filter, VLAN filter
- Search — hostname / interface / VLAN দিয়ে খুঁজুন
- Zoom (scroll/+/-), Pan (drag), Reset
- PRI vs SEC flow + architecture ব্যাখ্যা (বাংলায়)

## Run (development)
```bash
# terminal 1 — backend API (port 5000)
npm install
npm run server

# terminal 2 — frontend dev server (port 5173, /api proxy to 5000)
cd client
npm install
npm run dev
```

## Run (production — একটাই server)
```bash
npm install
npm run build     # client build করে server/dist-এ serve করে
npm start         # http://localhost:5000
```

## API
| Endpoint | Description |
|---|---|
| `GET /api/topology` | সব device, link, ISP, flow, explanation |
| `GET /api/devices?site=NDC` | device list (filter) |
| `GET /api/devices/:id` | device detail + connected links |
| `GET /api/links?path=PRI&isp=adn` | link list (filter) |
| `GET /api/vlans` | সব VLAN (site অনুযায়ী) |
| `GET /api/routes` | সব static route |
| `GET /api/flows?isp=adn&site=NDC` | PRI/SEC flow |
| `GET /api/search?q=181` | search (device/VLAN/link) |

## Data source
`server/data/topology.js` — Google Docs config থেকে manually extract করা।
Firewall node-গুলো interface description থেকে inferred (doc-এ FW config tab নেই)।

## Stack
- Backend: Node.js 20 + Express (ESM)
- Frontend: React 18 + Vite 5 (custom SVG diagram — কোনো external chart lib নেই)
