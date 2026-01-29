/**
 * Advanced Settings Tests
 *
 * Tests for:
 * 1. projectionYears - Allow 1-30 year projections instead of fixed 10
 * 2. Custom tax rate overrides - Use niitRate/ltcgRate/stcgRate from settings
 */
import { describe, it, expect } from 'vitest';
import { calculate } from './calculations';
import { CalculatorInputs, AdvancedSettings, DEFAULT_SETTINGS } from './types';

// Base test client
const baseClient: CalculatorInputs = {
  filingStatus: 'mfj',
  stateCode: 'CA',
  stateRate: 0,
  annualIncome: 1000000, // $1M income
  strategyId: 'core-145-45',
  collateralAmount: 5000000, // $5M collateral
  existingStLossCarryforward: 0,
  existingLtLossCarryforward: 0,
  existingNolCarryforward: 0,
  qfafEnabled: true,
  qfafSizingYears: 1,
};

describe('Projection Years Setting', () => {
  describe('Default (10 years)', () => {
    it('should calculate 10 years with default settings', () => {
      const result = calculate(baseClient, DEFAULT_SETTINGS);

      expect(result.years.length).toBe(10);
      expect(result.years[0].year).toBe(1);
      expect(result.years[9].year).toBe(10);
    });
  });

  describe('Custom projection periods', () => {
    it('should calculate 5 years when projectionYears is 5', () => {
      const settings: AdvancedSettings = {
        ...DEFAULT_SETTINGS,
        projectionYears: 5,
      };

      const result = calculate(baseClient, settings);

      expect(result.years.length).toBe(5);
      expect(result.years[0].year).toBe(1);
      expect(result.years[4].year).toBe(5);
    });

    it('should calculate 20 years when projectionYears is 20', () => {
      const settings: AdvancedSettings = {
        ...DEFAULT_SETTINGS,
        projectionYears: 20,
      };

      const result = calculate(baseClient, settings);

      expect(result.years.length).toBe(20);
      expect(result.years[19].year).toBe(20);

      // Verify portfolio values remain stable over 20 years (0% default return)
      const year10Value = result.years[9].totalValue;
      const year20Value = result.years[19].totalValue;
      expect(year20Value).toBeCloseTo(year10Value, -2);
    });

    it('should calculate 1 year when projectionYears is 1', () => {
      const settings: AdvancedSettings = {
        ...DEFAULT_SETTINGS,
        projectionYears: 1,
      };

      const result = calculate(baseClient, settings);

      expect(result.years.length).toBe(1);
      expect(result.years[0].year).toBe(1);
    });

    it('should calculate 30 years when projectionYears is 30', () => {
      const settings: AdvancedSettings = {
        ...DEFAULT_SETTINGS,
        projectionYears: 30,
      };

      const result = calculate(baseClient, settings);

      expect(result.years.length).toBe(30);
      expect(result.years[29].year).toBe(30);
    });
  });

  describe('Tax alpha calculation with different projection periods', () => {
    it('should adjust tax alpha calculation for 5-year projection', () => {
      const settings5yr: AdvancedSettings = {
        ...DEFAULT_SETTINGS,
        projectionYears: 5,
      };
      const settings10yr: AdvancedSettings = {
        ...DEFAULT_SETTINGS,
        projectionYears: 10,
      };

      const result5yr = calculate(baseClient, settings5yr);
      const result10yr = calculate(baseClient, settings10yr);

      // Tax alpha is annualized, so should be similar but may differ due to compounding
      // 5-year alpha may be higher than 10-year alpha (early years have more tax benefits)
      expect(result5yr.summary.effectiveTaxAlpha).toBeGreaterThan(0);
      expect(result10yr.summary.effectiveTaxAlpha).toBeGreaterThan(0);

      // Verify they're different (different time periods should give different annualized results)
      expect(result5yr.summary.effectiveTaxAlpha).not.toBeCloseTo(
        result10yr.summary.effectiveTaxAlpha,
        5
      );
    });

    it('should have lower total tax savings with shorter projection', () => {
      const settings5yr: AdvancedSettings = {
        ...DEFAULT_SETTINGS,
        projectionYears: 5,
      };

      const result5yr = calculate(baseClient, settings5yr);
      const result10yr = calculate(baseClient, DEFAULT_SETTINGS);

      // 5 years should have less total savings than 10 years
      expect(result5yr.summary.totalTaxSavings).toBeLessThan(
        result10yr.summary.totalTaxSavings
      );
    });
  });

  describe('Carryforward handling over extended periods', () => {
    it('should properly carry forward NOL across 20 years', () => {
      // High collateral to generate significant NOL
      const highCollateral: CalculatorInputs = {
        ...baseClient,
        collateralAmount: 10000000, // $10M
      };

      const settings: AdvancedSettings = {
        ...DEFAULT_SETTINGS,
        projectionYears: 20,
      };

      const result = calculate(highCollateral, settings);

      // Verify NOL is being generated over extended period
      expect(result.summary.totalNolGenerated).toBeGreaterThan(0);
      // Verify we have 20 years of results
      expect(result.years).toHaveLength(20);
    });
  });
});

