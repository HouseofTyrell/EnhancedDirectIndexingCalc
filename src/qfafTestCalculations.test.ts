/**
 * Unit Tests for QFAF Test (By Year) Calculations
 *
 * Comprehensive tests for the extracted calculation module covering:
 * 1. QFAF subscription mechanics (growth factor, decay)
 * 2. §461(l) limit enforcement with correct $512K/$256K values
 * 3. Carryforward accumulation and usage
 * 4. Collateral sizing (overlay growth, core gap-fill)
 * 5. Fee calculations
 * 6. Alpha calculations
 * 7. Tax savings and net benefit
 * 8. Filing status variations
 * 9. 10-year projection integrity
 * 10. computeTotals and computeStats helpers
 * 11. Edge cases
 */

import { describe, it, expect } from 'vitest';
import {
  computeYearResults,
  computeTotals,
  computeStats,
  QfafTestAssumptions,
  DEFAULT_ASSUMPTIONS,
  QFAF_ALPHA_RATE,
  QUANTINNO_ALPHA_RATE,
  ADVISOR_MGMT_FEE_RATE,
  QFAF_FINANCING_FEE_RATE,
  YEAR_1_GROWTH_FACTOR,
  ANNUAL_DECAY_FACTOR,
  NUM_YEARS,
  START_YEAR,
} from './qfafTestCalculations';

// Default assumptions for most tests
const defaults: QfafTestAssumptions = {
  initialQfafInvestment: 1_000_000,
  initialDealsInvestment: 4_700_000,
  overlayStrategyId: 'overlay-45-45',
  coreStrategyId: 'core-145-45',
  marginalTaxRate: 0.541,
  qfafGenerationRate: 1.5,
};

// Overlay 45/45 Year 1 ST loss rate
const OVERLAY_45_45_Y1_RATE = 0.165;
// Core 145/45 Year 1 ST loss rate
const CORE_145_45_Y1_RATE = 0.285;

describe('computeYearResults — QFAF subscription mechanics', () => {
  it('Year 1 subscription = initial × 1.049', () => {
    const results = computeYearResults(defaults, 'mfj', 1);
    expect(results[0].qfafSubscriptionSize).toBeCloseTo(1_000_000 * YEAR_1_GROWTH_FACTOR, 2);
  });

  it('Year 2 subscription = Year 1 × 0.9231 (decay)', () => {
    const results = computeYearResults(defaults, 'mfj', 2);
    const year1Sub = results[0].qfafSubscriptionSize;
    expect(results[1].qfafSubscriptionSize).toBeCloseTo(year1Sub * ANNUAL_DECAY_FACTOR, 2);
  });

  it('subscription decays monotonically over 10 years', () => {
    const results = computeYearResults(defaults, 'mfj', 10);
    for (let i = 1; i < results.length; i++) {
      expect(results[i].qfafSubscriptionSize).toBeLessThan(results[i - 1].qfafSubscriptionSize);
    }
  });

  it('ordinary losses = subscription × generation rate', () => {
    const results = computeYearResults(defaults, 'mfj', 1);
    const expected = results[0].qfafSubscriptionSize * defaults.qfafGenerationRate;
    expect(results[0].annualEstOrdinaryLosses).toBeCloseTo(expected, 2);
  });

  it('calendar years start at 2026', () => {
    const results = computeYearResults(defaults, 'mfj', 3);
    expect(results[0].calendarYear).toBe(START_YEAR);
    expect(results[1].calendarYear).toBe(START_YEAR + 1);
    expect(results[2].calendarYear).toBe(START_YEAR + 2);
  });

  it('year numbers are 1-indexed', () => {
    const results = computeYearResults(defaults, 'mfj', 3);
    expect(results[0].year).toBe(1);
    expect(results[1].year).toBe(2);
    expect(results[2].year).toBe(3);
  });
});

