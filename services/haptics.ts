/**
 * Haptics - Standardized tactile feedback patterns mirroring expo-haptics.
 * Provides a fallback for non-supporting browsers using navigator.vibrate.
 */

export enum ImpactFeedbackStyle {
  Light = 'light',
  Medium = 'medium',
  Heavy = 'heavy',
}

export const Haptics = {
  /**
   * Triggers an impact haptic based on the requested style.
   */
  impactAsync: async (style: ImpactFeedbackStyle) => {
    let duration = 10;
    if (style === ImpactFeedbackStyle.Medium) duration = 20;
    if (style === ImpactFeedbackStyle.Heavy) duration = 35;
    
    try {
      if (navigator.vibrate) {
        navigator.vibrate(duration);
      }
    } catch (e) {}
  },

  /**
   * Double-pulse for successful completions (e.g., Save Mix)
   */
  success: () => {
    try { navigator.vibrate?.([15, 40, 15]); } catch (e) {}
  },

  /**
   * Triple-stutter for errors
   */
  error: () => {
    try { navigator.vibrate?.([50, 30, 50, 30, 50]); } catch (e) {}
  },

  // Legacy shorthands
  light: () => Haptics.impactAsync(ImpactFeedbackStyle.Light),
  medium: () => Haptics.impactAsync(ImpactFeedbackStyle.Medium),
  impact: () => Haptics.impactAsync(ImpactFeedbackStyle.Heavy),
};