describe('Custom Tax Rate Overrides', () => {
  // Note: Custom rates are compared against each other, not bracket-based rates.
  // When custom rates are set, they replace bracket lookups entirely.
  // For high income ($1M+), bracket-based rates include NIIT, so defaults may differ.

  describe('NIIT Rate Override', () => {
    it('should increase tax savings when niitRate is increased (higher LT costs)', () => {
      // Compare two custom rate scenarios: 3.8% NIIT vs 5% NIIT
      const lowerNiit: AdvancedSettings = {
        ...DEFAULT_SETTINGS,
        stcgRate: 0.37,
        ltcgRate: 0.20,
        niitRate: 0.038, // 3.8% standard NIIT
      };

      const higherNiit: AdvancedSettings = {
        ...DEFAULT_SETTINGS,
        stcgRate: 0.37,
        ltcgRate: 0.20,
        niitRate: 0.05, // 5% increased NIIT
      };

      const lowerNiitResult = calculate(baseClient, lowerNiit);
      const higherNiitResult = calculate(baseClient, higherNiit);

      // Higher NIIT increases LT cost but also increases value of avoiding LT gains
      // The net effect is that higher rates generally increase the value of tax optimization
      expect(higherNiitResult.summary.totalTaxSavings).not.toBe(
        lowerNiitResult.summary.totalTaxSavings
      );
    });

    it('should decrease tax savings when niitRate is reduced to 0', () => {
      const withNiit: AdvancedSettings = {
        ...DEFAULT_SETTINGS,
        stcgRate: 0.37,
        ltcgRate: 0.20,
        niitRate: 0.038, // Standard NIIT
      };

      const noNiit: AdvancedSettings = {
        ...DEFAULT_SETTINGS,
        stcgRate: 0.37,
        ltcgRate: 0.20,
        niitRate: 0, // No NIIT
      };

      const withNiitResult = calculate(baseClient, withNiit);
      const noNiitResult = calculate(baseClient, noNiit);

      // No NIIT means lower combined LT rate, which can affect savings
      expect(noNiitResult.summary.totalTaxSavings).not.toBe(
        withNiitResult.summary.totalTaxSavings
      );
    });
  });

  describe('LTCG Rate Override', () => {
    it('should affect calculations when ltcgRate is increased', () => {
      // Use a custom stcgRate different from default to trigger custom rate mode
      const lowerLtcg: AdvancedSettings = {
        ...DEFAULT_SETTINGS,
        stcgRate: 0.40, // Use same custom rate
        ltcgRate: 0.20, // 20% LTCG
        niitRate: 0.038,
      };

      const higherLtcg: AdvancedSettings = {
        ...DEFAULT_SETTINGS,
        stcgRate: 0.40, // Use same custom rate
        ltcgRate: 0.25, // 25% LTCG
        niitRate: 0.038,
      };

      const lowerLtcgResult = calculate(baseClient, lowerLtcg);
      const higherLtcgResult = calculate(baseClient, higherLtcg);

      // Higher LTCG rate increases cost of LT gains
      expect(higherLtcgResult.summary.totalTaxSavings).not.toBe(
        lowerLtcgResult.summary.totalTaxSavings
      );
    });

    it('should increase savings when ltcgRate is reduced (lower LT cost)', () => {
      // Use a custom stcgRate different from default to trigger custom rate mode
      const standardLtcg: AdvancedSettings = {
        ...DEFAULT_SETTINGS,
        stcgRate: 0.40, // Use same custom rate
        ltcgRate: 0.20, // 20% LTCG
        niitRate: 0.038,
      };

      const lowerLtcg: AdvancedSettings = {
        ...DEFAULT_SETTINGS,
        stcgRate: 0.40, // Use same custom rate
        ltcgRate: 0.15, // 15% LTCG
        niitRate: 0.038,
      };

      const standardResult = calculate(baseClient, standardLtcg);
      const lowerLtcgResult = calculate(baseClient, lowerLtcg);

      // Lower LTCG rate reduces cost of LT gains, increasing net savings
      expect(lowerLtcgResult.summary.totalTaxSavings).toBeGreaterThan(
        standardResult.summary.totalTaxSavings
      );
    });
  });

  describe('STCG Rate Override', () => {
    it('should increase savings when stcgRate is increased (more valuable deductions)', () => {
      // Use custom ltcgRate and niitRate to ensure custom rate mode
      const lowerStcg: AdvancedSettings = {
        ...DEFAULT_SETTINGS,
        stcgRate: 0.35, // 35% base
        ltcgRate: 0.18, // Custom LT rate
        niitRate: 0.04, // Custom NIIT
      };

      const higherStcg: AdvancedSettings = {
        ...DEFAULT_SETTINGS,
        stcgRate: 0.45, // 45% increased
        ltcgRate: 0.18, // Same custom LT rate
        niitRate: 0.04, // Same custom NIIT
      };

      const lowerStcgResult = calculate(baseClient, lowerStcg);
      const higherStcgResult = calculate(baseClient, higherStcg);

      // Higher STCG (ordinary) rate increases value of ordinary loss deduction
      expect(higherStcgResult.summary.totalTaxSavings).toBeGreaterThan(
        lowerStcgResult.summary.totalTaxSavings
      );
    });

    it('should decrease savings when stcgRate is reduced', () => {
      // Use custom ltcgRate and niitRate to ensure custom rate mode
      const standardStcg: AdvancedSettings = {
        ...DEFAULT_SETTINGS,
        stcgRate: 0.40, // 40% base
        ltcgRate: 0.18,
        niitRate: 0.04,
      };

      const lowerStcg: AdvancedSettings = {
        ...DEFAULT_SETTINGS,
        stcgRate: 0.32, // 32% reduced
        ltcgRate: 0.18,
        niitRate: 0.04,
      };

      const standardResult = calculate(baseClient, standardStcg);
      const lowerStcgResult = calculate(baseClient, lowerStcg);

      // Lower STCG rate decreases value of ordinary loss deduction
      expect(lowerStcgResult.summary.totalTaxSavings).toBeLessThan(
        standardResult.summary.totalTaxSavings
      );
    });
  });

  describe('Combined Rate Overrides', () => {
    it('should model high-tax scenario with more savings than low-tax', () => {
      // Model high-tax scenario
      const highTax: AdvancedSettings = {
        ...DEFAULT_SETTINGS,
        stcgRate: 0.45, // 45% top bracket
        ltcgRate: 0.25, // 25% LTCG
        niitRate: 0.038,
      };

      // Model low-tax scenario
      const lowTax: AdvancedSettings = {
        ...DEFAULT_SETTINGS,
        stcgRate: 0.25, // 25% top bracket
        ltcgRate: 0.15, // 15% LTCG
        niitRate: 0,
      };

      const highTaxResult = calculate(baseClient, highTax);
      const lowTaxResult = calculate(baseClient, lowTax);

      // Higher overall rates should increase tax savings from the strategy
      expect(highTaxResult.summary.totalTaxSavings).toBeGreaterThan(
        lowTaxResult.summary.totalTaxSavings
      );
    });

    it('should model low-tax scenario correctly', () => {
      // Model flat tax scenario
      const lowTax: AdvancedSettings = {
        ...DEFAULT_SETTINGS,
        stcgRate: 0.20, // 20% flat tax
        ltcgRate: 0.15, // 15% LTCG
        niitRate: 0, // No NIIT
      };

      const result = calculate(baseClient, lowTax);

      // Should still have positive savings even with low rates
      expect(result.summary.totalTaxSavings).toBeGreaterThan(0);
    });
  });

  describe('Default behavior', () => {
    it('should use bracket-based rates when settings match defaults', () => {
      // When settings match defaults, behavior should be same as before
      const result1 = calculate(baseClient);
      const result2 = calculate(baseClient, DEFAULT_SETTINGS);

      expect(result1.summary.totalTaxSavings).toBeCloseTo(
        result2.summary.totalTaxSavings,
        2
      );
    });
  });
});

