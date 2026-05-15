import { describe, it, expect } from 'vitest';
import { buildLossBreakdown, describeSegments } from './calculations/lossBreakdown';
import { YearResult } from './types';

function makeYear(overrides: Partial<YearResult> = {}): YearResult {
  return {
    year: 1,
    qfafValue: 0,
    collateralValue: 1_000_000,
    totalValue: 1_000_000,
    stGainsGenerated: 0,
    ordinaryLossesGenerated: 0,
    usableOrdinaryLoss: 0,
    excessToNol: 0,
    stLossesHarvested: 0,
    ltGainsRealized: 0,
    netStGainLoss: 0,
    federalTax: 0,
    stateTax: 0,
    totalTax: 0,
    baselineTax: 0,
    taxSavings: 0,
    stLossCarryforward: 0,
    ltLossCarryforward: 0,
    nolCarryforward: 0,
    nolUsedThisYear: 0,
    capitalLossUsedAgainstIncome: 0,
    effectiveStLossRate: 0,
    incomeOffsetAmount: 0,
    maxIncomeOffsetCapacity: 0,
    ordinaryLossBenefit: 0,
    nolUsageBenefit: 0,
    stToLtConversionBenefit: 0,
    capitalLossBenefit: 0,
    ltGainCost: 0,
    remainingStGainCost: 0,
    qfafTaxBenefit: 0,
    collateralTaxBenefit: 0,
    stGainLeakage: 0,
    qfafCashReturned: 0,
    strategyActive: true,
    ...overrides,
  };
}

