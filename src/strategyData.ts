import { FilingStatus } from './types';

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
  '30-30': [0.110, 0.070, 0.060, 0.040, 0.030, 0.030, 0.030, 0.030, 0.030, 0.030],
  '45-45': [0.165, 0.105, 0.090, 0.060, 0.045, 0.045, 0.045, 0.045, 0.045, 0.045],
  '75-75': [0.275, 0.175, 0.150, 0.100, 0.075, 0.075, 0.075, 0.075, 0.075, 0.075],
  '100-100': [0.367, 0.233, 0.200, 0.133, 0.100, 0.100, 0.100, 0.100, 0.100, 0.100],
  '125-125': [0.458, 0.292, 0.250, 0.167, 0.125, 0.125, 0.125, 0.125, 0.125, 0.125],
};

const CORE_ST_LOSS_RATES: Record<string, number[]> = {
  '130-30': [0.230, 0.130, 0.090, 0.050, 0.040, 0.030, 0.030, 0.030, 0.030, 0.030],
  '145-45': [0.285, 0.165, 0.120, 0.070, 0.055, 0.045, 0.045, 0.045, 0.045, 0.045],
  '175-75': [0.395, 0.235, 0.180, 0.110, 0.085, 0.075, 0.075, 0.075, 0.075, 0.075],
  '200-100': [0.487, 0.293, 0.230, 0.143, 0.110, 0.100, 0.100, 0.100, 0.100, 0.100],
  '225-125': [0.578, 0.352, 0.280, 0.177, 0.135, 0.125, 0.125, 0.125, 0.125, 0.125],
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
  single: 256000,
  mfj: 512000,
  mfs: 256000,
  hoh: 256000,
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
export function getStrategy(id: string): Strategy | undefined {
  return STRATEGIES.find(s => s.id === id);
}

// Get ST loss rate for a specific year (1-indexed)
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
