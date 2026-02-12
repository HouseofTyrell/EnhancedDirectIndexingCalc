import { STRATEGIES, getStLossRateForYear, CAPITAL_LOSS_LIMITS } from '../strategyData';
import type { FilingStatus } from '../types';
import { safeNumber } from '../utils/formatters';

// ============================================
// TYPES
// ============================================

export interface EdiYearInput {
  year: number;
  strategyId: string;
  collateralValue: number;
  combinedStRate: number;
  combinedLtRate: number;
  filingStatus: FilingStatus;
  washSaleRate: number;
  priorStCarryforward: number;
  priorLtCarryforward: number;
}

export interface EdiYearResult {
  year: number;
  collateralValue: number;

  // Gross generation
  stLossesHarvested: number;
  ltGainsRealized: number;

  // IRC netting (ST losses shelter LT gains)
  stLossesUsedToOffsetLtGains: number;
  netLtGainAfterOffset: number;
  excessStLossAfterOffset: number;

  // Prior carryforward application
  priorCfUsedAgainstLtGains: number;

  // Tax on remaining LT gains (after all offsets)
  taxOnRemainingLtGains: number;

  // $3K ordinary income deduction
  capitalLossDeduction: number;
  taxSavedByCapitalLossDeduction: number;

  // Net annual realized benefit (positive = saves money)
  annualRealizedBenefit: number;

  // Carryforward balances at year end
  endingStCarryforward: number;
  endingLtCarryforward: number;

  // Harvesting efficiency
  harvestingEfficiency: number;
}

// ============================================
// CORE YEAR CALCULATION
// ============================================

export function computeEdiYear(input: EdiYearInput): EdiYearResult {
  const {
    year, strategyId, collateralValue, combinedStRate, combinedLtRate,
    filingStatus, washSaleRate, priorStCarryforward, priorLtCarryforward,
  } = input;

  const strategy = STRATEGIES.find(s => s.id === strategyId);
  if (!strategy) throw new Error(`Unknown strategy: ${strategyId}`);

  // --- Step 1: Gross generation ---
  const stLossRate = getStLossRateForYear(strategy, year);
  const ltGainRate = strategy.ltGainRate;
  const stLossesHarvested = safeNumber(collateralValue * stLossRate * (1 - washSaleRate));
  const ltGainsRealized = safeNumber(collateralValue * ltGainRate);

  // --- Step 2: IRC netting - ST losses offset LT gains ---
  const stLossesUsedToOffsetLtGains = Math.min(stLossesHarvested, ltGainsRealized);
  const netLtGainAfterOffset = safeNumber(ltGainsRealized - stLossesUsedToOffsetLtGains);
  const excessStLossAfterOffset = safeNumber(stLossesHarvested - stLossesUsedToOffsetLtGains);

  // --- Step 3: Apply prior carryforward to any remaining LT gains ---
  let remainingLtGain = netLtGainAfterOffset;
  let stCf = priorStCarryforward;
  let ltCf = priorLtCarryforward;

  // LT carryforward offsets LT gains first
  const ltCfUsed = Math.min(ltCf, remainingLtGain);
  remainingLtGain -= ltCfUsed;
  ltCf -= ltCfUsed;

  // ST carryforward cross-applies to remaining LT gains
  const stCfUsedAgainstLt = Math.min(stCf, remainingLtGain);
  remainingLtGain -= stCfUsedAgainstLt;
  stCf -= stCfUsedAgainstLt;

  const priorCfUsedAgainstLtGains = ltCfUsed + stCfUsedAgainstLt;

  // --- Step 4: Add excess ST losses to carryforward ---
  stCf += excessStLossAfterOffset;

  // --- Step 5: $3K ordinary income deduction ---
  const capitalLossLimit = CAPITAL_LOSS_LIMITS[filingStatus];
  const totalAvailable = stCf + ltCf;
  const capitalLossDeduction = Math.min(totalAvailable, capitalLossLimit);

  // Consume from ST first, then LT
  let deductionRemaining = capitalLossDeduction;
  if (deductionRemaining > 0 && stCf > 0) {
    const used = Math.min(deductionRemaining, stCf);
    stCf -= used;
    deductionRemaining -= used;
  }
  if (deductionRemaining > 0 && ltCf > 0) {
    const used = Math.min(deductionRemaining, ltCf);
    ltCf -= used;
    deductionRemaining -= used;
  }

  // --- Step 6: Tax calculations ---
  const taxOnRemainingLtGains = safeNumber(remainingLtGain * combinedLtRate);
  const taxSavedByCapitalLossDeduction = safeNumber(capitalLossDeduction * combinedStRate);
  const annualRealizedBenefit = safeNumber(taxSavedByCapitalLossDeduction - taxOnRemainingLtGains);

  // --- Step 7: Harvesting efficiency ---
  const harvestingEfficiency = ltGainsRealized > 0
    ? safeNumber(stLossesHarvested / ltGainsRealized)
    : Infinity;

  return {
    year,
    collateralValue,
    stLossesHarvested,
    ltGainsRealized,
    stLossesUsedToOffsetLtGains,
    netLtGainAfterOffset,
    excessStLossAfterOffset,
    priorCfUsedAgainstLtGains,
    taxOnRemainingLtGains,
    capitalLossDeduction,
    taxSavedByCapitalLossDeduction,
    annualRealizedBenefit,
    endingStCarryforward: safeNumber(stCf),
    endingLtCarryforward: safeNumber(ltCf),
    harvestingEfficiency,
  };
}
