import React, { useState, useEffect, useMemo } from 'react';
import { ResourceResolver } from '../services/resourceResolver';
import { Haptics } from '../services/haptics';
import { RAP_SOURCE_PLAYLIST_NAMES } from '../constants';
import { PinkAsterisk } from './HomeView';
import { apiLogger } from '../services/apiLogger';
import { SpotifyDataService } from '../services/spotifyDataService';
import { SpotifySourceType, AppConfig } from '../types';
import { configStore } from '../services/configStore';
import { toastService } from '../services/toastService';

interface RapSourcesViewProps {
  onBack: () => void;
}

interface UserPlaylist {
  id: string;
  name: string;
  owner: string;
}

const RapSourcesView: React.FC<RapSourcesViewProps> = ({ onBack }) => {
  const [config, setConfig] = useState<AppConfig>(configStore.getConfig());
  const [refreshing, setRefreshing] = useState(false);
  const [showPickerFor, setShowPickerFor] = useState<string | null>(null);
  const [showUrlInputFor, setShowUrlInputFor] = useState<string | null>(null);
  const [urlInput, setUrlInput] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [userPlaylists, setUserPlaylists] = useState<UserPlaylist[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);

  useEffect(() => {
    const scroller = document.getElementById('main-content-scroller');
    if (scroller) scroller.scrollTop = 0;

    const unsub = configStore.subscribe(() => {
      setConfig(configStore.getConfig());
    });
    return unsub;
  }, []);

  const handleRefresh = async () => {
    Haptics.impact();
    setRefreshing(true);
    apiLogger.logClick("RapSources: User initiated manual refresh.");

    try {
      await ResourceResolver.resolveAll();
      Haptics.success();
      toastService.show("Catalog matched!", "success");
    } catch (e: any) {
      Haptics.error();
      apiLogger.logError(`Refresh failed: ${e.message}`);
      toastService.show("Match failed. Check connection.", "error");
    } finally {
      setRefreshing(false);
    }
  };

  const openPicker = async (name: string) => {
    Haptics.medium();
    setShowPickerFor(name);
    setSearchTerm("");
    setPickerLoading(true);
    try {
      const list = await ResourceResolver.fetchAllUserPlaylists();
      setUserPlaylists(list.map(p => ({
        id: p.id,
        name: p.name || 'Untitled Playlist',
        owner: p.owner?.display_name || 'Spotify'
      })));
    } catch (e) {
      apiLogger.logError("Failed to load user playlists for picker.");
      toastService.show("Failed to load playlists", "error");
    } finally {
      setPickerLoading(false);
    }
  };

  const filteredPlaylists = useMemo(() => {
    if (!searchTerm) return userPlaylists;
    const lower = searchTerm.toLowerCase();
    return userPlaylists.filter(p => 
      p.name.toLowerCase().includes(lower) || 
      p.owner.toLowerCase().includes(lower)
    );
  }, [userPlaylists, searchTerm]);

  const selectFromPicker = (playlistId: string) => {
    if (!showPickerFor) return;
    Haptics.success();
    
    const nextRapSources = { ...config.catalog.rapSources, [showPickerFor]: { id: playlistId, type: 'playlist' as const } };
    configStore.updateCatalog({ rapSources: nextRapSources });
    
    setShowPickerFor(null);
    apiLogger.logClick(`RapSources: Linked slot "${showPickerFor}" to ID ${playlistId}`);
    toastService.show("Source linked", "success");
  };

  const handleLinkByUrl = () => {
    if (!showUrlInputFor || !urlInput) return;
    
    let type: SpotifySourceType | null = null;
    let id: string | null = null;

    if (urlInput.includes('/playlist/')) {
      type = 'playlist';
      id = urlInput.split('/playlist/')[1]?.split('?')[0];
    } else if (urlInput.includes('/album/')) {
      type = 'album';
      id = urlInput.split('/album/')[1]?.split('?')[0];
    } else if (!urlInput.includes('/')) {
        type = 'playlist';
        id = urlInput;
    }

    if (!type || !id) {
      toastService.show("Invalid Spotify URL", "warning");
      return;
    }

    Haptics.success();
    const nextRapSources = { ...config.catalog.rapSources, [showUrlInputFor]: { id, type } };
    configStore.updateCatalog({ rapSources: nextRapSources });
    
    setShowUrlInputFor(null);
    setUrlInput("");
    apiLogger.logClick(`RapSources: Linked "${showUrlInputFor}" by URL (${type}: ${id})`);
    toastService.show("Link matched!", "success");
  };

  const getSource = (name: string) => {
    return config.catalog.rapSources?.[name] || null;
  };

  const linkedCount = RAP_SOURCE_PLAYLIST_NAMES.filter(name => getSource(name)).length;

  return (
    <div className="pt-24 px-4 animate-in slide-in-from-right duration-300 pb-40">
      <header className="mb-8 flex flex-col gap-2 px-2">
        <button 
          onClick={onBack} 
          className="text-palette-pink flex items-center gap-1 font-black text-xs uppercase tracking-widest active:opacity-50"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={4} d="M15 19l-7-7 7-7" />
          </svg>
          <span className="font-garet font-bold">Settings</span>
        </button>
        <h1 className="text-6xl font-mango header-ombre leading-none mt-2">Rap Sources</h1>
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500 mt-2 ml-1">
            Linked {linkedCount} of {RAP_SOURCE_PLAYLIST_NAMES.length} required pools
        </p>
      </header>

      <div className="flex flex-col gap-6">
        <div className="px-2">
            <button 
                onClick={handleRefresh}
                disabled={refreshing}
                className="w-full bg-[#1DB954] text-white font-black py-4 rounded-2xl flex items-center justify-center gap-3 active:scale-95 transition-all shadow-xl shadow-[#1DB954]/20"
            >
                {refreshing ? (
                    <div className="w-5 h-5 border-3 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/></svg>
                )}
                <span className="text-[11px] uppercase tracking-widest">{refreshing ? 'Scanning Library...' : 'Auto-Match From Library'}</span>
            </button>
        </div>

        <div className="glass-panel-gold rounded-[40px] overflow-hidden divide-y divide-white/5 border border-white/5 shadow-2xl">
          {RAP_SOURCE_PLAYLIST_NAMES.map((name) => {
            const source = getSource(name);
            const isLinked = !!source;
            return (
              <div key={name} className="flex items-center p-6 group">
                <PinkAsterisk />
                <div className="flex flex-col min-w-0 flex-1 pr-4">
                  <span className={`text-[17px] font-garet font-bold leading-tight transition-colors ${isLinked ? 'text-[#D1F2EB]' : 'text-zinc-600'}`}>
                    {name}
                  </span>
                  <div className="flex items-center gap-2 mt-0.5">
                    {isLinked ? (
                        <>
                          <span className="text-[9px] text-palette-emerald font-black uppercase tracking-widest flex items-center gap-1">
                            Linked
                            <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20"><path d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" /></svg>
                          </span>
                          <span className={`text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded border ${source.type === 'album' ? 'text-palette-gold border-palette-gold/30 bg-palette-gold/10' : 'text-palette-teal border-palette-teal/30 bg-palette-teal/10'}`}>
                             {source.type}
                          </span>
                        </>
                    ) : (
                        <div className="flex items-center gap-3">
                          <button 
                            onClick={() => openPicker(name)}
                            className="text-[9px] text-palette-pink font-black uppercase tracking-widest hover:underline text-left"
                          >
                            Pick From Library
                          </button>
                          <span className="text-zinc-800 font-black text-[8px]">•</span>
                          <button 
                            onClick={() => { Haptics.medium(); setShowUrlInputFor(name); }}
                            className="text-[9px] text-palette-teal font-black uppercase tracking-widest hover:underline text-left"
                          >
                            Enter URL
                          </button>
                        </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {showPickerFor && (
        <div className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-2xl flex items-center justify-center p-6 animate-in fade-in duration-300" onClick={() => setShowPickerFor(null)}>
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
                        className="w-full text-left p-5 rounded-2xl bg-white/5 border border-white/5 hover:border-white/20 active:bg-white/10 transition-all flex flex-col gap-1 group"
                      >
                        <span className="text-[16px] font-garet font-bold text-[#D1F2EB] group-active:text-palette-teal transition-colors truncate">{p.name}</span>
                        <span className="text-[10px] text-zinc-500 font-black uppercase tracking-widest">by {p.owner}</span>
                      </button>
                    ))}
                  </div>
                )}
             </div>
          </div>
        </div>
      )}

      {showUrlInputFor && (
        <div className="fixed inset-0 z-[250] bg-black/80 backdrop-blur-2xl flex items-center justify-center p-6 animate-in fade-in duration-300" onClick={() => setShowUrlInputFor(null)}>
          <div className="bg-zinc-900 border border-white/10 rounded-[40px] p-8 w-full max-w-md flex flex-col gap-6 animate-in zoom-in duration-300 shadow-2xl" onClick={e => e.stopPropagation()}>
            <header>
              <h2 className="text-4xl font-mango text-palette-teal leading-none">External Link</h2>
            </header>
            <div className="flex flex-col gap-2">
              <label className="text-[10px] font-black text-zinc-600 uppercase tracking-widest px-1">Spotify URL</label>
              <input 
                type="text" 
                value={urlInput}
                onChange={e => setUrlInput(e.target.value)}
                placeholder="https://open.spotify.com/playlist/..."
                autoFocus
                className="bg-black/40 border border-white/10 rounded-2xl px-5 py-4 text-[#D1F2EB] font-garet font-bold outline-none focus:border-palette-pink transition-all"
              />
            </div>
            <div className="flex flex-col gap-3 mt-4">
              <button 
                onClick={handleLinkByUrl}
                disabled={!urlInput}
                className="w-full bg-palette-pink text-white font-black py-5 rounded-[24px] active:scale-95 transition-all font-garet uppercase tracking-widest text-xs shadow-xl shadow-palette-pink/20"
              >
                Link Source
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RapSourcesView;