import React, { useState } from 'react';
import { RunRecord, RunOption, RunOptionType, SpotifyDevice } from '../types';
import RunView from './RunView';
import { SMART_MIX_MODES, MUSIC_BUTTONS, PODCAST_OPTIONS } from '../constants';
import { Haptics } from '../services/haptics';
import { spotifyPlayback } from '../services/spotifyPlaybackService';
import { SpotifyDataService } from '../services/spotifyDataService';
import { SpotifyApi } from '../services/spotifyApi';
import DevicePickerModal from './DevicePickerModal';
import { PinkAsterisk } from './HomeView';

interface HistoryViewProps {
  history: RunRecord[];
}

const HistoryView: React.FC<HistoryViewProps> = ({ history }) => {
  const [viewingRecord, setViewingRecord] = useState<RunRecord | null>(null);
  const [activeActionsId, setActiveActionsId] = useState<string | null>(null);
  const [showDevicePicker, setShowDevicePicker] = useState<RunRecord | null>(null);
  const [showSpotifyPrompt, setShowSpotifyPrompt] = useState<RunRecord | null>(null);
  const [playlistName, setPlaylistName] = useState("");
  const [saving, setSaving] = useState(false);

  const handleOpenDetail = (record: RunRecord) => {
    Haptics.light();
    setViewingRecord(record);
  };

  const handleClearHistory = () => {
    Haptics.impact();
    if (confirm("Permanently clear all local sync history?")) {
      localStorage.removeItem('spotify_buddy_history');
      window.location.reload();
    }
  };

  const handleDeleteRecord = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    Haptics.medium();
    const saved = localStorage.getItem('spotify_buddy_history');
    if (saved) {
      const list: RunRecord[] = JSON.parse(saved);
      const filtered = list.filter(r => r.id !== id);
      localStorage.setItem('spotify_buddy_history', JSON.stringify(filtered));
      window.location.reload();
    }
  };

  const handlePlayOnDevice = (record: RunRecord, e: React.MouseEvent) => {
    e.stopPropagation();
    Haptics.medium();
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
      }
    } catch (e: any) {
      Haptics.error();
      alert(e.message || "Playback failed");
    }
  };

  const handleSaveToSpotifyPrompt = (record: RunRecord, e: React.MouseEvent) => {
    e.stopPropagation();
    Haptics.medium();
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
      const description = `Mode: ${record.optionName} | Mood: ${energyLabel} | Discover: ${Math.round(record.rulesSnapshot.discoverLevel * 100)}% | From History: ${new Date(record.timestamp).toLocaleString()}`;
      
      const playlist = await SpotifyDataService.createPlaylist(user.id, playlistName, description);
      if (record.result.tracks) {
        await SpotifyDataService.replacePlaylistTracks(playlist.id, record.result.tracks.map(t => t.uri));
      }
      Haptics.success();
      setShowSpotifyPrompt(null);
    } catch (e: any) {
      alert(e.message || "Failed to save playlist");
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
      />
    );
  }

  return (
    <div className="p-4 animate-in fade-in duration-500 pb-32">
      <header className="mt-14 mb-10 pl-14 pr-4 flex justify-between items-end stagger-entry stagger-1">
        <h1 className="header-text-responsive font-mango header-ombre leading-none">History</h1>
        {history.length > 0 && (
          <button 
            onClick={handleClearHistory}
            className="mb-1 text-[9px] font-black uppercase tracking-widest text-zinc-600 hover:text-red-500 transition-colors bg-white/5 px-3 py-2 rounded-full border border-white/5 active:scale-95"
          >
            Clear All
          </button>
        )}
      </header>

      {history.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-zinc-600 text-center gap-6 stagger-entry stagger-2">
          <div className="w-32 h-32 bg-zinc-900/50 rounded-full flex items-center justify-center mb-2 border border-white/5 shadow-inner">
             <svg className="w-16 h-16 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
               <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
             </svg>
          </div>
          <div className="flex flex-col gap-2 items-center">
            <p className="text-4xl font-gurmukhi text-[#A9E8DF] drop-shadow-sm">No Syncs Yet.</p>
            <p className="text-[10px] font-black uppercase tracking-[0.25em] text-zinc-700 mt-2 px-8 leading-relaxed">Your generated mixes and deployment logs will appear here.</p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {history.map((record, idx) => (
            <div key={record.id} className={`relative stagger-entry stagger-${Math.min(idx + 1, 5)}`}>
              <button 
                onClick={() => handleOpenDetail(record)}
                onContextMenu={(e) => { e.preventDefault(); Haptics.light(); setActiveActionsId(activeActionsId === record.id ? null : record.id); }}
                className={`w-full text-left glass-panel-gold p-6 rounded-[32px] flex flex-col gap-5 transition-all active:scale-[0.98] relative overflow-hidden group border border-white/5 shadow-2xl ${activeActionsId === record.id ? 'translate-x-[-4px]' : ''}`}
              >
                <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent pointer-events-none" />
                <div className="flex justify-between items-start z-10 relative">
                  <div className="flex items-start gap-1 flex-1">
                    <PinkAsterisk />
                    <div className="flex flex-col flex-1 min-w-0">
                      <span className="font-gurmukhi text-[22px] text-[#A9E8DF] leading-tight group-active:text-palette-pink transition-colors truncate">
                        {record.optionName}
                      </span>
                      <span className="text-[10px] font-black uppercase tracking-widest text-zinc-600 mt-1 font-garet">
                        {record.timestamp}
                      </span>
                    </div>
                  </div>
                  <button 
                    onClick={(e) => { e.stopPropagation(); Haptics.light(); setActiveActionsId(activeActionsId === record.id ? null : record.id); }}
                    className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-zinc-600 hover:text-white transition-colors shrink-0 active:scale-90"
                  >
                     <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                       <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                     </svg>
                  </button>
                </div>
                <div className="flex flex-wrap gap-2 z-10 relative pl-7">
                  <Badge 
                    label={record.result.runType === RunOptionType.MUSIC ? `${record.result.tracks?.length || record.rulesSnapshot.playlistLength} tracks` : 'Show'} 
                    colorClass="text-palette-gold border-palette-gold/20 bg-palette-gold/10" 
                  />
                  <Badge label={record.rulesSnapshot.allowExplicit ? 'UNCENSORED' : 'FILTERED'} colorClass="text-palette-teal border-palette-teal/20 bg-palette-teal/10" />
                  {record.rulesSnapshot.avoidRepeats && <Badge label="No Dupes" colorClass="text-palette-copper border-palette-copper/20 bg-palette-copper/10" />}
                </div>

                {activeActionsId === record.id && (
                  <div className="absolute inset-y-0 right-0 w-48 bg-black/60 backdrop-blur-3xl border-l border-white/10 flex flex-col divide-y divide-white/5 animate-in slide-in-from-right duration-200 z-20">
                    <button onClick={(e) => handlePlayOnDevice(record, e)} className="flex-1 flex items-center gap-3 px-6 text-[10px] font-black uppercase tracking-widest text-[#1DB954] active:bg-white/10">
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                      Play
                    </button>
                    <button onClick={(e) => handleSaveToSpotifyPrompt(record, e)} className="flex-1 flex items-center gap-3 px-6 text-[10px] font-black uppercase tracking-widest text-palette-teal active:bg-white/10">
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2c5.514 0 10 4.486 10 10s-4.486 10-10 10-10-4.486-10-10 4.486-10 10-10zm0-2c-6.627 0-12 5.373-12 12s5.373 12 12 12 12-5.373 12-12-5.373-12-12-12zm-3 8v8l7-4-7-4z"/></svg>
                      Sync...
                    </button>
                    <button onClick={(e) => handleDeleteRecord(record.id, e)} className="flex-1 flex items-center gap-3 px-6 text-[10px] font-black uppercase tracking-widest text-red-500 active:bg-white/10">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      Delete
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); setActiveActionsId(null); }} className="flex-1 flex items-center gap-3 px-6 text-[10px] font-black uppercase tracking-widest text-zinc-500 active:bg-white/10">
                      Close
                    </button>
                  </div>
                )}
              </button>
            </div>
          ))}
        </div>
      )}

      {showDevicePicker && (
        <DevicePickerModal 
          onSelect={handleDeviceSelected} 
          onClose={() => setShowDevicePicker(null)} 
        />
      )}

      {showSpotifyPrompt && (
        <div className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-2xl flex items-center justify-center p-6 animate-in fade-in duration-300">
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