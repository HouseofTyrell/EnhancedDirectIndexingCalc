import { CalculationResult } from '../types';
import { StateTaxProfile, computeLtcgExcise } from '../taxData';
import { safeNumber } from '../utils/formatters';

/**
 * Exit-tax / deferred-gain analysis for the main combined (QFAF + collateral)
 * view (D-003).
 *
 * Tax-loss harvesting reduces the collateral's cost basis: every harvested ST
 * loss lowers basis by the loss amount (wash-sale-disallowed losses are
 * already excluded from `stLossesHarvested` and stay in basis), while realized
 * LT gains step basis up. The projected "tax savings" are therefore partly a
 * timing benefit that reverses if the portfolio is liquidated. This module
 * quantifies that reversal so the headline can separate permanent benefit
 * from deferral.
 *
 * Assumptions (disclosed in UI):
 * - Initial basis equals initial market value. Overlay strategies funded with
 *   already-appreciated stock have ADDITIONAL pre-existing embedded gain that
 *   is not attributable to the strategy and is not modeled here.
 * - Liquidation gain is taxed entirely at the LT rate (positions held through
 *   a multi-year program are predominantly long-term at exit).
 * - Remaining capital loss carryforwards shelter the exit gain dollar-for-
 *   dollar. The remaining NOL is NOT applied against the exit gain (it
 *   retains separate value against ordinary income) — conservative, and
 *   avoids double-counting NOL benefits already projected year-by-year.
 * - The QFAF unwinds at basis (annual gain/loss allocations keep outside
 *   basis at NAV), so it contributes no embedded gain.
 */
export interface ExitTaxAnalysis {
  /** Collateral at start of the projection */
  initialCollateral: number;
  /** Collateral market value at the end of the projection */
  finalCollateralValue: number;
  /** Σ (ST losses harvested − LT gains realized): how far basis fell below cost */
  cumulativeBasisReduction: number;
  /** Market appreciation net of modeled fees (final value − initial value) */
  marketAppreciation: number;
  /** Unrealized gain if fully liquidated: appreciation + basis reduction */
  embeddedGain: number;
  /** ST + LT loss carryforwards remaining at the end of the projection */
  remainingCapitalLossCf: number;
  /** Carryforward applied against the exit gain */
  cfShelterUsed: number;
  /** Embedded gain still taxable after carryforward shelter */
  taxableGainAfterShelter: number;
  /** Tax due on full liquidation at the combined LT rate */
  exitTax: number;
  /** Exit tax a passive buy-and-hold investor would owe on the same horizon */
  passiveExitTax: number;
  /** Exit tax attributable to the strategy: max(0, exitTax − passiveExitTax) */
  incrementalDeferredTax: number;
  /** Projected total tax savings from the main calculation (gross of deferral) */
  totalTaxSavings: number;
  /** totalTaxSavings − incrementalDeferredTax: benefit if fully liquidated at horizon */
  netBenefitAfterLiquidation: number;
  /** NOL carryforward remaining at the end of the projection (separate future value) */
  remainingNolCarryforward: number;
  /** Combined LT rate used for the exit calculation */
  combinedLtRate: number;
}

export function computeExitTaxAnalysis(
  result: CalculationResult,
  combinedLtRate: number,
  passiveAnnualReturn: number = 0,
  /** WA-style LTCG excise applied to a single-year full liquidation (D-005) */
  ltcgExcise?: StateTaxProfile['ltcgExcise']
): ExitTaxAnalysis {
  const years = result.years;
  const initialCollateral = result.sizing.collateralValue;
  const lastYear = years.length > 0 ? years[years.length - 1] : undefined;
  const finalCollateralValue = lastYear?.collateralValue ?? initialCollateral;

  // Basis falls by harvested ST losses (already net of wash-sale disallowance)
  // and rises by realized LT gains.
  const cumulativeBasisReduction = safeNumber(
    years.reduce((sum, y) => sum + y.stLossesHarvested - y.ltGainsRealized, 0)
  );

  // Embedded gain = market value − basis
  //               = (finalValue − initialCollateral) + cumulativeBasisReduction
  const marketAppreciation = safeNumber(finalCollateralValue - initialCollateral);
  const embeddedGain = Math.max(0, safeNumber(marketAppreciation + cumulativeBasisReduction));

  // Capital loss carryforwards shelter the exit gain (no 80% limit applies to
  // capital-vs-capital netting).
  const remainingCapitalLossCf = safeNumber(
    (lastYear?.stLossCarryforward ?? 0) + (lastYear?.ltLossCarryforward ?? 0)
  );
  const cfShelterUsed = Math.min(remainingCapitalLossCf, embeddedGain);
  const taxableGainAfterShelter = Math.max(0, safeNumber(embeddedGain - cfShelterUsed));
  const exciseOn = (gain: number) => computeLtcgExcise(gain, ltcgExcise);
  const exitTax = safeNumber(
    taxableGainAfterShelter * combinedLtRate + exciseOn(taxableGainAfterShelter)
  );

  // Passive baseline: buy-and-hold the same initial collateral at the same
  // return with no financing drag and no basis change.
  const horizonYears = years.length;
  const passiveValue = initialCollateral * Math.pow(1 + passiveAnnualReturn, horizonYears);
  const passiveGain = Math.max(0, safeNumber(passiveValue - initialCollateral));
  const passiveExitTax = safeNumber(passiveGain * combinedLtRate + exciseOn(passiveGain));

  const incrementalDeferredTax = Math.max(0, safeNumber(exitTax - passiveExitTax));
  const totalTaxSavings = result.summary.totalTaxSavings;
  const netBenefitAfterLiquidation = safeNumber(totalTaxSavings - incrementalDeferredTax);

  return {
    initialCollateral,
    finalCollateralValue,
    cumulativeBasisReduction,
    marketAppreciation,
    embeddedGain,
    remainingCapitalLossCf,
    cfShelterUsed,
    taxableGainAfterShelter,
    exitTax,
    passiveExitTax,
    incrementalDeferredTax,
    totalTaxSavings,
    netBenefitAfterLiquidation,
    remainingNolCarryforward: lastYear?.nolCarryforward ?? 0,
    combinedLtRate,
  };
}
