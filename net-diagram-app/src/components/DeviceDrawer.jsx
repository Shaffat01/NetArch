import React from 'react';
import { 
  X, 
  Network, 
  ShieldCheck, 
  Layers, 
  Clock, 
  Cpu, 
  Server, 
  Terminal, 
  CheckCircle2 
} from 'lucide-react';

const DeviceDrawer = ({ device, onClose }) => {
  if (!device) return null;

  return (
    <div className="absolute right-0 top-0 w-[420px] h-full bg-slate-950/95 border-l border-slate-800 backdrop-blur-2xl z-30 p-6 flex flex-col shadow-2xl overflow-y-auto animate-in slide-in-from-right duration-300 text-slate-200">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-slate-800">
        <div>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 uppercase">
            {device.deviceType}
          </span>
          <h2 className="text-lg font-bold text-white mt-1">{device.hostname}</h2>
          <p className="text-xs text-slate-400 font-mono">Site: {device.site || 'DC'} | {device.model}</p>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800 transition"
        >
          <X size={18} />
        </button>
      </div>

      {/* Overview Specs */}
      <div className="grid grid-cols-2 gap-3 my-4">
        <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-800">
          <span className="text-[10px] text-slate-400 font-mono block">MANAGEMENT IP</span>
          <span className="text-xs font-bold text-cyan-300 font-mono">{device.mgmtIP || 'N/A'}</span>
          <span className="text-[9px] text-slate-500 font-mono block mt-0.5">VRF: {device.mgmtVrf || 'default'}</span>
        </div>
        <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-800">
          <span className="text-[10px] text-slate-400 font-mono block">OS / FIRMWARE</span>
          <span className="text-xs font-bold text-emerald-300 font-mono">{device.osVersion || 'IOS-XE 17.3'}</span>
          <span className="text-[9px] text-slate-500 font-mono block mt-0.5">Domain: {device.domain || 'waltonbd.com'}</span>
        </div>
      </div>

      {/* AAA / TACACS / NTP Info */}
      <div className="mb-4 p-3 rounded-lg bg-slate-900/60 border border-slate-800/80 text-xs font-mono space-y-1">
        <div className="flex justify-between">
          <span className="text-slate-400">TACACS+ Server:</span>
          <span className="text-slate-200">{device.tacacsServer || '172.21.1.18'}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-400">NTP Server:</span>
          <span className="text-slate-200">{device.ntpServer || '192.168.119.168'}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-400">Syslog Server:</span>
          <span className="text-slate-200">{device.syslogServer || '192.168.100.121'}</span>
        </div>
      </div>

      {/* Interfaces Table */}
      <div className="mb-4">
        <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
          <Network size={14} className="text-cyan-400" />
          Active Interfaces ({device.interfaces ? device.interfaces.length : 0})
        </h3>
        <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
          {device.interfaces && device.interfaces.map((intf, idx) => (
            <div key={idx} className="p-2 rounded bg-slate-900/90 border border-slate-800/80 text-[11px] font-mono">
              <div className="flex items-center justify-between font-bold text-cyan-300">
                <span>{intf.port}</span>
                <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-1 rounded">{intf.status}</span>
              </div>
              <p className="text-[10px] text-slate-400 mt-0.5 truncate">{intf.desc}</p>
              {intf.mode && <span className="text-[9px] text-indigo-300 block">{intf.mode}</span>}
            </div>
          ))}
        </div>
      </div>

      {/* VLAN Database */}
      {device.vlans && device.vlans.length > 0 && (
        <div className="mb-4">
          <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Layers size={14} className="text-indigo-400" />
            Configured VLANs ({device.vlans.length})
          </h3>
          <div className="grid grid-cols-2 gap-1.5 max-h-36 overflow-y-auto">
            {device.vlans.map((v, idx) => (
              <div key={idx} className="p-1.5 rounded bg-slate-900/80 border border-slate-800 text-[10px] font-mono flex justify-between">
                <span className="text-indigo-300 font-bold">VLAN {v.id}</span>
                <span className="text-slate-400 truncate">{v.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default DeviceDrawer;