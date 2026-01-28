
import { SpotifyAuth } from './spotifyAuth';
import { SpotifyUser, SpotifyDevice } from '../types';
import { apiLogger } from './apiLogger';
import { toastService } from './toastService';

export const SpotifyApi = {
  request: async (endpoint: string, options: RequestInit = {}): Promise<any> => {
    const token = await SpotifyAuth.getValidAccessToken();
    
    if (!token) {
      // Silent failure during background check
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

      // Do NOT show toasts here automatically, 
      // let the UI layer decide if the user needs to see it.
      const error: any = new Error(errorMessage);
      error.status = response.status;
      throw error;
    }

    return response.json();
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
