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
import { apiLogger } from '../services/apiLogger';
import DevicePickerModal from './DevicePickerModal';
import { StatusAsterisk } from './HomeView';
import { toastService } from '../services/toastService';

interface RunViewProps {
  option: RunOption;
  rules: RuleSettings;
  onClose: () => void;
  onComplete: (result: RunResult) => void;
  onNavigateToHistory?: () => void;
  initialResult?: RunResult;
  onResultUpdate?: (result: RunResult) => void;
  onPlayTriggered?: () => void;
  isQueueMode?: boolean;
}

type GenStatus = 'IDLE' | 'RUNNING' | 'DONE' | 'ERROR';

const TrackRow: React.FC<{ 
  track: Track; 
  isActive: boolean;
  index: number;
  onPlay: (t: Track, i: number) => void; 
  onStatusToggle: (t: Track) => void; 
  onBlock: (t: Track) => void;
}> = ({ track, isActive, index, onPlay, onStatusToggle, onBlock }) => {
  const [swipeX, setSwipeX] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const touchStartX = useRef<number | null>(null);
  const longPressTimer = useRef<number | null>(null);
  const lastTapTime = useRef<number>(0);
  const SWIPE_LIMIT = -100;

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    longPressTimer.current = window.setTimeout(() => {
      onStatusToggle(track);
      Haptics.impact();
    }, 600);
    const now = Date.now();
    if (now - lastTapTime.current < 300) {
      onPlay(track, index);
      Haptics.impact();
    }
    lastTapTime.current = now;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const deltaX = e.touches[0].clientX - touchStartX.current;
    if (Math.abs(deltaX) > 10 && longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    if (deltaX < 0) {
      setIsSwiping(true);
      setSwipeX(deltaX);
    }
  };

  const handleTouchEnd = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    if (swipeX < SWIPE_LIMIT) {
      Haptics.impact();
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
        onClick={() => onPlay(track, index)}
        onDoubleClick={() => onPlay(track, index)}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{ touchAction: 'pan-y', transform: `translateX(${swipeX}px)`, transition: isSwiping ? 'none' : 'transform 0.4s cubic-bezier(0.23, 1, 0.32, 1)' }}
        className={`w-full flex items-center gap-4 p-5 transition-all group text-left select-none relative z-10 border-b border-[#6D28D9]/20 ${isActive ? 'bg-palette-teal/15 border-palette-teal/40 shadow-[inset_0_0_40px_rgba(45,185,177,0.15)]' : 'bg-[#0a0a0a]/85 backdrop-blur-3xl hover:bg-white/5 active:bg-palette-teal/5'}`}
      >
        <div className="relative shrink-0 flex items-center justify-center min-w-[24px]">
          {isActive ? (
            <div className="flex gap-0.5 items-end h-4 mb-0.5">
               <div className="w-1 bg-palette-teal rounded-full animate-[pulse_0.6s_ease-in-out_infinite]" style={{ height: '100%' }} />
               <div className="w-1 bg-palette-teal rounded-full animate-[pulse_0.8s_ease-in-out_infinite]" style={{ height: '60%' }} />
               <div className="w-1 bg-palette-teal rounded-full animate-[pulse_0.7s_ease-in-out_infinite]" style={{ height: '85%' }} />
            </div>
          ) : <StatusAsterisk status={track.status === 'liked' || track.status === 'gem' ? 'liked' : 'none'} />}
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

const RunView: React.FC<RunViewProps> = ({ option, rules, onClose, onComplete, initialResult, onResultUpdate, onPlayTriggered, isQueueMode }) => {
  const [genStatus, setGenStatus] = useState<GenStatus>(initialResult ? 'DONE' : 'IDLE');
  const [showPlayOptions, setShowPlayOptions] = useState(false);
  const [showSaveOptions, setShowSaveOptions] = useState(false);
  const [showSaveConfirmDialog, setShowSaveConfirmDialog] = useState<'logs' | 'spotify' | null>(null);
  const [showDevicePicker, setShowDevicePicker] = useState(false);
  const [isQueuePlaying, setIsQueuePlaying] = useState(isQueueMode || false);
  const [currentPlayingUri, setCurrentPlayingUri] = useState<string | null>(null);
  const [showWakeUpPrompt, setShowWakeUpPrompt] = useState<string | null>(null);
  const [result, setResult] = useState<RunResult | null>(initialResult || null);
  const [error, setError] = useState<string | null>(null);
  const [playlistName, setPlaylistName] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [hasDevices, setHasDevices] = useState(false);
  const generationRequestId = useRef(0);
  const engine = useMemo(() => new SpotifyPlaybackEngine(), []);
  const effectiveRules = getEffectiveRules(rules, RuleOverrideStore.getForOption(option.id));

  useEffect(() => {
    if (initialResult) handleHistoryBackfill();
    if (!initialResult && genStatus === 'IDLE') startRun();
    checkDeviceStatus();
    const pollPlayback = async () => {
      try {
        const state = await SpotifyApi.request('/me/player');
        if (state?.item?.uri) {
          setCurrentPlayingUri(state.item.uri);
          if (state.is_playing) setShowWakeUpPrompt(null);
        }
      } catch (e) {}
    };
    const interval = setInterval(pollPlayback, 3000);
    pollPlayback();
    return () => clearInterval(interval);
  }, [option, rules, initialResult]);

  const checkDeviceStatus = async () => {
    try { const devices = await SpotifyApi.getDevices(); setHasDevices(devices.length > 0); } catch (e) { setHasDevices(false); }
  };

  const handleHistoryBackfill = async () => {
    if (!initialResult?.tracks) return;
    const validTracks = initialResult.tracks.filter(t => !BlockStore.isBlocked(t.uri.split(':').pop() || ''));
    if (validTracks.length < initialResult.tracks.length) {
      try {
        const fullResult = await engine.generateRunResult(option, effectiveRules);
        if (fullResult.tracks) {
          const backfillNeeded = (initialResult.tracks.length) - validTracks.length;
          const updated = { ...initialResult, tracks: [...validTracks, ...fullResult.tracks.filter(t => !validTracks.some(vt => vt.uri === t.uri)).slice(0, backfillNeeded)] };
          setResult(updated);
          onResultUpdate?.(updated);
        }
      } catch (e) { setResult({ ...initialResult, tracks: validTracks }); }
    }
  };

  const startRun = async () => {
    Haptics.impact();
    setError(null);
    setGenStatus('RUNNING');
    setResult(null); 
    setIsQueuePlaying(false);
    const requestId = ++generationRequestId.current;
    try {
      await new Promise(r => setTimeout(r, 1200));
      const runResult = await engine.generateRunResult(option, effectiveRules);
      if (requestId !== generationRequestId.current) return;
      if (runResult.tracks) runResult.tracks = runResult.tracks.map(t => ({ ...t, status: 'none' }));
      setResult(runResult);
      setGenStatus('DONE');
      onResultUpdate?.(runResult);
      Haptics.success();
    } catch (e: any) {
      if (requestId !== generationRequestId.current) return;
      setGenStatus('ERROR');
      Haptics.error();
      setError(e.userFriendlyMsg || "Engine composition failed.");
    }
  };

  const handlePlayTrack = async (track: Track, index: number) => {
    if (!result?.tracks) return;
    Haptics.light();
    setIsQueuePlaying(true); 
    setCurrentPlayingUri(track.uri);
    onPlayTriggered?.();
    
    // FIX: Using centralized playback engine for Silent Wake-up logic
    await SpotifyPlaybackEngine.playTrack(track, result.tracks.map(t => t.uri), index);
    
    // Check if we need to show the manual wake up prompt as a secondary safety
    setTimeout(async () => {
      const state = await SpotifyApi.request('/me/player');
      if (!state || !state.is_playing) setShowWakeUpPrompt(track.uri);
    }, 2500);
  };

  const triggerWakeUp = () => {
    if (!showWakeUpPrompt) return;
    Haptics.impact();
    // FIX: Sanitization for deep link crash
    const uriParts = showWakeUpPrompt.split(':');
    const trackId = uriParts[uriParts.length - 1];
    toastService.show("Waking up Spotify... Tap the Back arrow to return.", "info");
    window.location.assign(`spotify:track:${trackId}`);
    setShowWakeUpPrompt(null);
  };

  const handleToggleStatus = async (track: Track) => {
    if (!result || !result.tracks) return;
    const currentTrack = result.tracks.find(t => t.uri === track.uri);
    if (!currentTrack) return;
    const nextStatus: Track['status'] = currentTrack.status === 'liked' ? 'none' : 'liked';
    setResult(prev => {
      if (!prev || !prev.tracks) return prev;
      const updated = { ...prev, tracks: prev.tracks.map(t => t.uri === track.uri ? { ...t, status: nextStatus } : t) };
      onResultUpdate?.(updated);
      return updated;
    });
    try {
      if (nextStatus === 'liked') { await SpotifyDataService.addTrackToGems(track.uri); toastService.show("Added to GetReady Gems", "success"); }
      else { await SpotifyDataService.removeTrackFromGems(track.uri); toastService.show("Removed from Gems", "info"); }
    } catch (e: any) { toastService.show("Catalog sync failed", "error"); }
  };

  const handleBlockTrack = (track: Track) => {
    Haptics.impact();
    BlockStore.addBlocked(track);
    setResult(prev => {
      const updated = prev ? { ...prev, tracks: prev.tracks?.filter(t => t.uri !== track.uri) } : null;
      if (updated) onResultUpdate?.(updated);
      return updated;
    });
  };

  const handleConfirmSave = async () => {
    if (!result) return;
    setIsSaving(true);
    Haptics.impact();
    try {
      if (showSaveConfirmDialog === 'spotify') {
        const user = await SpotifyApi.getMe();
        const playlist = await SpotifyDataService.createPlaylist(user.id, playlistName, result.sourceSummary || "");
        if (result.tracks) await SpotifyDataService.replacePlaylistTracks(playlist.id, result.tracks.map(t => t.uri));
        toastService.show("Saved to Spotify", "success");
      } else {
        onComplete({ ...result, playlistName });
        toastService.show("Saved to Logs", "success");
      }
      setShowSaveConfirmDialog(null);
    } catch (e: any) { toastService.show(e.message || "Save failed", "error"); }
    finally { setIsSaving(false); }
  };

  const totalDurationStr = useMemo(() => {
    if (!result?.tracks) return null;
    const mins = Math.floor(result.tracks.reduce((acc, t) => acc + (t.durationMs || 0), 0) / 60000);
    return mins > 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins} mins`;
  }, [result]);

  return (
    <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-3xl flex flex-col animate-in slide-in-from-right duration-500 overflow-x-hidden w-full max-w-[100vw] text-[#A9E8DF]">
      <div className="px-6 pb-6 flex items-center justify-between border-b border-white/5 bg-black/30 shrink-0 pt-16">
        <button onClick={() => { Haptics.light(); onClose(); }} className="text-palette-pink text-[14px] font-black uppercase tracking-[0.2em] active:opacity-50 transition-opacity">Back</button>
        <div className="flex flex-col items-center">
          <span className="font-black text-[10px] uppercase tracking-[0.5em] text-zinc-600 leading-none">Active Queue</span>
          {showWakeUpPrompt && <span className="text-[7px] text-palette-gold font-black uppercase tracking-widest mt-1 animate-pulse">Connection Asleep</span>}
        </div>
        <div className="w-12" />
      </div>

      <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-8 pb-40 overflow-x-hidden w-full">
        {genStatus === 'RUNNING' ? (
          <div className="h-full flex flex-col items-center justify-center text-center gap-12 animate-in fade-in duration-1000">
             <div className="relative">
                <div className="w-20 h-20 border-[5px] border-[#6D28D9]/10 rounded-full animate-pulse-soft" />
                <div className="absolute inset-0 w-20 h-20 border-[5px] border-[#6D28D9] border-t-transparent rounded-full animate-spin duration-700" />
             </div>
             <h2 className="text-5xl font-mango text-[#D1F2EB] header-ombre tracking-tight">Compiling...</h2>
          </div>
        ) : genStatus === 'ERROR' ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 gap-8">
            <p className="text-white font-garet font-bold text-center text-lg">{error}</p>
            <button onClick={startRun} className="bg-[#6D28D9] text-white font-black px-12 py-5 rounded-[26px] active:scale-95 transition-all font-garet uppercase tracking-widest text-[12px] shadow-xl shadow-[#6D28D9]/30">Retry Build</button>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
             <header className="flex flex-col gap-1 px-4 stagger-entry stagger-1">
              <div className="w-full overflow-hidden whitespace-nowrap relative py-2 mb-2">
                <h2 className="leading-none font-mango header-ombre tracking-tighter drop-shadow-2xl text-[44px] animate-[marquee_15s_linear_infinite]">{option.name}</h2>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="bg-palette-gold/10 border border-palette-gold/30 px-3 py-1 rounded-xl"><span className="text-palette-gold text-[10px] font-black uppercase tracking-[0.15em]">{result?.tracks?.length || 0} Tracks</span></div>
                  <div className="bg-[#6D28D9]/10 border border-[#6D28D9]/30 px-3 py-1 rounded-xl"><span className="text-[#8B5CF6] text-[10px] font-black uppercase tracking-[0.15em]">{totalDurationStr}</span></div>
                </div>
                {showWakeUpPrompt && <button onClick={triggerWakeUp} className="bg-palette-gold/20 border border-palette-gold text-palette-gold px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest animate-pulse shadow-lg shadow-palette-gold/10">Wake Up Spotify</button>}
              </div>
            </header>
            <div className="bg-[#0a0a0a]/60 backdrop-blur-3xl rounded-[32px] overflow-hidden border border-white/10 shadow-[0_40px_80px_-20px_rgba(0,0,0,0.9)] stagger-entry stagger-2">
              <div className="divide-y divide-[#6D28D9]/20">
                {result?.tracks?.map((track, i) => (
                  <TrackRow key={track.uri + i} track={track} isActive={currentPlayingUri === track.uri} index={i} onPlay={handlePlayTrack} onStatusToggle={handleToggleStatus} onBlock={handleBlockTrack} />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {genStatus === 'DONE' && !isQueuePlaying && (
        <div className="fixed bottom-[56px] left-0 right-0 bg-[#0a0a0a]/95 backdrop-blur-[60px] border-t border-white/10 p-6 z-[110]" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)' }}>
           <div className="flex flex-col gap-4 max-w-lg mx-auto w-full">
              <div className="flex gap-4">
                 <button onClick={() => { Haptics.medium(); setShowPlayOptions(true); }} className="relative overflow-hidden flex-1 bg-gradient-to-br from-[#1DB954] to-[#1ed760] text-white font-black py-4 rounded-[24px] active:scale-[0.97] transition-all font-garet uppercase tracking-[0.25em] text-[14px] shadow-xl border border-white/20 flex items-center justify-center gap-3">
                    <div className="absolute top-1.5 left-2.5 w-[85%] h-[40%] bg-gradient-to-b from-white/40 to-transparent rounded-full blur-[1px] animate-jelly-shimmer pointer-events-none" />
                    <svg className="w-5 h-5 relative z-10" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg><span className="relative z-10">Play</span>
                 </button>
                 <button onClick={() => { Haptics.medium(); setShowSaveOptions(true); }} className="relative overflow-hidden flex-1 bg-gradient-to-br from-[#2DB9B1] to-[#40D9D0] text-white font-black py-4 rounded-[24px] active:scale-[0.97] transition-all font-garet uppercase tracking-[0.25em] text-[14px] shadow-xl border border-white/20 flex items-center justify-center gap-3">
                    <div className="absolute top-1.5 left-2.5 w-[85%] h-[40%] bg-gradient-to-b from-white/40 to-transparent rounded-full blur-[1px] animate-jelly-shimmer pointer-events-none" />
                    <svg className="w-5 h-5 relative z-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"/></svg><span className="relative z-10">Save</span>
                 </button>
              </div>
           </div>
        </div>
      )}

      {showPlayOptions && (
        <div className="fixed inset-0 z-[200] bg-black/85 backdrop-blur-3xl flex items-center justify-center p-8 animate-in fade-in" onClick={() => setShowPlayOptions(false)}>
           <div className="bg-zinc-900 border border-white/10 rounded-[44px] p-8 w-full max-w-sm flex flex-col gap-4 animate-in zoom-in shadow-2xl" onClick={e => e.stopPropagation()}>
              <button onClick={() => { if (result?.tracks) handlePlayTrack(result.tracks[0], 0); setShowPlayOptions(false); }} className="relative overflow-hidden w-full bg-[#1DB954] text-white font-black py-6 rounded-3xl font-garet uppercase tracking-widest text-[13px] active:scale-95 transition-all">Play on Device</button>
              <button onClick={() => { setShowPlayOptions(false); setShowDevicePicker(true); }} className={`relative overflow-hidden w-full py-6 rounded-3xl font-garet font-black uppercase tracking-widest text-[13px] active:scale-95 transition-all border border-white/10 ${hasDevices || spotifyPlayback.getDeviceId() ? 'bg-palette-teal text-white' : 'bg-zinc-800 text-zinc-500'}`}>Push to Device</button>
              <button onClick={() => setShowPlayOptions(false)} className="w-full py-3 text-zinc-600 font-black uppercase tracking-widest text-[11px] mt-4">Cancel</button>
           </div>
        </div>
      )}

      {showDevicePicker && <DevicePickerModal onSelect={async (deviceId) => { setShowDevicePicker(false); if (result?.tracks) { await spotifyPlayback.ensureActiveDevice(deviceId); await SpotifyPlaybackEngine.playTrack(result.tracks[0], result.tracks.map(t => t.uri), 0); } }} onClose={() => setShowDevicePicker(false)} />}
    </div>
  );
};

export default RunView;