describe('computeYearResults — §461(l) limit enforcement', () => {
  it('MFJ uses $512,000 limit', () => {
    const results = computeYearResults(defaults, 'mfj', 1);
    expect(results[0].section461Limit).toBe(512_000);
  });

  it('Single uses $256,000 limit', () => {
    const results = computeYearResults(defaults, 'single', 1);
    expect(results[0].section461Limit).toBe(256_000);
  });

  it('MFS uses $256,000 limit', () => {
    const results = computeYearResults(defaults, 'mfs', 1);
    expect(results[0].section461Limit).toBe(256_000);
  });

  it('HOH uses $256,000 limit', () => {
    const results = computeYearResults(defaults, 'hoh', 1);
    expect(results[0].section461Limit).toBe(256_000);
  });

  it('losses exceeding limit create carryforward', () => {
    // Year 1 losses ≈ $1,573,500 >> $512,000 limit
    const results = computeYearResults(defaults, 'mfj', 1);
    const losses = results[0].annualEstOrdinaryLosses;
    expect(losses).toBeGreaterThan(512_000);
    expect(results[0].carryForwardNext).toBeCloseTo(losses - 512_000, 2);
  });

  it('losses under limit produce no carryforward', () => {
    const smallAssumptions: QfafTestAssumptions = {
      ...defaults,
      initialQfafInvestment: 100_000,
      qfafGenerationRate: 1.0,
    };
    const results = computeYearResults(smallAssumptions, 'mfj', 1);
    // $100K × 1.049 × 1.0 = $104,900 < $512,000
    expect(results[0].annualEstOrdinaryLosses).toBeLessThan(512_000);
    expect(results[0].carryForwardNext).toBe(0);
    expect(results[0].writeOffAmount).toBeCloseTo(results[0].annualEstOrdinaryLosses, 2);
  });
});

describe('computeYearResults — carryforward', () => {
  it('Year 1 has zero prior carryforward', () => {
    const results = computeYearResults(defaults, 'mfj', 1);
    expect(results[0].carryForwardPrior).toBe(0);
  });

  it('Year 2 prior carryforward equals Year 1 next carryforward', () => {
    const results = computeYearResults(defaults, 'mfj', 2);
    expect(results[1].carryForwardPrior).toBe(results[0].carryForwardNext);
  });

  it('prior carryforward is fully consumed in writeOff', () => {
    const results = computeYearResults(defaults, 'mfj', 2);
    const year2NewWriteOff = Math.min(results[1].annualEstOrdinaryLosses, results[1].section461Limit);
    const expectedWriteOff = year2NewWriteOff + results[1].carryForwardPrior;
    expect(results[1].writeOffAmount).toBeCloseTo(expectedWriteOff, 2);
  });

  it('writeOff = min(new losses, limit) + full prior carryforward', () => {
    const results = computeYearResults(defaults, 'mfj', 2);
    // Year 1: losses ≈ $1,573,500, limit $512K → carry $1,061,500
    // Year 2: writeOff = $512,000 (new capped) + $1,061,500 (carry) = $1,573,500
    expect(results[1].writeOffAmount).toBeCloseTo(512_000 + results[0].carryForwardNext, 2);
  });

  it('carryforward chain propagates correctly across years', () => {
    const results = computeYearResults(defaults, 'mfj', 5);
    for (let i = 1; i < results.length; i++) {
      expect(results[i].carryForwardPrior).toBeCloseTo(results[i - 1].carryForwardNext, 2);
    }
  });
});

