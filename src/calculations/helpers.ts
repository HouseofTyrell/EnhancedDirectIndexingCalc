import {
  CalculatorInputs,
  YearResult,
  CalculatedSizing,
  AdvancedSettings,
} from '../types';
import {
  CAPITAL_LOSS_LIMITS,
  NOL_OFFSET_PERCENTAGE,
} from '../strategyData';
import { safeNumber } from '../utils/formatters';
import { getNetCapitalLossRate } from '../utils/strategyRates';

/**
 * Get effective ST loss rate, using custom rates if set.
 * Custom rates are stored as "net capital loss rate" (ST - LT).
 * We derive ST loss rate by adding back the LT gain rate.
 */
export function getEffectiveStLossRate(strategyId: string, ltGainRate: number, year: number): number {
  // Get the net capital loss rate (may be custom or default with decay)
  const netCapitalLossRate = getNetCapitalLossRate(strategyId, year);
  // ST Loss Rate = Net Capital Loss Rate + LT Gain Rate
  return netCapitalLossRate + ltGainRate;
}

/**
 * Calculate carryforward usage and updates.
 * Returns updated carryforward balances and amounts used this year.
 */
export function calculateCarryforwards(
  netStGainLoss: number,
  ltGains: number,
  usableOrdinaryLoss: number,
  remainingStCarryforward: number,
  remainingLtCarryforward: number,
  nolCarryforward: number,
  inputs: CalculatorInputs,
  settings: AdvancedSettings,
  effectiveIncome?: number // Optional income override
): {
  newStCarryforward: number;
  newLtCarryforward: number;
  nolUsed: number;
  capitalLossUsedAgainstIncome: number;
} {
  let taxableSt = netStGainLoss;
  let taxableLt = ltGains;
  let stCarryforward = remainingStCarryforward;
  let ltCarryforward = remainingLtCarryforward;
  let capitalLossUsedAgainstIncome = 0;

  // Step 1: Apply ST carryforward to offset ST gains
  if (taxableSt > 0 && stCarryforward > 0) {
    const offset = Math.min(stCarryforward, taxableSt);
    taxableSt -= offset;
    stCarryforward -= offset;
  }

  // Step 2: Apply LT carryforward to offset LT gains
  if (taxableLt > 0 && ltCarryforward > 0) {
    const offset = Math.min(ltCarryforward, taxableLt);
    taxableLt -= offset;
    ltCarryforward -= offset;
  }

  // Step 3: Cross-apply remaining ST carryforward to LT gains
  if (taxableLt > 0 && stCarryforward > 0) {
    const offset = Math.min(stCarryforward, taxableLt);
    taxableLt -= offset;
    stCarryforward -= offset;
  }

  // Step 4: Cross-apply remaining LT carryforward to ST gains
  if (taxableSt > 0 && ltCarryforward > 0) {
    const offset = Math.min(ltCarryforward, taxableSt);
    taxableSt -= offset;
    ltCarryforward -= offset;
  }

  // Step 5: Handle current year net ST loss
  if (netStGainLoss < 0) {
    // Current year ST loss can offset LT gains
    const currentLoss = Math.abs(netStGainLoss);
    let remainingLoss = currentLoss;

    if (taxableLt > 0) {
      const offset = Math.min(remainingLoss, taxableLt);
      taxableLt -= offset;
      remainingLoss -= offset;
    }

    // Track unused current-year losses as ST carryforward
    if (remainingLoss > 0) {
      stCarryforward += remainingLoss;
    }

    taxableSt = 0;
  }

  // Step 6: Apply capital loss carryforward against ordinary income
  // Per IRC §1211(b): $3,000 limit for most filers, $1,500 for MFS
  const capitalLossLimit = CAPITAL_LOSS_LIMITS[inputs.filingStatus];
  const totalRemainingCarryforward = stCarryforward + ltCarryforward;
  if (totalRemainingCarryforward > 0) {
    capitalLossUsedAgainstIncome = Math.min(totalRemainingCarryforward, capitalLossLimit);
    // Reduce from ST first, then LT
    if (stCarryforward >= capitalLossUsedAgainstIncome) {
      stCarryforward -= capitalLossUsedAgainstIncome;
    } else {
      const fromLt = capitalLossUsedAgainstIncome - stCarryforward;
      stCarryforward = 0;
      ltCarryforward -= fromLt;
    }
  }

  // Step 7: Calculate NOL usage with configurable limit (default 80%)
  // NOL can offset up to nolOffsetLimit of taxable income
  const yearIncome = effectiveIncome ?? inputs.annualIncome;
  const taxableIncomeBeforeNol =
    yearIncome + taxableSt + taxableLt - usableOrdinaryLoss - capitalLossUsedAgainstIncome;
  const nolOffsetLimit = settings.nolOffsetLimit ?? NOL_OFFSET_PERCENTAGE;
  const maxNolUsage = Math.max(0, taxableIncomeBeforeNol) * nolOffsetLimit;
  const nolUsed = Math.min(nolCarryforward, maxNolUsage);

  return {
    newStCarryforward: safeNumber(stCarryforward),
    newLtCarryforward: safeNumber(ltCarryforward),
    nolUsed: safeNumber(nolUsed),
    capitalLossUsedAgainstIncome: safeNumber(capitalLossUsedAgainstIncome),
  };
}

export function calculateSummary(years: YearResult[], sizing: CalculatedSizing) {
  const totalTaxSavings = years.reduce((sum, y) => sum + y.taxSavings, 0);
  const totalNolGenerated = years.reduce((sum, y) => sum + y.excessToNol, 0);
  // Safe array access (005 - fix unchecked array access)
  const lastYear = years.length > 0 ? years[years.length - 1] : undefined;
  const finalPortfolioValue = lastYear?.totalValue ?? 0;
  // Annualize tax alpha using actual number of projection years
  const numYears = years.length || 1; // Avoid division by zero
  const effectiveTaxAlpha =
    sizing.totalExposure > 0 ? totalTaxSavings / sizing.totalExposure / numYears : 0;

  return { totalTaxSavings, finalPortfolioValue, effectiveTaxAlpha, totalNolGenerated };
}
