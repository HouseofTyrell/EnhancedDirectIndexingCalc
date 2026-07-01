/**
 * Deleveraging tests (D-016/D-017).
 *
 * The plan glides the extension book to a lower-leverage target: rates and
 * financing blend source→target (seasoned sampling — never restarted at
 * year 1), and unwinding realizes a pro-rata share of the embedded-gain pool
 * as an ENDOGENOUS strategy cost — netted WITH strategy flows and charged
 * against taxSavings, unlike D-012 gain events (event-LAST, never charged).
 */

import { describe, it, expect, afterEach } from 'vitest';
import { calculate, calculateWithOverrides } from './calculations';
import { computeExitTaxAnalysis } from './calculations/exitTax';
import {
  resolveDeleverageSchedule,
  resolveDeleveragePlan,
  getExtensionWeight,
  TRAD_DI_ST_LOSS_RATES,
  TRAD_DI_LT_GAIN_RATE,
  LONG_ONLY_TARGET,
} from './calculations/deleverage';
import { getFinancingCostForRatios, getEffectiveFinancingCost } from './calculations/financing';
import { exportInputsToCsv, parseInputsFromCsv } from './utils/csvScenario';
import { saveRateOverrides, clearRateOverrides } from './utils/strategyRates';
import { getStrategy } from './strategyData';
import { CalculatorInputs, DeleveragePlan, DEFAULT_SETTINGS } from './types';

const COMBINED_LT_RATE = 0.238 + 0.133; // 20% + 3.8% NIIT + 13.3% CA

// Core 145/45: long leverage 0.45, short 0.45, ltGainRate 0.029,
// ST loss rates [0.285, 0.165, 0.120, 0.070, 0.055, 0.045, ...]
const SRC_LONG = 0.45;
const GROSS_LONG = 1 + SRC_LONG;

function createInputs(overrides: Partial<CalculatorInputs> = {}): CalculatorInputs {
  return {
    filingStatus: 'mfj',
    stateCode: 'CA',
    stateRate: 0.133,
    annualIncome: 3000000,
    strategyId: 'core-145-45',
    collateralAmount: 10000000,
    existingStLossCarryforward: 0,
    existingLtLossCarryforward: 0,
    existingNolCarryforward: 0,
    qfafEnabled: false, // EDI-only unless a test opts in
    qfafSizingYears: 10,
    qfafSizingCushion: 0,
    qfafDuration: 10,
    qfafSizingMode: 'dynamic',
    startMonth: 1,
    ...overrides,
  };
}

function plan(overrides: Partial<DeleveragePlan> = {}): DeleveragePlan {
  return {
    enabled: true,
    startYear: 4,
    durationYears: 1,
    target: LONG_ONLY_TARGET,
    ...overrides,
  };
}

function splitInputs(
  overrides: Partial<CalculatorInputs> = {},
  split: Partial<CalculatorInputs['splitAllocation']> = {}
): CalculatorInputs {
  return createInputs({
    splitAllocation: {
      enabled: true,
      coreStrategyId: 'core-145-45',
      coreAmount: 5000000,
      overlayStrategyId: 'overlay-45-45',
      overlayAmount: 5000000,
      ...split,
    },
    ...overrides,
  });
}

afterEach(() => {
  clearRateOverrides();
});

