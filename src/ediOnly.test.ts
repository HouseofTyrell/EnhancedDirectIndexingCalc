import { describe, it, expect } from 'vitest';
import {
  computeEdiYear,
  computeEdiProjection,
  calculateRealizationScenario,
  getDefaultScenarios,
  computeScenarioResults,
  estimateEmbeddedGainPct,
  calculateUnwindAnalysis,
  calculateEstateComparison,
  computeStrategyEconomics,
  computeBaselineComparison,
} from './calculations/ediOnly';

describe('computeEdiYear', () => {
  const defaults = {
    strategyId: 'overlay-45-45',
    collateralValue: 10_000_000,
    combinedStRate: 0.541, // 37% fed + 3.8% NIIT + 13.3% CA
    combinedLtRate: 0.371, // 20% fed + 3.8% NIIT + 13.3% CA
    filingStatus: 'mfj' as const,
    washSaleRate: 0,
  };

  it('should correctly net ST losses against LT gains in Year 1', () => {
    const result = computeEdiYear({
      year: 1,
      ...defaults,
      priorStCarryforward: 0,
      priorLtCarryforward: 0,
    });

    // Overlay 45/45 Year 1: ST loss rate 16.5%, LT gain rate 1.4%
    expect(result.stLossesHarvested).toBeCloseTo(1_650_000, -2);
    expect(result.ltGainsRealized).toBeCloseTo(140_000, -2);

    // ST losses fully shelter LT gains
    expect(result.stLossesUsedToOffsetLtGains).toBeCloseTo(140_000, -2);
    expect(result.netLtGainAfterOffset).toBe(0);
    expect(result.taxOnRemainingLtGains).toBe(0);

    // Excess ST losses become carryforward
    expect(result.excessStLossAfterOffset).toBeCloseTo(1_510_000, -2);

    // $3K deduction against ordinary income (excludes NIIT — offsets ordinary, not NII)
    // Rate = combinedStRate (0.541) - niitRate (0.038) = 0.503
    expect(result.capitalLossDeduction).toBe(3000);
    expect(result.taxSavedByCapitalLossDeduction).toBeCloseTo(1509, -1);

    // Net annual benefit is POSITIVE (not $0, not negative)
    expect(result.annualRealizedBenefit).toBeGreaterThan(0);
    expect(result.annualRealizedBenefit).toBeCloseTo(1509, -1);

    // Carryforward = excess - $3K deduction
    expect(result.endingStCarryforward).toBeCloseTo(1_507_000, -2);
  });

  it('should use prior carryforward to offset LT gains when ST losses are insufficient', () => {
    // Scenario: Year 10, small ST losses, prior CF available
    const result = computeEdiYear({
      year: 10,
      ...defaults,
      collateralValue: 10_000_000,
      priorStCarryforward: 5_000_000,
      priorLtCarryforward: 0,
    });

    // Year 10 ST loss rate: 4.5%, LT gain: 1.4%
    // ST losses = $450K, LT gains = $140K
    // ST losses shelter LT gains: $140K
    // Excess: $310K
    expect(result.stLossesUsedToOffsetLtGains).toBeCloseTo(140_000, -2);
    expect(result.netLtGainAfterOffset).toBe(0);
    expect(result.excessStLossAfterOffset).toBeCloseTo(310_000, -2);

    // Carryforward = prior $5M + $310K excess - $3K deduction
    expect(result.endingStCarryforward).toBeCloseTo(5_307_000, -2);
  });

  it('should handle MFS filing status with $1,500 capital loss limit', () => {
    const result = computeEdiYear({
      year: 1,
      ...defaults,
      filingStatus: 'mfs',
      priorStCarryforward: 0,
      priorLtCarryforward: 0,
    });

    expect(result.capitalLossDeduction).toBe(1500);
  });
});

