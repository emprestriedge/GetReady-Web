import { RunOption, RuleSettings, RunResult, Track, RunOptionType, SpotifyTrack, VibeType, SpotifyEpisode, PodcastShowCandidate } from '../types';
import { SpotifyDataService } from './spotifyDataService';
import { configStore } from './configStore';
import { BlockStore } from './blockStore';
import { CooldownStore } from './cooldownStore';
import { apiLogger } from './apiLogger';
import { spotifyPlayback } from './spotifyPlaybackService';
import { SpotifyApi } from './spotifyApi';
import { ContentIdStore } from './contentIdStore';
import { USE_MOCK_DATA, MOCK_TRACKS } from '../constants';

export interface PlaybackEngine {
  generateRunResult(option: RunOption, rules: RuleSettings): Promise<RunResult>;
}

interface Recipe {
  acoustic: number;
  a7x: number;
  liked: number;
  shazam: number;
  rap: number;
}

const BASE_RECIPE_TOTAL = 35;
const RECIPES: Record<string, Recipe> = {
  zen_mix: { acoustic: 20, a7x: 6, liked: 7, shazam: 2, rap: 0 },
  focus_mix: { acoustic: 14, a7x: 6, liked: 13, shazam: 2, rap: 0 },
  chaos_mix: { acoustic: 5, a7x: 6, liked: 12, shazam: 12, rap: 0 },
  lightening_mix: { acoustic: 0, a7x: 10, liked: 4, shazam: 7, rap: 14 }
};

export class SpotifyPlaybackEngine implements PlaybackEngine {
  private isLatinOnly(text: string): boolean {
    return !/[^\u0000-\u024F]/.test(text);
  }

