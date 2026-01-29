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
import { calculate, calculateSizing } from './calculations';
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
  it('returns 10 years of results', () => {
    const result = calculate(createInputs());
    expect(result.years).toHaveLength(10);
    expect(result.years[0].year).toBe(1);
    expect(result.years[9].year).toBe(10);
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

  it('limits 461(l) by taxable income when income is lower than cap', () => {
    // Low income person cannot use full 461(l) limit
    const inputs = createInputs({
      annualIncome: 100000,
      collateralAmount: 10000000,
    });
    const result = calculate(inputs);

    // Usable = min(losses, cap, income) = min(1M, 626K, 100K) = 100K
    expect(result.years[0].usableOrdinaryLoss).toBe(100000);

    // Excess goes to NOL
    expect(result.years[0].excessToNol).toBeGreaterThan(0);
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

      expect(result.years).toHaveLength(10);
      expect(Number.isFinite(result.summary.totalTaxSavings)).toBe(true);
    }
  });
});

describe('fixed issues', () => {
  /**
   * FIXED: 461(l) now limits based on taxable income
   * Was: min(losses, limit)
   * Now: min(losses, limit, taxableIncome)
   */
  it('461(l) should be limited by taxable income', () => {
    const inputs = createInputs({
      annualIncome: 50000,
      collateralAmount: 10000000,
    });
    const result = calculate(inputs);

    // Cannot deduct more losses than you have income
    expect(result.years[0].usableOrdinaryLoss).toBeLessThanOrEqual(50000);
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
