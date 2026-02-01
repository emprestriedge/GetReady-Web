import React, { useState, useEffect, useRef } from 'react';
import { SpotifyApi } from '../services/spotifyApi';
import { spotifyPlayback } from '../services/spotifyPlaybackService';
import { Haptics } from '../services/haptics';

interface NowPlayingStripProps {
  onStripClick?: () => void;
  onClose?: () => void;
}

const NowPlayingStrip: React.FC<NowPlayingStripProps> = ({ onStripClick, onClose }) => {
  const [playbackState, setPlaybackState] = useState<any>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isManuallyDismissed, setIsManuallyDismissed] = useState(false);
  const lastTrackUri = useRef<string | null>(null);
  
  // Gesture State
  const [dragX, setDragX] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const touchStartX = useRef<number | null>(null);
  const hasMovedSignificant = useRef(false);
  const DISMISS_THRESHOLD = 50; // px to trigger dismissal

  const fetchPlayback = async () => {
    try {
      const state = await SpotifyApi.request('/me/player');
      // Bug Fix: Explicitly check for item to ensure we have content to display
      if (state && state.item) {
        // Auto-reappear logic: If the track has changed, reset manual dismissal
        if (state.item.uri !== lastTrackUri.current) {
          setIsManuallyDismissed(false);
          lastTrackUri.current = state.item.uri;
        }

        setPlaybackState(state);
        if (!isManuallyDismissed) {
          setIsVisible(true);
        }
      } else {
        setIsVisible(false);
        setIsManuallyDismissed(false);
      }
    } catch (e) {
      setIsVisible(false);
    }
  };

  useEffect(() => {
    const interval = setInterval(fetchPlayback, 2000);
    fetchPlayback();
    return () => clearInterval(interval);
  }, [isManuallyDismissed]);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    setIsSwiping(true);
    hasMovedSignificant.current = false;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const currentX = e.touches[0].clientX;
    const deltaX = currentX - touchStartX.current;
    
    if (Math.abs(deltaX) > 5) {
      hasMovedSignificant.current = true;
    }
    
    setDragX(deltaX);
  };

  const handleTouchEnd = async () => {
    if (touchStartX.current === null) return;
    const finalX = dragX;
    setIsSwiping(false);
    touchStartX.current = null;

    if (Math.abs(finalX) > DISMISS_THRESHOLD) {
      Haptics.impact();
      // Animation toward exit
      const exitDirection = finalX > 0 ? 500 : -500;
      setDragX(exitDirection);

      try {
        // Audio must stop immediately
        await spotifyPlayback.pause();
        
        setTimeout(() => {
          setIsVisible(false);
          setIsManuallyDismissed(true);
          setDragX(0);
          // Inform parent to hide the player entirely
          onClose?.();
        }, 300);
      } catch (err) {
        setIsVisible(false);
        setIsManuallyDismissed(true);
        onClose?.();
      }
    } else {
      setDragX(0);
    }
  };

  const handleContainerClick = () => {
    // Only trigger if it wasn't a swipe
    if (!hasMovedSignificant.current) {
      onStripClick?.();
    }
  };

  if (!isVisible || !playbackState || isManuallyDismissed) return null;

  const track = playbackState.item;
  const isPlaying = playbackState.is_playing;
  const deviceName = playbackState.device?.name || 'Spotify Device';
  
  // Normalize mapping for Track vs Episode metadata
  const imageUrl = track.album?.images?.[0]?.url || track.images?.[0]?.url;
  const artistName = track.artists?.[0]?.name || track.show?.name || 'Spotify';
  
  const progressMs = playbackState.progress_ms || 0;
  const durationMs = track.duration_ms || 1;
  const progressPct = (progressMs / durationMs) * 100;

  const handleTogglePlay = async (e: React.MouseEvent) => {
    e.stopPropagation();
    Haptics.medium();
    try {
      if (isPlaying) {
        await spotifyPlayback.pause();
      } else {
        await spotifyPlayback.resume();
      }
      setPlaybackState((prev: any) => ({ ...prev, is_playing: !isPlaying }));
      setTimeout(fetchPlayback, 400);
    } catch (err) {}
  };

  const handleNext = async (e: React.MouseEvent) => {
    e.stopPropagation();
    Haptics.medium();
    try {
      await spotifyPlayback.next();
      setTimeout(fetchPlayback, 600);
    } catch (err) {}
  };

  const handlePrevious = async (e: React.MouseEvent) => {
    e.stopPropagation();
    Haptics.medium();
    try {
      await spotifyPlayback.previous();
      setTimeout(fetchPlayback, 600);
    } catch (err) {}
  };

  return (
    <div 
      className={`fixed left-4 right-4 z-[150] cursor-pointer touch-none select-none ${!isSwiping ? 'transition-all duration-300' : ''}`}
      style={{ 
        bottom: 'calc(env(safe-area-inset-bottom, 0px) + 92px)',
        transform: `translateX(${dragX}px)`,
        // Fade out opacity as the user swipes
        opacity: Math.max(0, 1 - Math.abs(dragX) / (DISMISS_THRESHOLD * 2.5))
      }}
      onClick={handleContainerClick}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <div className="bg-black/25 backdrop-blur-[40px] border border-white/10 rounded-[34px] overflow-hidden flex flex-col shadow-[0_32px_64px_-16px_rgba(0,0,0,0.6),inset_0_1px_1px_rgba(255,255,255,0.15)] transition-all active:scale-[0.99]">
        <div className="w-full h-[3px] bg-white/5">
          <div 
            className="h-full bg-palette-teal shadow-[0_0_12px_rgba(45,185,177,0.8)] transition-all duration-1000 ease-linear"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        
        <div className="px-5 py-5 flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl overflow-hidden shrink-0 border border-white/10 relative shadow-xl">
            <img src={imageUrl} className="w-full h-full object-cover" alt="Art" />
            {!isPlaying && (
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                <div className="w-2.5 h-2.5 rounded-full bg-white animate-pulse" />
              </div>
            )}
          </div>
          
          <div className="flex-1 min-w-0">
            <h4 className="text-[14px] font-garet font-black text-white truncate leading-tight tracking-tight drop-shadow-sm">
              {track.name}
            </h4>
            <div className="flex items-center gap-1.5 mt-1.5">
              <span className="text-[11px] text-zinc-300 font-bold truncate max-w-[55%] drop-shadow-sm">
                {artistName}
              </span>
              <span className="text-white/20 font-black text-[8px] shrink-0">•</span>
              <span className="text-[10px] text-palette-teal font-black uppercase tracking-[0.1em] truncate drop-shadow-sm">
                {deviceName}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 pr-1">
            <button 
              onClick={handlePrevious}
              aria-label="Previous Track"
              className="w-10 h-10 flex items-center justify-center text-white bg-black/20 border border-white/5 hover:bg-white/10 active:scale-90 transition-all rounded-full"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg>
            </button>
            
            <button 
              onClick={handleTogglePlay}
              aria-label={isPlaying ? "Pause" : "Play"}
              className="w-12 h-12 flex items-center justify-center text-white active:scale-90 transition-transform rounded-full bg-black/20 border border-white/5 shadow-inner"
            >
              {isPlaying ? (
                <svg className="w-7 h-7" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
              ) : (
                <svg className="w-8 h-8 ml-1" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
              )}
            </button>
            
            <button 
              onClick={handleNext}
              aria-label="Next Track"
              className="w-10 h-10 flex items-center justify-center text-white bg-black/20 border border-white/5 hover:bg-white/10 active:scale-90 transition-all rounded-full"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NowPlayingStrip;