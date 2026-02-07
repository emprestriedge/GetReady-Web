import { SpotifyAuth } from './spotifyAuth';
import { SpotifyApi } from './spotifyApi';
import { apiLogger } from './apiLogger';
import { toastService } from './toastService';

class SpotifyPlaybackService {
  /**
   * ensureDeviceVisibleAndActive - Polls for a device to appear in the list.
   * Target for podcasts is typically the current smartphone.
   */
  async ensureDeviceVisibleAndActive(targetDeviceId?: string, maxWaitMs: number = 6000): Promise<string | null> {
    const startTime = Date.now();
    apiLogger.logClick(`[DEVICE] Polling for device visibility (target: ${targetDeviceId || 'smartphone'})...`);
    
    while (Date.now() - startTime < maxWaitMs) {
      try {
        const devices = await SpotifyApi.getDevices();
        
        // Match logic: specific ID, or currently active, or first smartphone/iPhone
        const found = targetDeviceId 
          ? devices.find(d => d.id === targetDeviceId)
          : devices.find(d => d.is_active) || devices.find(d => d.type.toLowerCase() === 'smartphone' || d.name.toLowerCase().includes('iphone'));

        if (found) {
          if (!found.is_active) {
            apiLogger.logClick(`[DEVICE] Found ${found.name}. Activating...`);
            await this.transferPlayback(found.id, false);
            // Wait for Spotify to acknowledge transfer
            await new Promise(r => setTimeout(r, 400));
          }
          return found.id;
        }
      } catch (e) {
        apiLogger.logError("Polling devices failed");
      }
      // Poll every 500ms as requested
      await new Promise(r => setTimeout(r, 500));
    }
    
    return null;
  }

  async ensureActiveDevice(targetDeviceId?: string): Promise<string> {
    const devices = await SpotifyApi.getDevices();
    const active = devices.find(d => d.is_active);
    
    if (targetDeviceId && active?.id === targetDeviceId) return targetDeviceId;
    
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
   * playUrisWithRetry - Injection with specific 5xx backoff logic.
   */
  async playUrisWithRetry(uris: string[], targetDeviceId?: string, offsetIndex?: number): Promise<void> {
    const transient5xxDelays = [400, 900, 1500];
    let attempt = 0;

    const execute = async (deviceId: string): Promise<void> => {
      const pattern = /^spotify:(track|episode):[a-zA-Z0-9]+$/;
      const safeUris = uris.filter(u => pattern.test(u));
      
      if (safeUris.length === 0) throw new Error("No valid items to play.");

      const body: any = { 
        uris: safeUris,
        position_ms: 0 
      };
      
      if (offsetIndex !== undefined && offsetIndex >= 0) {
        body.offset = { position: offsetIndex };
      }

      await SpotifyApi.request(`/me/player/play?device_id=${encodeURIComponent(deviceId)}`, {
        method: 'PUT',
        body: JSON.stringify(body)
      });
    };

    while (true) {
      try {
        const deviceToUse = targetDeviceId || await this.ensureActiveDevice();
        await execute(deviceToUse);
        return;
      } catch (err: any) {
        const is5xx = [502, 503, 504].includes(err.status);
        const canRetry = is5xx && attempt < transient5xxDelays.length;

        if (canRetry) {
          const delay = transient5xxDelays[attempt];
          apiLogger.logClick(`[PLAYBACK] Spotify ${err.status}. Retry ${attempt + 1} in ${delay}ms...`);
          await new Promise(r => setTimeout(r, delay));
          attempt++;
        } else {
          // Final failure: show one toast
          const msg = is5xx 
            ? "Spotify is temporarily unavailable. Try again."
            : `Playback Injection Failed: ${err.message || 'Unknown error'}`;
          
          apiLogger.logError(msg);
          toastService.show(msg, "error");
          throw err;
        }
      }
    }
  }

  async playUrisOnDevice(deviceId: string, uris: string[], offsetIndex?: number): Promise<void> {
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