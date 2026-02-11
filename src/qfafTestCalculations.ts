/**
 * QFAF Test (By Year) Calculation Module
 *
 * Extracted from QfafTestByYear.tsx for testability.
 * Models QFAF economics year-by-year with collateral sizing,
 * §461(l) limitations, carryforward, fees, and alpha.
 */

import { FilingStatus } from './types';
import {
  STRATEGIES,
  getStLossRateForYear,
  SECTION_461L_LIMITS,
  QFAF_ORDINARY_LOSS_RATE,
} from './strategyData';

// ============================================
// TYPES
// ============================================

export interface QfafTestAssumptions {
  initialQfafInvestment: number;
  initialDealsInvestment: number;
  overlayStrategyId: string;
  coreStrategyId: string;
  marginalTaxRate: number;
  qfafGenerationRate: number;
}

export interface QfafTestYearRow {
  year: number;
  calendarYear: number;
  dealsCollateralValue: number;
  qfafSubscriptionSize: number;
  annualEstOrdinaryLosses: number;
  section461Limit: number;
  carryForwardPrior: number;
  carryForwardNext: number;
  writeOffAmount: number;
  taxSavings: number;
  advisorManagementFee: number;
  quantinnoFees: number;
  totalFees: number;
  netTaxBenefit: number;
  qfafAlpha: number;
  quantinnoAlpha: number;
  totalAlpha: number;
}

export interface QfafTestTotals {
  dealsCollateralValue: number;
  qfafSubscriptionSize: number;
  annualEstOrdinaryLosses: number;
  section461Limit: number;
  carryForwardPrior: number;
  carryForwardNext: number;
  writeOffAmount: number;
  taxSavings: number;
  advisorManagementFee: number;
  quantinnoFees: number;
  totalFees: number;
  netTaxBenefit: number;
  qfafAlpha: number;
  quantinnoAlpha: number;
  totalAlpha: number;
}

// ============================================
// CONSTANTS
// ============================================

export const QFAF_ALPHA_RATE = 0.0557; // 5.57% per year
export const QUANTINNO_ALPHA_RATE = 0.0117; // 1.17% per year
export const ADVISOR_MGMT_FEE_RATE = 0.0057; // ~0.57%
export const QFAF_FINANCING_FEE_RATE = 0.00536; // ~0.54%
export const YEAR_1_GROWTH_FACTOR = 1.049;
export const ANNUAL_DECAY_FACTOR = 0.9231;
export const NUM_YEARS = 10;
export const START_YEAR = 2026;

const OVERLAY_STRATEGIES = STRATEGIES.filter(s => s.type === 'overlay');
const CORE_STRATEGIES = STRATEGIES.filter(s => s.type === 'core');

export const DEFAULT_ASSUMPTIONS: QfafTestAssumptions = {
  initialQfafInvestment: 1000000,
  initialDealsInvestment: 4700000,
  overlayStrategyId: OVERLAY_STRATEGIES[1]?.id ?? 'overlay-45-45',
  coreStrategyId: CORE_STRATEGIES[1]?.id ?? 'core-145-45',
  marginalTaxRate: 0.541,
  qfafGenerationRate: QFAF_ORDINARY_LOSS_RATE,
};

// ============================================
// COMPUTATION FUNCTIONS
// ============================================