describe('buildLossBreakdown', () => {
  it('January start, CY1: all 12 months in D-Y1 with uniform spread', () => {
    const year = makeYear({
      year: 1,
      stLossesHarvested: 120_000,
      ordinaryLossesGenerated: 180_000,
    });
    const periods = buildLossBreakdown({
      year,
      yearIndex: 1,
      startMonth: 1,
      qfafDuration: 10,
      granularity: 'monthly',
    });
    expect(periods).toHaveLength(12);
    expect(periods.every(p => p.active)).toBe(true);
    expect(periods.every(p => p.segments.length === 1 && p.segments[0].deploymentYear === 1)).toBe(true);
    // Sum of monthly ST losses equals annual.
    const stSum = periods.reduce((s, p) => s + p.stLosses, 0);
    expect(stSum).toBeCloseTo(120_000, 2);
    const ordSum = periods.reduce((s, p) => s + p.ordinaryLosses, 0);
    expect(ordSum).toBeCloseTo(180_000, 2);
  });

  it('July start CY1: only Jul-Dec active, all in D-Y1 months 1-6', () => {
    const year = makeYear({
      year: 1,
      stLossesHarvested: 115_000,
      ordinaryLossesGenerated: 90_000,
    });
    const periods = buildLossBreakdown({
      year,
      yearIndex: 1,
      startMonth: 7,
      qfafDuration: 10,
      granularity: 'monthly',
    });
    const inactiveMonths = periods.slice(0, 6);
    const activeMonths = periods.slice(6);
    expect(inactiveMonths.every(p => !p.active)).toBe(true);
    expect(activeMonths.every(p => p.active)).toBe(true);
    // Each active month belongs to D-Y1 with sequential dyMonth 1..6.
    activeMonths.forEach((p, i) => {
      expect(p.segments).toEqual([
        { deploymentYear: 1, monthsInDY: [i + 1, i + 1], monthsInPeriod: 1 },
      ]);
    });
    // Sums conserved.
    expect(activeMonths.reduce((s, p) => s + p.stLosses, 0)).toBeCloseTo(115_000, 2);
    expect(activeMonths.reduce((s, p) => s + p.ordinaryLosses, 0)).toBeCloseTo(90_000, 2);
  });

  it('July start CY2: Jan-Jun in D-Y1, Jul-Dec in D-Y2', () => {
    const year = makeYear({
      year: 2,
      stLossesHarvested: 180_000,
      ordinaryLossesGenerated: 180_000,
    });
    // Rate function: D-Y1 = 0.23, D-Y2 = 0.13.
    const rate = (dy: number) => (dy === 1 ? 0.23 : 0.13);
    const periods = buildLossBreakdown({
      year,
      yearIndex: 2,
      startMonth: 7,
      qfafDuration: 10,
      granularity: 'monthly',
      rateForDeploymentYear: rate,
    });
    expect(periods).toHaveLength(12);
    expect(periods.every(p => p.active)).toBe(true);
    // Jan (month 1 of CY2) is deployment month 7 → D-Y1 month 7.
    expect(periods[0].segments).toEqual([
      { deploymentYear: 1, monthsInDY: [7, 7], monthsInPeriod: 1 },
    ]);
    // Jul (month 7 of CY2) is deployment month 13 → D-Y2 month 1.
    expect(periods[6].segments).toEqual([
      { deploymentYear: 2, monthsInDY: [1, 1], monthsInPeriod: 1 },
    ]);
    // Jan-Jun share = 6 × 0.23 / (6 × 0.23 + 6 × 0.13) ≈ 0.6389
    // → Jan-Jun total ST losses ≈ 180k × 0.6389 ≈ 115k
    const janJunSt = periods.slice(0, 6).reduce((s, p) => s + p.stLosses, 0);
    const julDecSt = periods.slice(6).reduce((s, p) => s + p.stLosses, 0);
    expect(janJunSt + julDecSt).toBeCloseTo(180_000, 2);
    // The D-Y1 half should carry MORE of the loss (higher rate).
    expect(janJunSt).toBeGreaterThan(julDecSt);
    // Ordinary losses are uniform → exactly half/half.
    const janJunOrd = periods.slice(0, 6).reduce((s, p) => s + p.ordinaryLosses, 0);
    const julDecOrd = periods.slice(6).reduce((s, p) => s + p.ordinaryLosses, 0);
    expect(janJunOrd).toBeCloseTo(90_000, 2);
    expect(julDecOrd).toBeCloseTo(90_000, 2);
  });

  it('Quarterly granularity straddles deployment-year boundary for non-aligned starts', () => {
    // startMonth=5 (May): CY2 Q2 (Apr-Jun) straddles D-Y1 (Apr) and D-Y2 (May-Jun).
    const year = makeYear({
      year: 2,
      stLossesHarvested: 100_000,
      ordinaryLossesGenerated: 120_000,
    });
    const periods = buildLossBreakdown({
      year,
      yearIndex: 2,
      startMonth: 5,
      qfafDuration: 10,
      granularity: 'quarterly',
    });
    expect(periods).toHaveLength(4);
    // Q1 = Jan-Mar, all in D-Y1 (deployment months 9-11).
    expect(periods[0].segments).toEqual([
      { deploymentYear: 1, monthsInDY: [9, 11], monthsInPeriod: 3 },
    ]);
    // Q2 = Apr-Jun. Apr = deployment month 12 (D-Y1). May = deployment month 13
    // = D-Y2 month 1. Jun = D-Y2 month 2.
    expect(periods[1].segments).toEqual([
      { deploymentYear: 1, monthsInDY: [12, 12], monthsInPeriod: 1 },
      { deploymentYear: 2, monthsInDY: [1, 2], monthsInPeriod: 2 },
    ]);
  });

  it('Inactive periods past the strategy life show no segments', () => {
    const year = makeYear({
      year: 11,
      stLossesHarvested: 50_000,
      ordinaryLossesGenerated: 90_000,
    });
    // July start, qfafDuration=10: CY11 Jan-Jun in D-Y10, Jul-Dec inactive.
    const periods = buildLossBreakdown({
      year,
      yearIndex: 11,
      startMonth: 7,
      qfafDuration: 10,
      granularity: 'quarterly',
    });
    // Q3 (Jul-Sep) and Q4 (Oct-Dec) are entirely post-strategy.
    expect(periods[2].active).toBe(false);
    expect(periods[3].active).toBe(false);
    expect(periods[2].segments).toEqual([]);
    expect(periods[3].segments).toEqual([]);
    // Q1 and Q2 are active and cover the trailing 6 months of D-Y10.
    expect(periods[0].active).toBe(true);
    expect(periods[1].active).toBe(true);
    // Loss totals are conserved in the active periods.
    const stSum = periods.reduce((s, p) => s + p.stLosses, 0);
    expect(stSum).toBeCloseTo(50_000, 2);
  });
});

describe('describeSegments', () => {
  it('formats single multi-month segment', () => {
    expect(
      describeSegments([
        { deploymentYear: 1, monthsInDY: [7, 9], monthsInPeriod: 3 },
      ])
    ).toBe('D-Y1 mo 7–9');
  });

  it('formats single-month segment', () => {
    expect(
      describeSegments([
        { deploymentYear: 1, monthsInDY: [12, 12], monthsInPeriod: 1 },
      ])
    ).toBe('D-Y1 mo 12');
  });

  it('joins straddling segments with +', () => {
    expect(
      describeSegments([
        { deploymentYear: 1, monthsInDY: [12, 12], monthsInPeriod: 1 },
        { deploymentYear: 2, monthsInDY: [1, 2], monthsInPeriod: 2 },
      ])
    ).toBe('D-Y1 mo 12 + D-Y2 mo 1–2');
  });

  it('returns em-dash for inactive sub-period', () => {
    expect(describeSegments([])).toBe('—');
  });
});