describe('deleverage schedule resolution', () => {
  it('extension weight glides linearly from startYear over durationYears', () => {
    const p = { startYear: 4, durationYears: 4 };
    expect(getExtensionWeight(p, 3)).toBe(1);
    expect(getExtensionWeight(p, 4)).toBeCloseTo(0.75, 10);
    expect(getExtensionWeight(p, 6)).toBeCloseTo(0.25, 10);
    expect(getExtensionWeight(p, 7)).toBe(0);
    expect(getExtensionWeight(p, 20)).toBe(0);
    // All-at-once: 1 → 0 at startYear
    expect(getExtensionWeight({ startYear: 4, durationYears: 1 }, 4)).toBe(0);
  });

  it('returns null when disabled, malformed, or split allocation is enabled', () => {
    expect(resolveDeleveragePlan(createInputs())).toBeNull();
    expect(
      resolveDeleveragePlan(createInputs({ deleveragePlan: plan({ enabled: false }) }))
    ).toBeNull();
    expect(
      resolveDeleveragePlan(createInputs({ deleveragePlan: plan({ startYear: 0 }) }))
    ).toBeNull();
    expect(
      resolveDeleveragePlan(createInputs({ deleveragePlan: plan({ target: 'no-such-id' }) }))
    ).toBeNull();
    expect(
      resolveDeleveragePlan(
        createInputs({
          deleveragePlan: plan(),
          splitAllocation: {
            enabled: true,
            coreStrategyId: 'core-145-45',
            coreAmount: 5000000,
            overlayStrategyId: 'overlay-45-45',
            overlayAmount: 5000000,
          },
        })
      )
    ).toBeNull();
  });

  it('D-017 defaults: LT character once seasoned (startYear > 2), ST before; pro-rata haircut; 0% short cover', () => {
    const seasoned = resolveDeleveragePlan(
      createInputs({ deleveragePlan: plan({ startYear: 3 }) })
    );
    const early = resolveDeleveragePlan(createInputs({ deleveragePlan: plan({ startYear: 2 }) }));
    expect(seasoned?.unwindGainCharacter).toBe('lt');
    expect(early?.unwindGainCharacter).toBe('st');
    expect(seasoned?.lotSelectionHaircut).toBe(1.0);
    expect(seasoned?.shortCoverGainPct).toBe(0);
  });
});

describe('disabled plan parity (regression guard)', () => {
  it('a disabled plan is exactly the no-plan projection', () => {
    const a = calculate(createInputs(), DEFAULT_SETTINGS);
    const b = calculate(
      createInputs({ deleveragePlan: plan({ enabled: false }) }),
      DEFAULT_SETTINGS
    );
    expect(b.years.length).toBe(a.years.length);
    expect(b.summary.totalTaxSavings).toBeCloseTo(a.summary.totalTaxSavings, 6);
    for (let i = 0; i < a.years.length; i++) {
      expect(b.years[i].taxSavings).toBeCloseTo(a.years[i].taxSavings, 6);
      expect(b.years[i].collateralValue).toBeCloseTo(a.years[i].collateralValue, 6);
      expect(b.years[i].stLossCarryforward).toBeCloseTo(a.years[i].stLossCarryforward, 6);
      expect(b.years[i].effectiveStLossRate).toBeCloseTo(a.years[i].effectiveStLossRate, 10);
      expect(b.years[i].extensionFraction).toBe(1);
      expect(b.years[i].deleverageGainRealized).toBe(0);
      expect(b.years[i].deleverageTax).toBe(0);
      expect(b.years[i].financingSaved).toBe(0);
    }
  });

  it('an enabled plan is IGNORED when split allocation is on (v1 scope)', () => {
    const split = {
      enabled: true,
      coreStrategyId: 'core-145-45',
      coreAmount: 5000000,
      overlayStrategyId: 'overlay-45-45',
      overlayAmount: 5000000,
    };
    const a = calculate(createInputs({ splitAllocation: split }), DEFAULT_SETTINGS);
    const b = calculate(
      createInputs({ splitAllocation: split, deleveragePlan: plan() }),
      DEFAULT_SETTINGS
    );
    expect(b.summary.totalTaxSavings).toBeCloseTo(a.summary.totalTaxSavings, 6);
    expect(b.years.every(y => y.extensionFraction === 1)).toBe(true);
    expect(b.years.every(y => y.deleverageGainRealized === 0)).toBe(true);
  });
});

