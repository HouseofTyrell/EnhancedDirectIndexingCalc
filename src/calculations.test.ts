/**
 * Baseline Tests for Tax Calculation Logic
 *
 * These tests document CURRENT behavior before any fixes.
 * Some tests may verify behavior that is technically incorrect per IRS rules.
 * After fixes are applied, these tests will be updated to reflect correct behavior.
 *
 * Test categories:
 * 1. Basic calculation sanity
 * 2. Section 461(l) limit behavior
 * 3. Capital loss netting
 * 4. NOL generation and usage
 * 5. MFS $1,500 capital loss limit
 * 6. Edge cases
 */

import { describe, it, expect } from 'vitest';
import { calculate, calculateSizing, calculateWithOverrides } from './calculations';
import { CalculatorInputs, DEFAULT_SETTINGS, AdvancedSettings } from './types';

// Helper to create base inputs
function createInputs(overrides: Partial<CalculatorInputs> = {}): CalculatorInputs {
  return {
    filingStatus: 'mfj',
    stateCode: 'CA',
    stateRate: 0.133,
    annualIncome: 500000,
    strategyId: 'core-130-30', // Conservative: 10% ST loss, 2.4% LT gain
    collateralAmount: 1000000,
    existingStLossCarryforward: 0,
    existingLtLossCarryforward: 0,
    existingNolCarryforward: 0,
    qfafEnabled: true,
    qfafSizingYears: 1, // Year 1 only for backwards-compatible test assertions
    qfafSizingCushion: 0,
    qfafDuration: 10,
    qfafSizingMode: 'fixed',
    startMonth: 1,
    ...overrides,
  };
}

describe('calculateSizing', () => {
  it('correctly calculates QFAF sizing for core-130-30 strategy', () => {
    const inputs = createInputs();
    const sizing = calculateSizing(inputs);

    // Core-130-30: 23% Year 1 ST loss rate, 2.4% LT gain rate
    expect(sizing.collateralValue).toBe(1000000);
    expect(sizing.year1StLosses).toBe(230000); // 1M × 23%
    expect(sizing.qfafValue).toBeCloseTo(153333.33, 0); // 230K / 150%
    expect(sizing.year1StGains).toBeCloseTo(230000, 0); // QFAF × 150%
    expect(sizing.year1OrdinaryLosses).toBeCloseTo(230000, 0); // QFAF × 150%
  });

  it('applies Section 461(l) limit to ordinary losses', () => {
    // Need $6.26M+ collateral with 10% loss rate to exceed $626K limit
    // QFAF ordinary losses = (collateral * 10% / 150%) * 150% = collateral * 10%
    const inputs = createInputs({ collateralAmount: 10000000 }); // 10M to hit limit
    const sizing = calculateSizing(inputs);

    // MFJ limit is $626,000
    // With 10M collateral, QFAF = 10M * 10% / 150% = 666.67K
    // Ordinary losses = 666.67K * 150% = 1M
    expect(sizing.year1OrdinaryLosses).toBeGreaterThan(512000);
    expect(sizing.year1UsableOrdinaryLoss).toBe(512000);
    expect(sizing.year1ExcessToNol).toBe(sizing.year1OrdinaryLosses - 512000);
  });

  it('uses single filer 461(l) limit when appropriate', () => {
    const inputs = createInputs({
      filingStatus: 'single',
      collateralAmount: 5000000,
    });
    const sizing = calculateSizing(inputs);

    // Single limit is $313,000
    expect(sizing.year1UsableOrdinaryLoss).toBe(256000);
    expect(sizing.section461Limit).toBe(256000);
  });
});

describe('calculate - basic behavior', () => {
  it('returns at least projectionYears of results (auto-extended by QFAF duration + 2)', () => {
    const result = calculate(createInputs());
    // Default qfafDuration=10, projectionYears=10 → max(10, 10+2) = 12
    expect(result.years).toHaveLength(12);
    expect(result.years[0].year).toBe(1);
    expect(result.years[11].year).toBe(12);
  });

  it('grows portfolio value over time with growth enabled', () => {
    const settings = { ...DEFAULT_SETTINGS, growthEnabled: true, defaultAnnualReturn: 0.07 };
    const result = calculate(createInputs(), settings);
    const year1 = result.years[0];
    const year10 = result.years[9];

    expect(year10.totalValue).toBeGreaterThan(year1.totalValue);
  });

  it('keeps portfolio flat with growth disabled', () => {
    const result = calculate(createInputs());
    const year1 = result.years[0];
    const year10 = result.years[9];

    // With growth disabled (default), portfolio values should stay constant
    expect(year10.totalValue).toBeCloseTo(year1.totalValue, 0);
  });

  it('generates positive tax savings', () => {
    const result = calculate(createInputs());
    expect(result.summary.totalTaxSavings).toBeGreaterThan(0);
  });

  it('calculates effective tax alpha', () => {
    const result = calculate(createInputs());
    // Tax alpha = total savings / total exposure / 10 years
    expect(result.summary.effectiveTaxAlpha).toBeGreaterThan(0);
    expect(result.summary.effectiveTaxAlpha).toBeLessThan(0.1); // Reasonable bound
  });
});

