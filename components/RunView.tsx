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
  const lastTapTime = useRef<number>(0);
  const SWIPE_LIMIT = -100;

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    
    // Double Tap Detection for high-performance feel
    const now = Date.now();
    if (now - lastTapTime.current < 300) {
      onPlay(track, index);
      Haptics.impact();
      lastTapTime.current = 0; 
      return;
    }
    lastTapTime.current = now;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const deltaX = e.touches[0].clientX - touchStartX.current;
    if (deltaX < 0) {
      setIsSwiping(true);
      setSwipeX(deltaX);
    }
  };

  const handleTouchEnd = () => {
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
        onDoubleClick={() => onPlay(track, index)}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{ touchAction: 'pan-y', transform: `translateX(${swipeX}px)`, transition: isSwiping ? 'none' : 'transform 0.4s cubic-bezier(0.23, 1, 0.32, 1)' }}
        className={`w-full flex items-center gap-4 p-5 transition-all group text-left select-none relative z-10 border-b border-[#6D28D9]/20 ${isActive ? 'bg-palette-teal/15 border-palette-teal/40 shadow-[inset_0_0_40px_rgba(45,185,177,0.15)]' : 'bg-[#0a0a0a]/85 backdrop-blur-3xl hover:bg-white/5 active:bg-palette-teal/5'}`}
      >
        <div className="relative shrink-0 flex items-center justify-center min-w-[24px]">
          <StatusAsterisk status={track.status === 'liked' || track.status === 'gem' ? 'liked' : 'none'} />
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
  const [showSaveOptions, setShowSaveOptions] = useState(false);
  const [showDevicePicker, setShowDevicePicker] = useState(false);
  const [isQueuePlaying, setIsQueuePlaying] = useState(isQueueMode || false);
  const [currentPlayingUri, setCurrentPlayingUri] = useState<string | null>(null);
  const [result, setResult] = useState<RunResult | null>(initialResult || null);
  const [error, setError] = useState<string | null>(null);
  const [playlistName, setPlaylistName] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const generationRequestId = useRef(0);
  const engine = useMemo(() => new SpotifyPlaybackEngine(), []);
  const effectiveRules = getEffectiveRules(rules, RuleOverrideStore.getForOption(option.id));

  useEffect(() => {
    if (initialResult) handleHistoryBackfill();
    if (!initialResult && genStatus === 'IDLE') startRun();
    
    const pollPlayback = async () => {
      try {
        const state = await SpotifyApi.request('/me/player');
        if (state?.item?.uri) {
          setCurrentPlayingUri(state.item.uri);
        }
      } catch (e) {}
    };
    const interval = setInterval(pollPlayback, 3000);
    pollPlayback();
    return () => clearInterval(interval);
  }, [option, rules, initialResult]);

  const handleHistoryBackfill = async () => {
    if (!initialResult?.tracks) return;
    const validTracks = initialResult.tracks.filter(t => !BlockStore.isBlocked(t.id));
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
    
    try {
      const currentUris = result.tracks.map(t => t.uri);
      await SpotifyPlaybackEngine.playTrack(track, currentUris, index);
      setIsQueuePlaying(true); 
      setCurrentPlayingUri(track.uri);
      onPlayTriggered?.();
    } catch (e: any) {
      if (e.message === "NO_ACTIVE_DEVICE") {
        setShowDevicePicker(true);
      } else {
        toastService.show(e.message || "Playback failed", "error");
      }
    }
  };

  /**
   * handleOpenSpotify - Directly launches Spotify via deep link.
   * This "wakes up" the app and starts playback immediately.
   */
  const handleOpenSpotify = (track: Track) => {
    if (!track || (!track.uri && !track.id)) {
      toastService.show("Invalid track record", "error");
      return;
    }
    try {
      const safeUri = track.uri && track.uri.startsWith('spotify:track:') 
        ? track.uri 
        : `spotify:track:${track.id || track.uri.split(':').pop()}`;
      
      toastService.show("Launching Spotify...", "info");
      window.location.assign(safeUri);
      
      // Update UI state to show Active Queue instead of Preview
      setIsQueuePlaying(true);
      onPlayTriggered?.();
    } catch (e) {
      apiLogger.logError("Deep link failed");
    }
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
          <span className="font-black text-[10px] uppercase tracking-[0.5em] text-zinc-600 leading-none">
            {isQueuePlaying ? 'Active Queue' : 'Preview Mix'}
          </span>
        </div>
        <div className="w-12" />
      </div>

      <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-8 pb-48 overflow-x-hidden w-full">
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
              <div className="w-full overflow-hidden whitespace-nowrap relative py-4 mb-2">
                <h2 className="leading-none font-mango header-ombre tracking-tighter drop-shadow-2xl text-7xl animate-[marquee_15s_linear_infinite] pb-2">{option.name}</h2>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="bg-palette-gold/10 border border-palette-gold/30 px-3 py-1 rounded-xl"><span className="text-palette-gold text-[10px] font-black uppercase tracking-[0.15em]">{result?.tracks?.length || 0} Tracks</span></div>
                  <div className="bg-[#6D28D9]/10 border border-[#6D28D9]/30 px-3 py-1 rounded-xl"><span className="text-[#8B5CF6] text-[10px] font-black uppercase tracking-[0.15em]">{totalDurationStr}</span></div>
                </div>
                {genStatus === 'DONE' && !isQueuePlaying && (
                  <button 
                    onClick={() => { if (result?.tracks) handleOpenSpotify(result.tracks[0]); }}
                    className="bg-[#1DB954] text-white px-5 py-2.5 rounded-full font-black text-[11px] uppercase tracking-widest active:scale-95 transition-all shadow-lg shadow-[#1DB954]/30 flex items-center gap-2 border border-white/10"
                  >
                    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.494 17.306c-.215.353-.674.463-1.027.248-2.857-1.745-6.453-2.14-10.686-1.173-.404.093-.813-.162-.906-.566-.093-.404.162-.813.566-.906 4.63-1.06 8.598-.61 11.785 1.339.353.215.463.674.248 1.027zm1.467-3.264c-.271.44-.847.581-1.287.31-3.268-2.008-8.25-2.592-12.115-1.417-.496.15-1.022-.128-1.173-.623-.15-.496.128-1.022.623-1.173 4.417-1.34 9.907-.678 13.642 1.613.44.271.581.847.31 1.287zm.127-3.413C15.228 8.249 8.845 8.038 5.16 9.157c-.551.167-1.13-.153-1.297-.704-.167-.551.153-1.13.704-1.297 4.227-1.282 11.278-1.037 15.82 1.66.496.295.661.934.366 1.43-.295.496-.934.661-1.43.366z"/></svg>
                    Play Mix
                  </button>
                )}
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
        <div className="fixed bottom-[56px] left-0 right-0 bg-[#0a0a0a]/95 backdrop-blur-[60px] border-t border-white/10 p-6 z-[200]" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)' }}>
           <div className="flex flex-col gap-4 max-w-lg mx-auto w-full">
              <div className="flex gap-4">
                 {option.type === RunOptionType.MUSIC && (
                    <button 
                      onClick={() => { Haptics.medium(); startRun(); }} 
                      className="flex-1 bg-white/10 border border-white/10 text-white font-black py-4 rounded-[24px] active:scale-[0.97] transition-all font-garet uppercase tracking-[0.2em] text-[12px] flex items-center justify-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
                      <span>Regen</span>
                    </button>
                 )}
                 <button 
                  onClick={() => { Haptics.medium(); setShowSaveOptions(true); }} 
                  className="flex-1 bg-white/10 border border-white/10 text-white font-black py-4 rounded-[24px] active:scale-[0.97] transition-all font-garet uppercase tracking-[0.2em] text-[12px] flex items-center justify-center gap-2"
                 >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"/></svg>
                    <span>Save</span>
                 </button>
              </div>

              <div className="flex gap-4">
                 <button 
                  onClick={() => { if (result?.tracks) handlePlayTrack(result.tracks[0], 0); }} 
                  className="relative overflow-hidden flex-1 bg-palette-teal text-white font-black py-5 rounded-[24px] active:scale-[0.97] transition-all font-garet uppercase tracking-[0.25em] text-[13px] shadow-xl border border-white/20 flex items-center justify-center gap-3"
                 >
                    <div className="absolute top-1.5 left-2.5 w-[85%] h-[40%] bg-gradient-to-b from-white/40 to-transparent rounded-full blur-[1px] animate-jelly-shimmer pointer-events-none" />
                    <svg className="w-5 h-5 relative z-10" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/></svg>
                    <span className="relative z-10">Send to Device</span>
                 </button>
                 <button 
                  onClick={() => { if (result?.tracks) handleOpenSpotify(result.tracks[0]); }} 
                  className="relative overflow-hidden flex-1 bg-[#1DB954] text-white font-black py-5 rounded-[24px] active:scale-[0.97] transition-all font-garet uppercase tracking-[0.25em] text-[13px] shadow-xl border border-white/20 flex items-center justify-center gap-3"
                 >
                    <div className="absolute top-1.5 left-2.5 w-[85%] h-[40%] bg-gradient-to-b from-white/40 to-transparent rounded-full blur-[1px] animate-jelly-shimmer pointer-events-none" />
                    <svg className="w-5 h-5 relative z-10" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.494 17.306c-.215.353-.674.463-1.027.248-2.857-1.745-6.453-2.14-10.686-1.173-.404.093-.813-.162-.906-.566-.093-.404.162-.813.566-.906 4.63-1.06 8.598-.61 11.785 1.339.353.215.463.674.248 1.027zm1.467-3.264c-.271.44-.847.581-1.287.31-3.268-2.008-8.25-2.592-12.115-1.417-.496.15-1.022-.128-1.173-.623-.15-.496.128-1.022.623-1.173 4.417-1.34 9.907-.678 13.642 1.613.44.271.581.847.31 1.287zm.127-3.413C15.228 8.249 8.845 8.038 5.16 9.157c-.551.167-1.13-.153-1.297-.704-.167-.551.153-1.13.704-1.297 4.227-1.282 11.278-1.037 15.82 1.66.496.295.661.934.366 1.43-.295.496-.934.661-1.43.366z"/></svg>
                    <span className="relative z-10">Play in Spotify</span>
                 </button>
              </div>
           </div>
        </div>
      )}

      {showDevicePicker && <DevicePickerModal onSelect={async (deviceId) => { setShowDevicePicker(false); if (result?.tracks) { await spotifyPlayback.ensureActiveDevice(deviceId); await SpotifyPlaybackEngine.playTrack(result.tracks[0], result.tracks.map(t => t.uri), 0); setIsQueuePlaying(true); onPlayTriggered?.(); } }} onClose={() => setShowDevicePicker(false)} />}
    </div>
  );
};

export default RunView;