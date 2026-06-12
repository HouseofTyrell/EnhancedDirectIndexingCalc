/**
 * Tests for the EDI-only insights layer (D-014/D-015/D-018):
 * - loss-reserve summary fields (final CF balances valued at the final
 *   year's state-aware combined gains rates)
 * - protection ratio (shelter value per dollar of financing cost)
 * - break-even gain event (gain fully shelterable by ending CFs)
 * - estate/step-up comparison on core outputs (replaces ediOnly.ts's
 *   rate-based estimate)
 */

import { describe, it, expect } from 'vitest';
import { calculate, computeEdiInsights, computeStepUpComparison } from './calculations';
import { computeExitTaxAnalysis } from './calculations/exitTax';
import { CalculatorInputs, DEFAULT_SETTINGS } from './types';

const COMBINED_LT_RATE = 0.238 + 0.133; // 20% + 3.8% NIIT + 13.3% CA

// $3M MFJ income → 37% ordinary + 3.8% NIIT federal ST; 20% + 3.8% federal LT
const FED_ST = 0.408;
const FED_LT = 0.238;

function createInputs(overrides: Partial<CalculatorInputs> = {}): CalculatorInputs {
  return {
    filingStatus: 'mfj',
    stateCode: 'CA',
    stateRate: 0.133,
    annualIncome: 3000000,
    strategyId: 'overlay-45-45',
    collateralAmount: 10000000,
    existingStLossCarryforward: 0,
    existingLtLossCarryforward: 0,
    existingNolCarryforward: 0,
    qfafEnabled: false, // EDI-only: collateral harvesting, no QFAF
    qfafSizingYears: 1,
    qfafSizingCushion: 0,
    qfafDuration: 5,
    qfafSizingMode: 'dynamic',
    startMonth: 1,
    ...overrides,
  };
}

describe('loss-reserve summary (D-015)', () => {
  it('reports the final-year CF balances', () => {
    const result = calculate(createInputs(), DEFAULT_SETTINGS);
    const lastYear = result.years[result.years.length - 1];

    expect(result.summary.finalStCarryforward).toBeCloseTo(lastYear.stLossCarryforward, 2);
    expect(result.summary.finalLtCarryforward).toBeCloseTo(lastYear.ltLossCarryforward, 2);
    // EDI-only builds a real ST reserve (no QFAF gains consuming losses)
    expect(result.summary.finalStCarryforward).toBeGreaterThan(0);
  });

  it('values the reserve at CA combined gains rates by character', () => {
    // ltGainsEnabled off keeps the existing LT CF intact so the LT-rate leg
    // of the valuation is exercised (harvesting alone only builds ST CF).
    const result = calculate(
      createInputs({ existingLtLossCarryforward: 1000000, ltGainsEnabled: false }),
      DEFAULT_SETTINGS
    );
    const { finalStCarryforward, finalLtCarryforward } = result.summary;
    expect(finalLtCarryforward).toBeGreaterThan(0);

    const expected =
      finalStCarryforward * (FED_ST + 0.133) + finalLtCarryforward * (FED_LT + 0.133);
    expect(result.summary.lossReserveShelterValue).toBeCloseTo(expected, 2);
  });

  it('values the reserve at PA GAINS rates despite no ordinary-loss offset', () => {
    // PA gives $0 state benefit on ordinary deductions/NOL
    // (allowsLossOffsetAgainstIncome: false), but it DOES tax capital gains
    // at 3.07% — and CF shelter offsets future gains, so the reserve keeps
    // the state gains-rate component.
    const result = calculate(
      createInputs({
        stateCode: 'PA',
        stateRate: 0.0307,
        existingLtLossCarryforward: 1000000,
        ltGainsEnabled: false,
      }),
      DEFAULT_SETTINGS
    );
    const { finalStCarryforward, finalLtCarryforward } = result.summary;

    const expected =
      finalStCarryforward * (FED_ST + 0.0307) + finalLtCarryforward * (FED_LT + 0.0307);
    expect(result.summary.lossReserveShelterValue).toBeCloseTo(expected, 2);
  });

  it('is contingent: never added to totalTaxSavings', () => {
    const withReserve = calculate(createInputs(), DEFAULT_SETTINGS);
    expect(withReserve.summary.lossReserveShelterValue).toBeGreaterThan(0);
    // Realized savings in EDI-only mode are only the $3K/yr deductions —
    // orders of magnitude below the reserve value.
    expect(withReserve.summary.totalTaxSavings).toBeLessThan(
      withReserve.summary.lossReserveShelterValue / 10
    );
  });
});

