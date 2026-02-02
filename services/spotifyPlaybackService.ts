import { SpotifyAuth } from './spotifyAuth';
import { SpotifyApi } from './spotifyApi';
import { apiLogger } from './apiLogger';

class SpotifyPlaybackService {
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

  async playUrisOnDevice(deviceId: string, uris: string[], offsetIndex?: number): Promise<void> {
    const body: any = { uris };
    if (offsetIndex !== undefined) {
      body.offset = { position: offsetIndex };
    }
    await SpotifyApi.request(`/me/player/play?device_id=${deviceId}`, {
      method: 'PUT',
      body: JSON.stringify(body)
    });
  }

  async setShuffle(state: boolean, deviceId?: string): Promise<void> {
    const query = deviceId ? `?device_id=${deviceId}&state=${state}` : `?state=${state}`;
    await SpotifyApi.request(`/me/player/shuffle${query}`, { method: 'PUT' });
  }

  async pause(): Promise<void> {
    await SpotifyApi.request('/me/player/pause', { method: 'PUT' });
  }

  async resume(): Promise<void> {
    await SpotifyApi.request('/me/player/play', { method: 'PUT' });
  }

  async next(): Promise<void> {
    await SpotifyApi.request('/me/player/next', { method: 'POST' });
  }

  async previous(): Promise<void> {
    await SpotifyApi.request('/me/player/previous', { method: 'POST' });
  }
}

export const spotifyPlayback = new SpotifyPlaybackService();