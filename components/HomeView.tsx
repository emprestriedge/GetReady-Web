import React, { useState, useEffect, useRef } from 'react';
import { RunOption, RunOptionType, VibeType, SmartMixPlan, RuleSettings } from '../types';
import { SMART_MIX_MODES, MUSIC_BUTTONS, PODCAST_OPTIONS } from '../constants';
import { getSmartMixPlan } from '../services/geminiService';
import { Haptics } from '../services/haptics';
import { catalogStore } from '../services/catalogStore';

interface HomeViewProps {
  onSelect: (option: RunOption) => void;
  rules: RuleSettings;
  setRules: React.Dispatch<React.SetStateAction<RuleSettings>>;
}

type HomeViewMode = 'root' | 'music' | 'podcast';

export const StatusAsterisk: React.FC<{ status?: 'liked' | 'gem' | 'none' }> = ({ status = 'none' }) => {
  // Simplified logic: Pink for Saved (liked/gem), Grey for none.
  const finalColor = (status === 'liked' || status === 'gem') ? '#FF007A' : '#555555';

  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="shrink-0 mr-2 sm:mr-3 mt-1" style={{ color: finalColor }}>
      <path d="M12 3V21M4.2 7.5L19.8 16.5M19.8 7.5L4.2 16.5" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" />
    </svg>
  );
};

// Legacy support
export const PinkAsterisk = () => <StatusAsterisk status="liked" />;

const AnimatedLabel: React.FC<{ value: number }> = ({ value }) => {
  const getBucketLabel = (v: number) => {
    if (v <= 0.33) return 'Chill';
    if (v >= 0.67) return 'Fired Up 🔥';
    return 'Steady';
  };

  const targetLabel = getBucketLabel(value);
  const [displayLabel, setDisplayLabel] = useState(targetLabel);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (targetLabel !== displayLabel && !isTransitioning) {
      Haptics.light();
      setIsTransitioning(true);
      if (timerRef.current) window.clearTimeout(timerRef.current);

      timerRef.current = window.setTimeout(() => {
        setDisplayLabel(targetLabel);
        setIsTransitioning(false);
        timerRef.current = null;
      }, 180);
    }
  }, [targetLabel, displayLabel, isTransitioning]);

  return (
    <span className={`label-transition inline-block font-black text-palette-teal uppercase tracking-widest ${isTransitioning ? 'label-hidden' : 'label-visible'}`}>
      {displayLabel}
    </span>
  );
};

const VIBE_STYLES: Record<VibeType, { gradient: string, shadow: string, activeRing: string, label: string }> = {
  Chaos: { 
    gradient: "from-[#FF007A] to-[#FF4D9F]", 
    shadow: "rgba(255, 0, 122, 0.6)",
    activeRing: "ring-[#FF007A]",
    label: "CHAOS"
  },
  Zen: { 
    gradient: "from-[#C5A04D] to-[#E5C16D]", 
    shadow: "rgba(197, 160, 77, 0.6)",
    activeRing: "ring-[#C5A04D]",
    label: "ZEN"
  },
  Focus: { 
    gradient: "from-[#2DB9B1] to-[#40D9D0]", 
    shadow: "rgba(45, 185, 177, 0.6)",
    activeRing: "ring-[#2DB9B1]",
    label: "FOCUS"
  },
  LighteningMix: { 
    gradient: "from-[#6D28D9] to-[#8B5CF6]", 
    shadow: "rgba(109, 40, 217, 0.6)",
    activeRing: "ring-[#6D28D9]",
    label: "LIGHTNING"
  },
};

