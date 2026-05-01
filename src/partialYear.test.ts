/**
 * Partial Year Start Tests
 *
 * Tests that starting mid-year correctly pro-rates Year 1 calculations
 * while leaving subsequent years unaffected.
 */
import { describe, it, expect } from 'vitest';
import { calculate, calculateWithSensitivity } from './calculations';
import { CalculatorInputs, AdvancedSettings, DEFAULT_SETTINGS, DEFAULT_SENSITIVITY } from './types';

function createInputs(overrides: Partial<CalculatorInputs> = {}): CalculatorInputs {
  return {
    filingStatus: 'mfj',
    stateCode: 'CA',
    stateRate: 0.133,
    annualIncome: 500000,
    strategyId: 'core-130-30',
    collateralAmount: 1000000,
    existingStLossCarryforward: 0,
    existingLtLossCarryforward: 0,
    existingNolCarryforward: 0,
    qfafEnabled: true,
    qfafSizingYears: 1,
    qfafSizingCushion: 0,
    qfafDuration: 10,
    qfafSizingMode: 'fixed',
    startMonth: 1,
    ...overrides,
  };
}

describe('Partial Year Start', () => {
  describe('January start (full year, backward compatible)', () => {
    it('should produce identical results to default when startMonth=1', () => {
      const janInputs = createInputs({ startMonth: 1 });
      const defaultInputs = createInputs();

      const janResult = calculate(janInputs);
      const defaultResult = calculate(defaultInputs);

      expect(janResult.years[0].taxSavings).toBeCloseTo(defaultResult.years[0].taxSavings, 2);
      expect(janResult.years[0].stLossesHarvested).toBeCloseTo(defaultResult.years[0].stLossesHarvested, 2);
      expect(janResult.years[0].ltGainsRealized).toBeCloseTo(defaultResult.years[0].ltGainsRealized, 2);
      expect(janResult.years[0].stGainsGenerated).toBeCloseTo(defaultResult.years[0].stGainsGenerated, 2);
      expect(janResult.years[0].ordinaryLossesGenerated).toBeCloseTo(defaultResult.years[0].ordinaryLossesGenerated, 2);
    });
  });

  describe('July start (6/12 = 50% of Year 1)', () => {
    it('should produce exactly 50% of Year 1 ST losses', () => {
      const fullYear = calculate(createInputs({ startMonth: 1 }));
      const halfYear = calculate(createInputs({ startMonth: 7 }));

      expect(halfYear.years[0].stLossesHarvested).toBeCloseTo(
        fullYear.years[0].stLossesHarvested * 0.5, 0
      );
    });

    it('should produce exactly 50% of Year 1 LT gains', () => {
      const fullYear = calculate(createInputs({ startMonth: 1 }));
      const halfYear = calculate(createInputs({ startMonth: 7 }));

      expect(halfYear.years[0].ltGainsRealized).toBeCloseTo(
        fullYear.years[0].ltGainsRealized * 0.5, 0
      );
    });

    it('should produce exactly 50% of Year 1 QFAF ST gains', () => {
      const fullYear = calculate(createInputs({ startMonth: 1 }));
      const halfYear = calculate(createInputs({ startMonth: 7 }));

      expect(halfYear.years[0].stGainsGenerated).toBeCloseTo(
        fullYear.years[0].stGainsGenerated * 0.5, 0
      );
    });

    it('should produce exactly 50% of Year 1 ordinary losses', () => {
      const fullYear = calculate(createInputs({ startMonth: 1 }));
      const halfYear = calculate(createInputs({ startMonth: 7 }));

      expect(halfYear.years[0].ordinaryLossesGenerated).toBeCloseTo(
        fullYear.years[0].ordinaryLossesGenerated * 0.5, 0
      );
    });

    it('blends Year 1 and Year 2 operating-year rates in calendar Year 2', () => {
      // Core-130-30 operating Y1 rate = 0.230, Y2 rate = 0.130.
      // For a July start (yf=0.5), calendar Y2 = (Y1 + Y2) × 0.5 = 0.180.
      // For a January start, calendar Y2 = Y2 rate = 0.130.
      const fullYear = calculate(createInputs({ startMonth: 1 }));
      const halfYear = calculate(createInputs({ startMonth: 7 }));

      expect(fullYear.years[1].effectiveStLossRate).toBeCloseTo(0.130, 3);
      expect(halfYear.years[1].effectiveStLossRate).toBeCloseTo(0.180, 3);
      expect(halfYear.years[1].effectiveStLossRate).toBeGreaterThan(
        fullYear.years[1].effectiveStLossRate
      );
    });

    it('extends strategy life by one calendar year for partial-year starts', () => {
      // qfafDuration=10, January start: strategy active in calendar Y1..Y10.
      // qfafDuration=10, July start: strategy active in calendar Y1..Y11
      // (with Y1 and Y11 each being 6 months of operation).
      const halfYear = calculate(createInputs({ startMonth: 7, qfafDuration: 10 }));
      // Calendar Y11 should still have nonzero strategy activity.
      expect(halfYear.years.length).toBeGreaterThanOrEqual(11);
      expect(halfYear.years[10].stLossesHarvested).toBeGreaterThan(0);
      // Calendar Y12+ is post-strategy wind-down (no new harvesting).
      if (halfYear.years[11]) {
        expect(halfYear.years[11].stLossesHarvested).toBe(0);
      }
    });

    it('conserves total ST losses across the strategy life regardless of start month', () => {
      // Sum of ST losses harvested across all calendar years should be
      // approximately equal regardless of start month (Y1 partial + extended
      // trailing year), since the strategy operates for `qfafDuration` years
      // either way. With growth disabled, totals match exactly.
      const settings: AdvancedSettings = { ...DEFAULT_SETTINGS, growthEnabled: false };
      const sumLosses = (r: ReturnType<typeof calculate>) =>
        r.years.reduce((s, y) => s + y.stLossesHarvested, 0);

      const jan = calculate(createInputs({ startMonth: 1, qfafSizingMode: 'fixed' }), settings);
      const apr = calculate(createInputs({ startMonth: 4, qfafSizingMode: 'fixed' }), settings);
      const jul = calculate(createInputs({ startMonth: 7, qfafSizingMode: 'fixed' }), settings);
      const oct = calculate(createInputs({ startMonth: 10, qfafSizingMode: 'fixed' }), settings);

      const janTotal = sumLosses(jan);
      // Within 0.5% across all start months
      expect(Math.abs(sumLosses(apr) - janTotal) / janTotal).toBeLessThan(0.005);
      expect(Math.abs(sumLosses(jul) - janTotal) / janTotal).toBeLessThan(0.005);
      expect(Math.abs(sumLosses(oct) - janTotal) / janTotal).toBeLessThan(0.005);
    });
  });

  describe('April start (9/12 = 75% of Year 1)', () => {
    it('should produce 75% of Year 1 ST losses', () => {
      const fullYear = calculate(createInputs({ startMonth: 1 }));
      const aprilStart = calculate(createInputs({ startMonth: 4 }));

      expect(aprilStart.years[0].stLossesHarvested).toBeCloseTo(
        fullYear.years[0].stLossesHarvested * 0.75, 0
      );
    });

    it('should produce 75% of Year 1 tax savings (approximately)', () => {
      const fullYear = calculate(createInputs({ startMonth: 1 }));
      const aprilStart = calculate(createInputs({ startMonth: 4 }));

      const ratio = aprilStart.years[0].taxSavings / fullYear.years[0].taxSavings;
      expect(ratio).toBeGreaterThan(0.6);
      expect(ratio).toBeLessThan(0.9);
    });
  });

  describe('December start (1/12 = 8.33% of Year 1)', () => {
    it('should produce minimal Year 1 activity', () => {
      const decStart = calculate(createInputs({ startMonth: 12 }));

      expect(decStart.years[0].stLossesHarvested).toBeGreaterThan(0);
      expect(decStart.years[0].stLossesHarvested).toBeLessThan(25000);
    });
  });

  describe('Section 461(l) limits remain annual', () => {
    it('should still use full annual 461(l) limit even for partial year', () => {
      const inputs = createInputs({
        startMonth: 7,
        collateralAmount: 10000000,
      });
      const result = calculate(inputs);

      expect(result.years[0].usableOrdinaryLoss).toBeLessThanOrEqual(512000);
    });
  });

  describe('Dynamic QFAF sizing with partial year', () => {
    it('should keep QFAF ST gains and collateral ST losses fully offsetting', () => {
      const halfYear = calculate(createInputs({ startMonth: 7, qfafSizingMode: 'dynamic' }));

      // Net ST position must be zero — any leakage means proration was applied
      // to one side but not the other.
      expect(halfYear.years[0].stGainsGenerated - halfYear.years[0].stLossesHarvested).toBeCloseTo(0, 0);
      expect(halfYear.years[0].stGainLeakage).toBeCloseTo(0, 0);
    });

    it('should produce exactly 50% of Year 1 QFAF ST gains (dynamic mode)', () => {
      const fullYear = calculate(createInputs({ startMonth: 1, qfafSizingMode: 'dynamic' }));
      const halfYear = calculate(createInputs({ startMonth: 7, qfafSizingMode: 'dynamic' }));

      expect(halfYear.years[0].stGainsGenerated).toBeCloseTo(
        fullYear.years[0].stGainsGenerated * 0.5, 0
      );
    });

    it('should produce exactly 50% of Year 1 tax savings (dynamic mode)', () => {
      const fullYear = calculate(createInputs({ startMonth: 1, qfafSizingMode: 'dynamic' }));
      const halfYear = calculate(createInputs({ startMonth: 7, qfafSizingMode: 'dynamic' }));

      expect(halfYear.years[0].taxSavings).toBeCloseTo(
        fullYear.years[0].taxSavings * 0.5, 0
      );
    });
  });

  describe('Portfolio growth with partial year', () => {
    it('should pro-rate Year 1 growth when growth is enabled', () => {
      const settings: AdvancedSettings = { ...DEFAULT_SETTINGS, growthEnabled: true, defaultAnnualReturn: 0.10 };

      const fullYear = calculate(createInputs({ startMonth: 1 }), settings);
      const halfYear = calculate(createInputs({ startMonth: 7 }), settings);

      const fullGrowth = fullYear.years[0].collateralValue / 1000000;
      const halfGrowth = halfYear.years[0].collateralValue / 1000000;

      expect(fullGrowth).toBeCloseTo(1.10, 1);
      expect(halfGrowth).toBeCloseTo(1.05, 1);
    });
  });
});

