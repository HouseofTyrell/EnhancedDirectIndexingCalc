/**
 * Unit Tests for QFAF Test (By Year) Calculations
 *
 * Tests cover:
 * 1. Single year calculation correctness
 * 2. Rolling carryforward between years
 * 3. §461(l) limit enforcement
 * 4. Edge cases (zero infusion, max carryforward)
 * 5. Summary calculations
 */

import { describe, it, expect } from 'vitest';
import {
  computeQfafTestYear,
  computeQfafTestYears,
  computeQfafTestSummary,
  createDefaultQfafTestInputs,
  updateQfafTestInput,
  updateSection461LimitsForFilingStatus,
  isEditableField,
} from './qfafTestCalculations';
import { QfafTestYearInput } from './types';

// Helper to create a single year input
function createYearInput(overrides: Partial<QfafTestYearInput> = {}): QfafTestYearInput {
  return {
    year: 1,
    cashInfusion: 1000000, // $1M
    subscriptionPct: 1.0, // 100%
    lossRate: 1.5, // 150%
    marginalTaxRate: 0.45, // 45%
    managementFeeRate: 0.01, // 1%
    qfafFeeRate: 0.015, // 1.5%
    section461Limit: 640000, // MFJ limit
    ...overrides,
  };
}

describe('computeQfafTestYear', () => {
  it('correctly calculates subscription size', () => {
    const input = createYearInput({ cashInfusion: 1000000, subscriptionPct: 0.8 });
    const result = computeQfafTestYear(input);

    expect(result.subscriptionSize).toBe(800000); // $1M × 80%
  });

  it('correctly calculates estimated ordinary loss', () => {
    const input = createYearInput({ cashInfusion: 1000000, subscriptionPct: 1.0, lossRate: 1.5 });
    const result = computeQfafTestYear(input);

    expect(result.estimatedOrdinaryLoss).toBe(1500000); // $1M × 150%
  });

  it('correctly applies §461(l) limit', () => {
    const input = createYearInput({
      cashInfusion: 1000000,
      lossRate: 1.5,
      section461Limit: 640000,
    });
    const result = computeQfafTestYear(input);

    // Loss is $1.5M but limit is $640K
    expect(result.estimatedOrdinaryLoss).toBe(1500000);
    expect(result.allowedLoss).toBe(640000);
    expect(result.carryForwardNext).toBe(860000); // $1.5M - $640K
  });

  it('correctly calculates tax savings', () => {
    const input = createYearInput({
      cashInfusion: 400000, // $400K → $600K loss (under limit)
      lossRate: 1.5,
      marginalTaxRate: 0.45,
      section461Limit: 640000,
    });
    const result = computeQfafTestYear(input);

    expect(result.allowedLoss).toBe(600000);
    expect(result.taxSavings).toBe(270000); // $600K × 45%
  });

  it('correctly calculates fees', () => {
    const input = createYearInput({
      cashInfusion: 1000000,
      subscriptionPct: 1.0,
      managementFeeRate: 0.01,
      qfafFeeRate: 0.015,
    });
    const result = computeQfafTestYear(input);

    expect(result.managementFee).toBe(10000); // $1M × 1%
    expect(result.qfafFee).toBe(15000); // $1M × 1.5%
    expect(result.totalFees).toBe(25000);
  });

  it('correctly calculates net savings', () => {
    const input = createYearInput({
      cashInfusion: 400000, // Under limit
      lossRate: 1.5,
      marginalTaxRate: 0.45,
      managementFeeRate: 0.01,
      qfafFeeRate: 0.015,
      section461Limit: 640000,
    });
    const result = computeQfafTestYear(input);

    const expectedTaxSavings = 600000 * 0.45; // $270K
    const expectedFees = 400000 * (0.01 + 0.015); // $10K
    expect(result.netSavingsNoAlpha).toBe(expectedTaxSavings - expectedFees);
  });

  it('applies prior carryforward to loss available', () => {
    const input = createYearInput({
      cashInfusion: 200000, // $300K new loss
      lossRate: 1.5,
      section461Limit: 640000,
    });
    const priorCarryForward = 400000;
    const result = computeQfafTestYear(input, priorCarryForward);

    expect(result.carryForwardPrior).toBe(400000);
    expect(result.lossAvailable).toBe(700000); // $300K new + $400K carry
    expect(result.allowedLoss).toBe(640000); // Capped at limit
    expect(result.carryForwardNext).toBe(60000); // $700K - $640K
  });
});

