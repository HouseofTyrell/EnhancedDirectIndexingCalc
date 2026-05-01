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
 *
 * Note: This returns the rate for an *operating year* (1-indexed). For
 * partial-year starts, callers must convert calendar years to the
 * appropriate operating-year blend — see `getCalendarYearStLossRate`.
 */
export function getEffectiveStLossRate(strategyId: string, ltGainRate: number, year: number): number {
  // Get the net capital loss rate (may be custom or default with decay)
  const netCapitalLossRate = getNetCapitalLossRate(strategyId, year);
  // ST Loss Rate = Net Capital Loss Rate + LT Gain Rate
  return netCapitalLossRate + ltGainRate;
}

/**
 * Compute the fraction of a calendar year during which the strategy is
 * actively operating, given the start month and total operating life.
 *
 * Strategies start mid-month-`startMonth` of calendar year 1 and run for
 * `qfafDuration` operating years. When the start month is January
 * (yf=1), each calendar year aligns one-to-one with an operating year.
 * Otherwise, the strategy spans `qfafDuration + 1` calendar years with
 * the first and last being partial.
 *
 *   yf = (13 - startMonth) / 12
 *   Calendar year 1:                       opFraction = yf
 *   Calendar years 2..qfafDuration:        opFraction = 1.0
 *   Calendar year qfafDuration+1 (yf<1):   opFraction = 1 - yf
 *   Calendar years beyond:                 opFraction = 0 (wind-down)
 *
 * For collateral-only mode (qfafDuration = 0), only Y1 is partial and
 * later years are full, since there's no fixed strategy end.
 */
export function getOperatingFraction(
  calendarYear: number,
  startMonth: number,
  qfafDuration: number
): number {
  if (calendarYear <= 0) return 0;
  const yf = (13 - (startMonth ?? 1)) / 12;
  // No QFAF (collateral-only): only Y1 is partial, later years are full.
  if (qfafDuration <= 0) {
    return calendarYear === 1 ? yf : 1.0;
  }
  if (calendarYear === 1) return yf;
  if (calendarYear <= qfafDuration) return 1.0;
  if (calendarYear === qfafDuration + 1 && yf < 1) return 1 - yf;
  return 0;
}

/**
 * Compute the time-weighted ST loss rate for a calendar year, accounting
 * for partial-year starts that straddle two operating years.
 *
 *   yf = (13 - startMonth) / 12
 *   Calendar year 1:           rate[0] × yf
 *   Calendar years 2..duration: rate[n-2] × (1-yf) + rate[n-1] × yf
 *                              (last (1-yf) of operating year n-1 plus
 *                               first yf of operating year n)
 *   Calendar year duration+1:  rate[duration-1] × (1-yf)
 *                              (final partial wind-out of operating year
 *                               qfafDuration)
 *
 * The returned rate already encodes the time-weighting for the calendar
 * year; callers should NOT multiply by a separate yearFraction. When
 * yf=1 (January start), this collapses to the operating-year-N rate
 * exactly, preserving full-year behavior.
 *
 * For collateral-only mode (qfafDuration=0), there is no fixed end of
 * life, so calendar-year rates blend operating years indefinitely using
 * `getStLossRateForYear`'s clamp-to-last behavior.
 */
export function getCalendarYearStLossRate(
  strategyId: string,
  ltGainRate: number,
  calendarYear: number,
  startMonth: number,
  qfafDuration: number
): number {
  if (calendarYear <= 0) return 0;
  const yf = (13 - (startMonth ?? 1)) / 12;
  // Year 1: only operating year 1, partial.
  if (calendarYear === 1) {
    return getEffectiveStLossRate(strategyId, ltGainRate, 1) * yf;
  }
  // QFAF-bounded mode: handle the trailing partial year explicitly and
  // zero out years past the strategy's life.
  if (qfafDuration > 0) {
    if (calendarYear === qfafDuration + 1 && yf < 1) {
      return getEffectiveStLossRate(strategyId, ltGainRate, qfafDuration) * (1 - yf);
    }
    if (calendarYear > qfafDuration) {
      return 0;
    }
  }
  // Full calendar year within the strategy's life: blend two operating years.
  const earlyRate = getEffectiveStLossRate(strategyId, ltGainRate, calendarYear - 1);
  const lateRate = getEffectiveStLossRate(strategyId, ltGainRate, calendarYear);
  return earlyRate * (1 - yf) + lateRate * yf;
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

export function calculateSummary(years: YearResult[], sizing: CalculatedSizing, qfafDuration?: number) {
  const totalTaxSavings = years.reduce((sum, y) => sum + y.taxSavings, 0);
  const totalNolGenerated = years.reduce((sum, y) => sum + y.excessToNol, 0);
  // Safe array access (005 - fix unchecked array access)
  const lastYear = years.length > 0 ? years[years.length - 1] : undefined;
  const finalPortfolioValue = lastYear?.totalValue ?? 0;
  // Annualize tax alpha over QFAF duration (not full projection length)
  // This measures per-year efficiency of the QFAF program specifically
  const numYears = qfafDuration ?? (years.length || 1);
  const effectiveTaxAlpha =
    sizing.totalExposure > 0 ? totalTaxSavings / sizing.totalExposure / numYears : 0;

  return { totalTaxSavings, finalPortfolioValue, effectiveTaxAlpha, totalNolGenerated };
}
