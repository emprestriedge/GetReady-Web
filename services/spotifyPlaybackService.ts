import { SpotifyAuth } from './spotifyAuth';
import { SpotifyApi } from './spotifyApi';
import { apiLogger } from './apiLogger';
import { toastService } from './toastService';

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
    // SURGICAL SANITIZATION
    const originalUris = uris || [];
    const pattern = /^spotify:(track|episode):[A-Za-z0-9]+$/;
    
    const safeUris = originalUris
      .map(u => (u || "").trim())
      .filter(u => u !== "" && pattern.test(u));

    const rejected = originalUris.filter(u => !safeUris.includes(u.trim()));

    // DEBUG LOGS
    console.log("[PLAYBACK DEBUG] deviceId=", deviceId, "originalCount=", originalUris.length, "safeCount=", safeUris.length, "first5=", safeUris.slice(0, 5));
    console.log("[PLAYBACK DEBUG] rejectedExamples=", rejected.slice(0, 5));

    if (safeUris.length === 0) {
      toastService.show("No valid Spotify items to play. Please re-sync or reselect source.", "error");
      return;
    }

    const body: any = { uris: safeUris };
    if (offsetIndex !== undefined) {
      // Note: If tracks were removed, the offset position might need adjustment,
      // but we maintain existing logic for surgical consistency.
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