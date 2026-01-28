import { SpotifyDataService } from './spotifyDataService';
import { configStore } from './configStore';
import { apiLogger } from './apiLogger';
import { RAP_SOURCE_PLAYLIST_NAMES } from '../constants';
import { SpotifyApi } from './spotifyApi';
import { SpotifySource } from '../types';

export const ResourceResolver = {
  normalizeName: (name: string): string => {
    return name
      .toLowerCase()
      .replace(/[\u201C\u201D]/g, '"') 
      .replace(/[\u2018\u2019]/g, "'") 
      .replace(/\s+/g, ' ')           
      .trim();
  },

  fetchAllUserPlaylists: async (): Promise<any[]> => {
    apiLogger.logClick("Resolver: Starting exhaustive library scan...");
    let allPlaylists: any[] = [];
    let url = '/me/playlists?limit=50';
    try {
      while (url) {
        const endpoint = url.includes('api.spotify.com') ? url.split('v1')[1] : url;
        const data = await SpotifyApi.request(endpoint);
        const items = data?.items ?? [];
        allPlaylists = [...allPlaylists, ...items];
        url = data?.next;
      }
    } catch (e: any) {
      apiLogger.logError(`Resolver: Exhaustive fetch failed: ${e.message}`);
    }
    return Array.from(new Map(allPlaylists.map(p => [p.id, p])).values());
  },

  resolveAll: async () => {
    apiLogger.logClick("Resolver: Syncing catalog links...");
    const appConfig = configStore.getConfig();
    const catalog = { ...appConfig.catalog };
    let changed = false;

    const userPlaylists = await ResourceResolver.fetchAllUserPlaylists();
    const findInLibrary = (targetName: string) => {
      const normalizedTarget = ResourceResolver.normalizeName(targetName);
      return userPlaylists.find(p => ResourceResolver.normalizeName(p.name) === normalizedTarget)?.id || null;
    };

    // 1. Core Music Playlists
    if (!catalog.shazamId) {
      const id = findInLibrary('My Shazam Tracks');
      if (id) { catalog.shazamId = id; changed = true; }
    }
    if (!catalog.acoustic90sId) {
      const id = findInLibrary('90s Acoustic Alternative Rock');
      if (id) { catalog.acoustic90sId = id; changed = true; }
    }

    // 2. Core Artists
    if (!catalog.a7xArtistId) {
      const id = await SpotifyDataService.robustResolveArtist("Avenged Sevenfold");
      if (id) { catalog.a7xArtistId = id; changed = true; }
    }

    // 3. Rap Radio Sources
    const currentRapSources = { ...catalog.rapSources };
    for (const name of RAP_SOURCE_PLAYLIST_NAMES) {
      if (!currentRapSources[name]) {
        const id = findInLibrary(name);
        if (id) {
          currentRapSources[name] = { id, type: 'playlist' };
          changed = true;
          apiLogger.logClick(`Resolver: Auto-linked Rap source ${name}`);
        }
      }
    }

    if (changed) {
      configStore.updateCatalog({ 
        shazamId: catalog.shazamId, 
        acoustic90sId: catalog.acoustic90sId,
        a7xArtistId: catalog.a7xArtistId,
        rapSources: currentRapSources
      });
    }
    
    apiLogger.logClick("Resolver: Catalog sync complete.");
    return configStore.getConfig().catalog;
  }
};