describe('all-at-once deleverage (duration 1)', () => {
  const inputs = createInputs({ deleveragePlan: plan({ startYear: 4, durationYears: 1 }) });
  const result = calculate(inputs, DEFAULT_SETTINGS);

  it('rates switch to the seasoned long-only schedule from the start year', () => {
    // Year 3: still the source schedule (Core 145/45 year 3 = 12.0%)
    expect(result.years[2].effectiveStLossRate).toBeCloseTo(0.12, 10);
    // Year 4+: traditional-DI rates sampled at the CURRENT year index — the
    // book is seasoned, not restarted (TRAD year 4 = 2.0%, NOT year 1 = 5.0%)
    expect(result.years[3].effectiveStLossRate).toBeCloseTo(TRAD_DI_ST_LOSS_RATES[3], 10);
    expect(result.years[4].effectiveStLossRate).toBeCloseTo(TRAD_DI_ST_LOSS_RATES[4], 10);
    // LT gain rate switches too (growth/fees off → collateral stays $10M)
    expect(result.years[3].ltGainsRealized).toBeCloseTo(10000000 * TRAD_DI_LT_GAIN_RATE, 2);
  });

  it('extensionFraction reports the glide weight: 1 before, 0 from the start year', () => {
    expect(result.years[2].extensionFraction).toBe(1);
    expect(result.years[3].extensionFraction).toBe(0);
    expect(result.years[9].extensionFraction).toBe(0);
  });

  it('unwind gain = haircut × pro-rata embedded gain on the extension sold', () => {
    // Embedded-gain pool at the start of year 4 (growth off, no pre-existing
    // gain): Σ years 1–3 (harvested ST losses − realized LT gains).
    const pool = result.years
      .slice(0, 3)
      .reduce((s, y) => s + y.stLossesHarvested - y.ltGainsRealized, 0);
    // Pro-rata: gain% of the LONG book (1.45 × NAV); extension sold = 0.45 × NAV.
    const expected = (pool / GROSS_LONG) * SRC_LONG;
    expect(result.years[3].deleverageGainRealized).toBeCloseTo(expected, 2);
    // Seasoned (startYear 4 > 2) → 100% LT character (D-017 default)
    expect(result.years[3].deleverageGainLt).toBeCloseTo(expected, 2);
    expect(result.years[3].deleverageGainSt).toBe(0);
    // No unwind gains in any other year
    expect(result.years[2].deleverageGainRealized).toBe(0);
    expect(result.years[4].deleverageGainRealized).toBe(0);
  });

  it('lotSelectionHaircut scales the unwind gain (HIFO discount knob)', () => {
    const discounted = calculate(
      createInputs({ deleveragePlan: plan({ lotSelectionHaircut: 0.5 }) }),
      DEFAULT_SETTINGS
    );
    expect(discounted.years[3].deleverageGainRealized).toBeCloseTo(
      result.years[3].deleverageGainRealized * 0.5,
      2
    );
  });

  it('shortCoverGainPct adds an ST gain on the covered short notional', () => {
    const withShortGain = calculate(
      createInputs({ deleveragePlan: plan({ shortCoverGainPct: 0.02 }) }),
      DEFAULT_SETTINGS
    );
    const expectedShortGain = 0.02 * 0.45 * 10000000; // pct × short covered × collateral
    expect(withShortGain.years[3].deleverageGainSt).toBeCloseTo(expectedShortGain, 2);
    expect(withShortGain.years[3].deleverageGainLt).toBeCloseTo(
      result.years[3].deleverageGainLt,
      2
    );
  });

  it('NAV is unchanged by the unwind: gross falls, collateral does not drop', () => {
    const noPlan = calculate(createInputs(), DEFAULT_SETTINGS);
    expect(result.years[3].collateralValue).toBeCloseTo(noPlan.years[3].collateralValue, 2);
  });
});

describe('glide path (duration > 1)', () => {
  it('Σ glide unwind gains ≈ all-at-once total (growth off)', () => {
    const allAtOnce = calculate(
      createInputs({ deleveragePlan: plan({ startYear: 5, durationYears: 1 }) }),
      DEFAULT_SETTINGS
    );
    const glide = calculate(
      createInputs({ deleveragePlan: plan({ startYear: 5, durationYears: 3 }) }),
      DEFAULT_SETTINGS
    );
    const totalAllAtOnce = allAtOnce.years.reduce((s, y) => s + y.deleverageGainRealized, 0);
    const totalGlide = glide.years.reduce((s, y) => s + y.deleverageGainRealized, 0);
    // First-order agreement. The glide runs slightly BELOW all-at-once:
    // earlier realizations deplete the embedded-gain pool, and continued
    // (blended-rate) harvesting only partially replenishes it.
    expect(totalGlide).toBeGreaterThanOrEqual(totalAllAtOnce * 0.85);
    expect(totalGlide).toBeLessThanOrEqual(totalAllAtOnce * 1.05);
  });

  it('extensionFraction steps down linearly across the glide', () => {
    const glide = calculate(
      createInputs({ deleveragePlan: plan({ startYear: 4, durationYears: 4 }) }),
      DEFAULT_SETTINGS
    );
    expect(glide.years[2].extensionFraction).toBe(1);
    expect(glide.years[3].extensionFraction).toBeCloseTo(0.75, 10);
    expect(glide.years[4].extensionFraction).toBeCloseTo(0.5, 10);
    expect(glide.years[5].extensionFraction).toBeCloseTo(0.25, 10);
    expect(glide.years[6].extensionFraction).toBe(0);
  });
});