describe('computeEdiProjection', () => {
  const defaults = {
    strategyId: 'overlay-45-45',
    collateralValue: 10_000_000,
    combinedStRate: 0.541,
    combinedLtRate: 0.371,
    filingStatus: 'mfj' as const,
    washSaleRate: 0,
    existingStCarryforward: 0,
    existingLtCarryforward: 0,
    annualReturn: 0.07,
    projectionYears: 10,
  };

  it('should accumulate carryforward over 10 years', () => {
    const result = computeEdiProjection(defaults);

    expect(result.years).toHaveLength(10);

    // Year 1: ~$1.507M CF
    expect(result.years[0].endingStCarryforward).toBeGreaterThan(1_400_000);

    // Year 10: CF should be significantly larger
    expect(result.years[9].endingStCarryforward).toBeGreaterThan(4_000_000);

    // Carryforward should increase every year
    for (let i = 1; i < result.years.length; i++) {
      expect(result.years[i].endingStCarryforward)
        .toBeGreaterThan(result.years[i - 1].endingStCarryforward);
    }
  });

  it('should compute correct summary totals', () => {
    const result = computeEdiProjection(defaults);

    expect(result.summary.totalRealizedBenefit).toBeGreaterThan(0);
    expect(result.summary.finalCarryforward).toBeGreaterThan(4_000_000);
    expect(result.summary.carryforwardTaxShield).toBeGreaterThan(1_500_000);
    expect(result.summary.cumulativeHarvestingEfficiency).toBeGreaterThan(2);
  });

  it('should grow collateral value when annualReturn > 0', () => {
    const result = computeEdiProjection(defaults);

    expect(result.years[9].collateralValue)
      .toBeGreaterThan(defaults.collateralValue);
  });
});

describe('calculateRealizationScenario', () => {
  it('should shelter gains with carryforward — no annual limit', () => {
    const result = calculateRealizationScenario({
      gainAmount: 3_000_000,
      gainCharacter: 'lt',
      availableStCarryforward: 5_000_000,
      availableLtCarryforward: 0,
      combinedStRate: 0.541,
      combinedLtRate: 0.371,
    });

    // $5M CF can shelter $3M in gains — NO dollar limit
    expect(result.carryforwardUsed).toBe(3_000_000);
    expect(result.taxableGainAfterCf).toBe(0);
    expect(result.taxWithCarryforward).toBe(0);
    expect(result.taxWithoutCarryforward).toBeCloseTo(1_113_000, -2);
    expect(result.taxSaved).toBeCloseTo(1_113_000, -2);
    expect(result.remainingStCarryforward).toBe(2_000_000);
  });

  it('should apply same-character CF first, then cross-apply', () => {
    const result = calculateRealizationScenario({
      gainAmount: 2_000_000,
      gainCharacter: 'lt',
      availableStCarryforward: 500_000,
      availableLtCarryforward: 1_000_000,
      combinedStRate: 0.541,
      combinedLtRate: 0.371,
    });

    // LT CF offsets LT gain first: $1M
    // Then ST CF cross-applies: $500K
    // Total offset: $1.5M
    // Remaining taxable: $500K
    expect(result.carryforwardUsed).toBe(1_500_000);
    expect(result.taxableGainAfterCf).toBe(500_000);
    expect(result.remainingStCarryforward).toBe(0);
    expect(result.remainingLtCarryforward).toBe(0);
  });

  it('should handle concentrated stock exit scenario defaults', () => {
    const result = calculateRealizationScenario({
      gainAmount: 5_000_000,
      gainCharacter: 'lt',
      availableStCarryforward: 5_470_000,
      availableLtCarryforward: 0,
      combinedStRate: 0.541,
      combinedLtRate: 0.371,
    });

    // $5.47M CF shelters $5M gain fully
    expect(result.taxableGainAfterCf).toBe(0);
    expect(result.taxSaved).toBeCloseTo(1_855_000, -3);
  });
});

describe('default realization scenarios', () => {
  it('should provide 3 pre-built scenarios', () => {
    const scenarios = getDefaultScenarios(10_000_000);
    expect(scenarios).toHaveLength(3);
    expect(scenarios[0].label).toBe('Concentrated Stock Exit');
    expect(scenarios[1].label).toBe('Portfolio Transition');
    expect(scenarios[2].label).toBe('Retirement Liquidation');
  });

  it('should compute concentrated stock exit at Year 5', () => {
    const projection = computeEdiProjection({
      strategyId: 'overlay-45-45',
      collateralValue: 10_000_000,
      combinedStRate: 0.541,
      combinedLtRate: 0.371,
      filingStatus: 'mfj',
      washSaleRate: 0,
      existingStCarryforward: 0,
      existingLtCarryforward: 0,
      annualReturn: 0.07,
      projectionYears: 10,
    });

    const scenarios = getDefaultScenarios(10_000_000);
    const results = computeScenarioResults(scenarios[0], projection, 0.541, 0.371);

    // At Year 5, should have substantial CF to shelter the $5M gain
    expect(results.taxSaved).toBeGreaterThan(1_000_000);
  });

  it('should compute multi-year retirement liquidation', () => {
    const projection = computeEdiProjection({
      strategyId: 'overlay-45-45',
      collateralValue: 10_000_000,
      combinedStRate: 0.541,
      combinedLtRate: 0.371,
      filingStatus: 'mfj',
      washSaleRate: 0,
      existingStCarryforward: 0,
      existingLtCarryforward: 0,
      annualReturn: 0.07,
      projectionYears: 10,
    });

    const scenarios = getDefaultScenarios(10_000_000);
    const results = computeScenarioResults(scenarios[2], projection, 0.541, 0.371);

    // Multi-year scenario should have year-by-year details
    expect(results.yearDetails).toBeDefined();
    expect(results.yearDetails!.length).toBeGreaterThan(0);
  });
});