describe('calculate - Section 461(l) behavior', () => {
  it('limits ordinary loss deduction to 461(l) cap when income is high', () => {
    // With 10M collateral, 10% loss rate, and $1M income
    // Ordinary losses = 1M, cap = 626K, income = 1M
    // Usable = min(1M, 626K, 1M) = 626K
    const inputs = createInputs({
      annualIncome: 1000000,
      collateralAmount: 10000000,
    });
    const result = calculate(inputs);

    // Should be capped at 461(l) limit since income > cap
    expect(result.years[0].usableOrdinaryLoss).toBe(512000);
  });

  it('sends excess ordinary losses to NOL carryforward', () => {
    const inputs = createInputs({
      annualIncome: 1000000,
      collateralAmount: 10000000,
    });
    const result = calculate(inputs);

    // Excess above usable amount becomes NOL
    expect(result.years[0].excessToNol).toBeGreaterThan(0);
    expect(result.years[0].nolCarryforward).toBeGreaterThan(0);
  });

  it('shelters wages plus capital-gain income; shortfall flows to NOL (D-010)', () => {
    // Precise §461(l) model: the deduction is allowed up to the statutory
    // limit; it shelters wages AND net capital gain income. Any allowed
    // amount that exceeds available income becomes NOL instead of being lost.
    const inputs = createInputs({
      annualIncome: 100000,
      collateralAmount: 10000000,
    });
    const result = calculate(inputs);
    const y1 = result.years[0];

    // Income available = $100K wages + $240K taxable LT gains (10M × 2.4%)
    expect(y1.usableOrdinaryLoss).toBeCloseTo(340000, 0);

    // Everything not sheltered this year flows to NOL
    expect(y1.excessToNol).toBeCloseTo(y1.ordinaryLossesGenerated - y1.usableOrdinaryLoss, 2);
    expect(y1.excessToNol).toBeGreaterThan(0);
  });
});

describe('calculate - NOL behavior', () => {
  it('accumulates NOL over time when exceeding 461(l) limit', () => {
    // Need large enough collateral to generate NOL (exceed 461(l) limit)
    const inputs = createInputs({ collateralAmount: 10000000 });
    const result = calculate(inputs);

    // NOL should grow each year (or at least be non-zero if some is used)
    expect(result.years[4].nolCarryforward).toBeGreaterThan(0);
  });

  it('uses NOL to offset taxable income (80% limit)', () => {
    // Start with existing NOL
    const inputs = createInputs({
      existingNolCarryforward: 1000000,
      collateralAmount: 100000, // Small QFAF so we have taxable income
    });
    const result = calculate(inputs);

    // Should use some NOL each year
    expect(result.years[0].nolUsedThisYear).toBeGreaterThan(0);
  });

  it('respects 80% NOL offset limit', () => {
    const inputs = createInputs({
      annualIncome: 500000,
      existingNolCarryforward: 1000000,
      collateralAmount: 10000, // Very small to maximize taxable income
    });
    const result = calculate(inputs);

    // NOL used should be <= 80% of taxable income before NOL
    // With 500K income, max NOL usage ~= 400K
    expect(result.years[0].nolUsedThisYear).toBeLessThanOrEqual(500000 * 0.8);
  });
});

describe('calculate - capital loss netting', () => {
  it('applies ST carryforward to offset ST gains', () => {
    const inputs = createInputs({
      existingStLossCarryforward: 50000,
    });
    const result = calculate(inputs);

    // Carryforward should be reduced
    expect(result.years[0].stLossCarryforward).toBeLessThan(50000);
  });

  it('applies LT carryforward to offset LT gains', () => {
    const inputs = createInputs({
      existingLtLossCarryforward: 50000,
    });
    const result = calculate(inputs);

    // LT carryforward should be reduced
    expect(result.years[0].ltLossCarryforward).toBeLessThan(50000);
  });

  it('cross-applies ST carryforward to LT gains when ST gains exhausted', () => {
    const inputs = createInputs({
      existingStLossCarryforward: 100000, // More than ST gains
    });
    const result = calculate(inputs);

    // Some ST carryforward should be used against LT gains
    // With auto-sizing, ST gains = ST losses, so all carryforward goes to LT
    expect(result.years[0].stLossCarryforward).toBeLessThan(100000);
  });

  it('uses $3,000 capital loss against ordinary income', () => {
    // With auto-sizing, ST gains = ST losses, so carryforward goes to LT gains
    // Need large carryforward that exceeds LT gains to have some left for ordinary income
    const inputs = createInputs({
      existingStLossCarryforward: 100000,
      existingLtLossCarryforward: 100000,
      collateralAmount: 100000, // Small collateral = small LT gains
    });
    const result = calculate(inputs);

    // Should use up to $3,000 against ordinary income
    expect(result.years[0].capitalLossUsedAgainstIncome).toBeLessThanOrEqual(3000);
    expect(result.years[0].capitalLossUsedAgainstIncome).toBeGreaterThan(0);
  });
});

describe('calculate - MFS filing status', () => {
  it('uses $1,500 capital loss limit for MFS filers', () => {
    const inputs = createInputs({
      filingStatus: 'mfs',
      existingStLossCarryforward: 10000,
      existingLtLossCarryforward: 10000,
    });
    const result = calculate(inputs);

    // MFS limit is $1,500, not $3,000
    expect(result.years[0].capitalLossUsedAgainstIncome).toBeLessThanOrEqual(1500);
  });

  it('uses $256,000 Section 461(l) limit for MFS filers', () => {
    const inputs = createInputs({
      filingStatus: 'mfs',
      collateralAmount: 5000000,
    });
    const result = calculate(inputs);

    expect(result.years[0].usableOrdinaryLoss).toBe(256000);
  });
});