describe('unwind tax attribution (endogenous, opposite of D-012)', () => {
  it('QFAF mode: unwind tax IS charged against taxSavings', () => {
    // With the QFAF on and sized to year-1 losses, its ST gains consume the
    // harvested losses each year, so no CF reserve shields the unwind — the
    // LT gain is taxable and the savings drop. (Sizing on the 10-year
    // average leaves early-year CFs that would shelter it.)
    const qfafInputs = createInputs({
      qfafEnabled: true,
      qfafSizingYears: 1,
      deleveragePlan: plan(),
    });
    const noPlan = calculate(
      createInputs({ qfafEnabled: true, qfafSizingYears: 1 }),
      DEFAULT_SETTINGS
    );
    const withPlan = calculate(qfafInputs, DEFAULT_SETTINGS);

    const y4 = withPlan.years[3];
    expect(y4.deleverageTax).toBeGreaterThan(0);
    // The unwind dollars flow through ltGainCost → taxSavings (no separate charge):
    // the savings identity must still hold exactly in the unwind year.
    expect(y4.taxSavings).toBeCloseTo(
      y4.ordinaryLossBenefit +
        y4.capitalLossBenefit +
        y4.nolUsageBenefit -
        y4.ltGainCost -
        y4.remainingStGainCost,
      4
    );
    expect(y4.ltGainCost).toBeGreaterThanOrEqual(y4.deleverageTax - 0.01);
    expect(withPlan.summary.totalTaxSavings).toBeLessThan(noPlan.summary.totalTaxSavings);
  });

  it('EDI-only: harvested losses + CFs absorb the unwind (deleverages tax-free)', () => {
    const result = calculate(createInputs({ deleveragePlan: plan() }), DEFAULT_SETTINGS);
    // The reserve dwarfs the unwind gain → fully sheltered, zero unwind tax.
    expect(result.years[3].deleverageGainRealized).toBeGreaterThan(0);
    expect(result.years[3].deleverageTax).toBeCloseTo(0, 2);
  });

  it('same-year D-012 gain event is still sheltered event-LAST (unwind nets first)', () => {
    const event = [
      {
        year: 3,
        w2Income: 3000000,
        cashInfusion: 0,
        cashInfusionTaxType: 'gross' as const,
        note: '',
        gainEvent: { amount: 10000000, character: 'lt' as const },
      },
    ];
    const withPlan = calculateWithOverrides(
      createInputs({ deleveragePlan: plan({ startYear: 3, durationYears: 1 }) }),
      DEFAULT_SETTINGS,
      event
    );
    const withoutPlan = calculateWithOverrides(createInputs(), DEFAULT_SETTINGS, event);

    const y3 = withPlan.years[2];
    // The strategy's own unwind gain claims the shelter FIRST and exits tax-free…
    expect(y3.deleverageGainRealized).toBeGreaterThan(0);
    expect(y3.deleverageTax).toBeCloseTo(0, 2);
    // …so the event gets LESS shelter than without the plan (event-LAST holds).
    expect(y3.gainEventCfShelter).toBeLessThan(withoutPlan.years[2].gainEventCfShelter);
    expect(y3.gainEventTax).toBeGreaterThan(withoutPlan.years[2].gainEventTax);
  });
});

