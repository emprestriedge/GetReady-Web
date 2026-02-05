import React, { useState, useEffect } from 'react';
import { SpotifyApi } from '../services/spotifyApi';
import { SpotifyDevice } from '../types';
import { Haptics } from '../services/haptics';

interface QuickSourceModalProps {
  onTransfer: (deviceId: string) => void;
  onClose: () => void;
}

const QuickSourceModal: React.FC<QuickSourceModalProps> = ({ onTransfer, onClose }) => {
  const [devices, setDevices] = useState<SpotifyDevice[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      try {
        const list = await SpotifyApi.getDevices();
        setDevices(list);
      } catch (e) {} finally {
        setLoading(false);
      }
    };
    fetch();
  }, []);

  const iphoneDevice = devices.find(d => 
    d.type.toLowerCase() === 'smartphone' || 
    d.name.toLowerCase().includes('iphone')
  );
  
  const macDevice = devices.find(d => 
    d.type.toLowerCase() === 'computer' || 
    d.name.toLowerCase().includes('mac')
  );

  return (
    <div className="fixed inset-0 z-[10001] bg-black/80 backdrop-blur-2xl flex items-center justify-center p-6 animate-in fade-in duration-300">
      <div className="bg-zinc-900 border border-white/10 rounded-[44px] p-8 w-full max-w-sm flex flex-col gap-6 shadow-2xl animate-in zoom-in duration-500">
        <header className="text-center">
          <h2 className="text-4xl font-mango text-[#D1F2EB] leading-none">Switch Output</h2>
          <p className="text-[10px] font-black text-zinc-600 uppercase tracking-widest mt-2">Instant Transfer</p>
        </header>

        <div className="flex flex-col gap-3">
          <button 
            disabled={!iphoneDevice}
            onClick={() => iphoneDevice && onTransfer(iphoneDevice.id)}
            className={`w-full py-6 rounded-[28px] border flex flex-col items-center gap-2 transition-all active:scale-95 ${
              iphoneDevice 
              ? 'bg-palette-emerald/10 border-palette-emerald/40 text-palette-emerald shadow-lg shadow-palette-emerald/5' 
              : 'bg-white/5 border-white/5 opacity-30 grayscale'
            }`}
          >
            <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24"><path d="M17 1.01L7 1c-1.1 0-2 .9-2 2v18c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V3c0-1.1-.9-1.99-2-1.99zM17 19H7V5h10v14z"/></svg>
            <span className="font-garet font-black text-[11px] uppercase tracking-widest">📱 This iPhone</span>
          </button>

          <button 
            disabled={!macDevice}
            onClick={() => macDevice && onTransfer(macDevice.id)}
            className={`w-full py-6 rounded-[28px] border flex flex-col items-center gap-2 transition-all active:scale-95 ${
              macDevice 
              ? 'bg-palette-emerald/10 border-palette-emerald/40 text-palette-emerald shadow-lg shadow-palette-emerald/5' 
              : 'bg-white/5 border-white/5 opacity-30 grayscale'
            }`}
          >
            <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24"><path d="M22 18V3H2v15H0v2h24v-2h-2zm-8 0h-4v-1h4v1zm6-3H4V5h16v10z"/></svg>
            <span className="font-garet font-black text-[11px] uppercase tracking-widest">💻 My Mac</span>
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center">
            <div className="w-4 h-4 border-2 border-palette-emerald border-t-transparent rounded-full animate-spin" />
          </div>
        ) : !iphoneDevice && !macDevice && (
           <p className="text-[10px] text-zinc-600 text-center px-4 font-garet">
             No compatible targets found.<br/>Ensure Spotify is open on your target.
           </p>
        )}

        <button 
          onClick={() => { Haptics.light(); onClose(); }}
          className="w-full py-2 text-zinc-600 font-black uppercase tracking-widest text-[10px] active:text-zinc-400"
        >
          Cancel
        </button>
      </div>
    </div>
  );
};

export default QuickSourceModal;