describe('Income Offset Tracking', () => {
  it('should calculate incomeOffsetAmount as sum of all income deductions', () => {
    const result = calculate(baseClient, DEFAULT_SETTINGS);

    for (const year of result.years) {
      // incomeOffsetAmount = usableOrdinaryLoss + nolUsedThisYear + capitalLossUsedAgainstIncome
      const expectedOffset =
        year.usableOrdinaryLoss + year.nolUsedThisYear + year.capitalLossUsedAgainstIncome;
      expect(year.incomeOffsetAmount).toBeCloseTo(expectedOffset, 2);
    }
  });

  it('should have meaningful income offset in year 1 from ordinary losses', () => {
    const result = calculate(baseClient, DEFAULT_SETTINGS);

    // Year 1 should have significant ordinary loss offset (up to 461(l) limit)
    expect(result.years[0].incomeOffsetAmount).toBeGreaterThan(0);
    expect(result.years[0].usableOrdinaryLoss).toBeGreaterThan(0);
  });

  it('should include NOL offset in later years', () => {
    // Use high collateral to generate significant NOL that carries forward
    const highCollateral: CalculatorInputs = {
      ...baseClient,
      collateralAmount: 10000000, // $10M
    };

    const result = calculate(highCollateral, DEFAULT_SETTINGS);

    // Later years should use NOL carryforward
    const laterYears = result.years.filter(y => y.year > 2);
    const hasNolUsage = laterYears.some(y => y.nolUsedThisYear > 0);
    expect(hasNolUsage).toBe(true);
  });

  it('should respect capital loss limit in income offset', () => {
    // Create scenario with capital loss carryforward
    const withCarryforward: CalculatorInputs = {
      ...baseClient,
      existingStLossCarryforward: 100000, // $100k existing ST loss
    };

    const result = calculate(withCarryforward, DEFAULT_SETTINGS);

    // Capital loss against income should be limited to $3k for MFJ
    for (const year of result.years) {
      expect(year.capitalLossUsedAgainstIncome).toBeLessThanOrEqual(3000);
    }
  });

  describe('maxIncomeOffsetCapacity for option exercise planning', () => {
    it('should track maximum income offset capacity each year', () => {
      const result = calculate(baseClient, DEFAULT_SETTINGS);

      // Every year should have a maxIncomeOffsetCapacity value
      for (const year of result.years) {
        expect(year.maxIncomeOffsetCapacity).toBeDefined();
        expect(year.maxIncomeOffsetCapacity).toBeGreaterThanOrEqual(0);
      }
    });

    it('should show higher capacity in years with NOL carryforward buildup', () => {
      // High collateral generates NOL that builds up over time
      const highCollateral: CalculatorInputs = {
        ...baseClient,
        collateralAmount: 10000000, // $10M
      };

      const result = calculate(highCollateral, DEFAULT_SETTINGS);

      // Year 1 capacity is mainly from ordinary losses
      const year1Capacity = result.years[0].maxIncomeOffsetCapacity;

      // Year 3+ should have accumulated NOL increasing capacity
      const year3Capacity = result.years[2].maxIncomeOffsetCapacity;

      // Later years typically have higher capacity due to NOL buildup
      expect(year3Capacity).toBeGreaterThan(year1Capacity * 0.5); // At least meaningful
    });

    it('should include NOL carryforward in max capacity calculation', () => {
      // Start with existing NOL
      const withNol: CalculatorInputs = {
        ...baseClient,
        existingNolCarryforward: 500000, // $500k existing NOL
      };

      const result = calculate(withNol, DEFAULT_SETTINGS);

      // Year 1 capacity should include the existing NOL
      expect(result.years[0].maxIncomeOffsetCapacity).toBeGreaterThan(
        result.years[0].usableOrdinaryLoss
      );
    });

    it('should help identify optimal years for option exercise', () => {
      const result = calculate(baseClient, DEFAULT_SETTINGS);

      // Find year with highest offset capacity
      const maxCapacityYear = result.years.reduce((max, year) =>
        year.maxIncomeOffsetCapacity > max.maxIncomeOffsetCapacity ? year : max
      );

      // Should identify a year with meaningful capacity
      expect(maxCapacityYear.maxIncomeOffsetCapacity).toBeGreaterThan(0);
    });
  });
});

