import { FilingStatus } from './types';

// Strategy definitions for Quantinno Beta 1 Strategies
export interface Strategy {
  id: string;
  type: 'core' | 'overlay';
  name: string;
  label: string;
  stLossRate: number; // Annual ST loss rate (percentage of collateral)
  ltGainRate: number; // Annual LT gain rate (percentage of collateral)
  trackingError: number; // Numeric tracking error for calculations
  trackingErrorDisplay: string; // Display string for UI
  financingCostRate: number; // Annual financing cost for leveraged positions
}

export const STRATEGIES: Strategy[] = [
  // Core (Cash Funded) - financing cost scales with leverage
  {
    id: 'core-130-30',
    type: 'core',
    name: 'Core 130/30',
    label: 'Conservative',
    stLossRate: 0.1,
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
    stLossRate: 0.13,
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
    stLossRate: 0.19,
    ltGainRate: 0.038,
    trackingError: 0.028,
    trackingErrorDisplay: '2.5-3.0%',
    financingCostRate: 0.035,
  },
  {
    id: 'core-225-125',
    type: 'core',
    name: 'Core 225/125',
    label: 'Aggressive',
    stLossRate: 0.29,
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
    stLossRate: 0.06,
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
    stLossRate: 0.09,
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
    stLossRate: 0.15,
    ltGainRate: 0.023,
    trackingError: 0.025,
    trackingErrorDisplay: '2.5%',
    financingCostRate: 0.025,
  },
  {
    id: 'overlay-125-125',
    type: 'overlay',
    name: 'Overlay 125/125',
    label: 'Aggressive',
    stLossRate: 0.25,
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

// Tax-Loss Harvesting Decay
// TLH effectiveness decays ~7% annually as easy losses are exhausted
export const LOSS_RATE_DECAY_FACTOR = 0.93; // 7% annual decay
export const LOSS_RATE_FLOOR = 0.3; // Minimum 30% of initial rate

// Helper functions
export function getStrategy(id: string): Strategy | undefined {
  return STRATEGIES.find(s => s.id === id);
}
