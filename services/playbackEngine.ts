import { RunOption, RuleSettings, RunResult, Track, RunOptionType, SpotifyTrack, VibeType, SpotifyEpisode, PodcastShowCandidate } from '../types';
import { SpotifyDataService } from './spotifyDataService';
import { configStore } from './configStore';
import { BlockStore } from './blockStore';
import { ResourceResolver } from './resourceResolver';
import { apiLogger } from './apiLogger';
import { spotifyPlayback } from './spotifyPlaybackService';
import { SpotifyApi } from './spotifyApi';
import { ContentIdStore } from './contentIdStore';

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
  private async getHistoryIds(optionId: string): Promise<Set<string>> {
    const key = `run_history_ids_${optionId}`;
    const saved = localStorage.getItem(key);
    return saved ? new Set(JSON.parse(saved).flat()) : new Set();
  }

  private isLatinOnly(text: string): boolean {
    return !/[^\u0000-\u024F]/.test(text);
  }

  async generateRunResult(option: RunOption, rules: RuleSettings): Promise<RunResult> {
    if (option.type === RunOptionType.PODCAST) return this.generatePodcastResult(option);

    const totalTarget = rules.playlistLength || 35;
    apiLogger.logClick(`Engine [BUILD]: Composing ${totalTarget} tracks for ${option.name}.`);
    
    try {
      await spotifyPlayback.preparePlaybackContext();
    } catch (e) {
      apiLogger.logClick("Engine: Playback preparation skipped (no active player).");
    }

    const historyIds = await this.getHistoryIds(option.id);
    const filter = (t: SpotifyTrack) => !t.is_local && t.is_playable !== false && !BlockStore.isBlocked(t.id) && !historyIds.has(t.id);

    const config = configStore.getConfig();
    const catalog = config.catalog;

    if (['liked_songs', 'shazam_tracks', 'acoustic_rock', 'rap_hiphop', 'a7x_deep'].includes(option.id)) {
      if (option.id === 'rap_hiphop') return this.generateRapRadioResult(option, rules, historyIds);
      if (option.id === 'a7x_deep') return this.generateA7XRadioResult(option, rules, historyIds);

      let tracks: SpotifyTrack[] = [];
      if (option.id === 'liked_songs') {
        tracks = await SpotifyDataService.getLikedTracks(totalTarget * 3);
      } else if (option.id === 'shazam_tracks') {
        tracks = catalog.shazamId ? await SpotifyDataService.getPlaylistTracks(catalog.shazamId, Math.max(100, totalTarget * 2)) : [];
      } else if (option.id === 'acoustic_rock') {
        tracks = catalog.acoustic90sId ? await SpotifyDataService.getPlaylistTracks(catalog.acoustic90sId, Math.max(100, totalTarget * 2)) : [];
      }

      let finalTracks = tracks.filter(filter).slice(0, totalTarget);
      let warning: string | undefined;
      
      if (finalTracks.length < totalTarget) {
        const needed = totalTarget - finalTracks.length;
        const fallback = tracks.slice(0, needed); 
        finalTracks = [...finalTracks, ...fallback];
        warning = `Source limit reached. Filled ${needed} tracks via history fallback.`;
      }

      return this.mapToRunResult(option, finalTracks.slice(0, totalTarget), `Source: ${option.name}`, [], warning);
    }

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

    const take = (pool: SpotifyTrack[], n: number) => [...pool].sort(() => Math.random() - 0.5).slice(0, n);
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
      const combinedFallback = [...likedPool, ...shazamPool, ...acousticPool, ...rapPool].sort(() => Math.random() - 0.5);
      const uniqueFallback = combinedFallback.filter(t => !resultTracks.find(rt => rt.id === t.id));
      resultTracks.push(...uniqueFallback.slice(0, needed));
      warning = `Mixed Source limit. Added ${needed} fallback tracks.`;
    }

    const sourceSummary = `Acoustic ${recipe.acoustic} • A7X ${recipe.a7x} • Shazam ${recipe.shazam} • Liked ${recipe.liked} • Rap ${recipe.rap} • New ${newTracks.length}`;
    return this.mapToRunResult(option, resultTracks.slice(0, totalTarget), sourceSummary, newTracks, warning);
  }

  private mapToRunResult(option: RunOption, spotifyTracks: SpotifyTrack[], summary: string, newTracksPool: SpotifyTrack[] = [], warning?: string): RunResult {
    return {
      runType: RunOptionType.MUSIC,
      optionName: option.name,
      createdAt: new Date().toISOString(),
      playlistName: `${option.name} • ${new Date().toLocaleDateString()}`,
      tracks: spotifyTracks.map(t => ({ uri: t.uri, title: t.name, artist: t.artists.map(a => a.name).join(', '), album: t.album.name, imageUrl: t.album.images?.[0]?.url, durationMs: t.duration_ms, isNew: newTracksPool.some(nt => nt.id === t.id) })),
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

  private async generateRapRadioResult(option: RunOption, rules: RuleSettings, historyIds: Set<string>): Promise<RunResult> {
    const totalTarget = rules.playlistLength || 35;
    const catalog = configStore.getConfig().catalog;
    const sources = Object.values(catalog.rapSources || {}).filter(s => s !== null) as any[];
    if (sources.length === 0) throw new Error("Link Rap sources in Developer Tools.");
    
    const rawPools = await Promise.all(sources.map(async (s) => {
      try { return s.type === 'playlist' ? await SpotifyDataService.getPlaylistTracksBulk(s.id, Math.max(150, totalTarget * 2)) : await SpotifyDataService.getAlbumTracksFull(s.id); } catch (e) { return []; }
    }));
    
    const mergedPool = Array.from(new Map(rawPools.flat().map(t => [t.id, t])).values());
    const filteredPool = mergedPool.filter(t => {
      if (BlockStore.isBlocked(t.id) || historyIds.has(t.id)) return false;
      if (!this.isLatinOnly(t.name) || !this.isLatinOnly(t.artists[0].name)) return false;
      const year = parseInt(t.album.release_date?.split('-')[0] || "");
      return !isNaN(year) && year >= 1990 && year <= 2009;
    });

    let warning: string | undefined;
    if (filteredPool.length === 0) {
      const fallback = mergedPool.slice(0, totalTarget);
      warning = "No tracks matched the Rap logic filters. Using random library tracks.";
      return this.mapToRunResult(option, fallback, `Rap Fallback Build`, [], warning);
    }

    const likedIds = await SpotifyDataService.getLikedTracksIds(500);
    const familiarPool = filteredPool.filter(t => likedIds.has(t.id));
    const deepCutsPool = filteredPool.filter(t => !likedIds.has(t.id));
    
    const familiarTarget = Math.round(totalTarget * 0.8);
    const deepTarget = totalTarget - familiarTarget;

    const selection = [...[...familiarPool].sort(() => Math.random() - 0.5).slice(0, familiarTarget), ...[...deepCutsPool].sort(() => Math.random() - 0.5).slice(0, deepTarget)];
    if (selection.length < totalTarget) {
      const needed = totalTarget - selection.length;
      const extra = filteredPool.filter(t => !selection.find(st => st.id === t.id)).slice(0, needed);
      selection.push(...extra);
      warning = `Limited Rap source. Filled ${needed} slots via duplicate logic.`;
    }

    return this.mapToRunResult(option, selection.slice(0, totalTarget), `Rap Mix Build Successful`, deepCutsPool, warning);
  }

  private async generateA7XRadioResult(option: RunOption, rules: RuleSettings, historyIds: Set<string>): Promise<RunResult> {
    const totalTarget = rules.playlistLength || 35;
    const catalog = configStore.getConfig().catalog;
    const a7xId = catalog.a7xArtistId || await SpotifyDataService.robustResolveArtist("Avenged Sevenfold");
    if (!a7xId) throw new Error("Could not resolve A7X ID.");
    if (!catalog.a7xArtistId) configStore.updateCatalog({ a7xArtistId: a7xId });

    const a7xPool = await (rules.a7xMode === 'DeepCuts' ? SpotifyDataService.getDeepCuts(a7xId, Math.max(100, totalTarget * 2)).then(r => r.tracks) : SpotifyDataService.getArtistTopTracks(a7xId));
    let selection = a7xPool.filter(filter => !historyIds.has(filter.id)).slice(0, totalTarget);
    let warning: string | undefined;
    
    if (selection.length < totalTarget) {
      const needed = totalTarget - selection.length;
      selection = [...selection, ...a7xPool.slice(0, needed)];
      warning = `Limited A7X tracks. Included ${needed} repeats to fill mix.`;
    }

    return this.mapToRunResult(option, selection, `A7X Build Successful`, [], warning);
  }

  private async generatePodcastResult(option: RunOption): Promise<RunResult> {
    const showId = ContentIdStore.get(option.idKey || '');
    const me = await SpotifyApi.getMe();
    const market = me.country || 'US';
    if (showId && typeof showId === 'string') {
      const eps = await SpotifyDataService.getShowEpisodes(showId, 5, market);
      if (eps.length > 0) {
        const ep = eps[0];
        return { runType: RunOptionType.PODCAST, optionName: option.name, createdAt: new Date().toISOString(), playlistName: option.name, episode: { id: ep.id, name: ep.name, description: ep.description, releaseDate: ep.release_date, durationMs: ep.duration_ms, imageUrl: ep.images?.[0]?.url || "", uri: ep.uri } };
      }
    }
    const search = await SpotifyDataService.searchShows(option.name, 5);
    return { runType: RunOptionType.PODCAST, optionName: option.name, createdAt: new Date().toISOString(), playlistName: option.name, candidates: search.map(s => ({ id: s.id, name: s.name, publisher: s.publisher, imageUrl: s.images?.[0]?.url || "", description: s.description || "", explicit: s.explicit || false })) };
  }
}