  private shuffleArray<T>(array: T[]): T[] {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  /**
   * playTrack - Standard Spotify API play command implementation.
   * Ensures the order is preserved by using position offsets and disabling shuffle.
   */
  static async playTrack(track: Track, allUris: string[], index: number) {
    const devices = await SpotifyApi.getDevices();
    const active = devices.find(d => d.is_active);
    
    if (!active) {
      throw new Error("NO_ACTIVE_DEVICE");
    }

    // CRITICAL: Explicitly disable Spotify shuffle to honor our custom mix order
    try {
      await spotifyPlayback.setShuffle(false, active.id);
    } catch (e) {
      console.warn("Could not set shuffle state, proceeding with playback.");
    }

    // Use position-based offset to ensure Spotify queue matches our UI exactly
    await spotifyPlayback.playUrisOnDevice(active.id, allUris, index);
  }

  async generateRunResult(option: RunOption, rules: RuleSettings): Promise<RunResult> {
    if (USE_MOCK_DATA) {
      await new Promise(r => setTimeout(r, 1500));
      if (option.type === RunOptionType.PODCAST) return this.generatePodcastResult(option);

      const targetLen = rules.playlistLength || 35;
      
      const buildMockResult = (pool: Track[], summary: string): RunResult => {
        // Fix: Skip cooldown restriction check in Mock/Demo mode to allow repetitive testing
        const filtered = pool.filter(t => !CooldownStore.isRestricted(t.id) || USE_MOCK_DATA);
        const tracks = this.shuffleArray(filtered).slice(0, targetLen);
        
        if (tracks.length > 0) {
          CooldownStore.markUsed(tracks.map(t => t.id));
        }

        return {
          runType: RunOptionType.MUSIC,
          optionName: option.name,
          createdAt: new Date().toISOString(),
          playlistName: `${option.name} • ${new Date().toLocaleDateString()}`,
          tracks: tracks.map(t => ({ ...t, id: t.uri.split(':').pop() || '' })),
          sourceSummary: summary,
          debugSummary: "Mock Mode Active"
        };
      };

      if (option.id === 'rap_hiphop') {
          return buildMockResult([...MOCK_TRACKS], "Balanced Mock Build (6 Sources)");
      }

      if (option.id === 'a7x_deep') {
        const a7xMocks: Track[] = [
          { id: 'a7x1', uri: 'spotify:track:a7x1', title: 'Bat Country', artist: 'Avenged Sevenfold', album: 'City of Evil', imageUrl: 'https://i.scdn.co/image/ab67616d0000b2737604586e92b34a1795f573c0', durationMs: 313000, status: 'none' },
          { id: 'a7x2', uri: 'spotify:track:a7x2', title: 'Hail to the King', artist: 'Avenged Sevenfold', album: 'Hail to the King', imageUrl: 'https://i.scdn.co/image/ab67616d0000b273292723707e77a1e0b5711681', durationMs: 305000, status: 'none' },
          { id: 'a7x3', uri: 'spotify:track:a7x3', title: 'Nightmare', artist: 'Avenged Sevenfold', album: 'Nightmare', imageUrl: 'https://i.scdn.co/image/ab67616d0000b27303c73336465355644788339b', durationMs: 374000, status: 'none' },
        ];
        return buildMockResult([...a7xMocks, ...MOCK_TRACKS], "Mock Mix: A7X + Similar Bands");
      }

      return buildMockResult([...MOCK_TRACKS], `Demo Build: Acoustic 4 • A7X 2 • Shazam 2 • Liked 4`);
    }

    if (option.type === RunOptionType.PODCAST) return this.generatePodcastResult(option);

    const totalTarget = rules.playlistLength || 35;
    apiLogger.logClick(`Engine [BUILD]: Composing ${totalTarget} tracks for ${option.name}.`);
    
    const filter = (t: SpotifyTrack) => 
      !t.is_local && 
      t.is_playable !== false && 
      !BlockStore.isBlocked(t.id) && 
      (!CooldownStore.isRestricted(t.id) || USE_MOCK_DATA); // Fix: Skip cooldown restriction check in Mock/Demo mode

    const config = configStore.getConfig();
    const catalog = config.catalog;

    let result: RunResult;

    if (['liked_songs', 'shazam_tracks', 'acoustic_rock', 'rap_hiphop', 'a7x_deep'].includes(option.id)) {
      if (option.id === 'rap_hiphop') {
        result = await this.generateRapRadioResult(option, rules, filter);
      } else if (option.id === 'a7x_deep') {
        result = await this.generateA7XRadioResult(option, rules, filter);
      } else {
        let tracks: SpotifyTrack[] = [];
        if (option.id === 'liked_songs') {
          tracks = await SpotifyDataService.getLikedTracks(totalTarget * 5); 
        } else if (option.id === 'shazam_tracks') {
          tracks = catalog.shazamId ? await SpotifyDataService.getPlaylistTracks(catalog.shazamId, Math.max(150, totalTarget * 3)) : [];
        } else if (option.id === 'acoustic_rock') {
          tracks = catalog.acoustic90sId ? await SpotifyDataService.getPlaylistTracks(catalog.acoustic90sId, Math.max(150, totalTarget * 3)) : [];
        }

        const filteredTracks = tracks.filter(filter);
        const shuffledTracks = this.shuffleArray(filteredTracks);
        let finalTracks = shuffledTracks.slice(0, totalTarget);
        
        let warning: string | undefined;
        if (finalTracks.length < totalTarget && tracks.length > 0) {
          const needed = totalTarget - finalTracks.length;
          const fallback = tracks.filter(t => !finalTracks.find(ft => ft.id === t.id)).slice(0, needed); 
          finalTracks = [...finalTracks, ...fallback];
          warning = `Strict Cooldown limited choices. Supplemented ${needed} tracks from history.`;
        }

        result = this.mapToRunResult(option, finalTracks.slice(0, totalTarget), `Source: ${option.name}`, [], warning);
      }
    } else {
      const scaleFactor = totalTarget / BASE_RECIPE_TOTAL;
      const baseRecipe = { ...(RECIPES[option.id] || RECIPES['chaos_mix']) };
      const recipe: Recipe = {
        acoustic: Math.round(baseRecipe.acoustic * scaleFactor),
        a7x: Math.round(baseRecipe.a7x * scaleFactor),
        liked: Math.round(baseRecipe.liked * scaleFactor),
        shazam: Math.round(baseRecipe.shazam * scaleFactor),
        rap: Math.round(baseRecipe.rap * scaleFactor),
      };

      if (rules.calmHype <= 0.33) {
        const shift = Math.round(6 * scaleFactor);
        recipe.acoustic += shift;
        if (recipe.rap >= shift) recipe.rap -= shift; else if (recipe.shazam >= shift) recipe.shazam -= shift;
      } else if (rules.calmHype >= 0.67) {
        const shift = Math.round(6 * scaleFactor);
        recipe.acoustic = Math.max(0, recipe.acoustic - shift);
        if (option.id === 'lightening_mix' || option.id === 'chaos_mix') recipe.rap += shift; else recipe.shazam += shift;
      }

      const newCount = Math.round(totalTarget * rules.discoverLevel);
      const [likedPool, shazamPool, acousticPool, rapPool, a7xPool] = await Promise.all([
        SpotifyDataService.getLikedTracks(Math.max(150, totalTarget * 2)),
        catalog.shazamId ? SpotifyDataService.getPlaylistTracks(catalog.shazamId, 100).catch(() => []) : Promise.resolve([]),
        catalog.acoustic90sId ? SpotifyDataService.getPlaylistTracks(catalog.acoustic90sId, 100).catch(() => []) : Promise.resolve([]),
        this.fetchStandardRapPool(),
        catalog.a7xArtistId ? (rules.a7xMode === 'DeepCuts' ? SpotifyDataService.getDeepCuts(catalog.a7xArtistId, 100).then(r => r.tracks) : SpotifyDataService.getArtistTopTracks(catalog.a7xArtistId)) : Promise.resolve([])
      ]).then(pools => pools.map(p => p.filter(filter)));

      let newTracks: SpotifyTrack[] = [];
      if (newCount > 0) {
        const seedTracksPool = [...likedPool, ...shazamPool].sort(() => Math.random() - 0.5);
        const seedTracks = seedTracksPool.slice(0, 3).map(s => s.id);
        const seedArtists = seedTracksPool.slice(0, 2).map(s => s.artists[0].id);
        if (seedTracks.length > 0 || seedArtists.length > 0) {
          newTracks = (await SpotifyDataService.getRecommendations(seedArtists, seedTracks, newCount + 20)).filter(filter).slice(0, newCount);
        }
      }

      const take = (pool: SpotifyTrack[], n: number) => this.shuffleArray(pool).slice(0, n);
      const selection = { acoustic: take(acousticPool, recipe.acoustic), a7x: take(a7xPool, recipe.a7x), shazam: take(shazamPool, recipe.shazam), liked: take(likedPool, recipe.liked), rap: take(rapPool, recipe.rap), new: newTracks };

      const resultTracks: SpotifyTrack[] = [];
      const sourceKeys = ['acoustic', 'a7x', 'shazam', 'liked', 'rap', 'new'] as const;
      while (resultTracks.length < totalTarget) {
        let addedAny = false;
        for (const key of sourceKeys) {
          const t = selection[key].shift();
          if (t && !resultTracks.find(rt => rt.id === t.id)) { resultTracks.push(t); addedAny = true; }
          if (resultTracks.length >= totalTarget) break;
        }
        if (!addedAny) break;
      }

      let warning: string | undefined;
      if (resultTracks.length < totalTarget) {
        const needed = totalTarget - resultTracks.length;
        const combinedFallback = this.shuffleArray([...likedPool, ...shazamPool, ...acousticPool, ...rapPool]);
        const uniqueFallback = combinedFallback.filter(t => !resultTracks.find(rt => rt.id === t.id));
        resultTracks.push(...uniqueFallback.slice(0, needed));
        warning = `Mixed Source limit via Cooldown. Added ${needed} fallback tracks.`;
      }

      const sourceSummary = `Acoustic ${recipe.acoustic} • A7X ${recipe.a7x} • Shazam ${recipe.shazam} • Liked ${recipe.liked} • Rap ${recipe.rap} • New ${newTracks.length}`;
      result = this.mapToRunResult(option, resultTracks.slice(0, totalTarget), sourceSummary, newTracks, warning);
    }

    if (result.tracks && result.tracks.length > 0) {
      CooldownStore.markUsed(result.tracks.map(t => t.id));
    }

    return result;
  }

  private mapToRunResult(option: RunOption, spotifyTracks: SpotifyTrack[], summary: string, newTracksPool: SpotifyTrack[] = [], warning?: string): RunResult {
    return {
      runType: RunOptionType.MUSIC,
      optionName: option.name,
      createdAt: new Date().toISOString(),
      playlistName: `${option.name} • ${new Date().toLocaleDateString()}`,
      tracks: spotifyTracks.map(t => ({ 
        id: t.id,
        uri: t.uri, 
        title: t.name, 
        artist: t.artists.map(a => a.name).join(', '), 
        album: t.album.name, 
        imageUrl: t.album.images?.[0]?.url, 
        durationMs: t.duration_ms, 
        isNew: newTracksPool.some(nt => nt.id === t.id) 
      })),
      sourceSummary: summary, debugSummary: summary, warning
    };
  }

  private async fetchStandardRapPool(): Promise<SpotifyTrack[]> {
    const catalog = configStore.getConfig().catalog;
    const sources = Object.values(catalog.rapSources || {}).filter(s => s !== null) as any[];
    if (sources.length === 0) return [];
    const pools = await Promise.all(sources.map(async (s) => {
      try { return s.type === 'playlist' ? await SpotifyDataService.getPlaylistTracks(s.id, 50) : await SpotifyDataService.getAlbumTracksFull(s.id); } catch (e) { return []; }
    }));
    return pools.flat();
  }

  private async generateRapRadioResult(option: RunOption, rules: RuleSettings, filter: (t: SpotifyTrack) => boolean): Promise<RunResult> {
    const totalTarget = rules.playlistLength || 35;
    const catalog = configStore.getConfig().catalog;
    const sources = Object.values(catalog.rapSources || {}).filter(s => s !== null) as any[];
    
    if (sources.length === 0) throw new Error("Link Rap sources in Developer Tools.");
    
    apiLogger.logClick(`RapMix: Fetching from ${sources.length} sources to ensure balanced distribution.`);

    const sourcePools = await Promise.all(sources.map(async (source) => {
      try {
        let rawTracks: SpotifyTrack[] = [];
        if (source.type === 'playlist') {
          rawTracks = await SpotifyDataService.getPlaylistTracksBulk(source.id, 100);
        } else {
          rawTracks = await SpotifyDataService.getAlbumTracksFull(source.id);
        }

        return rawTracks.filter(t => {
          if (!filter(t)) return false;
          if (!this.isLatinOnly(t.name) || !this.isLatinOnly(t.artists[0].name)) return false;
          const year = parseInt(t.album.release_date?.split('-')[0] || "");
          return !isNaN(year) && year >= 1990 && year <= 2009;
        });
      } catch (e) {
        return [];
      }
    }));

    const resultTracks: SpotifyTrack[] = [];
    const randomizedPools = sourcePools.map(p => this.shuffleArray(p));
    
    let iterations = 0;
    const MAX_ITERATIONS = totalTarget * 2; 

    while (resultTracks.length < totalTarget && iterations < MAX_ITERATIONS) {
      let tracksAddedThisPass = 0;
      
      for (const pool of randomizedPools) {
        if (pool.length > 0) {
          const track = pool.shift()!;
          if (!resultTracks.find(rt => rt.id === track.id)) {
            resultTracks.push(track);
            tracksAddedThisPass++;
          }
        }
        if (resultTracks.length >= totalTarget) break;
      }

      if (tracksAddedThisPass === 0) break; 
      iterations++;
    }

    let warning: string | undefined;
    if (resultTracks.length < totalTarget) {
      const needed = totalTarget - resultTracks.length;
      const fallbackPool = this.shuffleArray(sourcePools.flat());
      const extra = fallbackPool.filter(t => !resultTracks.find(rt => rt.id === t.id)).slice(0, needed);
      resultTracks.push(...extra);
      warning = `Limited balanced Rap sources via Cooldown. Filled ${extra.length} slots via duplicate fallback.`;
    }

    const finalShuffled = this.shuffleArray(resultTracks);

    return this.mapToRunResult(
      option, 
      finalShuffled, 
      `Balanced Build: ${sources.length} sources contribute ${Math.floor(totalTarget / sources.length)} tracks each average.`, 
      [], 
      warning
    );
  }

  private async generateA7XRadioResult(option: RunOption, rules: RuleSettings, filter: (t: SpotifyTrack) => boolean): Promise<RunResult> {
    const totalTarget = rules.playlistLength || 35;
    const catalog = configStore.getConfig().catalog;
    const a7xId = catalog.a7xArtistId || await SpotifyDataService.robustResolveArtist("Avenged Sevenfold");
    if (!a7xId) throw new Error("Could not resolve A7X ID.");
    if (!catalog.a7xArtistId) configStore.updateCatalog({ a7xArtistId: a7xId });

    const a7xQuota = Math.min(18, Math.floor(totalTarget * 0.5));
    const similarQuota = totalTarget - a7xQuota;

    apiLogger.logClick(`A7XRadio: Building mixed roster (A7X: ${a7xQuota}, Similar: ${similarQuota})`);

    const similarBands = ["Shinedown", "System of a Down", "Korn", "Five Finger Death Punch", "Rage Against the Machine", "Breaking Benjamin"];

    const [a7xPool, similarPools] = await Promise.all([
      (rules.a7xMode === 'DeepCuts' ? SpotifyDataService.getDeepCuts(a7xId, 100).then(r => r.tracks) : SpotifyDataService.getArtistTopTracks(a7xId)),
      Promise.all(similarBands.map(async (band) => {
        try {
          const bandId = await SpotifyDataService.robustResolveArtist(band);
          if (!bandId) return [];
          return await SpotifyDataService.getArtistTopTracks(bandId);
        } catch (e) {
          return [];
        }
      }))
    ]);

    const a7xSelection = this.shuffleArray(a7xPool.filter(filter)).slice(0, a7xQuota);

    const randomizedSimilarPools = similarPools.map(p => this.shuffleArray(p));
    const similarSelection: SpotifyTrack[] = [];
    
    let iterations = 0;
    while (similarSelection.length < similarQuota && iterations < 10) {
      let addedThisPass = 0;
      for (const pool of randomizedSimilarPools) {
        if (pool.length > 0) {
          const track = pool.shift()!;
          if (!similarSelection.find(s => s.id === track.id) && !a7xSelection.find(a => a.id === track.id) && filter(track)) {
            similarSelection.push(track);
            addedThisPass++;
          }
        }
        if (similarSelection.length >= similarQuota) break;
      }
      if (addedThisPass === 0) break;
      iterations++;
    }

    const mergedPool = this.shuffleArray([...a7xSelection, ...similarSelection]);
    
    let warning: string | undefined;
    if (mergedPool.length < totalTarget) {
      const needed = totalTarget - mergedPool.length;
      const extra = this.shuffleArray([...a7xPool, ...similarPools.flat()]).filter(t => !mergedPool.find(m => m.id === t.id)).slice(0, needed);
      mergedPool.push(...extra);
      warning = `Limited source pool via Cooldown. Supplemented ${needed} tracks.`;
    }

    return this.mapToRunResult(
      option, 
      mergedPool, 
      `A7X Mixed Radio: ${a7xSelection.length} A7X tracks + ${similarSelection.length} similar artist tracks.`, 
      [], 
      warning
    );
  }

  private async generatePodcastResult(option: RunOption): Promise<RunResult> {
    const showId = ContentIdStore.get(option.idKey || '');
    const me = await SpotifyApi.getMe();
    const market = me.country || 'US';
    const effectiveShowId = (USE_MOCK_DATA && !showId) ? 'mock_show_id' : showId;

    if (effectiveShowId && typeof effectiveShowId === 'string') {
      try {
        const eps = await SpotifyDataService.getShowEpisodes(effectiveShowId, 5, market);
        if (eps && eps.length > 0) {
          const firstEp = eps[0];
          return { 
            runType: RunOptionType.PODCAST, 
            optionName: option.name, 
            createdAt: new Date().toISOString(), 
            playlistName: option.name, 
            tracks: eps.map(ep => ({
               id: ep.id,
               uri: ep.uri,
               title: ep.name,
               artist: option.name, 
               album: new Date(ep.release_date).toLocaleDateString(), 
               imageUrl: ep.images?.[0]?.url || "",
               durationMs: ep.duration_ms
            })),
            episode: { 
              id: firstEp.id, 
              name: firstEp.name, 
              description: firstEp.description, 
              releaseDate: firstEp.release_date, 
              durationMs: firstEp.duration_ms, 
              imageUrl: firstEp.images?.[0]?.url || "", 
              uri: firstEp.uri 
            } 
          };
        }
      } catch (e) {
        apiLogger.logError(`Podcast sync failed for show ${effectiveShowId}`);
      }
    }

    const search = await SpotifyDataService.searchShows(option.name, 5);
    return { 
      runType: RunOptionType.PODCAST, 
      optionName: option.name, 
      createdAt: new Date().toISOString(), 
      playlistName: option.name, 
      candidates: search.map(s => ({ 
        id: s.id, 
        name: s.name, 
        publisher: s.publisher, 
        imageUrl: s.images?.[0]?.url || "", 
        description: s.description || "", 
        explicit: s.explicit || false 
      })) 
    };
  }
}