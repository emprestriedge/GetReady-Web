import { SpotifyApi } from './spotifyApi';
import { SpotifyTrack, SpotifyEpisode, SpotifyArtist } from '../types';
import { apiLogger } from './apiLogger';
import { USE_MOCK_DATA, MOCK_TRACKS } from '../constants';
import { toastService } from './toastService';

/**
 * shuffleArray - Fisher-Yates shuffle algorithm for high-quality randomization.
 */
const shuffleArray = <T>(array: T[]): T[] => {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};

/**
 * normalizeLimit - Ensures limit is an integer between 1 and maxValue.
 * Increased maxValue to allow for larger internal bulk requests.
 */
const normalizeLimit = (endpoint: string, input: any, defaultValue: number, maxValue: number): number => {
  let val = Number(input);
  if (isNaN(val)) val = defaultValue;
  val = Math.floor(val);
  // Relaxed from 50 to 500 to support larger internal fetches
  const finalVal = Math.min(maxValue, Math.max(1, val));
  
  apiLogger.logClick(`Limit Norm [${endpoint}]: requested ${input} -> normalized ${finalVal}`);
  
  return finalVal;
};

// Internal cache for the Gems playlist ID
let cachedGemsPlaylistId: string | null = null;

export const SpotifyDataService = {
  getUserCountry: async (): Promise<string> => {
    try {
      const me = await SpotifyApi.getMe();
      return me.country || 'US';
    } catch (e) {
      return 'US';
    }
  },

  /**
   * getLikedTracks - Now implements deep pagination to fetch up to 300 tracks.
   */
  getLikedTracks: async (targetLimit = 300): Promise<SpotifyTrack[]> => {
    if (USE_MOCK_DATA) {
      const mockPool = MOCK_TRACKS.map(t => ({
        id: t.uri.split(':').pop() || '',
        name: t.title,
        uri: t.uri,
        artists: [{ name: t.artist, id: 'mock_artist' }],
        album: { name: t.album || 'Mock Album', id: 'mock_album', images: [{ url: t.imageUrl || '' }] },
        duration_ms: t.durationMs
      })) as SpotifyTrack[];
      return shuffleArray(mockPool).slice(0, targetLimit);
    }

    let allTracks: SpotifyTrack[] = [];
    let currentOffset = 0;
    const pageSize = 50;
    const offsetsUsed: number[] = [];
    const MAX_POOL = 300; // Hard cap for variety/performance balance

    apiLogger.logClick(`Engine [FETCH]: Gathering Liked Songs (target: ${targetLimit})`);

    try {
      while (allTracks.length < Math.min(targetLimit, MAX_POOL)) {
        const remaining = Math.min(targetLimit, MAX_POOL) - allTracks.length;
        const nLimit = Math.min(pageSize, remaining);
        
        offsetsUsed.push(currentOffset);
        const data = await SpotifyApi.request(`/me/tracks?limit=${nLimit}&offset=${currentOffset}`);
        
        if (!data.items || data.items.length === 0) break;
        
        const pageTracks = data.items.map((item: any) => item.track).filter((t: any) => t !== null);
        allTracks = [...allTracks, ...pageTracks];
        
        if (pageTracks.length < nLimit) break;
        currentOffset += nLimit;
      }

      apiLogger.logClick(`Liked Songs pool size: ${allTracks.length} (pages: offsets ${offsetsUsed.join(', ')})`);
      
      // Return shuffled to ensure high variety for the caller
      return shuffleArray(allTracks);
    } catch (err: any) {
      apiLogger.logError(`Failed to fetch Liked Songs pool: ${err.message}`);
      throw err;
    }
  },

  getLikedTracksIds: async (limit = 50): Promise<Set<string>> => {
    if (USE_MOCK_DATA) {
      return new Set(MOCK_TRACKS.slice(0, limit).map(t => t.uri.split(':').pop() || ''));
    }
    const nLimit = normalizeLimit('/me/tracks', limit, 50, 50);
    const data = await SpotifyApi.request(`/me/tracks?limit=${nLimit}`);
    return new Set(data.items.map((item: any) => item.track.id));
  },

  /**
   * Syncs "Liked" status with Spotify Library.
   */
  setTrackLiked: async (trackId: string, liked: boolean): Promise<void> => {
    const method = liked ? 'PUT' : 'DELETE';
    await SpotifyApi.request(`/me/tracks?ids=${trackId}`, { method });
    apiLogger.logClick(`Library: ${liked ? 'Saved' : 'Removed'} track ${trackId}`);
  },

  /**
   * Manages the "GetReady Gems" playlist.
   */
  ensureGemsPlaylist: async (): Promise<string> => {
    if (cachedGemsPlaylistId) return cachedGemsPlaylistId;

    const me = await SpotifyApi.getMe();
    const existingId = await SpotifyDataService.resolvePlaylistByName("GetReady Gems");
    
    if (existingId) {
      cachedGemsPlaylistId = existingId;
      return existingId;
    }

    const newPlaylist = await SpotifyDataService.createPlaylist(
      me.id, 
      "GetReady Gems", 
      "A curated collection of your top-tier finds from GetReady syncs."
    );
    cachedGemsPlaylistId = newPlaylist.id;
    return newPlaylist.id;
  },

  addTrackToGems: async (trackUri: string): Promise<void> => {
    const playlistId = await SpotifyDataService.ensureGemsPlaylist();
    await SpotifyApi.request(`/playlists/${playlistId}/tracks`, {
      method: 'POST',
      body: JSON.stringify({ uris: [trackUri] })
    });
    apiLogger.logClick(`Gems: Added ${trackUri} to GetReady Gems`);
  },

  removeTrackFromGems: async (trackUri: string): Promise<void> => {
    const playlistId = await SpotifyDataService.ensureGemsPlaylist();
    await SpotifyApi.request(`/playlists/${playlistId}/tracks`, {
      method: 'DELETE',
      body: JSON.stringify({ tracks: [{ uri: trackUri }] })
    });
    apiLogger.logClick(`Gems: Removed ${trackUri} from GetReady Gems`);
  },

  checkTracksSaved: async (trackIds: string[]): Promise<boolean[]> => {
    if (trackIds.length === 0) return [];
    return SpotifyApi.request(`/me/tracks/contains?ids=${trackIds.join(',')}`);
  },

  getPlaylistTracks: async (playlistInput: string, limit = 50, offset = 0): Promise<SpotifyTrack[]> => {
    if (USE_MOCK_DATA) {
      const mockPool = MOCK_TRACKS.map(t => ({
        id: t.uri.split(':').pop() || '',
        name: t.title,
        uri: t.uri,
        artists: [{ name: t.artist, id: 'mock_artist' }],
        album: { 
          name: t.album || 'Mock Album', 
          id: 'mock_album', 
          images: [{ url: t.imageUrl || '' }],
          release_date: "1999-01-01" 
        },
        duration_ms: t.durationMs
      })) as SpotifyTrack[];
      return shuffleArray(mockPool).slice(0, limit);
    }

    if (!playlistInput || playlistInput === "Unlinked") {
       throw new Error("Playlist ID is missing or unlinked.");
    }

    const playlistId = playlistInput.trim();

    // PROMPT REQUIREMENT: Diagnostic logging for playlist metadata
    apiLogger.logClick(`Fetching playlist metadata for id=${playlistId} sourceType=playlist trigger=getPlaylistTracks`);

    // Safety check: Skip if id is "Liked Songs" identifier to prevent stray 404s
    if (playlistId === 'liked_songs' || playlistId === 'me') {
       apiLogger.logError(`Blocked invalid playlist metadata fetch for id=${playlistId} - Redirecting to Library`);
       return SpotifyDataService.getLikedTracks(limit);
    }

    try {
      const nLimit = normalizeLimit(`/playlists/${playlistId}/tracks`, limit, 50, 100);
      const data = await SpotifyApi.request(`/playlists/${playlistId}/tracks?limit=${nLimit}&offset=${offset}`);
      return data.items.map((item: any) => item.track).filter((t: any) => t !== null);
    } catch (e: any) {
      if (e.status === 404) {
        apiLogger.logClick(`[PLAYBACK ERROR] playlist fetch failed status=404 id=${playlistId}`);
        toastService.show("Couldn’t load that playlist from Spotify (404).", "error");
        throw new Error("STOP_FLOW_404");
      }
      throw e;
    }
  },

  /**
   * Fetches album tracks and maps them to the full SpotifyTrack structure.
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

  getPlaylistTracksBulk: async (playlistId: string, targetCount = 300): Promise<SpotifyTrack[]> => {
    let allTracks: SpotifyTrack[] = [];
    let offset = 0;
    const limit = 100;

    apiLogger.logClick(`Engine [FETCH]: Gathering Playlist ${playlistId} tracks (target: ${targetCount})`);

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
   * Robust artist resolver with fallback queries.
   */
  robustResolveArtist: async (name: string): Promise<string | null> => {
    const cacheKey = `resolved_artist_id_${name.toLowerCase().replace(/\s+/g, '_')}`;
    const cachedId = localStorage.getItem(cacheKey);
    if (cachedId) return cachedId;

    const queries = [name, `${name} artist`];

    for (const q of queries) {
      try {
        const data = await SpotifyApi.request(`/search?q=${encodeURIComponent(q)}&type=artist&limit=5`);
        const items = data?.artists?.items || [];
        
        if (items.length === 0) continue;

        const exactMatch = items.find((a: any) => a.name.toLowerCase() === name.toLowerCase());
        const best = exactMatch || items[0];
        
        localStorage.setItem(cacheKey, best.id);
        return best.id;
      } catch (e: any) {}
    }
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
    
    if (items.length === 0) return { artist: null, debug: { count: 0 } };

    const exactMatches = items.filter((a: any) => a.name.toLowerCase() === name.toLowerCase());
    if (exactMatches.length > 0) {
      exactMatches.sort((a: any, b: any) => (b.followers?.total || 0) - (a.followers?.total || 0));
      return { artist: exactMatches[0], debug: { count: items.length } };
    }

    return { artist: items[0], debug: { count: items.length } };
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
        } catch (e) {}
      }
      const seenUris = new Set<string>();
      return pool.filter(t => {
        if (seenUris.has(t.uri)) return false;
        seenUris.add(t.uri);
        return true;
      });
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

    const shuffled = shuffleArray(trackPool);
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
      debug: { albumCount: albumMap.size, poolSize: trackPool.length, selectedSize: selected.length }
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
    const finalArtists = seedArtists.filter(id => id && id.length > 5).slice(0, 5);
    const finalTracks = seedTracks.filter(id => id && id.length > 5).slice(0, 5 - finalArtists.length);

    if (finalArtists.length === 0 && finalTracks.length === 0) return [];

    const nLimit = normalizeLimit('/recommendations', limit, 20, 100);
    const params = new URLSearchParams({ limit: nLimit.toString(), market, ...targets });
    
    if (finalArtists.length > 0) params.append('seed_artists', finalArtists.join(','));
    if (finalTracks.length > 0) params.append('seed_tracks', finalTracks.join(','));
    
    try {
      const data = await SpotifyApi.request(`/recommendations?${params.toString()}`);
      return data.tracks || [];
    } catch (e: any) {
      return [];
    }
  },

  searchShows: async (query: string, limit = 5): Promise<any[]> => {
    const data = await SpotifyApi.request(`/search?q=${encodeURIComponent(query)}&type=show&limit=${limit}`);
    return data?.shows?.items || [];
  },

  getShowEpisodes: async (showId: string, limit = 50, market?: string): Promise<SpotifyEpisode[]> => {
    if (USE_MOCK_DATA) {
      return [
        {
          id: 'mock_ep_1',
          name: 'The Future of AI Design Systems',
          description: 'Exploring generative models.',
          release_date: '2024-02-24',
          duration_ms: 1800000,
          images: [{ url: 'https://images.unsplash.com/photo-1590602847861-f357a9332bbc?auto=format&fit=crop&q=80&w=300&h=300' }],
          uri: 'spotify:episode:mock1'
        }
      ];
    }

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
    // PROMPT REQUIREMENT: Diagnostic logging for playlist metadata
    apiLogger.logClick(`Fetching playlist metadata for id=${playlistId} sourceType=playlist trigger=getPlaylistById`);

    // Safety check: Skip if id is "Liked Songs" identifier or me keywords
    if (playlistId === 'liked_songs' || playlistId === 'me' || !playlistId || playlistId === 'Unlinked') {
       apiLogger.logError(`Skipped invalid playlist metadata request for id: ${playlistId}`);
       return null;
    }
    
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