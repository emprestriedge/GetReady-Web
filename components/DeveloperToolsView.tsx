import React, { useState, useEffect, useMemo } from 'react';
import { configStore } from '../services/configStore';
import { catalogStore, CatalogConfig } from '../services/catalogStore';
import { SpotifyDataService } from '../services/spotifyDataService';
import { Haptics } from '../services/haptics';
import { PinkAsterisk } from './HomeView';
import { apiLogger } from '../services/apiLogger';
import { RAP_SOURCE_PLAYLIST_NAMES } from '../constants';
import { SpotifySource } from '../types';
import { ResourceResolver } from '../services/resourceResolver';
import { SettingsMode } from './SettingsView';
import { authStore } from '../services/authStore';
import { toastService } from '../services/toastService';

interface DeveloperToolsViewProps {
  onBack: () => void;
  onNavigate: (mode: SettingsMode) => void;
}

interface ResourceMetadata {
  id: string;
  name: string;
  owner: string;
  count: number;
}

const DeveloperToolsView: React.FC<DeveloperToolsViewProps> = ({ onBack, onNavigate }) => {
  const [config, setConfig] = useState<CatalogConfig>(catalogStore.get());
  const [metadata, setMetadata] = useState<Record<string, ResourceMetadata | null>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  
  const [showPasteId, setShowPasteId] = useState<string | null>(null);
  const [idInput, setIdInput] = useState("");
  const [showPickerFor, setShowPickerFor] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [userPlaylists, setUserPlaylists] = useState<any[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [showConfigSummary, setShowConfigSummary] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const coreSlots = [
    { key: 'shazamId', label: 'My Shazam Tracks', type: 'playlist' },
    { key: 'acoustic90sId', label: '90s Acoustic Alternative', type: 'playlist' },
    { key: 'a7xArtistId', label: 'Avenged Sevenfold (Artist)', type: 'artist' }
  ];

  useEffect(() => {
    const scroller = document.getElementById('main-content-scroller');
    if (scroller) scroller.scrollTop = 0;

    coreSlots.forEach(slot => {
      const id = config[slot.key as keyof CatalogConfig];
      if (typeof id === 'string' && id !== 'null' && id) verifyId(slot.key, id, slot.type);
    });

    RAP_SOURCE_PLAYLIST_NAMES.forEach(name => {
      const source = config.rapSources?.[name];
      if (source?.id) verifyId(`rap_${name}`, source.id, source.type);
    });
  }, []);

  const verifyId = async (key: string, id: string, type: string = 'playlist') => {
    setLoading(prev => ({ ...prev, [key]: true }));
    try {
      let data: any;
      let meta: ResourceMetadata;
      
      if (type === 'artist') {
        data = await SpotifyDataService.getArtistById(id);
        meta = { id, name: data.name, owner: 'Artist', count: data.popularity || 0 };
      } else if (type === 'album') {
        data = await SpotifyDataService.getAlbumById(id);
        meta = { id, name: data.name, owner: data.artists[0]?.name || 'Artist', count: data.tracks?.total || 0 };
      } else {
        data = await SpotifyDataService.getPlaylistById(id);
        meta = { id, name: data.name, owner: data.owner?.display_name || 'Spotify', count: data.tracks?.total || 0 };
      }
      setMetadata(prev => ({ ...prev, [key]: meta }));
    } catch (e) {
      setMetadata(prev => ({ ...prev, [key]: null }));
    } finally {
      setLoading(prev => ({ ...prev, [key]: false }));
    }
  };

  const handleRefreshCatalog = async () => {
    Haptics.impact();
    setRefreshing(true);
    try {
      await ResourceResolver.resolveAll();
      setConfig(catalogStore.get());
      toastService.show("Catalog sync complete", "success");
      Haptics.success();
    } catch (e: any) {
      apiLogger.logError(`Catalog refresh failed: ${e.message}`);
      toastService.show("Sync failed", "error");
    } finally {
      setRefreshing(false);
    }
  };

  const handlePasteId = () => {
    if (!showPasteId || !idInput.trim()) return;
    Haptics.medium();
    const cleanId = idInput.trim().split(':').pop() || '';
    
    if (showPasteId.startsWith('rap_')) {
      const slotName = showPasteId.replace('rap_', '');
      const newRapSources = { ...config.rapSources, [slotName]: { id: cleanId, type: 'playlist' as const } };
      catalogStore.set({ rapSources: newRapSources });
    } else {
      catalogStore.set({ [showPasteId]: cleanId });
    }
    
    const next = catalogStore.get();
    setConfig(next);
    verifyId(showPasteId, cleanId);
    setShowPasteId(null);
    setIdInput("");
    toastService.show("ID Linked", "success");
  };

  const handleResolveByName = async (key: string, label: string) => {
    Haptics.impact();
    setLoading(prev => ({ ...prev, [key]: true }));
    try {
      let id: string | null = null;
      if (key === 'a7xArtistId') {
        id = await SpotifyDataService.robustResolveArtist("Avenged Sevenfold");
      } else {
        const nameToSearch = label.replace(/\s*\(.*?\)\s*/g, '');
        id = await SpotifyDataService.resolvePlaylistByName(nameToSearch);
      }

      if (id) {
        if (key.startsWith('rap_')) {
          const slotName = key.replace('rap_', '');
          const newRapSources = { ...config.rapSources, [slotName]: { id, type: 'playlist' as const } };
          catalogStore.set({ rapSources: newRapSources });
        } else {
          catalogStore.set({ [key]: id });
        }
        setConfig(catalogStore.get());
        verifyId(key, id);
        toastService.show("Match found!", "success");
        Haptics.success();
      } else {
        toastService.show(`No match for "${label}"`, "warning");
      }
    } catch (e) {
      toastService.show("Search failed", "error");
    } finally {
      setLoading(prev => ({ ...prev, [key]: false }));
    }
  };

  const handleClear = (key: string) => {
    Haptics.medium();
    if (key.startsWith('rap_')) {
      const slotName = key.replace('rap_', '');
      const newRapSources = { ...config.rapSources };
      delete newRapSources[slotName];
      catalogStore.set({ rapSources: newRapSources });
    } else {
      catalogStore.set({ [key]: null });
    }
    setConfig(catalogStore.get());
    setMetadata(prev => ({ ...prev, [key]: null }));
    toastService.show("Slot cleared", "info");
  };

  const openPicker = async (key: string) => {
    Haptics.medium();
    setShowPickerFor(key);
    setSearchTerm("");
    setPickerLoading(true);
    try {
      const list = await ResourceResolver.fetchAllUserPlaylists();
      setUserPlaylists(list);
    } catch (e) {
      toastService.show("Library access failed", "error");
    } finally {
      setPickerLoading(false);
    }
  };

  const filteredPlaylists = useMemo(() => {
    if (!searchTerm) return userPlaylists;
    const lower = searchTerm.toLowerCase();
    return userPlaylists.filter(p => 
      p.name?.toLowerCase().includes(lower) || 
      p.owner?.display_name?.toLowerCase().includes(lower)
    );
  }, [userPlaylists, searchTerm]);

  const selectFromPicker = (playlistId: string) => {
    if (!showPickerFor) return;
    Haptics.success();
    
    if (showPickerFor.startsWith('rap_')) {
      const slotName = showPickerFor.replace('rap_', '');
      const newRapSources = { ...config.rapSources, [slotName]: { id: playlistId, type: 'playlist' as const } };
      catalogStore.set({ rapSources: newRapSources });
    } else {
      catalogStore.set({ [showPickerFor]: playlistId });
    }
    
    setConfig(catalogStore.get());
    verifyId(showPickerFor, playlistId);
    setShowPickerFor(null);
    toastService.show("Linked library item", "success");
  };

  const handleHardReset = () => {
    Haptics.impact();
    if (confirm("Permanently clear ALL configuration, tokens, and history?")) {
        authStore.hardReset();
        configStore.resetConfig();
        localStorage.clear();
        window.location.reload();
    }
  };

  const ResourceRow: React.FC<{ slotKey: string; label: string; id: string | null; type: string }> = ({ slotKey, label, id, type }) => {
    const meta = metadata[slotKey];
    const isBusy = loading[slotKey];

    return (
      <div className="p-6 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <PinkAsterisk />
            <span className="text-[11px] font-black text-palette-gold uppercase tracking-[0.3em]">{label}</span>
          </div>
          {id && (
            <button onClick={() => handleClear(slotKey)} className="text-[9px] font-black text-red-500 uppercase tracking-widest bg-red-500/10 px-3 py-1 rounded-full">Clear</button>
          )}
        </div>

        {id ? (
          <div className="flex flex-col gap-1.5 p-4 bg-black/40 rounded-2xl border border-white/5">
            {isBusy ? (
              <div className="h-10 flex items-center gap-3">
                <div className="w-3 h-3 border-2 border-palette-pink border-t-transparent rounded-full animate-spin" />
                <span className="text-[10px] font-black text-zinc-600 uppercase tracking-widest">Validating...</span>
              </div>
            ) : meta ? (
              <>
                <span className="text-[18px] font-garet font-bold text-[#D1F2EB]">{meta.name}</span>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-zinc-500 font-medium font-garet">{meta.owner}</span>
                  <span className="text-zinc-800 text-[8px]">•</span>
                  <span className="text-[10px] text-palette-teal font-black uppercase tracking-widest">
                    {type === 'artist' ? `${meta.count} Pop.` : `${meta.count} Tracks`}
                  </span>
                </div>
              </>
            ) : (
              <div className="flex flex-col gap-2">
                <span className="text-[10px] font-black text-red-500 uppercase tracking-widest">Link Broken</span>
                <button onClick={() => verifyId(slotKey, id, type)} className="mt-1 text-left text-[9px] font-black text-palette-teal uppercase tracking-widest underline">Retry verification</button>
              </div>
            )}
          </div>
        ) : (
          <div className="p-4 bg-zinc-900/50 rounded-2xl border border-dashed border-white/10 flex flex-col items-center justify-center gap-3">
            <span className="text-[11px] font-black text-zinc-600 uppercase tracking-widest">Unlinked Slot</span>
            <div className="flex gap-2">
              <button onClick={() => handleResolveByName(slotKey, label)} className="bg-white/5 border border-white/10 px-4 py-2 rounded-xl text-[10px] font-black text-[#A9E8DF] uppercase tracking-widest active:scale-95">Match</button>
              {type !== 'artist' && (
                <button onClick={() => openPicker(slotKey)} className="bg-white/5 border border-white/10 px-4 py-2 rounded-xl text-[10px] font-black text-palette-teal uppercase tracking-widest active:scale-95">Library</button>
              )}
              <button onClick={() => setShowPasteId(slotKey)} className="bg-white/5 border border-white/10 px-4 py-2 rounded-xl text-[10px] font-black text-palette-pink uppercase tracking-widest active:scale-95">ID</button>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="pt-24 px-4 animate-in slide-in-from-right duration-300 pb-40">
      <header className="mb-8 flex flex-col gap-2 px-2">
        <button onClick={onBack} className="text-palette-pink flex items-center gap-1 font-black text-xs uppercase tracking-widest active:opacity-50">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={4} d="M15 19l-7-7 7-7" />
          </svg>
          <span className="font-garet font-bold">Settings</span>
        </button>
        <h1 className="text-6xl font-mango header-ombre leading-none mt-2">Developer Tools</h1>
        <div className="flex items-center justify-between">
           <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500 mt-2 ml-1">Internal Plumbing</p>
           <button 
             onClick={handleRefreshCatalog}
             disabled={refreshing}
             className={`text-palette-teal text-[9px] font-black uppercase tracking-widest border border-palette-teal/20 px-3 py-1 rounded-full bg-palette-teal/5 mt-2 active:scale-95 transition-all ${refreshing ? 'animate-pulse' : ''}`}
           >
              {refreshing ? 'Syncing...' : 'Scan All Resources'}
           </button>
        </div>
      </header>

      <div className="flex flex-col gap-12">
        <section>
          <h2 className="text-[11px] font-black text-zinc-600 uppercase tracking-[0.2em] ml-5 mb-3">Tool Catalog</h2>
          <div className="glass-panel-gold rounded-[40px] overflow-hidden divide-y divide-white/5 border border-white/5">
             <ToolRow icon="📻" label="Rap Source Manager" onClick={() => onNavigate('rapSources')} />
             <ToolRow icon="🎙️" label="Podcast Resolver" onClick={() => onNavigate('podcasts')} />
             <ToolRow icon="🧪" label="System Diagnostics" onClick={() => onNavigate('testData')} />
             <ToolRow icon="📜" label="Raw Config State" onClick={() => setShowConfigSummary(!showConfigSummary)} />
          </div>
        </section>

        {showConfigSummary && (
          <section className="animate-in slide-in-from-top-4 duration-300">
             <div className="bg-black/60 rounded-[32px] border border-palette-gold/20 p-6 overflow-hidden max-h-[300px] overflow-y-auto">
                <pre className="text-[10px] font-mono text-zinc-400 whitespace-pre-wrap">
                  {JSON.stringify(configStore.getConfig(), null, 2)}
                </pre>
             </div>
          </section>
        )}

        <section>
          <h2 className="text-[11px] font-black text-zinc-600 uppercase tracking-[0.2em] ml-5 mb-3">Core Linking</h2>
          <div className="glass-panel-gold rounded-[40px] overflow-hidden divide-y divide-white/5 border border-white/5">
            {coreSlots.map(slot => (
              <ResourceRow key={slot.key} slotKey={slot.key} label={slot.label} type={slot.type} id={config[slot.key as keyof CatalogConfig] as string | null} />
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-[11px] font-black text-zinc-600 uppercase tracking-[0.2em] ml-5 mb-3">Rap Mix Sources</h2>
          <div className="glass-panel-gold rounded-[40px] overflow-hidden divide-y divide-white/5 border border-white/5">
            {RAP_SOURCE_PLAYLIST_NAMES.map(name => {
              const source = config.rapSources?.[name];
              return (
                <ResourceRow key={name} slotKey={`rap_${name}`} label={name} type={source?.type || 'playlist'} id={source?.id || null} />
              );
            })}
          </div>
        </section>

        <section className="px-2">
            <button 
                onClick={handleHardReset}
                className="w-full bg-red-500/10 border border-red-500/30 text-red-500 font-black py-5 rounded-[24px] uppercase tracking-widest text-[11px] active:scale-95 transition-all shadow-xl shadow-red-900/10"
            >
                ⚠️ Force Global Reset
            </button>
        </section>
      </div>

      {showPickerFor && (
        <div className="fixed inset-0 z-[300] bg-black/80 backdrop-blur-2xl flex items-center justify-center p-6 animate-in fade-in duration-300" onClick={() => setShowPickerFor(null)}>
          <div className="bg-zinc-900 border border-white/10 rounded-[40px] w-full max-w-md h-[80vh] flex flex-col shadow-2xl animate-in zoom-in duration-300 overflow-hidden" onClick={e => e.stopPropagation()}>
             <header className="p-8 pb-4 shrink-0 flex flex-col gap-4">
               <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-4xl font-mango text-palette-teal leading-none">Library Picker</h3>
                  </div>
                  <button onClick={() => setShowPickerFor(null)} className="text-zinc-500 active:text-white transition-colors">
                    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
               </div>
               <div className="relative">
                  <input 
                    type="text"
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    placeholder="Search library..."
                    autoFocus
                    className="w-full bg-black/40 border border-white/10 rounded-2xl px-10 py-3 text-sm text-[#D1F2EB] font-garet font-bold outline-none focus:border-palette-teal transition-all"
                  />
               </div>
             </header>
             <div className="flex-1 overflow-y-auto px-6 pb-6">
                {pickerLoading ? (
                  <div className="h-full flex flex-col items-center justify-center py-20">
                    <div className="w-10 h-10 border-3 border-palette-pink border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {filteredPlaylists.map(p => (
                      <button 
                        key={p.id} 
                        onClick={() => selectFromPicker(p.id)}
                        className="w-full text-left p-5 rounded-2xl bg-white/5 border border-white/5 active:bg-white/10 transition-all flex flex-col gap-1"
                      >
                        <span className="text-[16px] font-garet font-bold text-[#D1F2EB] truncate">{p.name}</span>
                        <span className="text-[10px] text-zinc-500 font-black uppercase tracking-widest">by {p.owner?.display_name || 'Spotify'}</span>
                      </button>
                    ))}
                  </div>
                )}
             </div>
          </div>
        </div>
      )}

      {showPasteId && (
        <div className="fixed inset-0 z-[350] bg-black/80 backdrop-blur-2xl flex items-center justify-center p-6 animate-in fade-in duration-300">
           <div className="bg-zinc-900 border border-white/10 rounded-[40px] p-8 w-full max-w-md flex flex-col gap-6 shadow-2xl" onClick={e => e.stopPropagation()}>
              <header>
                 <h2 className="text-4xl font-mango text-palette-pink leading-none">Paste ID</h2>
              </header>
              <input 
                type="text" 
                value={idInput}
                onChange={e => setIdInput(e.target.value)}
                placeholder="Spotify ID"
                autoFocus
                className="bg-black/40 border border-white/10 rounded-2xl px-5 py-4 text-[#D1F2EB] font-garet font-bold outline-none focus:border-palette-pink transition-all"
              />
              <div className="flex flex-col gap-3">
                 <button onClick={handlePasteId} disabled={!idInput.trim()} className="w-full bg-palette-pink text-white font-black py-5 rounded-[24px] active:scale-95 transition-all font-garet uppercase tracking-widest text-xs">Link Resource</button>
                 <button onClick={() => setShowPasteId(null)} className="w-full py-2 text-zinc-600 font-black uppercase tracking-widest text-[10px]">Cancel</button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

const ToolRow: React.FC<{ icon: string; label: string; onClick: () => void }> = ({ icon, label, onClick }) => (
  <button 
    onClick={() => { Haptics.medium(); onClick(); }}
    className="w-full px-6 py-5 flex items-center justify-between active:bg-white/5 transition-colors group"
  >
    <div className="flex items-center gap-4">
      <span className="text-2xl">{icon}</span>
      <span className="text-[18px] font-garet font-bold text-[#A9E8DF] group-active:text-palette-teal transition-colors">{label}</span>
    </div>
    <svg className="w-4 h-4 text-zinc-700" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={4} d="M9 5l7 7-7 7" /></svg>
  </button>
);

export default DeveloperToolsView;