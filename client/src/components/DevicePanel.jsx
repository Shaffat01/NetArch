import React, { useState } from "react";

const TABS = ["Overview", "Interfaces", "VLANs", "Routes", "Connections", "PRI/SEC"];

function PathTag({ p }) {
  if (!p) return null;
  const cls = p === "PRI" ? "pri" : p === "SEC" ? "sec" : p === "RT-FW" || p === "Core-FW" ? "rtfw" : p === "CORE" ? "core" : "l2";
  return <span className={`tag ${cls}`}>{p}</span>;
}

function fmtVlans(v) {
  if (v === "ALL") return "ALL (trunk)";
  if (Array.isArray(v)) return v.join(", ");
  return String(v ?? "—");
}

export default function DevicePanel({ device, onClose, onSelectLink, onSelectDevice }) {
  const [tab, setTab] = useState("Overview");
  if (!device) return null;
  const d = device;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h2>{d.hostname}</h2>
          <div style={{ color: "var(--muted)", fontSize: 13 }}>
            {d.role} • Site: <b>{d.site}</b>
          </div>
        </div>
        <button className="btn ghost" onClick={onClose}>✕</button>
      </div>

      <div className="tabs">
        {TABS.map((t) => (
          <button key={t} className={tab === t ? "active" : ""} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </div>

      {tab === "Overview" && (
        <>
          <div className="meta-grid">
            <div className="cell"><small>Model</small><b>{d.model}</b></div>
            <div className="cell"><small>IOS</small><b>{d.ios}</b></div>
            <div className="cell"><small>Management IP</small><b>{d.mgmtIp}</b></div>
            <div className="cell"><small>Gateway</small><b>{d.gateway}</b></div>
          </div>
          <div className="note-box">{d.summary}</div>
          <h3>Routing</h3>
          <div className="note-box">{d.routing}</div>
          <h3>IP SLA / Tracking</h3>
          <div className="note-box">{d.tracking}</div>
        </>
      )}

      {tab === "Interfaces" && (
        <table className="tbl">
          <thead><tr><th>Interface</th><th>Description</th><th>Mode / IP</th><th>VLAN</th><th>Peer</th></tr></thead>
          <tbody>
            {(d.interfaces || []).map((i, idx) => (
              <tr key={idx}>
                <td><b>{i.name}</b> {i.path && <PathTag p={i.path} />}</td>
                <td>{i.desc}</td>
                <td>{i.mode}{i.ip ? <><br />{i.ip}</> : null}{i.vrf ? <><br />VRF: {i.vrf}</> : null}</td>
                <td>{fmtVlans(i.vlans)}</td>
                <td>{i.peer || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {tab === "VLANs" && (
        <table className="tbl">
          <thead><tr><th>VLAN</th><th>Name</th><th>ISP / Path</th></tr></thead>
          <tbody>
            {(d.vlans || []).map((v, idx) => (
              <tr key={idx}>
                <td><b>{v.id}</b></td>
                <td>{v.name}{v.note ? <><br /><small style={{ color: "var(--muted)" }}>{v.note}</small></> : null}</td>
                <td>{v.isp ? <span className="chip" style={{ cursor: "default" }}>{v.isp.toUpperCase()}</span> : "—"} {v.path && <PathTag p={v.path} />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {tab === "Routes" && (
        <>
          {d.bgpNeighbors && d.bgpNeighbors.length > 0 && (
            <>
              <h3 style={{ marginTop: 0 }}>BGP Neighbors — PRI preference weight দিয়ে</h3>
              <table className="tbl">
                <thead><tr><th>Neighbor</th><th>Description</th><th>AS / Weight</th><th>Path</th></tr></thead>
                <tbody>
                  {d.bgpNeighbors.map((b, idx) => (
                    <tr key={idx}>
                      <td><b>{b.neighbor}</b></td>
                      <td>{b.desc}{b.note ? <><br /><small style={{ color: "var(--muted)" }}>{b.note}</small></> : null}</td>
                      <td>AS {b.as}<br />Weight <b>{b.weight}</b></td>
                      <td><PathTag p={b.path} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="note-box" style={{ marginTop: 10 }}>
                BGP-তে <b>weight বেশি = best path</b>। ADN PRI (9000) &gt; SEC (8000), AGNI PRI (7000) &gt; SEC (6000) — তাই normally PRI দিয়ে traffic যায়, PRI down হলে SEC active হয়।
              </div>
              <h3>Static Routes</h3>
            </>
          )}
          <table className="tbl">
            <thead><tr><th>Destination</th><th>Next-hop / Via</th><th>Note</th></tr></thead>
            <tbody>
              {(d.routes || []).map((r, idx) => (
                <tr key={idx}>
                  <td><b>{r.dest}</b>{r.ad ? <><br /><small>AD {r.ad}</small></> : null}{r.vrf ? <><br /><small>VRF {r.vrf}</small></> : null}</td>
                  <td>{r.via}</td>
                  <td>{r.note || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {tab === "Connections" && (
        <>
          <p style={{ color: "var(--muted)", fontSize: 12 }}>এই device-এর সব connection — click করলে link detail দেখাবে:</p>
          {(d.links || []).map((l) => (
            <div key={l.id} className="conn-item" onClick={() => onSelectLink(l.id)}>
              <b>{l.label}</b> <PathTag p={l.path} />
              <div style={{ marginTop: 4 }}>
                {l.fromInt} ↔ {l.toInt}
                <br />
                <span style={{ color: "var(--muted)" }}>
                  {l.type} • VLAN: {fmtVlans(l.vlans)}
                  {l.peerDevice ? <> • Peer: <b>{l.peerDevice.hostname || l.peerDevice.name}</b></> : null}
                </span>
              </div>
            </div>
          ))}
        </>
      )}

      {tab === "PRI/SEC" && (
        <>
          <div className="note-box">
            <b>কেন PRI/SEC দুইটা path?</b>
            <br />
            PRI path = WAN-SW-01 → Core RT <b>Ten0/0/0</b> (PRI VLAN)। SEC path = WAN-SW-02 → Core RT <b>Ten0/0/1</b> (SEC VLAN)।
            আলাদা switch + আলাদা router port — একটা fail হলেও অন্যটা বাঁচে।
            <br /><br />
            <b>Failover কীভাবে হয়?</b>
            <br />
            Core RT-তে IP SLA probe (icmp-echo) প্রতিটা ISP subinterface দিয়ে যায়। Probe fail → Track down → PRI route withdraw → SEC route active।
            {d.tracking && d.tracking !== "—" ? <><br /><br /><b>এই device-এ:</b> {d.tracking}</> : null}
          </div>
          <h3>এই device-এর PRI/SEC interfaces</h3>
          <table className="tbl">
            <thead><tr><th>Interface</th><th>Path</th><th>Peer</th></tr></thead>
            <tbody>
              {(d.interfaces || []).filter((i) => i.path === "PRI" || i.path === "SEC").map((i, idx) => (
                <tr key={idx}><td><b>{i.name}</b></td><td><PathTag p={i.path} /></td><td>{i.peer || "—"}</td></tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
