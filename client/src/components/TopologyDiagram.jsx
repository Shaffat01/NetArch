import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

const PATH_COLOR = {
  PRI: "#22c55e",
  SEC: "#f59e0b",
  "RT-FW": "#c084fc",
  "Core-FW": "#c084fc",
  CORE: "#22d3ee",
  L2: "#94a3b8",
};

const ISP_COLOR = { adn: "#38bdf8", agni: "#a78bfa", bracnet: "#fb923c", metro: "#2dd4bf" };

const ROLE_ICON = {
  "WAN Switch (PRI)": "⇄",
  "WAN Switch (SEC)": "⇄",
  "Core Router (ASR1001-X)": "◉",
  "Core Router (ASR1001-X) — SEC": "◉",
  "Firewall (PRI)": "🛡",
  "Firewall (SEC)": "🛡",
  "Core Switch (StackWise Virtual)": "▦",
};

const LAYERS = [
  { x: 60, n: 1, t: "ISP", c: "#38bdf8", sub: "Internet" },
  { x: 260, n: 2, t: "WAN SW", c: "#22c55e", sub: "L2 • VLAN trunk" },
  { x: 520, n: 3, t: "CORE RT", c: "#3b82f6", sub: "L3 • BGP • NAT" },
  { x: 790, n: 4, t: "FIREWALL", c: "#c084fc", sub: "Security" },
  { x: 1060, n: 5, t: "CORE SW", c: "#22d3ee", sub: "LAN • OSPF" },
];

const VB_W = 1250;
const VB_H = 1010;

function nodeColor(d) {
  if (d.role.includes("WAN Switch")) return d.role.includes("PRI") ? "#14532d" : "#713f12";
  if (d.role.includes("Core Router")) return "#1e3a5f";
  if (d.role.includes("Firewall")) return "#3b0764";
  return "#164e63";
}

function fmtVlansShort(v) {
  if (v === "ALL") return "ALL VLAN";
  if (Array.isArray(v)) return v.length > 3 ? `${v[0]}…${v[v.length - 1]} (${v.length})` : v.join(",");
  return String(v ?? "");
}

