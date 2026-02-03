import { SpotifySource } from '../types';
import { configStore } from './configStore';
import { ContentIdStore } from './contentIdStore';
import { USE_MOCK_DATA } from '../constants';

export interface CatalogConfig {
  shazamId: string | null;
  acoustic90sId: string | null;
  a7xArtistId: string | null;
  rapSources: Record<string, SpotifySource | null>;
}

export const catalogStore = {
  get: (): CatalogConfig => {
    return configStore.getConfig().catalog;
  },

  set: (updates: Partial<CatalogConfig>) => {
    configStore.updateCatalog(updates);
  },

  isReady: (idKey?: string): boolean => {
    // In demo mode, we want all UI options enabled regardless of catalog linking
    if (USE_MOCK_DATA) return true;
    
    if (!idKey) return true;
    const config = configStore.getConfig();
    const catalog = config.catalog;

    if (idKey === 'shazamPlaylistId') return !!catalog.shazamId;
    if (idKey === 'acoustic90sPlaylistId') return !!catalog.acoustic90sId;
    if (idKey === 'a7xArtistId') return !!catalog.a7xArtistId;
    if (idKey === 'rapSources') {
      const sources = Object.values(catalog.rapSources || {});
      return sources.length > 0 && sources.some(s => s !== null);
    }

    // Check podcast slots
    const pod = config.podcasts.find(p => p.idKey === idKey);
    if (pod) {
      return !!ContentIdStore.get(idKey);
    }

    return true;
  }
};