
import { RunOption, RunOptionType, RuleSettings, Track, RunRecord } from './types';

// Enabled Demo Mode for UI testing
export const USE_MOCK_DATA = false;

export const SMART_MIX_MODES: RunOption[] = [
  { id: 'zen_mix', name: 'Zen', type: RunOptionType.MUSIC, description: 'A calming selection of acoustic and light tracks.' },
  { id: 'focus_mix', name: 'Focus', type: RunOptionType.MUSIC, description: 'Deep concentration with minimal vocals.' },
  { id: 'chaos_mix', name: 'Chaos', type: RunOptionType.MUSIC, description: 'High energy, high discovery, unpredictable.' },
  { id: 'lightening_mix', name: 'Flash', type: RunOptionType.MUSIC, description: 'Fast-paced, hard-hitting tracks.' },
];

export const MUSIC_BUTTONS: RunOption[] = [
  { id: 'liked_songs', name: 'Liked Songs', type: RunOptionType.MUSIC, description: 'Your personal library highlights.' },
  { id: 'shazam_tracks', name: 'Shazam History', type: RunOptionType.MUSIC, description: 'Tracks found while out and about.', idKey: 'shazamPlaylistId' },
  { id: 'acoustic_rock', name: '90sAltRock', type: RunOptionType.MUSIC, description: 'Pure 90s grunge and alternative acoustic cuts.', idKey: 'acoustic90sPlaylistId' },
  { id: 'rap_hiphop', name: 'OGRap&HipHop', type: RunOptionType.MUSIC, description: 'Curated 90s/00s station built from your library playlists.', idKey: 'rapSources' },
  { id: 'a7x_deep', name: 'A7xRadio', type: RunOptionType.MUSIC, description: 'A7X and similar heavy hitters with a focus on deep cuts.', idKey: 'a7xArtistId' },
];

export const PODCAST_OPTIONS: RunOption[] = [
  { id: 'ihip_news', name: 'IHIP News', type: RunOptionType.PODCAST, description: 'International news and current events.', idKey: 'ihipShowId' },
  { id: 'raging_moderates', name: 'Raging Moderates', type: RunOptionType.PODCAST, description: 'Balanced political discussion.', idKey: 'ragingModeratesShowId' },
  { id: 'jon_stewart', name: 'The Weekly Show with Jon Stewart', type: RunOptionType.PODCAST, description: 'Weekly roundup from Jon Stewart.', idKey: 'jonStewartShowId' },
];