describe('split allocation per-leg deleverage (D-028)', () => {
  it('a split with no per-leg plans is exactly the no-deleverage split', () => {
    const base = calculate(splitInputs(), DEFAULT_SETTINGS);
    const withTopLevel = calculate(splitInputs({ deleveragePlan: plan() }), DEFAULT_SETTINGS);
    // The top-level plan stays single-strategy-only — ignored in split mode.
    expect(withTopLevel.summary.totalTaxSavings).toBeCloseTo(base.summary.totalTaxSavings, 6);
    expect(withTopLevel.years.every(y => y.extensionFraction === 1)).toBe(true);
    expect(withTopLevel.years.every(y => y.deleverageGainRealized === 0)).toBe(true);
  });

  it('two identical legs each carrying the same plan == single-strategy deleverage', () => {
    // Both legs = core-145-45 at $5M each with the same all-at-once plan; the
    // blended book must match a single-strategy $10M deleverage of core-145-45.
    const single = calculate(
      createInputs({ deleveragePlan: plan({ startYear: 4, durationYears: 1 }) }),
      DEFAULT_SETTINGS
    );
    const p = plan({ startYear: 4, durationYears: 1 });
    const splitBoth = calculate(
      splitInputs(
        {},
        {
          coreStrategyId: 'core-145-45',
          overlayStrategyId: 'core-145-45',
          coreDeleverage: p,
          overlayDeleverage: p,
        }
      ),
      DEFAULT_SETTINGS
    );
    expect(splitBoth.years.length).toBe(single.years.length);
    for (let i = 0; i < single.years.length; i++) {
      expect(splitBoth.years[i].effectiveStLossRate).toBeCloseTo(
        single.years[i].effectiveStLossRate,
        10
      );
      expect(splitBoth.years[i].extensionFraction).toBeCloseTo(
        single.years[i].extensionFraction,
        10
      );
      expect(splitBoth.years[i].deleverageGainRealized).toBeCloseTo(
        single.years[i].deleverageGainRealized,
        2
      );
      expect(splitBoth.years[i].taxSavings).toBeCloseTo(single.years[i].taxSavings, 2);
    }
  });

  it('overlay-only plan delevers just that leg — extension % is collateral-weighted', () => {
    // 50/50 split, overlay glides all-at-once at year 4, core stays static.
    const result = calculate(
      splitInputs({}, { overlayDeleverage: plan({ startYear: 4, durationYears: 1 }) }),
      DEFAULT_SETTINGS
    );
    // Year 3: nothing unwound yet — fully extended.
    expect(result.years[2].extensionFraction).toBe(1);
    // Year 4: overlay (50% of collateral) drops to w=0, core stays w=1 →
    // collateral-weighted extension = 0.5.
    expect(result.years[3].extensionFraction).toBeCloseTo(0.5, 6);
    expect(result.years[3].deleverageGainRealized).toBeGreaterThan(0);
    // The core leg carries no plan, so it never adds unwind gains.
    const coreOnly = calculate(
      splitInputs({}, { coreDeleverage: plan({ startYear: 4, durationYears: 1 }) }),
      DEFAULT_SETTINGS
    );
    expect(coreOnly.years[3].extensionFraction).toBeCloseTo(0.5, 6);
  });

  it('both legs delever independently on their own schedules', () => {
    const result = calculate(
      splitInputs(
        {},
        {
          coreDeleverage: plan({ startYear: 4, durationYears: 1 }),
          overlayDeleverage: plan({ startYear: 6, durationYears: 1 }),
        }
      ),
      DEFAULT_SETTINGS
    );
    // Year 4: only the core leg (50%) unwinds → extension 0.5, gain realized.
    expect(result.years[3].extensionFraction).toBeCloseTo(0.5, 6);
    expect(result.years[3].deleverageGainRealized).toBeGreaterThan(0);
    // Year 6: the overlay leg unwinds → book fully delevered (both at w=0).
    expect(result.years[5].extensionFraction).toBeCloseTo(0, 6);
    expect(result.years[5].deleverageGainRealized).toBeGreaterThan(0);
  });

  it('per-leg pool: concentrated overlay basis raises the overlay unwind gain', () => {
    // Same overlay plan; with a low book cost basis the embedded gain is
    // assigned to the overlay leg, so its unwind realizes MORE than the
    // basis-equals-value case.
    const noBasis = calculate(
      splitInputs({}, { overlayDeleverage: plan({ startYear: 4, durationYears: 1 }) }),
      DEFAULT_SETTINGS
    );
    const lowBasis = calculate(
      splitInputs(
        { collateralCostBasis: 2000000 },
        { overlayDeleverage: plan({ startYear: 4, durationYears: 1 }) }
      ),
      DEFAULT_SETTINGS
    );
    expect(lowBasis.years[3].deleverageGainRealized).toBeGreaterThan(
      noBasis.years[3].deleverageGainRealized
    );
  });

  it('per-leg unwind attribution: core/overlay gains sum to the book gain', () => {
    const result = calculate(
      splitInputs(
        {},
        {
          coreDeleverage: plan({ startYear: 4, durationYears: 1 }),
          overlayDeleverage: plan({ startYear: 6, durationYears: 1 }),
        }
      ),
      DEFAULT_SETTINGS
    );
    for (const y of result.years) {
      // Fields are defined every year in split+deleverage mode.
      expect(y.coreDeleverageGain).toBeDefined();
      expect(y.overlayDeleverageGain).toBeDefined();
      expect((y.coreDeleverageGain ?? 0) + (y.overlayDeleverageGain ?? 0)).toBeCloseTo(
        y.deleverageGainRealized,
        4
      );
    }
    // Year 4: only the core leg unwinds → core gain > 0, overlay gain 0.
    expect(result.years[3].coreDeleverageGain).toBeGreaterThan(0);
    expect(result.years[3].overlayDeleverageGain).toBeCloseTo(0, 6);
    // Year 6: only the overlay leg unwinds → overlay gain > 0, core gain 0.
    expect(result.years[5].overlayDeleverageGain).toBeGreaterThan(0);
    expect(result.years[5].coreDeleverageGain).toBeCloseTo(0, 6);
  });

  it('per-leg attribution fields are undefined in single-strategy mode', () => {
    const single = calculate(
      createInputs({ deleveragePlan: plan({ startYear: 4, durationYears: 1 }) }),
      DEFAULT_SETTINGS
    );
    expect(single.years.every(y => y.coreDeleverageGain === undefined)).toBe(true);
    expect(single.years.every(y => y.overlayDeleverageGain === undefined)).toBe(true);
  });

  it('unwind tax is endogenous: the savings identity still holds (QFAF mode)', () => {
    const withPlan = calculate(
      splitInputs(
        { qfafEnabled: true, qfafSizingYears: 1 },
        { overlayDeleverage: plan({ startYear: 4, durationYears: 1 }) }
      ),
      DEFAULT_SETTINGS
    );
    const y4 = withPlan.years[3];
    expect(y4.deleverageGainRealized).toBeGreaterThan(0);
    expect(y4.taxSavings).toBeCloseTo(
      y4.ordinaryLossBenefit +
        y4.capitalLossBenefit +
        y4.nolUsageBenefit -
        y4.ltGainCost -
        y4.remainingStGainCost,
      4
    );
  });

  it('financing follows each leg glide (financingSaved accrues only with fees on)', () => {
    const feeSettings = {
      ...DEFAULT_SETTINGS,
      financingFeesEnabled: true,
      financingMode: 'simple' as const,
    };
    const result = calculate(
      splitInputs({}, { overlayDeleverage: plan({ startYear: 4, durationYears: 1 }) }),
      feeSettings
    );
    // Some financing is saved once the overlay delevers (year 4+).
    expect(result.years[3].financingSaved).toBeGreaterThan(0);
    // Gross (fees off) → no financing saved anywhere.
    const gross = calculate(
      splitInputs({}, { overlayDeleverage: plan({ startYear: 4, durationYears: 1 }) }),
      DEFAULT_SETTINGS
    );
    expect(gross.years.every(y => y.financingSaved === 0)).toBe(true);
  });
});

