import { SpotifyTokensV1 } from './authStore';
import { apiLogger } from './apiLogger';
import { authStore } from './authStore';

const GITHUB_REDIRECT_URI = 'https://emprestriedge.github.io/spotify-callback/callback.html';

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
  };
}

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
  'streaming'
].join(' ');

let refreshRequestId = 0;
let tokenFoundOnBoot = false;
let refreshAttempted = false;
let lastRefreshError: string | null = null;
let tokenSource: 'storage' | 'fresh login' = 'storage';
let authReady = false;

export const SpotifyAuth = {
  getClientId: () => authStore.loadAuth().clientId || '',

  setClientId: (id: string) => {
    authStore.saveClientId(id);
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

  loginWithPopup: async () => {
    const clientId = SpotifyAuth.getClientId();
    if (!clientId) throw new Error("Missing Spotify Client ID. Please set it in Settings.");

    const codeVerifier = SpotifyAuth.generateRandomString(64);
    const hashed = await SpotifyAuth.sha256(codeVerifier);
    const codeChallenge = SpotifyAuth.base64urlencode(hashed);
    const state = SpotifyAuth.generateRandomString(16);

    sessionStorage.setItem('spotify_pkce_verifier', codeVerifier);
    sessionStorage.setItem('spotify_auth_state', state);

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      scope: SCOPES,
      code_challenge_method: 'S256',
      code_challenge: codeChallenge,
      state: state,
      redirect_uri: GITHUB_REDIRECT_URI,
    });

    const url = `https://accounts.spotify.com/authorize?${params.toString()}`;
    const width = 500;
    const height = 700;
    const left = (window.innerWidth / 2) - (width / 2);
    const top = (window.innerHeight / 2) - (height / 2);
    
    window.open(url, 'Spotify Login', `width=${width},height=${height},top=${top},left=${left}`);
  },

  exchangeCodeForToken: async (code: string, state: string | null): Promise<SpotifyTokensV1> => {
    const clientId = SpotifyAuth.getClientId();
    const codeVerifier = sessionStorage.getItem('spotify_pkce_verifier');
    const savedState = sessionStorage.getItem('spotify_auth_state');

    if (state && savedState && state !== savedState) {
      throw new Error("State mismatch error. Security check failed.");
    }

    if (!codeVerifier) throw new Error("No code verifier found in session storage.");

    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: GITHUB_REDIRECT_URI,
        code_verifier: codeVerifier,
      }),
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error_description || "Token exchange failed");

    const tokens: SpotifyTokensV1 = {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: Date.now() + (data.expires_in * 1000),
    };

    tokenSource = 'fresh login';
    authStore.saveTokens(tokens);
    apiLogger.logClick("refresh_success: Fresh Login");
    return tokens;
  },

  getValidAccessToken: async (): Promise<string | null> => {
    const auth = authStore.loadAuth();
    if (!auth.tokens) {
      return null;
    }

    const { access_token, refresh_token, expires_at } = auth.tokens;

    // Check if token is still valid (60s buffer)
    if (Date.now() < expires_at - 60000) {
      apiLogger.logClick("token_valid");
      return access_token;
    }

    // Refresh needed
    apiLogger.logClick("refresh_start");
    refreshAttempted = true;
    const currentRequestId = ++refreshRequestId;
    
    try {
      const response = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: auth.clientId || '',
          grant_type: 'refresh_token',
          refresh_token: refresh_token,
        }),
      });

      const data = await response.json();
      
      if (currentRequestId !== refreshRequestId) return null;

      if (!response.ok) {
        lastRefreshError = data.error_description || `Status ${response.status}`;
        apiLogger.logError(`refresh_fail: ${lastRefreshError}`);
        // IMPORTANT: We do not clear authStore.tokens here. 
        // This allows the UI to show "Disconnected" while keeping the refresh_token 
        // for a manual retry or fixing transient network issues.
        return null;
      }

      const newTokens: SpotifyTokensV1 = {
        access_token: data.access_token,
        refresh_token: data.refresh_token || refresh_token,
        expires_at: Date.now() + (data.expires_in * 1000),
      };

      authStore.saveTokens(newTokens);
      apiLogger.logClick("refresh_success");
      return newTokens.access_token;
    } catch (e: any) {
      lastRefreshError = e.message;
      apiLogger.logError(`refresh_fail: Network error ${e.message}`);
      return null;
    }
  },

  getDiagnosticInfo: async (): Promise<AuthDiagnostic> => {
    const auth = authStore.loadAuth();
    const now = Date.now();
    const expiresAt = auth.tokens?.expires_at || 0;
    const diff = expiresAt - now;
    const expiresInMin = diff > 0 ? Math.round(diff / 60000) : 0;
    const meta = authStore.getMetadata();

    return {
      debug: {
        connected: auth.connected,
        clientId: auth.clientId,
        expiresAt: expiresAt ? new Date(expiresAt).toLocaleString() : null,
        tokenFoundOnBoot: !!auth.tokens,
        refreshAttempted,
        lastRefreshError,
        tokenSource,
        expiresInMin: auth.tokens ? expiresInMin : null,
        tokenStorageKeyUsed: meta.tokenStorageKeyUsed,
        migratedFromKey: auth.migratedFrom || null,
        authReady
      }
    };
  },

  setReady: (val: boolean) => {
    authReady = val;
  },

  logout: () => {
    apiLogger.logClick("Auth: Disconnecting session...");
    refreshRequestId++;
    authStore.clearAuth();
    window.location.reload();
  }
};