export default function TopologyDiagram({
  devices,
  ispNodes,
  links,
  selectedDeviceId,
  selectedLinkId,
  onSelectDevice,
  onSelectLink,
  siteFilter,
  vlanFilter,
  ispFilter,
  pathFilter,
  highlightPath,
}) {
  const wrapRef = useRef(null);
  const svgRef = useRef(null);
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const [hoveredLinkId, setHoveredLinkId] = useState(null);
  const drag = useRef(null);
  const movedRef = useRef(false);

  // ---------- fit whole diagram into container ----------
  const fitView = useCallback(() => {
    const el = wrapRef.current;
    if (!el) return;
    const w = el.clientWidth;
    const h = el.clientHeight;
    if (!w || !h) return;
    const k = Math.min(w / VB_W, h / VB_H) * 0.985;
    setView({ x: (w - VB_W * k) / 2, y: (h - VB_H * k) / 2, k });
  }, []);

  useEffect(() => {
    fitView();
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => fitView());
    ro.observe(el);
    return () => ro.disconnect();
  }, [fitView]);

  // ---------- zoom to cursor (native listener so preventDefault works) ----------
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e) => {
      e.preventDefault();
      const rect = svg.getBoundingClientRect();
      // cursor position in viewBox coordinates
      const cx = ((e.clientX - rect.left) / rect.width) * VB_W;
      const cy = ((e.clientY - rect.top) / rect.height) * VB_H;
      setView((v) => {
        const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
        const k2 = Math.min(3.5, Math.max(0.3, v.k * factor));
        const r = k2 / v.k;
        // keep the point under the cursor stationary
        return { k: k2, x: cx - (cx - v.x) * r, y: cy - (cy - v.y) * r };
      });
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, []);

  const nodePos = useMemo(() => {
    const m = new Map();
    for (const d of devices) m.set(d.id, { x: d.x, y: d.y });
    for (const n of ispNodes) m.set(n.id, { x: n.x, y: n.y });
    return m;
  }, [devices, ispNodes]);

  const visibleNodeIds = useMemo(() => {
    if (siteFilter === "ALL") return null;
    const s = new Set();
    for (const d of devices) if (d.site === siteFilter) s.add(d.id);
    for (const n of ispNodes) if (n.site === siteFilter) s.add(n.id);
    return s;
  }, [devices, ispNodes, siteFilter]);

  const isLinkVisible = (l) => {
    if (visibleNodeIds && (!visibleNodeIds.has(l.from) || !visibleNodeIds.has(l.to))) {
      if (l.id !== "ndc-dc-core") return false;
    }
    if (pathFilter !== "ALL" && l.path !== pathFilter) return false;
    if (ispFilter !== "ALL" && l.isp !== ispFilter) return false;
    if (vlanFilter !== null) {
      if (l.vlans === "ALL") return true;
      if (Array.isArray(l.vlans) && l.vlans.includes(vlanFilter)) return true;
      return false;
    }
    return true;
  };

  const isHighlighted = (l) => {
    if (highlightPath) return highlightPath.includes(l.id);
    if (selectedLinkId) return l.id === selectedLinkId;
    if (selectedDeviceId) return l.from === selectedDeviceId || l.to === selectedDeviceId;
    if (vlanFilter !== null || ispFilter !== "ALL" || pathFilter !== "ALL") return isLinkVisible(l);
    return true;
  };

  const isNodeDim = (id) => {
    if (visibleNodeIds && !visibleNodeIds.has(id)) return true;
    if (highlightPath) {
      const inPath = highlightPath.some((lid) => {
        const l = links.find((x) => x.id === lid);
        return l && (l.from === id || l.to === id);
      });
      return !inPath;
    }
    if (selectedDeviceId) {
      if (id === selectedDeviceId) return false;
      return !links.some((l) => (l.from === selectedDeviceId && l.to === id) || (l.to === selectedDeviceId && l.from === id));
    }
    if (selectedLinkId) {
      const l = links.find((x) => x.id === selectedLinkId);
      if (l) return id !== l.from && id !== l.to;
    }
    return false;
  };

  // ---------- pan (drag) with click-vs-drag detection ----------
  const onMouseDown = (e) => {
    movedRef.current = false;
    drag.current = { sx: e.clientX, sy: e.clientY, ox: view.x, oy: view.y };
  };
  const onMouseMove = (e) => {
    if (!drag.current) return;
    const dx = e.clientX - drag.current.sx;
    const dy = e.clientY - drag.current.sy;
    if (Math.abs(dx) + Math.abs(dy) > 4) movedRef.current = true;
    // convert screen px delta to viewBox units (svg scales VB_W across container width)
    const rect = svgRef.current?.getBoundingClientRect();
    const scale = rect ? VB_W / rect.width : 1;
    setView((v) => ({ ...v, x: drag.current.ox + dx * scale, y: drag.current.oy + dy * scale }));
  };
  const onMouseUp = () => (drag.current = null);

  const handleNodeClick = (id) => {
    if (movedRef.current) return; // was a drag, not a click
    onSelectDevice(id);
  };
  const handleLinkClick = (id) => {
    if (movedRef.current) return;
    onSelectLink(id);
  };

  const zoomBy = (f) => {
    const el = wrapRef.current;
    if (!el) return;
    const cx = VB_W / 2;
    const cy = VB_H / 2;
    setView((v) => {
      const k2 = Math.min(3.5, Math.max(0.3, v.k * f));
      const r = k2 / v.k;
      return { k: k2, x: cx - (cx - v.x) * r, y: cy - (cy - v.y) * r };
    });
  };

  const linkPath = (l, idx = 0) => {
    const a = nodePos.get(l.from);
    const b = nodePos.get(l.to);
    if (!a || !b) return "";
    const mx = (a.x + b.x) / 2;
    // ISP link গুলো একই জায়গা দিয়ে যায় — প্রতিটাকে একটু আলাদা bend দিয়ে আলাদা করা
    const isIspLink = l.from.startsWith("isp-");
    const bend = isIspLink ? ((idx % 3) - 1) * 22 : 0;
    return `M ${a.x} ${a.y} C ${mx} ${a.y + bend}, ${mx} ${b.y + bend}, ${b.x} ${b.y}`;
  };

  // label position: midpoint, pushed away from nodes; vertical links (WAN1<->WAN2, NDC<->DC) offset sideways
  const labelPos = (l) => {
    const a = nodePos.get(l.from);
    const b = nodePos.get(l.to);
    if (!a || !b) return { x: 0, y: 0 };
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    if (Math.abs(dx) < 40) return { x: mx + 14, y: my }; // vertical link -> label to the right
    return { x: mx, y: my - 10 };
  };

  return (
    <div className="diagram-wrap" ref={wrapRef}>
      <div className="zoom-controls">
        <button onClick={() => zoomBy(1.25)} title="Zoom in">+</button>
        <button onClick={() => zoomBy(0.8)} title="Zoom out">−</button>
        <button onClick={fitView} title="Fit to screen" style={{ width: "auto", padding: "0 12px", fontSize: 12 }}>Fit</button>
      </div>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        preserveAspectRatio="xMidYMid meet"
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
      >
        <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
          {/* site bands */}
          <rect x="10" y="20" width="1230" height="470" rx="18" fill="rgba(59,130,246,0.05)" stroke="#2f4a7d" strokeDasharray="7 6" />
          <text x="30" y="50" className="site-band">⬢ NDC SITE</text>
          <rect x="10" y="520" width="1230" height="470" rx="18" fill="rgba(45,212,191,0.04)" stroke="#2f4a7d" strokeDasharray="7 6" />
          <text x="30" y="550" className="site-band">⬢ DC SITE</text>

          {/* layer bands + step numbers */}
          {LAYERS.map((L) => (
            <g key={L.t}>
              <rect x={L.x - 95} y="62" width="190" height="34" rx="17" fill="#0c1628" stroke={L.c} strokeWidth="1.2" />
              <circle cx={L.x - 78} cy="79" r="10" fill={L.c} />
              <text x={L.x - 78} y="83" textAnchor="middle" fill="#070d1a" fontSize="11" fontWeight="800">{L.n}</text>
              <text x={L.x - 63} y="83" fill="#fff" fontSize="11.5" fontWeight="800" letterSpacing="1">{L.t}</text>
              <text x={L.x} y="112" textAnchor="middle" fill="#5b7bb0" fontSize="9.5">{L.sub}</text>
            </g>
          ))}

          {/* links */}
          {links.map((l, idx) => {
            const vis = isLinkVisible(l);
            const hl = isHighlighted(l);
            const color = PATH_COLOR[l.path] || "#94a3b8";
            const a = nodePos.get(l.from);
            const b = nodePos.get(l.to);
            if (!a || !b) return null;
            const lp = labelPos(l);
            // Label শুধু তখন দেখাবে যখন user interact করেছে (select/hover/filter/path) —
            // default view-এ সব label দেখালে ISP→WAN area-তে overlap হয়।
            const interactive = Boolean(selectedDeviceId || selectedLinkId || highlightPath || vlanFilter !== null || ispFilter !== "ALL" || pathFilter !== "ALL");
            const showLabel = vis && hl && (interactive || hoveredLinkId === l.id);
            return (
              <g key={l.id} style={{ opacity: !vis ? 0.06 : hl ? 1 : 0.32 }}>
                <path
                  d={linkPath(l, idx)}
                  fill="none"
                  stroke={color}
                  strokeWidth={selectedLinkId === l.id || hoveredLinkId === l.id || (highlightPath && highlightPath.includes(l.id)) ? 4.5 : hl ? 2.8 : 1.7}
                  strokeDasharray={l.path === "SEC" ? "8 5" : l.path === "L2" ? "3 6" : "none"}
                  className={hl && l.path === "PRI" ? "flow-anim" : ""}
                  style={{ cursor: "pointer" }}
                  onMouseEnter={() => setHoveredLinkId(l.id)}
                  onMouseLeave={() => setHoveredLinkId(null)}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleLinkClick(l.id);
                  }}
                >
                  <title>{`${l.label} — ${l.fromInt} ↔ ${l.toInt} • VLAN ${fmtVlansShort(l.vlans)}`}</title>
                </path>
                <path
                  d={linkPath(l, idx)}
                  fill="none"
                  stroke="transparent"
                  strokeWidth="18"
                  style={{ cursor: "pointer" }}
                  onMouseEnter={() => setHoveredLinkId(l.id)}
                  onMouseLeave={() => setHoveredLinkId(null)}
                  onClick={() => handleLinkClick(l.id)}
                />
                {showLabel && (
                  <g pointerEvents="none">
                    {/* dark pill behind label so it never overlaps node text */}
                    <rect
                      x={lp.x - 52}
                      y={lp.y - 20}
                      width="104"
                      height="30"
                      rx="8"
                      fill="rgba(7,13,26,0.82)"
                      stroke={color}
                      strokeWidth="0.7"
                      opacity="0.92"
                    />
                    <text x={lp.x} y={lp.y - 6} textAnchor="middle" className="link-label">{l.label}</text>
                    <text x={lp.x} y={lp.y + 7} textAnchor="middle" className="link-vlan">VLAN {fmtVlansShort(l.vlans)}</text>
                  </g>
                )}
              </g>
            );
          })}

          {/* ISP nodes */}
          {ispNodes.map((n) => (
            <g key={n.id} className={`node ${isNodeDim(n.id) ? "dim" : ""}`} onClick={() => handleNodeClick(null)}>
              <circle cx={n.x} cy={n.y} r="30" fill="#081226" stroke={ISP_COLOR[n.isp]} strokeWidth="2.5" />
              <circle cx={n.x} cy={n.y} r="30" fill="none" stroke={ISP_COLOR[n.isp]} strokeWidth="6" opacity="0.15" />
              <text x={n.x} y={n.y + 1} textAnchor="middle" fill="#fff" fontSize="11" fontWeight="800">
                {n.name}
              </text>
              <text x={n.x} y={n.y + 15} textAnchor="middle" fill={ISP_COLOR[n.isp]} fontSize="9" fontWeight="700">
                ISP
              </text>
              <text x={n.x} y={n.y + 48} textAnchor="middle" fill="#8ea3c7" fontSize="9.5">
                {n.site} • PRI+SEC
              </text>
            </g>
          ))}

          {/* device nodes */}
          {devices.map((d) => {
            const isPri = d.role.includes("(PRI)") || (d.role.includes("Core Router (ASR1001-X)") && !d.role.includes("SEC"));
            const isSec = d.role.includes("(SEC)") || d.role.includes("— SEC");
            return (
              <g
                key={d.id}
                className={`node ${selectedDeviceId === d.id ? "selected" : ""} ${isNodeDim(d.id) ? "dim" : ""}`}
                onClick={(e) => {
                  e.stopPropagation();
                  handleNodeClick(d.id);
                }}
              >
                <rect className="body" x={d.x - 88} y={d.y - 38} width="176" height="76" rx="14" fill={nodeColor(d)} stroke="#3b82f6" strokeWidth="1.6" />
                {(isPri || isSec) && (
                  <g>
                    <rect x={d.x + 52} y={d.y - 50} width="42" height="17" rx="8.5" fill={isPri ? "#22c55e" : "#f59e0b"} />
                    <text x={d.x + 73} y={d.y - 38} textAnchor="middle" fill="#070d1a" fontSize="9.5" fontWeight="800">{isPri ? "PRI" : "SEC"}</text>
                  </g>
                )}
                <text x={d.x} y={d.y - 14} textAnchor="middle" fill="#fff" fontSize="12.5" fontWeight="800">
                  {ROLE_ICON[d.role] || "▣"} {d.hostname}
                </text>
                <text x={d.x} y={d.y + 3} textAnchor="middle" fill="#cbd5e1" fontSize="10">
                  {d.role}
                </text>
                <text x={d.x} y={d.y + 19} textAnchor="middle" fill="#8ea3c7" fontSize="9.5">
                  {d.mgmtIp}
                </text>
                <text x={d.x} y={d.y + 32} textAnchor="middle" fill="#5b7bb0" fontSize="8.5">
                  {d.site} SITE
                </text>
              </g>
            );
          })}
        </g>
      </svg>

      <div className="legend">
        <b>Legend — link type</b>
        <div className="row"><span className="sw" style={{ borderColor: "#22c55e" }} /> PRI path (animated flow)</div>
        <div className="row"><span className="sw dash" style={{ borderColor: "#f59e0b" }} /> SEC / backup path</div>
        <div className="row"><span className="sw" style={{ borderColor: "#c084fc" }} /> RT ↔ Firewall</div>
        <div className="row"><span className="sw" style={{ borderColor: "#22d3ee" }} /> NDC ↔ DC core (L3 OSPF)</div>
        <div className="row"><span className="sw dash" style={{ borderColor: "#94a3b8" }} /> WAN1 ↔ WAN2 (L2)</div>
        <div className="row" style={{ color: "#8ea3c7", marginTop: 6 }}>প্রতিটা link-এ VLAN number লেখা আছে।</div>
      </div>

      <div className="howto">
        <b>📖 কীভাবে পড়বেন?</b>
        <br />
        ①→⑤ বাম থেকে ডানে packet-এর যাত্রা।<br />
        <b>Scroll</b> = cursor-এর জায়গায় zoom (page scroll হবে না)।<br />
        <b>Drag</b> = pan, <b>Fit</b> = পুরো diagram screen-এ।<br />
        <b>Link-এ hover</b> → label দেখাবে, <b>click</b> → detail।
      </div>
    </div>
  );
}