describe('computeQfafTestYears', () => {
  it('correctly rolls carryforward between years', () => {
    const inputs = [
      createYearInput({ year: 1, cashInfusion: 1000000, section461Limit: 640000 }), // $1.5M loss, $860K carry
      createYearInput({ year: 2, cashInfusion: 500000, section461Limit: 640000 }), // $750K + $860K = $1.61M, $970K carry
      createYearInput({ year: 3, cashInfusion: 0, section461Limit: 640000 }), // Only carry, $330K carry
    ];

    const results = computeQfafTestYears(inputs);

    // Year 1: $1.5M loss, $640K allowed, $860K carry
    expect(results[0].carryForwardPrior).toBe(0);
    expect(results[0].carryForwardNext).toBe(860000);

    // Year 2: $750K + $860K = $1.61M, $640K allowed, $970K carry
    expect(results[1].carryForwardPrior).toBe(860000);
    expect(results[1].lossAvailable).toBe(1610000);
    expect(results[1].carryForwardNext).toBe(970000);

    // Year 3: $0 + $970K = $970K, $640K allowed, $330K carry
    expect(results[2].carryForwardPrior).toBe(970000);
    expect(results[2].lossAvailable).toBe(970000);
    expect(results[2].carryForwardNext).toBe(330000);
  });

  it('respects initial carryforward parameter', () => {
    const inputs = [createYearInput({ year: 1, cashInfusion: 0, section461Limit: 640000 })];

    const results = computeQfafTestYears(inputs, 500000);

    expect(results[0].carryForwardPrior).toBe(500000);
    expect(results[0].allowedLoss).toBe(500000);
    expect(results[0].carryForwardNext).toBe(0);
  });

  it('handles empty input array', () => {
    const results = computeQfafTestYears([]);
    expect(results).toHaveLength(0);
  });
});

describe('computeQfafTestSummary', () => {
  it('correctly sums all fields', () => {
    const inputs = [
      createYearInput({ year: 1, cashInfusion: 1000000, section461Limit: 640000 }),
      createYearInput({ year: 2, cashInfusion: 500000, section461Limit: 640000 }),
    ];

    const results = computeQfafTestYears(inputs);
    const summary = computeQfafTestSummary(results);

    expect(summary.totalCashInfusion).toBe(1500000);
    expect(summary.totalSubscriptionSize).toBe(1500000);
    expect(summary.totalEstimatedOrdinaryLoss).toBe(2250000); // $1.5M + $750K
    expect(summary.totalAllowedLoss).toBe(1280000); // $640K × 2
    expect(summary.finalCarryForward).toBe(results[1].carryForwardNext);
  });

  it('handles empty results', () => {
    const summary = computeQfafTestSummary([]);

    expect(summary.totalCashInfusion).toBe(0);
    expect(summary.finalCarryForward).toBe(0);
  });
});

describe('createDefaultQfafTestInputs', () => {
  it('creates correct number of years', () => {
    const inputs = createDefaultQfafTestInputs(5);
    expect(inputs).toHaveLength(5);
  });

  it('sets correct year numbers', () => {
    const inputs = createDefaultQfafTestInputs(3, 'mfj', 1);
    expect(inputs[0].year).toBe(1);
    expect(inputs[1].year).toBe(2);
    expect(inputs[2].year).toBe(3);
  });

  it('sets correct §461(l) limit for filing status', () => {
    const mfjInputs = createDefaultQfafTestInputs(1, 'mfj');
    const singleInputs = createDefaultQfafTestInputs(1, 'single');

    expect(mfjInputs[0].section461Limit).toBe(640000);
    expect(singleInputs[0].section461Limit).toBe(320000);
  });

  it('allows custom start year', () => {
    const inputs = createDefaultQfafTestInputs(3, 'mfj', 2026);
    expect(inputs[0].year).toBe(2026);
    expect(inputs[1].year).toBe(2027);
    expect(inputs[2].year).toBe(2028);
  });
});

