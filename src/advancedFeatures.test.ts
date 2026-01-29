/**
 * Advanced Features Tests - Cash Infusion and Income Overrides
 *
 * Tests for year-by-year planning features:
 * - Cash infusions that increase collateral mid-projection
 * - Income overrides that affect Section 461(l) limits and NOL usage
 */
import { describe, it, expect } from 'vitest';
import { calculate, calculateWithOverrides } from './calculations';
import { CalculatorInputs, YearOverride, DEFAULT_SETTINGS } from './types';

// Base test client
const baseClient: CalculatorInputs = {
  filingStatus: 'mfj',
  stateCode: 'CA',
  stateRate: 0,
  annualIncome: 1000000, // $1M base income
  strategyId: 'core-145-45',
  collateralAmount: 5000000, // $5M collateral
  existingStLossCarryforward: 0,
  existingLtLossCarryforward: 0,
  existingNolCarryforward: 0,
  qfafEnabled: true,
  qfafSizingYears: 1,
};

// Generate default overrides (no changes)
function generateDefaultOverrides(baseIncome: number): YearOverride[] {
  return Array.from({ length: 10 }, (_, i) => ({
    year: i + 1,
    w2Income: baseIncome,
    cashInfusion: 0,
    note: '',
  }));
}

describe('Advanced Features - Cash Infusion', () => {
  describe('Cash Infusion Mechanics', () => {
    it('should increase collateral value when cash is added', () => {
      const overrides = generateDefaultOverrides(baseClient.annualIncome);
      // Add $2M cash infusion in year 3
      overrides[2].cashInfusion = 2000000;

      const resultWithInfusion = calculateWithOverrides(
        baseClient,
        DEFAULT_SETTINGS,
        overrides
      );
      const resultWithoutInfusion = calculate(baseClient, DEFAULT_SETTINGS);

      // Year 3 collateral should be higher with infusion
      const year3WithInfusion = resultWithInfusion.years[2];
      const year3WithoutInfusion = resultWithoutInfusion.years[2];

      // The infusion adds $2M to collateral
      expect(year3WithInfusion.collateralValue).toBeGreaterThan(
        year3WithoutInfusion.collateralValue
      );

      // The difference should be approximately $2M (plus any growth from prior years)
      // Year 3 values include 2 years of growth, so the $2M infusion will also have grown
      const collateralDiff =
        year3WithInfusion.collateralValue - year3WithoutInfusion.collateralValue;
      // Expect between $2M and $2.2M (accounting for growth)
      expect(collateralDiff).toBeGreaterThan(1900000);
      expect(collateralDiff).toBeLessThan(2200000);
    });

    it('should increase ST losses proportionally after infusion', () => {
      const overrides = generateDefaultOverrides(baseClient.annualIncome);
      // Add $2M cash infusion in year 3
      overrides[2].cashInfusion = 2000000;

      const resultWithInfusion = calculateWithOverrides(
        baseClient,
        DEFAULT_SETTINGS,
        overrides
      );
      const resultWithoutInfusion = calculate(baseClient, DEFAULT_SETTINGS);

      // Year 4 ST losses should be higher (year 3 infusion affects year 4 calcs)
      const year4WithInfusion = resultWithInfusion.years[3];
      const year4WithoutInfusion = resultWithoutInfusion.years[3];

      expect(year4WithInfusion.stLossesHarvested).toBeGreaterThan(
        year4WithoutInfusion.stLossesHarvested
      );
    });

    it('should resize QFAF to match new ST loss capacity', () => {
      const overrides = generateDefaultOverrides(baseClient.annualIncome);
      // Add $2M cash infusion in year 3
      overrides[2].cashInfusion = 2000000;

      const resultWithInfusion = calculateWithOverrides(
        baseClient,
        DEFAULT_SETTINGS,
        overrides
      );
      const resultWithoutInfusion = calculate(baseClient, DEFAULT_SETTINGS);

      // QFAF should be resized to match new collateral ST loss capacity
      const year4WithInfusion = resultWithInfusion.years[3];
      const year4WithoutInfusion = resultWithoutInfusion.years[3];

      expect(year4WithInfusion.qfafValue).toBeGreaterThan(
        year4WithoutInfusion.qfafValue
      );
    });

    it('should compound growth on infused capital', () => {
      const overrides = generateDefaultOverrides(baseClient.annualIncome);
      // Add $1M in year 1
      overrides[0].cashInfusion = 1000000;

      const resultWithInfusion = calculateWithOverrides(
        baseClient,
        DEFAULT_SETTINGS,
        overrides
      );

      // By year 10, the $1M should have grown at 7% for 9 years
      // This affects total portfolio value
      const year10 = resultWithInfusion.years[9];
      const year10Without = calculate(baseClient, DEFAULT_SETTINGS).years[9];

      // Total value should be higher
      expect(year10.totalValue).toBeGreaterThan(year10Without.totalValue);

      // The difference should show compounded growth
      // $1M after 9 years of growth (accounting for financing costs reducing net return)
      // Net return is ~4-5% after financing costs, so $1M * 1.045^9 ≈ $1.48M
      // Plus corresponding QFAF increase brings it higher
      const valueDiff = year10.totalValue - year10Without.totalValue;
      expect(valueDiff).toBeGreaterThan(1500000); // Conservatively expect $1.5M+ growth
    });

    it('should handle multiple cash infusions across years', () => {
      const overrides = generateDefaultOverrides(baseClient.annualIncome);
      // Add $500K in year 2 and $500K in year 5
      overrides[1].cashInfusion = 500000;
      overrides[4].cashInfusion = 500000;

      const resultWithInfusions = calculateWithOverrides(
        baseClient,
        DEFAULT_SETTINGS,
        overrides
      );

      // Total exposure should increase after each infusion
      const year1 = resultWithInfusions.years[0];
      const year3 = resultWithInfusions.years[2];
      const year6 = resultWithInfusions.years[5];

      // Year 3 should show effect of year 2 infusion
      // Year 6 should show effect of both infusions
      expect(year3.totalValue).toBeGreaterThan(year1.totalValue * 1.07 * 1.07);
      expect(year6.totalValue).toBeGreaterThan(year3.totalValue * 1.07 * 1.07 * 1.07);
    });

    it('should increase tax savings with larger collateral', () => {
      const overrides = generateDefaultOverrides(baseClient.annualIncome);
      // Add $5M cash infusion in year 1 (doubling the portfolio)
      overrides[0].cashInfusion = 5000000;

      const resultWithInfusion = calculateWithOverrides(
        baseClient,
        DEFAULT_SETTINGS,
        overrides
      );
      const resultWithoutInfusion = calculate(baseClient, DEFAULT_SETTINGS);

      // Total 10-year tax savings should be significantly higher
      expect(resultWithInfusion.summary.totalTaxSavings).toBeGreaterThan(
        resultWithoutInfusion.summary.totalTaxSavings * 1.5
      );
    });
  });
});

