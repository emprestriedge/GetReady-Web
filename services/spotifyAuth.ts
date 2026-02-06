import { SpotifyTokensV1 } from './authStore';
import { apiLogger } from './apiLogger';
import { authStore } from './authStore';

export interface AuthDiagnostic {
  debug: {
    connected: boolean;
    clientId: string | null;
    expiresAt: string | null;
    tokenFoundOnBoot: boolean;
    refreshAttempted: boolean;
    lastRefreshError: string | null;
    tokenSource: 'storage' | 'fresh login';
    expiresInMin: number | null;
    tokenStorageKeyUsed: string;
    migratedFromKey: string | null;
    authReady: boolean;
    currentRedirectUri: string;
  };
}

// SCOPE VERSIONING: Bumped to v3 to ensure Gems playlist permissions are active
const SCOPE_VERSION = 'v3'; 

export const SCOPES = [
  'user-read-private',
  'user-read-email',
  'user-library-read',
  'user-top-read',
  'playlist-read-private',
  'playlist-read-collaborative',
  'playlist-modify-public',
  'playlist-modify-private',
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing',
  'streaming'
].join(' ');

let refreshRequestId = 0;
let refreshAttempted = false;
let lastRefreshError: string | null = null;
let tokenSource: 'storage' | 'fresh login' = 'storage';
let authReady = false;

export const SpotifyAuth = {
  getClientId: () => {
    const auth = authStore.loadAuth();
    if (auth.clientId) return auth.clientId;
    return '';
  },

  setClientId: (id: string) => {
    authStore.saveClientId(id);
  },

  getRedirectUri: () => {
    const origin = window.location.origin;
    return origin.endsWith('/') ? origin : `${origin}/`;
  },

  generateRandomString: (length: number) => {
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const values = crypto.getRandomValues(new Uint8Array(length));
    return Array.from(values).reduce((acc, x) => acc + possible[x % possible.length], "");
  },

  sha256: async (plain: string) => {
    const encoder = new TextEncoder();
    const data = encoder.encode(plain);
    return window.crypto.subtle.digest('SHA-256', data);
  },

  base64urlencode: (a: ArrayBuffer) => {
    return btoa(String.fromCharCode.apply(null, Array.from(new Uint8Array(a))))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  },

  login: async () => {
    const clientId = SpotifyAuth.getClientId();
    if (!clientId) {
      throw new Error("Missing Spotify Client ID. Set it in Settings.");
    }

    const codeVerifier = SpotifyAuth.generateRandomString(64);
    const hashed = await SpotifyAuth.sha256(codeVerifier);
    const codeChallenge = SpotifyAuth.base64urlencode(hashed);
    const state = SpotifyAuth.generateRandomString(16);
    const redirectUri = SpotifyAuth.getRedirectUri();

    localStorage.setItem('spotify_pkce_verifier', codeVerifier);
    localStorage.setItem('spotify_auth_state', state);
    localStorage.setItem('spotify_scope_version', SCOPE_VERSION);

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      scope: SCOPES,
      code_challenge_method: 'S256',
      code_challenge: codeChallenge,
      state: state,
      redirect_uri: redirectUri,
    });

    const url = `https://accounts.spotify.com/authorize?${params.toString()}`;
    apiLogger.logClick(`Auth: Initiating full-page redirect (Scope: ${SCOPE_VERSION})`);
    window.location.href = url;
  },

  exchangeCodeForToken: async (code: string, state: string | null): Promise<SpotifyTokensV1> => {
    const clientId = SpotifyAuth.getClientId();
    const codeVerifier = localStorage.getItem('spotify_pkce_verifier');
    const savedState = localStorage.getItem('spotify_auth_state');

    if (state && savedState && state !== savedState) {
      throw new Error("Security check failed: State mismatch.");
    }

    if (!codeVerifier) {
      throw new Error("Login failed: Security key missing. Try again.");
    }

    const redirectUri = SpotifyAuth.getRedirectUri();

    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: redirectUri,
        code_verifier: codeVerifier,
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error_description || "Token exchange failed");
    }

    const tokens: SpotifyTokensV1 = {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: Date.now() + (data.expires_in * 1000),
    };

    tokenSource = 'fresh login';
    authStore.saveTokens(tokens);
    
    localStorage.removeItem('spotify_pkce_verifier');
    localStorage.removeItem('spotify_auth_state');
    
    return tokens;
  },

  getValidAccessToken: async (): Promise<string | null> => {
    // FORCE LOGOUT if scope version changed
    const currentVer = localStorage.getItem('spotify_scope_version');
    if (currentVer !== SCOPE_VERSION && localStorage.getItem('spotify.connected.v1') === 'true') {
      console.warn("Auth: Scope update required. Forcing re-login.");
      SpotifyAuth.logout();
      return null;
    }

    const auth = authStore.loadAuth();
    if (!auth.tokens) return null;

    const { access_token, refresh_token, expires_at } = auth.tokens;
    if (Date.now() < expires_at - 60000) return access_token;

    const currentRequestId = ++refreshRequestId;
    
    try {
      const response = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: auth.clientId || SpotifyAuth.getClientId(),
          grant_type: 'refresh_token',
          refresh_token: refresh_token,
        }),
      });

      const data = await response.json();
      if (currentRequestId !== refreshRequestId) return null;

      if (!response.ok) {
        lastRefreshError = data.error_description || `Status ${response.status}`;
        return null;
      }

      const newTokens: SpotifyTokensV1 = {
        access_token: data.access_token,
        refresh_token: data.refresh_token || refresh_token,
        expires_at: Date.now() + (data.expires_in * 1000),
      };

      authStore.saveTokens(newTokens);
      return newTokens.access_token;
    } catch (e: any) {
      lastRefreshError = e.message;
      return null;
    }
  },

  getDiagnosticInfo: async (): Promise<AuthDiagnostic> => {
    const auth = authStore.loadAuth();
    const expiresAt = auth.tokens?.expires_at || 0;
    const now = Date.now();
    const expiresInMin = expiresAt > now ? Math.round((expiresAt - now) / 60000) : 0;

    return {
      debug: {
        connected: auth.connected,
        clientId: auth.clientId || SpotifyAuth.getClientId(),
        expiresAt: expiresAt ? new Date(expiresAt).toLocaleString() : null,
        tokenFoundOnBoot: !!auth.tokens,
        refreshAttempted,
        lastRefreshError,
        tokenSource,
        expiresInMin,
        tokenStorageKeyUsed: authStore.getMetadata().tokenStorageKeyUsed,
        migratedFromKey: auth.migratedFrom || null,
        authReady,
        currentRedirectUri: SpotifyAuth.getRedirectUri()
      }
    };
  },

  setReady: (val: boolean) => { authReady = val; },
  logout: () => { authStore.clearAuth(); window.location.reload(); },
  hardReset: () => { authStore.hardReset(); }
};