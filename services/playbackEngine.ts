import { RunOption, RuleSettings, RunResult, Track, RunOptionType, SpotifyTrack, VibeType, SpotifyEpisode, PodcastShowCandidate } from '../types';
import { SpotifyDataService } from './spotifyDataService';
import { configStore } from './configStore';
import { BlockStore } from './blockStore';
import { ResourceResolver } from './resourceResolver';
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
  /**
   * playTrack - Centralized playback logic with Precision Targeting and Silent Self-Transfer.
   * Order: Active Device > Local SDK Player > Visible External Device > Deep Link.
   */
  static async playTrack(track: Track, allUris: string[], index: number): Promise<void> {
    if (!track || !track.uri) {
      apiLogger.logError("Playback failed: Track data is invalid or missing URI.");
      return;
    }

    // URI Sanitization
    const safeUri = track.uri.startsWith('spotify:') ? track.uri : `spotify:track:${track.uri}`;

    try {
      const devices = await SpotifyApi.getDevices();
      const active = devices.find(d => d.is_active);
      const localId = spotifyPlayback.getDeviceId();

      // 1. ACTIVE DEVICE: Use immediately for seamless in-app transition
      if (active) {
        apiLogger.logClick(`Playback: Sending command to active device ${active.name}`);
        await spotifyPlayback.setShuffle(false, active.id);
        await spotifyPlayback.playUrisOnDevice(active.id, allUris, safeUri);
        return;
      }

      // 2. SILENT SELF-TRANSFER: Transfer to internal Web SDK player if it exists
      if (localId) {
        apiLogger.logClick(`Playback: Silently transferring to local SDK player ${localId}`);
        try {
          await spotifyPlayback.transferPlayback(localId, false); // Transfer without auto-play to avoid glitch
          await new Promise(r => setTimeout(r, 600)); // Optimal buffer for Spotify state propagation
          await spotifyPlayback.setShuffle(false, localId);
          await spotifyPlayback.playUrisOnDevice(localId, allUris, safeUri);
          return;
        } catch (err) {
          apiLogger.logError("Local transfer failed, falling back to network scanning.");
        }
      }

      // 3. IDLE EXTERNAL DEVICES: Wake up the first visible device on the network
      if (devices.length > 0) {
        const target = devices[0];
        apiLogger.logClick(`Playback: Waking up idle device ${target.name}`);
        await spotifyPlayback.transferPlayback(target.id, true);
        await new Promise(r => setTimeout(r, 600));
        await spotifyPlayback.playUrisOnDevice(target.id, allUris, safeUri);
        return;
      }

      // 4. TRUE COLD START: Last resort deep link to external app
      apiLogger.logClick(`Playback: No devices detected. Triggering Deep Link.`);
      window.location.assign(safeUri);
      
    } catch (e: any) {
      apiLogger.logError(`Playback Critical Error: ${e.message}. Using safety deep link.`);
      window.location.assign(safeUri);
    }
  }

  private async getHistoryIds(optionId: string): Promise<Set<string>> {
    const key = `run_history_ids_${optionId}`;
    const saved = localStorage.getItem(key);
    return saved ? new Set(JSON.parse(saved).flat()) : new Set();
  }

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

  async generateRunResult(option: RunOption, rules: RuleSettings): Promise<RunResult> {
    if (USE_MOCK_DATA) {
      await new Promise(r => setTimeout(r, 1500));
      if (option.type === RunOptionType.PODCAST) return this.generatePodcastResult(option);
      const targetLen = rules.playlistLength || 35;
      if (option.id === 'rap_hiphop') {
          return {
            runType: RunOptionType.MUSIC,
            optionName: option.name,
            createdAt: new Date().toISOString(),
            playlistName: `${option.name} • ${new Date().toLocaleDateString()}`,
            tracks: this.shuffleArray([...MOCK_TRACKS]).slice(0, targetLen),
            sourceSummary: "Balanced Mock Build (6 Sources)",
            debugSummary: "Mock Mode Active"
          };
      }
      if (option.id === 'a7x_deep') {
        const combined = this.shuffleArray([...MOCK_TRACKS]);
        return {
          runType: RunOptionType.MUSIC,
          optionName: option.name,
          createdAt: new Date().toISOString(),
          playlistName: `${option.name} • ${new Date().toLocaleDateString()}`,
          tracks: combined.slice(0, targetLen),
          sourceSummary: "Mock Mix: A7X + Similar Bands",
          debugSummary: "Mock Mode Active"
        };
      }
      return {
        runType: RunOptionType.MUSIC,
        optionName: option.name,
        createdAt: new Date().toISOString(),
        playlistName: `${option.name} • ${new Date().toLocaleDateString()}`,
        tracks: this.shuffleArray([...MOCK_TRACKS]).slice(0, targetLen),
        sourceSummary: `Demo Build: Acoustic 4 • A7X 2 • Shazam 2 • Liked 4`,
        debugSummary: "Mock Mode Active"
      };
    }

    if (option.type === RunOptionType.PODCAST) return this.generatePodcastResult(option);

    const totalTarget = rules.playlistLength || 35;
    apiLogger.logClick(`Engine [BUILD]: Composing ${totalTarget} tracks for ${option.name}.`);
    
    try {
      await spotifyPlayback.preparePlaybackContext();
    } catch (e) {
      apiLogger.logClick("Engine: Playback preparation skipped (no active player).");
    }

    const historyIds = await this.getHistoryIds(option.id);
    const filter = (t: SpotifyTrack) => t && !t.is_local && t.is_playable !== false && !BlockStore.isBlocked(t.id) && !historyIds.has(t.id);

    const config = configStore.getConfig();
    const catalog = config.catalog;

    if (['liked_songs', 'shazam_tracks', 'acoustic_rock', 'rap_hiphop', 'a7x_deep'].includes(option.id)) {
      if (option.id === 'rap_hiphop') return this.generateRapRadioResult(option, rules, historyIds);
      if (option.id === 'a7x_deep') return this.generateA7XRadioResult(option, rules, historyIds);

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

    const sourceSummary = `Acoustic ${recipe.acoustic} • A7X ${recipe.a7x} • Shazam ${recipe.shazam} • Liked ${recipe.liked} • Rap ${recipe.rap} • New ${newTracks.length}`;
    return this.mapToRunResult(option, resultTracks.slice(0, totalTarget), sourceSummary, newTracks);
  }

  private mapToRunResult(option: RunOption, spotifyTracks: SpotifyTrack[], summary: string, newTracksPool: SpotifyTrack[] = [], warning?: string): RunResult {
    return {
      runType: RunOptionType.MUSIC,
      optionName: option.name,
      createdAt: new Date().toISOString(),
      playlistName: `${option.name} • ${new Date().toLocaleDateString()}`,
      tracks: spotifyTracks.filter(Boolean).map(t => ({ uri: t.uri, title: t.name, artist: t.artists.map(a => a.name).join(', '), album: t.album.name, imageUrl: t.album.images?.[0]?.url, durationMs: t.duration_ms, isNew: newTracksPool.some(nt => nt.id === t.id) })),
      sourceSummary: summary, debugSummary: summary, warning
    };
  }

  private async fetchStandardRapPool(): Promise<SpotifyTrack[]> {
    const catalog = configStore.getConfig().catalog;
    const sources = Object.values(catalog.rapSources || {}).filter(s => s !== null) as any[];
    if (sources.length === 0) return [];
    const pools = await Promise.all(sources.map(async (s) => {
      try { 
        return s.type === 'playlist' ? await SpotifyDataService.getPlaylistTracks(s.id, 50) : await SpotifyDataService.getAlbumTracksFull(s.id); 
      } catch (e) { 
        apiLogger.logError(`Source fetch failed: ${s.id}`);
        return []; 
      }
    }));
    return pools.flat().filter(Boolean);
  }

  private async generateRapRadioResult(option: RunOption, rules: RuleSettings, historyIds: Set<string>): Promise<RunResult> {
    const totalTarget = rules.playlistLength || 35;
    const catalog = configStore.getConfig().catalog;
    const sources = Object.values(catalog.rapSources || {}).filter(s => s !== null) as any[];
    if (sources.length === 0) throw new Error("Link Rap sources in Developer Tools.");
    const sourcePools = await Promise.all(sources.map(async (source) => {
      try {
        let rawTracks = source.type === 'playlist' ? await SpotifyDataService.getPlaylistTracksBulk(source.id, 100) : await SpotifyDataService.getAlbumTracksFull(source.id);
        return rawTracks.filter(t => {
          if (!t || BlockStore.isBlocked(t.id) || historyIds.has(t.id)) return false;
          if (!this.isLatinOnly(t.name) || !this.isLatinOnly(t.artists[0].name)) return false;
          const year = parseInt(t.album.release_date?.split('-')[0] || "");
          return !isNaN(year) && year >= 1990 && year <= 2009;
        });
      } catch (e) { return []; }
    }));
    const resultTracks: SpotifyTrack[] = [];
    const randomizedPools = sourcePools.map(p => this.shuffleArray(p));
    while (resultTracks.length < totalTarget) {
      let tracksAddedThisPass = 0;
      for (const pool of randomizedPools) {
        if (pool.length > 0) {
          const track = pool.shift()!;
          if (!resultTracks.find(rt => rt.id === track.id)) { resultTracks.push(track); tracksAddedThisPass++; }
        }
        if (resultTracks.length >= totalTarget) break;
      }
      if (tracksAddedThisPass === 0) break;
    }
    return this.mapToRunResult(option, this.shuffleArray(resultTracks), `Balanced Build: ${sources.length} sources.`);
  }

  private async generateA7XRadioResult(option: RunOption, rules: RuleSettings, historyIds: Set<string>): Promise<RunResult> {
    const totalTarget = rules.playlistLength || 35;
    const catalog = configStore.getConfig().catalog;
    const a7xId = catalog.a7xArtistId || await SpotifyDataService.robustResolveArtist("Avenged Sevenfold");
    if (!a7xId) throw new Error("Could not resolve A7X ID.");
    const a7xQuota = Math.min(18, Math.floor(totalTarget * 0.5));
    const similarQuota = totalTarget - a7xQuota;
    const similarBands = ["Shinedown", "System of a Down", "Korn", "Five Finger Death Punch", "Rage Against the Machine", "Breaking Benjamin"];
    const [a7xPool, similarPools] = await Promise.all([
      (rules.a7xMode === 'DeepCuts' ? SpotifyDataService.getDeepCuts(a7xId, 100).then(r => r.tracks) : SpotifyDataService.getArtistTopTracks(a7xId)),
      Promise.all(similarBands.map(async (band) => {
        try { const bandId = await SpotifyDataService.robustResolveArtist(band); return bandId ? await SpotifyDataService.getArtistTopTracks(bandId) : []; } catch (e) { return []; }
      }))
    ]);
    const a7xSelection = this.shuffleArray(a7xPool.filter(t => t && !historyIds.has(t.id) && !BlockStore.isBlocked(t.id))).slice(0, a7xQuota);
    const randomizedSimilarPools = similarPools.map(p => this.shuffleArray(p));
    const similarSelection: SpotifyTrack[] = [];
    while (similarSelection.length < similarQuota) {
      let addedThisPass = 0;
      for (const pool of randomizedSimilarPools) {
        if (pool.length > 0) {
          const track = pool.shift()!;
          if (track && !similarSelection.find(s => s.id === track.id) && !a7xSelection.find(a => a.id === track.id) && !historyIds.has(track.id) && !BlockStore.isBlocked(track.id)) { similarSelection.push(track); addedThisPass++; }
        }
        if (similarSelection.length >= similarQuota) break;
      }
      if (addedThisPass === 0) break;
    }
    return this.mapToRunResult(option, this.shuffleArray([...a7xSelection, ...similarSelection]), `A7X Mixed Radio`);
  }

  private async generatePodcastResult(option: RunOption): Promise<RunResult> {
    const showId = ContentIdStore.get(option.idKey || '');
    const me = await SpotifyApi.getMe();
    const market = me.country || 'US';
    const effectiveShowId = (USE_MOCK_DATA && !showId) ? 'mock_show_id' : showId;
    if (effectiveShowId) {
      try {
        const eps = await SpotifyDataService.getShowEpisodes(effectiveShowId, 5, market);
        if (eps && eps.length > 0) {
          return { 
            runType: RunOptionType.PODCAST, optionName: option.name, createdAt: new Date().toISOString(), playlistName: option.name,
            tracks: eps.map(ep => ({ uri: ep.uri, title: ep.name, artist: option.name, album: new Date(ep.release_date).toLocaleDateString(), imageUrl: ep.images?.[0]?.url || "", durationMs: ep.duration_ms })),
            episode: { id: eps[0].id, name: eps[0].name, description: eps[0].description, releaseDate: eps[0].release_date, durationMs: eps[0].duration_ms, imageUrl: eps[0].images?.[0]?.url || "", uri: eps[0].uri } 
          };
        }
      } catch (e) {}
    }
    const search = await SpotifyDataService.searchShows(option.name, 5);
    return { runType: RunOptionType.PODCAST, optionName: option.name, createdAt: new Date().toISOString(), playlistName: option.name, candidates: search.map(s => ({ id: s.id, name: s.name, publisher: s.publisher, imageUrl: s.images?.[0]?.url || "", description: s.description || "", explicit: s.explicit || false })) };
  }
}