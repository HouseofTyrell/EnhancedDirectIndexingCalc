import { describe, expect, it } from 'vitest';
import { calculate } from './calculations';
import { computeWashingtonIncomeTax, computeWashingtonYearTaxImpact } from './taxData';
import { CalculatorInputs, DEFAULT_SETTINGS } from './types';

const waInputs: CalculatorInputs = {
  filingStatus: 'mfj',
  stateCode: 'WA',
  stateRate: 0,
  annualIncome: 10000000,
  strategyId: 'overlay-45-45',
  collateralAmount: 20000000,
  existingStLossCarryforward: 0,
  existingLtLossCarryforward: 0,
  existingNolCarryforward: 0,
  qfafEnabled: true,
  qfafSizingYears: 1,
  qfafSizingCushion: 0,
  qfafDuration: 5,
  qfafSizingMode: 'dynamic',
  startMonth: 1,
};

describe('Washington 2028 income tax', () => {
  it('switches on at the 2027/2028 boundary and applies the statutory deduction', () => {
    expect(computeWashingtonIncomeTax(2027, 2000000, 0).netTax).toBe(0);
    expect(computeWashingtonIncomeTax(2028, 999999, 0).netTax).toBe(0);
    expect(computeWashingtonIncomeTax(2028, 2000000, 0).netTax).toBe(99000);
  });

  it('credits capital-gains excise without producing a negative tax', () => {
    const partial = computeWashingtonIncomeTax(2028, 2000000, 40000);
    expect(partial.grossTax).toBe(99000);
    expect(partial.capitalGainsTaxCredit).toBe(40000);
    expect(partial.netTax).toBe(59000);

    const full = computeWashingtonIncomeTax(2028, 2000000, 200000);
    expect(full.capitalGainsTaxCredit).toBe(99000);
    expect(full.netTax).toBe(0);
  });

  it('attributes deductions and overlapping capital gains through one credited path', () => {
    const impact = computeWashingtonYearTaxImpact({
      taxYear: 2028,
      ordinaryIncome: 2000000,
      strategyStGain: 0,
      strategyLtGain: 500000,
      eventStGain: 0,
      eventLtGain: 0,
      ordinaryDeduction: 200000,
      capitalLossDeduction: 3000,
      nolDeduction: 100000,
      strategyCapitalGainsExcise: 35000,
      eventCapitalGainsExcise: 0,
    });
    expect(impact.capitalGainsTaxCredit).toBe(35000);
    expect(impact.ordinaryLossBenefit).toBeGreaterThan(0);
    expect(impact.nolUsageBenefit).toBeGreaterThan(0);
    expect(impact.incomeTax).toBeGreaterThanOrEqual(0);
  });

  it('reports zero in projection years 2026-27 and modeled tax/credit from 2028', () => {
    const result = calculate(waInputs, { ...DEFAULT_SETTINGS, projectionYears: 5 });
    expect(result.years[0]?.waIncomeTax).toBe(0);
    expect(result.years[1]?.waIncomeTax).toBe(0);
    expect(result.years[2]?.waIncomeTax).toBeGreaterThan(0);
    expect(result.years.slice(2).some(y => y.waCapitalGainsTaxCredit > 0)).toBe(true);
  });
});
