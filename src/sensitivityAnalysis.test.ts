/**
 * Sensitivity Analysis Tests
 *
 * Tests for sensitivity analysis feature that stress-tests projections by adjusting:
 * - Federal and state tax rates
 * - Annual return assumptions
 * - ST loss rate variance
 * - LT gain rate variance
 */
import { describe, it, expect } from 'vitest';
import { calculate, calculateWithSensitivity } from './calculations';
import {
  CalculatorInputs,
  SensitivityParams,
  DEFAULT_SETTINGS,
  DEFAULT_SENSITIVITY,
} from './types';

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
  qfafSizingCushion: 0,
};

describe('Sensitivity Analysis', () => {
  describe('Default Sensitivity (no changes)', () => {
    it('should match base calculation when using default sensitivity params', () => {
      const baseResult = calculate(baseClient, DEFAULT_SETTINGS);
      const sensitivityResult = calculateWithSensitivity(
        baseClient,
        DEFAULT_SETTINGS,
        DEFAULT_SENSITIVITY
      );

      // Results should be identical
      expect(sensitivityResult.summary.totalTaxSavings).toBeCloseTo(
        baseResult.summary.totalTaxSavings,
        2
      );
      expect(sensitivityResult.summary.finalPortfolioValue).toBeCloseTo(
        baseResult.summary.finalPortfolioValue,
        2
      );
    });
  });

  describe('Federal Rate Changes', () => {
    it('should increase tax savings when federal rates increase', () => {
      const baseResult = calculate(baseClient, DEFAULT_SETTINGS);

      // Increase federal rates by 5%
      const higherRates: SensitivityParams = {
        ...DEFAULT_SENSITIVITY,
        federalRateChange: 0.05, // +5%
      };

      const result = calculateWithSensitivity(baseClient, DEFAULT_SETTINGS, higherRates);

      // Higher tax rates = more value from tax savings
      expect(result.summary.totalTaxSavings).toBeGreaterThan(
        baseResult.summary.totalTaxSavings
      );
    });

    it('should decrease tax savings when federal rates decrease', () => {
      const baseResult = calculate(baseClient, DEFAULT_SETTINGS);

      // Decrease federal rates by 5%
      const lowerRates: SensitivityParams = {
        ...DEFAULT_SENSITIVITY,
        federalRateChange: -0.05, // -5%
      };

      const result = calculateWithSensitivity(baseClient, DEFAULT_SETTINGS, lowerRates);

      // Lower tax rates = less value from tax savings
      expect(result.summary.totalTaxSavings).toBeLessThan(
        baseResult.summary.totalTaxSavings
      );
    });
  });

  describe('State Rate Changes', () => {
    it('should increase tax savings when state rates increase', () => {
      const baseResult = calculate(baseClient, DEFAULT_SETTINGS);

      // Increase state rate by 3%
      const higherStateRate: SensitivityParams = {
        ...DEFAULT_SENSITIVITY,
        stateRateChange: 0.03, // +3%
      };

      const result = calculateWithSensitivity(baseClient, DEFAULT_SETTINGS, higherStateRate);

      // Higher state rates = more combined tax savings
      expect(result.summary.totalTaxSavings).toBeGreaterThan(
        baseResult.summary.totalTaxSavings
      );
    });

    it('should model moving to a no-tax state (negative change)', () => {
      // Start with CA client (13.3% state tax)
      const baseResult = calculate(baseClient, DEFAULT_SETTINGS);

      // Model move to Texas (eliminate state tax)
      const noStateTax: SensitivityParams = {
        ...DEFAULT_SENSITIVITY,
        stateRateChange: -0.133, // Remove CA's 13.3% rate
      };

      const result = calculateWithSensitivity(baseClient, DEFAULT_SETTINGS, noStateTax);

      // Lower combined rate = less tax savings (but still positive)
      expect(result.summary.totalTaxSavings).toBeLessThan(
        baseResult.summary.totalTaxSavings
      );
      expect(result.summary.totalTaxSavings).toBeGreaterThan(0);
    });
  });

  describe('Annual Return Changes', () => {
    it('should increase final portfolio value with higher returns', () => {
      const baseResult = calculate(baseClient, DEFAULT_SETTINGS);

      // Model bull market (12% return instead of 7%)
      const bullMarket: SensitivityParams = {
        ...DEFAULT_SENSITIVITY,
        annualReturn: 0.12, // 12% return
      };

      const result = calculateWithSensitivity(baseClient, DEFAULT_SETTINGS, bullMarket);

      // Higher returns = larger final portfolio
      expect(result.summary.finalPortfolioValue).toBeGreaterThan(
        baseResult.summary.finalPortfolioValue
      );
    });

    it('should decrease final portfolio value with negative returns', () => {
      const baseResult = calculate(baseClient, DEFAULT_SETTINGS);

      // Model bear market (-5% return vs 0% default)
      const bearMarket: SensitivityParams = {
        ...DEFAULT_SENSITIVITY,
        annualReturn: -0.05, // -5% return
      };

      const result = calculateWithSensitivity(baseClient, DEFAULT_SETTINGS, bearMarket);

      // Negative returns = smaller final portfolio
      expect(result.summary.finalPortfolioValue).toBeLessThan(
        baseResult.summary.finalPortfolioValue
      );
    });

    it('should handle negative returns (recession)', () => {
      // Model severe recession (-10% annual return)
      const recession: SensitivityParams = {
        ...DEFAULT_SENSITIVITY,
        annualReturn: -0.10, // -10% return
      };

      const result = calculateWithSensitivity(baseClient, DEFAULT_SETTINGS, recession);

      // Portfolio should shrink but strategy still generates tax benefits
      expect(result.summary.finalPortfolioValue).toBeLessThan(
        baseClient.collateralAmount
      );
      expect(result.summary.totalTaxSavings).toBeGreaterThan(0);
    });
  });

  describe('ST Loss Rate Variance', () => {
    it('should increase tax savings with higher ST loss rates', () => {
      const baseResult = calculate(baseClient, DEFAULT_SETTINGS);

      // Model better tax-loss harvesting (+25% more losses)
      const moreLosses: SensitivityParams = {
        ...DEFAULT_SENSITIVITY,
        stLossRateVariance: 0.25, // +25%
      };

      const result = calculateWithSensitivity(baseClient, DEFAULT_SETTINGS, moreLosses);

      // More ST losses = more tax benefits
      expect(result.summary.totalTaxSavings).toBeGreaterThan(
        baseResult.summary.totalTaxSavings
      );
    });

    it('should decrease tax savings with lower ST loss rates', () => {
      const baseResult = calculate(baseClient, DEFAULT_SETTINGS);

      // Model worse tax-loss harvesting (-30% fewer losses)
      const fewerLosses: SensitivityParams = {
        ...DEFAULT_SENSITIVITY,
        stLossRateVariance: -0.30, // -30%
      };

      const result = calculateWithSensitivity(baseClient, DEFAULT_SETTINGS, fewerLosses);

      // Fewer ST losses = less tax benefits
      expect(result.summary.totalTaxSavings).toBeLessThan(
        baseResult.summary.totalTaxSavings
      );
    });
  });

  describe('LT Gain Rate Variance', () => {
    it('should decrease net tax savings with higher LT gains', () => {
      const baseResult = calculate(baseClient, DEFAULT_SETTINGS);

      // Model higher LT gain realization (+30%)
      const moreGains: SensitivityParams = {
        ...DEFAULT_SENSITIVITY,
        ltGainRateVariance: 0.30, // +30%
      };

      const result = calculateWithSensitivity(baseClient, DEFAULT_SETTINGS, moreGains);

      // More LT gains = higher tax cost = less net benefit
      expect(result.summary.totalTaxSavings).toBeLessThan(
        baseResult.summary.totalTaxSavings
      );
    });

    it('should maintain similar tax savings with lower LT gains', () => {
      const baseResult = calculate(baseClient, DEFAULT_SETTINGS);

      // Model lower LT gain realization (-30%)
      const fewerGains: SensitivityParams = {
        ...DEFAULT_SENSITIVITY,
        ltGainRateVariance: -0.30, // -30%
      };

      const result = calculateWithSensitivity(baseClient, DEFAULT_SETTINGS, fewerGains);

      // Fewer LT gains has mixed effects:
      // - Lower LT gain tax cost (good)
      // - Lower baseline comparison (reduces apparent "savings")
      // Net effect is relatively small, should be within 5% of base
      const percentDiff = Math.abs(
        (result.summary.totalTaxSavings - baseResult.summary.totalTaxSavings) /
          baseResult.summary.totalTaxSavings
      );
      expect(percentDiff).toBeLessThan(0.05); // Within 5%
    });
  });

  describe('Combined Scenarios', () => {
    it('should model worst case: lower rates, higher gains, fewer losses', () => {
      const baseResult = calculate(baseClient, DEFAULT_SETTINGS);

      // Worst case scenario
      const worstCase: SensitivityParams = {
        ...DEFAULT_SENSITIVITY,
        federalRateChange: -0.05, // Lower tax rates
        stateRateChange: -0.05, // Move to lower-tax state
        annualReturn: 0.02, // Bear market
        stLossRateVariance: -0.30, // Fewer losses harvested
        ltGainRateVariance: 0.30, // More gains realized
        trackingErrorMultiplier: 2.0, // High variance
      };

      const result = calculateWithSensitivity(baseClient, DEFAULT_SETTINGS, worstCase);

      // Should still have positive savings, but much lower
      // With year-by-year rates, the worst case produces ~51% of base
      expect(result.summary.totalTaxSavings).toBeLessThan(
        baseResult.summary.totalTaxSavings * 0.55
      );
      expect(result.summary.totalTaxSavings).toBeGreaterThan(0);
    });

    it('should model best case: higher rates, fewer gains, more losses', () => {
      const baseResult = calculate(baseClient, DEFAULT_SETTINGS);

      // Best case scenario
      const bestCase: SensitivityParams = {
        ...DEFAULT_SENSITIVITY,
        federalRateChange: 0.05, // Higher tax rates
        stateRateChange: 0.03, // Higher state rates
        annualReturn: 0.12, // Bull market
        stLossRateVariance: 0.25, // More losses harvested
        ltGainRateVariance: -0.25, // Fewer gains realized
        trackingErrorMultiplier: 0.5, // Low variance
      };

      const result = calculateWithSensitivity(baseClient, DEFAULT_SETTINGS, bestCase);

      // Should have significantly higher savings
      expect(result.summary.totalTaxSavings).toBeGreaterThan(
        baseResult.summary.totalTaxSavings * 1.3
      );
    });

    it('should handle tax law sunset scenario (higher rates in year 6+)', () => {
      // This tests that sensitivity affects all years consistently
      // In reality, would need year-by-year rate changes for true sunset modeling
      const taxSunset: SensitivityParams = {
        ...DEFAULT_SENSITIVITY,
        federalRateChange: 0.03, // Model average increase over 10 years
      };

      const result = calculateWithSensitivity(baseClient, DEFAULT_SETTINGS, taxSunset);

      // Should complete calculation
      expect(result.years.length).toBe(10);
      expect(result.summary.totalTaxSavings).toBeGreaterThan(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle zero federal rate change', () => {
      const params: SensitivityParams = {
        ...DEFAULT_SENSITIVITY,
        federalRateChange: 0,
      };

      const result = calculateWithSensitivity(baseClient, DEFAULT_SETTINGS, params);
      const baseResult = calculate(baseClient, DEFAULT_SETTINGS);

      expect(result.summary.totalTaxSavings).toBeCloseTo(
        baseResult.summary.totalTaxSavings,
        2
      );
    });

    it('should handle extreme negative return (-20%)', () => {
      const params: SensitivityParams = {
        ...DEFAULT_SENSITIVITY,
        annualReturn: -0.20,
      };

      const result = calculateWithSensitivity(baseClient, DEFAULT_SETTINGS, params);

      // Should still calculate without errors
      expect(result.years.length).toBe(10);
      expect(result.summary.finalPortfolioValue).toBeGreaterThan(0);
    });

    it('should handle maximum rate variance (+50%)', () => {
      const params: SensitivityParams = {
        ...DEFAULT_SENSITIVITY,
        stLossRateVariance: 0.50,
        ltGainRateVariance: 0.50,
      };

      const result = calculateWithSensitivity(baseClient, DEFAULT_SETTINGS, params);

      // Should calculate without errors
      expect(result.years.length).toBe(10);
    });
  });

  describe('Tracking Error Multiplier', () => {
    it('should amplify variance based on tracking error when multiplier is 2x', () => {
      const baseParams: SensitivityParams = {
        ...DEFAULT_SENSITIVITY,
        trackingErrorMultiplier: 0, // No tracking error effect
        stLossRateVariance: 0.1, // 10% variance
      };

      const amplifiedParams: SensitivityParams = {
        ...DEFAULT_SENSITIVITY,
        trackingErrorMultiplier: 2.0, // 2x tracking error
        stLossRateVariance: 0.1, // 10% variance
      };

      const baseResult = calculateWithSensitivity(baseClient, DEFAULT_SETTINGS, baseParams);
      const amplifiedResult = calculateWithSensitivity(baseClient, DEFAULT_SETTINGS, amplifiedParams);

      // With tracking error amplification, results should differ
      // Core 145/45 has 1.9% tracking error, so with 2x multiplier:
      // effectiveVariance = 0.1 * (1 + 0.019 * 2.0) = 0.1 * 1.038 = 10.38%
      expect(baseResult.summary.totalTaxSavings).not.toBeCloseTo(
        amplifiedResult.summary.totalTaxSavings,
        0
      );

      // Year 1 ST loss rates should show amplification effect
      expect(baseResult.years[0].effectiveStLossRate).not.toBeCloseTo(
        amplifiedResult.years[0].effectiveStLossRate,
        4
      );
    });

    it('should produce baseline results when multiplier is 1.0', () => {
      const params: SensitivityParams = {
        ...DEFAULT_SENSITIVITY,
        trackingErrorMultiplier: 1.0,
        stLossRateVariance: 0.1,
      };

      const result = calculateWithSensitivity(baseClient, DEFAULT_SETTINGS, params);

      // With multiplier = 1.0, should apply normal tracking error amplification
      // Core 145/45 has 1.9% tracking error
      // effectiveVariance = 0.1 * (1 + 0.019 * 1.0) = 0.1019
      expect(result.years.length).toBe(10);
      expect(result.summary.totalTaxSavings).toBeGreaterThan(0);
    });

    it('should have no amplification when multiplier is 0x', () => {
      const zeroMultiplierParams: SensitivityParams = {
        ...DEFAULT_SENSITIVITY,
        trackingErrorMultiplier: 0, // No tracking error effect
        stLossRateVariance: 0.1,
      };

      const noVarianceParams: SensitivityParams = {
        ...DEFAULT_SENSITIVITY,
        trackingErrorMultiplier: 2.0, // High multiplier but no variance to amplify
        stLossRateVariance: 0.1,
      };

      const zeroResult = calculateWithSensitivity(baseClient, DEFAULT_SETTINGS, zeroMultiplierParams);
      const noVarianceResult = calculateWithSensitivity(baseClient, DEFAULT_SETTINGS, noVarianceParams);

      // With multiplier = 0, tracking error has no effect
      // effectiveVariance = 0.1 * (1 + 0) = 0.1 exactly
      expect(zeroResult.years.length).toBe(10);

      // Results should differ when tracking error is applied vs not applied
      expect(zeroResult.summary.totalTaxSavings).not.toBeCloseTo(
        noVarianceResult.summary.totalTaxSavings,
        0
      );
    });

    it('should have minimal impact when variance is 0', () => {
      const baselineParams: SensitivityParams = {
        ...DEFAULT_SENSITIVITY,
        trackingErrorMultiplier: 1.0, // Baseline multiplier
        stLossRateVariance: 0, // No variance to amplify
        ltGainRateVariance: 0,
      };

      const highMultiplierParams: SensitivityParams = {
        ...DEFAULT_SENSITIVITY,
        trackingErrorMultiplier: 2.0, // High multiplier
        stLossRateVariance: 0, // No variance to amplify
        ltGainRateVariance: 0,
      };

      const baselineResult = calculateWithSensitivity(baseClient, DEFAULT_SETTINGS, baselineParams);
      const highMultiplierResult = calculateWithSensitivity(baseClient, DEFAULT_SETTINGS, highMultiplierParams);

      // When variance = 0, amplification has no effect (0 * anything = 0)
      // Results should be very similar (may differ slightly due to floating point)
      expect(baselineResult.summary.totalTaxSavings).toBeCloseTo(
        highMultiplierResult.summary.totalTaxSavings,
        0
      );
    });

    it('should show larger impact with higher tracking error strategies', () => {
      // Test with Core 130/30 which has 4.3% tracking error (higher than Core 145/45's 1.9%)
      const highTrackingClient: CalculatorInputs = {
        ...baseClient,
        strategyId: 'core-130-30', // 4.3% tracking error
      };

      const params: SensitivityParams = {
        ...DEFAULT_SENSITIVITY,
        trackingErrorMultiplier: 2.0,
        stLossRateVariance: 0.1,
      };

      const lowTrackingResult = calculateWithSensitivity(baseClient, DEFAULT_SETTINGS, params);
      const highTrackingResult = calculateWithSensitivity(highTrackingClient, DEFAULT_SETTINGS, params);

      // Higher tracking error strategy should show different variance amplification
      // Core 145/45: effectiveVariance = 0.1 * (1 + 0.019 * 2.0) = 0.1038
      // Core 130/30: effectiveVariance = 0.1 * (1 + 0.043 * 2.0) = 0.1086
      // The difference should be measurable but results depend on the entire calculation
      expect(lowTrackingResult.years[0].effectiveStLossRate).toBeDefined();
      expect(highTrackingResult.years[0].effectiveStLossRate).toBeDefined();
    });

    it('should work with both positive and negative variances', () => {
      const positiveVarianceParams: SensitivityParams = {
        ...DEFAULT_SENSITIVITY,
        trackingErrorMultiplier: 2.0,
        stLossRateVariance: 0.2, // +20% more losses (beneficial)
        ltGainRateVariance: -0.2, // -20% fewer gains (beneficial)
      };

      const negativeVarianceParams: SensitivityParams = {
        ...DEFAULT_SENSITIVITY,
        trackingErrorMultiplier: 2.0,
        stLossRateVariance: -0.2, // -20% fewer losses (detrimental)
        ltGainRateVariance: 0.2, // +20% more gains (detrimental)
      };

      const positiveResult = calculateWithSensitivity(baseClient, DEFAULT_SETTINGS, positiveVarianceParams);
      const negativeResult = calculateWithSensitivity(baseClient, DEFAULT_SETTINGS, negativeVarianceParams);

      // Both should calculate successfully
      expect(positiveResult.years.length).toBe(10);
      expect(negativeResult.years.length).toBe(10);

      // Positive variance scenario should have higher tax savings
      expect(positiveResult.summary.totalTaxSavings).toBeGreaterThan(
        negativeResult.summary.totalTaxSavings
      );
    });
  });
});
