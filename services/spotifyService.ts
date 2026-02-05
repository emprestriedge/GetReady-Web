/**
 * spotifyService - Low-level Spotify API utilities for direct playback control.
 */
export const spotifyService = {
  /**
   * play - Direct PUT request to Spotify's playback endpoint.
   * Ensures the 'uris' payload is strictly an array to avoid API pattern errors.
   */
  play: async (token: string, deviceId: string, uris: string[] | string) => {
    const url = `https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`;
    
    // FORCE-FIX: Ensure 'uris' is always an array of strings.
    // This fixes the "String did not match expected pattern" error.
    const safeUris = Array.isArray(uris) ? uris : [uris];

    const body = JSON.stringify({
      uris: safeUris, 
      position_ms: 0
    });

    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: body
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error("Spotify Play Error:", errorData);
      return false;
    }
    return true;
  }
};