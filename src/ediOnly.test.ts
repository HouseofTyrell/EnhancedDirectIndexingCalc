import { describe, it, expect } from 'vitest';
import { computeEdiYear } from './calculations/ediOnly';

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

    // $3K deduction against ordinary income
    expect(result.capitalLossDeduction).toBe(3000);
    expect(result.taxSavedByCapitalLossDeduction).toBeCloseTo(1623, -1);

    // Net annual benefit is POSITIVE (not $0, not negative)
    expect(result.annualRealizedBenefit).toBeGreaterThan(0);
    expect(result.annualRealizedBenefit).toBeCloseTo(1623, -1);

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
