import { GoogleGenAI } from "@google/genai";
import { RuleSettings, RunOption, SmartMixPlan, VibeType } from "../types";

/**
 * getMixInsight - Kept for legacy run modes, but logic is simplified.
 */
export const getMixInsight = async (option: RunOption, rules: RuleSettings): Promise<string> => {
  return "Sync Engine operational. Composing multi-source catalog...";
};

/**
 * getSmartMixPlan - Returns a deterministic preview of the composition engine's counts.
 */
export const getSmartMixPlan = async (
  vibe: VibeType,
  discoverLevel: number,
  calmHype: number,
  playlistLength: number = 35 // Added playlistLength for summary accuracy
): Promise<SmartMixPlan> => {
  const baseCounts: Record<VibeType, any> = {
    Zen: { acoustic: 20, a7x: 6, liked: 7, shazam: 2, rap: 0 },
    Focus: { acoustic: 14, a7x: 6, liked: 13, shazam: 2, rap: 0 },
    Chaos: { acoustic: 5, a7x: 6, liked: 12, shazam: 12, rap: 0 },
    LighteningMix: { acoustic: 0, a7x: 10, liked: 4, shazam: 7, rap: 14 },
  };

  const scale = playlistLength / 35;
  const counts = { ...baseCounts[vibe] };
  
  // Scale base counts
  Object.keys(counts).forEach(k => counts[k] = Math.round(counts[k] * scale));

  // Apply Calm/Hype Fine-tuning
  const shift = Math.round(6 * scale);
  if (calmHype <= 0.33) {
    counts.acoustic += shift;
    if (counts.rap >= shift) counts.rap -= shift; else if (counts.shazam >= shift) counts.shazam -= shift;
  } else if (calmHype >= 0.67) {
    counts.acoustic = Math.max(0, counts.acoustic - shift);
    if (vibe === 'Zen' || vibe === 'Focus') counts.shazam += shift; else counts.rap += shift;
  }

  const newCount = Math.round(playlistLength * discoverLevel);
  // Summary adjustment
  const actualLiked = Math.max(0, counts.liked - Math.floor(newCount / 2));
  const actualShazam = Math.max(0, counts.shazam - Math.ceil(newCount / 2));

  return {
    preset: `${vibe} Vibe Composition`,
    summary: `Acoustic ${counts.acoustic} • A7X ${counts.a7x} • Shazam ${actualShazam} • Liked ${actualLiked} • Rap ${counts.rap} • New ${newCount}`
  };
};