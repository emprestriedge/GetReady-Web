
import { RuleOverride, RuleOverridesMap } from '../types';

const STORAGE_KEY = 'spotify_buddy_rule_overrides';

export const RuleOverrideStore = {
  getAll: (): RuleOverridesMap => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : {};
  },
  getForOption: (optionId: string): RuleOverride | undefined => {
    return RuleOverrideStore.getAll()[optionId];
  },
  setForOption: (optionId: string, override: RuleOverride | null): void => {
    const all = RuleOverrideStore.getAll();
    if (override === null || Object.keys(override).length === 0) {
      delete all[optionId];
    } else {
      all[optionId] = override;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  }
};
