
import { BlockedTrack, Track, SpotifyTrack } from '../types';

const STORAGE_KEY = 'blockedTracks';

export const BlockStore = {
  getBlocked: (): BlockedTrack[] => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : [];
  },

  isBlocked: (id: string): boolean => {
    const blocked = BlockStore.getBlocked();
    return blocked.some(t => t.id === id);
  },

  addBlocked: (track: SpotifyTrack | Track): void => {
    const blocked = BlockStore.getBlocked();
    // Simplified ID extraction since both types in the union (SpotifyTrack and Track) have 'id' and 'uri'
    const id = track.id || track.uri.split(':').pop() || '';
    
    if (blocked.some(t => t.id === id)) return;

    const newBlocked: BlockedTrack = {
      id,
      name: ('name' in track) ? track.name : (track as Track).title,
      artist: ('artists' in track) ? track.artists[0].name : (track as Track).artist,
      album: ('album' in track) ? (typeof track.album === 'string' ? track.album : (track.album as any)?.name) : (track as Track).album,
      addedAt: new Date().toISOString()
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify([newBlocked, ...blocked]));
  },

  removeBlocked: (id: string): void => {
    const blocked = BlockStore.getBlocked();
    const filtered = blocked.filter(t => t.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
  }
};
