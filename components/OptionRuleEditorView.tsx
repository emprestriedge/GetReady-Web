import React, { useState, useEffect } from 'react';
import { RunOption, RuleOverride, A7XMode } from '../types';
import { RuleOverrideStore } from '../services/ruleOverrideStore';
import { Haptics } from '../services/haptics';

interface OptionRuleEditorViewProps {
  option: RunOption;
  onBack: () => void;
}

const OptionRuleEditorView: React.FC<OptionRuleEditorViewProps> = ({ option, onBack }) => {
  const [override, setOverride] = useState<RuleOverride>(() => RuleOverrideStore.getForOption(option.id) || {});

  useEffect(() => {
    const scroller = document.getElementById('main-content-scroller');
    if (scroller) scroller.scrollTop = 0;
  }, []);

  const update = (key: keyof RuleOverride, value: any) => {
    Haptics.light();
    const newOverride = { ...override, [key]: value };
    if (value === undefined) delete newOverride[key];
    setOverride(newOverride);
    RuleOverrideStore.setForOption(option.id, newOverride);
  };

  const clearAll = () => {
    Haptics.medium();
    setOverride({});
    RuleOverrideStore.setForOption(option.id, null);
  };

  const isActive = (key: keyof RuleOverride) => override[key] !== undefined;

  const handleToggleOverride = (key: keyof RuleOverride, defaultValue: any) => {
    Haptics.medium();
    const active = isActive(key);
    update(key, active ? undefined : defaultValue);
  };

  return (
    <div className="pt-24 p-4 animate-in fade-in duration-300 pb-32">
      <header className="mb-10 flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <button 
            onClick={() => { Haptics.light(); onBack(); }} 
            className="text-palette-pink flex items-center gap-1 font-black text-xs uppercase tracking-widest active:opacity-50"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={4} d="M15 19l-7-7 7-7" />
            </svg>
            <span className="font-garet">Back</span>
          </button>
          <h1 className="text-4xl font-mango header-ombre leading-none mt-2 truncate max-w-[280px]">
            {option.name}
          </h1>
        </div>
        <button 
          onClick={clearAll} 
          className="bg-white/5 border border-white/10 text-zinc-500 font-black px-4 py-2 rounded-xl text-[9px] uppercase tracking-widest active:bg-palette-pink/20 active:text-palette-pink transition-all active:scale-95"
        >
          Reset All
        </button>
      </header>

      <div className="flex flex-col gap-8">
        <section>
          <h2 className="text-[11px] font-black text-zinc-600 uppercase tracking-[0.2em] ml-5 mb-3">Custom Deployment Logic</h2>
          <div className="glass-panel-gold rounded-[40px] overflow-hidden divide-y divide-white/5 shadow-2xl">
            
            <OverrideRow 
              label="Track Limit" 
              active={isActive('playlistLength')} 
              onToggle={() => handleToggleOverride('playlistLength', 35)}
              renderControl={() => (
                <div className="flex flex-col gap-3 w-48 animate-in zoom-in duration-200">
                  <div className="flex justify-between items-center">
                    <span className="text-palette-pink font-garet font-black text-2xl tabular-nums drop-shadow-[0_0_8px_rgba(255,0,122,0.4)]">{override.playlistLength}</span>
                  </div>
                  <input 
                    type="range" 
                    min="15" 
                    max="75" 
                    step="1" 
                    value={override.playlistLength || 35} 
                    onChange={(e) => update('playlistLength', parseInt(e.target.value))}
                    className="w-full h-1.5 bg-zinc-900 rounded-full appearance-none cursor-pointer accent-palette-pink"
                  />
                </div>
              )}
            />

            {option.id === 'a7x_mix' && (
              <OverrideRow 
                label="Catalog Strategy" 
                active={isActive('a7xMode')} 
                onToggle={() => handleToggleOverride('a7xMode', 'DeepCuts')}
                renderControl={() => (
                  <div className="flex bg-zinc-900 rounded-xl p-1 border border-white/5 animate-in zoom-in duration-200">
                    <button 
                      onClick={() => update('a7xMode', 'TopTracks')}
                      className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${override.a7xMode === 'TopTracks' ? 'bg-palette-pink text-white shadow-lg shadow-palette-pink/30' : 'text-zinc-500'}`}
                    >
                      Popular
                    </button>
                    <button 
                      onClick={() => update('a7xMode', 'DeepCuts')}
                      className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${override.a7xMode === 'DeepCuts' || !override.a7xMode ? 'bg-palette-pink text-white shadow-lg shadow-palette-pink/30' : 'text-zinc-500'}`}
                    >
                      Deep
                    </button>
                  </div>
                )}
              />
            )}

            <OverrideRow 
              label="Allow Explicit" 
              active={isActive('allowExplicit')} 
              onToggle={() => handleToggleOverride('allowExplicit', true)}
              renderControl={() => (
                <div className="animate-in zoom-in duration-200">
                  <Toggle checked={override.allowExplicit!} onToggle={() => update('allowExplicit', !override.allowExplicit)} />
                </div>
              )}
            />

            <OverrideRow 
              label="Avoid Repeats" 
              active={isActive('avoidRepeats')} 
              onToggle={() => handleToggleOverride('avoidRepeats', true)}
              renderControl={() => (
                <div className="animate-in zoom-in duration-200">
                  <Toggle checked={override.avoidRepeats!} onToggle={() => update('avoidRepeats', !override.avoidRepeats)} />
                </div>
              )}
            />
          </div>
        </section>
        
        <div className="px-8 space-y-4">
          <div className="flex items-center gap-3">
             <div className="w-6 h-6 rounded-full border-2 border-zinc-800 flex items-center justify-center" />
             <span className="text-[11px] font-black text-zinc-500 uppercase tracking-widest">Global Inheritance Active</span>
          </div>
          <div className="flex items-center gap-3">
             <div className="w-6 h-6 rounded-full bg-palette-pink flex items-center justify-center">
                <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={5} d="M5 13l4 4L19 7" />
                </svg>
             </div>
             <span className="text-[11px] font-black text-palette-pink uppercase tracking-widest">Custom Override Active</span>
          </div>
          <p className="text-[12px] text-zinc-600 font-garet font-medium leading-relaxed mt-4">
            Overrides ensure this specific mix behaves exactly how you want it to, regardless of your global settings. Great for specialized vibes like "Focus" or "Shazam History".
          </p>
        </div>
      </div>
    </div>
  );
};

