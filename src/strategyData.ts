import { FilingStatus } from './types';
import { TAX_PARAMETER_MANIFEST } from './taxParameters';

// Strategy definitions for Quantinno Beta 1 Strategies
export interface Strategy {
  id: string;
  type: 'core' | 'overlay';
  name: string;
  label: string;
  stLossRate: number; // Average/Year 1 ST loss rate (for backwards compatibility)
  stLossRatesByYear: number[]; // Year-by-year ST loss rates (Years 1-10)
  ltGainRate: number; // Annual LT gain rate (percentage of collateral)
  trackingError: number; // Numeric tracking error for calculations
  trackingErrorDisplay: string; // Display string for UI
  financingCostRate: number; // Annual financing cost for leveraged positions
}

// Year-by-year Net Short-Term Capital Loss Rates (Beta 0)
// From: Net Short-Term Capital Loss Estimates (Years 1-10)

const OVERLAY_ST_LOSS_RATES: Record<string, number[]> = {
  '30-30': [0.11, 0.07, 0.06, 0.04, 0.03, 0.03, 0.03, 0.03, 0.03, 0.03],
  '45-45': [0.165, 0.105, 0.09, 0.06, 0.045, 0.045, 0.045, 0.045, 0.045, 0.045],
  '75-75': [0.275, 0.175, 0.15, 0.1, 0.075, 0.075, 0.075, 0.075, 0.075, 0.075],
  '100-100': [0.367, 0.233, 0.2, 0.133, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1],
  '125-125': [0.458, 0.292, 0.25, 0.167, 0.125, 0.125, 0.125, 0.125, 0.125, 0.125],
};

const CORE_ST_LOSS_RATES: Record<string, number[]> = {
  '130-30': [0.23, 0.13, 0.09, 0.05, 0.04, 0.03, 0.03, 0.03, 0.03, 0.03],
  '145-45': [0.285, 0.165, 0.12, 0.07, 0.055, 0.045, 0.045, 0.045, 0.045, 0.045],
  '175-75': [0.395, 0.235, 0.18, 0.11, 0.085, 0.075, 0.075, 0.075, 0.075, 0.075],
  '200-100': [0.487, 0.293, 0.23, 0.143, 0.11, 0.1, 0.1, 0.1, 0.1, 0.1],
  '225-125': [0.578, 0.352, 0.28, 0.177, 0.135, 0.125, 0.125, 0.125, 0.125, 0.125],
};

