import React, { useState, useEffect, useMemo, useRef } from 'react';
import { RunOption, RuleSettings, RunResult, RunOptionType, SpotifyDevice, Track, PodcastShowCandidate } from '../types';
import { RuleOverrideStore } from '../services/ruleOverrideStore';
import { getEffectiveRules } from '../utils/ruleUtils';
import { SpotifyPlaybackEngine } from '../services/playbackEngine';
import { Haptics, ImpactFeedbackStyle } from '../services/haptics';
import { spotifyPlayback } from '../services/spotifyPlaybackService';
import { SpotifyApi } from '../services/spotifyApi';
import { SpotifyAuth } from '../services/spotifyAuth';
import { spotifyService } from '../services/spotifyService';
import { SpotifyDataService } from '../services/spotifyDataService';
import { BlockStore } from '../services/blockStore';
import { apiLogger } from '../services/apiLogger';
import DevicePickerModal from './DevicePickerModal';
import QuickSourceModal from './QuickSourceModal';
import { StatusAsterisk } from './HomeView';
import { toastService } from '../services/toastService';
import { USE_MOCK_DATA } from '../constants';
import { spotifyUriToOpenUrl } from '../utils/spotifyDeepLink';

interface RunViewProps {
  option: RunOption;
  rules: RuleSettings;
  onClose: () => void;
  onComplete: (result: RunResult) => void;
  onNavigateToHistory?: void;
  initialResult?: RunResult;
  onResultUpdate?: (result: RunResult) => void;
  onPlayTriggered?: () => void;
  onPreviewStarted?: () => void;
  isQueueMode?: boolean;
  onRegenerate?: () => void;
}

type GenStatus = 'IDLE' | 'RUNNING' | 'DONE' | 'ERROR';
type ViewMode = 'PREVIEW' | 'QUEUE';

