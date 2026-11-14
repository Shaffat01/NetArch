import React from "react";

function fmtVlans(v) {
  if (v === "ALL") return "ALL";
  if (Array.isArray(v)) return v.join(", ");
  return String(v ?? "—");
}

export default function LinkPanel({ link, devices, ispNodes, onClose, onSelectDevice }) {
  if (!link) return null;
  const nameOf = (id) => {
    const d = devices.find((x) => x.id === id);
    if (d) return d.hostname;
    const n = ispNodes.find((x) => x.id === id);
    return n ? `${n.name} ISP` : id;
  };
  const pathCls = link.path === "PRI" ? "pri" : link.path === "SEC" ? "sec" : link.path === "CORE" ? "core" : link.path === "L2" ? "l2" : "rtfw";

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h2>{link.label}</h2>
          <span className={`tag ${pathCls}`}>{link.path} path</span>
          {link.isp && <span className="chip" style={{ cursor: "default" }}>{link.isp.toUpperCase()}</span>}
        </div>
        <button className="btn ghost" onClick={onClose}>✕</button>
      </div>

      <div className="meta-grid" style={{ marginTop: 14 }}>
        <div className="cell"><small>From</small><b>{nameOf(link.from)}</b></div>
        <div className="cell"><small>To</small><b>{nameOf(link.to)}</b></div>
        <div className="cell"><small>From interface</small><b>{link.fromInt}</b></div>
        <div className="cell"><small>To interface</small><b>{link.toInt}</b></div>
        <div className="cell"><small>Link type</small><b>{link.type}</b></div>
        <div className="cell"><small>VLAN carried</small><b>{fmtVlans(link.vlans)}</b></div>
      </div>

      {link.note && (
        <>
          <h3>ব্যাখ্যা</h3>
          <div className="note-box">{link.note}</div>
        </>
      )}

      <h3>দুই পাশের device-এ যান</h3>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {[link.from, link.to].map((id) => {
          const d = devices.find((x) => x.id === id);
          return d ? (
            <button key={id} className="btn" onClick={() => onSelectDevice(id)}>{d.hostname}</button>
          ) : (
            <span key={id} className="chip" style={{ cursor: "default" }}>{nameOf(id)}</span>
          );
        })}
      </div>

      <h3>এই link কোন VLAN বহন করে?</h3>
      <div>
        {Array.isArray(link.vlans) ? (
          link.vlans.map((v) => <span key={v} className="chip" style={{ cursor: "default" }}>VLAN {v}</span>)
        ) : (
          <span className="chip" style={{ cursor: "default" }}>ALL VLANs (trunk)</span>
        )}
      </div>
    </div>
  );
}