export const STRATEGIES: Strategy[] = [
  // Core (Cash Funded) - financing cost scales with leverage
  {
    id: 'core-130-30',
    type: 'core',
    name: 'Core 130/30',
    label: 'Conservative',
    stLossRate: 0.23, // Year 1 rate
    stLossRatesByYear: CORE_ST_LOSS_RATES['130-30'],
    ltGainRate: 0.024,
    trackingError: 0.014,
    trackingErrorDisplay: '1.3-1.5%',
    financingCostRate: 0.015,
  },
  {
    id: 'core-145-45',
    type: 'core',
    name: 'Core 145/45',
    label: 'Moderate',
    stLossRate: 0.285, // Year 1 rate
    stLossRatesByYear: CORE_ST_LOSS_RATES['145-45'],
    ltGainRate: 0.029,
    trackingError: 0.019,
    trackingErrorDisplay: '1.8-2.0%',
    financingCostRate: 0.023,
  },
  {
    id: 'core-175-75',
    type: 'core',
    name: 'Core 175/75',
    label: 'Enhanced',
    stLossRate: 0.395, // Year 1 rate
    stLossRatesByYear: CORE_ST_LOSS_RATES['175-75'],
    ltGainRate: 0.038,
    trackingError: 0.028,
    trackingErrorDisplay: '2.5-3.0%',
    financingCostRate: 0.035,
  },
  {
    id: 'core-200-100',
    type: 'core',
    name: 'Core 200/100',
    label: 'Enhanced+',
    stLossRate: 0.487, // Year 1 rate
    stLossRatesByYear: CORE_ST_LOSS_RATES['200-100'],
    ltGainRate: 0.045,
    trackingError: 0.038,
    trackingErrorDisplay: '3.5-4.0%',
    financingCostRate: 0.04,
  },
  {
    id: 'core-225-125',
    type: 'core',
    name: 'Core 225/125',
    label: 'Aggressive',
    stLossRate: 0.578, // Year 1 rate
    stLossRatesByYear: CORE_ST_LOSS_RATES['225-125'],
    ltGainRate: 0.053,
    trackingError: 0.043,
    trackingErrorDisplay: '4.0-4.5%',
    financingCostRate: 0.045,
  },
  // Overlay (Appreciated Stock as Collateral) - lower financing costs
  {
    id: 'overlay-30-30',
    type: 'overlay',
    name: 'Overlay 30/30',
    label: 'Conservative',
    stLossRate: 0.11, // Year 1 rate
    stLossRatesByYear: OVERLAY_ST_LOSS_RATES['30-30'],
    ltGainRate: 0.009,
    trackingError: 0.01,
    trackingErrorDisplay: '1.0%',
    financingCostRate: 0.01,
  },
  {
    id: 'overlay-45-45',
    type: 'overlay',
    name: 'Overlay 45/45',
    label: 'Moderate',
    stLossRate: 0.165, // Year 1 rate
    stLossRatesByYear: OVERLAY_ST_LOSS_RATES['45-45'],
    ltGainRate: 0.014,
    trackingError: 0.015,
    trackingErrorDisplay: '1.5%',
    financingCostRate: 0.015,
  },
  {
    id: 'overlay-75-75',
    type: 'overlay',
    name: 'Overlay 75/75',
    label: 'Enhanced',
    stLossRate: 0.275, // Year 1 rate
    stLossRatesByYear: OVERLAY_ST_LOSS_RATES['75-75'],
    ltGainRate: 0.023,
    trackingError: 0.025,
    trackingErrorDisplay: '2.5%',
    financingCostRate: 0.025,
  },
  {
    id: 'overlay-100-100',
    type: 'overlay',
    name: 'Overlay 100/100',
    label: 'Enhanced+',
    stLossRate: 0.367, // Year 1 rate
    stLossRatesByYear: OVERLAY_ST_LOSS_RATES['100-100'],
    ltGainRate: 0.032,
    trackingError: 0.035,
    trackingErrorDisplay: '3.5%',
    financingCostRate: 0.032,
  },
  {
    id: 'overlay-125-125',
    type: 'overlay',
    name: 'Overlay 125/125',
    label: 'Aggressive',
    stLossRate: 0.458, // Year 1 rate
    stLossRatesByYear: OVERLAY_ST_LOSS_RATES['125-125'],
    ltGainRate: 0.038,
    trackingError: 0.042,
    trackingErrorDisplay: '4.2%',
    financingCostRate: 0.04,
  },
];

// QFAF Constants (fixed 250/250 leverage, 500% gross exposure)
export const QFAF_ST_GAIN_RATE = 1.5; // 150% of MV per year
export const QFAF_ORDINARY_LOSS_RATE = 1.5; // 150% of MV per year

// Section 461(l) Excess Business Loss Limits (2026 values per Rev. Proc. 2025-32)
// OBBBA reset base to $250K/$500K with new inflation indexing from 2024 base year
export const SECTION_461L_LIMITS: Record<FilingStatus, number> = {
  ...TAX_PARAMETER_MANIFEST.federal.section461l.limits,
};

// Capital Loss Limits per IRC §1211(b)
// MFS filers limited to $1,500; others $3,000
export const CAPITAL_LOSS_LIMITS: Record<FilingStatus, number> = {
  single: 3000,
  mfj: 3000,
  mfs: 1500,
  hoh: 3000,
};

// NOL Usage Limitation
export const NOL_OFFSET_PERCENTAGE = 0.8; // Can offset 80% of taxable income

// Tax-Loss Harvesting Decay - NO LONGER USED (replaced by year-by-year rates)
// Kept for backwards compatibility
export const LOSS_RATE_DECAY_FACTOR = 0.93; // 7% annual decay
export const LOSS_RATE_FLOOR = 0.3; // Minimum 30% of initial rate

// Helper functions

/**
 * Look up a strategy definition by its unique identifier.
 * @param id - Strategy identifier (e.g. "core-145-45", "overlay-75-75")
 * @returns The matching Strategy object, or undefined if no strategy has the given id
 */