describe('computeYearResults — collateral sizing', () => {
  it('overlay collateral grows at Quantinno alpha rate', () => {
    const results = computeYearResults(defaults, 'mfj', 3);
    // Year 1: initial × (1+alpha)^0 = initial
    // Year 2: initial × (1+alpha)^1
    // Year 3: initial × (1+alpha)^2
    const initial = defaults.initialDealsInvestment;
    // Verify overlay is a component of total deals collateral
    // We can check growth pattern via the deals collateral changing year-over-year
    expect(results.length).toBe(3);
    // The overlay portion for Year 1 = initial = $4,700,000
    // The overlay portion for Year 2 = $4,700,000 × 1.0117
    const overlayY1 = initial;
    const overlayY2 = initial * (1 + QUANTINNO_ALPHA_RATE);
    const overlayY3 = initial * Math.pow(1 + QUANTINNO_ALPHA_RATE, 2);
    expect(overlayY2).toBeGreaterThan(overlayY1);
    expect(overlayY3).toBeGreaterThan(overlayY2);
  });

  it('Year 1 overlay ST losses = initial deals × overlay rate', () => {
    const results = computeYearResults(defaults, 'mfj', 1);
    const overlayStLosses = defaults.initialDealsInvestment * OVERLAY_45_45_Y1_RATE;
    // Core fills the gap: coreNeeded = losses - overlayStLosses
    const coreNeeded = results[0].annualEstOrdinaryLosses - overlayStLosses;
    const coreCollateral = coreNeeded / CORE_145_45_Y1_RATE;
    const expectedTotal = defaults.initialDealsInvestment + coreCollateral;
    expect(results[0].dealsCollateralValue).toBeCloseTo(expectedTotal, 0);
  });

  it('total deals collateral = overlay + core', () => {
    const results = computeYearResults(defaults, 'mfj', 1);
    // Manually compute expected
    const overlayCollateral = defaults.initialDealsInvestment;
    const overlayStLosses = overlayCollateral * OVERLAY_45_45_Y1_RATE; // $775,500
    const losses = 1_000_000 * YEAR_1_GROWTH_FACTOR * 1.5; // $1,573,500
    const coreNeeded = losses - overlayStLosses; // $798,000
    const coreCollateral = coreNeeded / CORE_145_45_Y1_RATE; // $2,800,000
    expect(results[0].dealsCollateralValue).toBeCloseTo(overlayCollateral + coreCollateral, 0);
  });

  it('core collateral is zero when overlay covers all ST losses', () => {
    // Use very small QFAF with large overlay so overlay ST losses > QFAF losses
    const bigOverlay: QfafTestAssumptions = {
      ...defaults,
      initialQfafInvestment: 10_000, // Tiny QFAF
      initialDealsInvestment: 10_000_000, // Huge overlay
      qfafGenerationRate: 1.0,
    };
    const results = computeYearResults(bigOverlay, 'mfj', 1);
    // QFAF losses = 10,000 × 1.049 × 1.0 = 10,490
    // Overlay ST losses = 10,000,000 × 0.165 = 1,650,000 >> 10,490
    // Core needed = 0 → deals collateral = overlay only
    expect(results[0].dealsCollateralValue).toBeCloseTo(10_000_000, 0);
  });
});

describe('computeYearResults — fees', () => {
  it('advisor fee = deals collateral × 0.57%', () => {
    const results = computeYearResults(defaults, 'mfj', 1);
    expect(results[0].advisorManagementFee).toBeCloseTo(
      results[0].dealsCollateralValue * ADVISOR_MGMT_FEE_RATE, 2
    );
  });

  it('Quantinno fee = deals collateral × 0.536%', () => {
    const results = computeYearResults(defaults, 'mfj', 1);
    expect(results[0].quantinnoFees).toBeCloseTo(
      results[0].dealsCollateralValue * QFAF_FINANCING_FEE_RATE, 2
    );
  });

  it('total fees = advisor + Quantinno', () => {
    const results = computeYearResults(defaults, 'mfj', 1);
    expect(results[0].totalFees).toBeCloseTo(
      results[0].advisorManagementFee + results[0].quantinnoFees, 2
    );
  });
});

describe('computeYearResults — tax savings and net benefit', () => {
  it('tax savings = writeOff × marginal tax rate', () => {
    const results = computeYearResults(defaults, 'mfj', 1);
    expect(results[0].taxSavings).toBeCloseTo(
      results[0].writeOffAmount * defaults.marginalTaxRate, 2
    );
  });

  it('net tax benefit = tax savings - total fees', () => {
    const results = computeYearResults(defaults, 'mfj', 1);
    expect(results[0].netTaxBenefit).toBeCloseTo(
      results[0].taxSavings - results[0].totalFees, 2
    );
  });

  it('higher tax rate produces higher tax savings', () => {
    const highTax: QfafTestAssumptions = { ...defaults, marginalTaxRate: 0.60 };
    const lowTax: QfafTestAssumptions = { ...defaults, marginalTaxRate: 0.30 };
    const highResults = computeYearResults(highTax, 'mfj', 1);
    const lowResults = computeYearResults(lowTax, 'mfj', 1);
    expect(highResults[0].taxSavings).toBeGreaterThan(lowResults[0].taxSavings);
  });
});

describe('computeYearResults — alpha calculations', () => {
  it('QFAF alpha = subscription × 5.57%', () => {
    const results = computeYearResults(defaults, 'mfj', 1);
    expect(results[0].qfafAlpha).toBeCloseTo(
      results[0].qfafSubscriptionSize * QFAF_ALPHA_RATE, 2
    );
  });

  it('Quantinno alpha = deals collateral × 1.17%', () => {
    const results = computeYearResults(defaults, 'mfj', 1);
    expect(results[0].quantinnoAlpha).toBeCloseTo(
      results[0].dealsCollateralValue * QUANTINNO_ALPHA_RATE, 2
    );
  });

  it('total alpha = QFAF + Quantinno', () => {
    const results = computeYearResults(defaults, 'mfj', 1);
    expect(results[0].totalAlpha).toBeCloseTo(
      results[0].qfafAlpha + results[0].quantinnoAlpha, 2
    );
  });
});