describe('exit-tax interaction (no double taxation)', () => {
  it('embedded gain at horizon is reduced exactly by realized unwind gains', () => {
    const result = calculate(createInputs({ deleveragePlan: plan() }), DEFAULT_SETTINGS);
    const analysis = computeExitTaxAnalysis(result, COMBINED_LT_RATE, 0);

    const rawReduction = result.years.reduce(
      (s, y) => s + y.stLossesHarvested - y.ltGainsRealized,
      0
    );
    const totalUnwind = result.years.reduce((s, y) => s + y.deleverageGainRealized, 0);
    expect(totalUnwind).toBeGreaterThan(0);
    expect(analysis.cumulativeBasisReduction).toBeCloseTo(rawReduction - totalUnwind, 2);
    // Growth off → embedded gain is entirely the (unwind-adjusted) basis reduction
    expect(analysis.embeddedGain).toBeCloseTo(Math.max(0, rawReduction - totalUnwind), 2);
  });
});

describe('financing interpolation', () => {
  const feeSettingsSimple = {
    ...DEFAULT_SETTINGS,
    financingFeesEnabled: true,
    financingMode: 'simple' as const,
  };
  const feeSettingsDetailed = {
    ...DEFAULT_SETTINGS,
    financingFeesEnabled: true,
    financingMode: 'detailed' as const,
  };
  // Glide: w = 1 (y1), 0.5 (y2), 0 (y3+)
  const glideInputs = createInputs({
    deleveragePlan: plan({ startYear: 2, durationYears: 2 }),
  });

  it('financingSaved matches ratio interpolation (simple mode)', () => {
    const result = calculate(glideInputs, feeSettingsSimple);
    const srcCost = getEffectiveFinancingCost(getStrategy('core-145-45')!, feeSettingsSimple);
    expect(srcCost).toBeCloseTo(getFinancingCostForRatios(0.45, 0.45, feeSettingsSimple), 10);

    // Year 2 (w = 0.5): blended book is half-way to long-only (0.225/0.225)
    const blendedY2 = getFinancingCostForRatios(0.225, 0.225, feeSettingsSimple);
    const startCollateralY2 = result.years[0].collateralValue;
    expect(result.years[1].financingSaved).toBeCloseTo(
      (srcCost - blendedY2) * startCollateralY2,
      2
    );
    // Year 3 (w = 0): fully long-only book (0/0)
    const blendedY3 = getFinancingCostForRatios(0, 0, feeSettingsSimple);
    const startCollateralY3 = result.years[1].collateralValue;
    expect(result.years[2].financingSaved).toBeCloseTo(
      (srcCost - blendedY3) * startCollateralY3,
      2
    );
    expect(result.years[0].financingSaved).toBeCloseTo(0, 6);
  });

  it('financingSaved matches ratio interpolation (detailed mode)', () => {
    const result = calculate(glideInputs, feeSettingsDetailed);
    const srcCost = getFinancingCostForRatios(0.45, 0.45, feeSettingsDetailed);
    const blendedY2 = getFinancingCostForRatios(0.225, 0.225, feeSettingsDetailed);
    expect(result.years[1].financingSaved).toBeCloseTo(
      (srcCost - blendedY2) * result.years[0].collateralValue,
      2
    );
  });

  it('financingSaved is 0 when financing fees are disabled', () => {
    const result = calculate(glideInputs, DEFAULT_SETTINGS);
    expect(result.years.every(y => y.financingSaved === 0)).toBe(true);
  });

  it('refactored getEffectiveFinancingCost delegates to the ratio core (parity)', () => {
    for (const id of ['core-130-30', 'core-225-125', 'overlay-45-45', 'overlay-125-125']) {
      const s = getStrategy(id)!;
      const expectShort = Number(s.name.match(/\d+\/(\d+)/)![1]) / 100;
      const expectLong =
        s.type === 'core'
          ? (Number(s.name.match(/(\d+)\//)![1]) - 100) / 100
          : Number(s.name.match(/(\d+)\//)![1]) / 100;
      expect(getEffectiveFinancingCost(s, feeSettingsDetailed)).toBeCloseTo(
        getFinancingCostForRatios(expectLong, expectShort, feeSettingsDetailed),
        12
      );
    }
  });
});

describe('QFAF interaction', () => {
  it('dynamic sizing self-corrects: QFAF shrinks once the book delevers', () => {
    const noPlan = calculate(createInputs({ qfafEnabled: true }), DEFAULT_SETTINGS);
    const withPlan = calculate(
      createInputs({ qfafEnabled: true, deleveragePlan: plan() }),
      DEFAULT_SETTINGS
    );
    // Year 4 harvest rate drops 7.0% → 2.0%, so the dynamic QFAF (and its ST
    // gains) shrink with it instead of leaking ST gains.
    expect(withPlan.years[3].stGainsGenerated).toBeLessThan(noPlan.years[3].stGainsGenerated * 0.5);
    expect(withPlan.years[3].stGainLeakage).toBeCloseTo(0, 0);
  });

  it('fixed sizing does NOT shrink — the ST gain leakage the UI warns about', () => {
    const fixed = calculate(
      createInputs({
        qfafEnabled: true,
        qfafSizingMode: 'fixed',
        deleveragePlan: plan(),
      }),
      DEFAULT_SETTINGS
    );
    expect(fixed.years[3].stGainLeakage).toBeGreaterThan(0);
  });
});

describe('CSV round-trip', () => {
  it('round-trips a full deleverage plan including the D-017 knobs', () => {
    const inputs = createInputs({
      deleveragePlan: plan({
        startYear: 5,
        durationYears: 3,
        target: 'core-130-30',
        unwindGainCharacter: 'st',
        lotSelectionHaircut: 0.85,
        shortCoverGainPct: 0.01,
      }),
    });
    const csv = exportInputsToCsv(inputs, DEFAULT_SETTINGS);
    const { inputs: parsed, warnings } = parseInputsFromCsv(csv);
    expect(warnings).toEqual([]);
    expect(parsed.deleveragePlan).toEqual(inputs.deleveragePlan);
  });

  it('round-trips per-leg split deleverage plans (D-028)', () => {
    const inputs = splitInputs(
      {},
      {
        coreDeleverage: plan({ startYear: 3, durationYears: 2, target: 'core-130-30' }),
        overlayDeleverage: plan({
          startYear: 6,
          durationYears: 1,
          target: LONG_ONLY_TARGET,
          lotSelectionHaircut: 0.8,
        }),
      }
    );
    const { inputs: parsed, warnings } = parseInputsFromCsv(
      exportInputsToCsv(inputs, DEFAULT_SETTINGS)
    );
    expect(warnings).toEqual([]);
    expect(parsed.splitAllocation?.coreDeleverage).toEqual(inputs.splitAllocation!.coreDeleverage);
    expect(parsed.splitAllocation?.overlayDeleverage).toEqual(
      inputs.splitAllocation!.overlayDeleverage
    );
  });

  it('round-trips a minimal plan (no optional knobs) and omits absent plans', () => {
    const inputs = createInputs({ deleveragePlan: plan() });
    const { inputs: parsed } = parseInputsFromCsv(exportInputsToCsv(inputs, DEFAULT_SETTINGS));
    expect(parsed.deleveragePlan).toEqual(plan());
    expect(parsed.deleveragePlan?.unwindGainCharacter).toBeUndefined();

    const none = parseInputsFromCsv(exportInputsToCsv(createInputs(), DEFAULT_SETTINGS));
    expect(none.inputs.deleveragePlan).toBeUndefined();
  });
});

describe('custom rate composition and seasoned sampling', () => {
  it('localStorage custom rates for the TARGET strategy still compose', () => {
    // Custom net capital loss rate for the target's year 4: effective ST loss
    // rate = net + target ltGainRate (0.10 + 0.024 for Core 130/30).
    saveRateOverrides({ 'core-130-30-4': 0.1 });
    const result = calculate(
      createInputs({ deleveragePlan: plan({ startYear: 4, target: 'core-130-30' }) }),
      DEFAULT_SETTINGS
    );
    expect(result.years[3].effectiveStLossRate).toBeCloseTo(0.1 + 0.024, 10);
  });

  it('strategy targets are sampled at the CURRENT year index, not restarted', () => {
    // Core 130/30 year 4 rate is 5.0% — year 1's 23.0% would be a restart.
    const result = calculate(
      createInputs({ deleveragePlan: plan({ startYear: 4, target: 'core-130-30' }) }),
      DEFAULT_SETTINGS
    );
    expect(result.years[3].effectiveStLossRate).toBeCloseTo(0.05, 10);
    expect(result.years[3].effectiveStLossRate).not.toBeCloseTo(0.23, 2);
  });

  it('long-only target samples the seasoned trad-DI schedule', () => {
    const result = calculate(
      createInputs({ deleveragePlan: plan({ startYear: 6, durationYears: 1 }) }),
      DEFAULT_SETTINGS
    );
    // TRAD year 6 = 1.5%, not the year-1 5.0% a restart would give.
    expect(result.years[5].effectiveStLossRate).toBeCloseTo(TRAD_DI_ST_LOSS_RATES[5], 10);
  });

  it('schedule blends rates by w during a glide', () => {
    const schedule = resolveDeleverageSchedule(
      createInputs({ deleveragePlan: plan({ startYear: 4, durationYears: 2 }) }),
      DEFAULT_SETTINGS,
      10
    )!;
    // Year 4: w = 0.5 → ½ source year-4 rate (7.0%) + ½ TRAD year-4 rate (2.0%)
    expect(schedule[3].w).toBeCloseTo(0.5, 10);
    expect(schedule[3].stLossRate).toBeCloseTo(0.5 * 0.07 + 0.5 * TRAD_DI_ST_LOSS_RATES[3], 10);
    expect(schedule[3].ltGainRate).toBeCloseTo(0.5 * 0.029 + 0.5 * TRAD_DI_LT_GAIN_RATE, 10);
  });
});
