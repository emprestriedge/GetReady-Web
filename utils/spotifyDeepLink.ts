/**
 * spotifyUriToOpenUrl - Converts internal Spotify URIs to standard HTTPS URLs.
 * Standard browsers launch the app automatically from https://open.spotify.com links.
 * This avoids "The string did not match the expected pattern" errors on iOS.
 */
export function spotifyUriToOpenUrl(uri: string): string {
  if (!uri) return 'https://open.spotify.com/';
  
  // Return as-is if already an HTTPS URL
  if (uri.startsWith('https://') || uri.startsWith('http://')) {
    return uri;
  }

  // Handle spotify://type/id or spotify:type:id format
  let clean = uri;
  if (uri.startsWith('spotify://')) {
    clean = uri.replace('spotify://', 'spotify:').replace('/', ':');
  }

  const parts = clean.split(':');
  if (parts[0] === 'spotify' && parts.length >= 3) {
    const type = parts[1];
    const id = parts[2];
    return `https://open.spotify.com/${type}/${id}`;
  }

  return 'https://open.spotify.com/';
}
