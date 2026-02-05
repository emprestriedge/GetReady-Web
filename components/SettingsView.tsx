import React, { useState, useEffect } from 'react';
import { RuleSettings, DataSourceType, SpotifyUser, AppConfig } from '../types';
import { BlockStore } from '../services/blockStore';
import PerOptionRulesView from './PerOptionRulesView';
import TestDataView from './TestDataView';
import BlockedTracksView from './BlockedTracksView';
import PodcastManagerView from './PodcastManagerView';
import DeveloperToolsView from './DeveloperToolsView';
import RapSourcesView from './RapSourcesView';
import { SpotifyAuth } from '../services/spotifyAuth';
import { Haptics } from '../services/haptics';
import { configStore } from '../services/configStore';
import { toastService } from '../services/toastService';

interface SettingsViewProps {
  config: AppConfig;
  rules: RuleSettings;
  setRules: React.Dispatch<React.SetStateAction<RuleSettings>>;
  spotifyUser: SpotifyUser | null;
  authError: string | null;
  authStatus: string;
  setAuthStatus: (s: any) => void;
}

export type SettingsMode = 'root' | 'perOption' | 'testData' | 'hiddenTracks' | 'podcasts' | 'devTools' | 'rapSources';

const SettingsView: React.FC<SettingsViewProps> = ({ config, rules, setRules, spotifyUser, authError, authStatus, setAuthStatus }) => {
  const [mode, setMode] = useState<SettingsMode>('root');
  const [blockedCount, setBlockedCount] = useState(0);
  const [rapLinkedCount, setRapLinkedCount] = useState(0);

  useEffect(() => {
    window.scrollTo(0, 0);
    const scroller = document.getElementById('main-content-scroller');
    if (scroller) scroller.scrollTop = 0;
  }, [mode]);

  useEffect(() => {
    setBlockedCount(BlockStore.getBlocked().length);
    const sources = config.catalog.rapSources || {};
    setRapLinkedCount(Object.values(sources).filter(s => s !== null).length);
  }, [mode, config]);

  const toggle = (key: keyof RuleSettings) => {
    Haptics.medium();
    setRules(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleConnect = async () => {
    if (!config.spotifyClientId) {
      toastService.show("Enter a Client ID first", "warning");
      return;
    }
    Haptics.impact();
    setAuthStatus('waiting');
    try {
      await SpotifyAuth.login();
    } catch (e: any) {
      setAuthStatus('error');
      Haptics.error();
      toastService.show(e.message, "error");
    }
  };

  const handleDisconnect = () => {
    Haptics.impact();
    if (confirm("Disconnect Spotify and clear authorization?")) {
      SpotifyAuth.hardReset();
      SpotifyAuth.logout();
    }
  };

  const currentRedirectUri = SpotifyAuth.getRedirectUri();

  if (mode === 'perOption') return <PerOptionRulesView onBack={() => setMode('root')} />;
  if (mode === 'testData') return <TestDataView onBack={() => setMode('devTools')} />;
  if (mode === 'hiddenTracks') return <BlockedTracksView onBack={() => setMode('root')} />;
  if (mode === 'podcasts') return <PodcastManagerView rules={rules} setRules={setRules} onBack={() => setMode('devTools')} />;
  if (mode === 'rapSources') return <RapSourcesView onBack={() => setMode('root')} />;
  if (mode === 'devTools') return <DeveloperToolsView onBack={() => setMode('root')} onNavigate={setMode} />;

  return (
    <div className="h-full overflow-y-auto pt-24 pb-40 px-4 animate-in fade-in duration-500 w-full max-w-full overflow-x-hidden box-border ios-scroller z-0 relative">
      <header className="mb-10 pl-5 pr-4">
        <h1 className="text-7xl font-mango header-ombre leading-none tracking-tighter">Settings</h1>
      </header>

      <div className="flex flex-col gap-8 w-full max-w-full overflow-x-hidden">
        
        <section className="w-full">
          <div className="flex justify-between items-center mb-3 ml-5 pr-5">
            <h2 className="text-[11px] font-black text-zinc-500 uppercase tracking-[0.2em]">Spotify Connection</h2>
          </div>
          
          <div className="glass-panel-gold rounded-3xl overflow-hidden p-6 flex flex-col gap-6">
            <div className="flex flex-col gap-2">
              <label className="text-[10px] font-black text-zinc-600 uppercase tracking-widest px-1">Spotify Client ID</label>
              <input 
                type="text"
                value={config.spotifyClientId || ''}
                onChange={(e) => configStore.updateSpotifyClientId(e.target.value)}
                placeholder="Paste Client ID from Spotify Dev Dashboard"
                className="bg-black/40 border border-white/10 rounded-2xl px-5 py-4 text-[#D1F2EB] font-garet font-bold outline-none focus:border-palette-pink transition-all w-full"
              />
            </div>

            {!spotifyUser && config.spotifyClientId && (
              <div className="bg-palette-pink/5 border border-palette-pink/20 rounded-2xl p-4 flex flex-col gap-2">
                <span className="text-[9px] font-black text-palette-pink uppercase tracking-widest">⚠️ Connection Troubleshooting</span>
                <p className="text-[11px] text-zinc-500 font-garet leading-tight">
                  Ensure the exact URL below is added to your Spotify Dashboard under <b>Redirect URIs</b>:
                </p>
                <div className="flex items-center gap-2 bg-black/40 p-3 rounded-xl border border-white/5 mt-1">
                  <code className="text-[10px] text-palette-teal font-mono truncate flex-1">{currentRedirectUri}</code>
                  <button 
                    onClick={() => {
                      navigator.clipboard.writeText(currentRedirectUri);
                      Haptics.light();
                      toastService.show("Copied to clipboard", "success");
                    }}
                    className="shrink-0 text-[9px] font-black text-white/40 uppercase tracking-widest active:text-white"
                  >
                    Copy
                  </button>
                </div>
              </div>
            )}

             {!spotifyUser ? (
               <button 
                 onClick={handleConnect}
                 disabled={!config.spotifyClientId}
                 className={`relative overflow-hidden w-full text-left rounded-[24px] p-5 flex items-center gap-6 group shadow-xl transition-all active:scale-95 ${
                   !config.spotifyClientId 
                   ? 'bg-zinc-800 opacity-40 grayscale cursor-not-allowed border border-white/5' 
                   : 'bg-gradient-to-br from-[#1DB954] via-[#1DB954] to-[#24cc5c] shadow-[#1DB954]/20 border border-white/15'
                 }`}
               >
                 {config.spotifyClientId && (
                   <div className="absolute top-1 left-2 w-[85%] h-[40%] bg-gradient-to-b from-white/40 to-transparent rounded-full blur-[1px] animate-jelly-shimmer pointer-events-none" />
                 )}
                 <div className="relative z-10 w-14 h-14 bg-black/20 rounded-2xl flex items-center justify-center shadow-lg overflow-hidden">
                    <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.494 17.306c-.215.353-.674.463-1.027.248-2.857-1.745-6.453-2.14-10.686-1.173-.404.093-.813-.162-.906-.566-.093-.404.162-.813.566-.906 4.63-1.06 8.598-.61 11.785 1.339.353.215.463.674.248 1.027zm1.467-3.264c-.271.44-.847.581-1.287.31-3.268-2.008-8.25-2.592-12.115-1.417-.496.15-1.022-.128-1.173-.623-.15-.496.128-1.022.623-1.173 4.417-1.34 9.907-.678 13.642 1.613.44.271.581.847.31 1.287zm.127-3.413C15.228 8.249 8.845 8.038 5.16 9.157c-.551.167-1.13-.153-1.297-.704-.167-.551.153-1.13.704-1.297 4.227-1.282 11.278-1.037 15.82 1.66.496.295.661.934.366 1.43-.295.496-.934.661-1.43.366z"/>
                    </svg>
                 </div>
                 <div className="relative z-10 flex-1">
                   <h3 className="text-xl font-garet font-bold text-white">Link Account</h3>
                   <p className="text-xs text-white/60 font-medium">Direct Redirect Flow</p>
                 </div>
                 <div className="relative z-10 bg-white/20 px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest text-white">Connect</div>
               </button>
             ) : (
               <div className="w-full flex flex-col gap-4">
                <div className="text-left bg-black/20 p-5 rounded-[24px] flex items-center gap-6 relative overflow-hidden border border-white/5">
                    <div className="relative">
                    {spotifyUser.images?.[0] ? (
                        <img src={spotifyUser.images[0].url} className="w-14 h-14 rounded-2xl object-cover shadow-lg border border-white/20" alt="Profile" />
                    ) : (
                        <div className="w-14 h-14 bg-zinc-800 rounded-2xl flex items-center justify-center text-zinc-600 font-black text-xl">{spotifyUser.display_name?.[0]}</div>
                    )}
                    <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-[#1DB954] rounded-full border-2 border-black" />
                    </div>
                    <div className="flex-1 min-w-0">
                    <h3 className="text-xl font-garet font-bold text-white leading-none truncate">{spotifyUser.display_name}</h3>
                    <p className="text-xs text-palette-emerald font-black uppercase tracking-widest mt-1.5">Active Session</p>
                    </div>
                    <button 
                        onClick={handleDisconnect}
                        className="px-3 py-2 bg-red-500/10 border border-red-500/30 rounded-xl text-[9px] font-black uppercase tracking-widest text-red-500 active:scale-95 transition-all shrink-0"
                    >
                        Logout
                    </button>
                </div>
               </div>
             )}
          </div>
        </section>

        <section className="w-full">
          <h2 className="text-[11px] font-black text-zinc-500 uppercase tracking-[0.2em] ml-5 mb-3">Custom Mix Rules</h2>
          <div className="glass-panel-gold rounded-3xl overflow-hidden divide-y divide-white/5">
            <SettingsRow 
              icon="⚙️" 
              label="Per-Mix Settings" 
              subtext="Customize individual mix logic" 
              onClick={() => { Haptics.medium(); setMode('perOption'); }} 
            />
            <SettingsRow 
              icon="📻" 
              label="Rap Mix Sources" 
              subtext={`Linked ${rapLinkedCount} sources`} 
              onClick={() => { Haptics.medium(); setMode('rapSources'); }} 
            />
            <SettingsRow 
              icon="🚫" 
              label="Hidden Tracks" 
              subtext={`Manage ${blockedCount} hidden items`} 
              onClick={() => { Haptics.medium(); setMode('hiddenTracks'); }} 
            />
            {rules.devMode && (
              <SettingsRow 
                icon="🛠️" 
                label="Developer Tools" 
                subtext="Advanced config & diagnostics" 
                onClick={() => { Haptics.medium(); setMode('devTools'); }} 
                highlight 
              />
            )}
          </div>
        </section>

        <section className="w-full">
          <h2 className="text-[11px] font-black text-zinc-500 uppercase tracking-[0.2em] ml-5 mb-3">Global Mix Logic</h2>
          <div className="glass-panel-gold rounded-3xl overflow-hidden divide-y divide-white/5">
            <div className="px-6 py-5 flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <span className="text-[20px] font-garet font-medium text-[#A9E8DF]">Playlist Length</span>
                <span className="text-palette-pink font-garet font-black text-2xl tabular-nums drop-shadow-0_0_8px_rgba(255,0,122,0.4)]">{rules.playlistLength}</span>
              </div>
              <input 
                type="range" 
                min="15" 
                max="75" 
                step="1" 
                value={rules.playlistLength} 
                onChange={(e) => {
                  Haptics.light();
                  setRules(prev => ({ ...prev, playlistLength: parseInt(e.target.value) }));
                }}
                className="w-full h-2 bg-zinc-800 rounded-full appearance-none cursor-pointer accent-palette-pink"
              />
            </div>
            <div className="px-6 py-5 flex items-center justify-between">
              <span className="text-[20px] font-garet font-medium text-[#A9E8DF]">Allow Explicit</span>
              <Toggle checked={rules.allowExplicit} onToggle={() => toggle('allowExplicit')} />
            </div>
             <div className="px-6 py-5 flex items-center justify-between">
              <span className="text-[20px] font-garet font-medium text-[#A9E8DF]">Avoid Repeats</span>
              <Toggle checked={rules.avoidRepeats} onToggle={() => toggle('avoidRepeats')} />
            </div>
          </div>
        </section>

        <section className="w-full">
          <h2 className="text-[11px] font-black text-zinc-500 uppercase tracking-[0.2em] ml-5 mb-3">Advanced</h2>
          <div className="glass-panel-gold rounded-3xl overflow-hidden divide-y divide-white/5">
            <div className="px-6 py-5 flex items-center justify-between">
              <div className="flex flex-col">
                <span className="text-[20px] font-garet font-medium text-[#A9E8DF]">Developer Mode</span>
                <span className="text-[10px] text-zinc-600 font-medium">Enable internal plumbing tools</span>
              </div>
              <Toggle checked={rules.devMode} onToggle={() => toggle('devMode')} />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

const SettingsRow: React.FC<{ icon: string; label: string; subtext: string; onClick: () => void; highlight?: boolean }> = ({ icon, label, subtext, onClick, highlight }) => (
  <button 
    onClick={onClick}
    className={`w-full px-6 py-5 flex items-center justify-between active:bg-white/5 transition-colors group ${highlight ? 'bg-palette-pink/5' : ''}`}
  >
    <div className="flex items-center gap-4 text-left min-w-0">
      <span className="text-2xl group-active:scale-110 transition-transform shrink-0">{icon}</span>
      <div className="flex flex-col min-w-0">
        <span className={`text-[20px] font-garet font-semibold transition-colors truncate ${highlight ? 'text-palette-pink' : 'text-[#A9E8DF]'}`}>{label}</span>
        <span className="text-[10px] text-zinc-600 font-medium truncate">{subtext}</span>
      </div>
    </div>
    <svg className="w-5 h-5 text-zinc-700 group-active:translate-x-1 transition-transform shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 5l7 7-7 7" />
    </svg>
  </button>
);

const Toggle: React.FC<{ checked: boolean; onToggle: () => void }> = ({ checked, onToggle }) => (
  <button 
    onClick={onToggle}
    className={`w-14 h-8 rounded-full transition-all relative active:scale-90 shrink-0 ${checked ? 'bg-palette-pink shadow-[0_0_12px_rgba(255,0,122,0.4)]' : 'bg-zinc-800'}`}
  >
    <div className={`absolute top-1 w-6 h-6 bg-white rounded-full shadow-lg transition-all ${checked ? 'left-[26px]' : 'left-1'}`} />
  </button>
);

export default SettingsView;