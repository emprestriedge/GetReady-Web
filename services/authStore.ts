export interface SpotifyTokensV1 {
  access_token: string;
  refresh_token: string;
  expires_at: number;
}

export interface AuthData {
  clientId: string | null;
  tokens: SpotifyTokensV1 | null;
  connected: boolean;
  migratedFrom?: string;
}

const TOKEN_STORAGE_KEY = 'spotify.tokens.v1';
const LEGACY_TOKEN_KEYS = ['spotifyTokens', 'spotify.tokens', 'tokens', 'auth.spotify'];

const STORAGE_KEYS = {
  CLIENT_ID: 'spotify.clientId.v1',
  CONNECTED: 'spotify.connected.v1'
};

export const authStore = {
  loadAuth: (): AuthData => {
    let migratedFrom: string | undefined;
    let tokensRaw = localStorage.getItem(TOKEN_STORAGE_KEY);
    
    // Fallback migration logic
    if (!tokensRaw) {
      for (const key of LEGACY_TOKEN_KEYS) {
        const legacy = localStorage.getItem(key);
        if (legacy) {
          try {
            const parsed = JSON.parse(legacy);
            if (parsed.access_token || parsed.refreshToken) { // basic validation
              tokensRaw = legacy;
              migratedFrom = key;
              // Migrate to new stable key but keep legacy for safety
              localStorage.setItem(TOKEN_STORAGE_KEY, legacy);
              console.log(`[AuthStore] Migrated tokens from legacy key: ${key}`);
              break;
            }
          } catch (e) {}
        }
      }
    }

    const tokens = tokensRaw ? JSON.parse(tokensRaw) : null;
    const connected = localStorage.getItem(STORAGE_KEYS.CONNECTED) === 'true';
    const clientId = localStorage.getItem(STORAGE_KEYS.CLIENT_ID);
    
    return { clientId, tokens, connected, migratedFrom };
  },

  saveTokens: (tokens: SpotifyTokensV1) => {
    localStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(tokens));
    localStorage.setItem(STORAGE_KEYS.CONNECTED, 'true');
  },

  saveClientId: (id: string) => {
    localStorage.setItem(STORAGE_KEYS.CLIENT_ID, id);
  },

  setConnected: (val: boolean) => {
    localStorage.setItem(STORAGE_KEYS.CONNECTED, val ? 'true' : 'false');
  },

  clearAuth: () => {
    // Manual logout clears active session but we keep the tokens in storage 
    // to prevent accidental data loss during dev refactors unless hard reset is used.
    localStorage.setItem(STORAGE_KEYS.CONNECTED, 'false');
  },

  hardReset: () => {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    LEGACY_TOKEN_KEYS.forEach(k => localStorage.removeItem(k));
    Object.values(STORAGE_KEYS).forEach(k => localStorage.removeItem(k));
  },

  getMetadata: () => ({
    tokenStorageKeyUsed: TOKEN_STORAGE_KEY,
    legacyKeysChecked: LEGACY_TOKEN_KEYS
  })
};