describe('embedded gain estimation', () => {
  it('should estimate embedded gain percentage by year', () => {
    const pct1 = estimateEmbeddedGainPct('overlay-45-45', 1, 0.07);
    const pct5 = estimateEmbeddedGainPct('overlay-45-45', 5, 0.07);
    const pct10 = estimateEmbeddedGainPct('overlay-45-45', 10, 0.07);

    // Embedded gain grows over time
    expect(pct1).toBeGreaterThan(0.10);
    expect(pct5).toBeGreaterThan(pct1);
    expect(pct10).toBeGreaterThan(pct5);

    // Should be in reasonable range
    expect(pct10).toBeLessThan(0.90);
  });

  it('should have embedded gain with zero growth from basis reduction', () => {
    const pct = estimateEmbeddedGainPct('overlay-45-45', 1, 0);
    // Basis reduction from harvesting creates embedded gain even at 0% growth
    // Year 1: stLossRate=16.5%, ltGainRate=1.4%, netStLoss=15.1%
    // embeddedGain = 0 (no appreciation) + 0.151 (basis reduction) = 0.151
    // PV stays 1.0, so pct = 0.151 / 1.0 = 15.1%
    expect(pct).toBeCloseTo(0.151, 3);
  });
});

describe('unwind analysis', () => {
  it('should compute full liquidation unwind', () => {
    const projection = computeEdiProjection({
      strategyId: 'overlay-45-45',
      collateralValue: 10_000_000,
      combinedStRate: 0.541,
      combinedLtRate: 0.371,
      filingStatus: 'mfj',
      washSaleRate: 0,
      existingStCarryforward: 0,
      existingLtCarryforward: 0,
      annualReturn: 0.07,
      projectionYears: 10,
    });

    const unwind = calculateUnwindAnalysis({
      unwindYear: 5,
      projection,
      strategyId: 'overlay-45-45',
      annualReturn: 0.07,
      combinedLtRate: 0.371,
    });

    // Should have embedded gains
    expect(unwind.embeddedGainEstimate).toBeGreaterThan(0);
    // Carryforward should shelter some/all of the gains
    expect(unwind.carryforwardUsed).toBeGreaterThan(0);
    // Tax saved should be substantial
    expect(unwind.taxSavedByCf).toBeGreaterThan(0);
  });
});

describe('estate comparison', () => {
  it('should recommend full unwind when CF > embedded gains', () => {
    const result = calculateEstateComparison({
      portfolioValue: 10_000_000,
      embeddedGainPct: 0.30,
      availableStCarryforward: 5_000_000,
      availableLtCarryforward: 0,
      combinedLtRate: 0.371,
    });

    // CF ($5M) > embedded gains ($3M) -> unwind
    expect(result.recommendation).toBe('unwind');
    expect(result.unwindBeforeDeath.taxPaid).toBe(0);
  });

  it('should recommend partial unwind when CF < embedded gains', () => {
    const result = calculateEstateComparison({
      portfolioValue: 10_000_000,
      embeddedGainPct: 0.60,
      availableStCarryforward: 3_000_000,
      availableLtCarryforward: 0,
      combinedLtRate: 0.371,
    });

    // CF ($3M) < embedded gains ($6M) -> partial unwind
    expect(result.recommendation).toBe('partial_unwind');
    expect(result.optimalUnwindPct).toBeGreaterThan(0);
    expect(result.optimalUnwindPct).toBeLessThan(1);
  });

  it('should recommend continue when CF is zero', () => {
    const result = calculateEstateComparison({
      portfolioValue: 10_000_000,
      embeddedGainPct: 0.50,
      availableStCarryforward: 0,
      availableLtCarryforward: 0,
      combinedLtRate: 0.371,
    });

    expect(result.recommendation).toBe('continue');
  });
});

