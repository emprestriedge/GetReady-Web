import React, { useState, useRef } from 'react';
import { RunRecord, RunOption, RunOptionType, SpotifyDevice } from '../types';
import RunView from './RunView';
import { SMART_MIX_MODES, MUSIC_BUTTONS, PODCAST_OPTIONS } from '../constants';
import { Haptics } from '../services/haptics';
import { spotifyPlayback } from '../services/spotifyPlaybackService';
import { SpotifyDataService } from '../services/spotifyDataService';
import { SpotifyApi } from '../services/spotifyApi';
import { toastService } from '../services/toastService';
import DevicePickerModal from './DevicePickerModal';

interface HistoryViewProps {
  history: RunRecord[];
  onPreviewStarted?: () => void;
  onPlayTriggered?: () => void;
}

const VaultRecordRow: React.FC<{ 
  record: RunRecord; 
  onOpen: (r: RunRecord) => void;
  onDelete: (id: string) => void;
  onPlay: (r: RunRecord) => void;
  onSync: (r: RunRecord) => void;
}> = ({ record, onOpen, onDelete, onPlay, onSync }) => {
  const [swipeX, setSwipeX] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const touchStartX = useRef<number | null>(null);
  const SWIPE_LIMIT = -100;
  const DELETE_THRESHOLD = -140;

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const currentX = e.touches[0].clientX;
    const deltaX = currentX - touchStartX.current;
    if (deltaX < 0) {
      setIsSwiping(true);
      setSwipeX(deltaX);
    }
  };

  const handleTouchEnd = () => {
    if (swipeX < DELETE_THRESHOLD) {
      Haptics.impact();
      onDelete(record.id);
    }
    setSwipeX(0);
    setIsSwiping(false);
    touchStartX.current = null;
  };

  const deleteOpacity = Math.min(1, Math.abs(swipeX) / 80);

  return (
    <div className="relative overflow-hidden rounded-[32px] mb-4">
      <div 
        className="absolute inset-0 bg-red-600 flex items-center justify-end px-10 transition-colors pointer-events-none"
        style={{ opacity: deleteOpacity }}
      >
        <div className="flex flex-col items-center gap-1">
          <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
          <span className="text-white font-black text-[10px] uppercase tracking-widest">Delete</span>
        </div>
      </div>

      <div
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{ 
          transform: `translateX(${swipeX}px)`,
          transition: isSwiping ? 'none' : 'transform 0.4s cubic-bezier(0.23, 1, 0.32, 1)'
        }}
        className="relative z-10"
      >
        <button 
          onClick={() => onOpen(record)}
          className="w-full text-left glass-panel-gold p-6 rounded-[32px] flex flex-col gap-5 transition-all active:scale-[0.98] relative overflow-hidden group border border-white/5 shadow-2xl bg-[#0a0a0a]/40 backdrop-blur-3xl"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent pointer-events-none" />
          <div className="flex justify-between items-start z-10 relative">
            <div className="flex flex-col flex-1 min-w-0 pr-4">
              <span className="font-gurmukhi text-[22px] text-[#A9E8DF] leading-tight group-active:text-palette-pink transition-colors truncate">
                {record.optionName}
              </span>
              <span className="text-[10px] font-black uppercase tracking-widest text-zinc-600 mt-1 font-garet">
                {record.timestamp}
              </span>
            </div>
            
            <div className="flex gap-2">
               <button 
                onClick={(e) => { e.stopPropagation(); Haptics.medium(); onPlay(record); }}
                className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-[#1DB954] active:scale-90 transition-transform"
               >
                 <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
               </button>
               <button 
                onClick={(e) => { e.stopPropagation(); Haptics.medium(); onSync(record); }}
                className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-palette-teal active:scale-90 transition-transform"
               >
                 <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2c5.514 0 10 4.486 10 10s-4.486 10-10 10-10-4.486-10-10 4.486-10 10-10zm0-2c-6.627 0-12 5.373-12 12s5.373 12 12 12 12-5.373 12-12-5.373-12-12-12zm-3 8v8l7-4-7-4z"/></svg>
               </button>
            </div>
          </div>
          
          <div className="flex flex-wrap gap-2 z-10 relative">
            <Badge 
              label={record.result.runType === RunOptionType.MUSIC ? `${record.result.tracks?.length || record.rulesSnapshot.playlistLength} tracks` : 'Show'} 
              colorClass="text-palette-gold border-palette-gold/20 bg-palette-gold/10" 
            />
            <Badge label={record.rulesSnapshot.allowExplicit ? 'UNCENSORED' : 'FILTERED'} colorClass="text-palette-teal border-palette-teal/20 bg-palette-teal/10" />
            {record.rulesSnapshot.avoidRepeats && <Badge label="No Dupes" colorClass="text-palette-copper border-palette-copper/20 bg-palette-copper/10" />}
          </div>
        </button>
      </div>
    </div>
  );
};

