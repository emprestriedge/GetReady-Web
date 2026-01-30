import React, { useState, useEffect, useRef } from 'react';
import { motion, useAnimation, PanInfo } from 'framer-motion';
import { SpotifyApi } from '../services/spotifyApi';
import { spotifyPlayback } from '../services/spotifyPlaybackService';
import { Haptics } from '../services/haptics';
import { StatusAsterisk } from './HomeView';
import { toastService } from '../services/toastService';
import { SpotifyDataService } from '../services/spotifyDataService';

interface NowPlayingStripProps {
  onStripClick?: () => void;
}

const NowPlayingStrip: React.FC<NowPlayingStripProps> = ({ onStripClick }) => {
  const [playbackState, setPlaybackState] = useState<any>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isManuallyDismissed, setIsManuallyDismissed] = useState(false);
  const [isLiked, setIsLiked] = useState(false);
  const controls = useAnimation();

  const lastTapRef = useRef<number>(0);
  const longPressTimerRef = useRef<number | null>(null);

  const fetchPlayback = async () => {
    try {
      const state = await SpotifyApi.request('/me/player');
      if (state && state.item) {
        setPlaybackState(state);
        
        // Show if playing and hasn't been manually dismissed in this "session"
        if (state.is_playing && !isManuallyDismissed) {
          setIsVisible(true);
        } else if (!state.is_playing && !isVisible) {
          setIsVisible(false);
        }

        // Fetch liked status
        const trackId = state.item.id;
        if (trackId) {
          const liked = await SpotifyDataService.checkTracksSaved([trackId]);
          setIsLiked(liked[0] || false);
        }
      } else {
        setIsVisible(false);
        setIsManuallyDismissed(false);
      }
    } catch (e) {
      if (isVisible) setIsVisible(false);
    }
  };

  useEffect(() => {
    if (isVisible) {
      controls.start({ y: 0, opacity: 1 });
    }
  }, [isVisible, controls]);

  useEffect(() => {
    const interval = setInterval(fetchPlayback, 2000);
    const handleForceShow = () => {
      setIsManuallyDismissed(false);
      setIsVisible(true);
      fetchPlayback();
    };
    
    window.addEventListener('spotify_playback_started', handleForceShow);
    fetchPlayback();
    
    return () => {
      clearInterval(interval);
      window.removeEventListener('spotify_playback_started', handleForceShow);
    };
  }, [isManuallyDismissed, isVisible]);

  const handleTogglePlay = async () => {
    Haptics.medium();
    try {
      if (playbackState?.is_playing) {
        await spotifyPlayback.pause();
      } else {
        await spotifyPlayback.resume();
      }
      setTimeout(fetchPlayback, 300);
    } catch (err) {}
  };

  const handleLikeTrack = async () => {
    if (!playbackState?.item?.id) return;
    Haptics.success();
    const trackId = playbackState.item.id;
    const isCurrentlyLiked = isLiked;

    try {
      setIsLiked(!isCurrentlyLiked); // Optimistic

      if (isCurrentlyLiked) {
        await SpotifyApi.request(`/me/tracks?ids=${trackId}`, { method: 'DELETE' });
        toastService.show("Removed from Liked Songs", "info");
      } else {
        await SpotifyApi.request(`/me/tracks?ids=${trackId}`, { method: 'PUT' });
        toastService.show("Saved to Liked Songs", "success");
      }
    } catch (e) {
      setIsLiked(isCurrentlyLiked); // Rollback
      toastService.show("Failed to update status", "error");
    }
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    longPressTimerRef.current = window.setTimeout(() => {
      handleLikeTrack();
      longPressTimerRef.current = null;
    }, 600);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    e.stopPropagation();
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
      
      const now = Date.now();
      const delay = 300;
      if (now - lastTapRef.current < delay) {
        handleTogglePlay();
      } else {
        lastTapRef.current = now;
      }
    }
  };

  const handleDismiss = async (direction: number) => {
    Haptics.impact();
    try { await spotifyPlayback.pause(); } catch (err) {}
    
    const exitX = direction > 0 ? window.innerWidth : -window.innerWidth;
    await controls.start({ x: exitX, opacity: 0 });
    
    setIsVisible(false);
    setIsManuallyDismissed(true);
    controls.set({ x: 0, opacity: 1 });
  };

  const onDragEnd = (event: any, info: PanInfo) => {
    if (Math.abs(info.offset.x) > 100) {
      handleDismiss(info.offset.x);
    } else {
      controls.start({ x: 0, opacity: 1 });
    }
  };

  if (!isVisible || !playbackState || isManuallyDismissed) return null;

  const track = playbackState.item;
  const isPlaying = playbackState.is_playing;
  const deviceName = playbackState.device?.name || 'Spotify Device';
  const imageUrl = track.album?.images?.[0]?.url || track.images?.[0]?.url;
  
  const progressMs = playbackState.progress_ms || 0;
  const durationMs = track.duration_ms || 1;
  const progressPct = (progressMs / durationMs) * 100;

  return (
    <motion.div 
      drag="x"
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.8}
      onDragEnd={onDragEnd}
      animate={controls}
      initial={{ y: 100, opacity: 0 }}
      className="fixed left-4 right-4 z-[200] cursor-pointer touch-none select-none"
      style={{ 
        bottom: 'calc(env(safe-area-inset-bottom, 0px) + 92px)',
      }}
      onClick={() => onStripClick?.()}
    >
      <div className="bg-black/60 backdrop-blur-[40px] border border-white/10 rounded-[34px] overflow-hidden flex flex-col shadow-[0_32px_64px_-16px_rgba(0,0,0,0.8),inset_0_1px_1px_rgba(255,255,255,0.15)] transition-all active:scale-[0.99] relative">
        <div className="w-full h-[3px] bg-white/5">
          <motion.div 
            className="h-full bg-palette-teal shadow-[0_0_12px_rgba(45,185,177,0.8)]"
            initial={{ width: 0 }}
            animate={{ width: `${progressPct}%` }}
            transition={{ type: 'spring', bounce: 0, duration: 1 }}
          />
        </div>

        <div className="w-full flex justify-center pt-2">
          <div className="flex gap-1.5 items-center opacity-40">
            <div className="w-1 h-1 bg-white rounded-full" />
            <div className="w-1.5 h-1.5 bg-white rounded-full" />
            <div className="w-1 h-1 bg-white rounded-full" />
          </div>
        </div>
        
        <div className="px-5 pb-5 pt-2 flex items-center gap-4">
          <div 
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
            className="w-14 h-14 rounded-2xl overflow-hidden shrink-0 border border-white/10 relative shadow-xl cursor-pointer"
          >
            <img src={imageUrl} className="w-full h-full object-cover" alt="Album Art" />
            {!isPlaying && (
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                <div className="w-2.5 h-2.5 rounded-full bg-white animate-pulse" />
              </div>
            )}
          </div>
          
          <div 
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
            className="flex-1 min-w-0 pr-2 cursor-pointer"
          >
            <h4 className="text-[14px] font-garet font-black text-white truncate leading-tight tracking-tight drop-shadow-sm">
              {track.name}
            </h4>
            <div className="flex items-center gap-1.5 mt-1">
              <StatusAsterisk colorClass={isLiked ? "text-palette-pink" : "text-zinc-600"} />
              <span className="text-[11px] text-zinc-300 font-bold truncate max-w-[55%] drop-shadow-sm">
                {track.artists?.[0]?.name || 'Spotify'}
              </span>
              <span className="text-white/20 font-black text-[8px] shrink-0">•</span>
              <span className="text-[10px] text-palette-teal font-black uppercase tracking-[0.1em] truncate drop-shadow-sm">
                {deviceName}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button 
              onClick={(e) => { e.stopPropagation(); spotifyPlayback.previous().then(() => setTimeout(fetchPlayback, 500)); }}
              className="w-10 h-10 flex items-center justify-center text-white/80 active:text-white active:scale-90 transition-all rounded-full"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg>
            </button>
            
            <button 
              onClick={(e) => { e.stopPropagation(); handleTogglePlay(); }}
              className="w-12 h-12 flex items-center justify-center text-white active:scale-90 transition-transform rounded-full bg-white/10 border border-white/5"
            >
              {isPlaying ? (
                <svg className="w-7 h-7" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
              ) : (
                <svg className="w-8 h-8 ml-1" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
              )}
            </button>
            
            <button 
              onClick={(e) => { e.stopPropagation(); spotifyPlayback.next().then(() => setTimeout(fetchPlayback, 500)); }}
              className="w-10 h-10 flex items-center justify-center text-white/80 active:text-white active:scale-90 transition-all rounded-full"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default NowPlayingStrip;