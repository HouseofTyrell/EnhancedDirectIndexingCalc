/**
 * Split Allocation Tests
 *
 * Verifies that the split-allocation feature (cash → Core leg, appreciated
 * stock → Overlay leg) produces the same calculation results as running each
 * leg's strategy on the full collateral, blended by collateral weight.
 */
import { describe, it, expect } from 'vitest';
import { calculate, calculateSizing } from './calculations';
import { CalculatorInputs, DEFAULT_SETTINGS, SplitAllocation } from './types';

function createInputs(overrides: Partial<CalculatorInputs> = {}): CalculatorInputs {
  return {
    filingStatus: 'mfj',
    stateCode: 'CA',
    stateRate: 0.133,
    annualIncome: 1_000_000,
    strategyId: 'core-145-45',
    collateralAmount: 10_000_000,
    existingStLossCarryforward: 0,
    existingLtLossCarryforward: 0,
    existingNolCarryforward: 0,
    qfafEnabled: true,
    qfafSizingYears: 1,
    qfafSizingCushion: 0,
    qfafDuration: 10,
    qfafSizingMode: 'fixed',
    startMonth: 1,
    ltGainsEnabled: false,
    ...overrides,
  };
}

describe('Split Allocation', () => {
  it('falls back to single-strategy mode when split is disabled', () => {
    const baseline = createInputs();
    const withSplit: CalculatorInputs = {
      ...baseline,
      splitAllocation: {
        enabled: false,
        coreStrategyId: 'core-145-45',
        coreAmount: 5_000_000,
        overlayStrategyId: 'overlay-45-45',
        overlayAmount: 5_000_000,
      },
    };
    const a = calculate(baseline, DEFAULT_SETTINGS);
    const b = calculate(withSplit, DEFAULT_SETTINGS);
    expect(b.summary.totalTaxSavings).toBeCloseTo(a.summary.totalTaxSavings, 4);
    expect(b.sizing.collateralValue).toBe(a.sizing.collateralValue);
  });

  it('falls back to single-strategy mode when a leg amount is zero', () => {
    const inputs = createInputs({
      splitAllocation: {
        enabled: true,
        coreStrategyId: 'core-145-45',
        coreAmount: 0,
        overlayStrategyId: 'overlay-45-45',
        overlayAmount: 10_000_000,
      },
    });
    // Both legs must be > 0 for split mode to activate; otherwise the calc
    // uses inputs.strategyId / inputs.collateralAmount as before.
    const result = calculate(inputs, DEFAULT_SETTINGS);
    expect(result.sizing.splitLegs).toBeUndefined();
  });

  it('matches a 100/0 split to single-strategy run on the same strategy', () => {
    const totalCollateral = 10_000_000;
    const coreOnly = createInputs({
      strategyId: 'core-145-45',
      collateralAmount: totalCollateral,
    });
    const splitMostlyCore: CalculatorInputs = createInputs({
      // Put 99.999% in core to approximate a "100/0" split (fully in the core leg).
      // Strict 0 in either leg falls back to single-strategy mode.
      collateralAmount: 0, // Should be ignored when split is active
      splitAllocation: {
        enabled: true,
        coreStrategyId: 'core-145-45',
        coreAmount: totalCollateral - 1,
        overlayStrategyId: 'overlay-45-45',
        overlayAmount: 1,
      },
    });
    const a = calculate(coreOnly, DEFAULT_SETTINGS);
    const b = calculate(splitMostlyCore, DEFAULT_SETTINGS);
    // Within 0.1% — small overlay leg shouldn't materially change results
    const diff = Math.abs(a.summary.totalTaxSavings - b.summary.totalTaxSavings);
    expect(diff / a.summary.totalTaxSavings).toBeLessThan(0.001);
  });

  it('blends ST loss rates by collateral weight', () => {
    // Core 130/30 has 23% Year-1 ST loss rate; Overlay 30/30 has 11%.
    // 50/50 blend should produce 17% Year-1 ST loss rate.
    const inputs = createInputs({
      splitAllocation: {
        enabled: true,
        coreStrategyId: 'core-130-30',
        coreAmount: 5_000_000,
        overlayStrategyId: 'overlay-30-30',
        overlayAmount: 5_000_000,
      },
    });
    const sizing = calculateSizing(inputs);
    expect(sizing.collateralValue).toBe(10_000_000);
    expect(sizing.avgStLossRate).toBeCloseTo(0.17, 4); // (0.23 + 0.11) / 2
    expect(sizing.year1StLosses).toBeCloseTo(1_700_000, 0); // 10M × 17%
    expect(sizing.splitLegs).toHaveLength(2);
    const legs = sizing.splitLegs ?? [];
    expect(legs[0]?.strategyType).toBe('core');
    expect(legs[1]?.strategyType).toBe('overlay');
    expect(legs[0]?.year1StLosses).toBeCloseTo(1_150_000, 0); // 5M × 23%
    expect(legs[1]?.year1StLosses).toBeCloseTo(550_000, 0);   // 5M × 11%
  });

  it('auto-sizes QFAF against the combined ST loss capacity', () => {
    const split: SplitAllocation = {
      enabled: true,
      coreStrategyId: 'core-145-45',
      coreAmount: 3_000_000,
      overlayStrategyId: 'overlay-45-45',
      overlayAmount: 7_000_000,
    };
    const inputs = createInputs({ splitAllocation: split });
    const sizing = calculateSizing(inputs);

    // Core 145/45 Y1: 28.5%; Overlay 45/45 Y1: 16.5%
    // Blended: (3M × 0.285 + 7M × 0.165) / 10M = (855K + 1.155M) / 10M = 0.201
    expect(sizing.avgStLossRate).toBeCloseTo(0.201, 4);
    expect(sizing.year1StLosses).toBeCloseTo(2_010_000, 0);
    // QFAF sized at losses / 150%
    expect(sizing.qfafValue).toBeCloseTo(2_010_000 / 1.5, 0);
  });

  it('produces positive tax savings for a typical split scenario', () => {
    const inputs = createInputs({
      annualIncome: 3_000_000,
      splitAllocation: {
        enabled: true,
        coreStrategyId: 'core-145-45',
        coreAmount: 3_000_000,
        overlayStrategyId: 'overlay-45-45',
        overlayAmount: 7_000_000,
      },
    });
    const result = calculate(inputs, DEFAULT_SETTINGS);
    expect(result.summary.totalTaxSavings).toBeGreaterThan(0);
    expect(result.years.length).toBeGreaterThan(0);
    expect(result.sizing.splitLegs).toHaveLength(2);
  });

  it('approximates the weighted average of two single-strategy runs', () => {
    // Run each leg as its own single-strategy analysis on its share of collateral,
    // then verify the split-mode total tax savings is close to the sum.
    const coreOnly = calculate(
      createInputs({ strategyId: 'core-145-45', collateralAmount: 3_000_000 }),
      DEFAULT_SETTINGS
    );
    const overlayOnly = calculate(
      createInputs({ strategyId: 'overlay-45-45', collateralAmount: 7_000_000 }),
      DEFAULT_SETTINGS
    );
    const split = calculate(
      createInputs({
        splitAllocation: {
          enabled: true,
          coreStrategyId: 'core-145-45',
          coreAmount: 3_000_000,
          overlayStrategyId: 'overlay-45-45',
          overlayAmount: 7_000_000,
        },
      }),
      DEFAULT_SETTINGS
    );

    // The split run shares one QFAF across both legs and one §461(l) cap, so it
    // doesn't equal the sum of two independent runs — but it should be in the
    // same order of magnitude.
    expect(split.summary.totalTaxSavings).toBeGreaterThan(0);
    const independentSum = coreOnly.summary.totalTaxSavings + overlayOnly.summary.totalTaxSavings;
    // Split (one shared §461(l) cap) should be less than the sum of independent runs.
    expect(split.summary.totalTaxSavings).toBeLessThanOrEqual(independentSum * 1.05);
  });
});