export function computeYearResults(
  assumptions: QfafTestAssumptions,
  filingStatus: FilingStatus,
  numYears: number
): QfafTestYearRow[] {
  const results: QfafTestYearRow[] = [];
  let carryForward = 0;

  const overlayStrategy = STRATEGIES.find(s => s.id === assumptions.overlayStrategyId);
  const coreStrategy = STRATEGIES.find(s => s.id === assumptions.coreStrategyId);

  if (!overlayStrategy || !coreStrategy) {
    return results;
  }

  const section461Limit = SECTION_461L_LIMITS[filingStatus] || SECTION_461L_LIMITS.single;
  const initialQfafBase = assumptions.initialQfafInvestment;
  const initialDealsBase = assumptions.initialDealsInvestment;

  for (let i = 0; i < numYears; i++) {
    const year = i + 1;
    const calendarYear = START_YEAR + i;

    const overlayStLossRate = getStLossRateForYear(overlayStrategy, year);
    const coreStLossRate = getStLossRateForYear(coreStrategy, year);

    // QFAF Subscription: Year 1 grows by 1.049×, then decays ~7.7%/year
    let qfafSubscriptionSize: number;
    if (i === 0) {
      qfafSubscriptionSize = initialQfafBase * YEAR_1_GROWTH_FACTOR;
    } else {
      const priorQfaf = results[i - 1].qfafSubscriptionSize;
      qfafSubscriptionSize = priorQfaf * ANNUAL_DECAY_FACTOR;
    }

    // Annual estimated ordinary losses = QFAF × generation rate
    const annualEstOrdinaryLosses = qfafSubscriptionSize * assumptions.qfafGenerationRate;

    // Collateral sizing: overlay grows at alpha rate, core fills the gap
    const overlayCollateral = initialDealsBase * Math.pow(1 + QUANTINNO_ALPHA_RATE, i);
    const overlayStLosses = overlayCollateral * overlayStLossRate;
    const stLossesNeeded = annualEstOrdinaryLosses;
    const coreStLossesNeeded = Math.max(0, stLossesNeeded - overlayStLosses);
    const coreCollateral = coreStLossRate > 0 ? coreStLossesNeeded / coreStLossRate : 0;
    const dealsCollateralValue = overlayCollateral + coreCollateral;

    // §461(l) limitation: new losses capped, prior carryforward fully used
    const newLossWriteOff = Math.min(annualEstOrdinaryLosses, section461Limit);
    const writeOffAmount = newLossWriteOff + carryForward;
    const carryForwardNext = annualEstOrdinaryLosses - newLossWriteOff;

    // Tax savings = write-off × marginal tax rate
    const taxSavings = writeOffAmount * assumptions.marginalTaxRate;

    // Fees (based on Deals Collateral Value)
    const advisorManagementFee = dealsCollateralValue * ADVISOR_MGMT_FEE_RATE;
    const quantinnoFees = dealsCollateralValue * QFAF_FINANCING_FEE_RATE;
    const totalFees = advisorManagementFee + quantinnoFees;
    const netTaxBenefit = taxSavings - totalFees;

    // Alpha calculations
    const qfafAlpha = qfafSubscriptionSize * QFAF_ALPHA_RATE;
    const quantinnoAlpha = dealsCollateralValue * QUANTINNO_ALPHA_RATE;
    const totalAlpha = qfafAlpha + quantinnoAlpha;

    results.push({
      year,
      calendarYear,
      dealsCollateralValue,
      qfafSubscriptionSize,
      annualEstOrdinaryLosses,
      section461Limit,
      carryForwardPrior: carryForward,
      carryForwardNext,
      writeOffAmount,
      taxSavings,
      advisorManagementFee,
      quantinnoFees,
      totalFees,
      netTaxBenefit,
      qfafAlpha,
      quantinnoAlpha,
      totalAlpha,
    });

    carryForward = carryForwardNext;
  }

  return results;
}

export function computeTotals(results: QfafTestYearRow[]): QfafTestTotals {
  if (results.length === 0) {
    return {
      dealsCollateralValue: 0,
      qfafSubscriptionSize: 0,
      annualEstOrdinaryLosses: 0,
      section461Limit: 0,
      carryForwardPrior: 0,
      carryForwardNext: 0,
      writeOffAmount: 0,
      taxSavings: 0,
      advisorManagementFee: 0,
      quantinnoFees: 0,
      totalFees: 0,
      netTaxBenefit: 0,
      qfafAlpha: 0,
      quantinnoAlpha: 0,
      totalAlpha: 0,
    };
  }

  const sum = (field: keyof QfafTestYearRow) =>
    results.reduce((acc, r) => acc + (r[field] as number), 0);

  return {
    dealsCollateralValue: results[results.length - 1].dealsCollateralValue,
    qfafSubscriptionSize: sum('qfafSubscriptionSize'),
    annualEstOrdinaryLosses: sum('annualEstOrdinaryLosses'),
    section461Limit: results[0].section461Limit,
    carryForwardPrior: 0,
    carryForwardNext: results[results.length - 1].carryForwardNext,
    writeOffAmount: sum('writeOffAmount'),
    taxSavings: sum('taxSavings'),
    advisorManagementFee: sum('advisorManagementFee'),
    quantinnoFees: sum('quantinnoFees'),
    totalFees: sum('totalFees'),
    netTaxBenefit: sum('netTaxBenefit'),
    qfafAlpha: sum('qfafAlpha'),
    quantinnoAlpha: sum('quantinnoAlpha'),
    totalAlpha: sum('totalAlpha'),
  };
}

export function computeStats(values: number[]): { min: number; max: number; mean: number; median: number } {
  if (values.length === 0) {
    return { min: 0, max: 0, mean: 0, median: 0 };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  return { min, max, mean, median };
}
