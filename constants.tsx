import { RunOption, RunOptionType, RuleSettings } from './types';

export const SMART_MIX_MODES: RunOption[] = [
  { id: 'chaos_mix', name: 'Chaos', type: RunOptionType.MUSIC, description: 'High energy randomness: Liked songs, Shazam hits, and a sprinkle of A7X.' },
  { id: 'zen_mix', name: 'Zen', type: RunOptionType.MUSIC, description: 'Deep calm: Mostly 90s acoustic alternative with soft Avenged Sevenfold cuts.' },
  { id: 'focus_mix', name: 'Focus', type: RunOptionType.MUSIC, description: 'Steady flow: A balanced blend of acoustic tracks, liked favorites, and melodic A7X.' },
  { id: 'lightening_mix', name: 'LighteningMix', type: RunOptionType.MUSIC, description: 'Maximum hype: Prioritizing 90s/00s Rap and heavy Avenged Sevenfold.' },
];

export const MUSIC_BUTTONS: RunOption[] = [
  { id: 'liked_songs', name: 'LikedSongs', type: RunOptionType.MUSIC, description: 'Pulling from your saved favorites.' },
  { id: 'shazam_tracks', name: 'ShazamList', type: RunOptionType.MUSIC, description: 'Direct sync from your Shazam playlist.', idKey: 'shazamPlaylistId' },
  { id: 'acoustic_rock', name: '90sAltRock', type: RunOptionType.MUSIC, description: 'Pure 90s grunge and alternative acoustic cuts.', idKey: 'acoustic90sPlaylistId' },
  { id: 'rap_hiphop', name: 'OGRap&HipHop', type: RunOptionType.MUSIC, description: 'Curated 90s/00s station built from your library playlists.', idKey: 'rapSources' },
  { id: 'a7x_deep', name: 'A7xRadio', type: RunOptionType.MUSIC, description: 'A7X and similar heavy hitters with a focus on deep cuts.', idKey: 'a7xArtistId' },
];

export const PODCAST_OPTIONS: RunOption[] = [
  { id: 'ihip_news', name: 'IHIP News', type: RunOptionType.PODCAST, description: 'International news and current events.', idKey: 'ihipShowId' },
  { id: 'raging_moderates', name: 'Raging Moderates', type: RunOptionType.PODCAST, description: 'Balanced political discussion.', idKey: 'ragingModeratesShowId' },
  { id: 'jon_stewart', name: 'The Weekly Show with Jon Stewart', type: RunOptionType.PODCAST, description: 'Weekly roundup from Jon Stewart.', idKey: 'jonStewartShowId' },
];

/**
 * Rap Source Playlists
 * Updated to match the user's specific requested titles exactly.
 */
export const RAP_SOURCE_PLAYLIST_NAMES = [
  "Best Rap & Hip-Hop 90s/00s",
  "I Love My 90s Hip‑Hop",
  "80's & 90's Hip Hop / Rap💿",
  "2Pac – All Eyez On Me",
  "2Pac – Greatest Hits",
  "Eminem All Songs",
  "Hip Hop Classics",
  "Rap Caviar 90s"
];

export const DEFAULT_RULES: RuleSettings = {
  playlistLength: 35,
  allowExplicit: true,
  avoidRepeats: true,
  avoidRepeatsWindow: 7,
  preferVariety: true,
  a7xMode: 'DeepCuts',
  calmHype: 0.2,
  discoverLevel: 0.3,
  devMode: false,
  customPodcastOptions: PODCAST_OPTIONS,
};