/**
 * Haptics - Standardized tactile feedback patterns mirroring expo-haptics.
 * Provides a fallback for non-supporting browsers using navigator.vibrate.
 * Integrated with the iOS 18 "switch" attribute trick for native-feel haptics.
 */

export enum ImpactFeedbackStyle {
  Light = 'light',
  Medium = 'medium',
  Heavy = 'heavy',
}

export const Haptics = {
  /**
   * triggerHaptic - The iOS 18 "switch trick". Toggles a hidden checkbox 
   * with the 'switch' attribute to trigger a system-level haptic.
   */
  triggerHaptic: () => {
    const trigger = document.getElementById('haptic-trigger') as HTMLInputElement;
    if (trigger) {
      // Toggling a checkbox with 'switch' attribute triggers native haptics on iOS 18
      trigger.click();
    }
  },

  /**
   * Triggers an impact haptic based on the requested style.
   */
  impactAsync: async (style: ImpactFeedbackStyle) => {
    // 1. Try the iOS 18 switch trick first
    Haptics.triggerHaptic();

    // 2. Fallback to navigator.vibrate for older iOS/Android/Chrome
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
    Haptics.triggerHaptic();
    try { navigator.vibrate?.([15, 40, 15]); } catch (e) {}
  },

  /**
   * Triple-stutter for errors
   */
  error: () => {
    Haptics.triggerHaptic();
    try { navigator.vibrate?.([50, 30, 50, 30, 50]); } catch (e) {}
  },

  // Legacy shorthands
  light: () => Haptics.impactAsync(ImpactFeedbackStyle.Light),
  medium: () => Haptics.impactAsync(ImpactFeedbackStyle.Medium),
  impact: () => Haptics.impactAsync(ImpactFeedbackStyle.Heavy),
};
