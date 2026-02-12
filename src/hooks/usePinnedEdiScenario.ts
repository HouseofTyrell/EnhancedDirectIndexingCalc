import { useState, useEffect, useCallback } from 'react';
import { STORAGE_KEYS } from '../constants/storageKeys';
import type {
  EdiPinnedScenario,
  EdiPinnedAssumptions,
  EdiPinnedTaxRates,
  EdiPinnedResults,
} from '../types';
import { getStrategy } from '../strategyData';
import { formatCurrencyAbbreviated } from '../utils/formatters';

const STORAGE_KEY = STORAGE_KEYS.PINNED_EDI_SCENARIO;

function isEdiPinnedScenario(value: unknown): value is EdiPinnedScenario {
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
    hasOwn.call(obj, 'assumptions') &&
    typeof obj.assumptions === 'object' &&
    obj.assumptions !== null &&
    hasOwn.call(obj, 'taxRates') &&
    typeof obj.taxRates === 'object' &&
    obj.taxRates !== null &&
    hasOwn.call(obj, 'results') &&
    typeof obj.results === 'object' &&
    obj.results !== null
  );
}

function generateLabel(assumptions: EdiPinnedAssumptions, taxRates: EdiPinnedTaxRates): string {
  const strategy = getStrategy(assumptions.strategyId);
  const strategyName = strategy?.name ?? assumptions.strategyId;
  const collateral = formatCurrencyAbbreviated(assumptions.collateralValue);
  return `${taxRates.stateCode} ${collateral} / ${strategyName} / ${assumptions.projectionYears}yr`;
}

export interface UsePinnedEdiScenarioReturn {
  pinned: EdiPinnedScenario | null;
  hasPinned: boolean;
  pin: (assumptions: EdiPinnedAssumptions, taxRates: EdiPinnedTaxRates, results: EdiPinnedResults, label?: string) => void;
  unpin: () => void;
  replacePin: (assumptions: EdiPinnedAssumptions, taxRates: EdiPinnedTaxRates, results: EdiPinnedResults, label?: string) => void;
}

export function usePinnedEdiScenario(): UsePinnedEdiScenarioReturn {
  const [pinned, setPinned] = useState<EdiPinnedScenario | null>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed: unknown = JSON.parse(stored);
        if (isEdiPinnedScenario(parsed)) {
          return parsed;
        }
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch (e) {
      console.warn('Failed to load pinned EDI scenario:', e);
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
      console.warn('Failed to save pinned EDI scenario:', e);
    }
  }, [pinned]);

  const pin = useCallback(
    (assumptions: EdiPinnedAssumptions, taxRates: EdiPinnedTaxRates, results: EdiPinnedResults, label?: string) => {
      setPinned({
        id: crypto.randomUUID(),
        label: label ?? generateLabel(assumptions, taxRates),
        pinnedAt: Date.now(),
        assumptions: structuredClone(assumptions),
        taxRates: structuredClone(taxRates),
        results: structuredClone(results),
      });
    },
    []
  );

  const unpin = useCallback(() => {
    setPinned(null);
  }, []);

  const replacePin = useCallback(
    (assumptions: EdiPinnedAssumptions, taxRates: EdiPinnedTaxRates, results: EdiPinnedResults, label?: string) => {
      pin(assumptions, taxRates, results, label);
    },
    [pin]
  );

  return {
    pinned,
    hasPinned: pinned !== null,
    pin,
    unpin,
    replacePin,
  };
}
