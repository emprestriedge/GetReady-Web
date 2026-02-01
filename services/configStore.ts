
import { AppConfig, RuleSettings, CatalogConfig, RunOption } from '../types';
import { DEFAULT_RULES, PODCAST_OPTIONS } from '../constants';
import { apiLogger } from './apiLogger';
import { authStore } from './authStore';

const CONFIG_KEY = 'gettingready.config.v1';
const LEGACY_KEYS = {
  RULES: 'spotify_buddy_rules',
  CATALOG: 'catalog.playlists.v2',
  PODCAST_PREFIX: 'spotify_buddy_id_',
  CLIENT_ID: 'spotify.clientId.v1'
};

/**
 * Sources the default Spotify Client ID from environment variables.
 * In Netlify/Local Dev, this allows zero-config startup if variables are set.
 */
const envClientId = (typeof process !== 'undefined' && process.env?.SPOTIFY_CLIENT_ID) || '';

const DEFAULT_CONFIG: AppConfig = {
  rules: DEFAULT_RULES,
  catalog: {
    shazamId: null,
    acoustic90sId: null,
    a7xArtistId: null,
    rapSources: {
      "I Love My 90s Hip‑Hop": { id: "37i9dQZF1DX186v583rmzp", type: "playlist" },
      "2Pac – Greatest Hits": { id: "1WBZyULtlANBKed7Zf9cDP", type: "album" }
    }
  },
  podcasts: PODCAST_OPTIONS,
  spotifyClientId: envClientId,
  version: 1
};

class ConfigStore {
  private config: AppConfig = DEFAULT_CONFIG;
  private listeners: (() => void)[] = [];

  constructor() {
    this.load();
  }

  private load() {
    const saved = localStorage.getItem(CONFIG_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Deep merge catalog specifically to protect hardcoded defaults from overwriting with empty states
        this.config = { 
          ...DEFAULT_CONFIG, 
          ...parsed,
          catalog: {
            ...DEFAULT_CONFIG.catalog,
            ...(parsed.catalog || {}),
            rapSources: {
              ...DEFAULT_CONFIG.catalog.rapSources,
              ...(parsed.catalog?.rapSources || {})
            }
          }
        };

        /**
         * BEHAVIOR: If the saved config is empty but we have an environment variable
         * (e.g. newly deployed on Netlify with ENV set), prioritize the ENV variable.
         */
        if (!this.config.spotifyClientId && envClientId) {
          this.config.spotifyClientId = envClientId;
          apiLogger.logClick("ConfigStore: Auto-populated Client ID from SPOTIFY_CLIENT_ID env var.");
        }
      } catch (e) {
        apiLogger.logError("ConfigStore: Failed to parse stored config.");
      }
    } else {
      // If no saved config, ensure we use the env client id
      this.config.spotifyClientId = envClientId;
    }

    // Migration logic
    this.migrate();
    this.save();
  }

  private migrate() {
    apiLogger.logClick("ConfigStore: Checking for legacy settings to migrate...");
    
    // 1. Rules Migration
    const legacyRules = localStorage.getItem(LEGACY_KEYS.RULES);
    if (legacyRules) {
      try {
        const parsed = JSON.parse(legacyRules);
        this.config.rules = { ...this.config.rules, ...parsed };
        apiLogger.logClick("ConfigStore: Migrated legacy rules.");
      } catch (e) {}
    }

    // 2. Catalog Migration
    const legacyCatalog = localStorage.getItem(LEGACY_KEYS.CATALOG);
    if (legacyCatalog) {
      try {
        const parsed = JSON.parse(legacyCatalog);
        this.config.catalog = { ...this.config.catalog, ...parsed };
        apiLogger.logClick("ConfigStore: Migrated legacy catalog.");
      } catch (e) {}
    }

    // 3. Ensure defaults are present for Rap sources
    const sourcesToInject = DEFAULT_CONFIG.catalog.rapSources;
    Object.entries(sourcesToInject).forEach(([name, source]) => {
      if (!this.config.catalog.rapSources[name]) {
        this.config.catalog.rapSources[name] = source;
        apiLogger.logClick(`ConfigStore: Re-injected default Rap source ID for "${name}"`);
      }
    });

    // 4. Spotify Client ID Migration
    const legacyClientId = localStorage.getItem(LEGACY_KEYS.CLIENT_ID);
    if (legacyClientId && !this.config.spotifyClientId) {
      this.config.spotifyClientId = legacyClientId;
      apiLogger.logClick("ConfigStore: Migrated Spotify Client ID.");
    }
  }

  private save() {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(this.config));
    // Keep authStore key in sync for services depending on it
    if (this.config.spotifyClientId) {
      authStore.saveClientId(this.config.spotifyClientId);
    }
    this.notify();
  }

  private notify() {
    this.listeners.forEach(l => l());
  }

  getConfig(): AppConfig {
    return { ...this.config };
  }

  updateConfig(patch: Partial<AppConfig>) {
    this.config = { ...this.config, ...patch };
    this.save();
  }

  updateRules(patch: Partial<RuleSettings>) {
    this.config.rules = { ...this.config.rules, ...patch };
    this.save();
  }

  updateCatalog(patch: Partial<CatalogConfig>) {
    this.config.catalog = { ...this.config.catalog, ...patch };
    this.save();
  }

  updateSpotifyClientId(id: string) {
    this.config.spotifyClientId = id;
    this.save();
  }

  updatePodcastSlot(index: number, patch: Partial<RunOption>) {
    // Fixed: changed 'next podcasts' to 'nextPodcasts' to fix syntax error and undefined variable reference.
    const nextPodcasts = [...this.config.podcasts];
    nextPodcasts[index] = { ...nextPodcasts[index], ...patch };
    this.config.podcasts = nextPodcasts;
    this.save();
  }

  resetConfig() {
    this.config = { ...DEFAULT_CONFIG };
    this.save();
  }

  subscribe(l: () => void) {
    this.listeners.push(l);
    return () => {
      this.listeners = this.listeners.filter(x => x !== l);
    };
  }
}

export const configStore = new ConfigStore();