describe('calculate - loss rate decay', () => {
  it('reduces effective loss RATE over time due to TLH exhaustion', () => {
    const result = calculate(createInputs());

    // Calculate effective ST loss rate for each year (ST losses / collateral)
    const year1Rate = result.years[0].stLossesHarvested / result.years[0].collateralValue;
    const year10Rate = result.years[9].stLossesHarvested / result.years[9].collateralValue;

    // Year 1 rate should be higher than Year 10 rate
    // (even though absolute dollar amounts may grow due to portfolio growth)
    expect(year1Rate).toBeGreaterThan(year10Rate);
  });

  it('uses year-by-year rates from strategy data', () => {
    const result = calculate(createInputs());

    // Core-130-30 has year-by-year rates that stabilize at Year 6
    // Year 1: 23%, Year 10: 3%
    const year1Rate = result.years[0].stLossesHarvested / result.years[0].collateralValue;
    const year10Rate = result.years[9].stLossesHarvested / result.years[9].collateralValue;

    // Check rates follow the expected pattern
    // Year 1 should be significantly higher than Year 10
    expect(year1Rate).toBeGreaterThan(0.20); // ~23%
    expect(year10Rate).toBeLessThan(0.05); // ~3%
  });
});

describe('calculate - wash sale adjustment', () => {
  it('default has no wash sale disallowance', () => {
    const result = calculate(createInputs());

    // Core-130-30 has 23% Year 1 ST loss rate
    // Default wash sale rate is 0, so all losses are harvested
    // Gross losses = collateral × stLossRate = 1M × 23% = 230K
    const grossLosses = 1000000 * 0.23;
    const expectedHarvested = grossLosses; // No reduction with 0% wash sale

    expect(result.years[0].stLossesHarvested).toBeCloseTo(expectedHarvested, 0);
  });

  it('respects custom wash sale rate', () => {
    const customSettings: AdvancedSettings = {
      ...DEFAULT_SETTINGS,
      washSaleDisallowanceRate: 0.1, // 10% disallowed
    };
    const result = calculate(createInputs(), customSettings);

    // Core-130-30 has 23% Year 1 ST loss rate
    // With 10% wash sale, harvested = 90% of gross
    const grossLosses = 1000000 * 0.23;
    const expectedHarvested = grossLosses * 0.9;

    expect(result.years[0].stLossesHarvested).toBeCloseTo(expectedHarvested, 0);
  });
});

describe('calculate - financing costs', () => {
  it('reduces growth rate for leveraged strategies', () => {
    // Compare core-130-30 (lower leverage) vs core-225-125 (higher leverage)
    const inputs130 = createInputs({ strategyId: 'core-130-30' }); // 1.5% financing
    const inputs225 = createInputs({ strategyId: 'core-225-125' }); // 4.5% financing

    const result130 = calculate(inputs130);
    const result225 = calculate(inputs225);

    // Different strategies should produce different results
    expect(result130.summary.effectiveTaxAlpha).not.toBe(result225.summary.effectiveTaxAlpha);
  });
});

describe('calculate - QFAF toggle', () => {
  it('sets QFAF to zero when disabled', () => {
    const inputs = createInputs({ qfafEnabled: false });
    const result = calculate(inputs);

    expect(result.sizing.qfafValue).toBe(0);
    expect(result.sizing.year1StGains).toBe(0);
    expect(result.sizing.year1OrdinaryLosses).toBe(0);
  });

  it('still generates collateral ST losses when QFAF disabled', () => {
    const inputs = createInputs({ qfafEnabled: false });
    const result = calculate(inputs);

    // Collateral still harvests ST losses
    expect(result.sizing.year1StLosses).toBeGreaterThan(0);
    expect(result.years[0].stLossesHarvested).toBeGreaterThan(0);
  });

  it('has net ST loss (carryforward) when QFAF disabled', () => {
    const inputs = createInputs({ qfafEnabled: false });
    const result = calculate(inputs);

    // Without QFAF ST gains, all collateral ST losses become carryforward
    expect(result.years[0].stLossCarryforward).toBeGreaterThan(0);
  });

  it('generates LT gains from collateral when QFAF disabled', () => {
    const inputs = createInputs({ qfafEnabled: false });
    const result = calculate(inputs);

    // Collateral still realizes LT gains
    expect(result.years[0].ltGainsRealized).toBeGreaterThan(0);
  });

  it('accumulates capital loss carryforward over multiple years when QFAF disabled', () => {
    const inputs = createInputs({ qfafEnabled: false, collateralAmount: 10000000 });
    const result = calculate(inputs);

    // Year 1: ST losses - LT gains - $3K ordinary = carryforward
    const year1 = result.years[0];
    expect(year1.stLossCarryforward).toBeGreaterThan(0);

    // Year 5: carryforward should have grown (net ST losses each year)
    const year5 = result.years[4];
    expect(year5.stLossCarryforward).toBeGreaterThan(year1.stLossCarryforward);

    // Year 10: carryforward should continue growing
    const year10 = result.years[9];
    expect(year10.stLossCarryforward).toBeGreaterThan(year5.stLossCarryforward);
  });

  it('uses capital loss carryforward to offset LT gains each year', () => {
    const inputs = createInputs({ qfafEnabled: false, collateralAmount: 10000000 });
    const result = calculate(inputs);

    // Each year should use $3K against ordinary income
    for (const year of result.years) {
      expect(year.capitalLossUsedAgainstIncome).toBe(3000);
    }
  });
});