const TrackRow: React.FC<{ 
  track: Track; 
  isActive: boolean;
  index: number;
  onPlay: (t: Track, i: number) => void; 
  onStatusToggle: (t: Track) => void; 
  onBlock: (t: Track) => void;
  onHaptic: () => void;
}> = ({ track, isActive, index, onPlay, onStatusToggle, onBlock, onHaptic }) => {
  const [swipeX, setSwipeX] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const [isPressed, setIsPressed] = useState(false);
  
  const touchStartX = useRef<number | null>(null);
  const lastTapTime = useRef<number>(0);
  const timerRef = useRef<any>(null);
  const isLongPress = useRef(false);
  
  const SWIPE_LIMIT = -100;
  // Restore specific long-press duration and sensitivity deadzone
  const LONG_PRESS_DURATION = 500;
  const MOVEMENT_THRESHOLD = 12;

  const handleTouchStart = (foundEvent: React.TouchEvent) => {
    touchStartX.current = foundEvent.touches[0].clientX;
    setIsPressed(true);
    isLongPress.current = false;

    timerRef.current = setTimeout(() => {
      isLongPress.current = true;
      onStatusToggle(track);
      // Success haptic is handled in the parent toggle logic
    }, LONG_PRESS_DURATION);

    const now = Date.now();
    if (now - lastTapTime.current < 300) {
      clearTimeout(timerRef.current);
      onPlay(track, index);
      Haptics.impactAsync(ImpactFeedbackStyle.Heavy);
      lastTapTime.current = 0; 
      return;
    }
    lastTapTime.current = now;
  };

  const handleTouchMove = (foundEvent: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const deltaX = foundEvent.touches[0].clientX - touchStartX.current;
    
    // Deadzone: If user moves horizontally beyond 12px, cancel long-press and treat as swipe
    if (Math.abs(deltaX) > MOVEMENT_THRESHOLD) {
      clearTimeout(timerRef.current);
      setIsPressed(false);
    }

    if (deltaX < 0) {
      setIsSwiping(true);
      setSwipeX(deltaX);
    }
  };

  const handleTouchEnd = () => {
    clearTimeout(timerRef.current);
    setIsPressed(false);

    if (!isLongPress.current && Math.abs(swipeX) < 10) {
      Haptics.impactAsync(ImpactFeedbackStyle.Light);
    }

    if (!isLongPress.current && swipeX < SWIPE_LIMIT) {
      Haptics.impactAsync(ImpactFeedbackStyle.Medium);
      onBlock(track);
    }
    
    setSwipeX(0);
    setIsSwiping(false);
    touchStartX.current = null;
  };

  return (
    <div className="relative overflow-hidden bg-black first:rounded-t-[32px] last:rounded-b-[32px]">
      <div className="absolute inset-0 flex items-center justify-end px-10 transition-colors pointer-events-none" style={{ backgroundColor: `rgba(255, 0, 122, ${Math.min(0.8, Math.abs(swipeX) / 100) * 0.3})` }}>
        <span className="text-white font-black text-[12px] uppercase tracking-[0.4em]" style={{ opacity: Math.min(1, Math.abs(swipeX) / 80) }}>Block</span>
      </div>
      <button 
        onContextMenu={(foundEvent) => foundEvent.preventDefault()}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{ 
          touchAction: 'pan-y', 
          transform: `translateX(${swipeX}px) ${isPressed ? 'scale(0.97)' : 'scale(1)'}`, 
          transition: isSwiping ? 'none' : 'transform 0.4s cubic-bezier(0.23, 1, 0.32, 1)' 
        }}
        className={`w-full flex items-center gap-4 p-5 transition-all group text-left select-none relative z-10 border-b border-[#6D28D9]/20 ${isActive ? 'bg-palette-teal/15 border-palette-teal/40 shadow-[inset_0_0_40px_rgba(45,185,177,0.15)]' : 'bg-[#0a0a0a]/85 backdrop-blur-3xl hover:bg-white/5 active:bg-palette-teal/5'}`}
      >
        <div className="relative shrink-0 flex items-center justify-center min-w-[24px]">
          <StatusAsterisk status={track.status || 'none'} />
        </div>
        <div className={`w-12 h-12 rounded-2xl bg-zinc-900 overflow-hidden shrink-0 border relative pointer-events-none transition-all duration-500 ${isActive ? 'border-palette-teal/60 scale-105 shadow-[0_0_20px_rgba(45,185,177,0.4)]' : 'border-white/10'}`}>
          <img src={track.imageUrl} alt="" className="w-full h-full object-cover" />
          {isActive && <div className="absolute inset-0 bg-palette-teal/15 animate-pulse" />}
        </div>
        <div className="flex-1 min-w-0 pointer-events-none">
          <h4 className={`text-[15px] font-gurmukhi leading-tight transition-colors duration-300 truncate ${isActive ? 'text-palette-teal' : 'text-[#D1F2EB] group-active:text-palette-teal'}`}>{track.title}</h4>
          <p className="text-[11px] text-zinc-500 font-medium truncate mt-1 font-garet">{track.artist}</p>
        </div>
        <div className={`w-1.5 h-1.5 rounded-full transition-all duration-500 ${isActive ? 'bg-palette-teal scale-125 shadow-[0_0_10px_rgba(45,185,177,1)]' : 'bg-zinc-800'}`} />
      </button>
    </div>
  );
};

