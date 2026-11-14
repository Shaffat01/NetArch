import React, { useEffect, useMemo, useRef, useState } from "react";
import { api } from "./api.js";
import TopologyDiagram from "./components/TopologyDiagram.jsx";
import DevicePanel from "./components/DevicePanel.jsx";
import LinkPanel from "./components/LinkPanel.jsx";

const ISP_COLOR = { adn: "#38bdf8", agni: "#a78bfa", bracnet: "#fb923c", metro: "#2dd4bf" };

function flowLinkIds(flow) {
  const s = flow.site.toLowerCase(); // ndc / dc
  const p = flow.pri ? "pri" : "sec";
  const wanRt = p === "pri" ? `${s}-wan1-rt1` : `${s}-wan2-rt1`;
  const rtFw = p === "pri" ? `${s}-rt1-fw1` : `${s}-rt2-fw2`;
  const fwCore = p === "pri" ? `${s}-fw1-core` : `${s}-fw2-core`;
  return [`${s}-${flow.isp}-${p}`, wanRt, rtFw, fwCore];
}

function Walkthrough({ flow, data, onClose }) {
  const steps = useMemo(() => {
    const s = flow.site.toLowerCase();
    const isPri = !!flow.pri;
    const wanSw = data.devices.find((d) => d.hostname === (flow.pri?.wanSw || flow.sec?.wanSw));
    const rt = data.devices.find((d) => d.site === flow.site && d.role.includes("Core Router") && (isPri ? !d.role.includes("SEC") : d.role.includes("SEC")));
    const fw = data.devices.find((d) => d.site === flow.site && d.role.includes("Firewall") && (isPri ? d.role.includes("PRI") : d.role.includes("SEC")));
    const core = data.devices.find((d) => d.site === flow.site && d.role.includes("Core Switch"));
    const f = isPri ? flow.pri : flow.sec;
    return [
      { n: 1, c: ISP_COLOR[flow.isp], t: `${flow.isp.toUpperCase()} ISP handoff`, d: `${isPri ? "PRI" : "SEC"} link — VLAN ${f.vlans.join(", ")}`, code: f.path },
      { n: 2, c: "#22c55e", t: wanSw ? wanSw.hostname : "WAN SW", d: `L2 trunk — VLAN tag নিয়ে RT-র দিকে পাঠায়। Routing করে না।`, code: f.wanSw },
      { n: 3, c: "#3b82f6", t: rt ? rt.hostname : "Core RT", d: `Subinterface ${f.rtInt} দিয়ে VLAN terminate → BGP/NAT → FW-এর দিকে।`, code: f.rtInt },
      { n: 4, c: "#c084fc", t: fw ? fw.hostname : "Firewall", d: `RT-FW VLAN (${flow.site === "NDC" ? "1680" : "1626"}) দিয়ে WAN side → Core-FW VLAN (${flow.site === "NDC" ? "1688" : "1628"}) দিয়ে Core side। Stateful inspection।`, code: "Eth1/1 → Eth1/2" },
      { n: 5, c: "#22d3ee", t: core ? core.hostname : "Core SW", d: `LAN core — default route FW-এর দিকে, Po5 OSPF দিয়ে অন্য site-এ।`, code: core ? core.mgmtIp : "" },
    ];
  }, [flow, data]);

  return (
    <div className="walkthrough">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h3>
          🚶 Packet Walkthrough — <span style={{ color: ISP_COLOR[flow.isp] }}>{flow.isp.toUpperCase()}</span> {flow.site} •{" "}
          <span className={`tag ${flow.pri ? "pri" : "sec"}`}>{flow.pri ? "PRI" : "SEC"} PATH</span>
        </h3>
        <button className="btn ghost" onClick={onClose}>✕ Highlight বন্ধ</button>
      </div>
      <div className="wt-steps">
        {steps.map((st) => (
          <div key={st.n} className="wt-step">
            <span className="n" style={{ background: st.c }}>{st.n}</span>
            <b>{st.t}</b>
            <div>{st.d}</div>
            <div><code>{st.code}</code></div>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 10 }}>
        উপরের diagram-এ এই path-এর 4টা link highlight করা হয়েছে। RT-02/FW02 হলো mirror path (একই structure) — diagram-এ দেখুন।
      </div>
    </div>
  );
}

export default function App() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [site, setSite] = useState("ALL");
  const [selectedDeviceId, setSelectedDeviceId] = useState(null);
  const [selectedLinkId, setSelectedLinkId] = useState(null);
  const [deviceDetail, setDeviceDetail] = useState(null);
  const [vlanFilter, setVlanFilter] = useState(null);
  const [ispFilter, setIspFilter] = useState("ALL");
  const [pathFilter, setPathFilter] = useState("ALL");
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState(null);
  const [view, setView] = useState("diagram"); // diagram | vlans | routes | audit
  const [activeFlow, setActiveFlow] = useState(null); // {flow, path: 'pri'|'sec'}
  const diagramRef = useRef(null);

  useEffect(() => {
    api.topology().then(setData).catch((e) => setError(String(e)));
  }, []);

  useEffect(() => {
    if (!selectedDeviceId) {
      setDeviceDetail(null);
      return;
    }
    api.device(selectedDeviceId).then(setDeviceDetail).catch(() => setDeviceDetail(null));
  }, [selectedDeviceId]);

  useEffect(() => {
    if (!query.trim()) {
      setSearchResults(null);
      return;
    }
    const t = setTimeout(() => {
      api.search(query).then(setSearchResults).catch(() => setSearchResults(null));
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  const selectedLink = useMemo(
    () => (data ? data.links.find((l) => l.id === selectedLinkId) || null : null),
    [data, selectedLinkId]
  );

  const highlightPath = useMemo(() => {
    if (!activeFlow) return null;
    const f = { ...activeFlow.flow, pri: activeFlow.path === "pri" ? activeFlow.flow.pri : null, sec: activeFlow.path === "sec" ? activeFlow.flow.sec : null };
    return flowLinkIds(f);
  }, [activeFlow]);

  const allVlans = useMemo(() => {
    if (!data) return [];
    const m = new Map();
    for (const d of data.devices) for (const v of d.vlans || []) {
      const k = `${d.site}-${v.id}`;
      if (!m.has(k)) m.set(k, { id: v.id, name: v.name, site: d.site, isp: v.isp, path: v.path, devices: [] });
      m.get(k).devices.push(d.hostname);
    }
    return [...m.values()].sort((a, b) => a.site.localeCompare(b.site) || a.id - b.id);
  }, [data]);

  const allRoutes = useMemo(() => {
    if (!data) return [];
    const out = [];
    for (const d of data.devices) for (const r of d.routes || []) out.push({ device: d.hostname, site: d.site, ...r });
    return out;
  }, [data]);

  const selectDevice = (id) => {
    setSelectedDeviceId(id);
    setSelectedLinkId(null);
    setActiveFlow(null);
  };
  const selectLink = (id) => {
    setSelectedLinkId(id);
    setSelectedDeviceId(null);
    setActiveFlow(null);
  };
  const clearSelection = () => {
    setSelectedDeviceId(null);
    setSelectedLinkId(null);
    setActiveFlow(null);
  };
  const showFlow = (flow, path) => {
    setActiveFlow({ flow, path });
    setSelectedDeviceId(null);
    setSelectedLinkId(null);
    setView("diagram");
    setTimeout(() => diagramRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 100);
  };

  if (error) return <div style={{ padding: 24 }}>API error: {error}<br />Server চলছে তো? <code>npm run server</code></div>;
  if (!data) return <div style={{ padding: 24 }}>Loading topology…</div>;

  const showPanel = selectedDeviceId || selectedLinkId;
  const totalVlans = allVlans.length;

  return (
    <div>
      {/* ---------- header ---------- */}
      <header className="topbar">
        <div>
          <h1>🌐 Walton WAN — Network Topology GUI</h1>
          <div className="sub">ISP → WAN Switch → Core Router → Firewall → Core SW • Node.js + React • Config থেকে extract করা</div>
        </div>
        <div className="spacer" />
        <input
          className="search"
          placeholder="Search: hostname, interface, VLAN… (যেমন 181, Ten0/0/0, FW)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="seg">
          {["ALL", "NDC", "DC"].map((s) => (
            <button key={s} className={site === s ? "active" : ""} onClick={() => setSite(s)}>
              {s === "ALL" ? "All Sites" : s}
            </button>
          ))}
        </div>
        <div className="seg">
          {["ALL", "PRI", "SEC"].map((p) => (
            <button key={p} className={pathFilter === p ? "active" : ""} onClick={() => setPathFilter(p)}>
              {p}
            </button>
          ))}
        </div>
      </header>

      {/* ---------- stats + flow steps ---------- */}
      <div className="statsbar">
        <div className="stat"><b>{data.devices.length}</b>Devices</div>
        <div className="stat"><b>{data.links.length}</b>Links</div>
        <div className="stat"><b>{totalVlans}</b>VLANs (site-wise)</div>
        <div className="stat"><b>{data.isps.length}</b>ISPs</div>
        <div className="stat"><b>AS 59209</b>BGP</div>
        <div className="flowsteps">
          {[
            ["1", "ISP", "#38bdf8"],
            ["2", "WAN SW (L2)", "#22c55e"],
            ["3", "Core RT (L3/BGP)", "#3b82f6"],
            ["4", "Firewall", "#c084fc"],
            ["5", "Core SW (LAN)", "#22d3ee"],
          ].map(([n, t, c], i) => (
            <React.Fragment key={n}>
              {i > 0 && <span className="flowarrow">→</span>}
              <span className="flowstep"><span className="num" style={{ background: c }}>{n}</span>{t}</span>
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* ---------- search results ---------- */}
      {searchResults && (
        <div style={{ padding: "10px 18px", background: "var(--bg2)", borderBottom: "1px solid var(--border)" }}>
          <b style={{ fontSize: 13 }}>Search results:</b>{" "}
          {searchResults.devices.length === 0 && searchResults.vlans.length === 0 && searchResults.links.length === 0 && (
            <span style={{ color: "var(--muted)" }}>কিছু পাওয়া যায়নি</span>
          )}
          <div className="search-results" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
            {searchResults.devices.map((d) => (
              <span key={d.id} className="chip" onClick={() => selectDevice(d.id)}>📦 {d.hostname} ({d.site})</span>
            ))}
            {searchResults.vlans.map((v, i) => (
              <span key={i} className="chip" onClick={() => setVlanFilter(v.id)}>VLAN {v.id} — {v.name} ({v.device})</span>
            ))}
            {searchResults.links.map((l) => (
              <span key={l.id} className="chip" onClick={() => selectLink(l.id)}>🔗 {l.label}</span>
            ))}
          </div>
        </div>
      )}

      {/* ---------- view tabs ---------- */}
      <div className="viewtabs">
        {[
          ["diagram", "🗺️ Topology Diagram"],
          ["vlans", "🏷️ VLAN Matrix"],
          ["routes", "🛣️ All Routes"],
          ["audit", "✅ Audit Report"],
        ].map(([k, t]) => (
          <button key={k} className={view === k ? "active" : ""} onClick={() => setView(k)}>{t}</button>
        ))}
      </div>

      {/* ---------- DIAGRAM VIEW ---------- */}
      {view === "diagram" && (
        <>
          {activeFlow && (
            <Walkthrough
              flow={{ ...activeFlow.flow, pri: activeFlow.path === "pri" ? activeFlow.flow.pri : null, sec: activeFlow.path === "sec" ? activeFlow.flow.sec : null }}
              data={data}
              onClose={() => setActiveFlow(null)}
            />
          )}
          <div className={`layout ${showPanel ? "" : "no-panel"}`} ref={diagramRef}>
            <aside className="sidebar">
              <div className="side-title">Devices — click করলে detail</div>
              {["NDC", "DC"].map((s) => (
                <div key={s}>
                  <div className="side-title">{s} Site</div>
                  {data.devices
                    .filter((d) => d.site === s)
                    .map((d) => (
                      <button
                        key={d.id}
                        className={`dev-item ${selectedDeviceId === d.id ? "selected" : ""}`}
                        onClick={() => selectDevice(d.id)}
                      >
                        <span className="dot" style={{ background: d.role.includes("WAN") ? "#22c55e" : d.role.includes("Router") ? "#38bdf8" : d.role.includes("Firewall") ? "#c084fc" : "#22d3ee", color: d.role.includes("WAN") ? "#22c55e" : d.role.includes("Router") ? "#38bdf8" : d.role.includes("Firewall") ? "#c084fc" : "#22d3ee" }} />
                        <span>
                          {d.hostname}
                          <small>{d.role}</small>
                        </span>
                      </button>
                    ))}
                </div>
              ))}

              <div className="side-title">ISP filter</div>
              <div>
                <span className={`chip ${ispFilter === "ALL" ? "active" : ""}`} onClick={() => setIspFilter("ALL")}>All ISP</span>
                {data.isps.map((i) => (
                  <span
                    key={i.id}
                    className={`chip ${ispFilter === i.id ? "active" : ""}`}
                    style={ispFilter === i.id ? {} : { borderColor: ISP_COLOR[i.id] }}
                    onClick={() => setIspFilter(ispFilter === i.id ? "ALL" : i.id)}
                  >
                    {i.name}
                  </span>
                ))}
              </div>

              <div className="side-title">VLAN filter — link highlight</div>
              <div>
                {vlanFilter !== null && (
                  <span className="chip active" onClick={() => setVlanFilter(null)}>✕ VLAN {vlanFilter} clear</span>
                )}
                {allVlans.map((v) => (
                  <span
                    key={`${v.site}-${v.id}`}
                    className={`chip ${vlanFilter === v.id ? "active" : ""}`}
                    title={`${v.site} — ${v.name}`}
                    onClick={() => setVlanFilter(vlanFilter === v.id ? null : v.id)}
                  >
                    {v.site}·{v.id}
                  </span>
                ))}
              </div>

              <div className="side-title">ISP info</div>
              {data.isps.map((i) => (
                <div key={i.id} className="note-box" style={{ marginBottom: 8, borderLeftColor: ISP_COLOR[i.id] }}>
                  <b style={{ color: ISP_COLOR[i.id] }}>{i.name}</b>
                  <div style={{ fontSize: 12, marginTop: 4 }}>{i.description}</div>
                  <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>NAT/Loopback: {i.natLoopback}</div>
                </div>
              ))}
            </aside>

            <TopologyDiagram
              devices={data.devices}
              ispNodes={data.ispNodes}
              links={data.links}
              selectedDeviceId={selectedDeviceId}
              selectedLinkId={selectedLinkId}
              onSelectDevice={selectDevice}
              onSelectLink={selectLink}
              siteFilter={site}
              vlanFilter={vlanFilter}
              ispFilter={ispFilter}
              pathFilter={pathFilter}
              highlightPath={highlightPath}
            />

            {showPanel && (
              <aside className="panel">
                {selectedDeviceId && deviceDetail && (
                  <DevicePanel device={deviceDetail} onClose={clearSelection} onSelectLink={selectLink} onSelectDevice={selectDevice} />
                )}
                {selectedDeviceId && !deviceDetail && <div>Loading device…</div>}
                {selectedLink && (
                  <LinkPanel link={selectedLink} devices={data.devices} ispNodes={data.ispNodes} onClose={clearSelection} onSelectDevice={selectDevice} />
                )}
              </aside>
            )}
          </div>
        </>
      )}

      {/* ---------- VLAN MATRIX VIEW ---------- */}
      {view === "vlans" && (
        <div className="matrix-wrap">
          <h2 style={{ fontSize: 16, margin: "14px 0 4px" }}>🏷️ VLAN Matrix — কোন VLAN কোন ISP, কোন path, কোন device-এ</h2>
          <p style={{ color: "var(--muted)", fontSize: 13, margin: "0 0 12px" }}>
            NDC আর DC-তে VLAN numbering আলাদা — একই ISP-র NDC VLAN DC-তে অন্য number। VLAN chip-এ click করলে diagram-এ সেই VLAN-এর link highlight হবে।
          </p>
          <table className="tbl">
            <thead><tr><th>Site</th><th>VLAN</th><th>Name</th><th>ISP</th><th>Path</th><th>Devices</th></tr></thead>
            <tbody>
              {allVlans.map((v, i) => (
                <tr key={i}>
                  <td><b>{v.site}</b></td>
                  <td><span className="chip" onClick={() => { setVlanFilter(v.id); setView("diagram"); }}>{v.id}</span></td>
                  <td>{v.name}</td>
                  <td>{v.isp ? <span style={{ color: ISP_COLOR[v.isp], fontWeight: 700 }}>{v.isp.toUpperCase()}</span> : "—"}</td>
                  <td>{v.path ? <span className={`tag ${v.path === "PRI" ? "pri" : "sec"}`}>{v.path}</span> : "—"}</td>
                  <td style={{ whiteSpace: "normal" }}>{[...new Set(v.devices)].join(", ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ---------- ROUTES VIEW ---------- */}
      {view === "routes" && (
        <div className="matrix-wrap">
          <h2 style={{ fontSize: 16, margin: "14px 0 4px" }}>🛣️ All Routes — সব device-এর static route একসাথে</h2>
          <p style={{ color: "var(--muted)", fontSize: 13, margin: "0 0 12px" }}>
            WAN SW-এ শুধু Mgmt-vrf route (L2 switch)। Core RT-এ ISP host route + Null0 NAT/BGP route + BGP neighbor। Core SW-এ default route FW-এর দিকে।
          </p>
          <table className="tbl">
            <thead><tr><th>Device</th><th>Site</th><th>Destination</th><th>Next-hop / Via</th><th>Note</th></tr></thead>
            <tbody>
              {allRoutes.map((r, i) => (
                <tr key={i}>
                  <td><b>{r.device}</b></td>
                  <td>{r.site}</td>
                  <td><b>{r.dest}</b>{r.ad ? <><br /><small>AD {r.ad}</small></> : null}{r.vrf ? <><br /><small>VRF {r.vrf}</small></> : null}</td>
                  <td>{r.via}</td>
                  <td style={{ whiteSpace: "normal" }}>{r.note || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ---------- AUDIT VIEW ---------- */}
      {view === "audit" && (
        <div style={{ padding: "14px 18px 22px", background: "var(--bg2)" }}>
          <h2 style={{ fontSize: 16, margin: "0 0 4px" }}>✅ Audit Report — config-এর সাথে মিলিয়ে যাচাই</h2>
          <p style={{ color: "var(--muted)", fontSize: 13, margin: "0 0 14px" }}>
            Google Docs-এর 10টা config tab আবার পড়ে প্রতিটা link/route/VLAN যাচাই করা হয়েছে।
          </p>
          <ul className="audit-list">
            {(data.meta.audit || []).map((a, i) => <li key={i}>{a}</li>)}
          </ul>
          <div className="note-box" style={{ marginTop: 14 }}>
            <b>Traffic direction:</b> Diagram বাম→ডানে topology দেখায় (ISP → Core)। কিন্তু Internet-bound packet আসলে উল্টো দিকে যায়:
            <b> Core SW → FW (default route) → Core RT → WAN SW → ISP</b>। Inbound (ISP → LAN) যায় বাম→ডানে।
          </div>
        </div>
      )}

      {/* ---------- PRI/SEC flows ---------- */}
      <section className="section">
        <h2>🔀 PRI vs SEC — প্রতিটা ISP-র দুই path (কেন, কীভাবে failover হয়)</h2>
        <p className="lead">Flow card-এ <b>"Path দেখুন"</b> click করলে diagram-এ পুরো path highlight হয়ে step-by-step walkthrough দেখাবে।</p>
        <div className="flow-grid">
          {data.priSecFlows.map((f, i) => (
            <div key={i} className={`flow-card ${activeFlow?.flow === f ? "active" : ""}`}>
              <h3>
                <span style={{ color: ISP_COLOR[f.isp] }}>{f.isp.toUpperCase()}</span> — {f.site} Site
              </h3>
              <div className="path"><span className="tag pri">PRI</span> {f.pri.path}</div>
              <div className="path"><span className="tag sec">SEC</span> {f.sec.path}</div>
              <div className="why">{f.why}</div>
              <div className="actions">
                <button className="btn" onClick={() => showFlow(f, "pri")}>▶ PRI Path দেখুন</button>
                <button className="btn ghost" onClick={() => showFlow(f, "sec")}>▶ SEC Path দেখুন</button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ---------- explanations ---------- */}
      <section className="section">
        <h2>📖 Architecture ব্যাখ্যা — সহজ ভাষায়</h2>
        <div className="explain-grid">
          {data.explanations.map((e, i) => (
            <div key={i} className="explain-card">
              <h3>{e.title}</h3>
              <p>{e.body}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="footer">
        Source: Google Docs configs (NDC/DC WAN SW, Core RT, Core SW — 10 tabs) থেকে extract করা। Firewall node-গুলো config-এর interface description থেকে inferred (doc-এ FW config tab নেই)।
        API: <code>GET /api/topology</code>, <code>/api/devices/:id</code>, <code>/api/vlans</code>, <code>/api/routes</code>, <code>/api/search</code> — সব Node.js (Express) backend থেকে serve হয়।
      </footer>
    </div>
  );
}