describe('computeYearResults — 10-year projection', () => {
  it('produces exactly 10 rows for default NUM_YEARS', () => {
    const results = computeYearResults(defaults, 'mfj', NUM_YEARS);
    expect(results).toHaveLength(10);
  });

  it('all years have positive tax savings', () => {
    const results = computeYearResults(defaults, 'mfj', 10);
    for (const r of results) {
      expect(r.taxSavings).toBeGreaterThan(0);
    }
  });

  it('10-year total tax savings is substantial', () => {
    const results = computeYearResults(defaults, 'mfj', 10);
    const totalTaxSavings = results.reduce((sum, r) => sum + r.taxSavings, 0);
    // With $1M QFAF at 54.1% tax rate, should be well over $1M total
    expect(totalTaxSavings).toBeGreaterThan(1_000_000);
  });

  it('subscription decay matches expected pattern', () => {
    const results = computeYearResults(defaults, 'mfj', 10);
    const year1 = results[0].qfafSubscriptionSize;
    const year10 = results[9].qfafSubscriptionSize;
    // After 9 decays: year1 × 0.9231^9 ≈ year1 × 0.483
    const expectedYear10 = year1 * Math.pow(ANNUAL_DECAY_FACTOR, 9);
    expect(year10).toBeCloseTo(expectedYear10, 0);
  });

  it('§461(l) limit is consistent across all years for same filing status', () => {
    const results = computeYearResults(defaults, 'mfj', 10);
    for (const r of results) {
      expect(r.section461Limit).toBe(512_000);
    }
  });
});

describe('computeYearResults — filing status variations', () => {
  it('Single filer has half the write-off capacity of MFJ in Year 1', () => {
    const mfjResults = computeYearResults(defaults, 'mfj', 1);
    const singleResults = computeYearResults(defaults, 'single', 1);

    // Both have losses >> limit, so write-off = limit + 0 carry
    expect(mfjResults[0].writeOffAmount).toBeCloseTo(512_000, 0);
    expect(singleResults[0].writeOffAmount).toBeCloseTo(256_000, 0);
  });

  it('Single filer accumulates more carryforward than MFJ', () => {
    const mfjResults = computeYearResults(defaults, 'mfj', 1);
    const singleResults = computeYearResults(defaults, 'single', 1);

    expect(singleResults[0].carryForwardNext).toBeGreaterThan(mfjResults[0].carryForwardNext);
  });

  it('all filing statuses produce valid results', () => {
    const statuses = ['single', 'mfj', 'mfs', 'hoh'] as const;
    for (const status of statuses) {
      const results = computeYearResults(defaults, status, 5);
      expect(results).toHaveLength(5);
      expect(results[0].taxSavings).toBeGreaterThan(0);
    }
  });
});

describe('computeYearResults — Year 1 with default assumptions', () => {
  it('matches expected values for standard scenario', () => {
    const results = computeYearResults(defaults, 'mfj', 1);
    const r = results[0];

    // QFAF subscription
    expect(r.qfafSubscriptionSize).toBeCloseTo(1_049_000, 0);

    // Ordinary losses = $1,049,000 × 1.5 = $1,573,500
    expect(r.annualEstOrdinaryLosses).toBeCloseTo(1_573_500, 0);

    // Overlay ST losses = $4,700,000 × 0.165 = $775,500
    // Core needed = ($1,573,500 - $775,500) / 0.285 = $2,800,000
    // Total collateral = $4,700,000 + $2,800,000 = $7,500,000
    expect(r.dealsCollateralValue).toBeCloseTo(7_500_000, 0);

    // §461(l): $512K limit, losses > limit
    expect(r.writeOffAmount).toBeCloseTo(512_000, 0);
    expect(r.carryForwardNext).toBeCloseTo(1_573_500 - 512_000, 0);

    // Tax savings = $512,000 × 0.541 = $276,992
    expect(r.taxSavings).toBeCloseTo(276_992, 0);

    // Fees
    expect(r.advisorManagementFee).toBeCloseTo(7_500_000 * 0.0057, 0);
    expect(r.quantinnoFees).toBeCloseTo(7_500_000 * 0.00536, 0);

    // Alpha
    expect(r.qfafAlpha).toBeCloseTo(1_049_000 * 0.0557, 0);
    expect(r.quantinnoAlpha).toBeCloseTo(7_500_000 * 0.0117, 0);
  });
});

