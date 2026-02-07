import React, { useState, useRef, useEffect } from 'react';
import { RuleSettings, RunOption, PodcastShowCandidate } from '../types';
import { SpotifyDataService } from '../services/spotifyDataService';
import { ContentIdStore } from '../services/contentIdStore';
import { configStore } from '../services/configStore';
import { Haptics } from '../services/haptics';
import { PinkAsterisk } from './HomeView';
import { apiLogger } from '../services/apiLogger';
import { toastService } from '../services/toastService';

interface PodcastManagerViewProps {
  rules: RuleSettings;
  setRules: React.Dispatch<React.SetStateAction<RuleSettings>>;
  onBack: () => void;
}

const PodcastManagerView: React.FC<PodcastManagerViewProps> = ({ onBack }) => {
  const [options, setOptions] = useState<RunOption[]>(configStore.getConfig().podcasts);
  const [resolvingIdx, setResolvingIdx] = useState<number | null>(null);
  const [candidates, setCandidates] = useState<PodcastShowCandidate[]>([]);
  const [showPicker, setShowPicker] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [selectedCandidate, setSelectedCandidate] = useState<PodcastShowCandidate | null>(null);

  useEffect(() => {
    const scroller = document.getElementById('main-content-scroller');
    if (scroller) scroller.scrollTop = 0;
  }, []);
  
  const handleUpdateSlot = (index: number, updates: Partial<RunOption>) => {
    configStore.updatePodcastSlot(index, updates);
    setOptions(configStore.getConfig().podcasts);
  };

  const handleSearchPodcasts = async (index: number) => {
    const slot = options[index];
    if (!slot.name.trim()) return;

    Haptics.impact();
    setResolvingIdx(index);
    setSelectedCandidate(null);
    setIsConfirming(false);
    apiLogger.logClick(`PodcastManager: Searching for "${slot.name}"`);

    try {
      const results = await SpotifyDataService.searchShows(slot.name, 20);
      if (results && results.length > 0) {
        const targetName = slot.name.toLowerCase();
        const ranked = results
          .map(s => ({
            id: s.id,
            name: s.name,
            publisher: s.publisher,
            imageUrl: s.images?.[0]?.url || "",
            description: s.description || "",
            explicit: s.explicit || false
          }))
          .sort((a, b) => {
            const aExact = a.name.toLowerCase() === targetName;
            const bExact = b.name.toLowerCase() === targetName;
            if (aExact && !bExact) return -1;
            if (!aExact && bExact) return 1;
            return 0;
          })
          .slice(0, 8);

        setCandidates(ranked);
        setShowPicker(true);
        Haptics.success();
      } else {
        setResolvingIdx(null);
        Haptics.error();
        toastService.show(`No matches found for "${slot.name}"`, "warning");
      }
    } catch (e: any) {
      setResolvingIdx(null);
      apiLogger.logError(`PodcastManager: Search failed: ${e.message}`);
      toastService.show("Search failed. Check connection.", "error");
    }
  };

  const handleClosePicker = () => {
    if (isConfirming) return;
    setShowPicker(false);
    setResolvingIdx(null);
    setCandidates([]);
    setSelectedCandidate(null);
    setIsConfirming(false);
  };

  const handleConfirmMatch = async (e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (!selectedCandidate || resolvingIdx === null || isConfirming) {
      return;
    }

    setIsConfirming(true);
    Haptics.medium();

    try {
      const idKey = options[resolvingIdx].idKey || `custom_podcast_${resolvingIdx}_id`;
      
      ContentIdStore.set(idKey, selectedCandidate.id);
      handleUpdateSlot(resolvingIdx, { 
        idKey,
        name: selectedCandidate.name,
        description: selectedCandidate.description.slice(0, 120) + (selectedCandidate.description.length > 120 ? '...' : ''),
        publisher: selectedCandidate.publisher
      });

      Haptics.success();
      toastService.show("Show linked!", "success");
      setShowPicker(false);
      setResolvingIdx(null);
      setCandidates([]);
      setSelectedCandidate(null);

    } catch (err: any) {
      apiLogger.logError(`PodcastManager Confirm Error: ${err.message}`);
      toastService.show("Failed to link show", "error");
    } finally {
      setIsConfirming(false);
    }
  };

  return (
    <div className="pt-24 px-4 animate-in slide-in-from-right duration-300 pb-40">
      <header className="mb-8 flex flex-col gap-2 px-2">
        <button onClick={onBack} className="text-palette-pink flex items-center gap-1 font-black text-xs uppercase tracking-widest active:opacity-50">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={4} d="M15 19l-7-7 7-7" />
          </svg>
          <span className="font-garet font-bold">Settings</span>
        </button>
        <h1 className="text-6xl font-mango header-ombre leading-none mt-2">Podcast Catalog</h1>
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500 mt-2 ml-1">Customize the 3 main show slots</p>
      </header>

      <div className="flex flex-col gap-8">
        {options.map((slot, i) => (
          <div key={slot.id} className="glass-panel-gold rounded-[40px] p-8 border border-white/10 shadow-2xl flex flex-col gap-5">
             <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                   <PinkAsterisk />
                   <span className="text-[11px] font-black text-palette-gold uppercase tracking-[0.3em]">Slot {i + 1}</span>
                </div>
                {slot.publisher && (
                   <span className="text-[8px] font-black text-zinc-600 uppercase tracking-widest bg-white/5 px-2 py-1 rounded-md">
                      {slot.publisher}
                   </span>
                )}
             </div>

             <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                   <label className="text-[10px] font-black text-zinc-600 uppercase tracking-widest px-1">Search or Title</label>
                   <input 
                     type="text" 
                     value={slot.name}
                     onChange={e => handleUpdateSlot(i, { name: e.target.value })}
                     placeholder="e.g. The Daily"
                     className="bg-black/40 border border-white/10 rounded-2xl px-5 py-3 text-[#D1F2EB] font-garet font-bold outline-none focus:border-palette-pink transition-all"
                   />
                </div>

                <div className="flex flex-col gap-2">
                   <label className="text-[10px] font-black text-zinc-600 uppercase tracking-widest px-1">Description</label>
                   <textarea 
                     value={slot.description}
                     onChange={e => handleUpdateSlot(i, { description: e.target.value })}
                     placeholder="Tagline..."
                     rows={2}
                     className="bg-black/40 border border-white/10 rounded-2xl px-5 py-3 text-sm text-zinc-400 font-garet outline-none focus:border-palette-pink transition-all resize-none"
                   />
                </div>

                <div className="flex flex-col gap-2 mt-2">
                   <button 
                     onClick={() => handleSearchPodcasts(i)}
                     disabled={resolvingIdx === i || !slot.name.trim()}
                     className={`w-full py-4 rounded-2xl flex items-center justify-center gap-3 font-garet font-bold transition-all border border-white/10 ${resolvingIdx === i ? 'bg-zinc-800 animate-pulse' : 'bg-white/5 active:bg-white/10'}`}
                   >
                     {resolvingIdx === i ? (
                        <div className="w-4 h-4 border-2 border-zinc-600 border-t-transparent rounded-full animate-spin" />
                     ) : (
                        <svg className="w-4 h-4 text-palette-emerald" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" /></svg>
                     )}
                     <span className="text-[11px] uppercase tracking-widest text-[#A9E8DF]">
                        {resolvingIdx === i ? 'Searching...' : 'Find on Spotify'}
                     </span>
                   </button>
                </div>
             </div>
          </div>
        ))}
      </div>

      {showPicker && (
        <div 
          className="fixed inset-0 z-[10001] bg-black/80 backdrop-blur-2xl flex items-center justify-center p-6 animate-in fade-in duration-300 pointer-events-auto"
          onClick={handleClosePicker}
        >
           <div 
            className="bg-zinc-900 border border-white/10 rounded-[40px] w-full max-w-md h-[85vh] flex flex-col shadow-2xl animate-in zoom-in duration-300 overflow-hidden relative"
            onClick={e => e.stopPropagation()}
           >
              <header className="p-8 pb-4 shrink-0 flex flex-col gap-4 border-b border-white/5">
                <div className="flex justify-between items-start">
                   <div>
                     <h3 className="text-4xl font-mango text-[#A9E8DF] leading-none">Select Show</h3>
                     <p className="text-[10px] font-black text-zinc-600 uppercase tracking-widest mt-2">Manual show selection</p>
                   </div>
                   <button onClick={handleClosePicker} disabled={isConfirming} className="text-zinc-500 active:text-white transition-colors">
                     <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>
                   </button>
                </div>
              </header>
              
              <div className="flex-1 overflow-y-auto px-6 py-6 space-y-4">
                 {candidates.map((c) => (
                    <button 
                      key={c.id} 
                      onClick={() => !isConfirming && setSelectedCandidate(c)}
                      className={`w-full text-left bg-white/5 border rounded-3xl p-5 flex flex-col gap-4 transition-all duration-300 ${isConfirming ? 'opacity-40 grayscale pointer-events-none' : 'hover:bg-white/10 active:scale-[0.98]'} ${selectedCandidate?.id === c.id ? 'border-palette-teal ring-1 ring-palette-teal/30 bg-palette-teal/10 shadow-lg shadow-palette-teal/5' : 'border-white/5'}`}
                    >
                       <div className="flex gap-4">
                          <img src={c.imageUrl} className="w-16 h-16 rounded-xl object-cover shrink-0 border border-white/10" alt="" />
                          <div className="flex-1 min-w-0">
                             <h4 className={`text-[16px] font-garet font-bold transition-colors truncate ${selectedCandidate?.id === c.id ? 'text-palette-teal' : 'text-[#D1F2EB]'}`}>{c.name}</h4>
                             <p className="text-[11px] text-zinc-500 font-medium truncate mt-0.5">{c.publisher}</p>
                          </div>
                       </div>
                    </button>
                 ))}
              </div>

              <footer className="p-8 pt-4 shrink-0 border-t border-white/5 bg-zinc-900/50 flex flex-col gap-3 relative z-[300]">
                 <button 
                   onClick={handleConfirmMatch}
                   disabled={!selectedCandidate || isConfirming}
                   className={`w-full relative overflow-hidden text-white font-black py-5 rounded-2xl transition-all font-garet uppercase tracking-widest text-[13px] border border-white/15 pointer-events-auto ${!selectedCandidate || isConfirming ? 'bg-zinc-800 text-zinc-600 opacity-50 grayscale' : 'bg-gradient-to-br from-palette-emerald to-[#22c1aa] active:scale-95 shadow-xl shadow-palette-emerald/20'}`}
                 >
                    <span className="relative z-10 flex items-center justify-center gap-3">
                      {isConfirming ? (
                         <>
                           <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                           <span>Confirming...</span>
                         </>
                      ) : (
                         <span>Confirm Selection</span>
                      )}
                    </span>
                 </button>
                 <button onClick={handleClosePicker} disabled={isConfirming} className="w-full py-2 text-zinc-600 font-black uppercase tracking-widest text-[10px] active:opacity-50">Cancel</button>
              </footer>
           </div>
        </div>
      )}
    </div>
  );
};

export default PodcastManagerView;