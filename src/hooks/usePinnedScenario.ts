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
 * Generate a human-readable label from inputs.
 * e.g. "CA $3.0M / Overlay 45/45"
 */
function generateLabel(inputs: CalculatorInputs): string {
  const strategy = getStrategy(inputs.strategyId);
  const strategyName = strategy?.name ?? inputs.strategyId;
  const collateral = formatCurrencyAbbreviated(inputs.collateralAmount);
  return `${inputs.stateCode} ${collateral} / ${strategyName}`;
}

export interface UsePinnedScenarioReturn {
  pinned: PinnedScenario | null;
  hasPinned: boolean;
  pin: (inputs: CalculatorInputs, settings: AdvancedSettings, results: CalculationResult, label?: string) => void;
  unpin: () => void;
  replacePin: (inputs: CalculatorInputs, settings: AdvancedSettings, results: CalculationResult, label?: string) => void;
  getPinnedState: () => { inputs: CalculatorInputs; advancedSettings: AdvancedSettings } | null;
}

export function usePinnedScenario(): UsePinnedScenarioReturn {
  const [pinned, setPinned] = useState<PinnedScenario | null>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed: unknown = JSON.parse(stored);
        if (isPinnedScenario(parsed)) {
          return parsed;
        }
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch (e) {
      console.warn('Failed to load pinned scenario:', e);
    }
    return null;
  });

  useEffect(() => {
    try {
      if (pinned) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(pinned));
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch (e) {
      console.warn('Failed to save pinned scenario:', e);
    }
  }, [pinned]);

  const pin = useCallback(
    (inputs: CalculatorInputs, settings: AdvancedSettings, results: CalculationResult, label?: string) => {
      setPinned({
        id: crypto.randomUUID(),
        label: label ?? generateLabel(inputs),
        pinnedAt: Date.now(),
        inputs: structuredClone(inputs),
        advancedSettings: structuredClone(settings),
        results: structuredClone(results),
      });
    },
    []
  );

  const unpin = useCallback(() => {
    setPinned(null);
  }, []);

  const replacePin = useCallback(
    (inputs: CalculatorInputs, settings: AdvancedSettings, results: CalculationResult, label?: string) => {
      pin(inputs, settings, results, label);
    },
    [pin]
  );

  const getPinnedState = useCallback(() => {
    if (!pinned) return null;
    return {
      inputs: structuredClone(pinned.inputs),
      advancedSettings: structuredClone(pinned.advancedSettings),
    };
  }, [pinned]);

  return {
    pinned,
    hasPinned: pinned !== null,
    pin,
    unpin,
    replacePin,
    getPinnedState,
  };
}