describe('calculate - edge cases', () => {
  it('handles zero collateral amount', () => {
    const inputs = createInputs({ collateralAmount: 0 });
    const result = calculate(inputs);

    expect(result.sizing.qfafValue).toBe(0);
    expect(result.years[0].totalTax).toBe(0);
  });

  it('handles very high income correctly', () => {
    const inputs = createInputs({ annualIncome: 10000000 }); // $10M
    const result = calculate(inputs);

    // Should not produce NaN or Infinity
    expect(Number.isFinite(result.summary.totalTaxSavings)).toBe(true);
    expect(result.summary.totalTaxSavings).toBeGreaterThan(0);
  });

  it('handles very large existing carryforwards', () => {
    const inputs = createInputs({
      existingStLossCarryforward: 10000000,
      existingLtLossCarryforward: 10000000,
      existingNolCarryforward: 10000000,
    });
    const result = calculate(inputs);

    // Should not produce NaN or Infinity
    expect(Number.isFinite(result.summary.totalTaxSavings)).toBe(true);
  });

  it('handles all filing statuses', () => {
    const statuses = ['single', 'mfj', 'mfs', 'hoh'] as const;

    for (const status of statuses) {
      const inputs = createInputs({ filingStatus: status });
      const result = calculate(inputs);

      // Default qfafDuration=10, projectionYears=10 → auto-extended to 12
      expect(result.years).toHaveLength(12);
      expect(Number.isFinite(result.summary.totalTaxSavings)).toBe(true);
    }
  });
});

describe('fixed issues', () => {
  /**
   * D-010 precise model: the deduction caps at the statutory limit; the
   * income shelter includes capital gains, and any shortfall becomes NOL
   * (negative taxable income → NOL per IRC §172) rather than being lost.
   */
  it('461(l) deduction shelters available income; the rest becomes NOL', () => {
    const inputs = createInputs({
      annualIncome: 50000,
      collateralAmount: 10000000,
    });
    const result = calculate(inputs);
    const y1 = result.years[0];

    // $50K wages + $240K LT gains of shelterable income
    expect(y1.usableOrdinaryLoss).toBeCloseTo(290000, 0);
    expect(y1.usableOrdinaryLoss).toBeLessThanOrEqual(512000);
    expect(y1.excessToNol).toBeCloseTo(y1.ordinaryLossesGenerated - y1.usableOrdinaryLoss, 2);
  });

  /**
   * FIXED: Current-year ST losses now tracked as carryforward
   * Unused current-year losses become carryforward
   */
  it('unused current-year ST losses should carry forward', () => {
    // Create scenario where ST losses exceed ST gains
    const inputs = createInputs({
      qfafOverride: 10000, // Very small QFAF = small ST gains
    });
    const result = calculate(inputs);

    // Excess ST losses should appear in carryforward
    expect(result.years[0].stLossCarryforward).toBeGreaterThan(0);
  });
});