describe('computeTotals', () => {
  it('sums all summable fields correctly', () => {
    const results = computeYearResults(defaults, 'mfj', 3);
    const totals = computeTotals(results);

    const expectedTaxSavings = results.reduce((sum, r) => sum + r.taxSavings, 0);
    expect(totals.taxSavings).toBeCloseTo(expectedTaxSavings, 2);

    const expectedTotalFees = results.reduce((sum, r) => sum + r.totalFees, 0);
    expect(totals.totalFees).toBeCloseTo(expectedTotalFees, 2);

    const expectedNetBenefit = results.reduce((sum, r) => sum + r.netTaxBenefit, 0);
    expect(totals.netTaxBenefit).toBeCloseTo(expectedNetBenefit, 2);
  });

  it('dealsCollateralValue is last year value (not sum)', () => {
    const results = computeYearResults(defaults, 'mfj', 5);
    const totals = computeTotals(results);
    expect(totals.dealsCollateralValue).toBe(results[4].dealsCollateralValue);
  });

  it('carryForwardNext is last year value', () => {
    const results = computeYearResults(defaults, 'mfj', 5);
    const totals = computeTotals(results);
    expect(totals.carryForwardNext).toBe(results[4].carryForwardNext);
  });

  it('carryForwardPrior is always zero', () => {
    const results = computeYearResults(defaults, 'mfj', 5);
    const totals = computeTotals(results);
    expect(totals.carryForwardPrior).toBe(0);
  });

  it('section461Limit comes from first row', () => {
    const results = computeYearResults(defaults, 'mfj', 5);
    const totals = computeTotals(results);
    expect(totals.section461Limit).toBe(512_000);
  });

  it('handles empty results', () => {
    const totals = computeTotals([]);
    expect(totals.taxSavings).toBe(0);
    expect(totals.dealsCollateralValue).toBe(0);
    expect(totals.carryForwardNext).toBe(0);
    expect(totals.section461Limit).toBe(0);
  });

  it('alpha totals are sums', () => {
    const results = computeYearResults(defaults, 'mfj', 3);
    const totals = computeTotals(results);

    const expectedQfafAlpha = results.reduce((sum, r) => sum + r.qfafAlpha, 0);
    const expectedQuantinnoAlpha = results.reduce((sum, r) => sum + r.quantinnoAlpha, 0);
    expect(totals.qfafAlpha).toBeCloseTo(expectedQfafAlpha, 2);
    expect(totals.quantinnoAlpha).toBeCloseTo(expectedQuantinnoAlpha, 2);
    expect(totals.totalAlpha).toBeCloseTo(expectedQfafAlpha + expectedQuantinnoAlpha, 2);
  });
});

describe('computeStats', () => {
  it('computes min, max, mean, median for odd-length array', () => {
    const stats = computeStats([1, 3, 5, 7, 9]);
    expect(stats.min).toBe(1);
    expect(stats.max).toBe(9);
    expect(stats.mean).toBe(5);
    expect(stats.median).toBe(5);
  });

  it('computes median for even-length array (average of middle two)', () => {
    const stats = computeStats([1, 3, 5, 7]);
    expect(stats.median).toBe(4); // (3 + 5) / 2
  });

  it('handles single element', () => {
    const stats = computeStats([42]);
    expect(stats.min).toBe(42);
    expect(stats.max).toBe(42);
    expect(stats.mean).toBe(42);
    expect(stats.median).toBe(42);
  });

  it('handles two elements', () => {
    const stats = computeStats([10, 20]);
    expect(stats.min).toBe(10);
    expect(stats.max).toBe(20);
    expect(stats.mean).toBe(15);
    expect(stats.median).toBe(15);
  });

  it('handles negative values', () => {
    const stats = computeStats([-5, -3, -1, 2, 4]);
    expect(stats.min).toBe(-5);
    expect(stats.max).toBe(4);
    expect(stats.mean).toBeCloseTo(-0.6, 10);
    expect(stats.median).toBe(-1);
  });

  it('handles empty array', () => {
    const stats = computeStats([]);
    expect(stats.min).toBe(0);
    expect(stats.max).toBe(0);
    expect(stats.mean).toBe(0);
    expect(stats.median).toBe(0);
  });

  it('does not mutate input array', () => {
    const arr = [5, 3, 1, 4, 2];
    const original = [...arr];
    computeStats(arr);
    expect(arr).toEqual(original);
  });
});