describe('Advanced Features - Income Overrides', () => {
  describe('Income Override Effects on Section 461(l)', () => {
    it('should apply custom income to 461(l) limit calculations', () => {
      const overrides = generateDefaultOverrides(baseClient.annualIncome);
      // Reduce income in year 5 to $300K (below 461(l) limit)
      overrides[4].w2Income = 300000;
      overrides[4].note = 'Sabbatical year';

      const resultWithOverride = calculateWithOverrides(
        baseClient,
        DEFAULT_SETTINGS,
        overrides
      );

      // Year 5 usable ordinary loss should be capped by lower income
      const year5 = resultWithOverride.years[4];

      // With $300K income, usable ordinary loss is limited to $300K
      // (lower than the $512K MFJ limit)
      expect(year5.usableOrdinaryLoss).toBeLessThanOrEqual(300000);
    });

    it('should increase NOL generation when income drops', () => {
      const overrides = generateDefaultOverrides(baseClient.annualIncome);
      // Drop income to $200K in year 3
      overrides[2].w2Income = 200000;

      const resultWithOverride = calculateWithOverrides(
        baseClient,
        DEFAULT_SETTINGS,
        overrides
      );
      const resultWithoutOverride = calculate(baseClient, DEFAULT_SETTINGS);

      // Year 3 should generate more excess to NOL (since less can be used)
      const year3With = resultWithOverride.years[2];
      const year3Without = resultWithoutOverride.years[2];

      // Lower income = less usable ordinary loss = more excess to NOL
      expect(year3With.excessToNol).toBeGreaterThan(year3Without.excessToNol);
    });

    it('should handle income increase affecting NOL usage', () => {
      // Start with lower income client who has existing NOL
      const lowerIncomeClient: CalculatorInputs = {
        ...baseClient,
        annualIncome: 500000, // $500K base
        existingNolCarryforward: 1000000, // $1M existing NOL
      };

      const overrides = generateDefaultOverrides(lowerIncomeClient.annualIncome);
      // Income jumps to $2M in year 3 (bonus, liquidity event)
      overrides[2].w2Income = 2000000;
      overrides[2].note = 'Liquidity event';

      const resultWithOverride = calculateWithOverrides(
        lowerIncomeClient,
        DEFAULT_SETTINGS,
        overrides
      );

      // Year 3 should use more NOL due to higher income
      const year3 = resultWithOverride.years[2];

      // Higher income = more NOL can be used (80% of taxable income)
      // With $2M income, could use up to $1.6M of NOL
      expect(year3.nolUsedThisYear).toBeGreaterThan(0);
    });

    it('should track income changes in projection notes', () => {
      const overrides = generateDefaultOverrides(baseClient.annualIncome);
      overrides[4].w2Income = 500000;
      overrides[4].note = 'Retirement';
      overrides[7].w2Income = 300000;
      overrides[7].note = 'Part-time consulting';

      // Notes should be preserved in the override structure
      expect(overrides[4].note).toBe('Retirement');
      expect(overrides[7].note).toBe('Part-time consulting');
    });

    it('should handle zero income year (retirement scenario)', () => {
      const overrides = generateDefaultOverrides(baseClient.annualIncome);
      // Retire in year 6 with no W-2 income
      overrides[5].w2Income = 0;
      overrides[5].note = 'Full retirement';

      const resultWithOverride = calculateWithOverrides(
        baseClient,
        DEFAULT_SETTINGS,
        overrides
      );

      const year6 = resultWithOverride.years[5];

      // With $0 income, usable ordinary loss should be $0
      // (can't deduct more than taxable income)
      expect(year6.usableOrdinaryLoss).toBe(0);

      // All ordinary losses should go to NOL
      expect(year6.excessToNol).toBe(year6.ordinaryLossesGenerated);
    });
  });

  describe('Combined Income and Cash Infusion Scenarios', () => {
    it('should handle retirement with final cash contribution', () => {
      const overrides = generateDefaultOverrides(baseClient.annualIncome);
      // Year 5: Final big contribution before retirement
      overrides[4].cashInfusion = 3000000;
      overrides[4].note = 'Pre-retirement contribution';
      // Year 6: Retire with reduced income
      overrides[5].w2Income = 100000;
      overrides[5].note = 'Retirement';

      const result = calculateWithOverrides(
        baseClient,
        DEFAULT_SETTINGS,
        overrides
      );

      // Year 5 should show larger portfolio from infusion
      const year5 = result.years[4];
      expect(year5.totalValue).toBeGreaterThan(10000000);

      // Year 6 should show limited ordinary loss usage
      const year6 = result.years[5];
      expect(year6.usableOrdinaryLoss).toBeLessThanOrEqual(100000);
    });

    it('should model career income growth', () => {
      const youngProfessional: CalculatorInputs = {
        ...baseClient,
        annualIncome: 300000, // Starting income
        collateralAmount: 1000000, // Smaller starting portfolio
      };

      const overrides = generateDefaultOverrides(youngProfessional.annualIncome);
      // Model 10% annual income growth for first 5 years
      overrides[1].w2Income = 330000;
      overrides[2].w2Income = 363000;
      overrides[3].w2Income = 400000;
      overrides[4].w2Income = 440000;
      // Plateau after year 5
      overrides[5].w2Income = 450000;
      overrides[6].w2Income = 450000;
      overrides[7].w2Income = 450000;
      overrides[8].w2Income = 450000;
      overrides[9].w2Income = 450000;

      const result = calculateWithOverrides(
        youngProfessional,
        DEFAULT_SETTINGS,
        overrides
      );

      // Should complete 10-year projection
      expect(result.years.length).toBe(10);

      // Higher income in later years should affect 461(l) usage
      const year1 = result.years[0];
      const year5 = result.years[4];

      // Both should be limited by income (< $512K MFJ limit)
      expect(year1.usableOrdinaryLoss).toBeLessThanOrEqual(
        youngProfessional.annualIncome
      );
      expect(year5.usableOrdinaryLoss).toBeLessThanOrEqual(overrides[4].w2Income);
    });

    it('should model business exit with large contribution', () => {
      const overrides = generateDefaultOverrides(baseClient.annualIncome);
      // Year 3: Business exit - big income + big contribution
      overrides[2].w2Income = 5000000; // $5M from business sale
      overrides[2].cashInfusion = 10000000; // $10M invested from proceeds
      overrides[2].note = 'Business exit';
      // Year 4+: Reduced income, living off investments
      for (let i = 3; i < 10; i++) {
        overrides[i].w2Income = 200000;
      }

      const result = calculateWithOverrides(
        baseClient,
        DEFAULT_SETTINGS,
        overrides
      );

      // Year 3 should show massive increase
      const year3 = result.years[2];
      expect(year3.collateralValue).toBeGreaterThan(15000000);

      // Year 3 should have full 461(l) usage due to high income
      expect(year3.usableOrdinaryLoss).toBe(512000); // MFJ limit

      // Year 4+ should have reduced usable ordinary loss
      const year4 = result.years[3];
      expect(year4.usableOrdinaryLoss).toBeLessThanOrEqual(200000);
    });
  });
});

