
import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { RuleSettings, RunOption, SmartMixPlan, VibeType } from "../types";

/**
 * getMixInsight - Uses Gemini to generate AI-powered insights for the music mix.
 */
export const getMixInsight = async (option: RunOption, rules: RuleSettings): Promise<string> => {
  try {
    // Initialize Gemini API client inside the function to ensure up-to-date API key usage
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const response: GenerateContentResponse = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Provide a short, 1-sentence professional musicology insight for a user's playlist mix.
        Mix Name: ${option.name}
        Context: ${option.description}
        Settings: Length=${rules.playlistLength} tracks, Energy=${rules.calmHype}, Exploration=${rules.discoverLevel}.
        Insight:`,
    });

    // Directly access the .text property from GenerateContentResponse
    return response.text || "Sync Engine operational. Composing multi-source catalog...";
  } catch (error) {
    console.error("Gemini Mix Insight failed:", error);
    return "Sync Engine operational. Composing multi-source catalog...";
  }
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
