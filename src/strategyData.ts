// Strategy definitions for Quantinno Beta 1 Strategies
export interface Strategy {
  id: string;
  type: 'core' | 'overlay';
  name: string;
  label: string;
  stLossRate: number;   // Annual ST loss rate (percentage of collateral)
  ltGainRate: number;   // Annual LT gain rate (percentage of collateral)
  trackingError: string;
}

export const STRATEGIES: Strategy[] = [
  // Core (Cash Funded)
  { id: 'core-130-30', type: 'core', name: 'Core 130/30', label: 'Conservative', stLossRate: 0.10, ltGainRate: 0.024, trackingError: '1.3-1.5%' },
  { id: 'core-145-45', type: 'core', name: 'Core 145/45', label: 'Moderate', stLossRate: 0.13, ltGainRate: 0.029, trackingError: '1.8-2.0%' },
  { id: 'core-175-75', type: 'core', name: 'Core 175/75', label: 'Enhanced', stLossRate: 0.19, ltGainRate: 0.038, trackingError: '2.5-3.0%' },
  { id: 'core-225-125', type: 'core', name: 'Core 225/125', label: 'Aggressive', stLossRate: 0.29, ltGainRate: 0.053, trackingError: '4.0-4.5%' },
  // Overlay (Appreciated Stock as Collateral)
  { id: 'overlay-30-30', type: 'overlay', name: 'Overlay 30/30', label: 'Conservative', stLossRate: 0.06, ltGainRate: 0.009, trackingError: '1.0%' },
  { id: 'overlay-45-45', type: 'overlay', name: 'Overlay 45/45', label: 'Moderate', stLossRate: 0.09, ltGainRate: 0.014, trackingError: '1.5%' },
  { id: 'overlay-75-75', type: 'overlay', name: 'Overlay 75/75', label: 'Enhanced', stLossRate: 0.15, ltGainRate: 0.023, trackingError: '2.5%' },
  { id: 'overlay-125-125', type: 'overlay', name: 'Overlay 125/125', label: 'Aggressive', stLossRate: 0.25, ltGainRate: 0.038, trackingError: '4.2%' },
];

// QFAF Constants (fixed 250/250 leverage, 500% gross exposure)
export const QFAF_ST_GAIN_RATE = 1.50;        // 150% of MV per year
export const QFAF_ORDINARY_LOSS_RATE = 1.50;  // 150% of MV per year

// Section 461(l) Excess Business Loss Limits (2026)
export const SECTION_461L_LIMITS: Record<string, number> = {
  single: 256000,
  mfj: 512000,
  mfs: 256000,
  hoh: 256000,
};

// NOL Usage Limitation
export const NOL_OFFSET_PERCENTAGE = 0.80;  // Can offset 80% of taxable income

// Helper functions
export function getStrategy(id: string): Strategy | undefined {
  return STRATEGIES.find(s => s.id === id);
}

export function getStrategiesByType(type: 'core' | 'overlay'): Strategy[] {
  return STRATEGIES.filter(s => s.type === type);
}

/**
 * Calculate the maximum QFAF value that can be supported by a given collateral
 * QFAF ST gains must match collateral ST losses annually
 *
 * Formula: Max QFAF = (Collateral × ST Loss Rate) / 150%
 */
export function calculateMaxQfaf(collateralAmount: number, strategyId: string): number {
  const strategy = getStrategy(strategyId);
  if (!strategy || collateralAmount <= 0) return 0;

  const collateralStLosses = collateralAmount * strategy.stLossRate;
  return collateralStLosses / QFAF_ST_GAIN_RATE;
}
