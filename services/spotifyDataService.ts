import { SpotifyApi } from './spotifyApi';
import { SpotifyTrack, SpotifyEpisode, SpotifyArtist } from '../types';
import { apiLogger } from './apiLogger';

/**
 * normalizeLimit - Ensures limit is an integer between 1 and maxValue.
 * Fixes [HTTP 400] Invalid limit errors from Spotify.
 */
const normalizeLimit = (endpoint: string, input: any, defaultValue: number, maxValue: number): number => {
  let val = Number(input);
  if (isNaN(val)) val = defaultValue;
  val = Math.floor(val);
  const finalVal = Math.min(maxValue, Math.max(1, val));
  
  apiLogger.logClick(`Limit Norm [${endpoint}]: requested ${input} -> normalized ${finalVal}`);
  
  return finalVal;
};

export const SpotifyDataService = {
  getUserCountry: async (): Promise<string> => {
    try {
      const me = await SpotifyApi.getMe();
      return me.country || 'US';
    } catch (e) {
      return 'US';
    }
  },

  getLikedTracks: async (limit = 20, offset = 0): Promise<SpotifyTrack[]> => {
    const nLimit = normalizeLimit('/me/tracks', limit, 20, 50);
    const data = await SpotifyApi.request(`/me/tracks?limit=${nLimit}&offset=${offset}`);
    return data.items.map((item: any) => item.track);
  },

  getLikedTracksIds: async (limit = 50): Promise<Set<string>> => {
    const nLimit = normalizeLimit('/me/tracks', limit, 50, 50);
    const data = await SpotifyApi.request(`/me/tracks?limit=${nLimit}`);
    return new Set(data.items.map((item: any) => item.track.id));
  },

  checkTracksSaved: async (trackIds: string[]): Promise<boolean[]> => {
    if (trackIds.length === 0) return [];
    return SpotifyApi.request(`/me/tracks/contains?ids=${trackIds.join(',')}`);
  },

  getPlaylistTracks: async (playlistId: string, limit = 50, offset = 0): Promise<SpotifyTrack[]> => {
    if (!playlistId || playlistId === "Unlinked") {
       throw new Error("Playlist ID is missing or unlinked.");
    }

    try {
      const nLimit = normalizeLimit(`/playlists/${playlistId}/tracks`, limit, 50, 100);
      const data = await SpotifyApi.request(`/playlists/${playlistId}/tracks?limit=${nLimit}&offset=${offset}`);
      return data.items.map((item: any) => item.track).filter((t: any) => t !== null);
    } catch (e: any) {
      if (e.status === 404) {
        apiLogger.logError(`Playlist ${playlistId} not found (404).`);
      }
      throw e;
    }
  },

  /**
   * Fetches album tracks and maps them to the full SpotifyTrack structure
   * by re-attaching the album info (which is missing in simple track objects).
   */
  getAlbumTracksFull: async (albumId: string): Promise<SpotifyTrack[]> => {
    const album = await SpotifyDataService.getAlbumById(albumId);
    const data = await SpotifyApi.request(`/albums/${albumId}/tracks?limit=50`);
    
    return data.items.map((t: any) => ({
      ...t,
      album: {
        id: album.id,
        name: album.name,
        images: album.images,
        release_date: album.release_date
      }
    }));
  },

  getPlaylistTracksBulk: async (playlistId: string, targetCount = 100): Promise<SpotifyTrack[]> => {
    let allTracks: SpotifyTrack[] = [];
    let offset = 0;
    const limit = 100;

    while (allTracks.length < targetCount) {
      const page = await SpotifyDataService.getPlaylistTracks(playlistId, limit, offset);
      if (page.length === 0) break;
      allTracks = [...allTracks, ...page];
      offset += limit;
      if (page.length < limit) break;
    }

    return allTracks.slice(0, targetCount);
  },

  createPlaylist: async (userId: string, name: string, description: string): Promise<any> => {
    return SpotifyApi.request(`/users/${userId}/playlists`, {
      method: 'POST',
      body: JSON.stringify({ name, description, public: false })
    });
  },

  replacePlaylistTracks: async (playlistId: string, uris: string[]): Promise<any> => {
    return SpotifyApi.request(`/playlists/${playlistId}/tracks`, {
      method: 'PUT',
      body: JSON.stringify({ uris })
    });
  },

  getArtistById: async (artistId: string): Promise<SpotifyArtist> => {
    return SpotifyApi.request(`/artists/${artistId}`);
  },

  searchArtistByName: async (name: string): Promise<SpotifyArtist | null> => {
    const data = await SpotifyApi.request(`/search?q=${encodeURIComponent(name)}&type=artist&limit=1`);
    return data?.artists?.items?.[0] || null;
  },

  /**
   * Robust artist resolver with fallback queries and diagnostic logging.
   */
  robustResolveArtist: async (name: string): Promise<string | null> => {
    const cacheKey = `resolved_artist_id_${name.toLowerCase().replace(/\s+/g, '_')}`;
    const cachedId = localStorage.getItem(cacheKey);
    if (cachedId) {
      apiLogger.logClick(`Resolver: Cache HIT for "${name}" -> ${cachedId}`);
      return cachedId;
    }

    const queries = [name];
    if (name.toLowerCase() === "avenged sevenfold") {
      queries.push("A7X", "Avenged Sevenfold artist");
    } else {
      queries.push(`${name} artist`);
    }

    for (const q of queries) {
      apiLogger.logClick(`Resolver: Searching artist with query: "${q}"`);
      try {
        const data = await SpotifyApi.request(`/search?q=${encodeURIComponent(q)}&type=artist&limit=5`);
        const items = data?.artists?.items || [];
        
        if (items.length === 0) {
          apiLogger.logClick(`Resolver: NO_RESULTS for query "${q}"`);
          continue;
        }

        // Log top 3 for diagnostics
        const logData = items.slice(0, 3).map((a: any) => `${a.name} (id:${a.id}, pop:${a.popularity})`);
        apiLogger.logClick(`Resolver: Top results for "${q}": ${logData.join(' | ')}`);

        // Prioritize exact case-insensitive match
        const exactMatch = items.find((a: any) => a.name.toLowerCase() === name.toLowerCase());
        const best = exactMatch || items[0];
        
        apiLogger.logClick(`Resolver: Selected match: ${best.name} (${best.id})`);
        localStorage.setItem(cacheKey, best.id);
        return best.id;
      } catch (e: any) {
        apiLogger.logError(`Resolver: Error searching "${q}": ${e.message}`);
      }
    }

    apiLogger.logError(`Resolver: FAILED to resolve any results for "${name}" after all attempts.`);
    return null;
  },

  getRelatedArtists: async (artistId: string): Promise<SpotifyArtist[]> => {
    const data = await SpotifyApi.request(`/artists/${artistId}/related-artists`);
    return data.artists || [];
  },

  searchTracks: async (query: string, limit = 50, offset = 0): Promise<SpotifyTrack[]> => {
    const nLimit = normalizeLimit('/search', limit, 50, 50);
    const data = await SpotifyApi.request(`/search?q=${encodeURIComponent(query)}&type=track&limit=${nLimit}&offset=${offset}`);
    return data?.tracks?.items || [];
  },

  resolveArtistByExactName: async (name: string): Promise<{ artist: SpotifyArtist | null; debug: any }> => {
    const q = `artist:${name}`;
    const url = `/search?q=${encodeURIComponent(q)}&type=artist&limit=10`;
    const data = await SpotifyApi.request(url);
    const items = data?.artists?.items ?? [];
    
    const debug = {
      url,
      count: items.length,
      firstFive: items.slice(0, 5).map((a: any) => a.name)
    };

    if (items.length === 0) return { artist: null, debug };

    const exactMatches = items.filter((a: any) => a.name.toLowerCase() === name.toLowerCase());
    if (exactMatches.length > 0) {
      exactMatches.sort((a: any, b: any) => (b.followers?.total || 0) - (a.followers?.total || 0));
      return { artist: exactMatches[0], debug };
    }

    return { artist: items[0], debug };
  },

  getArtistTopTracks: async (artistId: string, market = "US"): Promise<SpotifyTrack[]> => {
    const data = await SpotifyApi.request(`/artists/${artistId}/top-tracks?market=${market}`);
    return data.tracks;
  },

  getArtistAlbums: async (artistId: string, includeGroups = "album", limit = 50): Promise<any[]> => {
    const nLimit = normalizeLimit(`/artists/${artistId}/albums`, limit, 50, 50);
    let albums: any[] = [];
    let offset = 0;
    while (true) {
      const data = await SpotifyApi.request(`/artists/${artistId}/albums?include_groups=${includeGroups}&market=US&limit=${nLimit}&offset=${offset}`);
      albums = [...albums, ...data.items];
      if (data.items.length < nLimit) break;
      offset += nLimit;
    }
    return albums;
  },

  getAlbumTracks: async (albumId: string): Promise<SpotifyTrack[]> => {
    const data = await SpotifyApi.request(`/albums/${albumId}/tracks?limit=50`);
    return data.items;
  },

  getDeepCuts: async (artistId: string, targetCount = 35): Promise<{ tracks: SpotifyTrack[]; debug: any }> => {
    apiLogger.logClick(`Starting Deep Cuts crawl for artist: ${artistId}`);
    
    const normalizeAlbumName = (name: string) => {
      return name.toLowerCase()
        .replace(/\s*[\(\[].*?[\)\]]\s*/g, ' ')
        .replace(/\b(deluxe|remaster(ed)?|anniversary|edition|expanded)\b/gi, '')
        .replace(/\s+/g, ' ')
        .trim();
    };

    const albumMap = new Map<string, any>();
    const mainAlbumsRaw = await SpotifyDataService.getArtistAlbums(artistId, "album");
    mainAlbumsRaw.forEach(album => {
      const norm = normalizeAlbumName(album.name);
      const existing = albumMap.get(norm);
      if (!existing || new Date(album.release_date) > new Date(existing.release_date)) {
        albumMap.set(norm, album);
      }
    });

    const buildTrackPool = async (albums: any[]) => {
      let pool: SpotifyTrack[] = [];
      for (const album of albums) {
        try {
          const tracks = await SpotifyDataService.getAlbumTracks(album.id);
          const tracksWithAlbum = tracks.map(t => ({
            ...t,
            album: { name: album.name, id: album.id, images: album.images, release_date: album.release_date }
          }));
          pool = [...pool, ...tracksWithAlbum];
        } catch (e) {
          apiLogger.logError(`Failed to fetch tracks for album ${album.id}`);
        }
      }
      const uniquePool: SpotifyTrack[] = [];
      const seenUris = new Set<string>();
      pool.forEach(t => {
        if (!seenUris.has(t.uri)) {
          uniquePool.push(t);
          seenUris.add(t.uri);
        }
      });
      return uniquePool;
    };

    let trackPool = await buildTrackPool(Array.from(albumMap.values()));
    
    if (trackPool.length < 200) {
      const singlesRaw = await SpotifyDataService.getArtistAlbums(artistId, "single");
      singlesRaw.forEach(album => {
        const norm = normalizeAlbumName(album.name);
        if (!albumMap.has(norm)) albumMap.set(norm, album);
      });
      trackPool = await buildTrackPool(Array.from(albumMap.values()));
    }

    const shuffled = [...trackPool].sort(() => Math.random() - 0.5);
    const selected: SpotifyTrack[] = [];
    const albumCounts = new Map<string, number>();
    let lastAlbumId = '';

    for (const track of shuffled) {
      if (selected.length >= targetCount) break;
      const albumId = track.album.id;
      const countForAlbum = albumCounts.get(albumId) || 0;
      if (countForAlbum < 3 && albumId !== lastAlbumId) {
        selected.push(track);
        albumCounts.set(albumId, countForAlbum + 1);
        lastAlbumId = albumId;
      }
    }

    return {
      tracks: selected,
      debug: { albumCount: albumMap.size, poolSize: trackPool.length, selectedSize: selected.length, mode: 'Deep Cuts' }
    };
  },

  getTopArtists: async (timeRange = "medium_term", limit = 10): Promise<SpotifyArtist[]> => {
    const nLimit = normalizeLimit('/me/top/artists', limit, 10, 50);
    const data = await SpotifyApi.request(`/me/top/artists?time_range=${timeRange}&limit=${nLimit}`);
    return data.items;
  },

  getTopTracks: async (timeRange = "medium_term", limit = 10): Promise<SpotifyTrack[]> => {
    const nLimit = normalizeLimit('/me/top/tracks', limit, 10, 50);
    const data = await SpotifyApi.request(`/me/top/tracks?time_range=${timeRange}&limit=${nLimit}`);
    return data.items;
  },

  getRecommendations: async (seedArtists: string[], seedTracks: string[], limit = 20, market = "US", seedGenres: string[] = [], targets: any = {}): Promise<SpotifyTrack[]> => {
    const validArtists = seedArtists.filter(id => id && id.length > 5);
    const validTracks = seedTracks.filter(id => id && id.length > 5);
    const validGenres = seedGenres.filter(g => g && g.length > 0);

    const totalSeeds = validArtists.length + validTracks.length + validGenres.length;
    if (totalSeeds === 0) {
      apiLogger.logError("Recommendations failed: No valid seeds provided.");
      return [];
    }

    const finalArtists = validArtists.slice(0, 5);
    const finalTracks = validTracks.slice(0, 5 - finalArtists.length);
    const finalGenres = validGenres.filter(g => g && g.length > 0).slice(0, 5 - finalArtists.length - finalTracks.length);

    const nLimit = normalizeLimit('/recommendations', limit, 20, 100);
    const params = new URLSearchParams({
      limit: nLimit.toString(),
      market,
      ...targets
    });
    
    if (finalArtists.length > 0) params.append('seed_artists', finalArtists.join(','));
    if (finalTracks.length > 0) params.append('seed_tracks', finalTracks.join(','));
    if (finalGenres.length > 0) params.append('seed_genres', finalGenres.join(','));
    
    try {
      const data = await SpotifyApi.request(`/recommendations?${params.toString()}`);
      return data.tracks || [];
    } catch (e: any) {
      apiLogger.logError(`Recommendations Request failed: ${e.message}`);
      return [];
    }
  },

  searchShowByName: async (name: string): Promise<any | null> => {
    const data = await SpotifyApi.request(`/search?q=${encodeURIComponent(name)}&type=show&limit=1`);
    return data?.shows?.items?.[0] || null;
  },

  searchShows: async (query: string, limit = 5): Promise<any[]> => {
    const data = await SpotifyApi.request(`/search?q=${encodeURIComponent(query)}&type=show&limit=${limit}`);
    return data?.shows?.items || [];
  },

  getShowEpisodes: async (showId: string, limit = 50, market?: string): Promise<SpotifyEpisode[]> => {
    const nLimit = normalizeLimit(`/shows/${showId}/episodes`, limit, 5, 50);
    let url = `/shows/${showId}/episodes?limit=${nLimit}`;
    if (market && market.length === 2) url += `&market=${market}`;
    const data = await SpotifyApi.request(url);
    return data.items;
  },

  getUserPlaylists: async (limit = 50, offset = 0): Promise<any> => {
    const nLimit = normalizeLimit('/me/playlists', limit, 50, 50);
    return SpotifyApi.request(`/me/playlists?limit=${nLimit}&offset=${offset}`);
  },

  getPlaylistById: async (playlistId: string): Promise<any> => {
    return SpotifyApi.request(`/playlists/${playlistId}`);
  },

  getAlbumById: async (albumId: string): Promise<any> => {
    return SpotifyApi.request(`/albums/${albumId}`);
  },

  resolvePlaylistByName: async (targetName: string): Promise<string | null> => {
    let offset = 0;
    const limit = 50;
    while (true) {
      const data = await SpotifyDataService.getUserPlaylists(limit, offset);
      const items = data?.items ?? [];
      const match = items.find((p: any) => p.name.toLowerCase() === targetName.toLowerCase());
      if (match) return match.id;
      if (items.length < limit) break;
      offset += limit;
    }
    return null;
  }
};