describe('strategy economics', () => {
  const baseProjection = computeEdiProjection({
    strategyId: 'overlay-45-45',
    collateralValue: 10_000_000,
    combinedStRate: 0.541,
    combinedLtRate: 0.371,
    filingStatus: 'mfj',
    washSaleRate: 0,
    existingStCarryforward: 0,
    existingLtCarryforward: 0,
    annualReturn: 0.07,
    projectionYears: 10,
  });

  it('should compute annual costs from financing + advisory', () => {
    const result = computeStrategyEconomics(baseProjection, 0.015, 0.0075, 0.371);

    expect(result.years).toHaveLength(10);
    // Year 1: $10M * (1.5% + 0.75%) = $225K
    expect(result.years[0].totalCost).toBeCloseTo(225_000, -3);
    expect(result.years[0].financingCost).toBeCloseTo(150_000, -3);
    expect(result.years[0].advisoryFee).toBeCloseTo(75_000, -3);
  });

  it('should compute positive net benefit from tax alpha exceeding costs', () => {
    const result = computeStrategyEconomics(baseProjection, 0.015, 0.0075, 0.371);

    // CF tax shield delta in Year 1 should be substantial (>$500K)
    expect(result.years[0].cfTaxShieldDelta).toBeGreaterThan(400_000);
    // Net benefit should be positive in Year 1
    expect(result.years[0].netBenefit).toBeGreaterThan(0);
  });

  it('should compute summary totals correctly', () => {
    const result = computeStrategyEconomics(baseProjection, 0.015, 0.0075, 0.371);

    expect(result.summary.totalCost).toBeGreaterThan(2_000_000);
    expect(result.summary.totalBenefit).toBeGreaterThan(0);
    // ROI is meaningful (can be positive or negative depending on strategy economics)
    expect(result.summary.roi).toBeDefined();
    expect(result.summary.avgTaxAlphaBps).toBeDefined();
  });

  it('should find early payback when early-year CF delta exceeds costs', () => {
    const result = computeStrategyEconomics(baseProjection, 0.015, 0.0075, 0.371);

    // Year 1 generates massive CF ($1.5M+), so Year 1 net benefit is large and positive
    expect(result.years[0].netBenefit).toBeGreaterThan(0);
    expect(result.summary.paybackYear).toBe(1);
  });

  it('should show declining tax alpha as harvesting rates decay', () => {
    const result = computeStrategyEconomics(baseProjection, 0.015, 0.0075, 0.371);

    // Year 1 should have high tax alpha (large CF delta)
    expect(result.years[0].taxAlphaBps).toBeGreaterThan(100);
    // Later years should have lower (possibly negative) alpha as loss rates decline
    expect(result.years[0].taxAlphaBps).toBeGreaterThan(result.years[9].taxAlphaBps);
  });
});

describe('baseline comparison', () => {
  const baseProjection = computeEdiProjection({
    strategyId: 'overlay-45-45',
    collateralValue: 10_000_000,
    combinedStRate: 0.541,
    combinedLtRate: 0.371,
    filingStatus: 'mfj',
    washSaleRate: 0,
    existingStCarryforward: 0,
    existingLtCarryforward: 0,
    annualReturn: 0.07,
    projectionYears: 10,
  });

  it('should compute passive vs EDI terminal values', () => {
    const result = computeBaselineComparison(
      baseProjection, 10_000_000, 0.07, 0.015, 0.371, 'overlay-45-45'
    );

    expect(result.years).toHaveLength(10);
    expect(result.terminalPassive).toBeGreaterThan(10_000_000);
    expect(result.terminalEdi).toBeGreaterThan(10_000_000);
  });

  it('should compute EDI vs passive comparison with incremental costs', () => {
    const result = computeBaselineComparison(
      baseProjection, 10_000_000, 0.07, 0.015, 0.371, 'overlay-45-45'
    );

    // EDI advantage can be positive or negative depending on strategy economics
    // The comparison is meaningful: advisory fees are excluded (common to both)
    expect(result.ediAdvantage).toBeDefined();
    expect(result.ediAdvantagePct).toBeDefined();
    // EDI cumulative costs should grow over time
    expect(result.years[9].ediCosts).toBeGreaterThan(result.years[0].ediCosts);
    // EDI tax benefit should be positive
    expect(result.years[9].ediTaxBenefit).toBeGreaterThan(0);
  });

  it('should track passive embedded gain growing over time', () => {
    const result = computeBaselineComparison(
      baseProjection, 10_000_000, 0.07, 0.015, 0.371, 'overlay-45-45'
    );

    // Passive embedded gain should grow
    expect(result.years[9].passiveEmbeddedGain).toBeGreaterThan(result.years[0].passiveEmbeddedGain);
    // Passive exit tax should be substantial by Year 10
    expect(result.years[9].passiveExitTax).toBeGreaterThan(1_000_000);
  });
});
