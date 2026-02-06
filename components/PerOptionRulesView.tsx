import React, { useState, useEffect } from 'react';
import { MUSIC_BUTTONS, PODCAST_OPTIONS } from '../constants';
import { RunOption } from '../types';
import OptionRuleEditorView from './OptionRuleEditorView';
import { RuleOverrideStore } from '../services/ruleOverrideStore';
import { PinkAsterisk } from './HomeView';

interface PerOptionRulesViewProps {
  onBack: () => void;
}

const PerOptionRulesView: React.FC<PerOptionRulesViewProps> = ({ onBack }) => {
  const [selectedOption, setSelectedOption] = useState<RunOption | null>(null);

  useEffect(() => {
    const scroller = document.getElementById('main-content-scroller');
    if (scroller) scroller.scrollTop = 0;
  }, [selectedOption]);

  if (selectedOption) {
    return (
      <OptionRuleEditorView 
        option={selectedOption} 
        onBack={() => setSelectedOption(null)} 
      />
    );
  }

  return (
    <div className="pt-24 px-4 animate-in fade-in duration-300 pb-40">
      <header className="mb-8 flex flex-col gap-2">
        <button 
          onClick={onBack} 
          className="text-palette-pink flex items-center gap-1 font-black text-xs uppercase tracking-widest active:opacity-50"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={4} d="M15 19l-7-7 7-7" />
          </svg>
          <span className="font-garet">Settings</span>
        </button>
        <h1 className="text-6xl font-mango header-ombre leading-none mt-2">Custom Rules</h1>
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500 mt-2 ml-1">Configure individual mix behavior</p>
      </header>

      <div className="flex flex-col gap-8">
        <section>
          <h2 className="text-[11px] font-black text-zinc-600 uppercase tracking-[0.2em] ml-5 mb-3">Music Mixes</h2>
          <div className="glass-panel-gold rounded-[32px] overflow-hidden divide-y divide-white/5 shadow-2xl">
            {MUSIC_BUTTONS.map(opt => (
              <OptionRow key={opt.id} option={opt} onClick={() => setSelectedOption(opt)} />
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-[11px] font-black text-zinc-600 uppercase tracking-[0.2em] ml-5 mb-3">Podcast Shows</h2>
          <div className="glass-panel-gold rounded-[32px] overflow-hidden divide-y divide-white/5 shadow-2xl">
            {PODCAST_OPTIONS.map(opt => (
              <OptionRow key={opt.id} option={opt} onClick={() => setSelectedOption(opt)} />
            ))}
          </div>
        </section>
        
        <div className="px-6 py-4 bg-white/5 rounded-3xl border border-white/5 mt-4">
           <p className="text-[12px] text-zinc-500 font-garet font-medium leading-relaxed">
             Rules defined here will <span className="text-palette-pink font-bold">override</span> the Global Mix Logic settings. If a rule is not customized, the global default will be used.
           </p>
        </div>
      </div>
    </div>
  );
};

const OptionRow: React.FC<{ option: RunOption; onClick: () => void }> = ({ option, onClick }) => {
  const hasOverride = !!RuleOverrideStore.getForOption(option.id);
  return (
    <button 
      onClick={onClick} 
      className="w-full px-6 py-6 flex items-center active:bg-white/10 transition-all text-left group"
    >
      <PinkAsterisk />
      <div className="flex flex-col flex-1 min-w-0 pr-4">
        <div className="flex items-center gap-2">
          <span className="text-[20px] font-garet font-bold text-[#A9E8DF] group-active:text-palette-pink transition-colors truncate">
            {option.name}
          </span>
          {hasOverride && (
            <div className="w-1.5 h-1.5 rounded-full bg-palette-pink shadow-[0_0_8px_rgba(255,0,122,0.8)]" />
          )}
        </div>
        <span className="text-[13px] text-zinc-500 font-medium line-clamp-1 mt-0.5">{option.description}</span>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        {hasOverride && (
          <span className="text-[9px] font-black text-palette-pink uppercase tracking-widest">Active</span>
        )}
        <svg className="w-5 h-5 text-zinc-700 group-active:text-palette-pink group-active:translate-x-1 transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </button>
  );
};

export default PerOptionRulesView;