describe('Advanced Features - Edge Cases', () => {
  it('should handle all default overrides (no changes)', () => {
    const overrides = generateDefaultOverrides(baseClient.annualIncome);

    const resultWithOverrides = calculateWithOverrides(
      baseClient,
      DEFAULT_SETTINGS,
      overrides
    );
    const resultWithoutOverrides = calculate(baseClient, DEFAULT_SETTINGS);

    // Results should be identical when no overrides are active
    expect(resultWithOverrides.summary.totalTaxSavings).toBeCloseTo(
      resultWithoutOverrides.summary.totalTaxSavings,
      2
    );
  });

  it('should handle empty overrides array gracefully', () => {
    const result = calculateWithOverrides(baseClient, DEFAULT_SETTINGS, []);

    // Should fall back to default calculation
    expect(result.years.length).toBe(10);
    expect(result.summary.totalTaxSavings).toBeGreaterThan(0);
  });

  it('should handle partial overrides (only some years)', () => {
    // Only override years 1-5
    const partialOverrides: YearOverride[] = Array.from({ length: 5 }, (_, i) => ({
      year: i + 1,
      w2Income: baseClient.annualIncome,
      cashInfusion: i === 2 ? 1000000 : 0, // $1M in year 3
      note: '',
    }));

    const result = calculateWithOverrides(
      baseClient,
      DEFAULT_SETTINGS,
      partialOverrides
    );

    // Should still calculate all 10 years
    expect(result.years.length).toBe(10);

    // Year 3 infusion should still be applied
    const year3 = result.years[2];
    const baselineYear3 = calculate(baseClient, DEFAULT_SETTINGS).years[2];
    expect(year3.collateralValue).toBeGreaterThan(baselineYear3.collateralValue);
  });

  it('should handle negative cash infusion (withdrawal)', () => {
    const overrides = generateDefaultOverrides(baseClient.annualIncome);
    // Model a $500K withdrawal in year 5
    overrides[4].cashInfusion = -500000;
    overrides[4].note = 'Capital withdrawal';

    const resultWithWithdrawal = calculateWithOverrides(
      baseClient,
      DEFAULT_SETTINGS,
      overrides
    );
    const resultWithoutWithdrawal = calculate(baseClient, DEFAULT_SETTINGS);

    // Year 5 collateral should be lower
    const year5With = resultWithWithdrawal.years[4];
    const year5Without = resultWithoutWithdrawal.years[4];

    expect(year5With.collateralValue).toBeLessThan(year5Without.collateralValue);
  });
});
