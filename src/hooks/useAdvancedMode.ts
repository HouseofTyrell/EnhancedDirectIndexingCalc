import { useState, useEffect } from 'react';

export interface AdvancedModeState {
  enabled: boolean;
  sections: {
    yearByYear: boolean;
    sensitivity: boolean;
    scenarios: boolean;
    comparison: boolean;
    settings: boolean;
  };
}

const STORAGE_KEY = 'taxCalc_advancedMode';

const DEFAULT_STATE: AdvancedModeState = {
  enabled: false,
  sections: {
    yearByYear: false,
    sensitivity: false,
    scenarios: false,
    comparison: false,
    settings: false,
  },
};

/**
 * Type guard to validate localStorage data matches AdvancedModeState shape.
 * Prevents prototype pollution and runtime errors from corrupted data.
 */
function isAdvancedModeState(value: unknown): value is AdvancedModeState {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  // Use Object.prototype.hasOwnProperty to avoid prototype pollution
  const hasOwnProperty = Object.prototype.hasOwnProperty;
  const obj = value as Record<string, unknown>;

  // Check 'enabled' property
  if (!hasOwnProperty.call(obj, 'enabled') || typeof obj.enabled !== 'boolean') {
    return false;
  }

  // Check 'sections' property
  if (!hasOwnProperty.call(obj, 'sections') || typeof obj.sections !== 'object' || obj.sections === null) {
    return false;
  }

  const sections = obj.sections as Record<string, unknown>;
  const requiredSections = ['yearByYear', 'sensitivity', 'scenarios', 'comparison', 'settings'];

  for (const section of requiredSections) {
    if (!hasOwnProperty.call(sections, section) || typeof sections[section] !== 'boolean') {
      return false;
    }
  }

  return true;
}

export function useAdvancedMode() {
  const [state, setState] = useState<AdvancedModeState>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        // Parse and validate the structure before using
        const parsed: unknown = JSON.parse(stored);
        if (isAdvancedModeState(parsed)) {
          return parsed;
        }
        // Invalid structure - clear corrupted data
        localStorage.removeItem(STORAGE_KEY);
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
