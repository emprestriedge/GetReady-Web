export type TabType = 'Home' | 'Vault' | 'Settings';

export enum RunOptionType {
  MUSIC = 'MUSIC',
  PODCAST = 'PODCAST',
}

export interface RunOption {
  id: string;
  name: string;
  type: RunOptionType;
  description: string;
  idKey?: string;
  publisher?: string;
}

export type A7XMode = 'TopTracks' | 'DeepCuts';

export interface RuleSettings {
  playlistLength: number;
  allowExplicit: boolean;
  avoidRepeats: boolean;
  avoidRepeatsWindow: number;
  preferVariety: boolean;
  a7xMode: A7XMode;
  calmHype: number;
  discoverLevel: number;
  devMode: boolean;
  customPodcastOptions?: RunOption[];
}

export interface CatalogConfig {
  shazamId: string | null;
  acoustic90sId: string | null;
  a7xArtistId: string | null;
  rapSources: Record<string, SpotifySource | null>;
}

export interface AppConfig {
  rules: RuleSettings;
  catalog: CatalogConfig;
  podcasts: RunOption[];
  spotifyClientId?: string;
  version: number;
}

export interface RunRecord {
  id: string;
  timestamp: string;
  optionName: string;
  rulesSnapshot: RuleSettings;
  result: RunResult;
}

export interface Track {
  id: string;
  uri: string;
  title: string;
  artist: string;
  album?: string;
  imageUrl?: string;
  durationMs?: number;
  isNew?: boolean;
  status?: 'liked' | 'gem' | 'none';
}

export interface BlockedTrack {
  id: string;
  name: string;
  artist: string;
  album?: string;
  addedAt: string;
}

export interface PodcastEpisode {
  id: string;
  name: string;
  description: string;
  releaseDate: string;
  durationMs: number;
  imageUrl: string;
  uri: string;
  external_url?: string;
}

export interface PodcastShowCandidate {
  id: string;
  name: string;
  publisher: string;
  imageUrl: string;
  description: string;
  explicit: boolean;
}

export interface RunResult {
  runType: RunOptionType;
  optionName: string;
  createdAt: string;
  playlistName: string;
  tracks?: Track[];
  episode?: PodcastEpisode;
  candidates?: PodcastShowCandidate[];
  debugSummary?: string;
  sourceSummary?: string;
  warning?: string; // Soft warning for limited sources or fallback fill
}

export type DataSourceType = 'Mock' | 'Spotify';

export interface RuleOverride {
  playlistLength?: number;
  allowExplicit?: boolean;
  avoidRepeats?: boolean;
  a7xMode?: A7XMode;
  calmHype?: number;
  discoverLevel?: number;
}

export interface RuleOverridesMap {
  [optionId: string]: RuleOverride;
}

export type VibeType = 'Chaos' | 'Zen' | 'Focus' | 'LighteningMix';

export interface SmartMixPlan {
  preset: string;
  summary: string;
}

export interface SpotifyTokens {
  access_token: string;
  refresh_token: string;
  expires_at: number;
}

export interface SpotifyUser {
  display_name: string;
  id: string;
  images: { url: string; height: number; width: number }[];
  email?: string;
  country?: string;
}

export type SpotifySourceType = 'playlist' | 'album';

export interface SpotifySource {
  id: string;
  type: SpotifySourceType;
  label?: string;
}

export interface SpotifyTrack {
  id: string;
  name: string;
  uri: string;
  artists: { name: string; id: string }[];
  album: { 
    name: string; 
    id: string; 
    images: { url: string }[];
    release_date?: string; 
  };
  duration_ms?: number;
  is_local?: boolean;
  is_playable?: boolean;
}

export interface SpotifyEpisode {
  id: string;
  name: string;
  description: string;
  release_date: string;
  duration_ms: number;
  images: { url: string }[];
  uri: string;
  external_urls?: { spotify: string };
}

export interface SpotifyArtist {
  id: string;
  name: string;
  images: { url: string }[];
  popularity?: number;
}

export interface SpotifyDevice {
  id: string;
  is_active: boolean;
  is_private_session: boolean;
  is_restricted: boolean;
  name: string;
  type: string;
  volume_percent: number;
}