const HistoryView: React.FC<HistoryViewProps> = ({ history, onPreviewStarted, onPlayTriggered }) => {
  const [viewingRecord, setViewingRecord] = useState<RunRecord | null>(null);
  const [showDevicePicker, setShowDevicePicker] = useState<RunRecord | null>(null);
  const [showSpotifyPrompt, setShowSpotifyPrompt] = useState<RunRecord | null>(null);
  const [playlistName, setPlaylistName] = useState("");
  const [saving, setSaving] = useState(false);

  const handleOpenDetail = (record: RunRecord) => {
    Haptics.light();
    onPreviewStarted?.(); 
    setViewingRecord(record);
  };

  const handleDeleteRecord = (id: string) => {
    Haptics.medium();
    const saved = localStorage.getItem('spotify_buddy_history');
    if (saved) {
      const list: RunRecord[] = JSON.parse(saved);
      const filtered = list.filter(r => r.id !== id);
      localStorage.setItem('spotify_buddy_history', JSON.stringify(filtered));
      toastService.show("Record deleted", "info");
      setTimeout(() => window.location.reload(), 500);
    }
  };

  const handlePlayOnDevice = (record: RunRecord) => {
    setShowDevicePicker(record);
  };

  const handleDeviceSelected = async (deviceId: string) => {
    if (!showDevicePicker) return;
    const record = showDevicePicker;
    setShowDevicePicker(null);
    Haptics.medium();
    
    try {
      const uris = record.result.runType === RunOptionType.MUSIC 
        ? record.result.tracks?.map(t => t.uri) || []
        : [record.result.episode?.uri].filter(Boolean) as string[];

      if (uris.length > 0) {
        const activeDeviceId = await spotifyPlayback.ensureActiveDevice(deviceId);
        await spotifyPlayback.playUrisOnDevice(activeDeviceId, uris);
        Haptics.success();
        toastService.show("Playback started", "success");
        onPlayTriggered?.(); 
      }
    } catch (e: any) {
      Haptics.error();
      toastService.show(e.message || "Playback failed", "error");
    }
  };

  const handleSaveToSpotifyPrompt = (record: RunRecord) => {
    setPlaylistName(`${record.optionName} Mix - ${new Date(record.timestamp).toLocaleDateString()}`);
    setShowSpotifyPrompt(record);
  };

  const handleConfirmSaveToSpotify = async () => {
    if (!showSpotifyPrompt) return;
    const record = showSpotifyPrompt;
    Haptics.impact();
    setSaving(true);
    
    try {
      const user = await SpotifyApi.getMe();
      const energyLabel = record.rulesSnapshot.calmHype <= 0.33 ? 'Chill' : record.rulesSnapshot.calmHype >= 0.67 ? 'Hype' : 'Steady';
      const description = `Mode: ${record.optionName} | Mood: ${energyLabel} | Discover: ${Math.round(record.rulesSnapshot.discoverLevel * 100)}% | From Vault: ${new Date(record.timestamp).toLocaleString()}`;
      
      const playlist = await SpotifyDataService.createPlaylist(user.id, playlistName, description);
      if (record.result.tracks) {
        await SpotifyDataService.replacePlaylistTracks(playlist.id, record.result.tracks.map(t => t.uri));
      }
      Haptics.success();
      toastService.show("Playlist synced!", "success");
      setShowSpotifyPrompt(null);
    } catch (e: any) {
      toastService.show(e.message || "Sync failed", "error");
    } finally {
      setSaving(false);
    }
  };

  if (viewingRecord) {
    const allOptions = [...SMART_MIX_MODES, ...MUSIC_BUTTONS, ...PODCAST_OPTIONS];
    const option = allOptions.find(o => o.name === viewingRecord.optionName) || {
      id: 'unknown',
      name: viewingRecord.optionName,
      type: viewingRecord.result.runType,
      description: 'Historical run.'
    } as RunOption;

    return (
      <RunView 
        option={option}
        rules={viewingRecord.rulesSnapshot}
        onClose={() => setViewingRecord(null)}
        onComplete={() => {}}
        initialResult={viewingRecord.result}
        onPreviewStarted={onPreviewStarted}
        onPlayTriggered={onPlayTriggered}
      />
    );
  }

  return (
    <div className="h-full overflow-y-auto pt-24 pb-40 px-4 animate-in fade-in duration-500 w-full max-w-[100vw] overflow-x-hidden ios-scroller z-0 relative">
      <header className="mb-10 pl-6 pr-4 stagger-entry stagger-1">
        <h1 className="text-7xl font-mango header-ombre leading-none tracking-tighter">The Vault</h1>
      </header>

      {history.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-zinc-600 text-center gap-6 stagger-entry stagger-2">
          <div className="w-32 h-32 bg-zinc-900/50 rounded-full flex items-center justify-center mb-2 border border-white/5 shadow-inner">
             <svg className="w-16 h-16 opacity-20" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2L2 12l10 10 10-10L12 2z"/>
             </svg>
          </div>
          <div className="flex flex-col gap-2 items-center px-6">
            <p className="text-4xl font-gurmukhi text-[#A9E8DF] drop-shadow-sm">The Vault is empty</p>
            <p className="text-[10px] font-black uppercase tracking-[0.25em] text-zinc-700 mt-2 px-8 leading-relaxed">your saved generated mixes will appear here</p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {history.map((record, idx) => (
            <VaultRecordRow 
              key={record.id}
              record={record}
              onOpen={handleOpenDetail}
              onDelete={handleDeleteRecord}
              onPlay={handlePlayOnDevice}
              onSync={handleSaveToSpotifyPrompt}
            />
          ))}
        </div>
      )}

      {showDevicePicker && (
        <div className="fixed inset-0 z-[3000]">
           <DevicePickerModal 
             onSelect={handleDeviceSelected} 
             onClose={() => setShowDevicePicker(null)} 
           />
        </div>
      )}

      {showSpotifyPrompt && (
        <div className="fixed inset-0 z-[3000] bg-black/80 backdrop-blur-2xl flex items-center justify-center p-6 animate-in fade-in duration-300">
          <div className="bg-zinc-900 border border-white/10 rounded-[40px] p-8 w-full max-w-md flex flex-col gap-6 animate-in zoom-in duration-300 shadow-2xl">
            <header>
              <h2 className="text-4xl font-mango text-palette-teal leading-none">Sync to Spotify</h2>
              <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mt-2">Named Playlist Export</p>
            </header>
            <div className="flex flex-col gap-2">
              <label className="text-[10px] font-black text-zinc-600 uppercase tracking-widest px-1">Playlist Name</label>
              <input 
                type="text" 
                value={playlistName}
                onChange={e => setPlaylistName(e.target.value)}
                className="bg-black/40 border border-white/10 rounded-2xl px-5 py-4 text-[#D1F2EB] font-garet font-bold outline-none focus:border-palette-pink transition-all"
              />
            </div>
            <div className="flex flex-col gap-3 mt-4">
              <button 
                onClick={handleConfirmSaveToSpotify}
                disabled={saving || !playlistName}
                className="relative overflow-hidden w-full bg-gradient-to-br from-[#1DB954] via-[#1DB954] to-[#24cc5c] text-white font-black py-5 rounded-[24px] active:scale-95 transition-all font-garet uppercase tracking-widest text-xs shadow-xl shadow-[#1DB954]/20 border border-white/15"
              >
                {!saving && <div className="absolute top-1 left-2 w-[85%] h-[40%] bg-gradient-to-b from-white/40 to-transparent rounded-full blur-[1px] animate-jelly-shimmer pointer-events-none" />}
                <span className="relative z-10">{saving ? 'Creating...' : 'Sync Now'}</span>
              </button>
              <button 
                onClick={() => setShowSpotifyPrompt(null)}
                disabled={saving}
                className="w-full py-4 text-zinc-600 font-black uppercase tracking-widest text-[10px] active:text-zinc-400"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const Badge: React.FC<{ label: string; colorClass?: string }> = ({ label, colorClass = "text-palette-pink border-palette-pink/20 bg-palette-pink/10" }) => (
  <span className={`${colorClass} text-[9px] font-black uppercase tracking-[0.15em] px-3 py-1.5 rounded-xl border font-garet`}>
    {label}
  </span>
);

export default HistoryView;