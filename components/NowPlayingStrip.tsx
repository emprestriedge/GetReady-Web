import React, { useState, useEffect } from 'react';
import { SpotifyApi } from '../services/spotifyApi';
import { spotifyPlayback } from '../services/spotifyPlaybackService';
import { Haptics } from '../services/haptics';

const NowPlayingStrip: React.FC = () => {
  const [playbackState, setPlaybackState] = useState<any>(null);
  const [isVisible, setIsVisible] = useState(false);

  const fetchPlayback = async () => {
    try {
      const state = await SpotifyApi.request('/me/player');
      if (state && state.item) {
        setPlaybackState(state);
        setIsVisible(true);
      } else {
        setIsVisible(false);
      }
    } catch (e) {
      setIsVisible(false);
    }
  };

  useEffect(() => {
    const interval = setInterval(fetchPlayback, 2000);
    fetchPlayback();
    return () => clearInterval(interval);
  }, []);

  if (!isVisible || !playbackState) return null;

  const track = playbackState.item;
  const isPlaying = playbackState.is_playing;
  const deviceName = playbackState.device?.name || 'Spotify Device';
  const imageUrl = track.album?.images?.[0]?.url || track.images?.[0]?.url;
  
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
      fetchPlayback();
    } catch (err) {}
  };

  const handleNext = async (e: React.MouseEvent) => {
    e.stopPropagation();
    Haptics.light();
    try {
      await spotifyPlayback.next();
      fetchPlayback();
    } catch (err) {}
  };

  const handlePrevious = async (e: React.MouseEvent) => {
    e.stopPropagation();
    Haptics.light();
    try {
      await spotifyPlayback.previous();
      fetchPlayback();
    } catch (err) {}
  };

  return (
    <div 
      className="fixed left-4 right-4 z-[60] animate-in slide-in-from-bottom-4 duration-500"
      style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 78px)' }}
    >
      <div className="bg-black/70 backdrop-blur-3xl border border-white/10 rounded-[28px] overflow-hidden flex flex-col shadow-2xl">
        <div className="w-full h-[2px] bg-white/5">
          <div 
            className="h-full bg-palette-teal shadow-[0_0_8px_rgba(45,185,177,0.6)] transition-all duration-1000 ease-linear"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        
        <div className="p-3 flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl overflow-hidden shrink-0 border border-white/5 relative shadow-lg">
            <img src={imageUrl} className="w-full h-full object-cover" alt="Art" />
            {!isPlaying && (
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
              </div>
            )}
          </div>
          
          <div className="flex-1 min-w-0">
            <h4 className="text-[13px] font-garet font-bold text-[#D1F2EB] truncate leading-tight">
              {track.name}
            </h4>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-[10px] text-zinc-500 font-medium truncate max-w-[60%]">
                {track.artists?.[0]?.name || track.show?.name || 'Spotify'}
              </span>
              <span className="text-zinc-700 font-black text-[8px]">•</span>
              <span className="text-[9px] text-palette-gold/70 font-black uppercase tracking-widest truncate">
                {deviceName}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-0.5 pr-2">
            <button 
              onClick={handlePrevious}
              className="w-9 h-9 flex items-center justify-center text-[#D1F2EB]/60 active:text-palette-pink active:scale-90 transition-all"
            >
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg>
            </button>
            
            <button 
              onClick={handleTogglePlay}
              className="w-10 h-10 flex items-center justify-center text-[#D1F2EB] active:scale-90 transition-transform"
            >
              {isPlaying ? (
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
              ) : (
                <svg className="w-6 h-6 ml-1" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
              )}
            </button>
            
            <button 
              onClick={handleNext}
              className="w-9 h-9 flex items-center justify-center text-[#D1F2EB]/60 active:text-palette-pink active:scale-90 transition-all"
            >
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NowPlayingStrip;
