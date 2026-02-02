
import React, { useState, useEffect, ErrorInfo, ReactNode, Component } from 'react';
import { TabType, RuleSettings, RunOption, RunRecord, SpotifyUser, RunResult, AppConfig } from './types';
import HomeView from './components/HomeView';
import HistoryView from './components/HistoryView';
import SettingsView from './components/SettingsView';
import RunView from './components/RunView';
import NowPlayingStrip from './components/NowPlayingStrip';
import InkBackground from './components/InkBackground';
import { SpotifyAuth } from './services/spotifyAuth';
import { SpotifyApi } from './services/spotifyApi';
import { Haptics } from './services/haptics';
import { spotifyPlayback } from './services/spotifyPlaybackService';
import { apiLogger } from './services/apiLogger';
import { configStore } from './services/configStore';
import { toastService, Toast } from './services/toastService';
import { USE_MOCK_DATA, MOCK_HISTORY } from './constants';

interface ErrorBoundaryProps {
  children?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

// Fix: Use React.Component to ensure this.props and this.state are correctly recognized by the TypeScript compiler
class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = { hasError: false, error: null };

  constructor(props: ErrorBoundaryProps) {
    super(props);
  }

  static getDerivedStateFromError(error: any): ErrorBoundaryState {
    const normalized = error instanceof Error ? error : new Error("Unknown Error");
    return { hasError: true, error: normalized };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    apiLogger.logError(`FATAL_CRASH: ${error.message}`);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="fixed inset-0 bg-black flex items-center justify-center p-8 z-[999]">
          <div className="bg-zinc-900 border border-red-500/30 rounded-[44px] p-10 max-w-lg w-full text-center">
            <h1 className="text-4xl font-mango text-[#D1F2EB] mb-4">Catalog Error</h1>
            <p className="text-zinc-500 font-garet mb-8">{this.state.error?.message}</p>
            <button onClick={() => window.location.reload()} className="w-full bg-palette-pink text-white font-black py-5 rounded-2xl">Reload</button>
          </div>
        </div>
      );
    }
    return this.props.children || null;
  }
}

const ToastOverlay: React.FC = () => {
  const [toasts, setToasts] = useState<Toast[]>([]);
  useEffect(() => toastService.subscribe(setToasts), []);
  return (
    <div className="fixed top-14 left-4 right-4 z-[1000] flex flex-col gap-2 pointer-events-none" style={{ top: 'calc(env(safe-area-inset-top, 0px) + 20px)' }}>
      {toasts.map(toast => (
        <div key={toast.id} className="p-5 rounded-[24px] border backdrop-blur-3xl bg-zinc-900/90 border-white/10 text-white shadow-2xl flex items-center justify-between pointer-events-auto animate-in slide-in-from-top-4">
          <span className="text-sm font-garet font-bold ml-2">{toast.message}</span>
          <button onClick={() => toastService.dismiss(toast.id)} className="p-2 opacity-50">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
      ))}
    </div>
  );
};

