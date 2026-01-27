import React, { useState, useEffect, useMemo, useRef } from 'react';
import { RunOption, RuleSettings, RunResult, RunOptionType, SpotifyDevice, Track, PodcastShowCandidate } from '../types';
import { RuleOverrideStore } from '../services/ruleOverrideStore';
import { getEffectiveRules } from '../utils/ruleUtils';
import { SpotifyPlaybackEngine } from '../services/playbackEngine';
import { Haptics } from '../services/haptics';
import { spotifyPlayback } from '../services/spotifyPlaybackService';
import { SpotifyApi } from '../services/spotifyApi';
import { SpotifyDataService } from '../services/spotifyDataService';
import { BlockStore } from '../services/blockStore';
import { ContentIdStore } from '../services/contentIdStore';
import DevicePickerModal from './DevicePickerModal';
import { PinkAsterisk } from './HomeView';

interface RunViewProps {
  option: RunOption;
  rules: RuleSettings;
  onClose: () => void;
  onComplete: (result: RunResult) => void;
  onNavigateToHistory?: () => void;
  initialResult?: RunResult;
}

type FlowStep = 'PREVIEW' | 'SAVE_CONFIG';
type GenStatus = 'IDLE' | 'RUNNING' | 'DONE' | 'ERROR';

interface Toast {
  id: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  onDismiss?: () => void;
}

