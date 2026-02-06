/**
 * spotifyUriToOpenUrl - Converts internal Spotify URIs to standard HTTPS URLs.
 */
export function spotifyUriToOpenUrl(uri: string): string {
  if (!uri) return 'https://open.spotify.com/';
  if (uri.startsWith('https://') || uri.startsWith('http://')) return uri;

  let clean = uri;
  if (uri.startsWith('spotify://')) {
    clean = uri.replace('spotify://', 'spotify:').replace('/', ':');
  }

  const parts = clean.split(':');
  if (parts[0] === 'spotify' && parts.length >= 3) {
    return `https://open.spotify.com/${parts[1]}/${parts[2]}`;
  }
  return 'https://open.spotify.com/';
}

/**
 * extractSpotifyId - Extracts a clean 22-character ID from any Spotify format.
 * Supports: 
 * - https://open.spotify.com/playlist/37i9dQZF1DXcBWm9pBmgJu?si=...
 * - spotify:playlist:37i9dQZF1DXcBWm9pBmgJu
 * - spotify://playlist/37i9dQZF1DXcBWm9pBmgJu
 * - 37i9dQZF1DXcBWm9pBmgJu
 */
export function extractSpotifyId(input: string, type: 'playlist' | 'album' | 'track' | 'episode' | 'artist'): string {
  if (!input) return '';
  let str = input.trim();

  // 1. Handle Web URLs
  if (str.includes('open.spotify.com/')) {
    const partAfterType = str.split(`/${type}/`)[1];
    if (partAfterType) {
      return partAfterType.split('?')[0].split('/')[0];
    }
  }

  // 2. Handle URIs (spotify:type:id or spotify://type/id)
  if (str.startsWith('spotify:')) {
    const parts = str.replace('spotify://', 'spotify:').split(':');
    // For URIs like spotify:playlist:ID or spotify:ID (if type omitted)
    if (parts.length >= 3 && parts[1] === type) return parts[2];
    if (parts.length === 2) return parts[1];
  }

  // 3. Fallback: Return raw string but strip query params
  return str.split('?')[0];
}