const RunView: React.FC<RunViewProps> = ({ option, rules, onClose, onComplete, initialResult, onResultUpdate, onPlayTriggered, onPreviewStarted, isQueueMode, onRegenerate }) => {
  const [genStatus, setGenStatus] = useState<GenStatus>(initialResult ? 'DONE' : 'IDLE');
  const [viewMode, setViewMode] = useState<ViewMode>(isQueueMode ? 'QUEUE' : 'PREVIEW');
  
  const [showPlayOptions, setShowPlayOptions] = useState(false);
  const [showSaveOptions, setShowSaveOptions] = useState(false);
  const [showDevicePicker, setShowDevicePicker] = useState(false);
  const [showQuickSource, setShowQuickSource] = useState(false);
  
  // New: Naming prompt state
  const [namingDestination, setNamingDestination] = useState<'spotify' | 'vault' | null>(null);
  const [editName, setEditName] = useState("");

  const [currentPlayingUri, setCurrentPlayingUri] = useState<string | null>(null);
  const [result, setResult] = useState<RunResult | null>(initialResult || null);
  const [error, setError] = useState<string | null>(null);
  const [isSavingToSpotify, setIsSavingToSpotify] = useState(false);
  const [pendingInject, setPendingInject] = useState(false);
  
  const generationRequestId = useRef(0);
  const engine = useMemo(() => new SpotifyPlaybackEngine(), []);
  const effectiveRules = getEffectiveRules(rules, RuleOverrideStore.getForOption(option.id));

  const fireHaptic = () => {
    const el = document.getElementById('local-haptic-trigger');
    if (el) (el as HTMLInputElement).click();
  };

  const handleHistoryBackfill = () => {
    if (initialResult) {
      setResult(initialResult);
      setGenStatus('DONE');
    }
  };

  const startRun = async () => {
    generationRequestId.current++;
    const reqId = generationRequestId.current;
    
    setGenStatus('RUNNING');
    setError(null);
    Haptics.medium();

    try {
      const runResult = await engine.generateRunResult(option, effectiveRules);
      
      if (reqId !== generationRequestId.current) return;

      setResult(runResult);
      setGenStatus('DONE');
      // FIXED: Use onResultUpdate instead of onComplete to avoid auto-saving to Vault
      onResultUpdate?.(runResult);
      Haptics.success();
    } catch (err: any) {
      if (reqId === generationRequestId.current) {
        setError(err.message || "Composition failed");
        setGenStatus('ERROR');
        Haptics.error();
      }
    }
  };

  /**
   * injectMixToDevice - Forcefully pushes the full composition into the target Spotify device.
   * Uses robust retry logic. For podcasts, it waits for device visibility specifically.
   */
  const injectMixToDevice = async (targetDeviceId?: string) => {
    if (!result?.tracks || result.tracks.length === 0) {
      toastService.show("No tracks available to play", "warning");
      return;
    }

    try {
      const uris = result.tracks.map(t => t.uri);
      
      // Ensure phone device is visible and active before trying play.
      // 6s polling every 500ms implemented in spotifyPlayback.
      const deviceId = await spotifyPlayback.ensureDeviceVisibleAndActive(targetDeviceId);
      
      if (!deviceId) {
        toastService.show("Open Spotify on this phone and start any episode once, then try again.", "warning");
        return;
      }

      let offsetIndex = 0;
      if (currentPlayingUri) {
        const foundIdx = result.tracks.findIndex(t => t.uri === currentPlayingUri);
        if (foundIdx !== -1) offsetIndex = foundIdx;
      }

      await spotifyPlayback.playUrisWithRetry(uris, deviceId, offsetIndex);
      
      const feedbackMsg = targetDeviceId ? "Playback switched & Mix loaded" : "Mix loaded into Spotify";
      toastService.show(feedbackMsg, "success");
    } catch (err: any) {
      console.error("Injection Error:", err);
    }
  };

  /**
   * Return Detection - Uses multiple events and a fail-safe timer for reliable background injection.
   */
  useEffect(() => {
    let fallbackTimer: any = null;

    const performInjection = () => {
      if (pendingInject) {
        setPendingInject(false);
        if (fallbackTimer) clearTimeout(fallbackTimer);
        // Initial wait for Spotify background session to start registering
        setTimeout(() => injectMixToDevice(), 1000);
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        performInjection();
      }
    };

    const handleFocus = () => {
      performInjection();
    };

    if (pendingInject) {
      window.addEventListener('focus', handleFocus);
      document.addEventListener('visibilitychange', handleVisibilityChange);
      
      // 6-second Fail-safe
      fallbackTimer = setTimeout(performInjection, 6000);
    }

    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (fallbackTimer) clearTimeout(fallbackTimer);
    };
  }, [pendingInject, result, currentPlayingUri, option.type]);

  useEffect(() => {
    if (!viewMode || viewMode !== 'QUEUE') {
      onPreviewStarted?.();
    }

    if (initialResult) handleHistoryBackfill();
    if (!initialResult && genStatus === 'IDLE') startRun();
    
    const pollPlayback = async () => {
      try {
        // Updated to include episodes for correct highlight in queue
        const state = await SpotifyApi.request('/me/player?additional_types=track,episode');
        if (state?.item?.uri) {
          setCurrentPlayingUri(state.item.uri);
        }
      } catch (e) {}
    };
    const interval = setInterval(pollPlayback, 3000);
    pollPlayback();
    return () => clearInterval(interval);
  }, [option, rules, initialResult]);

  /**
   * handleWakeUpCall - Uses standard web location launch with reliability conversion.
   */
  const handleWakeUpCall = async () => {
    if (!result?.tracks || result.tracks.length === 0) return;
    Haptics.heavy();
    
    const firstTrack = result.tracks[0];
    
    // SURGICAL FIX: Trigger API injection for both Music AND Podcasts.
    setPendingInject(true);

    const url = spotifyUriToOpenUrl(firstTrack.uri);
    window.location.href = url;
    
    setViewMode('QUEUE');
    onPlayTriggered?.();
    setShowPlayOptions(false);
  };

  const handleDeepLinkPlay = async () => {
    if (!result?.tracks || result.tracks.length === 0) return;
    Haptics.heavy();
    
    if (USE_MOCK_DATA) {
      const url = spotifyUriToOpenUrl(result.tracks[0].uri);
      window.location.href = url;
      setViewMode('QUEUE');
      onPlayTriggered?.();
      return;
    }

    try {
      toastService.show("Preparing session mix...", "info");
      const user = await SpotifyApi.getMe();
      const mixTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const mixName = `Session: ${option.name} (${mixTime})`;
      const desc = "Live session container generated by GetReady.";
      
      const playlist = await SpotifyDataService.createPlaylist(user.id, mixName, desc);
      await SpotifyDataService.replacePlaylistTracks(playlist.id, result.tracks.map(t => t.uri));
      
      const playlistUrl = spotifyUriToOpenUrl(`spotify:playlist:${playlist.id}`);
      window.location.href = playlistUrl;
      
      setViewMode('QUEUE');
      onPlayTriggered?.();
      setShowPlayOptions(false);
    } catch (err: any) {
      toastService.show(err.message || "Auto-Playlist creation failed", "error");
    }
  };

  const handleSaveToVault = () => {
    const defaultName = `${option.name} Mix - ${new Date().toLocaleDateString()}`;
    setEditName(defaultName);
    setNamingDestination('vault');
    setShowSaveOptions(false);
  };

  const handleSaveToSpotifyCloud = () => {
    const defaultName = `${option.name} Mix - ${new Date().toLocaleDateString()}`;
    setEditName(defaultName);
    setNamingDestination('spotify');
    setShowSaveOptions(false);
  };

  const handleConfirmSave = async () => {
    if (!editName.trim() || !result) return;
    Haptics.impact();

    if (namingDestination === 'vault') {
      const updatedResult = { ...result, playlistName: editName.trim() };
      // Explicitly calling onComplete here triggers the save to Vault persistence in App.tsx
      onComplete(updatedResult);
      toastService.show(`Archived as "${editName.trim()}"`, "success");
      setNamingDestination(null);
    } else if (namingDestination === 'spotify') {
      setIsSavingToSpotify(true);
      try {
        const user = await SpotifyApi.getMe();
        const desc = `Generated by GetReady iOS Engine. Mode: ${option.name}`;
        const playlist = await SpotifyDataService.createPlaylist(user.id, editName.trim(), desc);
        await SpotifyDataService.replacePlaylistTracks(playlist.id, result.tracks.map(t => t.uri));
        Haptics.success();
        toastService.show(`Spotify Playlist "${editName.trim()}" created!`, "success");
        setNamingDestination(null);
      } catch (err: any) {
        toastService.show(err.message || "Cloud sync failed", "error");
      } finally {
        setIsSavingToSpotify(false);
      }
    }
  };

  const handlePlayTrack = async (track: Track, index: number) => {
    if (!result?.tracks) return;
    try {
      const uris = result.tracks.map(t => t.uri);
      await SpotifyPlaybackEngine.playTrack(track, uris, index);
      onPlayTriggered?.();
      Haptics.light();
    } catch (foundError: any) {
      if (foundError.message === "NO_ACTIVE_DEVICE") {
        setShowDevicePicker(true);
      } else {
        toastService.show(foundError.message, "error");
      }
    }
  };

  // Improved: handleToggleStatus now manages "Gems" playlist state with optimistic UI
  const handleToggleStatus = async (track: Track) => {
    if (!result?.tracks) return;
    
    const isCurrentlyGem = track.status === 'gem';
    const newStatus: 'liked' | 'none' | 'gem' = isCurrentlyGem ? 'none' : 'gem';
    
    // Optimistic UI state update
    const originalTracks = [...result.tracks];
    const updatedTracks = result.tracks.map(t => t.id === track.id ? { ...t, status: newStatus } : t);
    const updatedResult = { ...result, tracks: updatedTracks };
    setResult(updatedResult);
    if (onResultUpdate) onResultUpdate(updatedResult);

    try {
      if (newStatus === 'gem') {
        Haptics.success();
        await SpotifyDataService.addTrackToGems(track.uri);
        toastService.show("Added to Gems", "success");
      } else {
        Haptics.medium();
        await SpotifyDataService.removeTrackFromGems(track.uri);
        toastService.show("Removed from Gems", "info");
      }
    } catch (err: any) {
      // Revert state on network/API failure
      setResult({ ...result, tracks: originalTracks });
      if (onResultUpdate) onResultUpdate({ ...result, tracks: originalTracks });
      apiLogger.logError(`Gems toggle failed for ${track.id}: ${err.message}`);
    }
  };

  const handleBlockTrack = async (track: Track) => {
    if (!result?.tracks) return;
    Haptics.heavy();
    BlockStore.addBlocked(track);
    const updatedTracks = result.tracks.filter(t => t.id !== track.id);
    const updatedResult = { ...result, tracks: updatedTracks };
    setResult(updatedResult);
    onResultUpdate?.(updatedResult);
    toastService.show("Track hidden from future mixes", "info");
  };

  const handleOpenDevicePicker = () => {
    Haptics.medium();
    setShowDevicePicker(true);
    setShowPlayOptions(false);
  };

  const handleRegenerate = () => {
    Haptics.medium();
    onRegenerate?.();
    startRun();
  };

  const totalDurationStr = useMemo(() => {
    if (!result?.tracks) return null;
    const mins = Math.floor(result.tracks.reduce((acc, t) => acc + (t.durationMs || 0), 0) / 60000);
    return mins > 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins} mins`;
  }, [result]);

  if (genStatus === 'RUNNING') {
    return (
      <div className="fixed inset-0 z-[1000] bg-black/95 flex flex-col items-center justify-center p-8 animate-in fade-in duration-300">
        <div className="w-20 h-20 border-4 border-palette-pink border-t-transparent rounded-full animate-spin mb-8" />
        <h2 className="text-4xl font-mango text-[#D1F2EB] mb-2">Composing Mix</h2>
        <p className="text-zinc-500 font-garet text-center max-w-xs uppercase tracking-widest text-[10px] architecture-relaxed">
          Syncing local catalog with Spotify cloud database...
        </p>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[1000] bg-black flex flex-col animate-in slide-in-from-bottom duration-500 pb-[85px]">
      <header className="px-6 pb-6 flex items-center justify-between border-b border-white/5 bg-black/30 shrink-0 pt-16">
        <button onClick={() => { Haptics.impactAsync(ImpactFeedbackStyle.Light); onClose(); }} className="text-palette-pink text-[14px] font-black uppercase tracking-[0.2em] active:opacity-50 transition-opacity">Back</button>
        <div className="flex flex-col items-center">
          <span className="font-black text-[10px] uppercase tracking-[0.5em] text-zinc-600 leading-none">
            {viewMode === 'QUEUE' ? 'Active Queue' : 'Preview Mix'}
          </span>
        </div>
        <div className="w-12" />
      </header>

      <div className="flex-1 overflow-y-auto ios-scroller p-6 flex flex-col gap-8 pb-[180px] overflow-x-hidden w-full">
        <div className="flex flex-col gap-6">
           <header className="flex flex-col gap-4 px-4 stagger-entry stagger-1">
            <div className="w-full overflow-hidden whitespace-nowrap relative py-2">
              <h2 className="leading-none font-mango header-ombre tracking-tighter drop-shadow-2xl text-7xl animate-[marquee_15s_linear_infinite] pb-2">{option.name}</h2>
            </div>
            <div className="flex items-center gap-3 w-full">
              <div className="flex items-center gap-2 shrink-0">
                <div className="bg-palette-gold/10 border border-palette-gold/30 px-3 py-1.5 rounded-xl whitespace-nowrap">
                  <span className="text-palette-gold text-[10px] font-black uppercase tracking-[0.15em] leading-none">{result?.tracks?.length || 0} Tracks</span>
                </div>
                <div className="bg-[#6D28D9]/10 border border-[#6D28D9]/30 px-3 py-1.5 rounded-xl whitespace-nowrap">
                  <span className="text-[#8B5CF6] text-[10px] font-black uppercase tracking-[0.15em]">{totalDurationStr}</span>
                </div>
              </div>
              
              {genStatus === 'DONE' && (
                <button 
                  onClick={() => {
                    Haptics.impactAsync(ImpactFeedbackStyle.Light);
                    if (viewMode === 'PREVIEW') {
                      handleWakeUpCall();
                    } else {
                      handleOpenDevicePicker(); 
                    }
                  }}
                  className={`flex-1 relative overflow-hidden px-4 py-2.5 rounded-[20px] active:scale-95 transition-all shadow-xl flex items-center justify-center gap-3 border ${viewMode === 'PREVIEW' ? 'border-palette-pink/40 bg-palette-pink/15 text-palette-pink shadow-palette-pink/20' : 'border-palette-emerald/40 bg-palette-emerald/15 text-palette-emerald shadow-palette-emerald/20'}`}
                >
                  <svg className="w-5 h-5 shrink-0" fill="currentColor" viewBox="0 0 24 24">
                    {viewMode === 'PREVIEW' ? (
                      <path d="M8 5v14l11-7z"/>
                    ) : (
                      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z"/>
                    )}
                  </svg>
                  <span className="font-black text-[11px] uppercase tracking-wider leading-[1.1] text-left">
                    {viewMode === 'PREVIEW' ? 'Play Mix' : 'Source'}
                  </span>
                </button>
              )}
            </div>
          </header>

          <div className="bg-[#0a0a0a]/60 backdrop-blur-3xl rounded-[32px] overflow-hidden border border-white/10 shadow-[0_40px_80px_-20px_rgba(0,0,0,0.9)] stagger-entry stagger-3">
            <div className="divide-y divide-[#6D28D9]/20">
              {result?.tracks?.map((track, i) => (
                <TrackRow 
                  key={track.uri + i} 
                  track={track} 
                  isActive={currentPlayingUri === track.uri} 
                  index={i} 
                  onPlay={handlePlayTrack} 
                  onStatusToggle={handleToggleStatus} 
                  onBlock={handleBlockTrack}
                  onHaptic={fireHaptic} 
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      {viewMode === 'PREVIEW' && (
        <div className="fixed bottom-0 left-0 right-0 px-6 pt-10 pb-3 bg-gradient-to-t from-black via-black/95 to-transparent z-[100]" style={{ bottom: '85px' }}>
          <div className="flex items-center gap-4">
             <button 
                onClick={handleRegenerate}
                className="w-14 h-14 rounded-[24px] bg-zinc-900 border border-white/10 flex items-center justify-center text-palette-gold active:scale-95 transition-all shadow-xl"
             >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
             </button>

             <button 
              onClick={() => { Haptics.heavy(); setShowSaveOptions(true); }}
              className="flex-1 relative overflow-hidden bg-palette-pink text-white font-black py-3.5 rounded-[24px] flex items-center justify-center gap-3 active:scale-95 transition-all shadow-2xl shadow-palette-pink/30 border border-white/10"
            >
              <div className="absolute top-1 left-2 w-[90%] h-[40%] bg-gradient-to-b from-white/40 to-transparent rounded-full blur-[1px] animate-jelly-shimmer pointer-events-none" />
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
              <span className="text-lg font-garet font-bold uppercase tracking-widest">Save</span>
            </button>

            <button 
                onClick={() => { Haptics.medium(); setShowPlayOptions(true); }}
                className="w-14 h-14 rounded-[24px] bg-zinc-900 border border-white/10 flex items-center justify-center text-palette-teal active:scale-95 transition-all shadow-xl"
             >
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
             </button>
          </div>
        </div>
      )}

      {showPlayOptions && (
        <div className="fixed inset-0 z-[10001] bg-black/80 backdrop-blur-2xl flex items-center justify-center p-6 animate-in fade-in duration-300" onClick={() => setShowPlayOptions(false)}>
          <div className="bg-zinc-900 border border-white/10 rounded-[44px] p-8 w-full max-sm:p-6 w-full max-w-sm flex flex-col gap-6 shadow-2xl animate-in zoom-in duration-300" onClick={foundEvent => foundEvent.stopPropagation()}>
            <header className="text-center">
              <h2 className="text-4xl font-mango text-[#D1F2EB] leading-none">Playback Options</h2>
              <p className="text-[10px] font-black text-zinc-600 uppercase tracking-widest mt-2">Selection Logic</p>
            </header>
            <div className="flex flex-col gap-3">
              <button 
                onClick={handleWakeUpCall}
                className="w-full py-6 rounded-[28px] bg-[#1DB954] text-white flex flex-col items-center gap-2 transition-all active:scale-95 shadow-xl shadow-[#1DB954]/20 border border-white/10"
              >
                <div className="flex items-center gap-3">
                  <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.494 17.306c-.215.353-.674.463-1.027.248-2.857-1.745-6.453-2.14-10.686-1.173-.404.093-.813-.162-.906-.566-.093-.404.162-.813.566-.906 4.63-1.06 8.598-.61 11.785 1.339.353.215.463.674.248 1.027zm1.467-3.264c-.271.44-.847.581-1.287.31-3.268-2.008-8.25-2.592-12.115-1.417-.496.15-1.022-.128-1.173-.623-.15-.496.128-1.022.623-1.173 4.417-1.34 9.907-.678 13.642 1.613.44.271.581.847.31 1.287zm.127-3.413C15.228 8.249 8.845 8.038 5.16 9.157c-.551.167-1.13-.153-1.297-.704-.167-.551.153-1.13.704-1.297 4.227-1.282 11.278-1.037 15.82 1.66.496.295.661.934.366 1.43-.295.496-.934.661-1.43.366z"/>
                  </svg>
                  <span className="font-garet font-black text-[13px] uppercase tracking-widest">Play in Spotify</span>
                </div>
                <span className="text-[9px] opacity-70 font-bold">Launch Wake Up Call</span>
              </button>
              <button 
                onClick={handleOpenDevicePicker}
                className="w-full py-6 rounded-[28px] bg-palette-teal/10 border border-palette-teal/40 text-palette-teal flex flex-col items-center gap-2 transition-all active:scale-95 shadow-lg"
              >
                <div className="flex items-center gap-3">
                  <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M17 1.01L7 1c-1.1 0-2 .9-2 2v18c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V3c0-1.1-.9-1.99-2-1.99zM17 19H7V5h10v14z"/></svg>
                  <span className="font-garet font-black text-[13px] uppercase tracking-widest">Connect to Device</span>
                </div>
                <span className="text-[9px] opacity-70 font-bold">Stream to Smart Speaker</span>
              </button>
            </div>
            <button onClick={() => setShowPlayOptions(false)} className="w-full py-2 text-zinc-600 font-black uppercase tracking-widest text-[10px] active:text-zinc-400">Cancel</button>
          </div>
        </div>
      )}

      {showSaveOptions && (
        <div className="fixed inset-0 z-[10001] bg-black/80 backdrop-blur-2xl flex items-center justify-center p-6 animate-in fade-in duration-300" onClick={() => setShowSaveOptions(false)}>
          <div className="bg-zinc-900 border border-white/10 rounded-[44px] p-8 w-full max-sm:p-6 w-full max-w-sm flex flex-col gap-6 shadow-2xl animate-in zoom-in duration-500" onClick={foundEvent => foundEvent.stopPropagation()}>
            <header className="text-center">
              <h2 className="text-4xl font-mango text-[#D1F2EB] leading-none">Save Playlist</h2>
              <p className="text-[10px] font-black text-zinc-600 uppercase tracking-widest mt-2">Persistence Flow</p>
            </header>
            <div className="flex flex-col gap-3">
              <button 
                disabled={isSavingToSpotify}
                onClick={handleSaveToSpotifyCloud}
                className={`w-full py-6 rounded-[28px] bg-[#1DB954] text-white flex flex-col items-center gap-2 transition-all active:scale-95 shadow-xl shadow-[#1DB954]/20 border border-white/10 ${isSavingToSpotify ? 'opacity-50 grayscale animate-pulse' : ''}`}
              >
                <span className="font-garet font-black text-[13px] uppercase tracking-widest">Save to Spotify</span>
                <span className="text-[9px] opacity-70 font-bold">Create Official Playlist</span>
              </button>
              <button 
                onClick={handleSaveToVault}
                className="w-full py-6 rounded-[28px] bg-palette-teal/10 border border-palette-teal/40 text-palette-teal flex flex-col items-center gap-2 transition-all active:scale-95 shadow-lg"
              >
                <span className="font-garet font-black text-[13px] uppercase tracking-widest">Save to Vault</span>
                <span className="text-[9px] opacity-70 font-bold">Internal App History</span>
              </button>
            </div>
            <button onClick={() => setShowSaveOptions(false)} className="w-full py-2 text-zinc-600 font-black uppercase tracking-widest text-[10px] active:text-zinc-400">Cancel</button>
          </div>
        </div>
      )}

      {namingDestination && (
        <div className="fixed inset-0 z-[10002] bg-black/80 backdrop-blur-2xl flex items-center justify-center p-6 animate-in fade-in duration-300">
          <div className="bg-zinc-900 border border-white/10 rounded-[44px] p-8 w-full max-sm:p-6 w-full max-w-sm flex flex-col gap-6 shadow-2xl animate-in zoom-in duration-300" onClick={e => e.stopPropagation()}>
            <header>
              <h2 className="text-4xl font-mango text-[#D1F2EB] leading-none">Name your playlist</h2>
              <p className="text-[10px] font-black text-zinc-600 uppercase tracking-widest mt-2">Finalize record title</p>
            </header>
            <div className="flex flex-col gap-2">
              <input 
                type="text" 
                value={editName}
                onChange={e => setEditName(e.target.value)}
                autoFocus
                className={`bg-black/40 border ${editName.trim() === '' ? 'border-red-500/50' : 'border-white/10'} rounded-2xl px-5 py-4 text-[#D1F2EB] font-garet font-bold outline-none focus:border-palette-pink transition-all`}
              />
              {editName.trim() === '' && <span className="text-[9px] text-red-500 font-bold uppercase tracking-widest px-1">Name cannot be empty</span>}
            </div>
            <div className="flex flex-col gap-3">
              <button 
                onClick={handleConfirmSave}
                disabled={editName.trim() === '' || isSavingToSpotify}
                className="w-full bg-palette-pink text-white font-black py-5 rounded-[24px] active:scale-95 transition-all font-garet uppercase tracking-widest text-xs shadow-xl shadow-palette-pink/20"
              >
                {isSavingToSpotify ? 'Saving...' : 'Save'}
              </button>
              <button onClick={() => setNamingDestination(null)} className="w-full py-2 text-zinc-600 font-black uppercase tracking-widest text-[10px] active:text-zinc-400">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {showDevicePicker && (
        <div className="fixed inset-0 z-[10001]">
          <DevicePickerModal 
            onSelect={async (selectedDeviceId) => { 
              setShowDevicePicker(false); 
              Haptics.success();
              try {
                await injectMixToDevice(selectedDeviceId);
                // SUCCESS: Switch to Active Queue mode and trigger player strip
                setViewMode('QUEUE');
                onPlayTriggered?.();
              } catch (e) {
                // FAILURE: injectMixToDevice already toasts the error, 
                // we stay on Preview Mix screen.
              }
            }} 
            onClose={() => setShowDevicePicker(false)} 
          />
        </div>
      )}
      
      {showQuickSource && (
        <div className="fixed inset-0 z-[10001]">
          <QuickSourceModal 
            onClose={() => setShowQuickSource(false)} 
            onTransfer={async (foundDeviceId) => {
              setShowQuickSource(false);
              await injectMixToDevice(foundDeviceId);
              Haptics.success();
            }}
          />
        </div>
      )}

      <input 
        type="checkbox" 
        id="local-haptic-trigger" 
        style={{ opacity: 0, position: 'absolute', pointerEvents: 'none', zIndex: -1 }} 
      />
    </div>
  );
};

export default RunView;