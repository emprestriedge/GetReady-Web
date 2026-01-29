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
import { ResourceResolver } from './services/resourceResolver';
import { apiLogger } from './services/apiLogger';
import { authStore } from './services/authStore';
import { configStore } from './services/configStore';
import { toastService, Toast } from './services/toastService';

type AuthStatus = 'idle' | 'waiting' | 'received' | 'exchanging' | 'connected' | 'error';

interface ErrorBoundaryProps {
  children?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState;
  public props: ErrorBoundaryProps;

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
          <button onClick={() => toastService.dismiss(toast.id)} className="p-2 opacity-50"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg></button>
        </div>
      ))}
    </div>
  );
};

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('Home');
  const [selectedOption, setSelectedOption] = useState<RunOption | null>(null);
  const [spotifyUser, setSpotifyUser] = useState<SpotifyUser | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authStatus, setAuthStatus] = useState<AuthStatus>('idle');
  const [authReady, setAuthReady] = useState(false);
  
  const [config, setConfig] = useState<AppConfig>(configStore.getConfig());
  const [history, setHistory] = useState<RunRecord[]>(() => {
    try {
      const saved = localStorage.getItem('spotify_buddy_history');
      return saved ? JSON.parse(saved) : [];
    } catch (e) { return []; }
  });

  useEffect(() => {
    const unsub = configStore.subscribe(() => setConfig(configStore.getConfig()));
    return unsub;
  }, []);

  const handleAuthExchange = async (code: string, state: string | null) => {
    setAuthStatus('exchanging');
    try {
      await SpotifyAuth.exchangeCodeForToken(code, state);
      setAuthStatus('connected');
      toastService.show("Spotify linked!", "success");
      return true;
    } catch (err: any) {
      setAuthStatus('error');
      setAuthError(err.message);
      toastService.show(err.message || "Auth failed", "error");
      return false;
    }
  };

  useEffect(() => {
    const initializeApp = async () => {
      apiLogger.logClick("app_init_start");
      
      const params = new URLSearchParams(window.location.search);
      const code = params.get('code');
      const state = params.get('state');

      if (code) {
        window.history.replaceState({}, document.title, window.location.pathname);
        const success = await handleAuthExchange(code, state);
        if (!success) {
          setAuthReady(true);
          return;
        }
      }

      const auth = authStore.loadAuth();
      if (!auth.tokens) {
        setAuthReady(true);
        setAuthStatus('idle');
        SpotifyAuth.setReady(true);
        return;
      }

      try {
        const token = await SpotifyAuth.getValidAccessToken();
        if (token) {
          const user = await SpotifyApi.getMe();
          setSpotifyUser(user);
          setAuthStatus('connected');
          authStore.setConnected(true);
          ResourceResolver.resolveAll().catch(() => {});
          spotifyPlayback.init();
        } else {
          setAuthStatus('idle');
          authStore.setConnected(false);
        }
      } catch (e) {
        setAuthStatus('idle');
      } finally {
        setAuthReady(true);
        SpotifyAuth.setReady(true);
      }
    };

    initializeApp();
  }, []);

  const addToHistory = (result: RunResult) => {
    const newRecord: RunRecord = {
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date().toLocaleString(),
      optionName: result.optionName,
      rulesSnapshot: { ...config.rules },
      result: result
    };
    const updatedHistory = [newRecord, ...history];
    setHistory(updatedHistory);
    localStorage.setItem('spotify_buddy_history', JSON.stringify(updatedHistory));
  };

  return (
    <ErrorBoundary>
      <InkBackground>
        <ToastOverlay />
        <div className="flex flex-col min-h-[100dvh] h-[100dvh] text-[#A9E8DF] relative overflow-hidden no-select">
          <main 
            id="main-content-scroller" 
            className="flex-1 overflow-y-auto bg-transparent scroll-smooth -webkit-overflow-scrolling-touch"
            style={{ 
              paddingTop: 'calc(env(safe-area-inset-top, 0px) + 32px)', 
              paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 140px)', 
              height: '100%' 
            }}
          >
            {!authReady ? (
              <div className="fixed inset-0 z-[500] bg-black flex flex-col items-center justify-center p-10 animate-in fade-in duration-700">
                <div className="w-16 h-16 border-[6px] border-palette-pink/10 border-t-palette-pink rounded-full animate-spin mb-10" />
                <h2 className="text-4xl font-mango text-[#D1F2EB] mb-4">Initializing</h2>
              </div>
            ) : (authStatus === 'exchanging' || authStatus === 'waiting') ? (
              <div className="fixed inset-0 z-[200] bg-black/90 backdrop-blur-3xl flex flex-col items-center justify-center p-12 text-center">
                <div className="w-24 h-24 border-[8px] border-palette-pink/10 border-t-palette-pink rounded-full animate-spin mb-12" />
                <h2 className="text-5xl font-mango text-[#D1F2EB] mb-5">{authStatus === 'waiting' ? 'Linking...' : 'Syncing'}</h2>
              </div>
            ) : selectedOption ? (
              <RunView 
                option={selectedOption} rules={config.rules} 
                onClose={() => { Haptics.light(); setSelectedOption(null); }}
                onComplete={(res) => addToHistory(res)}
                onNavigateToHistory={() => setActiveTab('History')}
              />
            ) : activeTab === 'Home' ? (
              <HomeView onSelect={(opt) => setSelectedOption(opt)} rules={config.rules} setRules={(u: any) => configStore.updateRules(typeof u === 'function' ? u(config.rules) : u)} />
            ) : activeTab === 'History' ? (
              <HistoryView history={history} />
            ) : (
              <SettingsView 
                config={config} rules={config.rules} 
                setRules={(u: any) => configStore.updateRules(typeof u === 'function' ? u(config.rules) : u)}
                spotifyUser={spotifyUser} authError={authError} authStatus={authStatus} setAuthStatus={setAuthStatus}
              />
            )}
          </main>

          {authReady && <NowPlayingStrip />}

          {authReady && !selectedOption && (authStatus !== 'exchanging' && authStatus !== 'waiting') && (
            <nav className="fixed bottom-0 left-0 right-0 bg-black/80 backdrop-blur-3xl border-t border-white/10 flex justify-around items-center z-50 px-8" style={{ height: 'calc(env(safe-area-inset-bottom, 0px) + 40px)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
              <TabButton label="Home" isActive={activeTab === 'Home'} onClick={() => setActiveTab('Home')} icon={<svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg>} />
              <TabButton label="Logs" isActive={activeTab === 'History'} onClick={() => setActiveTab('History')} icon={<svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M13 3c-4.97 0-9 4.03-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42C8.27 19.99 10.51 21 13 21c4.97 0 9-4.03 9-9s-4.03-9-9-9zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z"/></svg>} />
              <TabButton label="Config" isActive={activeTab === 'Settings'} onClick={() => setActiveTab('Settings')} icon={<svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38.103.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6-1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/></svg>} />
            </nav>
          )}
        </div>
      </InkBackground>
    </ErrorBoundary>
  );
};

const TabButton: React.FC<{ label: string; isActive: boolean; onClick: () => void; icon: React.ReactNode; }> = ({ label, isActive, onClick, icon }) => (
  <button onClick={onClick} className={`flex-1 flex flex-col items-center justify-center gap-0.5 transition-all transform active:scale-95 ${isActive ? 'text-palette-pink' : 'text-zinc-600 opacity-60'}`}>
    {icon}
    <span className={`text-[11px] font-bold uppercase tracking-wider ${isActive ? 'text-palette-pink' : 'text-zinc-600'}`}>{label}</span>
  </button>
);

export default App;