export const RAP_SOURCE_PLAYLIST_NAMES = [
  "Best Rap & Hip-Hop 90s/00s",
  "I Love My 90s Hip‑Hop",
  "80's & 90's Hip Hop / Rap💿",
  "2Pac – Greatest Hits",
  "Eminem All Songs"
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

export const MOCK_TRACKS: Track[] = [
  { id: '1', uri: 'spotify:track:1', title: 'Midnight City - M83 [Extended Remix] 2024 Remaster', artist: 'M83', album: 'Hurry Up, We\'re Dreaming', imageUrl: 'https://i.scdn.co/image/ab67616d0000b2737604586e92b34a1795f573c0', durationMs: 243000, status: 'liked' },
  { id: '2', uri: 'spotify:track:2', title: 'Through the Fire and Flames - DragonForce [Maximum Overdrive Edition]', artist: 'DragonForce', album: 'Inhuman Rampage', imageUrl: 'https://i.scdn.co/image/ab67616d0000b273468962634e0689b910e5446f', durationMs: 441000, status: 'none' },
  { id: '3', uri: 'spotify:track:3', title: 'Starboy (feat. Daft Punk) - The Weeknd - PWA Jelly Glass Mix', artist: 'The Weeknd, Daft Punk', album: 'Starboy', imageUrl: 'https://i.scdn.co/image/ab67616d0000b2734718e0df50495f2a969b7617', durationMs: 230000, status: 'gem' },
  { id: '4', uri: 'spotify:track:4', title: 'Diamonds From Sierra Leone - Kanye West [Remix feat. Jay-Z] - Obsidian Vault Edition', artist: 'Kanye West, Jay-Z', album: 'Late Registration', imageUrl: 'https://i.scdn.co/image/ab67616d0000b273200969d750c00030560e9095', durationMs: 288000, status: 'liked' },
  { id: '5', uri: 'spotify:track:5', title: 'Bat Country - Avenged Sevenfold [Live from Obsidian Theater]', artist: 'Avenged Sevenfold', album: 'City of Evil', imageUrl: 'https://i.scdn.co/image/ab67616d0000b273d6396f4e156488796853381e', durationMs: 313000, status: 'none' },
  { id: '6', uri: 'spotify:track:6', title: 'Lose Yourself - Eminem [8 Mile Original Soundtrack] - 20th Anniversary Edition', artist: 'Eminem', album: '8 Mile', imageUrl: 'https://i.scdn.co/image/ab67616d0000b27389e8014524c8038753a8f15d', durationMs: 326000, status: 'none' },
  { id: '7', uri: 'spotify:track:7', title: 'Amber - 311 [Acoustic Sessions 1994-2024 Ultimate Collection]', artist: '311', album: 'From Chaos', imageUrl: 'https://i.scdn.co/image/ab67616d0000b27393d027732a37397b9148d88e', durationMs: 209000, status: 'none' },
  { id: '8', uri: 'spotify:track:8', title: 'California Love - 2Pac feat. Dr. Dre [Death Row Records Vault Remaster]', artist: '2Pac, Dr. Dre, Roger Troutman', album: 'All Eyez on Me', imageUrl: 'https://i.scdn.co/image/ab67616d0000b27376c79a83a0058b8559812f86', durationMs: 284000, status: 'none' },
  { id: '9', uri: 'spotify:track:9', title: 'Everlong - Foo Fighters [Obsidian Acoustic Rework]', artist: 'Foo Fighters', album: 'The Colour and the Shape', imageUrl: 'https://i.scdn.co/image/ab67616d0000b273670989f53e6b4d3202c38466', durationMs: 250000, status: 'none' },
  { id: '10', uri: 'spotify:track:10', title: 'Hail to the King - Avenged Sevenfold [Remastered for Mobile Jelly Glass UI]', artist: 'Avenged Sevenfold', album: 'Hail to the King', imageUrl: 'https://i.scdn.co/image/ab67616d0000b273292723707e77a1e0b5711681', durationMs: 305000, status: 'none' },
  { id: '11', uri: 'spotify:track:11', title: 'N.Y. State of Mind - Nas [Illmatic 30th Anniversary Gold Edition]', artist: 'Nas', album: 'Illmatic', imageUrl: 'https://i.scdn.co/image/ab67616d0000b273062828b2488812678f24419b', durationMs: 293000, status: 'none' },
  { id: '12', uri: 'spotify:track:12', title: 'Walking On A Dream - Empire of the Sun [Jelly Architect Edit]', artist: 'Empire of the Sun', album: 'Walking on a Dream', imageUrl: 'https://i.scdn.co/image/ab67616d0000b273e93a02796e98797f1d431c34', durationMs: 198000, status: 'none' },
];

export const MOCK_HISTORY: RunRecord[] = [
  {
    id: 'demo_1',
    timestamp: new Date(Date.now() - 3600000).toLocaleString(),
    optionName: 'Chaos',
    rulesSnapshot: DEFAULT_RULES,
    result: {
      runType: RunOptionType.MUSIC,
      optionName: 'Chaos',
      createdAt: new Date().toISOString(),
      playlistName: 'Chaos Mix - Feb 24',
      tracks: MOCK_TRACKS.slice(0, 5),
      sourceSummary: 'Acoustic 2 • A7X 1 • Shazam 1 • Liked 1'
    }
  },
  {
    id: 'demo_2',
    timestamp: new Date(Date.now() - 86400000).toLocaleString(),
    optionName: 'Zen',
    rulesSnapshot: { ...DEFAULT_RULES, calmHype: 0.1 },
    result: {
      runType: RunOptionType.MUSIC,
      optionName: 'Zen',
      createdAt: new Date().toISOString(),
      playlistName: 'Zen Acoustic Session',
      tracks: MOCK_TRACKS.slice(5, 10),
      sourceSummary: 'Acoustic 5 • A7X 0 • Shazam 0 • Liked 0'
    }
  }
];