describe('computeEdiInsights (D-014)', () => {
  it('returns a null protection ratio when no financing cost is modeled', () => {
    // DEFAULT_SETTINGS has financingFeesEnabled: false → cost is 0, and a
    // ratio over zero cost is meaningless (display as "—", not Infinity).
    const result = calculate(createInputs(), DEFAULT_SETTINGS);
    const insights = computeEdiInsights(result);

    expect(insights.cumulativeFinancingCost).toBe(0);
    expect(insights.protectionRatio).toBeNull();
  });

  it('computes shelter value per financing dollar when fees are enabled', () => {
    const settings = { ...DEFAULT_SETTINGS, financingFeesEnabled: true };
    const result = calculate(createInputs(), settings);
    const insights = computeEdiInsights(result);

    const expectedCost = result.years.reduce((s, y) => s + y.financingCostPaid, 0);
    expect(expectedCost).toBeGreaterThan(0);
    expect(insights.cumulativeFinancingCost).toBeCloseTo(expectedCost, 2);
    expect(insights.protectionRatio).not.toBeNull();
    expect(insights.protectionRatio!).toBeCloseTo(
      result.summary.lossReserveShelterValue / expectedCost,
      6
    );
  });

  it('break-even gain event equals the sum of the final CF balances', () => {
    const result = calculate(
      createInputs({ existingLtLossCarryforward: 500000, ltGainsEnabled: false }),
      DEFAULT_SETTINGS
    );
    const insights = computeEdiInsights(result);

    expect(insights.breakEvenGainEvent).toBeCloseTo(
      result.summary.finalStCarryforward + result.summary.finalLtCarryforward,
      2
    );
    expect(insights.finalStCarryforward).toBeCloseTo(result.summary.finalStCarryforward, 2);
    expect(insights.finalLtCarryforward).toBeCloseTo(result.summary.finalLtCarryforward, 2);
  });
});

describe('computeStepUpComparison (D-018)', () => {
  it('netIfHeldToStepUp ≥ netIfLiquidated when deferred tax is positive', () => {
    // QFAF on: harvested losses are consumed by QFAF gains, so basis erosion
    // creates real positive deferred tax that the step-up extinguishes.
    const settings = { ...DEFAULT_SETTINGS, growthEnabled: true, defaultAnnualReturn: 0.07 };
    const result = calculate(createInputs({ qfafEnabled: true }), settings);
    const exit = computeExitTaxAnalysis(result, COMBINED_LT_RATE, 0.07);
    expect(exit.incrementalDeferredTax).toBeGreaterThan(0);

    const cmp = computeStepUpComparison(result, exit);
    expect(cmp.netIfHeldToStepUp).toBeCloseTo(result.summary.totalTaxSavings, 2);
    expect(cmp.netIfLiquidated).toBeCloseTo(exit.netBenefitAfterLiquidation, 2);
    expect(cmp.netIfHeldToStepUp).toBeGreaterThanOrEqual(cmp.netIfLiquidated);
    expect(cmp.stepUpAdvantage).toBeCloseTo(exit.incrementalDeferredTax, 2);
  });

  it('recommends full unwind when carryforward exceeds embedded gain', () => {
    // Large pre-existing CF: liquidation is tax-free, and the excess CF would
    // die with the taxpayer — use it during life.
    const settings = { ...DEFAULT_SETTINGS, growthEnabled: true, defaultAnnualReturn: 0.07 };
    const result = calculate(createInputs({ existingStLossCarryforward: 30000000 }), settings);
    const exit = computeExitTaxAnalysis(result, COMBINED_LT_RATE, 0.07);
    expect(exit.remainingCapitalLossCf).toBeGreaterThan(exit.embeddedGain);

    const cmp = computeStepUpComparison(result, exit);
    expect(cmp.recommendation).toBe('unwind');
    expect(cmp.optimalUnwindPct).toBe(1);
    expect(cmp.unwindBeforeDeath.taxPaid).toBe(0);
  });

  it('recommends partial unwind sized as CF ÷ embedded gain', () => {
    // EDI-only with growth and no pre-existing CF: appreciation pushes the
    // embedded gain above the harvested CF, so unwind only the shelterable slice.
    const settings = { ...DEFAULT_SETTINGS, growthEnabled: true, defaultAnnualReturn: 0.07 };
    const result = calculate(createInputs(), settings);
    const exit = computeExitTaxAnalysis(result, COMBINED_LT_RATE, 0.07);
    expect(exit.embeddedGain).toBeGreaterThan(exit.remainingCapitalLossCf);
    expect(exit.remainingCapitalLossCf).toBeGreaterThan(0);

    const cmp = computeStepUpComparison(result, exit);
    expect(cmp.recommendation).toBe('partial_unwind');
    expect(cmp.optimalUnwindPct).toBeCloseTo(exit.remainingCapitalLossCf / exit.embeddedGain, 6);
    expect(cmp.optimalUnwindPct).toBeLessThan(1);
  });

  it('exposes what dies with the taxpayer: CF balance and its contingent value', () => {
    const result = calculate(createInputs(), DEFAULT_SETTINGS);
    const exit = computeExitTaxAnalysis(result, COMBINED_LT_RATE, 0);
    const cmp = computeStepUpComparison(result, exit);

    expect(cmp.continueAndDie.carryforwardLost).toBeCloseTo(exit.remainingCapitalLossCf, 2);
    expect(cmp.continueAndDie.carryforwardValueLost).toBeCloseTo(
      result.summary.lossReserveShelterValue,
      2
    );
    expect(cmp.continueAndDie.stepUpTaxAvoided).toBeCloseTo(
      exit.embeddedGain * COMBINED_LT_RATE,
      2
    );
    // The lost CF value is disclosed, not netted out of the step-up benefit
    expect(cmp.netIfHeldToStepUp).toBeCloseTo(result.summary.totalTaxSavings, 2);
  });
});
