import React, { useState, useEffect, useRef } from 'react';
import { SpotifyAuth, AuthDiagnostic } from '../services/spotifyAuth';
import { SpotifyApi } from '../services/spotifyApi';
import { apiLogger } from '../services/apiLogger';
import { Haptics } from '../services/haptics';
import { SpotifyDevice } from '../types';

interface TestDataViewProps {
  onBack: () => void;
}

const TestDataView: React.FC<TestDataViewProps> = ({ onBack }) => {
  const [loading, setLoading] = useState<string | null>(null);
  const [diag, setDiag] = useState<AuthDiagnostic | null>(null);
  const [diagReady, setDiagReady] = useState(false);
  const [devices, setDevices] = useState<SpotifyDevice[]>([]);
  const [lastRunStats, setLastRunStats] = useState<any>(null);
  const [logs, setLogs] = useState<any[]>([]);
  const [autoScroll, setAutoScroll] = useState(true);
  
  const logContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const scroller = document.getElementById('main-content-scroller');
    if (scroller) scroller.scrollTop = 0;

    fetchDiagnosticData();
    
    const stats = localStorage.getItem('spotify_buddy_last_run_stats');
    if (stats) {
      try {
        setLastRunStats(JSON.parse(stats));
      } catch (e) {
        console.warn("Could not parse last run stats");
      }
    }

    const unsubscribe = apiLogger.subscribe((newLogs) => {
      setLogs([...newLogs].reverse());
    });
    return unsubscribe;
  }, []);

  const fetchDiagnosticData = async () => {
    setLoading("Refreshing State...");
    try {
      const authInfo = await SpotifyAuth.getDiagnosticInfo();
      setDiag(authInfo);
      
      if (authInfo?.debug?.connected) {
        const list = await SpotifyApi.getDevices();
        setDevices(list || []);
      }
    } catch (e: any) {
      console.error("diag_init_error:", e.message);
    } finally {
      setLoading(null);
      setDiagReady(true);
    }
  };

  useEffect(() => {
    if (autoScroll && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const activeDevice = devices.find(d => d.is_active);

  const copyDebugInfo = () => {
    Haptics.light();
    // PROMPT REQUIREMENT: Copy the last 200 log lines to clipboard
    const info = {
      auth: diag,
      devices: devices,
      lastRun: lastRunStats,
      logs: logs.slice(0, 200) // logs is already reversed, so slice(0, 200) is the 200 newest entries
    };
    navigator.clipboard.writeText(JSON.stringify(info, null, 2));
    alert("Debug bundle (including last 200 logs) copied to clipboard.");
  };

  const renderBootSection = () => {
    const d = diag?.debug;
    if (!d) {
      return (
        <div className="col-span-2 p-6 bg-red-500/5 border border-red-500/20 rounded-3xl text-center">
          <p className="text-zinc-500 font-garet text-sm">Diagnostics unavailable (not initialized).</p>
        </div>
      );
    }

    return (
      <>
        <StatusPanel 
          label="Auth Ready" 
          value={d.authReady ? "YES" : "NO"} 
          color={d.authReady ? "text-palette-emerald" : "text-palette-pink"}
          subtext="Boot handshake finished"
        />
        <StatusPanel 
          label="Persistence Key" 
          value={d.tokenStorageKeyUsed || "N/A"} 
          color="text-[#A9E8DF]"
          subtext="Stable storage identifier"
        />
        <StatusPanel 
          label="Token Discovery" 
          value={d.tokenFoundOnBoot ? "FOUND" : "MISSING"} 
          color={d.tokenFoundOnBoot ? "text-palette-emerald" : "text-zinc-500"}
          subtext={d.migratedFromKey ? `Migrated from: ${d.migratedFromKey}` : "Native key active"}
        />
        <StatusPanel 
          label="Session Expiry" 
          value={d.expiresInMin !== null && d.expiresInMin !== undefined ? `${d.expiresInMin} min` : "N/A"} 
          color="text-[#A9E8DF]"
          subtext="Time until next refresh"
        />
        <StatusPanel 
          label="Last Refresh Status" 
          value={d.refreshAttempted ? (d.lastRefreshError ? "FAILED" : "SUCCESS") : "IDLE"} 
          color={d.lastRefreshError ? "text-red-500" : (d.refreshAttempted ? "text-palette-emerald" : "text-zinc-500")}
          subtext={d.lastRefreshError || "No recent failures"}
        />
        <StatusPanel 
          label="AppState Connected" 
          value={d.connected ? "TRUE" : "FALSE"} 
          color={d.connected ? "text-palette-emerald" : "text-palette-pink"}
          subtext="Connectivity flag state"
        />
      </>
    );
  };

  return (
    <div className="pt-24 px-4 animate-in slide-in-from-right duration-300 pb-40">
      <header className="mb-10 flex items-center justify-between px-2">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="text-palette-pink font-bold active:scale-90 transition-transform">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-5xl font-mango header-ombre">Diagnostics</h1>
        </div>
        {loading && (
          <div className="bg-palette-pink text-white text-[9px] font-black px-3 py-1.5 rounded-full animate-pulse uppercase tracking-widest">
            BUSY
          </div>
        )}
      </header>

      <div className="flex flex-col gap-6">
        <section>
          <h2 className="text-[10px] font-black text-zinc-600 uppercase tracking-widest ml-4 mb-3">Auth Persistence & Stability</h2>
          <div className="grid grid-cols-2 gap-4">
            {diagReady ? renderBootSection() : (
              <div className="col-span-2 py-12 flex justify-center">
                <div className="w-6 h-6 border-2 border-palette-pink/30 border-t-palette-pink rounded-full animate-spin" />
              </div>
            )}
          </div>
        </section>

        <section>
          <h2 className="text-[10px] font-black text-zinc-600 uppercase tracking-widest ml-4 mb-3">Debug Actions</h2>
          <div className="grid grid-cols-2 gap-3">
             <ActionButton label="Refresh Logic" icon="🔄" onClick={fetchDiagnosticData} />
             <ActionButton label="Force Link" icon="🔌" onClick={() => SpotifyAuth.login()} />
             <ActionButton label="Copy Bundle" icon="📦" onClick={copyDebugInfo} />
             <ActionButton label="Flush Buffer" icon="🧹" onClick={() => apiLogger.clear()} />
          </div>
        </section>

        <div className="bg-black/60 backdrop-blur-3xl rounded-[32px] border border-white/10 overflow-hidden flex flex-col h-[400px]">
          <div className="bg-white/5 px-6 py-4 border-b border-white/10 flex justify-between items-center shrink-0">
             <span className="text-[10px] font-black text-zinc-600 uppercase tracking-widest">Auth & Network Buffer ({logs.length})</span>
             <button onClick={() => setAutoScroll(!autoScroll)} className={`text-[9px] font-black uppercase tracking-widest px-3 py-1 rounded-full border ${autoScroll ? 'bg-palette-emerald/20 border-palette-emerald/40 text-palette-emerald' : 'bg-zinc-800 text-zinc-600'}`}>
                Auto: {autoScroll ? 'ON' : 'OFF'}
             </button>
          </div>
          <div ref={logContainerRef} className="flex-1 overflow-y-auto p-4 font-mono text-[10px] space-y-2">
            {logs.length === 0 ? (
               <div className="h-full flex items-center justify-center text-zinc-800 uppercase tracking-widest font-black text-[9px]">
                  No technical activity recorded
               </div>
            ) : (
              logs.map((log, i) => (
                <div key={i} className="flex gap-2 leading-tight">
                  <span className="text-zinc-600 shrink-0">[{log.timestamp}]</span>
                  <span className={`${log.type === 'error' || (log.status && log.status >= 400) ? 'text-red-400' : 'text-zinc-400'} break-all`}>
                    {log.method} {log.url} {log.status ? `-> ${log.status}` : ''}
                    {log.message ? ` - ${log.message}` : ''}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const StatusPanel: React.FC<{ label: string; value: string; color: string; subtext: string }> = ({ label, value, color, subtext }) => (
  <div className="glass-panel-gold rounded-3xl p-4 border border-white/5">
     <span className="text-[9px] font-black text-zinc-600 uppercase tracking-widest">{label}</span>
     <div className={`text-sm font-garet font-bold mt-1 truncate ${color}`}>{value}</div>
     <div className="text-[8px] font-mono text-zinc-700 uppercase mt-1 truncate">{subtext}</div>
  </div>
);

const ActionButton: React.FC<{ label: string; icon: string; onClick: () => void }> = ({ label, icon, onClick }) => (
  <button 
    onClick={() => { Haptics.medium(); onClick(); }}
    className="bg-white/5 border border-white/10 rounded-2xl p-4 flex flex-col gap-1 items-center justify-center active:bg-white/10 transition-all active:scale-95"
  >
    <span className="text-xl">{icon}</span>
    <span className="text-zinc-400 font-black text-[9px] uppercase tracking-widest">{label}</span>
  </button>
);

export default TestDataView;