const DemoModeIndicator: React.FC = () => {
  if (!USE_MOCK_DATA) return null;
  return (
    <div className="fixed bottom-16 right-4 z-[400] pointer-events-none">
       <span className="bg-palette-gold/20 backdrop-blur-md border border-palette-gold/30 text-palette-gold text-[8px] font-black uppercase tracking-[0.2em] px-2 py-1 rounded-full opacity-60">
         DEMO MODE
       </span>
    </div>
  );
};

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('Home');
  const [homeKey, setHomeKey] = useState(0);
  const [settingsKey, setSettingsKey] = useState(0);
  const [rules, setRules] = useState<RuleSettings>(configStore.getConfig().rules);
  const [config, setConfig] = useState<AppConfig>(configStore.getConfig());
  const [spotifyUser, setSpotifyUser] = useState<SpotifyUser | null>(null);
  const [history, setHistory] = useState<RunRecord[]>([]);
  const [activeRunOption, setActiveRunOption] = useState<RunOption | null>(null);
  const [activeRunResult, setActiveRunResult] = useState<RunResult | null>(null);
  const [showRunOverlay, setShowRunOverlay] = useState(false);
  const [authStatus, setAuthStatus] = useState<string>('idle');
  
  // Bug Fix: Player Visibility State
  const [isPlayerVisible, setIsPlayerVisible] = useState(false);
  // Bug Fix: Player Navigation State
  const [isRunViewQueueMode, setIsRunViewQueueMode] = useState(false);

  useEffect(() => {
    const unsub = configStore.subscribe(() => {
      setConfig(configStore.getConfig());
      setRules(configStore.getConfig().rules);
    });
    
    const loadHistory = () => {
      const saved = localStorage.getItem('spotify_buddy_history');
      if (saved) {
        setHistory(JSON.parse(saved));
      } else if (USE_MOCK_DATA) {
        setHistory(MOCK_HISTORY);
      }
    };
    
    const initSpotify = async () => {
      if (USE_MOCK_DATA) {
        const demoUser = await SpotifyApi.getMe();
        setSpotifyUser(demoUser);
        setAuthStatus('connected');
        loadHistory();
        return;
      }

      const urlParams = new URLSearchParams(window.location.search);
      const code = urlParams.get('code');
      const state = urlParams.get('state');

      if (code) {
        setAuthStatus('exchanging');
        try {
          await SpotifyAuth.exchangeCodeForToken(code, state);
          window.history.replaceState({}, document.title, "/");
        } catch (e) {
          setAuthStatus('error');
        }
      }

      const token = await SpotifyAuth.getValidAccessToken();
      if (token) {
        try {
          const user = await SpotifyApi.getMe();
          setSpotifyUser(user);
          setAuthStatus('connected');
          spotifyPlayback.init();
        } catch (e) {
          setAuthStatus('error');
        }
      }
    };

    loadHistory();
    initSpotify();
    return unsub;
  }, []);

  const handleTabClick = (tab: TabType) => {
    Haptics.light();
    setShowRunOverlay(false);

    if (tab === activeTab) {
      if (tab === 'Home') setHomeKey(prev => prev + 1);
      if (tab === 'Settings') setSettingsKey(prev => prev + 1);
    } else {
      setActiveTab(tab);
    }
  };

  const handleStartRun = (option: RunOption) => {
    setIsRunViewQueueMode(false); // Entering from Home = New Mix Mode
    setActiveRunOption(option);
    setActiveRunResult(null); 
    setShowRunOverlay(true);
  };

  const handleRunComplete = (result: RunResult) => {
    const newRecord: RunRecord = {
      id: Math.random().toString(36).substring(2, 9),
      timestamp: new Date().toLocaleString(),
      optionName: result.optionName,
      rulesSnapshot: { ...rules },
      result
    };
    const updatedHistory = [newRecord, ...history];
    setHistory(updatedHistory);
    localStorage.setItem('spotify_buddy_history', JSON.stringify(updatedHistory));
    
    setActiveRunResult(result);
    setShowRunOverlay(false);
    setActiveTab('Vault');
  };

  const handleRestoreRun = () => {
    if (activeRunOption) {
      Haptics.medium();
      setIsRunViewQueueMode(true); // Entering from Player Strip = Active Queue Mode
      setShowRunOverlay(true);
    }
  };

  return (
    <ErrorBoundary>
      <InkBackground>
        <div id="main-content-scroller" className="flex-1 overflow-y-auto w-full relative pt-16">
          {activeTab === 'Home' && (
            <HomeView 
              key={homeKey}
              onSelect={handleStartRun} 
              rules={rules} 
              setRules={setRules} 
            />
          )}
          {activeTab === 'Vault' && (
            <HistoryView history={history} />
          )}
          {activeTab === 'Settings' && (
            <SettingsView 
              key={settingsKey}
              config={config} 
              rules={rules} 
              setRules={setRules} 
              spotifyUser={spotifyUser}
              authStatus={authStatus}
              authError={null}
              setAuthStatus={setAuthStatus}
            />
          )}
        </div>

        {activeRunOption && showRunOverlay && (
          <RunView 
            option={activeRunOption} 
            rules={rules} 
            onClose={() => setShowRunOverlay(false)} 
            onComplete={handleRunComplete}
            initialResult={activeRunResult || undefined}
            onResultUpdate={setActiveRunResult}
            onPlayTriggered={() => {
               setIsPlayerVisible(true);
               setIsRunViewQueueMode(true); // Once playing, we are in queue mode
            }}
            isQueueMode={isRunViewQueueMode}
          />
        )}

        {isPlayerVisible && (
          <NowPlayingStrip 
            onStripClick={handleRestoreRun} 
            onClose={() => setIsPlayerVisible(false)}
          />
        )}
        <ToastOverlay />
        <DemoModeIndicator />

        <nav className="fixed bottom-0 left-0 right-0 bg-black/40 backdrop-blur-3xl border-t border-white/5 flex justify-around items-center px-6 py-1 z-[300]">
          {(['Home', 'Vault', 'Settings'] as TabType[]).map((tab) => {
            const isActive = activeTab === tab;
            return (
              <button 
                key={tab} 
                onClick={() => handleTabClick(tab)}
                className={`flex flex-col items-center gap-1 transition-all duration-300 ${isActive ? 'scale-105' : 'opacity-40 grayscale'}`}
              >
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${isActive ? 'bg-palette-pink text-white shadow-lg shadow-palette-pink/30' : 'text-zinc-400'}`}>
                  {tab === 'Home' && <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg>}
                  {tab === 'Vault' && <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2L2 12l10 10 10-10L12 2z"/></svg>}
                  {tab === 'Settings' && <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/></svg>}
                </div>
                <span className={`text-[8px] font-black uppercase tracking-widest ${isActive ? 'text-palette-pink' : 'text-zinc-600'}`}>
                  {tab === 'Vault' ? 'Vault' : tab}
                </span>
              </button>
            );
          })}
        </nav>
      </InkBackground>
    </ErrorBoundary>
  );
};

export default App;
