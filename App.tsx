
import React, { Component, useState, useEffect, ErrorInfo, ReactNode } from 'react';
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
import { ResourceResolver } from './services/resourceResolver';
import { apiLogger } from './services/apiLogger';
import { authStore } from './services/authStore';
import { configStore } from './services/configStore';

type AuthStatus = 'idle' | 'waiting' | 'received' | 'exchanging' | 'connected' | 'error';

interface ErrorBoundaryProps {
  children?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

// @google/genai coding guidelines: Using standard React.Component inheritance.
// Fix: Use React.Component explicitly to ensure props and state are correctly inherited and visible to the TypeScript compiler.
class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null
    };
  }

  static getDerivedStateFromError(error: any): ErrorBoundaryState {
    const normalized = error instanceof Error 
      ? error 
      : new Error(typeof error === "string" ? error : "Unknown Error");
    return { hasError: true, error: normalized };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error captured by boundary:", error, errorInfo);
    apiLogger.logError(`CRITICAL_RUNTIME_ERROR: ${error.message}`);
  }

  copyDebugInfo = () => {
    const logs = apiLogger.getLogs();
    const info = {
        error: this.state.error?.message,
        stack: this.state.error?.stack,
        logs: logs.slice(0, 50),
        storageKeys: Object.keys(localStorage)
    };
    navigator.clipboard.writeText(JSON.stringify(info, null, 2));
    alert("Diagnostic bundle copied.");
  };

  handleHardReset = () => {
    if (confirm("Permanently clear ALL configuration, tokens, and history? This cannot be undone.")) {
        authStore.hardReset();
        configStore.resetConfig();
        localStorage.clear();
        window.location.reload();
    }
  };

  render() {
    if (this.state.hasError) {
      const error = this.state.error!;
      return (
        <div className="fixed inset-0 bg-black flex items-center justify-center p-8 z-[999] overflow-auto">
          <div className="bg-zinc-900 border border-red-500/50 rounded-[40px] p-8 max-w-lg w-full shadow-2xl animate-ios">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-12 h-12 bg-red-500/20 rounded-2xl flex items-center justify-center text-red-500 text-2xl">⚠️</div>
              <h1 className="text-3xl font-mango text-red-500 leading-none">Something went wrong</h1>
            </div>
            <p className="text-zinc-200 font-garet font-bold mb-4 text-lg leading-tight">{error.message}</p>
            <p className="text-zinc-500 text-[11px] font-garet mb-8 leading-relaxed">
                A component failed to render. You can try to reload the application or reset your local state if the issue persists.
            </p>
            
            <div className="flex flex-col gap-3">
                <button 
                onClick={() => window.location.reload()}
                className="w-full bg-gradient-to-br from-palette-teal to-palette-emerald text-white font-black py-5 rounded-[24px] active:scale-95 transition-all font-garet uppercase tracking-widest text-xs shadow-xl shadow-emerald-900/40"
                >
                Reload App
                </button>
                
                <div className="grid grid-cols-2 gap-3">
                    <button 
                    onClick={this.copyDebugInfo}
                    className="bg-white/5 border border-white/10 text-zinc-400 font-black py-4 rounded-[20px] uppercase tracking-widest text-[10px] active:scale-95"
                    >
                    Copy Debug Info
                    </button>
                    <button 
                    onClick={this.handleHardReset}
                    className="bg-red-500/10 border border-red-500/30 text-red-500 font-black py-4 rounded-[20px] uppercase tracking-widest text-[10px] active:scale-95"
                    >
                    Force Reset
                    </button>
                </div>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('Home');
  const [selectedOption, setSelectedOption] = useState<RunOption | null>(null);
  const [spotifyUser, setSpotifyUser] = useState<SpotifyUser | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authStatus, setAuthStatus] = useState<AuthStatus>('idle');
  const [authReady, setAuthReady] = useState(false);
  
  const [config, setConfig] = useState<AppConfig>(configStore.getConfig());
  const [homeKey, setHomeKey] = useState(0); 
  const [settingsKey, setSettingsKey] = useState(0);

  const [history, setHistory] = useState<RunRecord[]>(() => {
    try {
      const saved = localStorage.getItem('spotify_buddy_history');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  useEffect(() => {
    const unsub = configStore.subscribe(() => {
      setConfig(configStore.getConfig());
    });
    return unsub;
  }, []);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [activeTab, selectedOption]);

  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      if (event.data?.type === "SPOTIFY_AUTH_CALLBACK") {
        const { code, state, error } = event.data;
        if (error) {
          setAuthStatus('error');
          Haptics.error();
          setAuthError(`Spotify Auth Error: ${error}`);
          return;
        }
        if (code) {
          setAuthStatus('exchanging');
          try {
            await SpotifyAuth.exchangeCodeForToken(code, state);
            setAuthStatus('connected');
            Haptics.success();
            await initializeSpotify();
          } catch (err: any) {
            setAuthStatus('error');
            Haptics.error();
            setAuthError(err.message);
          }
        }
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  useEffect(() => {
    initAuth();
  }, []);

  const initAuth = async () => {
    apiLogger.logClick("auth_boot");
    const auth = authStore.loadAuth();
    
    if (!auth.tokens) {
      apiLogger.logClick("auth_done: No tokens found");
      setAuthReady(true);
      SpotifyAuth.setReady(true);
      setAuthStatus('idle');
      return;
    }

    try {
      const token = await SpotifyAuth.getValidAccessToken();
      if (token) {
        const user = await SpotifyApi.getMe();
        setSpotifyUser(user);
        setAuthStatus('connected');
        authStore.setConnected(true);
        apiLogger.logClick("auth_done: Session restored");
        ResourceResolver.resolveAll().catch(e => apiLogger.logError(`Resolver Error: ${e.message}`));
        spotifyPlayback.init();
      } else {
        setSpotifyUser(null);
        setAuthStatus('error');
        authStore.setConnected(false);
        setAuthError("Session expired or refresh failed. Please reconnect.");
        apiLogger.logClick("auth_done: Disconnected (needs refresh)");
      }
    } catch (e: any) {
      console.error("initAuth error:", e.message);
      setAuthStatus('error');
      authStore.setConnected(false);
      setAuthError(e.message || "Failed to restore Spotify connection.");
    } finally {
      setAuthReady(true);
      SpotifyAuth.setReady(true);
    }
  };

  const initializeSpotify = async () => {
    const auth = authStore.loadAuth();
    if (!auth.connected) {
      setAuthStatus('idle');
      return;
    }

    try {
      const token = await SpotifyAuth.getValidAccessToken();
      if (token) {
        const user = await SpotifyApi.getMe();
        setSpotifyUser(user);
        setAuthStatus('connected');
        ResourceResolver.resolveAll().catch(e => apiLogger.logError(`Resolver Error: ${e.message}`));
        spotifyPlayback.init();
      } else {
        setSpotifyUser(null);
        setAuthStatus('error');
        setAuthError("Session expired. Please reconnect in Settings.");
      }
    } catch (e: any) {
      apiLogger.logError(`Initialization failure: ${e.message}`);
      setSpotifyUser(null);
      setAuthStatus('error');
      setAuthError(e.message || "Failed to link with Spotify.");
    }
  };

  useEffect(() => {
    localStorage.setItem('spotify_buddy_history', JSON.stringify(history));
  }, [history]);

  const addToHistory = (result: RunResult) => {
    const newRecord: RunRecord = {
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date().toLocaleString(),
      optionName: result.optionName,
      rulesSnapshot: { ...config.rules },
      result: result
    };
    setHistory(prev => [newRecord, ...prev]);
  };

  const handleTabChange = (tab: TabType) => {
    if (tab === 'Home') {
      setSelectedOption(null);
      setHomeKey(prev => prev + 1);
      if (activeTab !== 'Home') {
        Haptics.light();
        setActiveTab('Home');
        initializeSpotify(); 
      } else {
        Haptics.medium();
      }
      return;
    }

    if (tab === 'History') {
        if (activeTab !== 'History') {
            Haptics.light();
            setActiveTab('History');
        } else {
            Haptics.medium();
        }
        return;
    }

    if (tab === 'Settings') {
      setSettingsKey(prev => prev + 1);
      if (activeTab !== 'Settings') {
        Haptics.light();
        setActiveTab('Settings');
      } else {
        Haptics.medium();
      }
      return;
    }
  };

  const renderContent = () => {
    if (!authReady) {
      return (
        <div className="fixed inset-0 z-[500] bg-black flex flex-col items-center justify-center p-8 text-center animate-in fade-in duration-700">
          <div className="w-12 h-12 border-2 border-palette-pink/30 border-t-palette-pink rounded-full animate-spin mb-6" />
          <h2 className="text-2xl font-mango text-[#A9E8DF] mb-2 opacity-80">Restoring session...</h2>
          <p className="text-zinc-600 font-garet text-[10px] uppercase tracking-widest">Validating Spotify Tokens</p>
        </div>
      );
    }

    if (authStatus === 'exchanging' || authStatus === 'waiting') {
      return (
        <div className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-3xl flex flex-col items-center justify-center p-8 text-center">
          <div className="w-16 h-16 border-4 border-palette-pink border-t-transparent rounded-full animate-spin mb-6" />
          <h2 className="text-4xl font-mango text-[#A9E8DF] mb-2">
            {authStatus === 'waiting' ? 'Authorize in Popup' : 'Finalizing Connection...'}
          </h2>
          <p className="text-zinc-500 font-garet text-sm">Please follow instructions in the Spotify window.</p>
        </div>
      );
    }

    if (selectedOption) {
      return (
        <RunView 
          option={selectedOption} 
          rules={config.rules} 
          onClose={() => {
            Haptics.light();
            setSelectedOption(null);
          }}
          onComplete={(result) => addToHistory(result)}
          onNavigateToHistory={() => {
            setActiveTab('History');
          }}
        />
      );
    }

    switch (activeTab) {
      case 'Home':
        return <HomeView key={homeKey} onSelect={(opt) => {
          Haptics.medium();
          setSelectedOption(opt);
        }} rules={config.rules} setRules={(updater: any) => {
          const nextRules = typeof updater === 'function' ? updater(config.rules) : updater;
          configStore.updateRules(nextRules);
        }} />;
      case 'History':
        return <HistoryView history={history} />;
      case 'Settings':
        return (
          <SettingsView 
            key={settingsKey}
            config={config}
            rules={config.rules} 
            setRules={(updater: any) => {
              const nextRules = typeof updater === 'function' ? updater(config.rules) : updater;
              configStore.updateRules(nextRules);
            }}
            spotifyUser={spotifyUser} 
            authError={authError} 
            authStatus={authStatus}
            setAuthStatus={setAuthStatus}
          />
        );
      default:
        return <HomeView key={homeKey} onSelect={setSelectedOption} rules={config.rules} setRules={() => {}} />;
    }
  };

  return (
    <ErrorBoundary>
      <InkBackground>
        <div className="flex flex-col h-screen text-[#A9E8DF] relative bg-transparent">
          <main id="main-content-scroller" className="flex-1 overflow-y-auto pb-20 bg-transparent">
            {renderContent()}
          </main>

          {authReady && <NowPlayingStrip />}

          {authReady && !selectedOption && (authStatus !== 'exchanging' && authStatus !== 'waiting') && (
            <nav className="fixed bottom-0 left-0 right-0 bg-black/40 backdrop-blur-xl border-t border-white/10 flex justify-around items-center h-20 pb-4 px-4 z-50">
              <TabButton 
                label="Home" 
                isActive={activeTab === 'Home'} 
                onClick={() => handleTabChange('Home')}
                icon={<svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg>}
              />
              <TabButton 
                label="History" 
                isActive={activeTab === 'History'} 
                onClick={() => handleTabChange('History')}
                icon={<svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M13 3c-4.97 0-9 4.03-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42C8.27 19.99 10.51 21 13 21c4.97 0 9-4.03 9-9s-4.03-9-9-9zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z"/></svg>}
              />
              <TabButton 
                label="Settings" 
                isActive={activeTab === 'Settings'} 
                onClick={() => handleTabChange('Settings')}
                icon={<svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38.103.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6-1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/></svg>}
              />
            </nav>
          )}
        </div>
      </InkBackground>
    </ErrorBoundary>
  );
};

interface TabButtonProps {
  label: string;
  isActive: boolean;
  onClick: () => void;
  icon: React.ReactNode;
}

const TabButton: React.FC<TabButtonProps> = ({ label, isActive, onClick, icon }) => (
  <button 
    onClick={onClick}
    className={`flex flex-col items-center gap-1.5 transition-all duration-300 ease-out transform active:scale-90 ${
      isActive 
        ? 'text-palette-pink scale-110 opacity-100' 
        : 'text-zinc-500 opacity-60 hover:opacity-100 hover:scale-105 hover:text-zinc-300'
    }`}
  >
    <div className={`transition-all duration-300 ${isActive ? 'drop-shadow-[0_0_8px_rgba(255,0,122,0.6)]' : ''}`}>
      {icon}
    </div>
    <span className={`text-[9px] font-black uppercase tracking-[0.2em] transition-colors duration-300 ${isActive ? 'text-palette-pink' : 'text-zinc-500'}`}>
      {label}
    </span>
  </button>
);

export default App;
