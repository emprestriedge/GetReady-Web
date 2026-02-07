import { SpotifyAuth } from './spotifyAuth';
import { SpotifyApi } from './spotifyApi';
import { apiLogger } from './apiLogger';
import { toastService } from './toastService';

class SpotifyPlaybackService {
  /**
   * handshakeDevice - Specialized polling for podcasts.
   * Ensures the Spotify API "sees" the device as the active player before we send a Play command.
   */
  private async handshakeDevice(targetDeviceId: string, maxAttempts: number = 8): Promise<boolean> {
    apiLogger.logClick(`[HANDSHAKE] Starting device handshake for ${targetDeviceId}...`);
    
    // 1. Force a transfer with play:false to anchor the session
    try {
      await this.transferPlayback(targetDeviceId, false);
    } catch (e) {
      return false;
    }

    // 2. Poll until /me/player returns 200 AND matches our device
    for (let i = 0; i < maxAttempts; i++) {
      try {
        // Must include episode type to get a 200 back for podcast sessions
        const state = await SpotifyApi.request('/me/player?additional_types=track,episode', { silent: true } as any);
        
        if (state && state.device && state.device.id === targetDeviceId) {
          apiLogger.logClick(`[HANDSHAKE] Success on attempt ${i + 1}. Device confirmed active.`);
          return true;
        }
      } catch (e) {
        // Ignore errors during handshake polling
      }
      await new Promise(r => setTimeout(r, 600));
    }

    apiLogger.logClick(`[HANDSHAKE] Failed after ${maxAttempts} attempts.`);
    return false;
  }

  async ensureDeviceVisibleAndActive(targetDeviceId?: string, maxWaitMs: number = 6000): Promise<string | null> {
    const startTime = Date.now();
    apiLogger.logClick(`[DEVICE] Polling for device visibility (target: ${targetDeviceId || 'smartphone'})...`);
    
    while (Date.now() - startTime < maxWaitMs) {
      try {
        const devices = await SpotifyApi.getDevices();
        
        const found = targetDeviceId 
          ? devices.find(d => d.id === targetDeviceId)
          : devices.find(d => d.is_active) || devices.find(d => d.type.toLowerCase() === 'smartphone' || d.name.toLowerCase().includes('iphone'));

        if (found) {
          if (!found.is_active) {
            apiLogger.logClick(`[DEVICE] Found ${found.name}. Activating...`);
            await this.transferPlayback(found.id, false);
            await new Promise(r => setTimeout(r, 400));
          }
          return found.id;
        }
      } catch (e) {
        apiLogger.logError("Polling devices failed");
      }
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

  async playUrisWithRetry(uris: string[], targetDeviceId?: string, offsetIndex?: number): Promise<void> {
    const isPodcast = uris.some(u => u.includes(':episode:'));
    const transient5xxDelays = [400, 900, 1500];
    let attempt = 0;
    let hasRetriedHandshake = false;

    const executePlay = async (deviceId: string): Promise<void> => {
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

      // Use silent: true so we can handle the 404/204 state locally without a generic toast surfacing immediately
      await SpotifyApi.request(`/me/player/play?device_id=${encodeURIComponent(deviceId)}`, {
        method: 'PUT',
        body: JSON.stringify(body),
        silent: true 
      } as any);
    };

    const deviceToUse = targetDeviceId || await this.ensureDeviceVisibleAndActive();
    if (!deviceToUse) {
      throw new Error("No available Spotify device found.");
    }

    if (isPodcast) {
      await this.handshakeDevice(deviceToUse);
    }

    while (attempt < 4) {
      try {
        await executePlay(deviceToUse);
        return;
      } catch (err: any) {
        const is5xx = [502, 503, 504].includes(err.status);
        const is404 = err.status === 404;

        if (is5xx && attempt < transient5xxDelays.length) {
          const delay = transient5xxDelays[attempt];
          apiLogger.logClick(`[PLAYBACK] Spotify ${err.status}. Retry ${attempt + 1} in ${delay}ms...`);
          await new Promise(r => setTimeout(r, delay));
          attempt++;
          continue;
        }

        // Handle the specific Podcast 404 (Device/Player Inactive)
        if (is404 && isPodcast && !hasRetriedHandshake) {
          apiLogger.logClick(`[PLAYBACK] Podcast 404 detected. Retrying handshake...`);
          hasRetriedHandshake = true;
          await this.handshakeDevice(deviceToUse);
          attempt++;
          continue;
        }

        // Final failure handling
        if (is404 && isPodcast) {
           const msg = "Open Spotify on your iPhone and press Play once, then return and tap Play again.";
           apiLogger.logError(`Podcast Injection Failed (Permanent 404): ${msg}`);
           toastService.show(msg, "warning");
           throw err;
        }

        const msg = is5xx 
          ? "Spotify is temporarily unavailable. Try again."
          : `Playback Injection Failed: ${err.message || 'Unknown error'}`;
        
        apiLogger.logError(msg);
        toastService.show(msg, "error");
        throw err;
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