import { SpotifyAuth } from './spotifyAuth';
import { SpotifyApi } from './spotifyApi';
import { apiLogger } from './apiLogger';
import { toastService } from './toastService';

class SpotifyPlaybackService {
  async ensureActiveDevice(targetDeviceId?: string): Promise<string> {
    const devices = await SpotifyApi.getDevices();
    const active = devices.find(d => d.is_active);
    
    // If target provided and it's active, return it
    if (targetDeviceId && active?.id === targetDeviceId) return targetDeviceId;
    
    // If none active, pick target or first available
    const chosen = targetDeviceId || active?.id || devices[0]?.id;

    if (!chosen) throw new Error("Open Spotify on a device and try again.");

    await this.transferPlayback(chosen, false);
    return chosen;
  }

  async transferPlayback(deviceId: string, play: boolean = true): Promise<void> {
    await SpotifyApi.request('/me/player', {
      method: 'PUT',
      body: JSON.stringify({ device_ids: [deviceId], play })
    });
  }

  /**
   * playUrisWithRetry - Robust injection that handles Spotify background delays and transient infrastructure errors.
   * This implements the requested transfer -> wait -> play -> retry pattern.
   */
  async playUrisWithRetry(uris: string[], targetDeviceId?: string, offsetIndex?: number): Promise<void> {
    const retryDelays = [600, 900, 1200, 1500, 1800, 2100];
    const transient5xxDelays = [400, 900, 1500]; // Specific backoff for 5xx
    let attempt = 0;

    const execute = async (deviceId: string): Promise<void> => {
      const pattern = /^spotify:(track|episode):[a-zA-Z0-9]+$/;
      const safeUris = uris.filter(u => pattern.test(u));
      
      if (safeUris.length === 0) throw new Error("No valid tracks to play.");

      const body: any = { uris: safeUris };
      if (offsetIndex !== undefined) {
        body.offset = { position: offsetIndex };
      }

      await SpotifyApi.request(`/me/player/play?device_id=${encodeURIComponent(deviceId)}`, {
        method: 'PUT',
        body: JSON.stringify(body)
      });
    };

    while (attempt <= retryDelays.length) {
      try {
        apiLogger.logClick(`[PLAYBACK] Attempt ${attempt + 1}: Resolving device...`);
        const devices = await SpotifyApi.getDevices();
        const active = devices.find(d => d.is_active);
        const deviceToUse = targetDeviceId || active?.id || devices[0]?.id;

        if (!deviceToUse) {
          throw { status: 404, message: "No Spotify devices found. Open Spotify first." };
        }

        // Handshake: Transfer (if not active or first attempt)
        if (!active || active.id !== deviceToUse || attempt === 0) {
          apiLogger.logClick(`[PLAYBACK] Handshake: Transferring to ${deviceToUse}`);
          await this.transferPlayback(deviceToUse, false);
          // Wait for device to "wake up"
          await new Promise(r => setTimeout(r, 1000));
        }

        await execute(deviceToUse);
        apiLogger.logClick(`[PLAYBACK] Success on attempt ${attempt + 1}`);
        return; // Success!

      } catch (err: any) {
        const is404 = err.status === 404 || (err.message && err.message.includes('404'));
        const is5xx = [502, 503, 504].includes(err.status);
        
        if ((is404 || is5xx) && attempt < (is5xx ? transient5xxDelays.length : retryDelays.length)) {
          const delay = is5xx ? transient5xxDelays[attempt] : retryDelays[attempt];
          apiLogger.logClick(`[PLAYBACK] Spotify error ${err.status}. Retrying in ${delay}ms...`);
          await new Promise(r => setTimeout(r, delay));
          attempt++;
        } else {
          // Terminal error or non-retryable
          const msg = is5xx 
            ? "Spotify is temporarily unavailable. Try again."
            : `Playback Injection Failed (${err.status || 'ERR'}): ${err.message || 'Unknown Spotify error'}`;
          
          apiLogger.logError(msg);
          toastService.show(msg, "error");
          throw err;
        }
      }
    }
  }

  async playUrisOnDevice(deviceId: string, uris: string[], offsetIndex?: number): Promise<void> {
    // Legacy support wrapper
    return this.playUrisWithRetry(uris, deviceId, offsetIndex);
  }

  async setShuffle(state: boolean, deviceId?: string): Promise<void> {
    const query = deviceId 
      ? `?device_id=${encodeURIComponent(deviceId)}&state=${state}` 
      : `?state=${state}`;
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