import React, { memo } from 'react';
import { Handle, Position } from 'reactflow';
import { 
  Server, 
  Shield, 
  Cpu, 
  Network, 
  Cloud, 
  Activity, 
  CheckCircle2, 
  AlertTriangle 
} from 'lucide-react';

const getDeviceTheme = (deviceType) => {
  switch (deviceType) {
    case 'ISP / Cloud':
      return {
        border: 'border-sky-500/60 hover:border-sky-400',
        glow: 'shadow-[0_0_20px_rgba(56,189,248,0.25)]',
        bg: 'from-slate-900/95 to-sky-950/40',
        badge: 'bg-sky-500/20 text-sky-300 border-sky-500/40',
        icon: Cloud,
        accent: 'text-sky-400'
      };
    case 'WAN Switch':
      return {
        border: 'border-cyan-500/60 hover:border-cyan-400',
        glow: 'shadow-[0_0_20px_rgba(6,182,212,0.25)]',
        bg: 'from-slate-900/95 to-cyan-950/40',
        badge: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40',
        icon: Network,
        accent: 'text-cyan-400'
      };
    case 'Core Router':
      return {
        border: 'border-amber-500/60 hover:border-amber-400',
        glow: 'shadow-[0_0_20px_rgba(245,158,11,0.25)]',
        bg: 'from-slate-900/95 to-amber-950/40',
        badge: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
        icon: Cpu,
        accent: 'text-amber-400'
      };
    case 'Firewall':
      return {
        border: 'border-rose-500/60 hover:border-rose-400',
        glow: 'shadow-[0_0_20px_rgba(244,63,94,0.25)]',
        bg: 'from-slate-900/95 to-rose-950/40',
        badge: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
        icon: Shield,
        accent: 'text-rose-400'
      };
    case 'Core Switch':
      return {
        border: 'border-indigo-500/60 hover:border-indigo-400',
        glow: 'shadow-[0_0_20px_rgba(99,102,241,0.25)]',
        bg: 'from-slate-900/95 to-indigo-950/40',
        badge: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40',
        icon: Server,
        accent: 'text-indigo-400'
      };
    default:
      return {
        border: 'border-slate-600/60 hover:border-slate-400',
        glow: 'shadow-[0_0_15px_rgba(148,163,184,0.15)]',
        bg: 'from-slate-900/95 to-slate-800/40',
        badge: 'bg-slate-700/40 text-slate-300 border-slate-600/40',
        icon: Server,
        accent: 'text-slate-400'
      };
  }
};

const CustomDeviceNode = ({ data, selected }) => {
  const theme = getDeviceTheme(data.deviceType);
  const IconComponent = theme.icon;
  const isOnline = data.status === 'online';

  return (
    <div
      className={`relative min-w-[240px] max-w-[280px] rounded-xl border-2 p-3.5 backdrop-blur-xl bg-gradient-to-br transition-all duration-300 cursor-pointer ${
        theme.bg
      } ${theme.border} ${theme.glow} ${
        selected ? 'ring-2 ring-cyan-400 scale-[1.02] shadow-[0_0_30px_rgba(6,182,212,0.4)]' : ''
      }`}
    >
      {/* React Flow Connection Handles */}
      <Handle type="target" position={Position.Top} className="!w-3 !h-3 !bg-cyan-400 !border-2 !border-slate-900" />
      <Handle type="source" position={Position.Bottom} className="!w-3 !h-3 !bg-cyan-400 !border-2 !border-slate-900" />
      <Handle type="target" position={Position.Left} id="left" className="!w-3 !h-3 !bg-pink-400 !border-2 !border-slate-900" />
      <Handle type="source" position={Position.Right} id="right" className="!w-3 !h-3 !bg-pink-400 !border-2 !border-slate-900" />

      {/* Header: Device Type & Site Badge */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5">
          <div className={`p-1.5 rounded-lg bg-slate-800/80 border border-slate-700/60 ${theme.accent}`}>
            <IconComponent size={16} />
          </div>
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md border uppercase tracking-wider ${theme.badge}`}>
            {data.deviceType || 'Device'}
          </span>
        </div>

        {/* Site Pod Tag */}
        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30">
          {data.site || 'DC'}
        </span>
      </div>

      {/* Hostname */}
      <div className="mb-1">
        <h3 className="text-sm font-bold text-white tracking-wide truncate">
          {data.hostname || 'Unknown Host'}
        </h3>
      </div>

      {/* Management IP & Status */}
      <div className="flex items-center justify-between text-xs text-slate-300 font-mono mb-2.5">
        <div className="flex items-center gap-1.5">
          <span className="text-slate-400 text-[10px]">IP:</span>
          <span className="text-cyan-300 font-semibold">{data.mgmtIP || 'N/A'}</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="relative flex h-2 w-2">
            {isOnline && (
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            )}
            <span className={`relative inline-flex rounded-full h-2 w-2 ${isOnline ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
          </span>
          <span className={`text-[10px] uppercase font-bold ${isOnline ? 'text-emerald-400' : 'text-rose-400'}`}>
            {isOnline ? 'LIVE' : 'DOWN'}
          </span>
        </div>
      </div>

      {/* Port Matrix Mini LEDs */}
      <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between">
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Ports:</span>
          <div className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-sm bg-emerald-400 shadow-[0_0_6px_#34d399]"></span>
            <span className="w-1.5 h-1.5 rounded-sm bg-emerald-400 shadow-[0_0_6px_#34d399]"></span>
            <span className="w-1.5 h-1.5 rounded-sm bg-emerald-400 shadow-[0_0_6px_#34d399]"></span>
            <span className="w-1.5 h-1.5 rounded-sm bg-amber-400 animate-pulse"></span>
            <span className="w-1.5 h-1.5 rounded-sm bg-slate-600"></span>
            <span className="w-1.5 h-1.5 rounded-sm bg-slate-600"></span>
          </div>
        </div>
        <span className="text-[9px] font-mono text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700/50">
          {data.interfaces ? `${data.interfaces.length} IFs` : '24x25G'}
        </span>
      </div>
    </div>
  );
};

export default memo(CustomDeviceNode);