describe('QFAF Duration', () => {
  it('should zero out QFAF contributions after duration expires', () => {
    const inputs = createInputs({ qfafDuration: 3 });
    const settings = { ...DEFAULT_SETTINGS, projectionYears: 5 };
    const result = calculate(inputs, settings);

    // Years 1-3 should have QFAF ST gains
    expect(result.years[0].stGainsGenerated).toBeGreaterThan(0);
    expect(result.years[1].stGainsGenerated).toBeGreaterThan(0);
    expect(result.years[2].stGainsGenerated).toBeGreaterThan(0);

    // Years 4-5 should have zero QFAF ST gains (QFAF unwound)
    expect(result.years[3].stGainsGenerated).toBe(0);
    expect(result.years[4].stGainsGenerated).toBe(0);

    // Years 4-5 should also have zero ordinary losses from QFAF
    expect(result.years[3].ordinaryLossesGenerated).toBe(0);
    expect(result.years[4].ordinaryLossesGenerated).toBe(0);
  });

  it('should stop all strategy activity after QFAF duration expires', () => {
    const inputs = createInputs({ qfafDuration: 2 });
    const settings = { ...DEFAULT_SETTINGS, projectionYears: 5 };
    const result = calculate(inputs, settings);

    // Post-duration years should have no new tax events (full strategy wind-down)
    expect(result.years[3].stLossesHarvested).toBe(0);
    expect(result.years[4].stLossesHarvested).toBe(0);
    expect(result.years[3].ltGainsRealized).toBe(0);
    expect(result.years[4].ltGainsRealized).toBe(0);

    // Strategy active flag should be false for post-duration years
    expect(result.years[0].strategyActive).toBe(true);
    expect(result.years[1].strategyActive).toBe(true);
    expect(result.years[2].strategyActive).toBe(false);
    expect(result.years[3].strategyActive).toBe(false);
  });

  it('should carry forward losses built during QFAF years into post-QFAF years', () => {
    // Use large collateral to generate ordinary losses exceeding 461(l) limit,
    // which produces NOL carryforward that persists after QFAF unwind
    const inputs = createInputs({ qfafDuration: 1, collateralAmount: 10000000 });
    const settings = { ...DEFAULT_SETTINGS, projectionYears: 5 };
    const result = calculate(inputs, settings);

    // NOL generated in year 1 should persist into later years
    const year1Nol = result.years[0].nolCarryforward;
    expect(year1Nol).toBeGreaterThan(0);

    // Year 2+ should still have NOL carryforward (may decrease as it's used)
    expect(result.years[1].nolCarryforward).toBeGreaterThanOrEqual(0);
  });

  it('should auto-extend projection when duration + 2 > projectionYears', () => {
    const inputs = createInputs({ qfafDuration: 9 });
    const settings = { ...DEFAULT_SETTINGS, projectionYears: 5 };
    const result = calculate(inputs, settings);

    // Should extend to at least duration + 2 = 11 years
    expect(result.years.length).toBeGreaterThanOrEqual(11);
  });

  it('should not extend projection when projectionYears already exceeds duration + 2', () => {
    const inputs = createInputs({ qfafDuration: 3 });
    const settings = { ...DEFAULT_SETTINGS, projectionYears: 10 };
    const result = calculate(inputs, settings);

    // Should stay at 10 (no extension needed)
    expect(result.years.length).toBe(10);
  });

  it('should cap sizing window to duration when sizingYears > duration', () => {
    const inputs = createInputs({ qfafDuration: 3, qfafSizingYears: 10 });
    const result = calculate(inputs);

    // Sizing should use 3-year average (capped to duration), not 10-year
    expect(result.sizing.sizingYears).toBe(3);
  });

  it('should combine duration, cushion, and sizing cap correctly', () => {
    const inputs = createInputs({
      qfafDuration: 5,
      qfafSizingYears: 10, // will be capped to 5
      qfafSizingCushion: 0.05, // 5% reduction
    });
    const settings = { ...DEFAULT_SETTINGS, projectionYears: 10 };
    const result = calculate(inputs, settings);

    // Sizing window should be capped to 5
    expect(result.sizing.sizingYears).toBe(5);

    // QFAF value should be 95% of un-cushioned value
    const inputsNoCushion = createInputs({
      qfafDuration: 5,
      qfafSizingYears: 10,
      qfafSizingCushion: 0,
    });
    const resultNoCushion = calculate(inputsNoCushion, settings);
    expect(result.sizing.qfafValue).toBeCloseTo(
      resultNoCushion.sizing.qfafValue * 0.95,
      0
    );

    // Year 5 should have QFAF, year 6 should not
    expect(result.years[4].stGainsGenerated).toBeGreaterThan(0);
    expect(result.years[5].stGainsGenerated).toBe(0);

    // Projection should be at least 10 years (projectionYears already >= duration + 2)
    expect(result.years.length).toBe(10);
  });
});

describe('QFAF sizing consistency', () => {
  it('matches ST gains to ST losses with a custom multiplier', () => {
    // With a 1.0x multiplier, sizing must divide by 1.0 (not the 1.5 default)
    // so gains still offset losses.
    const settings = { ...DEFAULT_SETTINGS, qfafMultiplier: 1.0 };
    const result = calculate(createInputs({ qfafSizingYears: 1 }), settings);
    const y1 = result.years[0];
    expect(y1.stGainsGenerated).toBeCloseTo(y1.stLossesHarvested, 0);
    expect(y1.stGainLeakage).toBeCloseTo(0, 0);
  });

  it('sizes against harvestable losses net of wash-sale disallowance', () => {
    // With 10% wash-sale disallowance, fixed-mode Year 1 should not leak
    // ST gains: the QFAF is sized to the net harvestable losses.
    const settings = { ...DEFAULT_SETTINGS, washSaleDisallowanceRate: 0.1 };
    const result = calculate(
      createInputs({ qfafSizingYears: 1, qfafSizingMode: 'fixed' }),
      settings
    );
    const y1 = result.years[0];
    expect(y1.stGainLeakage).toBeCloseTo(0, 0);
  });
});

describe('calculateWithOverrides custom-rate parity', () => {
  it('uses custom tax rates like calculate() does', () => {
    const settings = { ...DEFAULT_SETTINGS, stcgRate: 0.45, ltcgRate: 0.25 };
    const inputs = createInputs();
    const base = calculate(inputs, settings);
    const withOverrides = calculateWithOverrides(inputs, settings, []);
    expect(withOverrides.years[0].taxSavings).toBeCloseTo(base.years[0].taxSavings, 0);
    expect(withOverrides.years[0].ordinaryLossBenefit).toBeCloseTo(
      base.years[0].ordinaryLossBenefit,
      0
    );
  });
});

