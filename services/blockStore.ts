
import { BlockedTrack } from '../types';

const STORAGE_KEY = 'blocked_tracks';

export const BlockStore = {
  /**
   * Returns all blocked items as full BlockedTrack objects.
   * Matches the usage in BlockedTracksView and SettingsView.
   */
  getBlocked: (): BlockedTrack[] => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : [];
  },

  /**
   * Returns a list of IDs (URIs) for all blocked tracks.
   */
  getAll: (): string[] => {
    return BlockStore.getBlocked().map(t => t.id);
  },

  /**
   * Checks if a specific ID or URI is in the block list.
   */
  isBlocked: (id: string): boolean => {
    const blocked = BlockStore.getAll();
    return blocked.includes(id);
  },

  /**
   * Adds a track to the block list with metadata.
   */
  add: (track: BlockedTrack): void => {
    const blocked = BlockStore.getBlocked();
    if (blocked.some(t => t.id === track.id)) return;
    
    const updated = [track, ...blocked];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  },

  /**
   * Removes a track from the block list by ID.
   */
  removeBlocked: (id: string): void => {
    const blocked = BlockStore.getBlocked();
    const filtered = blocked.filter(t => t.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
  }
};
