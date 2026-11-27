import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import ReactFlow, {
  Controls,
  Background,
  BackgroundVariant,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  ReactFlowProvider,
  useReactFlow,
  MiniMap,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { toPng } from 'html-to-image';
import { jsPDF } from 'jspdf';
import {
  Save,
  RefreshCw,
  Download,
  FileImage,
  FileText,
  Plus,
  Search,
  X,
  Network,
  Shield,
  Cpu,
  Cloud,
  Server,
  Trash2,
  Wifi,
  Layers,
  Radio,
  Info,
  Zap,
  TrendingUp,
  Building2,
  LocateFixed,
  Database,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  Pencil,
  Globe,
  Route,
  Gauge,
  ArrowRightLeft,
  Eye,
  EyeOff,
  Star,
  AlertTriangle,
} from 'lucide-react';

import CustomDeviceNode from './components/CustomDeviceNode';

// ===================== SITE CONFIGURATION =====================
const SITES = {
  full: {
    id: 'full',
    label: 'Full Infra',
    fullName: 'Full Infrastructure — Triangle Core',
    color: 'emerald',
    accent: 'text-emerald-400',
    bgActive: 'bg-emerald-500 text-slate-950',
    bgInactive: 'bg-slate-800/80 text-slate-400 hover:bg-slate-700/80 hover:text-slate-200',
    borderActive: 'border-emerald-400',
    glowActive: 'shadow-emerald-500/40',
    description: 'DC ↔ NDC ↔ WMTC Full Topology',
  },
  dc: {
    id: 'dc',
    label: 'DC',
    fullName: 'Data Center — Kaliakair',
    color: 'cyan',
    accent: 'text-cyan-400',
    bgActive: 'bg-cyan-500 text-slate-950',
    bgInactive: 'bg-slate-800/80 text-slate-400 hover:bg-slate-700/80 hover:text-slate-200',
    borderActive: 'border-cyan-400',
    glowActive: 'shadow-cyan-500/40',
    description: 'Primary Production DC',
  },
  ndc: {
    id: 'ndc',
    label: 'NDC',
    fullName: 'Near Data Center — Chandra',
    color: 'violet',
    accent: 'text-violet-400',
    bgActive: 'bg-violet-500 text-white',
    bgInactive: 'bg-slate-800/80 text-slate-400 hover:bg-slate-700/80 hover:text-slate-200',
    borderActive: 'border-violet-400',
    glowActive: 'shadow-violet-500/40',
    description: 'Disaster Recovery / Secondary DC',
  },
};

// ===================== DEVICE PALETTE =====================
const DEVICE_PALETTE = [
  { type: 'ISP / Cloud', icon: Cloud, color: 'text-sky-400', desc: 'Upstream Provider' },
  { type: 'WAN Switch', icon: Network, color: 'text-cyan-400', desc: 'Aggregation Switch' },
  { type: 'Firewall', icon: Shield, color: 'text-rose-400', desc: 'Security Appliance' },
  { type: 'Core Router', icon: Cpu, color: 'text-amber-400', desc: 'BGP/OSPF Router' },
  { type: 'Core Switch', icon: Server, color: 'text-indigo-400', desc: 'Distribution Switch' },
];

// ===================== MAIN APP WRAPPER =====================
export default function App() {
  return (
    <ReactFlowProvider>
      <NetArchApp />
    </ReactFlowProvider>
  );
}

// ===================== MAIN APP =====================
function NetArchApp() {
  const reactFlowWrapper = useRef(null);
  const reactFlowInstance = useReactFlow();
  const { screenToFlowPosition, setViewport } = reactFlowInstance;
  // expose globally for toolbar zoom (simple hack)
  useEffect(() => { window.__rf = reactFlowInstance; }, [reactFlowInstance]);

  const [activeSite, setActiveSite] = useState('full');
  const [nodesBySite, setNodesBySite] = useState({ full: [], dc: [], ndc: [] });
  const [edgesBySite, setEdgesBySite] = useState({ full: [], dc: [], ndc: [] });
  const [viewportBySite, setViewportBySite] = useState({ full: null, dc: null, ndc: null });
  const [nameBySite, setNameBySite] = useState({ full: '', dc: '', ndc: '' });
  const [lastSavedBySite, setLastSavedBySite] = useState({ full: null, dc: null, ndc: null });

  const [selectedNode, setSelectedNode] = useState(null);
  const [selectedEdge, setSelectedEdge] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState('');
  const [showPalette, setShowPalette] = useState(false);
  // Toggle filter state
  const [hiddenCategories, setHiddenCategories] = useState(new Set());
  // Failure simulation
  const [failedLinks, setFailedLinks] = useState(new Set());
  const [failedNodes, setFailedNodes] = useState(new Set());
  const [simulationMode, setSimulationMode] = useState(false);
  // Traffic flow visualization & PBR panel
  const [showTrafficFlow, setShowTrafficFlow] = useState(false);
  const [showPbrPanel, setShowPbrPanel] = useState(false);

  const site = SITES[activeSite];
  const allNodes = nodesBySite[activeSite] || [];
  const allEdges = edgesBySite[activeSite] || [];

  // Apply filters + failure simulation to get visible nodes/edges
  const { nodes, edges } = useMemo(() => {
    const catHidden = hiddenCategories;
    const failL = failedLinks;
    const failN = failedNodes;
    const visibleEdges = allEdges.filter((e) => {
      const cat = e.data?.category;
      if (cat && catHidden.has(cat)) return false;
      if (failL.has(e.id)) return false;
      if (failN.has(e.source) || failN.has(e.target)) return false;
      return true;
    });
    // Keep a node visible if at least one edge connects to it, OR if it has no edges at all
    const connectedNodeIds = new Set();
    visibleEdges.forEach((e) => { connectedNodeIds.add(e.source); connectedNodeIds.add(e.target); });
    const searchLower = searchTerm.toLowerCase();
    const matchedEdgeNodeIds = new Set();
    if (searchTerm.trim()) {
      visibleEdges.forEach((e) => {
        if (e.label?.toLowerCase().includes(searchLower) || e.data?.protocol?.toLowerCase().includes(searchLower) || e.data?.ip?.includes(searchTerm)) {
          matchedEdgeNodeIds.add(e.source);
          matchedEdgeNodeIds.add(e.target);
        }
      });
    }
    const visibleNodes = allNodes.map((n) => {
      const isFailed = failN.has(n.id);
      const isMatched = searchTerm && (
        n.data?.hostname?.toLowerCase().includes(searchLower) ||
        n.data?.deviceType?.toLowerCase().includes(searchLower) ||
        n.data?.mgmtIp?.toLowerCase().includes(searchLower) ||
        n.data?.model?.toLowerCase().includes(searchLower) ||
        matchedEdgeNodeIds.has(n.id)
      );
      return {
        ...n,
        style: { ...(n.style || {}), opacity: isFailed ? 0.2 : 1 },
        className: [n.className || '', isMatched ? 'search-match-pulse' : ''].filter(Boolean).join(' '),
        data: { ...n.data, _failed: isFailed, _matched: !!isMatched },
      };
    });
    return { nodes: visibleNodes, edges: visibleEdges };
  }, [allNodes, allEdges, hiddenCategories, failedLinks, failedNodes, searchTerm]);

  // Detect backup paths that become active due to failure (triangle + ISP PBR failover)
  const { activeBackups, rerouteNote } = useMemo(() => {
    if (!simulationMode) return { activeBackups: new Set(), rerouteNote: null };
    const actives = new Set();
    const notes = [];

    // === Triangle core failover ===
    if (failedLinks.has('e-tri-dc-wmtc')) {
      actives.add('e-tri-ndc-wmtc');
      notes.push('★ WMTC-B1 reroutes via NDC-CORE (floating static AD 3)');
    }
    if (failedLinks.has('e-tri-dc-ndc') && !failedLinks.has('e-tri-dc-wmtc') && !failedLinks.has('e-tri-ndc-wmtc')) {
      notes.push('★ DC↔NDC down — inter-site traffic via WMTC-B1 (triangle)');
    }

    // === ISP PBR failover ===
    // Group ISP edges by (site, ispName, type) and find which are failed
    const ispEdges = allEdges.filter((e) => e.data?.ispName);
    // For each DC ISP primary link failure, find SEC backup or next-ISP failover
    const dcRt = allNodes.find((n) => n.id === 'dc-core-rt-01');
    const pbrPolicy = dcRt?.data?.pbrPolicy || [];

    // Build a map of edgeId -> isp metadata for quick lookup
    const ispEdgeMeta = {};
    ispEdges.forEach((e) => { ispEdgeMeta[e.id] = e.data; });

    // Track which "PBR groups" (INT) have their primary failed, activate backups in PBR order
    // PBR seq 10 = ADN_LAN_ACL: tries ADN-PRI → ADN-SEC → AGNI-PRI → AGNI-SEC → Brac
    const adnPriInt = ispEdges.find((e) => e.data.ispName === 'ADN Telecom' && e.data.priority === 'PRI' && e.source.startsWith('dc-'));
    const adnSecInt = ispEdges.find((e) => e.data.ispName === 'ADN Telecom' && e.data.priority === 'SEC' && e.source.startsWith('dc-'));
    const agniPriInt = ispEdges.find((e) => e.data.ispName === 'Agni Systems' && e.data.priority === 'PRI' && e.source.startsWith('dc-'));
    const agniSecInt = ispEdges.find((e) => e.data.ispName === 'Agni Systems' && e.data.priority === 'SEC' && e.source.startsWith('dc-'));
    const bracPriInt = ispEdges.find((e) => e.data.ispName === 'BracNet' && e.data.priority === 'PRI' && e.source.startsWith('dc-'));

    // AGNI INT-PRI failure (the primary internet link)
    if (agniPriInt && failedLinks.has(agniPriInt.id)) {
      if (agniSecInt && !failedLinks.has(agniSecInt.id)) {
        actives.add(agniSecInt.id);
        notes.push('★ AGNI-PRI down → PBR fails over to AGNI-SEC (weight 8500, track 40)');
      } else if (adnPriInt && !failedLinks.has(adnPriInt.id)) {
        actives.add(adnPriInt.id);
        notes.push('★ AGNI-PRI+SEC down → PBR cascades to ADN-PRI (weight 8000, track 10)');
      } else if (adnSecInt && !failedLinks.has(adnSecInt.id)) {
        actives.add(adnSecInt.id);
        notes.push('★ AGNI+ADN-PRI down → PBR cascades to ADN-SEC (track 20)');
      } else if (bracPriInt && !failedLinks.has(bracPriInt.id)) {
        actives.add(bracPriInt.id);
        notes.push('★ AGNI+ADN down → PBR falls back to BracNet (track 70)');
      }
    }
    // ADN INT-PRI failure — activate ADN-SEC for ADN-sourced subnets
    if (adnPriInt && failedLinks.has(adnPriInt.id)) {
      if (adnSecInt && !failedLinks.has(adnSecInt.id) && !actives.has(adnSecInt.id)) {
        actives.add(adnSecInt.id);
        notes.push('★ ADN-PRI down → ADN-SEC activates for ADN-NAT subnets (weight 7500, AS-prepend 2)');
      }
    }

    const note = notes.length > 0 ? notes.join(' | ') : null;
    return { activeBackups: actives, rerouteNote: note };
  }, [simulationMode, failedLinks, allEdges, allNodes]);

  // Edge styling for selection/failure/direction
  const styledEdges = useMemo(() => edges.map((e) => {
    const isSelected = selectedEdge?.id === e.id;
    const isFail = failedLinks.has(e.id);
    const isBackupActive = activeBackups.has(e.id);
    const cat = e.data?.category;
    const role = e.data?.role;
    const isIsp = !!e.data?.ispName;
    // ISP edge metadata
    const isp = e.data || {};
    const isPri = isp.priority === 'PRI';
    const isIspPrimary = isp.primary === true; // marked primary internet (AGNI)
    // Direction-aware animation
    const shouldAnimate = e.animated || isSelected || cat === 'bgp' || (cat === 'backbone' && !isFail) || isBackupActive
      || (showTrafficFlow && cat === 'isp') || (showTrafficFlow && cat === 'pbr') || (showTrafficFlow && cat === 'bgp');
    const flowClass = ((cat === 'backbone' || cat === 'bgp' || cat === 'l3dist') && !isFail) || isBackupActive
      || (showTrafficFlow && (cat === 'isp' || cat === 'pbr' || cat === 'bgp')) ? 'traffic-animated' : '';
    // Failure: dashed red low opacity
    const failStyle = isFail ? { stroke: '#ef4444', strokeDasharray: '3,6', opacity: 0.3 } : {};
    // Active backup: pulsing bright green
    const backupStyle = isBackupActive ? { stroke: '#22c55e', strokeWidth: 5, filter: 'drop-shadow(0 0 10px #22c55e)' } : {};
    // Traffic flow highlighting
    const flowHighlight = showTrafficFlow && !isFail ? { filter: 'drop-shadow(0 0 4px currentColor)' } : {};
    // Build edge label with ISP badges
    let edgeLabel = e.label;
    let labelStyle = e.labelStyle || {};
    let labelBgStyle = undefined;
    if (isIsp && !isFail) {
      const badge = isPri ? 'P' : 'S';
      const badgeColor = isp.ispColor || '#9ca3af';
      const star = isIspPrimary ? '★' : '';
      edgeLabel = `${star}${badge} ${isp.linkType || ''} ${edgeLabel ? '| ' + edgeLabel : ''}`;
      labelStyle = {
        ...labelStyle,
        fill: '#e2e8f0',
        fontSize: 9,
        fontWeight: 700,
        fontFamily: 'ui-monospace, monospace',
      };
      labelBgStyle = { fill: badgeColor + '33', fillOpacity: 0.9 };
    }
    return {
      ...e,
      label: edgeLabel,
      labelStyle,
      labelBgStyle,
      style: {
        ...(e.style || {}),
        ...(isSelected ? { stroke: '#fbbf24', strokeWidth: (e.style?.strokeWidth || 2) + 2, filter: 'drop-shadow(0 0 6px #fbbf24)' } : {}),
        ...failStyle,
        ...backupStyle,
        ...flowHighlight,
      },
      className: [e.className || '', flowClass, isFail ? 'edge-failed' : '', isBackupActive ? 'backup-active' : '', isIsp ? 'isp-edge' : '', isPri ? 'isp-pri' : 'isp-sec', isIspPrimary ? 'isp-primary-star' : ''].filter(Boolean).join(' '),
      animated: shouldAnimate && !isFail,
      markerEnd: cat === 'pbr' ? 'url(#arrow-rose)' : (role === 'backup' ? 'url(#arrow-amber)' : (role === 'primary' ? 'url(#arrow-emerald)' : (showTrafficFlow && cat === 'isp' ? 'url(#arrow-sky)' : undefined))),
    };
  }), [edges, selectedEdge, failedLinks, activeBackups, showTrafficFlow]);

  const nodeTypes = useMemo(() => ({ customDevice: CustomDeviceNode }), []);

  // Fetch topology for a specific site
  const fetchSiteTopology = useCallback(async (siteId) => {
    try {
      const res = await fetch(`/api/topology?site=${siteId}`);
      const data = await res.json();
      if (data) {
        setNodesBySite((prev) => ({ ...prev, [siteId]: data.nodes || [] }));
        setEdgesBySite((prev) => ({ ...prev, [siteId]: data.edges || [] }));
        setViewportBySite((prev) => ({ ...prev, [siteId]: data.viewport || null }));
        setNameBySite((prev) => ({ ...prev, [siteId]: data.name || '' }));
        setLastSavedBySite((prev) => ({ ...prev, [siteId]: data.updated_at || null }));
      }
    } catch (err) {
      console.error(`Error fetching ${siteId} topology:`, err);
    }
  }, []);

  // Fetch all sites on mount
  useEffect(() => {
    const loadAll = async () => {
      setLoading(true);
      await Promise.all([fetchSiteTopology('full'), fetchSiteTopology('dc'), fetchSiteTopology('ndc')]);
      setLoading(false);
    };
    loadAll();
  }, [fetchSiteTopology]);

  // When switching sites, clear selections
  useEffect(() => {
    setSelectedNode(null);
    setSelectedEdge(null);
    setSearchTerm('');
    setFailedLinks(new Set());
    setFailedNodes(new Set());
    setSimulationMode(false);
  }, [activeSite]);

  // Save layout for current site
  const saveLayout = async () => {
    try {
      setSaveStatus('saving');
      const currentNodes = nodesBySite[activeSite];
      const currentEdges = edgesBySite[activeSite];
      const res = await fetch('/api/topology/layout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          site: activeSite,
          nodes: currentNodes,
          edges: currentEdges,
          viewport: { x: 40, y: 10, zoom: 0.75 },
        }),
      });
      if (res.ok) {
        setSaveStatus('saved');
        setLastSavedBySite((prev) => ({ ...prev, [activeSite]: new Date().toISOString() }));
        setTimeout(() => setSaveStatus(''), 2500);
      } else {
        setSaveStatus('error');
        setTimeout(() => setSaveStatus(''), 2500);
      }
    } catch (err) {
      setSaveStatus('error');
      setTimeout(() => setSaveStatus(''), 2500);
    }
  };

  // Export as PNG
  const exportPNG = useCallback(() => {
    if (!reactFlowWrapper.current) return;
    toPng(reactFlowWrapper.current, {
      backgroundColor: '#070b14',
      quality: 1,
      pixelRatio: 2,
    }).then((dataUrl) => {
      const link = document.createElement('a');
      link.download = `netarch-${activeSite}-topology-${Date.now()}.png`;
      link.href = dataUrl;
      link.click();
    });
  }, [activeSite]);

  // Export as PDF
  const exportPDF = useCallback(() => {
    if (!reactFlowWrapper.current) return;
    toPng(reactFlowWrapper.current, {
      backgroundColor: '#070b14',
      quality: 1,
      pixelRatio: 2,
    }).then((dataUrl) => {
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'px', format: [1920, 1080] });
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      pdf.addImage(dataUrl, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`netarch-${activeSite}-topology-${Date.now()}.pdf`);
    });
  }, [activeSite]);

  // Add new device
  const addDevice = (deviceDef) => {
    const id = `${activeSite}-node-${Date.now()}`;
    const position = screenToFlowPosition({ x: 400, y: 300 });
    const newNode = {
      id,
      type: 'customDevice',
      position,
      data: {
        hostname: `NEW-${deviceDef.type.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8)}`,
        deviceType: deviceDef.type,
        site: activeSite.toUpperCase(),
        mgmtIP: '0.0.0.0',
        status: 'online',
        model: deviceDef.desc,
        osVersion: 'IOS-XE',
        interfaces: [],
        vlans: [],
        bgpNeighbors: [],
        ospfAreas: [],
        dciTunnels: [],
      },
    };
    setNodesBySite((prev) => ({ ...prev, [activeSite]: [...prev[activeSite], newNode] }));
    setShowPalette(false);
    setTimeout(() => setSelectedNode(newNode), 100);
  };

  // Delete selected node
  const deleteSelectedNode = () => {
    if (!selectedNode) return;
    setNodesBySite((prev) => ({
      ...prev,
      [activeSite]: prev[activeSite].filter((n) => n.id !== selectedNode.id),
    }));
    setEdgesBySite((prev) => ({
      ...prev,
      [activeSite]: prev[activeSite].filter((e) => e.source !== selectedNode.id && e.target !== selectedNode.id),
    }));
    setSelectedNode(null);
  };

  // React Flow handlers for current site
  const onNodesChange = useCallback(
    (changes) => {
      setNodesBySite((prev) => ({
        ...prev,
        [activeSite]: applyNodeChanges(changes, prev[activeSite]),
      }));
    },
    [activeSite]
  );
  const onEdgesChange = useCallback(
    (changes) => {
      setEdgesBySite((prev) => ({
        ...prev,
        [activeSite]: applyEdgeChanges(changes, prev[activeSite]),
      }));
    },
    [activeSite]
  );
  const onConnect = useCallback(
    (params) => {
      setEdgesBySite((prev) => ({
        ...prev,
        [activeSite]: addEdge(
          { ...params, animated: true, style: { stroke: '#22d3ee', strokeWidth: 2 } },
          prev[activeSite]
        ),
      }));
    },
    [activeSite]
  );
  const onNodeClick = useCallback((_, node) => {
    setSelectedNode(node);
    setSelectedEdge(null);
    setActiveTab('overview');
  }, []);
  const onEdgeClick = useCallback((_, edge) => {
    setSelectedEdge(edge);
    setSelectedNode(null);
    setActiveTab('link-details');
  }, []);
  const onPaneClick = useCallback(() => {
    setSelectedEdge(null);
  }, []);

  // Keep selected node synced
  useEffect(() => {
    if (selectedNode) {
      const updated = nodes.find((n) => n.id === selectedNode.id);
      if (updated && updated !== selectedNode) {
        setSelectedNode(updated);
      }
    }
  }, [nodes, selectedNode]);

  // (filtering is now done in the nodes/edges useMemo above with failure simulation + category toggles)

  // Stats for current site
  const stats = useMemo(() => {
    const online = nodes.filter((n) => n.data.status !== 'offline' && n.data.status !== 'down').length;
    const types = {};
    nodes.forEach((n) => {
      const t = n.data.deviceType || 'Unknown';
      types[t] = (types[t] || 0) + 1;
    });
    return { total: nodes.length, online, offline: nodes.length - online, links: edges.length, types };
  }, [nodes, edges]);

  return (
    <div className="flex h-screen w-screen bg-[#070b14] text-slate-100 overflow-hidden font-sans">
      <div className="relative flex-1 h-full" ref={reactFlowWrapper}>
        {/* Top Navbar */}
        <div className="absolute top-4 left-4 right-4 z-20 flex items-center justify-between pointer-events-none gap-3 flex-wrap">
          {/* Logo + Site Tabs */}
          <div className="flex items-center gap-3 pointer-events-auto flex-wrap">
            {/* Logo & Title */}
            <div className="flex items-center gap-3 bg-slate-900/90 border border-slate-800 backdrop-blur-md px-4 py-2.5 rounded-xl shadow-2xl">
              <div className={`h-8 w-8 rounded-lg flex items-center justify-center shadow-lg ${
                activeSite === 'dc' ? 'bg-gradient-to-br from-cyan-400 to-blue-600 shadow-cyan-500/30'
                : activeSite === 'ndc' ? 'bg-gradient-to-br from-violet-400 to-indigo-600 shadow-violet-500/30'
                : 'bg-gradient-to-br from-emerald-400 to-teal-600 shadow-emerald-500/30'
              }`}>
                <Network size={18} className="text-white" />
              </div>
              <div>
                <h1 className="text-sm font-bold text-slate-100 tracking-wide uppercase leading-tight">
                  NETARCH <span className={site.accent}>NOC</span>
                </h1>
                <p className="text-[10px] text-slate-400 truncate max-w-[200px]">{nameBySite[activeSite] || 'Network Topology'}</p>
              </div>
            </div>

            {/* Site Tabs: DC / NDC */}
            <div className="flex items-center bg-slate-900/90 border border-slate-800 backdrop-blur-md p-1 rounded-xl shadow-2xl gap-1">
              {Object.values(SITES).map((s) => {
                const isActive = activeSite === s.id;
                return (
                  <button
                    key={s.id}
                    onClick={() => setActiveSite(s.id)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all duration-200 ${
                      isActive ? s.bgActive + ' shadow-lg ' + s.glowActive : s.bgInactive
                    }`}
                  >
                    <LocateFixed size={13} />
                    {s.label}
                    {nodesBySite[s.id]?.length > 0 && (
                      <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded ${
                        isActive ? 'bg-black/20' : 'bg-slate-700/80 text-slate-400'
                      }`}>
                        {nodesBySite[s.id]?.length}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Site description pill */}
            <div className={`flex items-center gap-1.5 bg-slate-900/90 border border-slate-800 backdrop-blur-md px-3 py-2 rounded-xl shadow-2xl ${site.accent}`}>
              <Building2 size={12} />
              <span className="text-[10px] font-mono">{site.fullName}</span>
            </div>
          </div>

          {/* Stats Pills */}
          <div className="flex items-center gap-2 pointer-events-auto">
            <StatPill icon={<Server size={12} />} label="Devices" value={stats.total} color="text-cyan-400" />
            <StatPill icon={<TrendingUp size={12} />} label="Online" value={stats.online} color="text-emerald-400" />
            <StatPill icon={<Wifi size={12} />} label="Links" value={stats.links} color={site.accent} />
          </div>

          {/* Right Controls */}
          <div className="flex items-center gap-2 pointer-events-auto flex-wrap">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                placeholder={`Search ${activeSite.toUpperCase()} devices...`}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-56 bg-slate-900/90 border border-slate-700/80 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-400 backdrop-blur-md"
              />
            </div>

            <button
              onClick={() => setShowPalette(!showPalette)}
              className={`flex items-center gap-1.5 ${
                showPalette ? 'bg-cyan-500 text-slate-950' : 'bg-slate-900/90 hover:bg-slate-800 border border-slate-700 text-slate-300'
              } px-3 py-2 rounded-xl text-xs backdrop-blur-md font-semibold transition-all`}
              title="Add Device"
            >
              <Plus size={14} />
              Add
            </button>

            <button
              onClick={() => fetchSiteTopology(activeSite)}
              className="bg-slate-900/90 hover:bg-slate-800 border border-slate-700 text-slate-300 p-2 rounded-xl backdrop-blur-md transition-all"
              title="Refresh"
            >
              <RefreshCw size={14} />
            </button>

            <button
              onClick={saveLayout}
              className={`flex items-center gap-1.5 font-bold px-4 py-2 rounded-xl text-xs transition-all shadow-lg ${
                saveStatus === 'saved'
                  ? 'bg-emerald-500 text-white shadow-emerald-500/20'
                  : saveStatus === 'saving'
                  ? 'bg-amber-500 text-slate-950 shadow-amber-500/20'
                  : saveStatus === 'error'
                  ? 'bg-rose-500 text-white shadow-rose-500/20'
                  : activeSite === 'dc'
                    ? 'bg-cyan-500 hover:bg-cyan-400 text-slate-950 shadow-cyan-500/20'
                    : activeSite === 'ndc'
                    ? 'bg-violet-500 hover:bg-violet-400 text-white shadow-violet-500/20'
                    : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-emerald-500/20'
              }`}
            >
              {saveStatus === 'saved' ? <>✓ Saved</> : saveStatus === 'saving' ? <>Saving...</> : saveStatus === 'error' ? <>✗ Failed</> : <><Save size={14} /> Save</>}
            </button>

            <ExportMenu exportPNG={exportPNG} exportPDF={exportPDF} siteLabel={activeSite.toUpperCase()} />
          </div>
        </div>

        {/* Device Palette Dropdown */}
        {showPalette && (
          <div className="absolute top-16 right-4 z-30 bg-slate-900/95 border border-slate-700 backdrop-blur-xl rounded-xl shadow-2xl p-3 w-72 animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="flex items-center justify-between mb-2 px-1">
              <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">Add Device to {activeSite.toUpperCase()}</span>
              <button onClick={() => setShowPalette(false)} className="text-slate-500 hover:text-white">
                <X size={14} />
              </button>
            </div>
            <div className="space-y-1">
              {DEVICE_PALETTE.map((d) => {
                const IconComp = d.icon;
                return (
                  <button
                    key={d.type}
                    onClick={() => addDevice(d)}
                    className="w-full flex items-center gap-2.5 p-2.5 rounded-lg hover:bg-slate-800/80 transition-colors text-left"
                  >
                    <div className={`p-1.5 rounded-md bg-slate-800 ${d.color}`}>
                      <IconComp size={16} />
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-slate-200">{d.type}</div>
                      <div className="text-[10px] text-slate-500">{d.desc}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* React Flow Canvas */}
        {loading ? (
          <div className="flex items-center justify-center h-full bg-[#070b14]">
            <div className="text-center">
              <div className="h-10 w-10 border-4 border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin mx-auto mb-3" />
              <p className="text-sm text-slate-400">Loading topologies...</p>
            </div>
          </div>
        ) : (
          <ReactFlow
            key={activeSite}
            nodes={nodes}
            edges={styledEdges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onEdgeClick={onEdgeClick}
            onPaneClick={onPaneClick}
            nodeTypes={nodeTypes}
            defaultViewport={viewportBySite[activeSite] || { x: 40, y: 10, zoom: 0.75 }}
            minZoom={0.2}
            maxZoom={2}
            className="bg-[#070b14]"
            fitView={false}
            deleteKeyCode={['Backspace', 'Delete']}
            onNodesDelete={() => { setSelectedNode(null); setSelectedEdge(null); }}
          >
            <Background color="#1e293b" gap={24} size={1} variant={BackgroundVariant.Dots} />
            {/* SVG arrow markers for directional links */}
            <svg width="0" height="0" style={{ position: 'absolute' }}>
              <defs>
                <marker id="arrow-rose" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="#f43f5e" />
                </marker>
                <marker id="arrow-amber" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="#f59e0b" />
                </marker>
                <marker id="arrow-emerald" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="#10b981" />
                </marker>
                <marker id="arrow-sky" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="#0ea5e9" />
                </marker>
              </defs>
            </svg>
            <Controls className="!bg-slate-900 !border-slate-800 !rounded-xl !overflow-hidden !shadow-2xl" />
            {activeSite === 'full' && (
              <MiniMap
                className="!bg-slate-900/95 !border !border-slate-800 !rounded-xl !shadow-2xl"
                nodeColor={(n) => {
                  const t = n.data?.deviceType;
                  if (t === 'Router' || t === 'ISP / Cloud') return '#38bdf8';
                  if (t === 'WAN Switch' || t === 'Switch') return '#06b6d4';
                  if (t === 'Firewall') return '#f43f5e';
                  if (t === 'Core Router') return '#f59e0b';
                  if (t === 'Core Switch') return '#6366f1';
                  if (t === 'Unknown') return '#fbbf24';
                  return '#94a3b8';
                }}
                nodeStrokeWidth={3}
                maskColor="rgba(7,11,20,0.7)"
                pannable
                zoomable
              />
            )}
          </ReactFlow>
        )}

        {/* Comprehensive Legend */}
        <LegendPanel activeSite={activeSite} siteColor={site.color} />

        {lastSavedBySite[activeSite] && (
          <div className="absolute bottom-4 right-4 z-20 text-[10px] font-mono text-slate-500">
            Last saved: {new Date(lastSavedBySite[activeSite]).toLocaleString()}
          </div>
        )}
      </div>

      {/* Right Device Drawer */}
      {selectedNode && (
        <DeviceDrawer
          node={selectedNode}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          onClose={() => setSelectedNode(null)}
          onDelete={deleteSelectedNode}
          siteAccent={site.accent}
          simulationMode={simulationMode}
          isFailed={failedNodes.has(selectedNode.id)}
          activeSite={activeSite}
          onToggleFail={() => {
            setFailedNodes((prev) => {
              const n = new Set(prev);
              n.has(selectedNode.id) ? n.delete(selectedNode.id) : n.add(selectedNode.id);
              return n;
            });
          }}
          onUpdateNode={(nodeId, newData) => {
            // Update local state immediately + persist to backend
            setNodesBySite((prev) => {
              const updated = { ...prev };
              const siteNodes = [...(updated[activeSite] || [])];
              const idx = siteNodes.findIndex((n) => n.id === nodeId);
              if (idx !== -1) {
                const merged = { ...siteNodes[idx], data: { ...siteNodes[idx].data, ...newData } };
                siteNodes[idx] = merged;
                updated[activeSite] = siteNodes;
                setSelectedNode(merged);
              }
              return updated;
            });
            fetch('/api/topology/node', {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ site: activeSite, node_id: nodeId, data: newData }),
            }).catch((err) => console.error('Save failed:', err));
          }}
        />
      )}

      {/* Right Edge Drawer */}
      {selectedEdge && (
        <EdgeDrawer
          edge={selectedEdge}
          allNodes={allNodes}
          onClose={() => setSelectedEdge(null)}
          isFailed={failedLinks.has(selectedEdge.id)}
          onToggleFail={() => {
            setFailedLinks((prev) => {
              const n = new Set(prev);
              n.has(selectedEdge.id) ? n.delete(selectedEdge.id) : n.add(selectedEdge.id);
              return n;
            });
          }}
          simulationMode={simulationMode}
          setSimulationMode={setSimulationMode}
        />
      )}

      {/* Filter toolbar (only on full infra) */}
      {activeSite === 'full' && (
        <FilterToolbar
          hiddenCategories={hiddenCategories}
          setHiddenCategories={setHiddenCategories}
          failedCount={failedLinks.size + failedNodes.size}
          simulationMode={simulationMode}
          setSimulationMode={setSimulationMode}
          onClearFailures={() => { setFailedLinks(new Set()); setFailedNodes(new Set()); }}
          showTrafficFlow={showTrafficFlow}
          setShowTrafficFlow={setShowTrafficFlow}
          showPbrPanel={showPbrPanel}
          setShowPbrPanel={setShowPbrPanel}
        />
      )}

      {/* Reroute banner during simulation */}
      {simulationMode && rerouteNote && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 bg-emerald-500/20 border border-emerald-500/50 backdrop-blur-md rounded-xl px-5 py-2.5 shadow-2xl shadow-emerald-500/20 animate-pulse">
          <div className="flex items-center gap-2 text-emerald-300 text-sm font-semibold">
            <Zap size={16} />
            <span>{rerouteNote}</span>
          </div>
        </div>
      )}

      {/* PBR / ISP Policy Panel */}
      {showPbrPanel && activeSite === 'full' && (
        <PbrPolicyPanel nodes={allNodes} edges={allEdges} onClose={() => setShowPbrPanel(false)} />
      )}
    </div>
  );
}

// ========== PBR POLICY PANEL ==========
function PbrPolicyPanel({ nodes, edges, onClose }) {
  const rt = nodes.find((n) => n.id === 'dc-core-rt-01');
  const rtData = rt?.data || {};
  const pbrPolicy = rtData.pbrPolicy || [];
  const natPools = rtData.natPools || [];
  const tracks = rtData.tracks || [];
  const bgpNeighbors = rtData.bgpNeighbors || [];
  const ispEdges = edges.filter((e) => e.data?.ispName && e.source.startsWith('dc-'));

  // ISP priority summary (sorted by INT weight descending = primary first)
  const ispSummary = {};
  bgpNeighbors.forEach((n) => {
    if (n.type === 'INT') {
      const key = n.isp;
      if (!ispSummary[key] || n.priority === 'PRI') {
        ispSummary[key] = { ...n };
      }
    }
  });
  const primaryInternet = bgpNeighbors
    .filter((n) => n.type === 'INT' && n.priority === 'PRI')
    .sort((a, b) => (b.weight || 0) - (a.weight || 0))[0];

  return (
    <div className="absolute top-20 right-4 z-20 w-[420px] max-h-[calc(100vh-120px)] bg-slate-950/97 border border-slate-800 backdrop-blur-xl rounded-2xl shadow-2xl overflow-hidden flex flex-col">
      <div className="p-4 border-b border-slate-800 flex items-start justify-between bg-gradient-to-r from-violet-900/40 to-slate-900">
        <div>
          <div className="flex items-center gap-2">
            <Gauge size={16} className="text-violet-400" />
            <h3 className="text-sm font-bold text-white">ISP / PBR / NAT Policy</h3>
          </div>
          <p className="text-[10px] text-slate-400 mt-0.5 font-mono">{rtData.hostname} — BGP AS{rtData.bgpAsn}</p>
        </div>
        <button onClick={onClose} className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white">
          <X size={16} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 text-slate-200">
        {/* Traffic Flow */}
        {rtData.trafficFlow && (
          <div className="bg-slate-900/70 rounded-xl border border-slate-800 p-3">
            <div className="text-[9px] uppercase tracking-widest text-slate-500 font-bold mb-2 flex items-center gap-1">
              <Route size={10} /> Traffic Flow (Outbound)
            </div>
            <div className="text-[11px] leading-relaxed text-slate-300 p-2 bg-slate-950/80 rounded-lg font-mono">
              {rtData.trafficFlow}
            </div>
          </div>
        )}

        {/* ISP Priority Summary */}
        <div className="bg-slate-900/70 rounded-xl border border-slate-800 p-3">
          <div className="text-[9px] uppercase tracking-widest text-slate-500 font-bold mb-2 flex items-center gap-1">
            <Star size={10} className="text-amber-400" /> Internet Egress Priority (BGP weight)
          </div>
          <div className="space-y-1.5">
            {bgpNeighbors
              .filter((n) => n.type === 'INT' && n.priority === 'PRI')
              .sort((a, b) => (b.weight || 0) - (a.weight || 0))
              .map((n, i) => {
                const colors = ['text-emerald-400 bg-emerald-500/15 border-emerald-500/30', 'text-sky-400 bg-sky-500/15 border-sky-500/30', 'text-amber-400 bg-amber-500/15 border-amber-500/30', 'text-slate-400 bg-slate-700/30 border-slate-600/30'];
                return (
                  <div key={n.peer} className={`flex items-center gap-2 rounded-lg border p-2 ${colors[i] || colors[3]}`}>
                    <span className="text-[10px] font-bold font-mono w-5">#{i+1}</span>
                    <span className="flex-1 text-xs font-bold">{n.isp}</span>
                    <span className="text-[10px] font-mono">w={n.weight}</span>
                    {i === 0 && <Star size={11} className="fill-amber-400 text-amber-400" />}
                    {n.bfd && <span className="text-[9px] px-1 rounded bg-slate-950/50 text-emerald-400 font-mono">BFD</span>}
                  </div>
                );
              })}
          </div>
          <p className="text-[9px] text-slate-500 mt-2 leading-relaxed">
            ★ Primary = highest BGP weight (AGNI w=9000). Secondary links use lower weight + AS-Prepend out.
            PBR (route-map UPLOAD_POLICY) overrides weight per-source-subnet for NAT symmetry.
          </p>
        </div>

        {/* PBR Route Map */}
        <div className="bg-slate-900/70 rounded-xl border border-slate-800 p-3">
          <div className="text-[9px] uppercase tracking-widest text-slate-500 font-bold mb-2 flex items-center gap-1">
            <Shield size={10} className="text-rose-400" /> PBR Route-Map UPLOAD_POLICY (applied on Te0/1/0 inside)
          </div>
          <div className="space-y-2">
            {pbrPolicy.map((seq) => (
              <div key={seq.seq} className="rounded-lg border border-slate-800 bg-slate-950/60 p-2">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-violet-500/20 text-violet-300 border border-violet-500/30">seq {seq.seq}</span>
                  <span className="text-[10px] font-bold text-slate-300 font-mono">{seq.name}</span>
                </div>
                {seq.nextHops.length > 0 ? (
                  <div className="flex flex-wrap items-center gap-1 text-[10px]">
                    {seq.nextHops.map((nh, i) => (
                      <React.Fragment key={nh.ip}>
                        {i > 0 && <span className="text-slate-600">→</span>}
                        <span className={`px-1.5 py-0.5 rounded font-mono ${i === 0 ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-slate-800 text-slate-400 border border-slate-700'}`}>
                          {i+1}. {nh.label}
                          <span className="text-slate-500 ml-1">t{nh.track}</span>
                        </span>
                      </React.Fragment>
                    ))}
                  </div>
                ) : (
                  <p className="text-[10px] text-slate-500 italic">No PBR override — uses normal routing (default to FW)</p>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* NAT Pools */}
        <div className="bg-slate-900/70 rounded-xl border border-slate-800 p-3">
          <div className="text-[9px] uppercase tracking-widest text-slate-500 font-bold mb-2 flex items-center gap-1">
            <Cloud size={10} className="text-sky-400" /> NAT Pools (PAT Overload)
          </div>
          <div className="space-y-1.5">
            {natPools.map((p) => (
              <div key={p.name} className="rounded-lg border border-slate-800 bg-slate-950/60 p-2 text-[10px]">
                <div className="flex items-center justify-between mb-0.5">
                  <span className="font-bold text-sky-300 font-mono">{p.name}</span>
                  <span className="text-slate-400">{p.type}</span>
                </div>
                <div className="text-slate-300 font-mono">{p.range}</div>
                <div className="text-slate-500 text-[9px] mt-0.5">
                  route-map: {p.routeMap} · {p.loopback}
                </div>
              </div>
            ))}
            {rtData.natStatics && (
              <div className="text-[9px] text-slate-400 mt-1 p-2 bg-slate-950/40 rounded border border-slate-800">
                <span className="text-amber-400 font-bold">~50 static 1:1 NATs</span> {rtData.natStatics}
              </div>
            )}
          </div>
        </div>

        {/* IP SLA Tracks */}
        <div className="bg-slate-900/70 rounded-xl border border-slate-800 p-3">
          <div className="text-[9px] uppercase tracking-widest text-slate-500 font-bold mb-2 flex items-center gap-1">
            <Gauge size={10} className="text-cyan-400" /> IP SLA / Tracking Objects
          </div>
          <div className="space-y-1">
            {tracks.map((t) => (
              <div key={t.id} className="flex items-center gap-2 text-[10px] rounded border border-slate-800 bg-slate-950/40 p-1.5">
                <span className="font-mono text-cyan-400 w-8">t{t.id}</span>
                <ArrowRightLeft size={10} className="text-slate-600" />
                <span className="font-mono text-slate-300 flex-1">{t.target}</span>
                <span className="text-[9px] text-slate-500 truncate max-w-[180px]">{t.purpose}</span>
              </div>
            ))}
          </div>
          <p className="text-[9px] text-slate-500 mt-2">BFD intervals: ADN 800ms×3, AGNI 200ms×5. EEM script shuts ISP interfaces if track 100 (FW) fails.</p>
        </div>

        {/* Legend */}
        <div className="bg-slate-900/70 rounded-xl border border-slate-800 p-3">
          <div className="text-[9px] uppercase tracking-widest text-slate-500 font-bold mb-2">Edge Badge Legend</div>
          <div className="grid grid-cols-2 gap-1.5 text-[10px]">
            <div className="flex items-center gap-1.5"><span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold font-mono">P</span> Primary link</div>
            <div className="flex items-center gap-1.5"><span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold font-mono">S</span> Secondary (backup)</div>
            <div className="flex items-center gap-1.5"><Star size={10} className="text-amber-400 fill-amber-400" /> ★ Primary Internet (by weight)</div>
            <div className="flex items-center gap-1.5"><span className="text-rose-400">━</span> PBR to FW (rose)</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ===================== SUPPORTING COMPONENTS =====================

function StatPill({ icon, label, value, color }) {
  return (
    <div className="flex items-center gap-1.5 bg-slate-900/90 border border-slate-800 backdrop-blur-md px-3 py-2 rounded-xl shadow-lg">
      <span className={color}>{icon}</span>
      <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">{label}</span>
      <span className={`text-sm font-bold ${color}`}>{value}</span>
    </div>
  );
}

function LegendDot({ color, label, dashed, thick = false, text = '' }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className={`inline-block w-6 rounded ${thick ? 'h-1' : 'h-0.5'}`}
        style={{
          background: dashed
            ? `repeating-linear-gradient(90deg, ${color} 0, ${color} 4px, transparent 4px, transparent ${dashed === 'loose' ? '10px' : '8px'})`
            : color,
        }}
      />
      <span className="text-slate-300 text-[11px]">{label}</span>
      {text && <span className="text-slate-500 text-[10px] font-mono">{text}</span>}
    </div>
  );
}

function NodeSwatch({ color, label, borderStyle, hollow }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className={`inline-block w-3 h-3 rounded ${borderStyle || ''}`}
        style={hollow ? { background: 'transparent', border: `1.5px dashed ${color}` } : { background: color }}
      />
      <span className="text-slate-300 text-[11px]">{label}</span>
    </div>
  );
}

function LegendPanel({ activeSite, siteColor }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="absolute bottom-4 left-4 z-20 bg-slate-900/95 border border-slate-800 backdrop-blur-md rounded-xl shadow-2xl max-w-[420px] overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full px-4 py-2.5 flex items-center justify-between hover:bg-slate-800/60 transition-colors"
      >
        <div className="flex items-center gap-2">
          <HelpCircle size={14} className="text-slate-400" />
          <span className="text-xs font-bold text-slate-200 uppercase tracking-wider">Legend</span>
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${
            siteColor === 'emerald' ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
            : siteColor === 'violet' ? 'text-violet-400 bg-violet-500/10 border-violet-500/20'
            : 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20'
          }`}>
            {activeSite.toUpperCase()}
          </span>
        </div>
        {open ? <ChevronDown size={14} className="text-slate-400" /> : <ChevronUp size={14} className="text-slate-400" />}
      </button>
      {open && (
        <div className="px-4 pb-3 space-y-3 border-t border-slate-800 pt-3">
          {/* Device types */}
          <div>
            <div className="text-[9px] uppercase tracking-widest text-slate-500 font-bold mb-1.5">Device Types</div>
            <div className="grid grid-cols-2 gap-y-1 gap-x-3">
              <NodeSwatch color="#38bdf8" label="ISP / Cloud (upstream)" />
              <NodeSwatch color="#06b6d4" label="WAN Switch (L2 agg.)" />
              <NodeSwatch color="#f59e0b" label="Core Router (BGP/OSPF)" />
              <NodeSwatch color="#f43f5e" label="Firewall (PBR insp.)" />
              <NodeSwatch color="#6366f1" label="Core Switch (SV)" />
              <NodeSwatch color="#0d9488" label="Distribution Switch" />
              <NodeSwatch color="#fbbf24" label="⚠ Unknown/Config Missing" hollow />
            </div>
          </div>

          {/* Links */}
          <div>
            <div className="text-[9px] uppercase tracking-widest text-slate-500 font-bold mb-1.5">Link Types</div>
            <div className="grid grid-cols-1 gap-y-1">
              <LegendDot color="#9ca3af" label="ISP Fiber (L2 handoff)" />
              <LegendDot color="#f59e0b" label="BGP Trunk (WAN→RT, primary L3 path)" thick />
              <LegendDot color="#3b82f6" label="Inter-Router OSPF HA" />
              <LegendDot color="#f43f5e" label="PBR Path (RT→FW inspection via WAN-SW)" dashed />
              <LegendDot color="#6366f1" label="RT→Core-SW Downlink (ECMP)" thick />
              <LegendDot color="#10b981" label="★ Triangle Core Backbone (OSPF p2p)" thick text="(DC↔NDC↔WMTC)" />
              <LegendDot color="#f59e0b" label="⚠ Floating Backup (floating static AD 3)" thick dashed />
              <LegendDot color="#14b8a6" label="Core→Dist L2 Trunk / Access" />
              <LegendDot color="#06b6d4" label="B1-Core→Local Building (trunk/access)" />
              <LegendDot color="#0d9488" label="Direct L3 to Dist (OSPF p2p)" />
              <LegendDot color="#ec4899" label="HA Sync (WAN-SW/FW clusters)" dashed />
              <LegendDot color="#fbbf24" label="Inferred link (no config backup)" dashed />
              <LegendDot color="#f87171" label="⚠ Shutdown / Admin Down" dashed="loose" />
              <LegendDot color="#a1a1aa" label="Uncertain (config truncated)" dashed="loose" />
            </div>
          </div>

          {/* Key */}
          {activeSite === 'full' && (
            <div className="text-[10px] text-slate-500 border-t border-slate-800 pt-2 leading-relaxed">
              <span className="text-emerald-400 font-bold">★ PRIMARY</span> = WMTC-B1 default via DC (IP SLA track) ·
              <span className="text-amber-400 font-bold"> ⚠ BACKUP</span> = via NDC (AD 3). All triangle links carry OSPF area 0/11.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ========== EDGE DETAIL DRAWER ==========
function EdgeDrawer({ edge, allNodes, onClose, isFailed, onToggleFail, simulationMode }) {
  const data = edge.data || {};
  const src = allNodes.find((n) => n.id === edge.source);
  const tgt = allNodes.find((n) => n.id === edge.target);
  const catColors = {
    isp: { bg: 'bg-sky-500/20', text: 'text-sky-300', border: 'border-sky-500/40', label: 'ISP Fiber' },
    bgp: { bg: 'bg-amber-500/20', text: 'text-amber-300', border: 'border-amber-500/40', label: 'BGP Trunk' },
    pbr: { bg: 'bg-rose-500/20', text: 'text-rose-300', border: 'border-rose-500/40', label: 'PBR / FW Path' },
    ha: { bg: 'bg-pink-500/20', text: 'text-pink-300', border: 'border-pink-500/40', label: 'HA Sync' },
    backbone: { bg: 'bg-emerald-500/20', text: 'text-emerald-300', border: 'border-emerald-500/40', label: '★ Core Backbone' },
    downlink: { bg: 'bg-indigo-500/20', text: 'text-indigo-300', border: 'border-indigo-500/40', label: 'RT→Core Downlink' },
    l3dist: { bg: 'bg-teal-500/20', text: 'text-teal-300', border: 'border-teal-500/40', label: 'L3 Distribution' },
    access: { bg: 'bg-slate-500/20', text: 'text-slate-300', border: 'border-slate-500/40', label: 'L2 Access/Trunk' },
    inferred: { bg: 'bg-amber-500/20', text: 'text-amber-300', border: 'border-amber-500/40', label: '⚠ Inferred Link' },
    shutdown: { bg: 'bg-red-500/20', text: 'text-red-300', border: 'border-red-500/40', label: '✕ Shutdown' },
    uncertain: { bg: 'bg-zinc-500/20', text: 'text-zinc-300', border: 'border-zinc-500/40', label: '? Uncertain' },
  };
  const cat = catColors[data.category] || catColors.access;
  return (
    <div className="w-[460px] bg-slate-950/95 border-l border-slate-800/90 h-full flex flex-col z-30 shadow-2xl backdrop-blur-xl animate-in slide-in-from-right duration-300">
      <div className="p-5 border-b border-slate-800 flex items-start justify-between bg-slate-900/60">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <TrendingUp size={16} className="text-amber-400" />
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase ${cat.bg} ${cat.text} ${cat.border}`}>{cat.label}</span>
            {data.role === 'primary' && <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">★ PRIMARY</span>}
            {data.role === 'backup' && <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">⚠ BACKUP</span>}
            {isFailed && <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-red-500/20 text-red-300 border border-red-500/40 animate-pulse">✕ FAILED</span>}
          </div>
          <h2 className="text-base font-bold text-white">Link Details</h2>
          <p className="text-xs text-slate-400 mt-0.5 font-mono break-all">{edge.id}</p>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"><X size={18} /></button>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {/* Endpoints */}
        <div className="bg-slate-900/60 rounded-xl border border-slate-800 p-4">
          <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-2">Endpoints</div>
          <div className="flex items-center gap-2">
            <div className="flex-1 bg-slate-950 rounded-lg p-2.5 border border-slate-800">
              <div className="text-[10px] text-slate-500 uppercase">Source</div>
              <div className="text-sm font-bold text-cyan-300 truncate">{src?.data?.hostname || edge.source}</div>
              <div className="text-[10px] text-slate-400 font-mono">{src?.data?.deviceType || ''}</div>
            </div>
            <div className="text-slate-600 text-lg">↔</div>
            <div className="flex-1 bg-slate-950 rounded-lg p-2.5 border border-slate-800">
              <div className="text-[10px] text-slate-500 uppercase">Target</div>
              <div className="text-sm font-bold text-violet-300 truncate">{tgt?.data?.hostname || edge.target}</div>
              <div className="text-[10px] text-slate-400 font-mono">{tgt?.data?.deviceType || ''}</div>
            </div>
          </div>
        </div>

        {/* Info grid */}
        <div className="bg-slate-900/60 rounded-xl border border-slate-800 p-4 space-y-2">
          <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-1">Link Info</div>
          <InfoRow label="Label" value={data.fullLabel || edge.label || '—'} />
          <InfoRow label="Category" value={cat.label} accent={cat.text} />
          <InfoRow label="Speed" value={data.speed || '—'} />
          <InfoRow label="Protocol" value={data.protocol || '—'} />
          <InfoRow label="Direction" value={data.direction || '—'} />
          <InfoRow label="Role" value={data.role === 'primary' ? '★ Primary (active)' : data.role === 'backup' ? '⚠ Backup (floating AD 3)' : 'Normal'} accent={data.role === 'primary' ? 'text-emerald-400' : data.role === 'backup' ? 'text-amber-400' : 'text-slate-300'} />
          {data.ip && <InfoRow label="IP Subnet" value={data.ip} accent="text-cyan-300" />}
        </div>

        {/* ISP-specific BGP details */}
        {data.ispName && (
          <div className="bg-slate-900/60 rounded-xl border border-slate-800 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Globe size={14} style={{ color: data.ispColor || '#38bdf8' }} />
              <span className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">ISP BGP Details</span>
              {data.primary && <Star size={12} className="text-amber-400 fill-amber-400" />}
            </div>
            <InfoRow label="ISP" value={data.ispName} accent="text-white font-bold" />
            <InfoRow label="ASN" value={String(data.ispAsn)} accent="text-sky-300 font-mono" />
            <InfoRow label="Link Role" value={`${data.priority} ${data.linkType}`} accent={data.priority === 'PRI' ? 'text-emerald-400' : 'text-amber-400'} />
            {data.bgpWeight && (
              <InfoRow label="BGP Weight" value={`INT=${data.bgpWeight.INT} / DATA=${data.bgpWeight.DATA}`} accent="text-cyan-300 font-mono" />
            )}
            {data.peerIps && (
              <div className="mt-2 pt-2 border-t border-slate-800">
                <div className="text-[10px] text-slate-500 uppercase mb-1">Peer IPs (BGP neighbors)</div>
                {data.peerIps.INT && <InfoRow label="INT" value={data.peerIps.INT} accent="text-sky-300 font-mono text-xs" />}
                {data.peerIps.DATA && <InfoRow label="DATA" value={data.peerIps.DATA} accent="text-violet-300 font-mono text-xs" />}
              </div>
            )}
            {data.vlans && (
              <div className="mt-2 pt-2 border-t border-slate-800">
                <div className="text-[10px] text-slate-500 uppercase mb-1">VLAN Tags</div>
                {data.vlans.INT && <InfoRow label="INT VLAN" value={String(data.vlans.INT)} accent="text-sky-300 font-mono" />}
                {data.vlans.DATA && <InfoRow label="DATA VLAN" value={String(data.vlans.DATA)} accent="text-violet-300 font-mono" />}
              </div>
            )}
            {data.natPool && (
              <InfoRow label="NAT Pool" value={data.natPool} accent="text-rose-300 text-xs" />
            )}
            {data.publicRange && (
              <InfoRow label="Public Subnet" value={data.publicRange} accent="text-orange-300 font-mono" />
            )}
            {data.bfd && (
              <InfoRow label="BFD" value="Enabled (sub-second failover)" accent="text-emerald-400" />
            )}
            {data.asPrepend > 0 && (
              <InfoRow label="AS-Prepend Out" value={`${data.asPrepend}x (makes return path less preferred)`} accent="text-amber-400" />
            )}
            {data.slaTarget && data.slaTarget.INT && (
              <InfoRow label="IP SLA Target" value={`${data.slaTarget.INT} (track ${data.trackIds?.INT || '?'})`} accent="text-cyan-400 font-mono text-xs" />
            )}
          </div>
        )}

        {/* Failure simulation button */}
        <button
          onClick={onToggleFail}
          disabled={!simulationMode}
          className={`w-full py-3 rounded-xl font-bold text-sm border transition-all ${
            !simulationMode ? 'bg-slate-800/40 text-slate-600 border-slate-800 cursor-not-allowed'
            : isFailed ? 'bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-500'
            : 'bg-red-600/80 hover:bg-red-500 text-white border-red-500'
          }`}
        >
          {!simulationMode ? 'Enable Simulation Mode first' : isFailed ? '↻ Restore Link' : '✕ Simulate Link Failure'}
        </button>
        {data.ispName && !simulationMode && (
          <p className="text-[10px] text-slate-500 text-center">Turn on <b>Simulate Failure</b> mode and click above to test PBR failover.</p>
        )}
      </div>
    </div>
  );
}

// ========== FILTER TOOLBAR ==========
function FilterToolbar({ hiddenCategories, setHiddenCategories, failedCount, simulationMode, setSimulationMode, onClearFailures, showTrafficFlow, setShowTrafficFlow, showPbrPanel, setShowPbrPanel }) {
  const [open, setOpen] = useState(true);
  const toggle = (cat) => {
    setHiddenCategories((prev) => {
      const n = new Set(prev);
      n.has(cat) ? n.delete(cat) : n.add(cat);
      return n;
    });
  };
  const filters = [
    { id: 'isp', label: 'ISP Fibers', color: '#9ca3af' },
    { id: 'pbr', label: 'PBR/FW Paths', color: '#f43f5e' },
    { id: 'ha', label: 'HA Sync Links', color: '#ec4899' },
    { id: 'inferred', label: 'Inferred/⚠ Links', color: '#fbbf24' },
    { id: 'access', label: 'L2 Access Trunks', color: '#06b6d4' },
  ];
  const zones = [
    { id: 'triangle', label: '▲ Triangle Core', vp: { x: -900, y: -200, zoom: 0.9 } },
    { id: 'dc', label: 'DC Edge', vp: { x: -100, y: -100, zoom: 0.85 } },
    { id: 'ndc', label: 'NDC Edge', vp: { x: -1900, y: -100, zoom: 0.85 } },
    { id: 'wmtc', label: 'WMTC Campus', vp: { x: -700, y: -800, zoom: 0.75 } },
    { id: 'whil', label: 'WHIL/RES', vp: { x: -200, y: -1100, zoom: 0.75 } },
    { id: 'all', label: '⊞ Fit All', vp: null },
  ];
  const handleZoneClick = (z) => {
    if (!window.__rf) return;
    if (z.vp) window.__rf.setViewport(z.vp, { duration: 700 });
    else window.__rf.fitView({ padding: 0.1, duration: 700 });
  };
  return (
    <div className="absolute top-4 left-4 z-20 bg-slate-900/95 border border-slate-800 backdrop-blur-md rounded-xl shadow-2xl overflow-hidden max-w-[360px]">
      <button onClick={() => setOpen(!open)} className="w-full px-4 py-2.5 flex items-center justify-between hover:bg-slate-800/60 transition-colors">
        <div className="flex items-center gap-2">
          <Layers size={14} className="text-slate-400" />
          <span className="text-xs font-bold text-slate-200 uppercase tracking-wider">Controls</span>
          {failedCount > 0 && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-500 text-white">{failedCount} ✕</span>}
        </div>
        {open ? <ChevronDown size={14} className="text-slate-400" /> : <ChevronUp size={14} className="text-slate-400" />}
      </button>
      {open && (
        <div className="px-4 pb-3 space-y-3 border-t border-slate-800 pt-3">
          {/* Simulation mode */}
          <div>
            <div className="text-[9px] uppercase tracking-widest text-slate-500 font-bold mb-1.5 flex items-center justify-between">
              <span>Failure Simulation</span>
              {failedCount > 0 && <button onClick={onClearFailures} className="text-[9px] text-red-400 hover:text-red-300 normal-case tracking-normal">Clear all</button>}
            </div>
            <button
              onClick={() => { setSimulationMode(!simulationMode); if (simulationMode) onClearFailures(); }}
              className={`w-full py-1.5 rounded-lg text-[11px] font-bold border transition ${
                simulationMode ? 'bg-red-500/20 text-red-300 border-red-500/40' : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700'
              }`}
            >
              {simulationMode ? '● Simulation ON — click link/node to fail' : '○ Simulation Mode OFF'}
            </button>
          </div>

          {/* Traffic Flow / PBR panel toggles */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setShowTrafficFlow(!showTrafficFlow)}
              className={`py-1.5 rounded-lg text-[10px] font-bold border transition flex items-center justify-center gap-1 ${
                showTrafficFlow ? 'bg-sky-500/20 text-sky-300 border-sky-500/40' : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700'
              }`}
            >
              <Route size={11} />
              {showTrafficFlow ? 'Flow ON' : 'Traffic Flow'}
            </button>
            <button
              onClick={() => setShowPbrPanel(!showPbrPanel)}
              className={`py-1.5 rounded-lg text-[10px] font-bold border transition flex items-center justify-center gap-1 ${
                showPbrPanel ? 'bg-violet-500/20 text-violet-300 border-violet-500/40' : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700'
              }`}
            >
              <Gauge size={11} />
              {showPbrPanel ? 'PBR ON' : 'ISP/PBR'}
            </button>
          </div>

          {/* Filter checkboxes */}
          <div>
            <div className="text-[9px] uppercase tracking-widest text-slate-500 font-bold mb-1.5">Link Visibility</div>
            <div className="space-y-1">
              {filters.map((f) => (
                <label key={f.id} className="flex items-center gap-2 cursor-pointer text-[11px] text-slate-300 hover:text-white">
                  <input type="checkbox" checked={!hiddenCategories.has(f.id)} onChange={() => toggle(f.id)}
                    className="rounded border-slate-600 bg-slate-800" />
                  <span className="inline-block w-5 h-0.5 rounded" style={{ background: f.color }} />
                  <span>{f.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Quick zoom */}
          <div>
            <div className="text-[9px] uppercase tracking-widest text-slate-500 font-bold mb-1.5">Quick Zoom</div>
            <div className="grid grid-cols-3 gap-1">
              {zones.map((z) => (
                <button key={z.id} onClick={() => handleZoneClick(z)}
                  className="py-1 px-2 rounded bg-slate-800 hover:bg-slate-700 text-[10px] text-slate-300 hover:text-white border border-slate-700 transition">
                  {z.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ExportMenu({ exportPNG, exportPDF, siteLabel }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 bg-slate-900/90 hover:bg-slate-800 border border-slate-700 text-slate-300 px-3 py-2 rounded-xl text-xs backdrop-blur-md transition-all"
      >
        <Download size={14} />
        Export
      </button>
      {open && (
        <div className="absolute bottom-full mb-2 right-0 bg-slate-900/95 border border-slate-700 backdrop-blur-xl rounded-xl shadow-2xl p-1.5 w-48 z-30 animate-in fade-in slide-in-from-bottom-2 duration-150">
          <button
            onClick={() => { exportPNG(); setOpen(false); }}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-slate-800 text-xs text-slate-200 transition-colors text-left"
          >
            <FileImage size={14} className="text-cyan-400" />
            Export {siteLabel} PNG
          </button>
          <button
            onClick={() => { exportPDF(); setOpen(false); }}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-slate-800 text-xs text-slate-200 transition-colors text-left"
          >
            <FileText size={14} className="text-rose-400" />
            Export {siteLabel} PDF
          </button>
        </div>
      )}
    </div>
  );
}

// ===================== DEVICE DRAWER =====================
function DeviceDrawer({ node, activeTab, setActiveTab, onClose, onDelete, siteAccent = 'text-cyan-400', simulationMode, isFailed, onToggleFail, onUpdateNode, activeSite }) {
  const d = node.data || {};
  const mgmtIp = d.mgmtIP || d.mgmtIp || d.ip || 'N/A';
  const isOnline = d.status !== 'offline' && d.status !== 'down' && !d._failed;
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState({});
  const tabs = [
    { id: 'overview', label: 'Overview', icon: Info },
    { id: 'interfaces', label: 'Interfaces', icon: Network },
    { id: 'bgp', label: 'BGP/Routing', icon: Zap },
    { id: 'vlans', label: 'VLANs', icon: Layers },
    { id: 'tunnels', label: 'Tunnels/DCI', icon: Radio },
    { id: 'details', label: 'System', icon: Database },
  ];

  // Enter/exit edit mode
  const enterEdit = () => {
    setDraft({
      hostname: d.hostname || '',
      model: d.model || '',
      ios: d.ios || '',
      mgmtIp: d.mgmtIp || d.mgmtIP || '',
      location: d.location || '',
      rack: d.rack || '',
      notes: d.notes || '',
      vlans: d.vlans || '',
      uplinks: d.uplinks || '',
      downlinks: d.downlinks || '',
      routingProtocols: d.routingProtocols || '',
      ospfAreas: d.ospfAreas || '',
      interfaces: typeof d.interfaces === 'string' ? d.interfaces : '',
    });
    setEditMode(true);
  };
  const cancelEdit = () => { setEditMode(false); setDraft({}); };
  const saveEdit = async () => {
    setSaving(true);
    // Remove empty fields (don't overwrite with empties)
    const cleaned = {};
    Object.keys(draft).forEach((k) => {
      if (draft[k] !== undefined && draft[k] !== null && String(draft[k]).trim() !== '') cleaned[k] = draft[k];
    });
    // Remap mgmtIp key
    if (cleaned.mgmtIp !== undefined) {
      cleaned.mgmtIp = cleaned.mgmtIp;
    }
    onUpdateNode(node.id, cleaned);
    setSaving(false);
    setEditMode(false);
  };
  const update = (key, val) => setDraft((prev) => ({ ...prev, [key]: val }));

  return (
    <div className="w-[460px] bg-slate-950/95 border-l border-slate-800/90 h-full flex flex-col z-30 shadow-2xl backdrop-blur-xl animate-in slide-in-from-right duration-300">
      {/* Header */}
      <div className="p-5 border-b border-slate-800 flex items-start justify-between bg-slate-900/60">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase ${
              d.site?.toUpperCase() === 'NDC'
                ? 'bg-violet-500/20 text-violet-300 border-violet-500/30'
                : d.site?.toUpperCase() === 'FULL'
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                : 'bg-cyan-500/20 text-cyan-400 border-cyan-500/40'
            }`}>
              {d.deviceType}
            </span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30">
              {d.site || 'DC'}
            </span>
            <span className={`text-[10px] font-mono font-bold ${isOnline ? 'text-emerald-400' : 'text-rose-400'}`}>
              ● {isOnline ? 'ONLINE' : 'OFFLINE'}
            </span>
          </div>
          <h2 className="text-xl font-black text-slate-100 tracking-tight truncate">
            {d.hostname || d.label}
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            {d.model || 'Network Device'} • {d.osVersion || d.os || 'N/A'}
          </p>
        </div>
        <div className="flex items-center gap-1 ml-2">
          {!editMode ? (
            <>
              <button onClick={enterEdit} className="text-cyan-400 hover:text-cyan-300 hover:bg-cyan-500/10 p-1.5 rounded-lg transition-colors" title="Edit device info">
                <Pencil size={16} />
              </button>
              <button onClick={onDelete} className="text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 p-1.5 rounded-lg transition-colors" title="Delete device">
                <Trash2 size={16} />
              </button>
              <button onClick={onClose} className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition-colors">
                <X size={18} />
              </button>
            </>
          ) : (
            <>
              <button onClick={saveEdit} disabled={saving}
                className="text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 p-1.5 rounded-lg transition-colors disabled:opacity-50" title="Save changes">
                <Save size={16} />
              </button>
              <button onClick={cancelEdit} className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition-colors" title="Cancel editing">
                <X size={18} />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Quick Info Grid */}
      <div className="grid grid-cols-2 gap-2.5 p-4 bg-slate-900/30 border-b border-slate-800 text-xs font-mono">
        <div className="bg-slate-900/80 p-2.5 rounded-lg border border-slate-800">
          <span className="text-slate-500 block text-[10px] uppercase">Management IP</span>
          <span className="text-cyan-300 font-bold break-all">{mgmtIp}</span>
          <span className="text-[10px] text-slate-500 block mt-0.5">VRF: {d.mgmtVrf || d.vrf || 'default'}</span>
        </div>
        <div className="bg-slate-900/80 p-2.5 rounded-lg border border-slate-800">
          <span className="text-slate-500 block text-[10px] uppercase">Routing / AS</span>
          <span className="text-amber-300 font-bold">{d.bgpAs || 'L2 Switching'}</span>
          <span className="text-[10px] text-slate-500 block mt-0.5">{d.ospfProcess || 'OSPF Disabled'}</span>
        </div>
        {(d.serialNumber || d.tacacsServer) && (
          <div className="bg-slate-900/80 p-2.5 rounded-lg border border-slate-800 col-span-2 space-y-1">
            {d.serialNumber && (
              <div className="flex justify-between">
                <span className="text-slate-500 text-[10px]">SERIAL:</span>
                <span className="text-slate-300 font-bold">{d.serialNumber}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-slate-500 text-[10px]">TACACS+:</span>
              <span className="text-slate-300 font-bold">{d.tacacsServer || '172.21.1.18'}</span>
            </div>
          </div>
        )}
      </div>

      {/* Tab Navigation */}
      <div className="flex border-b border-slate-800 bg-slate-900/50 px-2 gap-0.5 overflow-x-auto text-xs">
        {tabs.map((tab) => {
          const IconComp = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`py-2.5 px-2.5 font-semibold uppercase tracking-wider text-[10px] border-b-2 transition-all whitespace-nowrap flex items-center gap-1 ${
                activeTab === tab.id ? 'border-cyan-400 text-cyan-400 bg-cyan-400/10' : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <IconComp size={12} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 text-xs font-mono">
        {activeTab === 'overview' && (
          <div className="space-y-3 animate-tab">
            {editMode ? (
              <>
                <div className="bg-cyan-500/10 border border-cyan-500/30 rounded-lg px-3 py-2 text-[11px] text-cyan-300 flex items-center gap-2">
                  <Pencil size={12} />
                  <span>Editing — click <span className="font-bold">Save</span> when done. Empty fields won't be overwritten.</span>
                </div>
                <InfoCard title="Device Identity (editable)">
                  <div className="space-y-2">
                    <EditRow label="Hostname" value={draft.hostname} onChange={(v) => update('hostname', v)} placeholder="e.g. DC-CORE-SW-01" />
                    <EditRow label="Model / Role" value={draft.model} onChange={(v) => update('model', v)} placeholder="e.g. Cisco C9500-40X SV" />
                    <EditRow label="OS Version" value={draft.ios} onChange={(v) => update('ios', v)} placeholder="e.g. IOS-XE 17.3" />
                    <EditRow label="Management IP" value={draft.mgmtIp} onChange={(v) => update('mgmtIp', v)} placeholder="e.g. Vlan1600 / 10.x.x.x" />
                  </div>
                </InfoCard>
                <InfoCard title="Connectivity (editable)">
                  <div className="space-y-2">
                    <EditRow label="Uplinks" value={draft.uplinks} onChange={(v) => update('uplinks', v)} multiline placeholder="Describe uplinks..." />
                    <EditRow label="Downlinks" value={draft.downlinks} onChange={(v) => update('downlinks', v)} multiline placeholder="Describe downlinks..." />
                    <EditRow label="VLANs" value={draft.vlans} onChange={(v) => update('vlans', v)} multiline placeholder="VLAN list or summary" />
                    <EditRow label="Routing Protocols" value={draft.routingProtocols} onChange={(v) => update('routingProtocols', v)} multiline placeholder="e.g. BGP AS 59209, OSPF area 0" />
                    <EditRow label="OSPF Areas" value={draft.ospfAreas} onChange={(v) => update('ospfAreas', v)} multiline placeholder="e.g. Area 0 (backbone), Area 11" />
                  </div>
                </InfoCard>
                <InfoCard title="Notes (editable)">
                  <EditRow label="Notes / Location / Rack" value={draft.notes} onChange={(v) => update('notes', v)} multiline placeholder="Free-form notes about this device..." />
                </InfoCard>
                <button
                  onClick={saveEdit}
                  disabled={saving}
                  className="w-full py-2.5 rounded-xl font-bold text-sm bg-emerald-600 hover:bg-emerald-500 text-white border border-emerald-500 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <Save size={14} /> {saving ? 'Saving...' : '💾 Save Changes'}
                </button>
                <button onClick={cancelEdit} className="w-full py-2 rounded-xl text-sm bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-all">Cancel</button>
              </>
            ) : (
              <>
                <InfoCard title="Device Identity">
                  <InfoRow label="Hostname" value={d.hostname || d.label} accent="text-cyan-300" />
                  <InfoRow label="Type" value={d.deviceType} />
                  <InfoRow label="Site" value={d.site || 'DC'} />
                  <InfoRow label="Role/Model" value={d.model || 'Enterprise Node'} />
                  <InfoRow label="OS Version" value={d.osVersion || d.os || 'N/A'} />
                  <InfoRow label="Domain" value={d.domain || 'waltonbd.com'} />
                </InfoCard>
                <InfoCard title="Management & AAA">
                  <InfoRow label="Mgmt IP" value={mgmtIp} accent="text-cyan-300" />
                  <InfoRow label="Mgmt VRF" value={d.mgmtVrf || d.vrf || 'default'} />
                  <InfoRow label="TACACS+" value={d.tacacsServer || '172.21.1.18'} />
                  <InfoRow label="NTP" value={d.ntpServer || '192.168.119.168'} />
                  <InfoRow label="Syslog" value={d.syslogServer || d.syslogHost || '192.168.100.121'} />
                </InfoCard>
                <InfoCard title="Connectivity">
                  {d.uplinks && (
                    <div className="mb-2">
                      <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-1">▲ Uplinks</div>
                      <div className="space-y-1">
                        {String(d.uplinks).split(/;\s*/).filter(Boolean).map((line, i) => (
                          <div key={i} className="text-[11px] text-slate-200 font-sans leading-snug pl-2 border-l-2 border-emerald-500/40">{line.trim()}</div>
                        ))}
                      </div>
                    </div>
                  )}
                  {d.downlinks && (
                    <div className="mb-2">
                      <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-1">▼ Downlinks</div>
                      <div className="space-y-1">
                        {String(d.downlinks).split(/;\s*/).filter(Boolean).map((line, i) => (
                          <div key={i} className="text-[11px] text-slate-200 font-sans leading-snug pl-2 border-l-2 border-sky-500/40">{line.trim()}</div>
                        ))}
                      </div>
                    </div>
                  )}
                  <InfoRow label="Routing" value={d.routingProtocols || '—'} />
                  <InfoRow label="OSPF Areas" value={d.ospfAreas || '—'} />
                </InfoCard>
                {d.notes && (
                  <InfoCard title="Notes">
                    <div className="text-[11px] text-slate-300 font-sans leading-relaxed">{d.notes}</div>
                  </InfoCard>
                )}
                <InfoCard title="Quick Stats">
                  <InfoRow label="Interfaces" value={Array.isArray(d.interfaces) ? `${d.interfaces.length} configured` : (typeof d.interfaces === 'string' ? 'see notes' : 'N/A')} accent="text-emerald-300" />
                  <InfoRow label="BGP Neighbors" value={d.bgpNeighbors ? `${d.bgpNeighbors.length} peers` : 'N/A'} accent="text-amber-300" />
                  <InfoRow label="Tunnels" value={(d.tunnels?.length || 0) + (d.dciTunnels?.length || 0) > 0 ? `${(d.tunnels?.length||0)+(d.dciTunnels?.length||0)} (${d.tunnels?.length||0} GRE/IPsec${d.dciTunnels?.length ? ' + '+(d.dciTunnels.length)+' DCI' : ''})` : 'N/A'} accent="text-sky-300" />
                </InfoCard>
                {simulationMode && (
                  <button
                    onClick={onToggleFail}
                    className={`w-full py-2.5 rounded-xl font-bold text-sm border transition-all ${
                      isFailed ? 'bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-500'
                      : 'bg-red-600/80 hover:bg-red-500 text-white border-red-500'
                    }`}
                  >
                    {isFailed ? '↻ Restore Device' : '✕ Simulate Device Failure'}
                  </button>
                )}
              </>
            )}
          </div>
        )}

        {activeTab === 'interfaces' && (
          <div className="space-y-2 animate-tab">
            {/* Switch/router with string interfaces (semicolon-separated port list) */}
            {typeof d.interfaces === 'string' && d.interfaces.length > 5 ? (() => {
              const ports = d.interfaces.split(/;\s*/).map(s => s.trim()).filter(Boolean);
              // Parse each line: "PortName → Description (details)" or "PortName (details, vlan X, ...)"
              const parsed = ports.map(line => {
                // Try to extract leading port name
                const m = line.match(/^([A-Z][a-z]*\d+(?:\/\d+){0,3}(?:\.\d+)?(?:‑[A-Z]+)?)\s*(.*)$/);
                if (m) {
                  return { name: m[1], desc: m[2].trim() };
                }
                return { name: line, desc: '' };
              });
              return (
                <>
                  <div className="text-[11px] text-slate-400 font-sans font-bold uppercase tracking-wider mb-1">
                    Ports ({parsed.length})
                  </div>
                  <div className="bg-slate-900/70 rounded-lg border border-slate-800 overflow-hidden">
                    <table className="w-full text-[11px]">
                      <thead>
                        <tr className="border-b border-slate-800 bg-slate-900/80">
                          <th className="text-left px-2 py-1.5 text-cyan-300 font-mono font-bold w-[110px]">Port</th>
                          <th className="text-left px-2 py-1.5 text-slate-300">Description / Detail</th>
                        </tr>
                      </thead>
                      <tbody>
                        {parsed.map((p, i) => {
                          const isShut = /shut|decommissioned|removed/i.test(p.desc);
                          const isUp = !isShut && !/^Vlan\d/i.test(p.name) && !/^Null0/i.test(p.name);
                          return (
                            <tr key={i} className={`border-b border-slate-800/40 ${isShut ? 'bg-rose-950/20' : 'hover:bg-slate-800/30'}`}>
                              <td className="px-2 py-1 font-mono font-bold text-cyan-300 align-top">
                                {p.name}
                              </td>
                              <td className="px-2 py-1 text-slate-300">
                                <span className={isShut ? 'text-rose-400 font-semibold' : ''}>{p.desc}</span>
                                {isShut && <span className="text-[9px] ml-1.5 px-1 rounded bg-rose-500/30 text-rose-200 font-bold">SHUT</span>}
                                {!isShut && /10G/i.test(p.desc) && <span className="text-[9px] ml-1.5 px-1 rounded bg-sky-500/20 text-sky-300 font-bold">10G</span>}
                                {!isShut && /1 Gbps|1G/i.test(p.desc) && !/10G/.test(p.desc) && <span className="text-[9px] ml-1.5 px-1 rounded bg-emerald-500/20 text-emerald-300 font-bold">1G</span>}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              );
            })() : Array.isArray(d.interfaces) && d.interfaces.length > 0 ? (
              <>
                <div className="text-[11px] text-slate-400 font-sans font-bold uppercase tracking-wider mb-1">
                  Active Interfaces ({d.interfaces.length})
                </div>
                {d.interfaces.map((intf, idx) => (
                  <div key={idx} className="bg-slate-900/70 p-3 rounded-lg border border-slate-800 hover:border-slate-700 space-y-1">
                    <div className="flex justify-between items-center flex-wrap gap-1">
                      <span className="text-cyan-300 font-bold">{intf.name || intf.port}</span>
                      <div className="flex items-center gap-1.5">
                        {intf.vlan && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">VLAN {intf.vlan}</span>
                        )}
                        {intf.nat && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">NAT {intf.nat}</span>
                        )}
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                          (intf.status || 'up') === 'up' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'
                        }`}>{(intf.status || 'UP').toUpperCase()}</span>
                      </div>
                    </div>
                    {(intf.ip || intf.mode) && <div className="text-slate-200 text-[11px]">{intf.ip || intf.mode}</div>}
                    <div className="text-[11px] text-slate-400 font-sans">{intf.description || intf.desc}</div>
                  </div>
                ))}
              </>
            ) : (
              <div className="text-slate-500 p-6 text-center bg-slate-900/40 rounded-lg border border-slate-800/50">No interfaces mapped.</div>
            )}
          </div>
        )}

        {activeTab === 'bgp' && (
          <div className="space-y-3 animate-tab">
            {/* Rich ISP BGP neighbors (new format) */}
            {Array.isArray(d.bgpNeighbors) && d.bgpNeighbors.length > 0 && d.bgpNeighbors[0]?.peer ? (
              <>
                <div className="text-[11px] text-slate-400 font-sans font-bold uppercase tracking-wider">
                  BGP Neighbors — AS{d.bgpAsn} ({d.bgpNeighbors.length} sessions)
                </div>
                <div className="grid gap-1.5">
                  {d.bgpNeighbors.map((peer, idx) => {
                    const isPri = peer.priority === 'PRI';
                    const typeColor = peer.type === 'INT' ? 'text-sky-300' : 'text-violet-300';
                    return (
                      <div key={idx} className="bg-slate-900/70 p-2 rounded-lg border border-slate-800 flex items-center gap-2">
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded font-mono ${isPri ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'}`}>
                          {peer.priority}
                        </span>
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${typeColor} bg-slate-800/80`}>{peer.type}</span>
                        <span className="flex-1 text-[11px]">
                          <span className="text-cyan-300 font-mono font-bold">{peer.peer}</span>
                          <span className="text-slate-500 mx-1">→</span>
                          <span className="text-white font-bold">{peer.isp}</span>
                          <span className="text-slate-400 ml-1 font-mono">AS{peer.asn}</span>
                        </span>
                        <span className="text-[10px] font-mono text-amber-300 font-bold">w={peer.weight}</span>
                        {peer.bfd && <span className="text-[9px] text-emerald-400 font-mono">BFD</span>}
                        {peer.prepend > 0 && <span className="text-[9px] text-amber-400 font-mono">prepend+{peer.prepend}</span>}
                      </div>
                    );
                  })}
                </div>
              </>
            ) : Array.isArray(d.bgpNeighbors) && d.bgpNeighbors.length > 0 ? (
              <>
                <div className="text-[11px] text-slate-400 font-sans font-bold uppercase tracking-wider">BGP Neighbors ({d.bgpNeighbors.length})</div>
                {d.bgpNeighbors.map((peer, idx) => (
                  <div key={idx} className="bg-slate-900/70 p-3 rounded-lg border border-slate-800 space-y-1">
                    <div className="flex justify-between">
                      <span className="text-amber-300 font-bold">{peer.ip}</span>
                      <span className="text-slate-300 font-bold">AS {peer.as}</span>
                    </div>
                    <div className="text-slate-400 text-[11px] font-sans">{peer.desc}</div>
                  </div>
                ))}
              </>
            ) : (
              <div className="text-slate-500 p-4 text-center bg-slate-900/40 rounded-lg border border-slate-800/50">No BGP peers configured.</div>
            )}
            {/* PBR Policy summary */}
            {Array.isArray(d.pbrPolicy) && d.pbrPolicy.length > 0 && (
              <div className="mt-2 pt-3 border-t border-slate-800">
                <div className="text-[11px] text-slate-400 font-sans font-bold uppercase tracking-wider mb-2">PBR Route-Map ({d.pbrPolicy.length} sequences)</div>
                {d.pbrPolicy.map((seq) => (
                  <div key={seq.seq} className="bg-slate-900/50 rounded border border-slate-800 p-2 mb-1 text-[10px]">
                    <span className="font-mono text-violet-400 font-bold">seq {seq.seq}</span>
                    <span className="text-slate-300 ml-2 font-mono">{seq.name}</span>
                    {seq.nextHops && seq.nextHops.length > 0 && (
                      <div className="text-slate-500 text-[9px] mt-0.5">
                        → {seq.nextHops.map(h => h.label).join(' → ')}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            {/* NAT Pools summary */}
            {Array.isArray(d.natPools) && d.natPools.length > 0 && (
              <div className="mt-2 pt-3 border-t border-slate-800">
                <div className="text-[11px] text-slate-400 font-sans font-bold uppercase tracking-wider mb-2">NAT Pools ({d.natPools.length})</div>
                {d.natPools.map((p, i) => (
                  <div key={i} className="bg-slate-900/50 rounded border border-slate-800 p-2 mb-1 text-[10px] flex items-center gap-2">
                    <span className="text-sky-300 font-mono font-bold">{p.name}</span>
                    <span className="text-slate-400 font-mono flex-1">{p.range}</span>
                    <span className="text-slate-500 text-[9px]">{p.type}</span>
                  </div>
                ))}
              </div>
            )}
            {typeof d.ospfAreas === 'string' && d.ospfAreas ? (
              <div className="mt-4">
                <div className="text-[11px] text-slate-400 font-sans font-bold uppercase tracking-wider mb-2">OSPF Areas</div>
                <div className="bg-slate-900/70 p-3 rounded-lg border border-slate-800 text-[11px] text-slate-300 font-sans whitespace-pre-wrap">{d.ospfAreas}</div>
              </div>
            ) : Array.isArray(d.ospfAreas) && d.ospfAreas.length > 0 && (
              <div className="mt-4 space-y-2">
                <div className="text-[11px] text-slate-400 font-sans font-bold uppercase tracking-wider">OSPF Areas</div>
                {d.ospfAreas.map((area, idx) => (
                  <div key={idx} className="bg-slate-900/70 p-3 rounded-lg border border-slate-800">
                    <div className="text-emerald-400 font-bold mb-1.5 text-[11px]">{area.area}</div>
                    <div className="text-[11px] text-slate-400 space-y-0.5">{area.networks.map((net, i) => <div key={i}>• {net}</div>)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'vlans' && (
          <div className="space-y-2 animate-tab">
            {typeof d.vlans === 'string' && d.vlans ? (() => {
              // Parse "120(ADN-INT-PRI), 219(ADN-DATA-PRI), 502(AGNI-INT-PRI)" format
              const entries = d.vlans.split(/,\s*/).map(s => s.trim()).filter(Boolean);
              // Categorize VLANs
              const ispVlans = entries.filter(e => /ADN|AGNI|Brac|INT|DATA|PRI|SEC/i.test(e) && !/FW/i.test(e));
              const internalVlans = entries.filter(e => /FW|PBR|RT-FW|MGMT|SVI/i.test(e) || /via ISL/i.test(e));
              return (
                <>
                  <div className="text-[11px] text-slate-400 font-sans font-bold uppercase tracking-wider mb-1">
                    VLANs ({entries.length} total)
                  </div>
                  {ispVlans.length > 0 && (
                    <div className="mb-2">
                      <div className="text-[10px] text-sky-400 font-bold uppercase tracking-wider mb-1">ISP Trunk VLANs</div>
                      <div className="flex flex-wrap gap-1">
                        {ispVlans.map((v, i) => {
                          const vm = v.match(/^(\d+)\/?(\d+)?\(?([^)]*)\)?/);
                          const id = vm ? (vm[2] ? `${vm[1]}/${vm[2]}` : vm[1]) : v;
                          const name = vm ? vm[3] : v;
                          const isPri = /PRI/i.test(v) && !/SEC/i.test(v);
                          const isSec = /SEC/i.test(v);
                          return (
                            <span key={i} className={`text-[10px] px-1.5 py-1 rounded border font-mono ${
                              isPri ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' :
                              isSec ? 'bg-amber-500/15 text-amber-300 border-amber-500/30' :
                              'bg-purple-500/15 text-purple-300 border-purple-500/30'
                            }`}>
                              <b>{id}</b>{name && <span className="text-slate-400 ml-1 font-sans">{name}</span>}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {internalVlans.length > 0 && (
                    <div className="mb-2">
                      <div className="text-[10px] text-violet-400 font-bold uppercase tracking-wider mb-1">Internal / Transit VLANs</div>
                      <div className="flex flex-wrap gap-1">
                        {internalVlans.map((v, i) => {
                          const vm = v.match(/^(\d+)\/?(\d+)?\(?([^)]*)\)?/);
                          const id = vm ? (vm[2] ? `${vm[1]}/${vm[2]}` : vm[1]) : v;
                          const name = vm ? vm[3] : v;
                          return (
                            <span key={i} className="text-[10px] px-1.5 py-1 rounded border bg-rose-500/15 text-rose-300 border-rose-500/30 font-mono">
                              <b>{id}</b>{name && <span className="text-slate-400 ml-1 font-sans">{name}</span>}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </>
              );
            })() : Array.isArray(d.vlans) && d.vlans.length > 0 ? (
              <>
                <div className="text-[11px] text-slate-400 font-sans font-bold uppercase tracking-wider mb-1">Configured VLANs ({d.vlans.length})</div>
                <div className="grid grid-cols-1 gap-2">
                  {d.vlans.map((vlan, idx) => (
                    <div key={idx} className="bg-slate-900/70 p-3 rounded-lg border border-slate-800 flex justify-between items-center gap-2">
                      <div>
                        <span className="text-purple-300 font-bold">VLAN {vlan.id}</span>
                        <span className="text-slate-200 ml-3">{vlan.name}</span>
                      </div>
                      {vlan.ports && <span className="text-[10px] text-slate-400 font-sans max-w-[180px] text-right truncate">{vlan.ports}</span>}
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="text-slate-500 p-4 text-center bg-slate-900/40 rounded-lg border border-slate-800/50">No VLANs configured.</div>
            )}
          </div>
        )}

        {activeTab === 'tunnels' && (
          <div className="space-y-2 animate-tab">
            {/* GRE/IPsec branch + special tunnels (from d.tunnels) */}
            {Array.isArray(d.tunnels) && d.tunnels.length > 0 && (
              <>
                <div className="text-[11px] text-slate-400 font-sans font-bold uppercase tracking-wider mb-1">
                  GRE / IPsec Tunnels ({d.tunnels.length})
                </div>
                <div className="space-y-1.5">
                  {d.tunnels.map((tun, idx) => {
                    const isDr = /DR|100G/i.test(tun.desc || tun.name || '');
                    const isBranch = /branch|CSM|WSMS|remote/i.test(tun.desc || tun.name || '');
                    const isSpecial = !isDr && !isBranch;
                    const accent = isDr ? 'border-orange-500/30 bg-orange-500/10' :
                                   isBranch ? 'border-emerald-500/30 bg-emerald-500/10' :
                                   'border-sky-500/30 bg-sky-500/10';
                    const iconColor = isDr ? 'text-orange-400' : isBranch ? 'text-emerald-400' : 'text-sky-400';
                    const badge = isDr ? 'DR' : isBranch ? 'BRANCH' : 'SPECIAL';
                    const badgeColor = isDr ? 'bg-orange-500/20 text-orange-300' :
                                       isBranch ? 'bg-emerald-500/20 text-emerald-300' :
                                       'bg-sky-500/20 text-sky-300';
                    return (
                      <div key={`t-${idx}`} className={`p-2.5 rounded-lg border ${accent} space-y-0.5`}>
                        <div className="flex items-center gap-2 flex-wrap">
                          <Radio size={13} className={iconColor + ' flex-shrink-0'} />
                          <span className="text-cyan-300 font-bold font-mono text-[11px]">{tun.name}</span>
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${badgeColor}`}>{badge}</span>
                          {tun.speed && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300">{tun.speed}</span>}
                          {tun.count && <span className="text-[9px] text-slate-400 font-mono">{tun.count}</span>}
                          {tun.mtu && <span className="text-[9px] text-slate-500 font-mono">MTU {tun.mtu}</span>}
                        </div>
                        {tun.desc && <div className="text-[11px] text-slate-300 pl-5">{tun.desc}</div>}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
            {/* DCI tunnels (from d.dciTunnels if present as array of strings) */}
            {Array.isArray(d.dciTunnels) && d.dciTunnels.length > 0 && (
              <>
                <div className="text-[11px] text-slate-400 font-sans font-bold uppercase tracking-wider mb-1 mt-2">
                  DCI Links ({d.dciTunnels.length})
                </div>
                {d.dciTunnels.map((tun, idx) => (
                  <div key={`d-${idx}`} className="bg-slate-900/70 p-2 rounded-lg border border-slate-800 flex items-center gap-2">
                    <Zap size={14} className="text-amber-400 flex-shrink-0" />
                    <span className="text-[11px] text-slate-200">{tun}</span>
                  </div>
                ))}
              </>
            )}
            {(!Array.isArray(d.tunnels) || d.tunnels.length === 0) && (!Array.isArray(d.dciTunnels) || d.dciTunnels.length === 0) && (
              <div className="text-slate-500 p-4 text-center bg-slate-900/40 rounded-lg border border-slate-800/50">No tunnels configured.</div>
            )}
          </div>
        )}

        {activeTab === 'details' && (
          <div className="space-y-3 font-sans animate-tab">
            <InfoCard title="System Profile">
              <InfoRow label="Role" value={d.role || 'Network Device'} />
              <InfoRow label="Model" value={d.model || 'N/A'} />
              <InfoRow label="OS / Firmware" value={d.osVersion || d.os || 'N/A'} />
              {d.serialNumber && <InfoRow label="Serial Number" value={d.serialNumber} />}
              <InfoRow label="Domain" value={d.domain || 'waltonbd.com'} />
            </InfoCard>
            <InfoCard title="Infrastructure Services">
              <InfoRow label="TACACS+ Server" value={d.tacacsServer || '172.21.1.18'} />
              <InfoRow label="NTP Server" value={d.ntpServer || '192.168.119.168'} />
              <InfoRow label="Syslog Server" value={d.syslogServer || d.syslogHost || '192.168.100.121'} />
            </InfoCard>
            {d.bgpAs && (
              <InfoCard title="Routing Configuration">
                <InfoRow label="Local AS" value={d.bgpAs} accent="text-amber-300" />
                {d.ospfProcess && <InfoRow label="OSPF Process" value={d.ospfProcess} />}
                <InfoRow label="iBGP" value="Full Mesh / Route Reflectors" />
              </InfoCard>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function InfoCard({ title, children }) {
  return (
    <div className="bg-slate-900/70 p-3 rounded-lg border border-slate-800 space-y-2">
      <div className="text-slate-400 font-bold uppercase text-[10px] tracking-wider mb-1">{title}</div>
      {children}
    </div>
  );
}

function InfoRow({ label, value, accent = 'text-slate-200' }) {
  return (
    <div className="flex justify-between items-start gap-2 text-[11px]">
      <span className="text-slate-500 flex-shrink-0">{label}:</span>
      <span className={`${accent} text-right break-all`}>{value || '—'}</span>
    </div>
  );
}

function EditRow({ label, value, onChange, multiline = false, placeholder = '' }) {
  return (
    <div className="flex flex-col gap-1 text-[11px]">
      <span className="text-slate-500 text-[10px] uppercase tracking-wider">{label}</span>
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={2}
          className="w-full bg-slate-950 border border-slate-700 focus:border-cyan-500 rounded px-2 py-1.5 text-slate-200 text-[11px] font-mono resize-y focus:outline-none focus:ring-1 focus:ring-cyan-500/40"
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full bg-slate-950 border border-slate-700 focus:border-cyan-500 rounded px-2 py-1.5 text-slate-200 text-[11px] font-mono focus:outline-none focus:ring-1 focus:ring-cyan-500/40"
        />
      )}
    </div>
  );
}
