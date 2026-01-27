
/**
 * Haptics - Standardized tactile feedback patterns.
 * Provides a fallback for non-supporting browsers.
 */
export const Haptics = {
  /**
   * Subtle tap for navigation or selection (10ms)
   */
  light: () => {
    try { navigator.vibrate?.(10); } catch (e) {}
  },

  /**
   * Firm tap for switches or state changes (20ms)
   */
  medium: () => {
    try { navigator.vibrate?.(20); } catch (e) {}
  },

  /**
   * Heavy impact for primary actions like "Initialize Sync" (35ms)
   */
  impact: () => {
    try { navigator.vibrate?.(35); } catch (e) {}
  },

  /**
   * Double-pulse for successful completions
   */
  success: () => {
    try { navigator.vibrate?.([15, 40, 15]); } catch (e) {}
  },

  /**
   * Triple-stutter for errors or invalid actions
   */
  error: () => {
    try { navigator.vibrate?.([50, 30, 50, 30, 50]); } catch (e) {}
  }
};