const RunView: React.FC<RunViewProps> = ({ option, rules, onClose, onComplete, onNavigateToHistory, initialResult }) => {
  const [genStatus, setGenStatus] = useState<GenStatus>(initialResult ? 'DONE' : 'IDLE');
  const [flowStep, setFlowStep] = useState<FlowStep>('PREVIEW');
  const [activeSheet, setActiveSheet] = useState<'none' | 'play' | 'save'>('none');
  
  const [result, setResult] = useState<RunResult | null>(initialResult || null);
  const [error, setError] = useState<string | null>(null);
  const [choosingShow, setChoosingShow] = useState(false);
  const [showDevicePicker, setShowDevicePicker] = useState(false);
  const [playlistName, setPlaylistName] = useState("");
  const [isSavingToSpotify, setIsSavingToSpotify] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [syncedPlaylistId, setSyncedPlaylistId] = useState<string | null>(null);

  const [availableDevices, setAvailableDevices] = useState<SpotifyDevice[]>([]);
  const [isCheckingDevices, setIsCheckingDevices] = useState(false);
  const [deviceCheckError, setDeviceCheckError] = useState<string | null>(null);
  
  const generationRequestId = useRef(0);
  const engine = useMemo(() => new SpotifyPlaybackEngine(), []);
  const toastTimeoutRef = useRef<Record<string, number>>({});
  
  const override = RuleOverrideStore.getForOption(option.id);
  const effectiveRules = getEffectiveRules(rules, override);
  const isPodcast = option.type === RunOptionType.PODCAST;

  useEffect(() => {
    if (initialResult) handleHistoryBackfill();
    if (!initialResult && genStatus === 'IDLE') startRun();
    return () => Object.values(toastTimeoutRef.current).forEach(window.clearTimeout);
  }, [option, rules, initialResult]);

  const checkDevices = async () => {
    setIsCheckingDevices(true);
    setDeviceCheckError(null);
    try {
      const list = await SpotifyApi.getDevices();
      setAvailableDevices(list);
    } catch (e: any) {
      setDeviceCheckError("Can’t detect devices right now.");
    } finally {
      setIsCheckingDevices(false);
    }
  };

  const handleOpenPlaySheet = () => {
    Haptics.medium();
    setActiveSheet('play');
    checkDevices();
  };

  const handleHistoryBackfill = async () => {
    if (!initialResult?.tracks) return;
    const validTracks = initialResult.tracks.filter(t => !BlockStore.isBlocked(t.uri.split(':').pop() || ''));
    if (validTracks.length < initialResult.tracks.length) {
      try {
        const fullResult = await engine.generateRunResult(option, effectiveRules);
        if (fullResult.tracks) {
          const backfillNeeded = 35 - validTracks.length;
          const newTracks = fullResult.tracks.filter(t => !validTracks.some(vt => vt.uri === t.uri)).slice(0, backfillNeeded);
          setResult({ ...initialResult, tracks: [...validTracks, ...newTracks] });
        }
      } catch (e) {
        setResult({ ...initialResult, tracks: validTracks });
      }
    }
  };

  const startRun = async () => {
    Haptics.impact();
    setError(null);
    setGenStatus('RUNNING');
    setFlowStep('PREVIEW');
    setResult(null); 
    setSyncedPlaylistId(null);
    setChoosingShow(false);
    
    const requestId = ++generationRequestId.current;

    try {
      if (!isPodcast) await new Promise(r => setTimeout(r, 600));
      const runResult = await engine.generateRunResult(option, effectiveRules);
      if (requestId !== generationRequestId.current) return;

      localStorage.setItem('spotify_buddy_last_run_stats', JSON.stringify({
        timestamp: new Date().toLocaleTimeString(),
        optionName: option.name,
        trackCount: runResult.tracks?.length || 0,
        status: 'SUCCESS',
        summary: runResult.sourceSummary || "N/A",
        warning: runResult.warning
      }));

      setResult(runResult);
      if (isPodcast && runResult.candidates) setChoosingShow(true);
      setGenStatus('DONE');
      Haptics.success();
    } catch (e: any) {
      if (requestId !== generationRequestId.current) return;
      localStorage.setItem('spotify_buddy_last_run_stats', JSON.stringify({
        timestamp: new Date().toLocaleTimeString(),
        optionName: option.name,
        status: 'ERROR',
        error: e.message || "Unknown error"
      }));
      setGenStatus('ERROR');
      Haptics.error();
      setError(e.message || "Engine composition failed.");
    }
  };

  const showToast = (message: string, actionLabel?: string, onAction?: () => void) => {
    const id = Math.random().toString(36).substr(2, 9);
    const dismiss = () => {
      setToasts(prev => prev.filter(t => t.id !== id));
      if (toastTimeoutRef.current[id]) window.clearTimeout(toastTimeoutRef.current[id]);
      delete toastTimeoutRef.current[id];
    };
    setToasts(prev => [...prev, { id, message, actionLabel, onAction, onDismiss: dismiss }]);
    toastTimeoutRef.current[id] = window.setTimeout(dismiss, 5000);
  };

  const handleHideTrack = (track: Track) => {
    Haptics.impact();
    const trackId = track.uri.split(':').pop() || '';
    BlockStore.addBlocked(track);
    const originalTracks = result?.tracks || [];
    setResult(prev => prev ? { ...prev, tracks: prev.tracks?.filter(t => t.uri !== track.uri) } : null);
    showToast(`"${track.title}" hidden`, "Undo", () => {
      BlockStore.removeBlocked(trackId);
      setResult(prev => prev ? { ...prev, tracks: originalTracks } : null);
    });
  };

  const handleSaveToHistory = () => {
    if (!result) return;
    Haptics.impact();
    onComplete(result);
    setActiveSheet('none');
    showToast("Saved to History", "View History", () => {
      onNavigateToHistory?.();
      onClose();
    });
  };

  const openSpotifyDeepLink = (playlistId: string) => {
    Haptics.medium();
    const deepLink = `spotify:playlist:${playlistId}`;
    const webLink = `https://open.spotify.com/playlist/${playlistId}`;
    window.location.href = deepLink;
    setTimeout(() => { if (document.hasFocus()) window.open(webLink, '_blank'); }, 500);
  };

  const handleConfirmSpotifySync = async () => {
    if (!result) return;
    Haptics.impact();
    setIsSavingToSpotify(true);
    try {
      const user = await SpotifyApi.getMe();
      const nameToUse = playlistName || result.playlistName;
      const playlist = await SpotifyDataService.createPlaylist(user.id, nameToUse, result.sourceSummary || "");
      if (result.tracks) {
        await SpotifyDataService.replacePlaylistTracks(playlist.id, result.tracks.map(t => t.uri));
      }
      setSyncedPlaylistId(playlist.id);
      setFlowStep('PREVIEW');
      setActiveSheet('none');
      showToast("Sync Successful", "Open", () => openSpotifyDeepLink(playlist.id));
    } catch (e: any) {
      alert(e.message || "Failed to sync with Spotify");
    } finally {
      setIsSavingToSpotify(false);
    }
  };

  const handlePlayInSpotifyApp = () => {
    if (!result) return;
    if (result.runType === RunOptionType.PODCAST && result.episode) {
      window.location.href = result.episode.uri;
      setActiveSheet('none');
      return;
    }
    if (syncedPlaylistId) {
      openSpotifyDeepLink(syncedPlaylistId);
    } else {
      window.open('spotify:open', '_blank');
    }
    setActiveSheet('none');
  };

  const handlePushToDevice = () => {
    Haptics.medium();
    setActiveSheet('none');
    setShowDevicePicker(true);
  };

  const onDeviceSelected = async (deviceId: string) => {
    if (!result) return;
    setShowDevicePicker(false);
    try {
      const uris = result.runType === RunOptionType.MUSIC ? result.tracks?.map(t => t.uri) || [] : [result.episode?.uri].filter(Boolean) as string[];
      const activeDeviceId = await spotifyPlayback.ensureActiveDevice(deviceId);
      await spotifyPlayback.playUrisOnDevice(activeDeviceId, uris);
      Haptics.success(); 
      onClose();
    } catch (e: any) {
      Haptics.error();
      alert(e.message || "Playback failed");
    }
  };

  const handleSelectShowCandidate = async (candidate: PodcastShowCandidate) => {
    Haptics.impact();
    if (option.idKey) ContentIdStore.set(option.idKey, candidate.id);
    startRun();
  };

  const handleRelinkShow = () => {
    Haptics.medium();
    if (option.idKey) {
      ContentIdStore.clear(option.idKey);
      startRun();
    }
  };

  const totalDurationStr = useMemo(() => {
    if (!result?.tracks) return null;
    const totalMs = result.tracks.reduce((acc, t) => acc + (t.durationMs || 0), 0);
    const mins = Math.floor(totalMs / 60000);
    const hrs = Math.floor(mins / 60);
    return hrs > 0 ? `${hrs}h ${mins % 60}m` : `${mins} mins`;
  }, [result]);

  const episodeDurationStr = useMemo(() => {
    if (!result?.episode?.durationMs) return "";
    const mins = Math.floor(result.episode.durationMs / 60000);
    return `${mins} min`;
  }, [result]);

  if (genStatus === 'DONE' && !result && !choosingShow) {
    return (
      <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-3xl flex flex-col items-center justify-center p-8 text-center text-[#A9E8DF]">
         <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center text-red-500 mb-6 border border-red-500/20">
            <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
         </div>
         <h2 className="text-3xl font-mango mb-2">Build Disrupted</h2>
         <p className="text-zinc-500 font-garet text-sm mb-8 px-4">Catalog data was lost during generation. Please try rebuilding the mix.</p>
         <button onClick={onClose} className="w-full max-w-xs bg-zinc-800 text-white font-black py-4 rounded-[20px] uppercase tracking-widest text-[11px] active:scale-95 transition-all">Back to Library</button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] bg-black/30 backdrop-blur-3xl flex flex-col animate-in slide-in-from-right duration-300 overflow-hidden text-[#A9E8DF]">
      <div className="px-6 pt-14 pb-6 flex items-center justify-between border-b border-white/10 shrink-0">
        <button onClick={() => { Haptics.light(); onClose(); }} className="text-palette-pink text-[17px] font-garet font-bold active:opacity-50">
          {genStatus === 'DONE' || genStatus === 'ERROR' ? 'Close' : 'Cancel'}
        </button>
        <span className="font-black text-[10px] uppercase tracking-[0.3em] text-zinc-500">Sync Engine</span>
        <div className="w-12" />
      </div>

      <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-8 pb-40">
        {genStatus === 'RUNNING' ? (
          <div className="shrink-0 bg-white/5 backdrop-blur-md p-8 rounded-[40px] flex flex-col items-center text-center gap-6 border border-white/10 shadow-2xl relative overflow-hidden min-h-[320px] justify-center">
             <div className="w-12 h-12 border-4 border-palette-pink border-t-transparent rounded-full animate-spin" />
             <h2 className="text-3xl font-mango text-[#A9E8DF]">Composing Mix</h2>
             <p className="text-zinc-500 text-[10px] font-black uppercase tracking-widest animate-pulse">Filtering Catalog...</p>
          </div>
        ) : genStatus === 'ERROR' ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 gap-6 animate-in zoom-in duration-500">
            <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center text-red-500 border border-red-500/20">
               <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
            </div>
            <h3 className="text-3xl font-mango text-red-500">Sync Failure</h3>
            <p className="text-zinc-400 text-sm font-medium font-garet text-center px-4 leading-relaxed">{error}</p>
            <button onClick={startRun} className="w-full bg-zinc-800 text-white font-black py-5 rounded-[24px] active:scale-95 transition-all font-garet uppercase tracking-widest text-xs">Retry Build</button>
          </div>
        ) : choosingShow ? (
          <div className="flex flex-col gap-8 animate-in fade-in duration-700">
            <header className="flex flex-col gap-1 px-2">
              <h2 className="text-5xl leading-none font-mango header-ombre">Match Show</h2>
              <p className="text-zinc-500 text-[10px] font-black uppercase tracking-widest mt-2">Select show from catalog results</p>
            </header>
            <div className="glass-panel-gold rounded-[40px] overflow-hidden divide-y divide-white/5 border border-white/5 shadow-2xl">
              {result?.candidates?.map((c) => (
                <button key={c.id} onClick={() => handleSelectShowCandidate(c)} className="w-full flex items-center gap-4 p-5 hover:bg-white/5 transition-colors group text-left">
                  <div className="w-14 h-14 rounded-xl bg-zinc-800 overflow-hidden shrink-0 border border-white/10">
                    <img src={c.imageUrl} alt="" className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-[17px] font-garet font-bold text-[#D1F2EB] truncate leading-tight">{c.name}</h4>
                    <p className="text-[11px] text-zinc-500 font-medium truncate mt-0.5 font-garet">{c.publisher}</p>
                  </div>
                  <svg className="w-5 h-5 text-zinc-700 group-active:text-palette-pink" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 5l7 7-7 7" /></svg>
                </button>
              ))}
            </div>
          </div>
        ) : isPodcast ? (
          <div className="flex flex-col gap-8 animate-in fade-in duration-700">
             <header className="flex flex-col gap-1 px-2 relative">
              <h2 className="text-5xl leading-none font-mango header-ombre pr-12">{option.name}</h2>
              <div className="flex items-center gap-2 mt-2">
                <span className="text-palette-gold text-[10px] font-black uppercase tracking-widest">Latest Episode</span>
                <span className="text-zinc-700 font-black text-[8px]">•</span>
                <span className="text-zinc-500 text-[10px] font-black uppercase tracking-widest">{result?.episode?.releaseDate}</span>
              </div>
              <button 
                onClick={handleRelinkShow}
                className="absolute top-2 right-2 text-[8px] font-black text-zinc-500 uppercase tracking-widest border border-white/10 rounded-full px-3 py-1 bg-white/5 active:bg-palette-pink/20 active:text-palette-pink active:border-palette-pink/30 transition-all"
              >
                Wrong Show?
              </button>
            </header>

            <div className="glass-panel-gold rounded-[40px] p-8 border border-white/10 shadow-2xl flex flex-col gap-6">
              <div className="w-full aspect-square rounded-[32px] overflow-hidden border border-white/10 shadow-lg">
                <img src={result?.episode?.imageUrl} className="w-full h-full object-cover" alt={result?.episode?.name} />
              </div>
              <div className="flex flex-col gap-3">
                 <h3 className="text-[22px] font-garet font-bold text-[#D1F2EB] leading-tight">{result?.episode?.name}</h3>
                 <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black text-palette-teal uppercase tracking-widest bg-palette-teal/10 px-2 py-1 rounded-md">{episodeDurationStr}</span>
                 </div>
                 <p className="text-sm text-zinc-500 font-medium leading-relaxed font-garet line-clamp-4 mt-2">
                   {result?.episode?.description?.replace(/<[^>]*>?/gm, '')}
                 </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
                <button 
                  onClick={handleOpenPlaySheet} 
                  className="relative overflow-hidden bg-gradient-to-br from-[#1DB954] via-[#1DB954] to-[#24cc5c] text-white font-black py-5 rounded-[24px] active:scale-95 transition-all font-garet uppercase tracking-widest text-[14px] flex items-center justify-center gap-2 shadow-xl shadow-[#1DB954]/20 border border-white/15"
                >
                  <div className="absolute top-1 left-2 w-[85%] h-[40%] bg-gradient-to-b from-white/40 to-transparent rounded-full blur-[1px] animate-jelly-shimmer pointer-events-none" />
                  <div className="relative z-10 flex items-center gap-2">
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                    <span>Play</span>
                  </div>
                </button>
                <button 
                  onClick={handleSaveToHistory} 
                  className="relative overflow-hidden bg-white/10 border border-white/10 text-white font-black py-5 rounded-[24px] active:scale-95 transition-all font-garet uppercase tracking-widest text-[14px] flex items-center justify-center gap-2 shadow-xl"
                >
                  <div className="absolute top-1 left-2 w-[85%] h-[40%] bg-gradient-to-b from-white/20 to-transparent rounded-full blur-[2px] pointer-events-none" />
                  <div className="relative z-10 flex items-center gap-2">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                    <span>Log</span>
                  </div>
                </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-8 animate-in fade-in duration-700">
             <header className="flex flex-col gap-1 px-2">
              <h2 className="text-5xl leading-none font-gurmukhi text-[#A9E8DF]">{result?.playlistName}</h2>
              <div className="flex items-center gap-2 mt-2">
                <span className="text-palette-gold text-[10px] font-black uppercase tracking-widest">{result?.tracks?.length} Tracks</span>
                <span className="text-zinc-700 font-black text-[8px]">•</span>
                <span className="text-zinc-500 text-[10px] font-black uppercase tracking-widest">{totalDurationStr}</span>
              </div>
              {result?.warning && (
                <div className="mt-4 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center gap-3">
                   <svg className="w-4 h-4 text-red-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                   <p className="text-[10px] font-black text-red-400 uppercase tracking-widest leading-relaxed">{result.warning}</p>
                </div>
              )}
              {result?.sourceSummary && (
                <div className="mt-4 px-3 py-2 bg-black/40 border border-palette-teal/20 rounded-xl">
                  <p className="text-[10px] font-mono text-palette-teal/80 leading-relaxed uppercase tracking-widest">{result.sourceSummary}</p>
                </div>
              )}
            </header>

            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-3">
                <button 
                  onClick={handleOpenPlaySheet}
                  className="relative overflow-hidden bg-gradient-to-br from-[#1DB954] via-[#1DB954] to-[#24cc5c] text-white font-black py-5 rounded-[24px] active:scale-95 transition-all font-garet uppercase tracking-widest text-[14px] flex items-center justify-center gap-2 shadow-xl shadow-[#1DB954]/20 border border-white/15"
                >
                  <div className="absolute top-1 left-2 w-[85%] h-[40%] bg-gradient-to-b from-white/40 to-transparent rounded-full blur-[1px] animate-jelly-shimmer pointer-events-none" />
                  <div className="relative z-10 flex items-center gap-2">
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                    <span>Play</span>
                  </div>
                </button>
                <button 
                  onClick={() => { Haptics.medium(); setActiveSheet('save'); }}
                  disabled={!result || genStatus !== 'DONE'}
                  className={`relative overflow-hidden text-white font-black py-5 rounded-[24px] active:scale-95 transition-all font-garet uppercase tracking-widest text-[14px] flex items-center justify-center gap-2 shadow-xl border border-white/15 ${(!result || genStatus !== 'DONE') ? 'bg-zinc-800 opacity-50 grayscale cursor-not-allowed' : 'bg-gradient-to-br from-[#FF007A] via-[#FF1A8B] to-[#FF4D9F] shadow-palette-pink/30'}`}
                >
                  {result && genStatus === 'DONE' && <div className="absolute top-1 left-2 w-[85%] h-[40%] bg-gradient-to-b from-white/40 to-transparent rounded-full blur-[1px] animate-jelly-shimmer pointer-events-none" />}
                  <div className="relative z-10 flex items-center gap-2">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 00-2 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"/></svg>
                    <span>Save</span>
                  </div>
                </button>
              </div>

              <button 
                onClick={startRun}
                className="w-full bg-white/10 border border-white/10 text-white font-black py-4 rounded-[24px] active:scale-95 transition-all font-garet uppercase tracking-widest text-[10px] flex items-center justify-center gap-2"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                <span>Regenerate Mix</span>
              </button>
            </div>

            <div className="glass-panel-gold rounded-[40px] overflow-hidden divide-y divide-white/5 border border-white/5 shadow-2xl">
              {result?.tracks?.map((track, i) => (
                <div key={i} className="flex items-center gap-4 p-5 hover:bg-white/5 transition-colors group">
                  <PinkAsterisk />
                  <div className="w-12 h-12 rounded-xl bg-zinc-800 overflow-hidden shrink-0 border border-white/10 relative">
                    <img src={track.imageUrl} alt="" className="w-full h-full object-cover" />
                    {track.isNew && <div className="absolute top-1 right-1 w-2 h-2 rounded-full bg-palette-teal shadow-[0_0_8px_rgba(45,185,177,0.8)]" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-[17px] font-gurmukhi text-[#D1F2EB] truncate leading-tight">{track.title}</h4>
                    <p className="text-[11px] text-zinc-500 font-medium truncate mt-0.5 font-garet">{track.artist}</p>
                  </div>
                  <button onClick={() => handleHideTrack(track)} className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-zinc-600 opacity-0 group-hover:opacity-100 transition-all">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {activeSheet !== 'none' && (
        <div className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm flex items-end justify-center p-4 animate-in fade-in duration-300" onClick={() => setActiveSheet('none')}>
           <div className="bg-zinc-900 w-full max-w-md rounded-[40px] p-6 flex flex-col gap-4 animate-in slide-in-from-bottom-12 duration-500 shadow-2xl border border-white/10" onClick={e => e.stopPropagation()}>
              <header className="mb-2 text-center">
                 <h3 className="text-2xl font-mango text-[#A9E8DF] uppercase tracking-tighter">{activeSheet === 'play' ? 'Playback Target' : 'Catalog Sync'}</h3>
                 <p className="text-[10px] font-black text-zinc-600 uppercase tracking-widest mt-1">Select Action</p>
              </header>

              {activeSheet === 'play' ? (
                <div className="flex flex-col gap-3">
                   <div className="flex flex-col gap-1">
                    <button 
                      onClick={handlePushToDevice} 
                      disabled={isCheckingDevices || availableDevices.length === 0 || !availableDevices.some(d => d.is_active)}
                      className={`relative overflow-hidden w-full py-5 rounded-[24px] flex items-center justify-center gap-3 font-garet font-bold transition-all border border-white/15 ${(availableDevices.some(d => d.is_active) && !isCheckingDevices) ? 'bg-gradient-to-br from-palette-emerald via-palette-emerald to-[#22c1aa] text-white active:scale-95 shadow-lg shadow-palette-emerald/20' : 'bg-zinc-800 text-zinc-600 opacity-40 grayscale cursor-not-allowed'}`}
                    >
                      {availableDevices.some(d => d.is_active) && !isCheckingDevices && <div className="absolute top-1 left-2 w-[85%] h-[40%] bg-gradient-to-b from-white/30 to-transparent rounded-full blur-[1px] animate-jelly-shimmer pointer-events-none" />}
                      <div className="relative z-10 flex items-center gap-3">
                        {isCheckingDevices ? (
                          <div className="w-5 h-5 border-2 border-zinc-600 border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/></svg>
                        )}
                        <span>
                          {isCheckingDevices ? 'Detecting Devices...' : 
                           availableDevices.find(d => d.is_active)?.name ? `Push to ${availableDevices.find(d => d.is_active)?.name}` : 
                           'No active session'}
                        </span>
                      </div>
                    </button>
                    
                    {!isCheckingDevices && (
                      <button onClick={checkDevices} className="text-[8px] font-black text-palette-teal uppercase tracking-[0.2em] text-center mt-1 active:opacity-50">
                        {deviceCheckError ? deviceCheckError : 
                         (availableDevices.length === 0 || !availableDevices.some(d => d.is_active)) ? 'Open Spotify on a device first. Refresh?' : 
                         'Active device detected'}
                      </button>
                    )}
                   </div>

                   <button onClick={handlePlayInSpotifyApp} className="relative overflow-hidden w-full py-5 rounded-[24px] bg-gradient-to-br from-[#1DB954] via-[#1DB954] to-[#24cc5c] text-white flex items-center justify-center gap-3 font-garet font-bold active:scale-95 transition-all shadow-lg shadow-[#1DB954]/20 border border-white/15">
                      <div className="absolute top-1 left-2 w-[85%] h-[40%] bg-gradient-to-b from-white/40 to-transparent rounded-full blur-[1px] animate-jelly-shimmer pointer-events-none" />
                      <div className="relative z-10 flex items-center gap-3">
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.494 17.306c-.215.353-.674.463-1.027.248-2.857-1.745-6.453-2.14-10.686-1.173-.404.093-.813-.162-.906-.566-.093-.404.162-.813.566-.906 4.63-1.06 8.598-.61 11.785 1.339.353.215.463.674.248 1.027zm1.467-3.264c-.271.44-.847.581-1.287.31-3.268-2.008-8.25-2.592-12.115-1.417-.496.15-1.022-.128-1.173-.623-.15-.496.128-1.022.623-1.173 4.417-1.34 9.907-.678 13.642 1.613.44.271.581.847.31 1.287zm.127-3.413C15.228 8.249 8.845 8.038 5.16 9.157c-.551.167-1.13-.153-1.297-.704-.167-.551.153-1.13.704-1.297 4.227-1.282 11.278-1.037 15.82 1.66.496.295.661.934.366 1.43-.295.496-.934.661-1.43.366z"/></svg>
                        <span>Play in Spotify App</span>
                      </div>
                   </button>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                   <button onClick={handleSaveToHistory} className="relative overflow-hidden w-full py-5 rounded-[24px] bg-white/10 text-white flex items-center justify-center gap-3 font-garet font-bold active:bg-white/20 active:scale-95 transition-all border border-white/10">
                      <div className="absolute top-1 left-2 w-[85%] h-[40%] bg-gradient-to-b from-white/15 to-transparent rounded-full blur-[2px] pointer-events-none" />
                      <div className="relative z-10 flex items-center gap-3">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                        <span>Save to History</span>
                      </div>
                   </button>
                   <button onClick={() => { Haptics.medium(); setPlaylistName(result?.playlistName || ""); setFlowStep('SAVE_CONFIG'); setActiveSheet('none'); }} className="relative overflow-hidden w-full py-5 rounded-[24px] bg-gradient-to-br from-palette-pink via-[#FF1A8B] to-palette-pink text-white flex items-center justify-center gap-3 font-garet font-bold active:scale-95 transition-all shadow-lg shadow-palette-pink/30 border border-white/15">
                      <div className="absolute top-1 left-2 w-[85%] h-[40%] bg-gradient-to-b from-white/40 to-transparent rounded-full blur-[1px] animate-jelly-shimmer pointer-events-none" />
                      <div className="relative z-10 flex items-center gap-3">
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.494 17.306c-.215.353-.674.463-1.027.248-2.857-1.745-6.453-2.14-10.686-1.173-.404.093-.813-.162-.906-.566-.093-.404.162-.813.566-.906 4.63-1.06 8.598-.61 11.785 1.339.353.215.463.674.248 1.027zm1.467-3.264c-.271.44-.847.581-1.287.31-3.268-2.008-8.25-2.592-12.115-1.417-.496.15-1.022-.128-1.173-.623-.15-.496.128-1.022.623-1.173 4.417-1.34 9.907-.678 13.642 1.613.44.271.581.847.31 1.287zm.127-3.413C15.228 8.249 8.845 8.038 5.16 9.157c-.551.167-1.13-.153-1.297-.704-.167-.551.153-1.13.704-1.297 4.227-1.282 11.278-1.037 15.82 1.66.496.295.661.934.366 1.43-.295.496-.934.661-1.43.366z"/></svg>
                        <span>Save as New Playlist</span>
                      </div>
                   </button>
                </div>
              )}

              <button onClick={() => setActiveSheet('none')} className="w-full py-4 text-zinc-600 font-black uppercase tracking-widest text-[11px] mt-2 active:opacity-50">Cancel</button>
           </div>
        </div>
      )}

      {flowStep === 'SAVE_CONFIG' && (
        <div className="fixed inset-0 z-[250] bg-black/80 backdrop-blur-2xl flex items-center justify-center p-6 animate-in zoom-in duration-300">
          <div className="bg-zinc-900 border border-white/10 rounded-[40px] p-8 w-full max-w-md flex flex-col gap-6 shadow-2xl">
            <header>
              <h2 className="text-4xl font-mango text-palette-teal leading-none">Catalog Export</h2>
              <p className="text-[10px] font-black text-zinc-600 uppercase tracking-widest mt-2">Named Playlist Sync</p>
            </header>
            <input 
              type="text" 
              value={playlistName}
              onChange={e => setPlaylistName(e.target.value)}
              autoFocus
              className="bg-black/40 border border-white/10 rounded-2xl px-5 py-4 text-[#D1F2EB] font-garet font-bold outline-none focus:border-palette-pink transition-all"
            />
            <div className="flex flex-col gap-3">
              <button 
                onClick={handleConfirmSpotifySync}
                disabled={isSavingToSpotify || !playlistName}
                className="relative overflow-hidden w-full bg-gradient-to-br from-[#1DB954] via-[#1DB954] to-[#24cc5c] text-white font-black py-5 rounded-[24px] active:scale-95 transition-all font-garet uppercase tracking-widest text-xs shadow-xl shadow-[#1DB954]/20 border border-white/15"
              >
                {!isSavingToSpotify && <div className="absolute top-1 left-2 w-[85%] h-[40%] bg-gradient-to-b from-white/40 to-transparent rounded-full blur-[1px] animate-jelly-shimmer pointer-events-none" />}
                <span className="relative z-10">{isSavingToSpotify ? 'Deploying...' : 'Sync Now'}</span>
              </button>
              <button onClick={() => setFlowStep('PREVIEW')} className="w-full py-4 text-zinc-600 font-black uppercase tracking-widest text-[10px]">Cancel</button>
            </div>
          </div>
        </div>
      )}

      <div className="fixed bottom-32 left-4 right-4 z-[300] flex flex-col gap-3 pointer-events-none">
        {toasts.map(toast => (
          <div key={toast.id} className="bg-zinc-900 border border-palette-pink/30 rounded-2xl p-4 flex items-center justify-between shadow-2xl animate-in slide-in-from-bottom-4 duration-300 pointer-events-auto">
            <span className="text-[13px] font-garet font-bold text-white ml-2">{toast.message}</span>
            <div className="flex items-center gap-1">
              {toast.actionLabel && (
                <button onClick={() => { toast.onAction?.(); toast.onDismiss?.(); }} className="text-palette-pink uppercase text-[10px] font-black px-4 py-2 bg-white/5 rounded-xl active:bg-palette-pink/20 transition-colors">
                  {toast.actionLabel}
                </button>
              )}
              <button onClick={toast.onDismiss} className="p-2 text-zinc-600">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
          </div>
        ))}
      </div>

      {showDevicePicker && <DevicePickerModal onSelect={onDeviceSelected} onClose={() => setShowDevicePicker(false)} />}
    </div>
  );
};

export default RunView;