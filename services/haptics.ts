/**
 * Haptics - Standardized tactile feedback patterns for the Web.
 * Uses the iOS 18 "switch" attribute trick for high-fidelity haptics in PWA mode,
 * with a fallback to navigator.vibrate for supporting browsers.
 * NO EXPO OR NATIVE DEPENDENCIES.
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
    if (typeof document === 'undefined') return;
    const trigger = document.getElementById('haptic-trigger') as HTMLInputElement;
    if (trigger) {
      // Toggling a checkbox with 'switch' attribute triggers native haptics on iOS 18 PWA
      trigger.click();
    }
  },

  /**
   * Triggers an impact haptic based on the requested style.
   */
  impactAsync: async (style: ImpactFeedbackStyle) => {
    // 1. Try the iOS 18 switch trick first (Best for PWA)
    Haptics.triggerHaptic();

    // 2. Fallback to navigator.vibrate for Android/Chrome/Legacy iOS
    let duration = 10;
    if (style === ImpactFeedbackStyle.Medium) duration = 20;
    if (style === ImpactFeedbackStyle.Heavy) duration = 35;
    
    try {
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(duration);
      }
    } catch (e) {}
  },

  /**
   * Double-pulse for successful completions
   */
  success: () => {
    Haptics.triggerHaptic();
    try { 
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate([15, 40, 15]); 
      }
    } catch (e) {}
  },

  /**
   * Triple-stutter for errors
   */
  error: () => {
    Haptics.triggerHaptic();
    try { 
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate([50, 30, 50, 30, 50]); 
      }
    } catch (e) {}
  },

  // Shorthands
  light: () => Haptics.impactAsync(ImpactFeedbackStyle.Light),
  medium: () => Haptics.impactAsync(ImpactFeedbackStyle.Medium),
  heavy: () => Haptics.impactAsync(ImpactFeedbackStyle.Heavy),
  impact: () => Haptics.impactAsync(ImpactFeedbackStyle.Heavy),
};