const HomeView: React.FC<HomeViewProps> = ({ onSelect, rules, setRules }) => {
  const [viewMode, setViewMode] = useState<HomeViewMode>('root');
  const [vibe, setVibe] = useState<VibeType>(() => {
     if (rules.calmHype <= 0.2) return 'Zen';
     if (rules.calmHype >= 0.9) return 'LighteningMix';
     if (rules.discoverLevel >= 0.7) return 'Chaos';
     return 'Focus';
  });
  const [loading, setLoading] = useState<boolean>(false);
  const [smartPlan, setSmartPlan] = useState<SmartMixPlan | null>(() => {
    const saved = localStorage.getItem('spotify_buddy_smart_plan');
    return saved ? JSON.parse(saved) : null;
  });

  useEffect(() => {
    window.scrollTo(0, 0);
    const scroller = document.getElementById('main-content-scroller');
    if (scroller) scroller.scrollTop = 0;
  }, [viewMode]);

  useEffect(() => {
    if (smartPlan) {
      localStorage.setItem('spotify_buddy_smart_plan', JSON.stringify(smartPlan));
    }
  }, [smartPlan]);

  const setVibeProfile = (v: VibeType) => {
    Haptics.impact();
    setVibe(v);
    
    let energy = 0.5;
    let discovery = 0.3;

    switch (v) {
      case 'Zen': energy = 0.1; discovery = 0.2; break;
      case 'Focus': energy = 0.4; discovery = 0.1; break;
      case 'Chaos': energy = 0.75; discovery = 0.85; break;
      case 'LighteningMix': energy = 1.0; discovery = 0.45; break;
    }

    setRules(prev => ({ ...prev, calmHype: energy, discoverLevel: discovery }));
  };

  const handleGenerateSmartMix = async () => {
    Haptics.medium();
    setLoading(true);
    try {
      const plan = await getSmartMixPlan(vibe, rules.discoverLevel, rules.calmHype, rules.playlistLength);
      setSmartPlan(plan);
      const vibeToOptionId: Record<VibeType, string> = {
        'Chaos': 'chaos_mix', 'Zen': 'zen_mix', 'Focus': 'focus_mix', 'LighteningMix': 'lightening_mix'
      };
      const optionId = vibeToOptionId[vibe];
      const option = SMART_MIX_MODES.find(o => o.id === optionId);
      if (option) {
        Haptics.success();
        setTimeout(() => { onSelect(option); setLoading(false); }, 800);
      } else {
        setLoading(false);
      }
    } catch (e) {
      Haptics.error();
      setLoading(false);
    }
  };

  const navigateTo = (mode: HomeViewMode) => {
    Haptics.light();
    setViewMode(mode);
  };

  const LightningIcon = ({ className = "w-6 h-6" }: { className?: string }) => (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
    </svg>
  );

  const renderRoot = () => (
    <div className="flex flex-col gap-4 px-4 pt-24 pb-40 w-full max-w-[100vw] overflow-x-hidden">
      <header className="mb-6 pl-8 stagger-entry stagger-1">
        <h1 className="text-7xl font-mango header-ombre leading-none tracking-tighter">Library</h1>
        <p className="ios-caption text-zinc-500 text-[10px] font-black uppercase tracking-[0.3em] mt-5 ml-1">Daily Catalog</p>
      </header>

      <div className="flex flex-col gap-4 mb-6 stagger-entry stagger-2 w-full">
        <CategoryCard 
          title="Music" description="Custom mixes from your top tracks."
          icon={<svg className="w-10 h-10 text-white opacity-100" fill="currentColor" viewBox="0 0 24 24"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>}
          gradient="from-[#FF007A] via-[#FF1A8B] to-[#FF4D9F]" shadowColor="rgba(255, 0, 122, 0.4)"
          onClick={() => navigateTo('music')}
        />
        <CategoryCard 
          title="Podcasts" description="Sync the latest episodes."
          icon={<svg className="w-10 h-10 text-white opacity-100" fill="currentColor" viewBox="0 0 24 24"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/><path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/></svg>}
          gradient="from-[#19A28E] via-[#2DB9B1] to-[#40D9D0]" shadowColor="rgba(25, 162, 142, 0.4)"
          onClick={() => navigateTo('podcast')}
        />
      </div>

      <div className="glass-panel-gold rounded-[40px] p-4 sm:p-6 border-white/10 relative overflow-hidden group stagger-entry stagger-3 w-full">
        <div className="absolute top-0 right-0 p-4 opacity-10">
          <svg className="w-12 h-12 text-palette-pink" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71L12 2z"/></svg>
        </div>
        <h2 className="text-[11px] font-black text-palette-pink uppercase tracking-[0.3em] mb-6">SMART MIX</h2>
        <div className="flex flex-col gap-8">
          <div className="flex flex-col gap-3">
            <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest px-1">1. Select Vibe Profile</span>
            <div className="grid grid-cols-4 gap-3 px-5">
              {(['Chaos', 'Zen', 'Focus', 'LighteningMix'] as VibeType[]).map((v) => {
                const style = VIBE_STYLES[v];
                const isActive = vibe === v;
                return (
                  <div key={v} className="flex items-center justify-center">
                    <button 
                      onClick={() => setVibeProfile(v)} 
                      className={`relative w-full aspect-square rounded-[20px] transition-all duration-300 active:scale-95 flex items-center justify-center ${isActive ? 'scale-110' : 'opacity-40 grayscale-[0.6] scale-100'}`}
                    >
                      {isActive && (
                        <div 
                          className="absolute inset-[-4px] rounded-[24px] blur-xl opacity-80 transition-all duration-300"
                          style={{ backgroundColor: style.shadow.replace('0.6', '0.4') }}
                        />
                      )}
                      
                      <div 
                        className={`absolute inset-0 bg-gradient-to-br ${style.gradient} rounded-[20px] transition-all duration-300 ${isActive ? `ring-[3px] ${style.activeRing} ring-offset-2 ring-offset-black` : 'border border-white/5'}`} 
                        style={{ 
                          boxShadow: isActive ? `0 12px 28px -4px ${style.shadow}, inset 0 6px 16px rgba(255, 255, 255, 0.5)` : 'none' 
                        }}
                      >
                        <div className="absolute top-1 left-2 w-[85%] h-[40%] bg-gradient-to-b from-white/40 to-transparent rounded-[10px] blur-[0.6px] pointer-events-none" />
                      </div>
                      
                      <div className="relative z-10 w-full h-full flex items-center justify-center overflow-visible p-1">
                        {v === 'LighteningMix' ? (
                          <LightningIcon className={`w-8 h-8 transition-colors ${isActive ? 'text-white' : 'text-zinc-300'} drop-shadow-md`} />
                        ) : (
                          <span className={`text-[10px] font-black uppercase tracking-tighter italic transform scale-x-[0.95] leading-none text-center px-0.5 transition-colors ${isActive ? 'text-white' : 'text-zinc-300'}`}>
                            {style.label}
                          </span>
                        )}
                      </div>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="flex flex-col gap-4">
            <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest px-1">2. Fine Tuning</span>
            <div className="flex flex-col gap-5">
              <div className="bg-zinc-900/40 px-2 py-5 rounded-[28px] border border-palette-teal/20 relative overflow-hidden">
                <div className="flex flex-col gap-2 relative z-10">
                  <div className="flex justify-between items-center px-4">
                    <span className="text-[9px] font-black text-palette-teal/60 uppercase tracking-widest">Energy Level</span>
                    <AnimatedLabel value={rules.calmHype} />
                  </div>
                  <div className="px-2 py-8 -my-8 flex items-center relative touch-pan-y">
                    <div className="absolute left-2 right-2 h-1.5 bg-zinc-800 rounded-full pointer-events-none" />
                    <input 
                      type="range" 
                      min="0" 
                      max="1" 
                      step="0.01" 
                      value={rules.calmHype} 
                      onChange={(e) => setRules(prev => ({ ...prev, calmHype: parseFloat(e.target.value) }))} 
                      className="w-full h-16 appearance-none bg-transparent cursor-pointer accent-palette-teal relative z-10 outline-none" 
                    />
                  </div>
                  <div className="flex justify-between px-4 mt-1 text-[8px] font-black text-zinc-700 uppercase tracking-tighter"><span>Relaxed</span><span>Hyper</span></div>
                </div>
              </div>
              <div className="bg-zinc-900/40 px-2 py-5 rounded-[28px] border border-palette-pink/20 relative overflow-hidden">
                <div className="flex flex-col gap-2 relative z-10">
                  <div className="flex justify-between items-center px-4">
                    <span className="text-[9px] font-black text-palette-pink/60 uppercase tracking-widest">Exploration</span>
                    <span className="text-[10px] font-black text-palette-pink uppercase tracking-widest">{Math.round(rules.discoverLevel * 100)}% New</span>
                  </div>
                  <div className="px-2 py-8 -my-8 flex items-center relative touch-pan-y">
                    <div className="absolute left-2 right-2 h-1.5 bg-zinc-800 rounded-full pointer-events-none" />
                    <input 
                      type="range" 
                      min="0" 
                      max="1" 
                      step="0.05" 
                      value={rules.discoverLevel} 
                      onChange={(e) => setRules(prev => ({ ...prev, discoverLevel: parseFloat(e.target.value) }))} 
                      className="w-full h-16 appearance-none bg-transparent cursor-pointer accent-palette-pink relative z-10 outline-none" 
                    />
                  </div>
                  <div className="flex justify-between px-4 mt-1 text-[8px] font-black text-zinc-700 uppercase tracking-tighter"><span>Comfort</span><span>Discovery</span></div>
                </div>
              </div>
            </div>
          </div>
          <button onClick={handleGenerateSmartMix} disabled={loading} className="w-full relative overflow-hidden bg-gradient-to-br from-[#FF007A] via-[#FF1A8B] to-[#FF4D9F] py-5 rounded-[26px] flex items-center justify-center gap-3 active:scale-[0.98] transition-all border border-white/15 shadow-xl shadow-palette-pink/30">
            <div className="absolute top-1 left-2 w-[90%] h-[40%] bg-gradient-to-b from-white/40 to-transparent rounded-full blur-[1px] animate-jelly-shimmer pointer-events-none" />
            <div className="relative z-10 flex items-center gap-3">
              {loading ? ( <div className="w-6 h-6 border-3 border-white border-t-transparent rounded-full animate-spin" /> ) : ( <LightningIcon className="w-7 h-7 text-white drop-shadow-[0_2px_4_rgba(0,0,0,0.3)]" /> )}
              <span className="text-[14px] font-black uppercase tracking-[0.2em] text-white">Generate Mix</span>
            </div>
          </button>
        </div>
      </div>
    </div>
  );

  const renderList = (type: RunOptionType) => {
    let options: RunOption[] = [];
    const isMusic = type === RunOptionType.MUSIC;
    if (isMusic) options = MUSIC_BUTTONS;
    else options = rules.customPodcastOptions || PODCAST_OPTIONS;

    const title = isMusic ? 'Music' : 'Shows';
    return (
      <div className="flex flex-col gap-6 px-4 pt-24 pb-40 w-full max-w-[100vw] overflow-x-hidden">
        <header className="flex flex-col gap-2 pl-8 stagger-entry stagger-1">
          <button onClick={() => navigateTo('root')} className="text-palette-pink flex items-center gap-1 active:opacity-50 font-black text-xs uppercase tracking-widest"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={4} d="M15 19l-7-7 7-7" /></svg><span className="font-garet font-bold">Library</span></button>
          <h2 className="text-7xl font-mango header-ombre leading-none mt-2 tracking-tighter">{title}</h2>
        </header>
        <div className="glass-panel-gold rounded-[32px] overflow-hidden divide-y divide-white/5 stagger-entry stagger-2">
          {options.map((option, i) => (
            <OptionRow key={option.id} option={option} isMusic={isMusic} onClick={() => onSelect(option)} />
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="relative flex flex-col flex-1 pb-24 w-full max-w-[100vw] overflow-x-hidden">
      {viewMode === 'root' && renderRoot()}
      {viewMode === 'music' && renderList(RunOptionType.MUSIC)}
      {viewMode === 'podcast' && renderList(RunOptionType.PODCAST)}
    </div>
  );
};

interface CategoryCardProps { title: string; description: string; icon: React.ReactNode; gradient: string; shadowColor: string; onClick: () => void; }
const CategoryCard: React.FC<CategoryCardProps> = ({ title, description, icon, gradient, shadowColor, onClick }) => (
  <button 
    onClick={() => { Haptics.light(); onClick(); }} 
    className="w-full text-left bg-palette-gold/5 backdrop-blur-3xl rounded-[38px] p-4 sm:p-6 flex items-center gap-4 sm:gap-6 group border border-white/5 shadow-2xl relative overflow-hidden transition-all duration-75 ease-out active:scale-[0.98] active:opacity-90 min-h-[110px]"
  >
    <div className="relative shrink-0">
      <div className={`w-20 h-20 sm:w-24 sm:h-24 bg-gradient-to-br ${gradient} rounded-[28px] sm:rounded-[32px] flex items-center justify-center shadow-xl relative overflow-hidden transition-all duration-300 transform group-hover:scale-105`} style={{ boxShadow: `0 12px 25px -8px ${shadowColor}, inset 0 6px 15px rgba(255, 255, 255, 0.45), inset 0 -10px 25px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(255, 255, 255, 0.15)` }}>
        <div className="absolute top-1 left-2 w-[85%] h-[40%] bg-gradient-to-b from-white/50 to-transparent rounded-full blur-[1px] animate-jelly-shimmer pointer-events-none" />
        <div className="relative z-10 flex items-center justify-center transform group-active:scale-90 transition-transform duration-200">{icon}</div>
      </div>
    </div>
    <div className="flex-1 z-10 min-w-0 flex flex-col justify-center">
      <h3 className="text-4xl sm:text-5xl font-bodoni-smallcaps text-[#D1F2EB] leading-[0.9] drop-shadow-sm truncate mb-0.5">{title}</h3>
      <p className="text-[13px] sm:text-[15px] text-zinc-500 font-medium leading-tight opacity-70 group-active:opacity-100 transition-opacity line-clamp-2 max-w-[95%]">{description}</p>
    </div>
    <div className="pr-1 opacity-20 group-active:opacity-100 group-active:translate-x-1 transition-all duration-200 shrink-0">
      <svg className="w-5 h-5 sm:w-6 sm:h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 5l7 7-7 7" /></svg>
    </div>
  </button>
);

const OptionRow: React.FC<{ option: RunOption; onClick: () => void; isMusic?: boolean }> = ({ option, onClick, isMusic }) => {
  const isReady = catalogStore.isReady(option.idKey);
  
  return (
    <button 
      onClick={() => {
        if (isReady) {
          Haptics.light();
          onClick();
        } else {
          Haptics.error();
        }
      }} 
      disabled={!isReady}
      className={`w-full text-left px-4 sm:px-6 py-5 sm:py-6 transition-all flex items-center group relative active:scale-[0.98] ${isReady ? 'active:bg-white/10' : 'opacity-40 cursor-not-allowed grayscale'}`}
    >
      <StatusAsterisk status="liked" />
      <div className="flex-1 flex flex-col min-w-0 pr-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-[21px] sm:text-[23px] font-gurmukhi text-[#A9E8DF] group-active:text-palette-pink transition-colors truncate max-w-[95%]`}>
            {option.name}
          </span>
          {!isReady && (
            <span className="text-[7px] font-black text-red-500 uppercase tracking-widest border border-red-500/30 px-1.5 py-0.5 rounded bg-red-500/10 shrink-0 animate-pulse-soft">Needs Setup</span>
          )}
        </div>
        <span className="text-[12px] sm:text-[13px] text-zinc-500 font-medium line-clamp-1 pr-4 mt-0.5 font-garet">{option.description}</span>
      </div>
      {isReady && <svg className="w-4 h-4 sm:w-5 h-5 text-zinc-700 group-active:text-palette-pink shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 5l7 7-7 7" /></svg>}
    </button>
  );
};

export default HomeView;