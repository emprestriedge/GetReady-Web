import React, { useState, useEffect } from 'react';
import { SpotifyApi } from '../services/spotifyApi';
import { SpotifyDevice } from '../types';
import { Haptics } from '../services/haptics';
import { apiLogger } from '../services/apiLogger';

interface DevicePickerModalProps {
  onSelect: (deviceId: string) => void;
  onClose: () => void;
}

const DevicePickerModal: React.FC<DevicePickerModalProps> = ({ onSelect, onClose }) => {
  const [devices, setDevices] = useState<SpotifyDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /**
   * fetchDevicesWithRetry - Polls up to 3 times to ensure late-appearing devices (like iPhone) are found.
   */
  const fetchDevicesWithRetry = async () => {
    setLoading(true);
    setError(null);
    
    let attempts = 0;
    let list: SpotifyDevice[] = [];
    
    try {
      while (attempts < 3) {
        apiLogger.logClick(`[PICKER] Fetching devices (Attempt ${attempts + 1})...`);
        list = await SpotifyApi.getDevices();
        
        // If we found any device, or we found a smartphone, we can stop early
        if (list.length > 0) {
          const hasSmartphone = list.some(d => d.type.toLowerCase() === 'smartphone');
          if (hasSmartphone || list.length > 1) break;
        }
        
        attempts++;
        if (attempts < 3) await new Promise(r => setTimeout(r, 700));
      }
      setDevices(list);
    } catch (err: any) {
      setError(err.message || "Failed to fetch devices");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDevicesWithRetry();
  }, []);

  const handleRefresh = () => {
    Haptics.light();
    fetchDevicesWithRetry();
  };

  const handleDeviceClick = (deviceId: string) => {
    Haptics.medium();
    onSelect(deviceId);
  };

  return (
    <div className="fixed inset-0 z-[10001] bg-black/80 backdrop-blur-xl flex items-center justify-center p-6 animate-in fade-in duration-300">
      <div className="bg-zinc-900 w-full max-w-md rounded-[44px] border border-white/10 shadow-2xl overflow-hidden flex flex-col animate-in zoom-in duration-500">
        <header className="px-8 pt-8 pb-4 flex justify-between items-center">
          <div>
            <h2 className="text-3xl font-mango text-[#A9E8DF]">Select Device</h2>
            <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mt-1">Output Destination</p>
          </div>
          <button onClick={handleRefresh} className={`p-2 rounded-full bg-white/5 active:bg-white/10 transition-colors ${loading ? 'animate-spin' : ''}`}>
            <svg className="w-5 h-5 text-palette-gold" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </header>

        <div className="p-6 flex-1 max-h-[50vh] overflow-y-auto ios-scroller">
          {loading && devices.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-4">
               <div className="w-10 h-10 border-4 border-palette-pink border-t-transparent rounded-full animate-spin" />
               <span className="text-xs font-black text-zinc-600 uppercase tracking-widest">Scanning Network...</span>
            </div>
          ) : devices.length === 0 ? (
            <div className="text-center py-12 px-4">
              <div className="w-16 h-16 bg-zinc-800 rounded-3xl flex items-center justify-center mx-auto mb-4 opacity-40">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
              </div>
              <p className="text-[#A9E8DF] font-garet font-bold text-lg leading-tight">No active devices found</p>
              <p className="text-zinc-500 text-xs mt-3 leading-relaxed">
                Open Spotify on your phone or computer, start playing any song, then tap refresh above.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {devices.map((device) => (
                <button
                  key={device.id}
                  onClick={() => handleDeviceClick(device.id)}
                  className={`w-full text-left p-5 rounded-3xl border transition-all flex items-center justify-between group active:scale-[0.98] ${
                    device.is_active 
                      ? 'bg-palette-emerald/10 border-palette-emerald/30' 
                      : 'bg-white/5 border-white/5 hover:border-white/20'
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-colors ${device.is_active ? 'bg-palette-emerald text-white' : 'bg-zinc-800 text-zinc-500'}`}>
                       {device.type === 'Smartphone' && <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M17 1.01L7 1c-1.1 0-2 .9-2 2v18c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V3c0-1.1-.9-1.99-2-1.99zM17 19H7V5h10v14z"/></svg>}
                       {device.type === 'Computer' && <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M22 18V3H2v15H0v2h24v-2h-2zm-8 0h-4v-1h4v1zm6-3H4V5h16v10z"/></svg>}
                       {device.type !== 'Smartphone' && device.type !== 'Computer' && <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/></svg>}
                    </div>
                    <div>
                      <h4 className="font-garet font-bold text-[#D1F2EB]">{device.name}</h4>
                      <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mt-0.5">{device.type}</p>
                    </div>
                  </div>
                  {device.is_active && (
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-palette-emerald animate-pulse" />
                      <span className="text-[9px] font-black text-palette-emerald uppercase tracking-widest">Active</span>
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}

          {error && (
            <div className="mt-4 p-4 bg-red-500/10 border border-red-500/30 rounded-2xl text-red-500 text-[11px] font-mono whitespace-pre-wrap">
              {error}
            </div>
          )}
        </div>

        <footer className="p-8 pt-0">
          <button 
            onClick={() => { Haptics.light(); onClose(); }} 
            className="w-full py-4 bg-zinc-800 text-zinc-400 font-black rounded-2xl uppercase tracking-widest text-[11px] active:bg-zinc-700 transition-colors"
          >
            Cancel
          </button>
        </footer>
      </div>
    </div>
  );
};

export default DevicePickerModal;