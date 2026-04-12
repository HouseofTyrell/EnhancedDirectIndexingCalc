import { useState, useEffect, useCallback } from 'react';
import { STORAGE_KEYS } from '../constants/storageKeys';
import {
  CalculatorInputs,
  AdvancedSettings,
  CalculationResult,
  PinnedScenario,
} from '../types';
import { getStrategy } from '../strategyData';
import { formatCurrencyAbbreviated } from '../utils/formatters';

const STORAGE_KEY = STORAGE_KEYS.PINNED_SCENARIO;
const MAX_SCENARIOS = 4;

/**
 * Type guard to validate localStorage data matches PinnedScenario shape.
 */
function isPinnedScenario(value: unknown): value is PinnedScenario {
  if (typeof value !== 'object' || value === null) return false;

  const hasOwn = Object.prototype.hasOwnProperty;
  const obj = value as Record<string, unknown>;

  return (
    hasOwn.call(obj, 'id') &&
    typeof obj.id === 'string' &&
    hasOwn.call(obj, 'label') &&
    typeof obj.label === 'string' &&
    hasOwn.call(obj, 'pinnedAt') &&
    typeof obj.pinnedAt === 'number' &&
    hasOwn.call(obj, 'inputs') &&
    typeof obj.inputs === 'object' &&
    obj.inputs !== null &&
    hasOwn.call(obj, 'advancedSettings') &&
    typeof obj.advancedSettings === 'object' &&
    obj.advancedSettings !== null &&
    hasOwn.call(obj, 'results') &&
    typeof obj.results === 'object' &&
    obj.results !== null
  );
}

/**
 * Load stored scenarios, handling both legacy single-object and new array formats.
 */
function loadStoredScenarios(): PinnedScenario[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    const parsed: unknown = JSON.parse(stored);

    // New format: array of scenarios
    if (Array.isArray(parsed)) {
      return parsed.filter(isPinnedScenario);
    }

    // Legacy format: single scenario object — migrate to array
    if (isPinnedScenario(parsed)) {
      return [parsed];
    }

    localStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    console.warn('Failed to load pinned scenarios:', e);
  }
  return [];
}

/**
 * Generate a human-readable label from inputs.
 * Includes sizing mode to distinguish fixed vs dynamic for the same strategy.
 * e.g. "CA $3.0M / Core 130/30 (Dynamic)"
 */
function generateLabel(inputs: CalculatorInputs): string {
  const strategy = getStrategy(inputs.strategyId);
  const strategyName = strategy?.name ?? inputs.strategyId;
  const collateral = formatCurrencyAbbreviated(inputs.collateralAmount);
  const sizingMode = inputs.qfafEnabled
    ? ` (${inputs.qfafSizingMode === 'dynamic' ? 'Dynamic' : 'Fixed'})`
    : '';
  return `${inputs.stateCode} ${collateral} / ${strategyName}${sizingMode}`;
}

export interface UsePinnedScenarioReturn {
  /** All pinned scenarios (up to 4) */
  scenarios: PinnedScenario[];
  /** Legacy compat: first pinned scenario or null */
  pinned: PinnedScenario | null;
  /** Whether any scenarios are pinned */
  hasPinned: boolean;
  /** Whether we can pin more (< MAX_SCENARIOS) */
  canPin: boolean;
  /** Pin current state as a new scenario */
  pin: (inputs: CalculatorInputs, settings: AdvancedSettings, results: CalculationResult, label?: string) => void;
  /** Remove a specific scenario by id */
  unpin: (id?: string) => void;
  /** Remove all pinned scenarios */
  unpinAll: () => void;
  /** Replace a specific scenario by id with new state */
  replacePin: (inputs: CalculatorInputs, settings: AdvancedSettings, results: CalculationResult, label?: string) => void;
  /** Get pinned state for restore (uses first scenario) */
  getPinnedState: () => { inputs: CalculatorInputs; advancedSettings: AdvancedSettings } | null;
}

export function usePinnedScenario(): UsePinnedScenarioReturn {
  const [scenarios, setScenarios] = useState<PinnedScenario[]>(loadStoredScenarios);

  useEffect(() => {
    try {
      if (scenarios.length > 0) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(scenarios));
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch (e) {
      console.warn('Failed to save pinned scenarios:', e);
    }
  }, [scenarios]);

  const pin = useCallback(
    (inputs: CalculatorInputs, settings: AdvancedSettings, results: CalculationResult, label?: string) => {
      setScenarios(prev => {
        if (prev.length >= MAX_SCENARIOS) return prev; // silently reject if full
        const newScenario: PinnedScenario = {
          id: crypto.randomUUID(),
          label: label ?? generateLabel(inputs),
          pinnedAt: Date.now(),
          inputs: structuredClone(inputs),
          advancedSettings: structuredClone(settings),
          results: structuredClone(results),
        };
        return [...prev, newScenario];
      });
    },
    []
  );

  const unpin = useCallback((id?: string) => {
    setScenarios(prev => {
      if (!id) {
        // Legacy compat: remove the last scenario if no id given
        return prev.slice(0, -1);
      }
      return prev.filter(s => s.id !== id);
    });
  }, []);

  const unpinAll = useCallback(() => {
    setScenarios([]);
  }, []);

  const replacePin = useCallback(
    (inputs: CalculatorInputs, settings: AdvancedSettings, results: CalculationResult, label?: string) => {
      // Replace the most recent scenario, or add if none exist
      setScenarios(prev => {
        const newScenario: PinnedScenario = {
          id: crypto.randomUUID(),
          label: label ?? generateLabel(inputs),
          pinnedAt: Date.now(),
          inputs: structuredClone(inputs),
          advancedSettings: structuredClone(settings),
          results: structuredClone(results),
        };
        if (prev.length === 0) return [newScenario];
        return [...prev.slice(0, -1), newScenario];
      });
    },
    []
  );

  const getPinnedState = useCallback(() => {
    if (scenarios.length === 0) return null;
    const first = scenarios[0];
    return {
      inputs: structuredClone(first.inputs),
      advancedSettings: structuredClone(first.advancedSettings),
    };
  }, [scenarios]);

  return {
    scenarios,
    pinned: scenarios.length > 0 ? scenarios[0] : null,
    hasPinned: scenarios.length > 0,
    canPin: scenarios.length < MAX_SCENARIOS,
    pin,
    unpin,
    unpinAll,
    replacePin,
    getPinnedState,
  };
}
