/**
 * Tests for the exit-tax / deferred-gain analysis (D-003).
 *
 * Harvesting reduces cost basis, so part of the projected savings is a
 * timing benefit that reverses on liquidation. These tests verify the
 * decomposition of headline savings into permanent vs deferred components.
 */

import { describe, it, expect } from 'vitest';
import { calculate } from './calculations';
import { computeExitTaxAnalysis } from './calculations/exitTax';
import { CalculatorInputs, DEFAULT_SETTINGS } from './types';

const COMBINED_LT_RATE = 0.238 + 0.133; // 20% + 3.8% NIIT + 13.3% CA

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
    qfafEnabled: true,
    qfafSizingYears: 1,
    qfafSizingCushion: 0,
    qfafDuration: 5,
    qfafSizingMode: 'dynamic',
    startMonth: 1,
    ...overrides,
  };
}

describe('computeExitTaxAnalysis', () => {
  it('computes embedded gain from harvested losses with growth disabled', () => {
    const result = calculate(createInputs(), DEFAULT_SETTINGS);
    const analysis = computeExitTaxAnalysis(result, COMBINED_LT_RATE, 0);

    // Basis reduction = Σ(harvested ST losses − realized LT gains)
    const expectedBasisReduction = result.years.reduce(
      (s, y) => s + y.stLossesHarvested - y.ltGainsRealized,
      0
    );
    expect(analysis.cumulativeBasisReduction).toBeCloseTo(expectedBasisReduction, 2);

    // With growth and fees disabled (defaults), collateral value is flat,
    // so embedded gain is entirely basis reduction.
    expect(analysis.marketAppreciation).toBeCloseTo(0, 0);
    expect(analysis.embeddedGain).toBeCloseTo(Math.max(0, expectedBasisReduction), 2);
  });

  it('shelters the exit gain with remaining capital loss carryforwards', () => {
    const result = calculate(createInputs(), DEFAULT_SETTINGS);
    const analysis = computeExitTaxAnalysis(result, COMBINED_LT_RATE, 0);

    const lastYear = result.years[result.years.length - 1];
    const expectedCf = lastYear.stLossCarryforward + lastYear.ltLossCarryforward;
    expect(analysis.remainingCapitalLossCf).toBeCloseTo(expectedCf, 2);
    expect(analysis.cfShelterUsed).toBeCloseTo(
      Math.min(expectedCf, analysis.embeddedGain),
      2
    );
    expect(analysis.exitTax).toBeCloseTo(
      analysis.taxableGainAfterShelter * COMBINED_LT_RATE,
      2
    );
  });

  it('never reports net benefit above headline savings', () => {
    const result = calculate(createInputs(), DEFAULT_SETTINGS);
    const analysis = computeExitTaxAnalysis(result, COMBINED_LT_RATE, 0);

    expect(analysis.netBenefitAfterLiquidation).toBeLessThanOrEqual(
      analysis.totalTaxSavings + 0.01
    );
    expect(analysis.netBenefitAfterLiquidation).toBeCloseTo(
      analysis.totalTaxSavings - analysis.incrementalDeferredTax,
      2
    );
  });

  it('reports a passive baseline exit tax when growth is enabled', () => {
    const settings = { ...DEFAULT_SETTINGS, growthEnabled: true, defaultAnnualReturn: 0.07 };
    const result = calculate(createInputs(), settings);
    const analysis = computeExitTaxAnalysis(result, COMBINED_LT_RATE, 0.07);

    // Passive buy-and-hold appreciates and owes exit tax on appreciation only
    const horizon = result.years.length;
    const expectedPassiveGain = 10000000 * (Math.pow(1.07, horizon) - 1);
    expect(analysis.passiveExitTax).toBeCloseTo(expectedPassiveGain * COMBINED_LT_RATE, 0);

    // Incremental deferred tax compares strategy exit tax to the passive baseline
    expect(analysis.incrementalDeferredTax).toBeCloseTo(
      Math.max(0, analysis.exitTax - analysis.passiveExitTax),
      2
    );
  });

  it('keeps the remaining NOL out of the exit shelter (no double counting)', () => {
    // Large losses → NOL builds up; it must be reported separately, not used
    // to shelter the capital gain at exit.
    const result = calculate(createInputs({ collateralAmount: 50000000 }), DEFAULT_SETTINGS);
    const analysis = computeExitTaxAnalysis(result, COMBINED_LT_RATE, 0);

    const lastYear = result.years[result.years.length - 1];
    expect(analysis.remainingNolCarryforward).toBeCloseTo(lastYear.nolCarryforward, 2);
    // Shelter comes only from capital loss carryforwards
    expect(analysis.cfShelterUsed).toBeLessThanOrEqual(analysis.remainingCapitalLossCf + 0.01);
  });

  it('handles zero collateral without NaN', () => {
    const result = calculate(createInputs({ collateralAmount: 0 }), DEFAULT_SETTINGS);
    const analysis = computeExitTaxAnalysis(result, COMBINED_LT_RATE, 0);

    expect(Number.isFinite(analysis.embeddedGain)).toBe(true);
    expect(analysis.exitTax).toBe(0);
  });
});