const OverrideRow: React.FC<{ label: string; active: boolean; onToggle: () => void; renderControl: () => React.ReactNode }> = ({ label, active, onToggle, renderControl }) => (
  <div className={`px-6 py-6 flex items-center justify-between min-h-[88px] transition-colors ${active ? 'bg-palette-pink/5' : 'bg-transparent'}`}>
    <div className="flex items-center gap-5 flex-1">
      <button 
        onClick={onToggle}
        className={`w-8 h-8 rounded-full border-2 flex items-center justify-center transition-all duration-300 active:scale-90 ${active ? 'bg-palette-pink border-palette-pink scale-110 shadow-[0_0_12px_rgba(255,0,122,0.4)]' : 'bg-transparent border-zinc-800'}`}
      >
        {active && (
          <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={5} d="M5 13l4 4L19 7" />
          </svg>
        )}
      </button>
      <div className="flex flex-col">
        <span className={`text-[20px] font-garet font-bold transition-all duration-300 ${active ? 'text-white' : 'text-zinc-600'}`}>
          {label}
        </span>
        <span className={`text-[9px] font-black uppercase tracking-widest transition-opacity duration-300 ${active ? 'text-palette-pink opacity-100' : 'text-zinc-700 opacity-60'}`}>
          {active ? 'Overridden' : 'Inheriting Global'}
        </span>
      </div>
    </div>
    {active && renderControl()}
  </div>
);

const Toggle: React.FC<{ checked: boolean; onToggle: () => void }> = ({ checked, onToggle }) => (
  <button 
    onClick={onToggle}
    className={`w-14 h-8 rounded-full transition-all duration-300 relative active:scale-90 ${checked ? 'bg-palette-pink shadow-[0_0_12px_rgba(255,0,122,0.4)]' : 'bg-zinc-800'}`}
  >
    <div className={`absolute top-1 w-6 h-6 bg-white rounded-full shadow-lg transition-all duration-300 ${checked ? 'left-[26px]' : 'left-1'}`} />
  </button>
);

export default OptionRuleEditorView;