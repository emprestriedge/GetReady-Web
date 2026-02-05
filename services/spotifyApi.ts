import { SpotifyAuth } from './spotifyAuth';
import { SpotifyUser, SpotifyDevice } from '../types';
import { apiLogger } from './apiLogger';
import { toastService } from './toastService';
import { USE_MOCK_DATA } from '../constants';

// Persist mock playback state in memory for the session
// Initialized with dummy data for immediate debug visibility
let mockPlaybackState: any = USE_MOCK_DATA ? {
  is_playing: false,
  progress_ms: 45000,
  item: {
    name: 'Midnight City - M83 [Extended Remix]',
    uri: 'spotify:track:1',
    duration_ms: 243000,
    artists: [{ name: 'M83' }],
    album: { 
      name: 'Hurry Up, We\'re Dreaming',
      images: [{ url: 'https://i.scdn.co/image/ab67616d0000b2737604586e92b34a1795f573c0' }] 
    },
    device: { name: 'iPhone 17 Pro Max' }
  },
  device: { name: 'iPhone 17 Pro Max' }
} : null;

export const SpotifyApi = {
  request: async (endpoint: string, options: RequestInit = {}): Promise<any> => {
    if (USE_MOCK_DATA) {
      return SpotifyApi.handleMockRequest(endpoint, options);
    }

    const token = await SpotifyAuth.getValidAccessToken();
    
    if (!token) {
      throw new Error("No active session");
    }

    const url = `https://api.spotify.com/v1${endpoint}`;
    const method = options.method || 'GET';

    apiLogger.logRequest(method, url);

    const headers = {
      ...options.headers,
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    };

    const response = await fetch(url, { ...options, headers });
    apiLogger.logResponse(method, url, response.status);
    
    if (response.status === 204) return null;

    if (!response.ok) {
      let errorMessage = `Spotify API Error (${response.status})`;
      try {
        const json = await response.json();
        errorMessage = json.error?.message || errorMessage;
      } catch (e) {}

      const error: any = new Error(errorMessage);
      error.status = response.status;
      throw error;
    }

    return response.json();
  },

  handleMockRequest: async (endpoint: string, options: RequestInit): Promise<any> => {
    await new Promise(r => setTimeout(r, 400)); // Simulate latency
    
    if (endpoint === '/me') {
      return {
        display_name: 'Jelly Architect',
        id: 'jelly_demo_user',
        images: [{ url: 'https://images.unsplash.com/photo-1550684848-fac1c5b4e853?auto=format&fit=crop&q=80&w=200&h=200', height: 200, width: 200 }],
        country: 'US',
        email: 'demo@getready.app'
      };
    }

    if (endpoint === '/me/player/devices') {
      return {
        devices: [
          { id: 'mock_iphone', is_active: true, name: 'iPhone 17 Pro Max', type: 'Smartphone', volume_percent: 80 },
          { id: 'mock_studio', is_active: false, name: 'Studio Monitors', type: 'Speaker', volume_percent: 50 }
        ]
      };
    }

    if (endpoint === '/me/player') {
      return mockPlaybackState;
    }

    // Handle Play Command in Mock Mode - Dynamic Injection
    if (endpoint.includes('/player/play')) {
      let playedUri = 'spotify:track:mock';
      try {
        if (options.body) {
          const body = JSON.parse(options.body as string);
          if (body.uris && body.uris.length > 0) {
            playedUri = body.uris[0];
          }
        }
      } catch (e) {}

      const isEpisode = playedUri.includes(':episode:');

      mockPlaybackState = {
        is_playing: true,
        progress_ms: 0,
        item: {
          name: isEpisode ? 'Daily Briefing: The Future of AI' : 'Midnight City - M83 [Extended Remix]',
          uri: playedUri,
          duration_ms: isEpisode ? 1800000 : 243000,
          artists: isEpisode ? undefined : [{ name: 'M83' }],
          album: isEpisode ? undefined : { 
            name: 'Hurry Up, We\'re Dreaming',
            images: [{ url: 'https://i.scdn.co/image/ab67616d0000b2737604586e92b34a1795f573c0' }] 
          },
          show: isEpisode ? { name: 'IHIP News' } : undefined,
          images: isEpisode ? [{ url: 'https://images.unsplash.com/photo-1590602847861-f357a9332bbc?auto=format&fit=crop&q=80&w=300&h=300' }] : undefined
        },
        device: { name: 'iPhone 17 Pro Max' }
      };
      return null;
    }

    if (endpoint.includes('/player/pause')) {
      if (mockPlaybackState) mockPlaybackState.is_playing = false;
      return null;
    }

    // Handle Podcast Search Mock
    if (endpoint.startsWith('/search') && endpoint.includes('type=show')) {
      const url = new URL(`http://mock.com${endpoint}`);
      const query = url.searchParams.get('q') || "Podcast";
      return {
        shows: {
          items: [
            {
              id: 'mock_show_1',
              name: query,
              publisher: 'Mock Publisher',
              images: [{ url: 'https://images.unsplash.com/photo-1590602847861-f357a9332bbc?auto=format&fit=crop&q=80&w=300&h=300' }],
              description: 'This is a high-fidelity mock podcast description for preview purposes.',
              explicit: false
            }
          ]
        }
      };
    }

    // Handle Podcast Episodes Mock
    if (endpoint.includes('/episodes')) {
      return {
        items: [
          {
            id: 'mock_ep_1',
            name: 'Episode 101: The Future of Composition Engines',
            description: 'In this session, we dive deep into how real-time musicology and AI-driven catalog syncing are changing the way we build interfaces.',
            release_date: '2024-02-24',
            duration_ms: 3600000,
            images: [{ url: 'https://images.unsplash.com/photo-1478737270239-2fccd2c7862a?auto=format&fit=crop&q=80&w=300&h=300' }],
            uri: 'spotify:episode:mock1'
          },
          {
            id: 'mock_ep_2',
            name: 'Weekly Roundup: Obsidian Design Systems',
            description: 'Exploring the glassmorphism trends of 2025 and why pink-on-black continues to dominate the high-end developer tool aesthetic.',
            release_date: '2024-02-17',
            duration_ms: 1800000,
            images: [{ url: 'https://images.unsplash.com/photo-1589903308914-1293a6bb1f8c?auto=format&fit=crop&q=80&w=300&h=300' }],
            uri: 'spotify:episode:mock2'
          },
          {
            id: 'mock_ep_3',
            name: 'Episode 103: The Weekly Show (Mock Edition)',
            description: 'Discussing the intersection of technology and democracy in a special bonus episode.',
            release_date: '2024-02-10',
            duration_ms: 2700000,
            images: [{ url: 'https://images.unsplash.com/photo-1590602847861-f357a9332bbc?auto=format&fit=crop&q=80&w=300&h=300' }],
            uri: 'spotify:episode:mock3'
          },
          {
            id: 'mock_ep_4',
            name: 'Episode 104: Scalability at the Edge',
            description: 'How to handle low-latency interactions for global user bases using modern cloud architecture.',
            release_date: '2024-02-03',
            duration_ms: 2400000,
            images: [{ url: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&q=80&w=300&h=300' }],
            uri: 'spotify:episode:mock4'
          },
          {
            id: 'mock_ep_5',
            name: 'Episode 105: The Evolution of Haptics',
            description: 'Tactile feedback is more than just vibrations; it is a communication channel between machine and human.',
            release_date: '2024-01-27',
            duration_ms: 2100000,
            images: [{ url: 'https://images.unsplash.com/photo-1558489580-faa74691fdc5?auto=format&fit=crop&q=80&w=300&h=300' }],
            uri: 'spotify:episode:mock5'
          }
        ]
      };
    }

    // Default for modification requests (PUT/POST/DELETE)
    if (options.method && options.method !== 'GET') {
      return null;
    }

    return { items: [] };
  },

  safeRequest: async <T>(endpoint: string, options: RequestInit = {}): Promise<{ data: T | null; error: string | null }> => {
    try {
      const data = await SpotifyApi.request(endpoint, options);
      return { data, error: null };
    } catch (e: any) {
      return { data: null, error: e.message };
    }
  },

  getMe: async (): Promise<SpotifyUser> => {
    return SpotifyApi.request('/me');
  },

  getDevices: async (): Promise<SpotifyDevice[]> => {
    const data = await SpotifyApi.request('/me/player/devices');
    return data.devices || [];
  }
};