describe('LT gain cost uses taxable gains after offsets (CPA finding E)', () => {
  it('charges no LT cost in collateral-only mode when ST losses fully offset LT gains', () => {
    // QFAF off: harvested ST losses (23% Y1) far exceed LT gains (2.4%),
    // so taxable LT gains are $0 — the cost must be $0, not gross × rate.
    const inputs = createInputs({ qfafEnabled: false, collateralAmount: 10000000 });
    const result = calculate(inputs);
    const y1 = result.years[0];
    expect(y1.ltGainsRealized).toBeGreaterThan(0);
    expect(y1.ltGainCost).toBe(0);
  });

  it('still charges full LT cost in QFAF mode (ST losses consumed by QFAF gains)', () => {
    // $3M MFJ income → top LTCG bracket 20% + 3.8% NIIT
    const inputs = createInputs({
      annualIncome: 3000000,
      collateralAmount: 10000000,
      qfafSizingYears: 1,
    });
    const result = calculate(inputs);
    const y1 = result.years[0];
    // CA: fed LT 23.8% + 13.3% state
    expect(y1.ltGainCost).toBeCloseTo(y1.ltGainsRealized * (0.238 + 0.133), 0);
  });
});

describe('Per-state tax treatment (D-005)', () => {
  // Income $3M MFJ → fed ordinary 37%, fed ST 40.8% (incl. NIIT), fed LT 23.8%
  const base = { annualIncome: 3000000, collateralAmount: 10000000 };

  it('gives no PA state benefit for deductions against wages', () => {
    // PA's class-based system doesn't allow these losses to offset wages
    const result = calculate(createInputs({ ...base, stateCode: 'PA' }));
    const y1 = result.years[0];
    expect(y1.ordinaryLossBenefit).toBeCloseTo(y1.usableOrdinaryLoss * 0.37, 0);
  });

  it('gives no NJ state benefit for deductions against wages', () => {
    const result = calculate(createInputs({ ...base, stateCode: 'NJ' }));
    const y1 = result.years[0];
    expect(y1.ordinaryLossBenefit).toBeCloseTo(y1.usableOrdinaryLoss * 0.37, 0);
    // NJ still taxes the LT gains at 10.75%
    expect(y1.ltGainCost).toBeCloseTo(y1.ltGainsRealized * (0.238 + 0.1075), 0);
  });

  it('splits MA short-term and long-term rates', () => {
    // Fixed sizing decays harvests but not QFAF gains → later-year ST leakage
    const result = calculate(
      createInputs({ ...base, stateCode: 'MA', qfafSizingYears: 1, qfafSizingMode: 'fixed' })
    );
    const y1 = result.years[0];
    // LT gains: fed 23.8% + MA 9% (5% + 4% surtax)
    expect(y1.ltGainCost).toBeCloseTo(y1.ltGainsRealized * (0.238 + 0.09), 0);
    // Net ST gains: fed 40.8% + MA 12.5% (8.5% + 4% surtax)
    const leakYear = result.years.find(y => y.netStGainLoss > 1000);
    expect(leakYear).toBeDefined();
    expect(leakYear!.remainingStGainCost).toBeCloseTo(
      leakYear!.netStGainLoss * (0.408 + 0.125),
      0
    );
  });

  it('applies the WA 7% LTCG excise above the annual exemption', () => {
    // 10M × 2.4% = $240K LT gains → below the $270K exemption: no excise
    const small = calculate(createInputs({ ...base, stateCode: 'WA' }));
    expect(small.years[0].ltGainCost).toBeCloseTo(
      small.years[0].ltGainsRealized * 0.238,
      0
    );
    // 20M × 2.4% = $480K LT gains → $210K above exemption × 7% excise
    const large = calculate(createInputs({ ...base, stateCode: 'WA', collateralAmount: 20000000 }));
    const y1 = large.years[0];
    expect(y1.ltGainCost).toBeCloseTo(
      y1.ltGainsRealized * 0.238 + (y1.ltGainsRealized - 270000) * 0.07,
      0
    );
  });
});

describe('NIIT treatment of ordinary deductions', () => {
  // Deductions against ordinary income (wages) don't reduce net investment
  // income, so the 3.8% NIIT must be excluded from their value (IRC §1411).
  // ST gains/losses themselves remain NIIT-rated. Matches ediOnly.ts treatment.
  it('values ordinary loss benefit at the bracket rate without NIIT', () => {
    // $500K MFJ income → 32% bracket, above the $250K NIIT threshold
    const inputs = createInputs();
    const result = calculate(inputs, DEFAULT_SETTINGS);
    const y1 = result.years[0];

    const expectedCombinedOrdinaryRate = 0.32 + 0.133; // bracket + CA, NO 3.8% NIIT
    expect(y1.ordinaryLossBenefit).toBeCloseTo(
      y1.usableOrdinaryLoss * expectedCombinedOrdinaryRate,
      2
    );
  });

  it('values NOL usage benefit without NIIT', () => {
    // Large collateral so losses exceed the 461(l) limit and build NOL
    const inputs = createInputs({ collateralAmount: 10000000, annualIncome: 3000000 });
    const result = calculate(inputs, DEFAULT_SETTINGS);
    const yearWithNol = result.years.find(y => y.nolUsedThisYear > 0);
    expect(yearWithNol).toBeDefined();

    const expectedCombinedOrdinaryRate = 0.37 + 0.133; // top bracket + CA, NO NIIT
    expect(yearWithNol!.nolUsageBenefit).toBeCloseTo(
      yearWithNol!.nolUsedThisYear * expectedCombinedOrdinaryRate,
      2
    );
  });

  it('still applies NIIT to net ST gain costs', () => {
    // Disable QFAF sizing match by leaving fixed sizing in later years:
    // leakage years have remaining ST gains taxed at the full ST+NIIT rate
    const inputs = createInputs({ qfafSizingYears: 1, qfafSizingMode: 'fixed' });
    const result = calculate(inputs, DEFAULT_SETTINGS);
    const leakYear = result.years.find(y => y.netStGainLoss > 0);
    expect(leakYear).toBeDefined();

    const expectedCombinedStRate = 0.32 + 0.038 + 0.133; // bracket + NIIT + CA
    expect(leakYear!.remainingStGainCost).toBeCloseTo(
      leakYear!.netStGainLoss * expectedCombinedStRate,
      2
    );
  });
});

