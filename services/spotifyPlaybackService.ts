import { SpotifyAuth } from './spotifyAuth';
import { SpotifyApi } from './spotifyApi';
import { apiLogger } from './apiLogger';

declare global {
  interface Window {
    onSpotifyWebPlaybackSDKReady: () => void;
    Spotify: any;
  }
}

class SpotifyPlaybackService {
  private player: any = null;
  private deviceId: string | null = null;
  private sdkReady: boolean = false;
  private initializationPromise: Promise<void> | null = null;
  private isPlaying: boolean = false;

  async init(): Promise<void> {
    if (this.initializationPromise) return this.initializationPromise;

    this.initializationPromise = new Promise((resolve, reject) => {
      if (this.sdkReady) return resolve();

      if (!document.getElementById('spotify-player-script')) {
        const script = document.createElement('script');
        script.id = 'spotify-player-script';
        script.src = 'https://sdk.scdn.co/spotify-player.js';
        script.async = true;
        document.body.appendChild(script);
      }

      window.onSpotifyWebPlaybackSDKReady = async () => {
        apiLogger.logClick("SDK: Script Ready");
        
        this.player = new window.Spotify.Player({
          name: 'GetReady (Web)',
          getOAuthToken: (cb: (token: string) => void) => {
            SpotifyAuth.getValidAccessToken().then(t => cb(t || ''));
          },
          volume: 0.5
        });

        this.player.addListener('player_state_changed', (state: any) => {
          if (!state) return;
          this.isPlaying = !state.paused;
        });

        this.player.addListener('ready', ({ device_id }: { device_id: string }) => {
          this.deviceId = device_id;
          this.sdkReady = true;
          apiLogger.logClick(`SDK: Device Connected (${device_id})`);
          resolve();
        });

        this.player.addListener('not_ready', ({ device_id }: { device_id: string }) => {
          apiLogger.logError(`SDK: Device Went Offline (${device_id})`);
        });

        this.player.addListener('initialization_error', ({ message }: { message: string }) => {
          apiLogger.logError(`SDK Init Error: ${message}`);
        });

        this.player.connect().then((success: boolean) => {
          if (!success) reject(new Error("Failed to connect Spotify Player"));
        });
      };
    });

    return this.initializationPromise;
  }

  getIsPlaying(): boolean {
    return this.isPlaying;
  }

  async preparePlaybackContext(): Promise<boolean> {
    try {
      const state = await SpotifyApi.request('/me/player');
      this.isPlaying = state?.is_playing || false;
      return !!(state && state.device);
    } catch (e: any) {
      return false;
    }
  }

  async ensureActiveDevice(targetDeviceId?: string): Promise<string> {
    if (targetDeviceId) {
      await this.transferPlayback(targetDeviceId, true);
      return targetDeviceId;
    }

    const devices = await SpotifyApi.getDevices();
    const active = devices.find(d => d.is_active);
    const chosen = active || devices[0];

    if (!chosen) throw new Error("Open Spotify on a device and try again.");

    await this.transferPlayback(chosen.id, true);
    return chosen.id;
  }

  async transferPlayback(deviceId: string, play: boolean = true): Promise<void> {
    await SpotifyApi.request('/me/player', {
      method: 'PUT',
      body: JSON.stringify({ device_ids: [deviceId], play })
    });
  }

  async playUrisOnDevice(deviceId: string, uris: string[]): Promise<void> {
    await SpotifyApi.request(`/me/player/play?device_id=${deviceId}`, {
      method: 'PUT',
      body: JSON.stringify({ uris })
    });
    this.isPlaying = true;
  }

  async pause(): Promise<void> {
    await SpotifyApi.request('/me/player/pause', { method: 'PUT' });
    this.isPlaying = false;
  }

  async resume(): Promise<void> {
    await SpotifyApi.request('/me/player/play', { method: 'PUT' });
    this.isPlaying = true;
  }

  async next(): Promise<void> {
    await SpotifyApi.request('/me/player/next', { method: 'POST' });
  }

  async previous(): Promise<void> {
    await SpotifyApi.request('/me/player/previous', { method: 'POST' });
  }

  getDeviceId() {
    return this.deviceId;
  }
}

export const spotifyPlayback = new SpotifyPlaybackService();