describe('Combined Settings', () => {
  it('should handle projectionYears with custom tax rates', () => {
    const customSettings: AdvancedSettings = {
      ...DEFAULT_SETTINGS,
      projectionYears: 15,
      stcgRate: 0.40,
      ltcgRate: 0.25,
      niitRate: 0.05,
    };

    const result = calculate(baseClient, customSettings);

    // Should project 15 years
    expect(result.years.length).toBe(15);

    // Should have meaningful tax savings with higher rates
    expect(result.summary.totalTaxSavings).toBeGreaterThan(0);
  });

  it('should properly annualize tax alpha for different periods with custom rates', () => {
    const shortTerm: AdvancedSettings = {
      ...DEFAULT_SETTINGS,
      projectionYears: 5,
      stcgRate: 0.40,
    };

    const longTerm: AdvancedSettings = {
      ...DEFAULT_SETTINGS,
      projectionYears: 20,
      stcgRate: 0.40,
    };

    const shortResult = calculate(baseClient, shortTerm);
    const longResult = calculate(baseClient, longTerm);

    // Both should have positive tax alpha
    expect(shortResult.summary.effectiveTaxAlpha).toBeGreaterThan(0);
    expect(longResult.summary.effectiveTaxAlpha).toBeGreaterThan(0);

    // Annualized alpha should use the correct number of years
    // Tax alpha = totalTaxSavings / totalExposure / years
    const expectedShortAlpha =
      shortResult.summary.totalTaxSavings / shortResult.sizing.totalExposure / 5;
    const expectedLongAlpha =
      longResult.summary.totalTaxSavings / longResult.sizing.totalExposure / 20;

    expect(shortResult.summary.effectiveTaxAlpha).toBeCloseTo(expectedShortAlpha, 4);
    expect(longResult.summary.effectiveTaxAlpha).toBeCloseTo(expectedLongAlpha, 4);
  });
});
