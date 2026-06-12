import { CalculationResult } from '../types';
import { ExitTaxAnalysis } from './exitTax';
import { safeNumber } from '../utils/formatters';

/**
 * EDI-only insights on the main engine's outputs (D-014/D-015/D-018).
 *
 * These are pure functions over `CalculationResult` (and, for the estate
 * comparison, the `ExitTaxAnalysis` already computed from it) — NOT the old
 * `ediOnly.ts` projection loop. That keeps one engine and one set of numbers:
 * embedded gain comes from actual projected dollar flows (exitTax.ts), the
 * carryforward balances from the real §1211/§1212 netting, and the loss
 * reserve from the state-aware statutory rates in `summary`.
 */
export interface EdiInsights {
  /** ST CF balance at the end of the last projected year (= summary) */
  finalStCarryforward: number;
  /** LT CF balance at the end of the last projected year (= summary) */
  finalLtCarryforward: number;
  /**
   * Contingent tax value of the final CF balances at the final year's
   * combined gains rates (summary.lossReserveShelterValue). Contingent on
   * future gains — never added to totalTaxSavings.
   */
  lossReserveShelterValue: number;
  /** Σ financing fees charged across all projected years */
  cumulativeFinancingCost: number;
  /**
   * Loss-reserve shelter value per dollar of financing cost ("what did the
   * protection cost?"). `null` when no financing cost was modeled (fees
   * disabled or zero rates) — display as "—", not Infinity.
   */
  protectionRatio: number | null;
  /**
   * Largest single gain event fully shelterable by the ending carryforward
   * balances: finalStCf + finalLtCf (capital-vs-capital netting has no
   * percentage limit, and ST/LT CFs cross-apply per §1211).
   */
  breakEvenGainEvent: number;
}

export function computeEdiInsights(result: CalculationResult): EdiInsights {
  const { finalStCarryforward, finalLtCarryforward, lossReserveShelterValue } = result.summary;
  const cumulativeFinancingCost = safeNumber(
    result.years.reduce((sum, y) => sum + y.financingCostPaid, 0)
  );
  return {
    finalStCarryforward,
    finalLtCarryforward,
    lossReserveShelterValue,
    cumulativeFinancingCost,
    protectionRatio:
      cumulativeFinancingCost > 0
        ? safeNumber(lossReserveShelterValue / cumulativeFinancingCost)
        : null,
    breakEvenGainEvent: safeNumber(finalStCarryforward + finalLtCarryforward),
  };
}

/**
 * Estate / step-up comparison on core outputs (D-018), ported from
 * `ediOnly.ts`'s `calculateEstateComparison` but using the exit-tax
 * analysis's actual dollar flows instead of a rate-based embedded-gain
 * estimate.
 *
 * At death, basis steps up (IRC §1014): the deferred exit tax is never paid,
 * so the strategy keeps its full projected savings — but unused capital loss
 * carryforwards die with the taxpayer (§1212 CFs are personal), so their
 * contingent shelter value is LOST, not added.
 */
export interface StepUpComparison {
  /**
   * Net benefit if held through death: totalTaxSavings with no deferred-tax
   * surrender. The lost CF value is disclosed (carryforwardValueLost), not
   * netted — it was contingent value, never counted in savings.
   */
  netIfHeldToStepUp: number;
  /** Co-equal conservative anchor: exit.netBenefitAfterLiquidation */
  netIfLiquidated: number;
  /** netIfHeldToStepUp − netIfLiquidated = incrementalDeferredTax (signed) */
  stepUpAdvantage: number;
  /** Hold to step-up: what dies with the taxpayer vs. what is extinguished */
  continueAndDie: {
    /** Gross exit tax extinguished by the basis step-up (before CF shelter) */
    stepUpTaxAvoided: number;
    /** CF balances lost at death (ST + LT) */
    carryforwardLost: number;
    /** Contingent shelter value lost (state-aware statutory rates) */
    carryforwardValueLost: number;
  };
  /** Unwind during life: CFs shelter the embedded gain, tax due on the rest */
  unwindBeforeDeath: {
    embeddedGain: number;
    carryforwardUsed: number;
    /** exit.exitTax (includes WA-style excise where modeled) */
    taxPaid: number;
  };
  recommendation: 'continue' | 'unwind' | 'partial_unwind';
  /**
   * Fraction of the portfolio to unwind so the realized gain exactly
   * consumes the CFs (CF ÷ embedded gain, pro-rata lots), holding the rest
   * for step-up. 0 when there is no embedded gain to unwind against.
   */
  optimalUnwindPct: number;
  explanation: string;
}

export function computeStepUpComparison(
  result: CalculationResult,
  exit: ExitTaxAnalysis
): StepUpComparison {
  const totalCf = exit.remainingCapitalLossCf;
  const embeddedGain = exit.embeddedGain;

  // Optimal partial unwind: realize exactly enough gain to consume the CFs
  // (pro-rata lots → unwound fraction carries the same gain fraction).
  const optimalUnwindPct = embeddedGain > 0 ? Math.min(1, safeNumber(totalCf / embeddedGain)) : 0;

  let recommendation: StepUpComparison['recommendation'];
  let explanation: string;
  if (totalCf <= 0) {
    recommendation = 'continue';
    explanation =
      'No carryforward to use. Step-up at death eliminates all embedded gains tax-free.';
  } else if (totalCf >= embeddedGain) {
    recommendation = 'unwind';
    explanation =
      'Carryforward exceeds embedded gain. Unwind fully: CF shelters all gains tax-free. ' +
      'Excess CF would be lost at death.';
  } else {
    recommendation = 'partial_unwind';
    explanation =
      `Unwind ${Math.round(optimalUnwindPct * 100)}% of the portfolio (using all CF to shelter gains), ` +
      `keep ${Math.round((1 - optimalUnwindPct) * 100)}% for step-up at death.`;
  }

  return {
    netIfHeldToStepUp: safeNumber(exit.totalTaxSavings),
    netIfLiquidated: exit.netBenefitAfterLiquidation,
    stepUpAdvantage: safeNumber(exit.totalTaxSavings - exit.netBenefitAfterLiquidation),
    continueAndDie: {
      stepUpTaxAvoided: safeNumber(embeddedGain * exit.combinedLtRate),
      carryforwardLost: safeNumber(totalCf),
      carryforwardValueLost: result.summary.lossReserveShelterValue,
    },
    unwindBeforeDeath: {
      embeddedGain,
      carryforwardUsed: exit.cfShelterUsed,
      taxPaid: exit.exitTax,
    },
    recommendation,
    optimalUnwindPct,
    explanation,
  };
}