describe('ST Gain Leakage', () => {
  it('should report zero leakage when QFAF is properly sized (Year 1)', () => {
    const inputs = createInputs({ qfafSizingYears: 1 });
    const result = calculate(inputs);
    expect(result.years[0].stGainLeakage).toBeCloseTo(0, -2);
  });

  it('should report positive leakage in later years with fixed sizing', () => {
    const inputs = createInputs({ qfafSizingYears: 1, qfafSizingMode: 'fixed' });
    const result = calculate(inputs);
    expect(result.years[4].stGainLeakage).toBeGreaterThan(0);
  });

  it('should only return cash at terminal unwind in fixed mode', () => {
    // Fixed mode never resizes, so the only cash event is the terminal
    // unwind: the QFAF is redeemed at its end-of-year value in the last
    // operating calendar year (duration 10, January start → year 10).
    const inputs = createInputs({ qfafSizingMode: 'fixed' });
    const result = calculate(inputs);
    for (const year of result.years) {
      if (year.year === 10) {
        // Terminal proceeds equal the QFAF's end-of-year value
        expect(year.qfafCashReturned).toBeCloseTo(year.qfafValue, 2);
        expect(year.qfafCashReturned).toBeGreaterThan(0);
      } else {
        expect(year.qfafCashReturned).toBe(0);
      }
    }
  });

  it('should include returned QFAF cash in finalTotalWealth', () => {
    const inputs = createInputs({ qfafSizingMode: 'fixed' });
    const result = calculate(inputs);
    const totalReturned = result.years.reduce((s, y) => s + y.qfafCashReturned, 0);
    expect(result.summary.totalQfafCashReturned).toBeCloseTo(totalReturned, 2);
    expect(result.summary.finalTotalWealth).toBeCloseTo(
      result.summary.finalPortfolioValue + totalReturned,
      2
    );
    // The QFAF principal must not vanish from total wealth: with growth
    // disabled, final wealth ≈ collateral + initial QFAF value.
    expect(result.summary.finalTotalWealth).toBeGreaterThan(
      result.summary.finalPortfolioValue
    );
  });
});

describe('Dynamic QFAF Resizing', () => {
  it('should resize QFAF each year to match decaying ST losses', () => {
    const inputs = createInputs({
      qfafSizingMode: 'dynamic',
      qfafSizingYears: 1,
      strategyId: 'overlay-45-45',
    });
    const result = calculate(inputs);

    // Year 1: QFAF should match Year-1 losses (full size)
    const y1StGains = result.years[0].stGainsGenerated;
    const y1StLosses = result.years[0].stLossesHarvested;
    expect(y1StGains).toBeCloseTo(y1StLosses, -2);

    // Year 5: QFAF should be smaller (matching Year-5 rate)
    const y5StGains = result.years[4].stGainsGenerated;
    const y5StLosses = result.years[4].stLossesHarvested;
    expect(y5StGains).toBeCloseTo(y5StLosses, -2);
    expect(y5StGains).toBeLessThan(y1StGains);
  });

  it('should never increase QFAF beyond initial sizing', () => {
    const inputs = createInputs({
      qfafSizingMode: 'dynamic',
      qfafSizingYears: 10,
      strategyId: 'core-130-30',
    });
    const result = calculate(inputs);
    const initialQfaf = result.sizing.qfafValue;

    for (const year of result.years) {
      if (year.stGainsGenerated > 0) {
        const impliedQfaf = year.stGainsGenerated / 1.5;
        expect(impliedQfaf).toBeLessThanOrEqual(initialQfaf + 1);
      }
    }
  });

  it('should record cash returned when QFAF shrinks', () => {
    const inputs = createInputs({
      qfafSizingMode: 'dynamic',
      qfafSizingYears: 1,
      strategyId: 'overlay-45-45',
    });
    const result = calculate(inputs);

    expect(result.years[0].qfafCashReturned).toBeCloseTo(0, -2);
    expect(result.years[1].qfafCashReturned).toBeGreaterThan(0);
  });

  it('should have near-zero ST gain leakage in dynamic mode', () => {
    const inputs = createInputs({
      qfafSizingMode: 'dynamic',
      qfafSizingYears: 1,
      strategyId: 'overlay-45-45',
    });
    const result = calculate(inputs);

    for (const year of result.years) {
      if (year.stGainsGenerated > 0) {
        expect(year.stGainLeakage).toBeLessThan(year.stGainsGenerated * 0.05);
      }
    }
  });

  it('should still respect duration cutoff in dynamic mode', () => {
    const inputs = createInputs({
      qfafSizingMode: 'dynamic',
      qfafDuration: 3,
    });
    const settings = { ...DEFAULT_SETTINGS, projectionYears: 6 };
    const result = calculate(inputs, settings);

    expect(result.years[0].stGainsGenerated).toBeGreaterThan(0);
    expect(result.years[2].stGainsGenerated).toBeGreaterThan(0);
    expect(result.years[3].stGainsGenerated).toBe(0);
    expect(result.years[3].qfafCashReturned).toBe(0);
  });

  it('fixed mode should behave identically to current behavior', () => {
    const inputsFixed = createInputs({ qfafSizingMode: 'fixed' });
    const inputsDefault = createInputs();

    const resultFixed = calculate(inputsFixed);
    const resultDefault = calculate(inputsDefault);

    for (let i = 0; i < resultFixed.years.length; i++) {
      expect(resultFixed.years[i].taxSavings).toBe(resultDefault.years[i].taxSavings);
      expect(resultFixed.years[i].stGainsGenerated).toBe(resultDefault.years[i].stGainsGenerated);
    }
  });
});