export function getStrategy(id: string): Strategy | undefined {
  return STRATEGIES.find(s => s.id === id);
}

/**
 * Get the short-term loss rate for a specific year of a strategy.
 * The year is 1-indexed; values beyond the defined range are clamped to the
 * last available year's rate.
 * @param strategy - The strategy whose loss-rate schedule to query
 * @param year - The year number (1-indexed, e.g. 1 for Year 1)
 * @returns The short-term loss rate as a decimal for the requested year
 */
export function getStLossRateForYear(strategy: Strategy, year: number): number {
  const index = Math.min(year - 1, strategy.stLossRatesByYear.length - 1);
  return strategy.stLossRatesByYear[Math.max(0, index)];
}

/**
 * Get the average ST loss rate across a range of years.
 * Used for QFAF sizing based on average collateral losses.
 * @param strategy - The strategy to get rates for
 * @param fromYear - Start year (1-indexed, inclusive)
 * @param toYear - End year (1-indexed, inclusive)
 * @returns Average ST loss rate across the specified years
 */
export function getAverageStLossRate(strategy: Strategy, fromYear: number, toYear: number): number {
  const clampedFrom = Math.max(1, fromYear);
  const clampedTo = Math.max(clampedFrom, toYear);
  let sum = 0;
  const count = clampedTo - clampedFrom + 1;
  for (let year = clampedFrom; year <= clampedTo; year++) {
    sum += getStLossRateForYear(strategy, year);
  }
  return count > 0 ? sum / count : 0;
}

/**
 * Get the leverage ratio for long positions (margin debt) based on strategy type.
 * Core strategies are cash-funded with leverage; overlay strategies use collateral.
 * @param strategy - The strategy to analyze
 * @returns The leverage ratio (borrowed amount / portfolio value) for long positions
 * @example Core 145/45: 145% long - 100% cash = 45% borrowed = 0.45 leverage ratio
 * @example Overlay 45/45: 45% overlay long = 0.45 leverage ratio
 */
export function getLongLeverageRatio(strategy: Strategy): number {
  // Extract leverage from strategy name (e.g., "130-30" -> 130)
  const match = strategy.name.match(/(\d+)\/\d+/);
  if (!match) return 0;

  const longPct = parseInt(match[1], 10);

  if (strategy.type === 'core') {
    // Core: Long positions funded by cash + margin
    // 145/45 means 145% long with 100% cash, so 45% is borrowed
    return Math.max(0, (longPct - 100) / 100);
  } else {
    // Overlay: Long positions are overlay on top of collateral
    // 45/45 means 45% overlay long, all funded by margin against collateral
    return longPct / 100;
  }
}

/**
 * Get the short position ratio based on strategy type.
 * @param strategy - The strategy to analyze
 * @returns The short position ratio (short notional / portfolio value)
 * @example Core 145/45: 45% short = 0.45 ratio
 * @example Overlay 45/45: 45% short = 0.45 ratio
 */
export function getShortRatio(strategy: Strategy): number {
  // Extract short percentage from strategy name (e.g., "145-45" -> 45)
  const match = strategy.name.match(/(\d+)\/(\d+)/);
  if (!match) return 0;

  const shortPct = parseInt(match[2], 10);
  return shortPct / 100;
}

/**
 * Compute the incremental financing cost for a strategy (excludes advisory fee).
 * This is the margin+borrow cost only — the cost that is unique to EDI vs passive.
 * Advisory fee is excluded because it's common to both EDI and passive strategies.
 * @param strategy - The strategy to compute financing for
 * @param brokerMarginRate - Margin rate charged on long leverage (default 4.25%)
 * @param shortBorrowRate - Stock borrow fee on short positions (default 0.5%)
 * @param shortDividendRate - Dividend cost on short positions (default 1.5%)
 * @returns The incremental financing cost rate as a decimal
 */
export function computeIncrementalFinancingCost(
  strategy: Strategy,
  brokerMarginRate: number,
  shortBorrowRate: number,
  shortDividendRate: number
): number {
  const longLeverage = getLongLeverageRatio(strategy);
  const shortRatio = getShortRatio(strategy);
  return brokerMarginRate * longLeverage + (shortBorrowRate + shortDividendRate) * shortRatio;
}
