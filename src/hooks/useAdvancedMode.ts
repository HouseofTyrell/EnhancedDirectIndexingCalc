import { useState, useEffect } from 'react';

export interface AdvancedModeState {
  enabled: boolean;
  sections: {
    yearByYear: boolean;
    sensitivity: boolean;
    comparison: boolean;
  };
}

const STORAGE_KEY = 'taxCalc_advancedMode';

const DEFAULT_STATE: AdvancedModeState = {
  enabled: false,
  sections: {
    yearByYear: false,
    sensitivity: false,
    comparison: false,
  },
};

export function useAdvancedMode() {
  const [state, setState] = useState<AdvancedModeState>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (e) {
      // localStorage not available or invalid JSON
    }
    return DEFAULT_STATE;
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      // localStorage not available
    }
  }, [state]);

  const toggleEnabled = () => {
    setState(s => ({ ...s, enabled: !s.enabled }));
  };

  const toggleSection = (section: keyof AdvancedModeState['sections']) => {
    setState(s => ({
      ...s,
      sections: { ...s.sections, [section]: !s.sections[section] },
    }));
  };

  const reset = () => {
    setState(DEFAULT_STATE);
  };

  return {
    state,
    toggleEnabled,
    toggleSection,
    reset,
  };
}