describe('Dynamic vs Fixed QFAF Comparison', () => {
  it('dynamic mode should produce less cumulative ST gain leakage than fixed', () => {
    const baseInputs = {
      strategyId: 'overlay-45-45' as const,
      collateralAmount: 1000000,
      qfafSizingYears: 1,
      qfafDuration: 5,
    };

    const dynamicResult = calculate(createInputs({ ...baseInputs, qfafSizingMode: 'dynamic' }));
    const fixedResult = calculate(createInputs({ ...baseInputs, qfafSizingMode: 'fixed' }));

    const dynamicLeakage = dynamicResult.years.reduce((sum, y) => sum + y.stGainLeakage, 0);
    const fixedLeakage = fixedResult.years.reduce((sum, y) => sum + y.stGainLeakage, 0);

    expect(dynamicLeakage).toBeLessThan(fixedLeakage);
  });

  it('dynamic mode should return cash from QFAF over time', () => {
    const inputs = createInputs({
      qfafSizingMode: 'dynamic',
      qfafSizingYears: 1,
      strategyId: 'overlay-45-45',
      qfafDuration: 5,
    });
    const result = calculate(inputs);

    const totalCashReturned = result.years.reduce((sum, y) => sum + y.qfafCashReturned, 0);
    expect(totalCashReturned).toBeGreaterThan(0);
  });

  it('dynamic mode should size QFAF smaller when wash sale rate is non-zero', () => {
    const baseInputs = {
      strategyId: 'overlay-45-45' as const,
      collateralAmount: 1000000,
      qfafSizingYears: 1,
      qfafSizingMode: 'dynamic' as const,
      qfafDuration: 5,
    };

    const noWash = calculate(createInputs(baseInputs));
    const withWash = calculate(createInputs(baseInputs), {
      ...DEFAULT_SETTINGS,
      washSaleDisallowanceRate: 0.10,
    });

    // With 10% wash sale, dynamic sizing should produce smaller QFAF (less ST gains)
    // in Year 2+ when resizing kicks in
    const y3NoWash = noWash.years[2].stGainsGenerated;
    const y3WithWash = withWash.years[2].stGainsGenerated;
    expect(y3WithWash).toBeLessThan(y3NoWash);
    // Specifically, should be ~10% smaller
    expect(y3WithWash).toBeCloseTo(y3NoWash * 0.9, -2);
  });

  it('dynamic mode should cap QFAF at initial value even with growth enabled', () => {
    const inputs = createInputs({
      qfafSizingMode: 'dynamic',
      qfafSizingYears: 1,
      strategyId: 'overlay-45-45',
      qfafDuration: 5,
    });
    const settings: AdvancedSettings = {
      ...DEFAULT_SETTINGS,
      growthEnabled: true,
      defaultAnnualReturn: 0.08,
      qfafGrowthEnabled: true,
    };
    const result = calculate(inputs, settings);
    const initialQfaf = result.sizing.qfafValue;

    // Even with 8% annual growth, QFAF should never exceed initial sizing
    for (const year of result.years) {
      if (year.stGainsGenerated > 0) {
        const impliedQfaf = year.stGainsGenerated / 1.5;
        expect(impliedQfaf).toBeLessThanOrEqual(initialQfaf + 1);
      }
    }
  });

  it('dynamic mode should produce different year-by-year tax profiles than fixed', () => {
    const baseInputs = {
      strategyId: 'overlay-45-45' as const,
      collateralAmount: 1000000,
      qfafSizingYears: 1,
      qfafDuration: 5,
    };

    const dynamicResult = calculate(createInputs({ ...baseInputs, qfafSizingMode: 'dynamic' }));
    const fixedResult = calculate(createInputs({ ...baseInputs, qfafSizingMode: 'fixed' }));

    // Dynamic resizing changes the QFAF ST gains each year, so at least some
    // individual years should have different ST gains than fixed mode
    const yearsDifferent = dynamicResult.years.filter(
      (dy, i) => Math.abs(dy.stGainsGenerated - fixedResult.years[i].stGainsGenerated) > 1
    );
    expect(yearsDifferent.length).toBeGreaterThan(0);
  });
});