describe('updateQfafTestInput', () => {
  it('updates correct year and field', () => {
    const inputs = createDefaultQfafTestInputs(3);
    const updated = updateQfafTestInput(inputs, 2, 'cashInfusion', 500000);

    expect(updated[0].cashInfusion).toBe(0); // Year 1 unchanged
    expect(updated[1].cashInfusion).toBe(500000); // Year 2 updated
    expect(updated[2].cashInfusion).toBe(0); // Year 3 unchanged
  });

  it('returns new array (immutable)', () => {
    const inputs = createDefaultQfafTestInputs(3);
    const updated = updateQfafTestInput(inputs, 1, 'cashInfusion', 500000);

    expect(updated).not.toBe(inputs);
    expect(updated[0]).not.toBe(inputs[0]);
  });

  it('does not modify original array', () => {
    const inputs = createDefaultQfafTestInputs(3);
    updateQfafTestInput(inputs, 1, 'cashInfusion', 500000);

    expect(inputs[0].cashInfusion).toBe(0);
  });
});

describe('updateSection461LimitsForFilingStatus', () => {
  it('updates all years with new limit', () => {
    const inputs = createDefaultQfafTestInputs(3, 'mfj');
    const updated = updateSection461LimitsForFilingStatus(inputs, 'single');

    expect(updated[0].section461Limit).toBe(320000);
    expect(updated[1].section461Limit).toBe(320000);
    expect(updated[2].section461Limit).toBe(320000);
  });
});

describe('isEditableField', () => {
  it('returns true for valid editable fields', () => {
    expect(isEditableField('cashInfusion')).toBe(true);
    expect(isEditableField('subscriptionPct')).toBe(true);
    expect(isEditableField('lossRate')).toBe(true);
    expect(isEditableField('marginalTaxRate')).toBe(true);
    expect(isEditableField('managementFeeRate')).toBe(true);
    expect(isEditableField('qfafFeeRate')).toBe(true);
    expect(isEditableField('section461Limit')).toBe(true);
  });

  it('returns false for non-editable fields', () => {
    expect(isEditableField('year')).toBe(false);
    expect(isEditableField('subscriptionSize')).toBe(false);
    expect(isEditableField('allowedLoss')).toBe(false);
    expect(isEditableField('__proto__')).toBe(false);
    expect(isEditableField('constructor')).toBe(false);
  });
});

describe('edge cases', () => {
  it('handles zero cash infusion', () => {
    const input = createYearInput({ cashInfusion: 0 });
    const result = computeQfafTestYear(input);

    expect(result.subscriptionSize).toBe(0);
    expect(result.estimatedOrdinaryLoss).toBe(0);
    expect(result.taxSavings).toBe(0);
    expect(result.totalFees).toBe(0);
    expect(result.netSavingsNoAlpha).toBe(0);
  });

  it('handles zero subscription percentage', () => {
    const input = createYearInput({ cashInfusion: 1000000, subscriptionPct: 0 });
    const result = computeQfafTestYear(input);

    expect(result.subscriptionSize).toBe(0);
    expect(result.estimatedOrdinaryLoss).toBe(0);
  });

  it('handles very large carryforward exceeding limit', () => {
    const input = createYearInput({ cashInfusion: 0, section461Limit: 640000 });
    const result = computeQfafTestYear(input, 10000000); // $10M carryforward

    expect(result.allowedLoss).toBe(640000);
    expect(result.carryForwardNext).toBe(9360000);
  });

  it('handles loss exactly at limit', () => {
    // $426,666.67 × 150% = $640,000
    const input = createYearInput({
      cashInfusion: 426666.67,
      lossRate: 1.5,
      section461Limit: 640000,
    });
    const result = computeQfafTestYear(input);

    expect(result.estimatedOrdinaryLoss).toBeCloseTo(640000, 0);
    expect(result.carryForwardNext).toBeCloseTo(0, 0);
  });
});
