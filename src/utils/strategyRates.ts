import { STRATEGIES, LOSS_RATE_DECAY_FACTOR, LOSS_RATE_FLOOR } from '../strategyData';

const STORAGE_KEY = 'strategy-rate-overrides';

// Type for year-by-year rate overrides
// Key format: `${strategyId}-${year}` -> net capital loss rate value
export type StrategyRateOverrides = Record<string, number>;

/**
 * Calculate the default net capital loss rate for a strategy/year (with decay)
 * This is ST Loss Rate - LT Gain Rate, with 7% annual decay
 */
export function getDefaultNetCapitalLossRate(strategyId: string, year: number): number {
  const strategy = STRATEGIES.find(s => s.id === strategyId);
  if (!strategy) return 0;

  const baseNetRate = strategy.stLossRate - strategy.ltGainRate;
  const decayedRate = baseNetRate * Math.pow(LOSS_RATE_DECAY_FACTOR, year - 1);
  return Math.max(decayedRate, baseNetRate * LOSS_RATE_FLOOR);
}

/**
 * Get all default rates for all strategies and years
 */
export function getDefaultRates(): StrategyRateOverrides {
  const rates: StrategyRateOverrides = {};
  for (const strategy of STRATEGIES) {
    for (let year = 1; year <= 10; year++) {
      const key = `${strategy.id}-${year}`;
      rates[key] = getDefaultNetCapitalLossRate(strategy.id, year);
    }
  }
  return rates;
}

/**
 * Load rate overrides from localStorage
 */
export function loadRateOverrides(): StrategyRateOverrides {
  if (typeof localStorage === 'undefined') return {};

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.error('Failed to load rate overrides:', e);
  }
  return {};
}

/**
 * Save rate overrides to localStorage
 */
export function saveRateOverrides(overrides: StrategyRateOverrides): void {
  if (typeof localStorage === 'undefined') return;

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
  } catch (e) {
    console.error('Failed to save rate overrides:', e);
  }
}

/**
 * Clear all rate overrides (reset to defaults)
 */
export function clearRateOverrides(): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(STORAGE_KEY);
}

/**
 * Get the effective net capital loss rate for a strategy/year
 * Returns custom rate if set, otherwise default with decay
 */
export function getNetCapitalLossRate(strategyId: string, year: number): number {
  const key = `${strategyId}-${year}`;
  const overrides = loadRateOverrides();
  return overrides[key] ?? getDefaultNetCapitalLossRate(strategyId, year);
}

/**
 * Get all effective rates (defaults merged with overrides)
 */
export function getAllRates(): StrategyRateOverrides {
  const defaults = getDefaultRates();
  const overrides = loadRateOverrides();
  return { ...defaults, ...overrides };
}
