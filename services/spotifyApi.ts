import { SpotifyAuth } from './spotifyAuth';
import { SpotifyUser, SpotifyDevice } from '../types';
import { apiLogger } from './apiLogger';
import { toastService } from './toastService';
import { USE_MOCK_DATA } from '../constants';

let mockPlaybackState: any = USE_MOCK_DATA ? {
  is_playing: false,
  progress_ms: 45000,
  currently_playing_type: 'track',
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
  // Added getMe method to handle /me endpoint
  getMe: async (): Promise<SpotifyUser> => {
    return SpotifyApi.request('/me');
  },

  // Added getDevices method to handle /me/player/devices endpoint
  getDevices: async (): Promise<SpotifyDevice[]> => {
    const data = await SpotifyApi.request('/me/player/devices');
    return data?.devices || [];
  },

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
    
    if (response.status === 204) {
      apiLogger.logResponse(method, url, 204);
      return null;
    }

    if (!response.ok) {
      // PROMPT REQUIREMENT: Read and log the full response body snippet on non-2xx
      const responseText = await response.text();
      const bodySnippet = responseText.substring(0, 500);
      let errorMessage = `Request failed (${response.status})`;
      
      try {
        const errorJson = JSON.parse(responseText);
        errorMessage = errorJson.error?.message || errorMessage;
      } catch (e) {}

      // Detailed technical log for the in-app buffer
      const diagnosticMsg = `[${response.status}] ${method} ${url} | Body: ${bodySnippet}`;
      apiLogger.logError(diagnosticMsg);
      
      // User-visible toast banner (Surgically skip if 'silent' flag is set)
      if (!(options as any).silent) {
        toastService.show(`Spotify error ${response.status}: ${errorMessage}`, "error");
      }

      const error: any = new Error(errorMessage);
      error.status = response.status;
      error.rawBody = responseText;
      throw error;
    }

    apiLogger.logResponse(method, url, response.status);
    return response.json();
  },

  handleMockRequest: async (endpoint: string, options: RequestInit): Promise<any> => {
    await new Promise(r => setTimeout(r, 400)); 
    
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

    if (endpoint.startsWith('/me/player')) return mockPlaybackState;

    if (endpoint.includes('/player/play')) {
      let playedUri = 'spotify:track:mock';
      try {
        if (options.body) {
          const body = JSON.parse(options.body as string);
          if (body.uris && body.uris.length > 0) playedUri = body.uris[0];
        }
      } catch (e) {}
      const isEpisode = playedUri.includes(':episode:');
      mockPlaybackState = {
        is_playing: true,
        progress_ms: 0,
        currently_playing_type: isEpisode ? 'episode' : 'track',
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
          images: isEpisode ? [{ url: 'https://images.unsplash.com/photo-1590602847861-f357a9332bbc?auto=format&fit=crop&q=80&w=300&h=300' }] : undefined,
          device: { name: 'iPhone 17 Pro Max' }
        },
        device: { name: 'iPhone 17 Pro Max' }
      };
      return null;
    }

    if (endpoint.includes('/player/pause')) {
      if (mockPlaybackState) mockPlaybackState.is_playing = false;
      return null;
    }

    if (endpoint.includes('/player/next') || endpoint.includes('/player/previous')) {
      return null;
    }

    return {};
  }
};