
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
import { toastService } from '../services/toastService';

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
    try {
      const list = await SpotifyApi.getDevices();
      setAvailableDevices(list);
    } catch (e: any) {} finally {
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
          const backfillNeeded = (initialResult.tracks.length) - validTracks.length;
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
      await new Promise(r => setTimeout(r, 1200));
      const runResult = await engine.generateRunResult(option, effectiveRules);
      if (requestId !== generationRequestId.current) return;

      setResult(runResult);
      if (isPodcast && runResult.candidates) setChoosingShow(true);
      setGenStatus('DONE');
      Haptics.success();
    } catch (e: any) {
      if (requestId !== generationRequestId.current) return;
      setGenStatus('ERROR');
      Haptics.error();
      const friendlyMsg = e.userFriendlyMsg || "Engine composition failed. Try linking sources again.";
      setError(friendlyMsg);
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
    showToast(`"${track.title}" removed`, "Undo", () => {
      BlockStore.removeBlocked(trackId);
      setResult(prev => prev ? { ...prev, tracks: originalTracks } : null);
    });
  };

  const handleSaveToHistory = () => {
    if (!result) return;
    Haptics.impact();
    onComplete(result);
    setActiveSheet('none');
    showToast("Added to your logs", "View", () => {
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
      showToast("Mix synced to Spotify", "Open", () => openSpotifyDeepLink(playlist.id));
    } catch (e: any) {
      toastService.show(e.userFriendlyMsg || "Sync failed", 'error');
    } finally {
      setIsSavingToSpotify(false);
    }
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
      toastService.show(e.message || "Could not push to device.", 'error');
    }
  };

  const handlePlayNowAuto = async () => {
    try {
      const devices = await SpotifyApi.getDevices();
      const active = devices.find(d => d.is_active);
      if (active) {
        onDeviceSelected(active.id);
      } else {
        Haptics.medium();
        setShowDevicePicker(true);
        toastService.show("Select an output device to start playback.", "info");
      }
    } catch (e) {
      setShowDevicePicker(true);
    }
  };

  const totalDurationStr = useMemo(() => {
    if (!result?.tracks) return null;
    const totalMs = result.tracks.reduce((acc, t) => acc + (t.durationMs || 0), 0);
    const mins = Math.floor(totalMs / 60000);
    const hrs = Math.floor(mins / 60);
    return hrs > 0 ? `${hrs}h ${mins % 60}m` : `${mins} mins`;
  }, [result]);

  return (
    <div className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-3xl flex flex-col animate-in slide-in-from-right duration-300 overflow-hidden text-[#A9E8DF]">
      <div 
        className="px-6 pb-5 flex items-center justify-between border-b border-white/5 bg-black/20 shrink-0"
        style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 20px)' }}
      >
        <button onClick={() => { Haptics.light(); onClose(); }} className="text-zinc-500 text-[14px] font-garet font-black uppercase tracking-widest active:text-white transition-colors">
          Cancel
        </button>
        <span className="font-black text-[10px] uppercase tracking-[0.4em] text-zinc-600">Curation Engine</span>
        <div className="w-12" />
      </div>

      <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6 pb-64">
        {genStatus === 'RUNNING' ? (
          <div className="h-full flex flex-col items-center justify-center text-center gap-12 animate-in fade-in duration-1000">
             <div className="relative">
                <div className="w-16 h-16 border-[4px] border-palette-pink/10 rounded-full animate-pulse-soft" />
                <div className="absolute inset-0 w-16 h-16 border-[4px] border-palette-pink border-t-transparent rounded-full animate-spin duration-700" />
             </div>
             <div className="flex flex-col gap-2">
                <h2 className="text-4xl font-mango text-[#D1F2EB] header-ombre tracking-tight">Personalizing</h2>
                <p className="text-zinc-600 text-[10px] font-black uppercase tracking-[0.3em] animate-pulse">Sourcing • Sequencing</p>
             </div>
          </div>
        ) : genStatus === 'ERROR' ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 gap-8 animate-in zoom-in duration-500">
            <div className="w-16 h-16 bg-red-500/10 rounded-[24px] flex items-center justify-center text-red-500 border border-red-500/20 shadow-xl">
               <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
            </div>
            <p className="text-white font-garet font-bold text-center text-lg">{error}</p>
            <button onClick={startRun} className="bg-zinc-800 text-white font-black px-10 py-5 rounded-[24px] active:scale-95 transition-all font-garet uppercase tracking-widest text-[12px] shadow-lg">Retry Build</button>
          </div>
        ) : isPodcast ? (
          <div className="flex flex-col gap-8">
             <header className="flex flex-col gap-1 px-2 stagger-entry stagger-1">
                <h2 className="text-5xl leading-none font-mango header-ombre tracking-tight">{option.name}</h2>
                <div className="flex items-center gap-2 mt-3">
                  <span className="text-zinc-500 text-[10px] font-black uppercase tracking-widest">{result?.episode?.releaseDate}</span>
                </div>
             </header>

            <div className="glass-panel-gold rounded-[24px] p-6 border border-white/10 shadow-2xl flex flex-col gap-6 stagger-entry stagger-2">
              <div className="w-full aspect-square rounded-[20px] overflow-hidden border border-white/10 shadow-2xl relative">
                <img src={result?.episode?.imageUrl} className="w-full h-full object-cover" alt={result?.episode?.name} />
              </div>
              <div className="flex flex-col gap-4">
                 <h3 className="text-[20px] font-garet font-bold text-[#D1F2EB] leading-tight">{result?.episode?.name}</h3>
                 <p className="text-[14px] text-zinc-400 font-medium leading-relaxed font-garet line-clamp-4 opacity-80">
                   {result?.episode?.description?.replace(/<[^>]*>?/gm, '')}
                 </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
             <header className="flex flex-col gap-1 px-2 stagger-entry stagger-1">
              <h2 className="text-5xl leading-none font-mango header-ombre tracking-tighter">{option.name}</h2>
              <div className="flex items-center gap-3 mt-3">
                <div className="bg-palette-gold/10 border border-palette-gold/20 px-3 py-1 rounded-xl">
                  <span className="text-palette-gold text-[10px] font-black uppercase tracking-[0.1em]">{result?.tracks?.length} Tracks</span>
                </div>
                <span className="text-zinc-400 text-[10px] font-black uppercase tracking-[0.2em] font-garet">{totalDurationStr}</span>
              </div>
              
              {result?.sourceSummary && (
                <div className="mt-4 px-4 py-3 bg-white/[0.03] border border-white/5 rounded-[18px] relative overflow-hidden">
                  <p className="text-[10px] font-mono text-[#D1F2EB]/60 leading-relaxed uppercase tracking-widest font-bold">{result.sourceSummary}</p>
                </div>
              )}
            </header>

            <div className="glass-panel-gold rounded-[32px] overflow-hidden divide-y divide-white/5 border border-white/10 shadow-2xl stagger-entry stagger-2">
              {result?.tracks?.map((track, i) => (
                <div key={i} className={`flex items-center gap-4 p-4 hover:bg-white/5 transition-all group stagger-entry stagger-${Math.min(i + 3, 5)}`}>
                  <PinkAsterisk />
                  <div className="w-11 h-11 rounded-xl bg-zinc-900 overflow-hidden shrink-0 border border-white/10 relative">
                    <img src={track.imageUrl} alt="" className="w-full h-full object-cover" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-[16px] font-gurmukhi text-[#D1F2EB] truncate leading-tight">{track.title}</h4>
                    <p className="text-[11px] text-zinc-500 font-medium truncate mt-0.5 font-garet">{track.artist}</p>
                  </div>
                  <button 
                    onClick={() => handleHideTrack(track)} 
                    className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-zinc-600 opacity-0 group-hover:opacity-100 transition-all active:scale-90"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
              ))}
            </div>
            
            <button 
              onClick={startRun}
              className="mx-auto flex items-center gap-2 text-zinc-600 font-black uppercase tracking-[0.3em] text-[9px] active:text-palette-teal transition-colors mb-8"
            >
              Refresh Recipe
            </button>
          </div>
        )}
      </div>

      {!choosingShow && genStatus === 'DONE' && (
        <div 
          className="fixed bottom-0 left-0 right-0 bg-black/60 backdrop-blur-3xl border-t border-white/10 p-5 z-[110]"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 24px)' }}
        >
           <div className="flex flex-col gap-3 max-w-lg mx-auto w-full">
              <button 
                onClick={() => { Haptics.medium(); handleConfirmSpotifySync(); }}
                disabled={isSavingToSpotify}
                className="relative overflow-hidden w-full bg-gradient-to-br from-[#FF007A] via-[#FF1A8B] to-[#FF4D9F] text-white font-black py-4 rounded-[22px] active:scale-[0.98] transition-all font-garet uppercase tracking-[0.25em] text-[13px] shadow-2xl border border-white/25"
              >
                <div className="absolute top-1 left-2 w-[90%] h-[40%] bg-gradient-to-b from-white/30 to-transparent rounded-full blur-[1px] animate-jelly-shimmer pointer-events-none" />
                <span className="relative z-10 flex items-center justify-center gap-3">
                  {isSavingToSpotify ? 'Syncing...' : 'Sync to Spotify'}
                </span>
              </button>
              
              <div className="grid grid-cols-2 gap-3">
                 <button 
                   onClick={handlePlayNowAuto}
                   className="bg-white/10 border border-white/10 text-[#D1F2EB] font-black py-4 rounded-[20px] active:scale-95 transition-all font-garet uppercase tracking-widest text-[11px] flex items-center justify-center gap-2"
                 >
                    Play Now
                 </button>
                 <button 
                   onClick={handleSaveToHistory}
                   className="bg-zinc-900 border border-white/5 text-zinc-500 font-black py-4 rounded-[20px] active:scale-95 transition-all font-garet uppercase tracking-widest text-[11px] flex items-center justify-center gap-2"
                 >
                    Log Mix
                 </button>
              </div>
           </div>
        </div>
      )}

      {showDevicePicker && <DevicePickerModal onSelect={onDeviceSelected} onClose={() => setShowDevicePicker(false)} />}
    </div>
  );
};

export default RunView;
