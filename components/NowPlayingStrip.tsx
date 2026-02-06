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
      // CRITICAL: Must include additional_types=episode or Spotify returns item: null for podcasts
      const state = await SpotifyApi.request('/me/player?additional_types=track,episode');
      
      const hasValidItem = state && state.item;
      const isSupportedType = state?.currently_playing_type === 'track' || state?.currently_playing_type === 'episode';

      if (hasValidItem && isSupportedType) {
        if (state.item.uri !== lastTrackUri.current) {
          setIsManuallyDismissed(false);
          lastTrackUri.current = state.item.uri;
        }

        setPlaybackState(state);
        if (!isManuallyDismissed) {
          setIsVisible(true);
        }
      } else {
        // One-line debug log as requested
        console.debug(`[Player] Hidden. Reason: ${!state ? 'No state' : !state.item ? 'No item' : 'Unsupported type'}, Type: ${state?.currently_playing_type || 'none'}`);
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
      const exitDirection = finalX > 0 ? 500 : -500;
      setDragX(exitDirection);

      try {
        await spotifyPlayback.pause();
        setTimeout(() => {
          setIsVisible(false);
          setIsManuallyDismissed(true);
          setDragX(0);
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
    if (!hasMovedSignificant.current) {
      onStripClick?.();
    }
  };

  if (!isVisible || !playbackState || isManuallyDismissed) return null;

  const track = playbackState.item;
  const isPlaying = playbackState.is_playing;
  const isEpisode = playbackState.currently_playing_type === 'episode';
  const deviceName = playbackState.device?.name || 'Spotify Device';
  
  // Episode support: use track.images or track.show.images for artwork
  const imageUrl = isEpisode 
    ? (track.images?.[0]?.url || track.show?.images?.[0]?.url) 
    : track.album?.images?.[0]?.url;

  // Episode support: use show name for subtitle
  const artistName = isEpisode 
    ? track.show?.name 
    : (track.artists?.[0]?.name || 'Spotify');
  
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
      className={`fixed bottom-[96px] left-0 right-0 z-[9999] h-16 cursor-pointer touch-none select-none px-4 ${!isSwiping ? 'transition-all duration-300' : ''}`}
      style={{ 
        transform: `translateX(${dragX}px)`,
        opacity: Math.max(0, 1 - Math.abs(dragX) / (DISMISS_THRESHOLD * 2.5))
      }}
      onClick={handleContainerClick}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <div className="bg-black/30 backdrop-blur-3xl border-t border-purple-500/30 rounded-[34px] overflow-hidden flex flex-col shadow-[0_0_25px_rgba(109,40,217,0.35),0_32px_64px_-16px_rgba(0,0,0,0.6),inset_0_1px_1px_rgba(255,255,255,0.15)] transition-all active:scale-[0.99] h-full">
        <div className="w-full h-[3px] bg-white/5">
          <div 
            className="h-full bg-palette-teal shadow-[0_0_12px_rgba(45,185,177,0.8)] transition-all duration-1000 ease-linear"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        
        <div className="px-5 flex-1 flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl overflow-hidden shrink-0 border border-white/10 relative shadow-xl">
            <img src={imageUrl} className="w-full h-full object-cover" alt="Art" />
            {!isPlaying && (
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
              </div>
            )}
          </div>
          
          <div className="flex-1 min-w-0">
            <h4 className="text-[12px] font-garet font-black text-white truncate leading-tight tracking-tight drop-shadow-sm">
              {track.name}
            </h4>
            <div className="flex items-center gap-1 mt-0.5">
              <span className="text-[10px] text-zinc-300 font-bold truncate max-w-[50%] drop-shadow-sm">
                {artistName}
              </span>
              <span className="text-white/20 font-black text-[8px] shrink-0">•</span>
              <span className="text-[9px] text-palette-teal font-black uppercase tracking-[0.1em] truncate drop-shadow-sm">
                {deviceName}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button 
              onClick={handlePrevious}
              aria-label="Previous Track"
              className="w-8 h-8 flex items-center justify-center text-white bg-black/20 border border-white/5 hover:bg-white/10 active:scale-90 transition-all rounded-full"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg>
            </button>
            
            <button 
              onClick={handleTogglePlay}
              aria-label={isPlaying ? "Pause" : "Play"}
              className="w-10 h-10 flex items-center justify-center text-white active:scale-90 transition-transform rounded-full bg-black/20 border border-white/5 shadow-inner"
            >
              {isPlaying ? (
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
              ) : (
                <svg className="w-6 h-6 ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
              )}
            </button>
            
            <button 
              onClick={handleNext}
              aria-label="Next Track"
              className="w-8 h-8 flex items-center justify-center text-white bg-black/20 border border-white/5 hover:bg-white/10 active:scale-90 transition-all rounded-full"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NowPlayingStrip;