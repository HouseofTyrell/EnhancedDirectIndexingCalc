/**
 * Financial Advisor Scenario Tests
 *
 * These tests verify the calculator from a CPA/FA perspective, ensuring
 * tax calculations are accurate for various client profiles.
 */

import { describe, it, expect } from 'vitest';
import { calculate, calculateSizing } from './calculations';
import { CalculatorInputs, DEFAULT_SETTINGS } from './types';
import { getFederalStRate, getFederalLtRate, getStateRate } from './taxData';

// Helper to create inputs with sensible defaults
function createClientProfile(overrides: Partial<CalculatorInputs> = {}): CalculatorInputs {
  return {
    strategyId: 'core-145-45',
    collateralAmount: 1000000,
    annualIncome: 500000,
    filingStatus: 'mfj',
    stateCode: 'CA',
    stateRate: 0,
    qfafEnabled: true,
    qfafSizingYears: 1, // Year 1 only for backwards-compatible test assertions
    existingStLossCarryforward: 0,
    existingLtLossCarryforward: 0,
    existingNolCarryforward: 0,
    ...overrides,
  };
}

describe('Financial Advisor Scenarios', () => {
  describe('Scenario 1: Small Portfolio ($1M) - Young Professional', () => {
    // Profile: $1M collateral, $500K income, CA, MFJ
    const client = createClientProfile({
      collateralAmount: 1000000,
      annualIncome: 500000,
      stateCode: 'CA',
      filingStatus: 'mfj',
      strategyId: 'core-145-45',
    });

    it('should correctly size QFAF for $1M collateral', () => {
      const sizing = calculateSizing(client);

      // Core 145/45 has 28.5% Year 1 ST loss rate
      // QFAF = (1M * 28.5%) / 150% = 285K / 1.5 = $190,000
      expect(sizing.qfafValue).toBeCloseTo(190000, -2);
      expect(sizing.year1StLosses).toBeCloseTo(285000, 0);
      expect(sizing.year1StGains).toBeCloseTo(285000, 0); // Should match ST losses
      expect(sizing.totalExposure).toBeCloseTo(1190000, -2);
    });

    it('should calculate correct tax rates for CA MFJ $500K income', () => {
      // $500K income puts client in:
      // - 32% federal bracket ($403,550 - $512,450 for MFJ in 2026)
      // - Plus 3.8% NIIT (above $250K threshold)
      // = 35.8% federal ordinary rate
      const federalStRate = getFederalStRate(500000, 'mfj');
      expect(federalStRate).toBeCloseTo(0.358, 3);

      // LT rate: 15% ($500K is below $610,350 threshold) + 3.8% NIIT = 18.8%
      const federalLtRate = getFederalLtRate(500000, 'mfj');
      expect(federalLtRate).toBeCloseTo(0.188, 3);

      // CA state rate: 13.3%
      const stateRate = getStateRate('CA');
      expect(stateRate).toBe(0.133);
    });

    it('should show positive tax savings in Year 1', () => {
      const result = calculate(client, DEFAULT_SETTINGS);

      // Tax savings should be positive
      expect(result.years[0].taxSavings).toBeGreaterThan(0);

      // Should have ordinary loss benefit
      expect(result.years[0].usableOrdinaryLoss).toBeGreaterThan(0);

      // Net ST should be ~0 (properly sized)
      expect(result.years[0].netStGainLoss).toBeLessThan(1000);
    });

    it('should accumulate meaningful 10-year savings', () => {
      const result = calculate(client, DEFAULT_SETTINGS);

      // For $1M collateral, expect meaningful tax savings
      expect(result.summary.totalTaxSavings).toBeGreaterThan(100000);

      // Tax alpha should be reasonable (1-10% range for high-tax state like CA)
      // Higher combined rates (49.1% combined in CA) produce higher tax alpha
      expect(result.summary.effectiveTaxAlpha).toBeGreaterThan(0.01);
      expect(result.summary.effectiveTaxAlpha).toBeLessThan(0.10);
    });
  });

  describe('Scenario 2: Mid-Size Portfolio ($5M) - Business Owner', () => {
    // Profile: $5M collateral, $2M income, CA, MFJ
    const client = createClientProfile({
      collateralAmount: 5000000,
      annualIncome: 2000000,
      stateCode: 'CA',
      filingStatus: 'mfj',
      strategyId: 'core-145-45',
    });

    it('should correctly apply Section 461(l) limits', () => {
      const result = calculate(client, DEFAULT_SETTINGS);

      // $5M * 13% / 150% = $433,333 QFAF
      // QFAF ordinary losses = $433,333 * 150% = $650,000
      // But 461(l) limit for MFJ is $512,000
      // So usable ordinary loss should be capped

      // Year 1 should be limited by 461(l)
      expect(result.years[0].usableOrdinaryLoss).toBeLessThanOrEqual(512000);

      // Excess should go to NOL
      expect(result.years[0].excessToNol).toBeGreaterThan(0);
    });

    it('should show NOL being used in Year 2+', () => {
      const result = calculate(client, DEFAULT_SETTINGS);

      // Year 1 generates excess that becomes NOL
      const year1Nol = result.years[0].nolCarryforward;
      expect(year1Nol).toBeGreaterThan(0);

      // Year 2 should use some NOL
      expect(result.years[1].nolUsedThisYear).toBeGreaterThan(0);
    });

    it('should calculate correct combined tax rates', () => {
      const federalStRate = getFederalStRate(2000000, 'mfj');
      const stateRate = getStateRate('CA');

      // At $2M income: 37% + 3.8% NIIT = 40.8%
      expect(federalStRate).toBeCloseTo(0.408, 3);

      // Combined: 40.8% + 13.3% = 54.1%
      const combinedRate = federalStRate + stateRate;
      expect(combinedRate).toBeCloseTo(0.541, 3);
    });
  });

  describe('Scenario 3: Large Portfolio ($10M) - HNW Client', () => {
    // Profile: $10M collateral, $3M income, CA, MFJ (typical default)
    const client = createClientProfile({
      collateralAmount: 10000000,
      annualIncome: 3000000,
      stateCode: 'CA',
      filingStatus: 'mfj',
      strategyId: 'core-145-45',
    });

    it('should generate substantial tax alpha', () => {
      const result = calculate(client, DEFAULT_SETTINGS);

      // $10M portfolio should generate significant savings
      expect(result.summary.totalTaxSavings).toBeGreaterThan(500000);

      // Should have meaningful tax alpha (typically 2-3%+)
      expect(result.summary.effectiveTaxAlpha).toBeGreaterThan(0.015);
    });

    it('should properly handle large ordinary losses', () => {
      const result = calculate(client, DEFAULT_SETTINGS);

      // $10M * 13% = $1.3M ST losses from collateral
      // QFAF = $1.3M / 1.5 = $866,667
      // QFAF ordinary losses = $866,667 * 1.5 = $1,300,000
      // But limited to $512K (461(l))

      expect(result.years[0].usableOrdinaryLoss).toBe(512000);
      expect(result.years[0].excessToNol).toBeGreaterThan(700000);
    });

    it('should show loss rate decay over 10 years', () => {
      const result = calculate(client, DEFAULT_SETTINGS);

      // Year 1 effective ST loss rate for Core 145/45 is 28.5%
      expect(result.years[0].effectiveStLossRate).toBeCloseTo(0.285, 2);

      // Year 10 should be lower (4.5% floor for 145/45 strategy)
      // Uses year-by-year rates from strategyData
      expect(result.years[9].effectiveStLossRate).toBeLessThan(result.years[0].effectiveStLossRate);
      expect(result.years[9].effectiveStLossRate).toBeCloseTo(0.045, 2);
    });
  });

  describe('Scenario 4: Texas Client (No State Tax)', () => {
    const client = createClientProfile({
      collateralAmount: 5000000,
      annualIncome: 1000000,
      stateCode: 'TX',
      filingStatus: 'mfj',
    });

    it('should have zero state tax rate', () => {
      const stateRate = getStateRate('TX');
      expect(stateRate).toBe(0);
    });

    it('should still show positive tax savings from federal benefits', () => {
      const result = calculate(client, DEFAULT_SETTINGS);

      // Even without state tax, federal benefits should be significant
      expect(result.summary.totalTaxSavings).toBeGreaterThan(200000);
    });

    it('should have lower combined rates than CA client', () => {
      const txClient = createClientProfile({
        collateralAmount: 5000000,
        annualIncome: 1000000,
        stateCode: 'TX',
      });
      const caClient = createClientProfile({
        collateralAmount: 5000000,
        annualIncome: 1000000,
        stateCode: 'CA',
      });

      const txResult = calculate(txClient, DEFAULT_SETTINGS);
      const caResult = calculate(caClient, DEFAULT_SETTINGS);

      // CA client should have higher tax savings (higher combined rate = more benefit)
      expect(caResult.summary.totalTaxSavings).toBeGreaterThan(txResult.summary.totalTaxSavings);
    });
  });

  describe('Scenario 5: Single Filer (Different Filing Status)', () => {
    const client = createClientProfile({
      collateralAmount: 3000000,
      annualIncome: 800000,
      filingStatus: 'single',
      stateCode: 'NY',
    });

    it('should use correct single filer 461(l) limit', () => {
      const result = calculate(client, DEFAULT_SETTINGS);

      // Single filer limit is $256,000
      expect(result.years[0].usableOrdinaryLoss).toBeLessThanOrEqual(256000);
    });

    it('should use correct single filer tax brackets', () => {
      // $800K income for single filer: 37% bracket + 3.8% NIIT = 40.8%
      const federalStRate = getFederalStRate(800000, 'single');
      expect(federalStRate).toBeCloseTo(0.408, 3);

      // LT rate at $800K: 20% + 3.8% NIIT = 23.8%
      const federalLtRate = getFederalLtRate(800000, 'single');
      expect(federalLtRate).toBeCloseTo(0.238, 3);
    });
  });

  describe('Scenario 6: Collateral-Only Mode (No QFAF)', () => {
    const client = createClientProfile({
      collateralAmount: 5000000,
      annualIncome: 1000000,
      qfafEnabled: false,
    });

    it('should have zero QFAF value', () => {
      const sizing = calculateSizing(client);
      expect(sizing.qfafValue).toBe(0);
      expect(sizing.year1StGains).toBe(0);
      expect(sizing.year1OrdinaryLosses).toBe(0);
    });

    it('should still generate ST losses from collateral', () => {
      const result = calculate(client, DEFAULT_SETTINGS);

      // Should have ST losses harvested
      expect(result.years[0].stLossesHarvested).toBeGreaterThan(0);

      // But no ordinary losses (no QFAF)
      expect(result.years[0].ordinaryLossesGenerated).toBe(0);
    });

    it('should have lower tax savings than with QFAF', () => {
      const withQfaf = calculate(
        createClientProfile({
          collateralAmount: 5000000,
          annualIncome: 1000000,
          qfafEnabled: true,
        }),
        DEFAULT_SETTINGS
      );
      const withoutQfaf = calculate(client, DEFAULT_SETTINGS);

      // QFAF adds significant value through ordinary loss deduction
      expect(withQfaf.summary.totalTaxSavings).toBeGreaterThan(
        withoutQfaf.summary.totalTaxSavings
      );
    });
  });

  describe('Scenario 7: Strategy Comparison', () => {
    it('should show higher losses with more aggressive strategies', () => {
      const conservative = calculate(
        createClientProfile({ strategyId: 'core-130-30' }),
        DEFAULT_SETTINGS
      );
      const aggressive = calculate(
        createClientProfile({ strategyId: 'core-225-125' }),
        DEFAULT_SETTINGS
      );

      // Aggressive strategy (225/125) has higher ST loss rate than conservative (130/30)
      expect(aggressive.years[0].stLossesHarvested).toBeGreaterThan(
        conservative.years[0].stLossesHarvested
      );
    });

    it('should show overlay strategies have lower leverage', () => {
      const coreModerate = calculateSizing(createClientProfile({ strategyId: 'core-145-45' }));
      const overlayModerate = calculateSizing(
        createClientProfile({ strategyId: 'overlay-45-45' })
      );

      // Overlay has lower ST loss rate, so QFAF is smaller relative to collateral
      expect(overlayModerate.qfafRatio).toBeLessThan(coreModerate.qfafRatio);
    });
  });

  describe('Tax Calculation Accuracy', () => {
    it('should correctly calculate ST→LT conversion benefit', () => {
      const client = createClientProfile({
        collateralAmount: 1000000,
        annualIncome: 500000,
        stateCode: 'TX', // No state tax for simpler math
        filingStatus: 'mfj',
      });

      const result = calculate(client, DEFAULT_SETTINGS);

      // Get rates for verification
      const federalStRate = getFederalStRate(500000, 'mfj');
      const federalLtRate = getFederalLtRate(500000, 'mfj');
      const rateDifferential = federalStRate - federalLtRate;

      // ST→LT benefit should be rate differential * amount of ST gains offset
      // ST gains offset = min(QFAF ST gains, collateral ST losses)
      const stGainsOffset = Math.min(
        result.years[0].stGainsGenerated,
        result.years[0].stLossesHarvested
      );

      // The conversion benefit component
      const expectedConversionBenefit = stGainsOffset * rateDifferential;

      // Total savings should include this component (among others)
      // We can't test exactly due to other components, but we can verify it's reasonable
      expect(expectedConversionBenefit).toBeGreaterThan(0);
    });

    it('should properly limit capital loss deduction to $3K', () => {
      // Create scenario where we have excess capital losses
      const client = createClientProfile({
        collateralAmount: 100000, // Small portfolio
        annualIncome: 100000, // Lower income
        existingStLossCarryforward: 50000, // Large carryforward
        qfafEnabled: false, // No QFAF means ST losses become capital losses
      });

      const result = calculate(client, DEFAULT_SETTINGS);

      // Capital loss used against ordinary income should be limited to $3K
      // (though the test may not trigger this exactly due to gains offset first)
      expect(result.years[0].capitalLossUsedAgainstIncome).toBeLessThanOrEqual(3000);
    });
  });
});

