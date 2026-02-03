import { apiLogger } from './apiLogger';

/**
 * CooldownStore - Manages a rolling history of tracks used in generated playlists.
 * Prevents songs from repeating within a strict 3-day window.
 */

const STORAGE_KEY = 'getready_track_cooldown';
const COOLDOWN_DAYS = 3;

interface CooldownHistory {
  [trackId: string]: number; // ID to Timestamp (ms)
}

export const CooldownStore = {
  /**
   * Retrieves the current cooldown mapping from storage.
   */
  getHistory: (): CooldownHistory => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : {};
    } catch (e) {
      return {};
    }
  },

  /**
   * Checks if a track is currently on cooldown.
   */
  isRestricted: (id: string): boolean => {
    const history = CooldownStore.getHistory();
    const lastUsed = history[id];
    if (!lastUsed) return false;

    const cooldownMs = COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
    const elapsed = Date.now() - lastUsed;
    
    return elapsed < cooldownMs;
  },

  /**
   * Marks a set of tracks as "used", resetting their cooldown timer.
   * Also performs a cleanup of expired entries.
   */
  markUsed: (ids: string[]) => {
    if (ids.length === 0) return;
    
    const history = CooldownStore.getHistory();
    const now = Date.now();
    const cooldownMs = COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
    
    // Add new tracks
    ids.forEach(id => {
      history[id] = now;
    });

    // Cleanup old entries
    const cleanHistory: CooldownHistory = {};
    let purged = 0;
    
    Object.entries(history).forEach(([id, ts]) => {
      if (now - ts < cooldownMs) {
        cleanHistory[id] = ts;
      } else {
        purged++;
      }
    });

    localStorage.setItem(STORAGE_KEY, JSON.stringify(cleanHistory));
    
    if (purged > 0) {
      apiLogger.logClick(`Cooldown: Pruned ${purged} expired tracks from history.`);
    }
  }
};