describe('Partial Year Start — Sensitivity Path', () => {
  it('should pro-rate Year 1 in sensitivity analysis', () => {
    const fullYear = calculateWithSensitivity(
      createInputs({ startMonth: 1 }),
      DEFAULT_SETTINGS,
      DEFAULT_SENSITIVITY,
    );
    const halfYear = calculateWithSensitivity(
      createInputs({ startMonth: 7 }),
      DEFAULT_SETTINGS,
      DEFAULT_SENSITIVITY,
    );

    expect(halfYear.years[0].stLossesHarvested).toBeCloseTo(
      fullYear.years[0].stLossesHarvested * 0.5, 0
    );
  });

  it('blends operating-year rates in calendar Year 2 for sensitivity analysis', () => {
    // Same as the base path: calendar Y2 of a July start blends operating
    // years 1 and 2, so its effective ST loss rate is higher than a Jan start.
    const fullYear = calculateWithSensitivity(
      createInputs({ startMonth: 1 }),
      DEFAULT_SETTINGS,
      DEFAULT_SENSITIVITY,
    );
    const halfYear = calculateWithSensitivity(
      createInputs({ startMonth: 7 }),
      DEFAULT_SETTINGS,
      DEFAULT_SENSITIVITY,
    );

    expect(halfYear.years[1].effectiveStLossRate).toBeGreaterThan(
      fullYear.years[1].effectiveStLossRate
    );
  });
});
