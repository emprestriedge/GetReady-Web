import { SpotifyAuth } from './spotifyAuth';
import { SpotifyUser, SpotifyDevice } from '../types';
import { apiLogger } from './apiLogger';

export const SpotifyApi = {
  /**
   * request - Shared Spotify API fetcher.
   * Handles token validation and error logging.
   */
  request: async (endpoint: string, options: RequestInit = {}): Promise<any> => {
    const token = await SpotifyAuth.getValidAccessToken();
    
    if (!token) {
      const msg = "Spotify access denied: Connect account in Settings.";
      apiLogger.logError(msg);
      throw new Error(msg);
    }

    const url = `https://api.spotify.com/v1${endpoint}`;
    const method = options.method || 'GET';

    apiLogger.logRequest(method, url);

    const headers = {
      ...options.headers,
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    };

    let response: Response;
    try {
      response = await fetch(url, { ...options, headers });
    } catch (fetchErr: any) {
      apiLogger.logError(`Network Failure: ${fetchErr.message}`);
      throw new Error("Unable to connect to Spotify. Check your internet.");
    }

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

  /**
   * safeRequest - Shared wrapper that returns a typed result instead of throwing.
   */
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