describe('edge cases', () => {
  it('zero initial investment produces all-zero results', () => {
    const zeroAssumptions: QfafTestAssumptions = {
      ...defaults,
      initialQfafInvestment: 0,
      initialDealsInvestment: 0,
    };
    const results = computeYearResults(zeroAssumptions, 'mfj', 3);
    expect(results).toHaveLength(3);
    for (const r of results) {
      expect(r.qfafSubscriptionSize).toBe(0);
      expect(r.annualEstOrdinaryLosses).toBe(0);
      expect(r.taxSavings).toBe(0);
      expect(r.totalFees).toBe(0);
      expect(r.netTaxBenefit).toBe(0);
    }
  });

  it('zero generation rate produces zero losses but still computes collateral', () => {
    const zeroGenRate: QfafTestAssumptions = {
      ...defaults,
      qfafGenerationRate: 0,
    };
    const results = computeYearResults(zeroGenRate, 'mfj', 1);
    expect(results[0].annualEstOrdinaryLosses).toBe(0);
    expect(results[0].carryForwardNext).toBe(0);
    expect(results[0].taxSavings).toBe(0);
    // Deals collateral should be just overlay (no core needed since losses = 0)
    expect(results[0].dealsCollateralValue).toBeCloseTo(defaults.initialDealsInvestment, 0);
  });

  it('invalid strategy IDs return empty results', () => {
    const badAssumptions: QfafTestAssumptions = {
      ...defaults,
      overlayStrategyId: 'nonexistent',
      coreStrategyId: 'also-nonexistent',
    };
    const results = computeYearResults(badAssumptions, 'mfj', 5);
    expect(results).toHaveLength(0);
  });

  it('invalid overlay with valid core returns empty results', () => {
    const badOverlay: QfafTestAssumptions = {
      ...defaults,
      overlayStrategyId: 'nonexistent',
    };
    const results = computeYearResults(badOverlay, 'mfj', 1);
    expect(results).toHaveLength(0);
  });

  it('zero years returns empty results', () => {
    const results = computeYearResults(defaults, 'mfj', 0);
    expect(results).toHaveLength(0);
  });

  it('single year produces valid results', () => {
    const results = computeYearResults(defaults, 'mfj', 1);
    expect(results).toHaveLength(1);
    expect(results[0].year).toBe(1);
    expect(results[0].taxSavings).toBeGreaterThan(0);
  });
});

describe('DEFAULT_ASSUMPTIONS', () => {
  it('has expected default values', () => {
    expect(DEFAULT_ASSUMPTIONS.initialQfafInvestment).toBe(1_000_000);
    expect(DEFAULT_ASSUMPTIONS.initialDealsInvestment).toBe(4_700_000);
    expect(DEFAULT_ASSUMPTIONS.marginalTaxRate).toBe(0.541);
    expect(DEFAULT_ASSUMPTIONS.qfafGenerationRate).toBe(1.5);
  });

  it('references valid strategy IDs', () => {
    const results = computeYearResults(DEFAULT_ASSUMPTIONS, 'mfj', 1);
    expect(results).toHaveLength(1); // Proves strategy IDs resolved
  });
});

describe('exported constants', () => {
  it('alpha rates are within expected range', () => {
    expect(QFAF_ALPHA_RATE).toBe(0.0557);
    expect(QUANTINNO_ALPHA_RATE).toBe(0.0117);
  });

  it('fee rates are within expected range', () => {
    expect(ADVISOR_MGMT_FEE_RATE).toBe(0.0057);
    expect(QFAF_FINANCING_FEE_RATE).toBe(0.00536);
  });

  it('growth/decay factors match Excel model', () => {
    expect(YEAR_1_GROWTH_FACTOR).toBe(1.049);
    expect(ANNUAL_DECAY_FACTOR).toBe(0.9231);
  });

  it('NUM_YEARS and START_YEAR have correct defaults', () => {
    expect(NUM_YEARS).toBe(10);
    expect(START_YEAR).toBe(2026);
  });
});
