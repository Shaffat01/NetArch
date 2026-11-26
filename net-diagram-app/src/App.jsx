import React, { useState, useEffect, useCallback, useMemo } from 'react';
import ReactFlow, {
  Controls,
  Background,
  applyNodeChanges,
  applyEdgeChanges,
  Handle,
  Position,
} from 'reactflow';
import 'reactflow/dist/style.css';

const API_BASE = 'http://127.0.0.1:8000/api';

// ================= CUSTOM DEVICE NODE COMPONENT =================
const CustomDeviceNode = ({ data, selected }) => {
  const getDeviceBadge = () => {
    switch (data.deviceType) {
      case 'router':
        return { label: 'ROUTER', bg: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40' };
      case 'switch':
        return { label: 'SWITCH', bg: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/40' };
      case 'isp':
        return { label: 'ISP', bg: 'bg-amber-500/20 text-amber-400 border-amber-500/40' };
      default:
        return { label: 'DEVICE', bg: 'bg-blue-500/20 text-blue-400 border-blue-500/40' };
    }
  };

  const badge = getDeviceBadge();
  const displayIp = data.ip || data.mgmtIp || (data.details?.management?.ip) || 'N/A';

  return (
    <div
      className={`relative min-w-[210px] rounded-xl border p-3.5 transition-all duration-200 backdrop-blur-md shadow-2xl ${
        selected
          ? 'border-cyan-400 bg-slate-900/95 ring-2 ring-cyan-400/50 shadow-cyan-500/20'
          : 'border-slate-700/80 bg-slate-900/85 hover:border-slate-500'
      }`}
    >
      {/* React Flow Handles */}
      <Handle type="target" position={Position.Top} className="!w-3 !h-3 !bg-cyan-400 !border-2 !border-slate-900" />
      <Handle type="source" position={Position.Bottom} className="!w-3 !h-3 !bg-cyan-400 !border-2 !border-slate-900" />
      <Handle type="target" position={Position.Left} id="left" className="!w-3 !h-3 !bg-purple-400 !border-2 !border-slate-900" />
      <Handle type="source" position={Position.Right} id="right" className="!w-3 !h-3 !bg-purple-400 !border-2 !border-slate-900" />

      {/* Top Header */}
      <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-2 mb-2">
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase tracking-wider ${badge.bg}`}>
          {badge.label}
        </span>
        <div className="flex items-center gap-1.5">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span className="text-[10px] font-mono text-emerald-400 uppercase">LIVE</span>
        </div>
      </div>

      {/* Hostname & Role */}
      <div className="font-bold text-slate-100 text-sm tracking-tight truncate">
        {data.hostname || data.label}
      </div>
      <div className="text-[11px] text-slate-400 truncate mb-2">
        {data.role || data.model || 'Enterprise Node'}
      </div>

      {/* Quick Specs Box */}
      <div className="bg-slate-950/70 rounded-lg p-2 border border-slate-800/80 text-[11px] font-mono space-y-1">
        <div className="flex justify-between text-slate-300">
          <span className="text-slate-500">IP:</span>
          <span className="text-cyan-300 font-semibold truncate max-w-[125px]">{displayIp}</span>
        </div>
        {data.bgpAs && (
          <div className="flex justify-between text-slate-300">
            <span className="text-slate-500">BGP:</span>
            <span className="text-amber-300 font-semibold">{data.bgpAs}</span>
          </div>
        )}
      </div>
    </div>
  );
};

// ================= MAIN APPLICATION =================
export default function App() {
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [selectedNode, setSelectedNode] = useState(null);
  const [activeTab, setActiveTab] = useState('interfaces');
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState('');

  const nodeTypes = useMemo(() => ({ customDevice: CustomDeviceNode }), []);

  // Fetch Topology
  const fetchTopology = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/topology`);
      const data = await res.json();
      if (data && data.nodes) {
        setNodes(data.nodes);
        setEdges(data.edges || []);
      }
    } catch (err) {
      console.error('Error fetching topology:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTopology();
  }, [fetchTopology]);

  // Save Layout
  const saveLayout = async () => {
    try {
      setSaveStatus('Saving...');
      const res = await fetch(`${API_BASE}/topology/layout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nodes, edges, viewport: { x: 50, y: 20, zoom: 0.85 } })
      });
      if (res.ok) {
        setSaveStatus('Saved!');
        setTimeout(() => setSaveStatus(''), 2500);
      }
    } catch (err) {
      setSaveStatus('Failed');
    }
  };

  const onNodesChange = useCallback((changes) => setNodes((nds) => applyNodeChanges(changes, nds)), []);
  const onEdgesChange = useCallback((changes) => setEdges((eds) => applyEdgeChanges(changes, eds)), []);

  const onNodeClick = useCallback((_, node) => {
    setSelectedNode(node);
    setActiveTab('interfaces');
  }, []);

  // Search Filter
  const filteredNodes = useMemo(() => {
    if (!searchTerm.trim()) return nodes;
    const term = searchTerm.toLowerCase();
    return nodes.map((node) => {
      const match =
        node.data.hostname?.toLowerCase().includes(term) ||
        node.data.label?.toLowerCase().includes(term) ||
        node.data.ip?.toLowerCase().includes(term) ||
        node.data.mgmtIp?.toLowerCase().includes(term);
      return {
        ...node,
        style: match
          ? { filter: 'drop-shadow(0 0 16px rgba(34, 211, 238, 0.8))' }
          : { opacity: 0.3 }
      };
    });
  }, [nodes, searchTerm]);

  return (
    <div className="flex h-screen w-screen bg-[#070b14] text-slate-100 overflow-hidden font-sans">
      {/* Main Canvas Area */}
      <div className="relative flex-1 h-full">
        {/* Top Navbar */}
        <div className="absolute top-4 left-4 right-4 z-20 flex items-center justify-between pointer-events-none">
          <div className="flex items-center gap-3 bg-slate-900/90 border border-slate-800 backdrop-blur-md px-4 py-2.5 rounded-xl shadow-2xl pointer-events-auto">
            <div className="h-3 w-3 rounded-full bg-cyan-400 animate-pulse" />
            <div>
              <h1 className="text-sm font-bold text-slate-100 tracking-wide uppercase">
                NETARCH NOC TOPOLOGY <span className="text-cyan-400 font-mono text-xs">DC & DR</span>
              </h1>
              <p className="text-[10px] text-slate-400">Walton Enterprise Core Network Architecture</p>
            </div>
          </div>

          <div className="flex items-center gap-3 pointer-events-auto">
            {/* Search Input */}
            <div className="relative">
              <input
                type="text"
                placeholder="Search Hostname, IP, VLAN..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-72 bg-slate-900/90 border border-slate-700/80 rounded-xl px-3.5 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-400 backdrop-blur-md"
              />
            </div>

            <button
              onClick={fetchTopology}
              className="bg-slate-900/90 hover:bg-slate-800 border border-slate-700 text-slate-300 p-2 rounded-xl text-xs backdrop-blur-md"
              title="Refresh Topology"
            >
              🔄
            </button>

            <button
              onClick={saveLayout}
              className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold px-4 py-2 rounded-xl text-xs transition-all shadow-lg shadow-cyan-500/20"
            >
              {saveStatus || '💾 Save Layout'}
            </button>
          </div>
        </div>

        {/* React Flow Canvas */}
        <ReactFlow
          nodes={filteredNodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={onNodeClick}
          nodeTypes={nodeTypes}
          defaultViewport={{ x: 50, y: 20, zoom: 0.85 }}
          minZoom={0.2}
          maxZoom={2}
          className="bg-[#070b14]"
        >
          <Background color="#1e293b" gap={20} size={1} />
          <Controls className="!bg-slate-900 !border-slate-800 !rounded-xl !overflow-hidden !shadow-2xl" />
        </ReactFlow>
      </div>

      {/* ================= RIGHT DEEP INSPECTION DRAWER ================= */}
      {selectedNode && (
        <div className="w-[520px] bg-slate-950/95 border-l border-slate-800/90 h-full flex flex-col z-30 shadow-2xl backdrop-blur-xl animate-in slide-in-from-right duration-300">
          {/* Drawer Header */}
          <div className="p-5 border-b border-slate-800 flex items-start justify-between bg-slate-900/60">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 uppercase">
                  {selectedNode.data.deviceType}
                </span>
                <span className="text-xs font-mono text-emerald-400">● ONLINE</span>
              </div>
              <h2 className="text-xl font-black text-slate-100 tracking-tight">
                {selectedNode.data.hostname || selectedNode.data.label}
              </h2>
              <p className="text-xs text-slate-400">
                {selectedNode.data.model || 'Network Device'} • {selectedNode.data.os || 'IOS-XE'}
              </p>
            </div>
            <button
              onClick={() => setSelectedNode(null)}
              className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
            >
              ✕
            </button>
          </div>

          {/* Quick Info Grid */}
          <div className="grid grid-cols-2 gap-2.5 p-4 bg-slate-900/30 border-b border-slate-800 text-xs font-mono">
            <div className="bg-slate-900/80 p-2.5 rounded-lg border border-slate-800">
              <span className="text-slate-500 block text-[10px] uppercase">Management IP</span>
              <span className="text-cyan-300 font-bold">{selectedNode.data.mgmtIp || selectedNode.data.ip || 'N/A'}</span>
              <span className="text-[10px] text-slate-500 block mt-0.5">VRF: {selectedNode.data.vrf || 'Mgmt-intf'}</span>
            </div>
            <div className="bg-slate-900/80 p-2.5 rounded-lg border border-slate-800">
              <span className="text-slate-500 block text-[10px] uppercase">Routing / AS</span>
              <span className="text-amber-300 font-bold">{selectedNode.data.bgpAs || 'Layer 2 Switching'}</span>
              <span className="text-[10px] text-slate-500 block mt-0.5">{selectedNode.data.ospfProcess || 'OSPF Disabled'}</span>
            </div>
            {selectedNode.data.serialNumber && (
              <div className="bg-slate-900/80 p-2.5 rounded-lg border border-slate-800 col-span-2 flex justify-between">
                <span className="text-slate-500 text-[10px]">SERIAL: <span className="text-slate-300 font-bold">{selectedNode.data.serialNumber}</span></span>
                <span className="text-slate-500 text-[10px]">TACACS+: <span className="text-slate-300 font-bold">{selectedNode.data.tacacsServer || '172.21.1.18'}</span></span>
              </div>
            )}
          </div>

          {/* Tab Navigation */}
          <div className="flex border-b border-slate-800 bg-slate-900/50 px-3 gap-1 overflow-x-auto text-xs">
            {['interfaces', 'bgp', 'vlans', 'tunnels', 'details'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`py-2.5 px-3 font-semibold uppercase tracking-wider text-[11px] border-b-2 transition-all whitespace-nowrap ${
                  activeTab === tab
                    ? 'border-cyan-400 text-cyan-400 bg-cyan-400/10'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Drawer Tab Contents */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs font-mono">
            {/* INTERFACES TAB */}
            {activeTab === 'interfaces' && (
              <div className="space-y-2">
                <div className="text-[11px] text-slate-400 font-sans font-bold uppercase tracking-wider mb-2">
                  Active Interfaces ({selectedNode.data.interfaces?.length || 0})
                </div>
                {selectedNode.data.interfaces && selectedNode.data.interfaces.length > 0 ? (
                  selectedNode.data.interfaces.map((intf, idx) => (
                    <div key={idx} className="bg-slate-900/70 p-3 rounded-lg border border-slate-800 hover:border-slate-700 space-y-1">
                      <div className="flex justify-between items-center">
                        <span className="text-cyan-300 font-bold">{intf.name}</span>
                        {intf.vlan && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
                            VLAN {intf.vlan}
                          </span>
                        )}
                        {intf.nat && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                            NAT {intf.nat}
                          </span>
                        )}
                      </div>
                      <div className="text-slate-200">{intf.ip || 'Unnumbered / Trunk Port'}</div>
                      <div className="text-[11px] text-slate-400 font-sans">{intf.description}</div>
                    </div>
                  ))
                ) : (
                  <div className="text-slate-500 p-4 text-center">No individual interfaces mapped.</div>
                )}
              </div>
            )}

            {/* BGP & ROUTING TAB */}
            {activeTab === 'bgp' && (
              <div className="space-y-3">
                <div className="text-[11px] text-slate-400 font-sans font-bold uppercase tracking-wider">
                  BGP Neighbors ({selectedNode.data.bgpNeighbors?.length || 0})
                </div>
                {selectedNode.data.bgpNeighbors?.map((peer, idx) => (
                  <div key={idx} className="bg-slate-900/70 p-3 rounded-lg border border-slate-800 space-y-1">
                    <div className="flex justify-between">
                      <span className="text-amber-300 font-bold">{peer.ip}</span>
                      <span className="text-slate-300 font-bold">AS {peer.as}</span>
                    </div>
                    <div className="text-slate-400 text-[11px] font-sans">{peer.desc}</div>
                  </div>
                ))}

                {selectedNode.data.ospfAreas && (
                  <div className="mt-4 space-y-2">
                    <div className="text-[11px] text-slate-400 font-sans font-bold uppercase tracking-wider">
                      OSPF Topology Areas
                    </div>
                    {selectedNode.data.ospfAreas.map((area, idx) => (
                      <div key={idx} className="bg-slate-900/70 p-2.5 rounded-lg border border-slate-800">
                        <div className="text-emerald-400 font-bold mb-1">{area.area}</div>
                        <div className="text-[11px] text-slate-400 space-y-0.5">
                          {area.networks.map((net, i) => (
                            <div key={i}>• {net}</div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* VLANS TAB */}
            {activeTab === 'vlans' && (
              <div className="space-y-2">
                <div className="text-[11px] text-slate-400 font-sans font-bold uppercase tracking-wider mb-2">
                  Configured VLANs ({selectedNode.data.vlans?.length || 0})
                </div>
                {selectedNode.data.vlans?.map((vlan, idx) => (
                  <div key={idx} className="bg-slate-900/70 p-3 rounded-lg border border-slate-800 space-y-1">
                    <div className="flex justify-between">
                      <span className="text-purple-300 font-bold">VLAN {vlan.id}</span>
                      <span className="text-slate-200">{vlan.name}</span>
                    </div>
                    <div className="text-[11px] text-slate-400">Ports: {vlan.ports}</div>
                  </div>
                ))}
              </div>
            )}

            {/* TUNNELS & DCI TAB */}
            {activeTab === 'tunnels' && (
              <div className="space-y-2">
                <div className="text-[11px] text-slate-400 font-sans font-bold uppercase tracking-wider mb-2">
                  DCI & Backbone GRE Tunnels
                </div>
                {selectedNode.data.dciTunnels?.map((tun, idx) => (
                  <div key={idx} className="bg-slate-900/70 p-2.5 rounded-lg border border-slate-800 text-cyan-300">
                    ⚡ {tun}
                  </div>
                ))}
              </div>
            )}

            {/* DETAILS TAB */}
            {activeTab === 'details' && (
              <div className="space-y-3 font-sans">
                <div className="bg-slate-900/70 p-3 rounded-lg border border-slate-800 space-y-2">
                  <div className="text-slate-400 font-bold uppercase text-[10px]">System Profile</div>
                  <div className="text-slate-300">Role: <span className="text-cyan-300">{selectedNode.data.role}</span></div>
                  <div className="text-slate-300">OS: <span className="text-slate-200">{selectedNode.data.os}</span></div>
                  <div className="text-slate-300">TACACS Server: <span className="text-slate-200">{selectedNode.data.tacacsServer || '172.21.1.18'}</span></div>
                  <div className="text-slate-300">NTP Server: <span className="text-slate-200">{selectedNode.data.ntpServer || '192.168.119.168'}</span></div>
                  <div className="text-slate-300">Syslog Server: <span className="text-slate-200">{selectedNode.data.syslogHost || '192.168.100.121'}</span></div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}