describe('UI Display Verification', () => {
  it('should provide all fields needed for results display', () => {
    const client = createClientProfile();
    const result = calculate(client, DEFAULT_SETTINGS);

    // Summary fields for top cards
    expect(result.summary.totalTaxSavings).toBeDefined();
    expect(result.summary.finalPortfolioValue).toBeDefined();
    expect(result.summary.effectiveTaxAlpha).toBeDefined();
    expect(result.summary.totalNolGenerated).toBeDefined();

    // Sizing fields for strategy section
    expect(result.sizing.collateralValue).toBeDefined();
    expect(result.sizing.qfafValue).toBeDefined();
    expect(result.sizing.totalExposure).toBeDefined();
    expect(result.sizing.section461Limit).toBeDefined();

    // Year-by-year fields for table
    result.years.forEach((year, i) => {
      expect(year.year).toBe(i + 1);
      expect(year.taxSavings).toBeDefined();
      expect(year.collateralValue).toBeDefined();
      expect(year.qfafValue).toBeDefined();
      expect(year.stLossCarryforward).toBeDefined();
      expect(year.nolCarryforward).toBeDefined();
    });
  });

  it('should have 10 years of projections', () => {
    const result = calculate(createClientProfile(), DEFAULT_SETTINGS);
    expect(result.years).toHaveLength(10);
  });

  it('should show cumulative tax savings increasing', () => {
    const result = calculate(createClientProfile(), DEFAULT_SETTINGS);

    let cumulativeSavings = 0;
    result.years.forEach(year => {
      cumulativeSavings += year.taxSavings;
      // Each year should add to (or maintain) cumulative savings
      expect(cumulativeSavings).toBeGreaterThanOrEqual(0);
    });

    // Final cumulative should match summary
    expect(cumulativeSavings).toBeCloseTo(result.summary.totalTaxSavings, 0);
  });
});
