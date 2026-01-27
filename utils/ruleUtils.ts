
import { RuleSettings, RuleOverride } from '../types';

export const getEffectiveRules = (global: RuleSettings, override?: RuleOverride): RuleSettings => {
  if (!override) return global;
  
  return {
    ...global,
    playlistLength: override.playlistLength ?? global.playlistLength,
    allowExplicit: override.allowExplicit ?? global.allowExplicit,
    avoidRepeats: override.avoidRepeats ?? global.avoidRepeats,
  };
};
