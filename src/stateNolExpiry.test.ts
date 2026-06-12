/**
 * D-020 — California state NOL 20-year expiration (R&TC §17276 + SB 167).
 *
 * The engine keeps a state NOL vintage ledger (CA only — gated on the
 * state profile's `nolCarryoverYears`): NOL generated in year Y becomes a
 * vintage, vintages are consumed FIFO when NOL is used, and each vintage
 * expires at the END of year `yearCreated + 20 (+1 per SB 167 suspension
 * year)`. Pre-existing NOL is vintage year 0 with carryover 20 + 3 (treated
 * as a pre-2024 loss suspended for all three SB 167 years). Only the STATE
 * rate component of NOL benefits is capped by unexpired vintages — federal
 * NOLs are indefinite and `nolCarryforward` is never reduced by expiry.
 */
import { describe, it, expect } from 'vitest';
import { calculate, calculateWithSensitivity } from './calculations';
import { CalculatorInputs, DEFAULT_SETTINGS, DEFAULT_SENSITIVITY } from './types';

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

describe('D-020 state NOL expiry — non-CA regression (ledger off)', () => {
  // Baseline values captured from the engine BEFORE the D-020 ledger was
  // added. Non-CA profiles define no `nolCarryoverYears`, so the ledger
  // never runs and results must be bit-identical to pre-D-020 behavior.
  it('NY results are unchanged (no state carryover limit)', () => {
    const result = calculate(
      createInputs({
        stateCode: 'NY',
        stateRate: 0.109,
        qfafEnabled: false,
        existingNolCarryforward: 6000000,
      })
    );
    expect(result.years.length).toBe(16);
    expect(result.summary.totalTaxSavings).toBe(2594591.9999999995);
    expect(result.years[0].nolUsageBenefit).toBe(170570.4);
    expect(result.years[5].nolUsageBenefit).toBe(170570.4);
    expect(result.years[result.years.length - 1].nolCarryforward).toBe(0);
    for (const y of result.years) expect(y.stateNolExpired).toBe(0);
    expect(result.summary.totalStateNolExpired).toBe(0);
  });

  it('PA results are unchanged (no state carryover limit)', () => {
    const result = calculate(
      createInputs({
        stateCode: 'PA',
        stateRate: 0.0307,
        existingNolCarryforward: 6000000,
        collateralAmount: 10000000,
        annualIncome: 2000000,
      })
    );
    expect(result.years.length).toBe(12);
    expect(result.summary.totalTaxSavings).toBe(3022050);
    expect(result.years[0].nolUsageBenefit).toBe(511488);
    expect(result.years[5].nolUsageBenefit).toBe(1103488);
    for (const y of result.years) expect(y.stateNolExpired).toBe(0);
    expect(result.summary.totalStateNolExpired).toBe(0);
  });
});

describe('D-020 state NOL expiry — CA', () => {
  it('NOL fully used within 20 years: nothing expires and savings are unchanged', () => {
    // Baseline captured pre-D-020: each vintage is consumed long before its
    // carryover period ends, so the state cap never binds.
    const result = calculate(
      createInputs({
        annualIncome: 3000000,
        collateralAmount: 10000000,
        existingNolCarryforward: 2000000,
      })
    );
    expect(result.years.length).toBe(12);
    expect(result.summary.totalTaxSavings).toBe(2708500.000000001);
    // Year 1 state NOL component suspended (SB 167, MAGI ≥ $1M); full after.
    expect(result.years[0].nolUsageBenefit).toBe(740000);
    expect(result.years[1].nolUsageBenefit).toBe(899364);
    for (const y of result.years) expect(y.stateNolExpired).toBe(0);
    expect(result.summary.totalStateNolExpired).toBe(0);
  });

  it('pre-existing NOL (vintage 0) expires at the end of year 23 (20 + 3); federal continues', () => {
    // $50M pre-existing NOL, $200K income, no QFAF → ~0.8 × $197K ≈ $157.6K
    // of NOL used per year. Vintage 0 (carryover 20+3) expires at the end of
    // year 23 with most of the balance unused.
    const result = calculate(
      createInputs({
        qfafEnabled: false,
        existingNolCarryforward: 50000000,
        annualIncome: 200000,
      }),
      { ...DEFAULT_SETTINGS, projectionYears: 30 }
    );
    const year23 = result.years[22];
    expect(year23.year).toBe(23);
    // Nothing expires before year 23
    for (const y of result.years.slice(0, 22)) expect(y.stateNolExpired).toBe(0);
    // Expired amount = $50M minus the ~23 years of FIFO consumption
    const usedThrough23 = result.years.slice(0, 23).reduce((s, y) => s + y.nolUsedThisYear, 0);
    expect(year23.stateNolExpired).toBeCloseTo(50000000 - usedThrough23, 4);
    expect(year23.stateNolExpired).toBeGreaterThan(40000000);
    expect(result.summary.totalStateNolExpired).toBeCloseTo(year23.stateNolExpired, 4);
    // FEDERAL NOL is untouched by the state expiry: the balance carries on
    // and keeps being deducted in year 24+.
    expect(year23.nolCarryforward).toBeCloseTo(50000000 - usedThrough23, 4);
    const year24 = result.years[23];
    expect(year24.nolUsedThisYear).toBeGreaterThan(100000);
    // State benefit drops once the state-side pool is gone: per-dollar NOL
    // value falls by the CA rate (13.3%) while the federal component stays.
    const perDollar22 = result.years[21].nolUsageBenefit / result.years[21].nolUsedThisYear;
    const perDollar24 = year24.nolUsageBenefit / year24.nolUsedThisYear;
    expect(perDollar22 - perDollar24).toBeCloseTo(0.133, 3);
  });

  it('consumes vintages FIFO: strategy-generated vintages outlive vintage 0', () => {
    // $500K pre-existing NOL (vintage 0, expires end of year 23) plus a large
    // year-1 QFAF vintage (expires end of year 21 — income < $1M, so no SB 167
    // suspension/extension). Slow usage (~$77.6K/yr) consumes vintage 0 first
    // (FIFO), so year 23 shows NO expiry while year 21 expires the remainder
    // of the year-1 vintage.
    const result = calculate(
      createInputs({
        annualIncome: 100000,
        collateralAmount: 10000000,
        existingNolCarryforward: 500000,
        qfafDuration: 1,
      }),
      { ...DEFAULT_SETTINGS, projectionYears: 30 }
    );
    const year21 = result.years[20];
    const year23 = result.years[22];
    expect(year21.year).toBe(21);
    expect(year23.year).toBe(23);
    // Year-1 vintage expires at the end of year 21 (1 + 20, no suspension)
    expect(year21.stateNolExpired).toBeGreaterThan(0);
    // Vintage 0 was consumed FIFO long before its year-23 deadline
    expect(year23.stateNolExpired).toBe(0);
    // Federal NOL persists past the state expiry and keeps being used
    expect(result.years[21].nolCarryforward).toBeGreaterThan(0);
    expect(result.years[21].nolUsedThisYear).toBeGreaterThan(0);
  });

  it('SB 167: a vintage suspended in year 1 gets +1 carryover year (expires end of year 22)', () => {
    // nolOffsetLimit 0 → no NOL is ever used, isolating pure expiry timing.
    // Income $3M ≥ $1M triggers the year-1 suspension, so the year-1 vintage
    // expires at the end of year 22 (1 + 20 + 1) instead of 21; the
    // pre-existing vintage 0 expires at the end of year 23 (20 + 3).
    const result = calculate(
      createInputs({
        annualIncome: 3000000,
        collateralAmount: 10000000,
        existingNolCarryforward: 1000000,
        qfafDuration: 1,
      }),
      { ...DEFAULT_SETTINGS, projectionYears: 30, nolOffsetLimit: 0 }
    );
    const year21 = result.years[20];
    const year22 = result.years[21];
    const year23 = result.years[22];
    expect(year21.stateNolExpired).toBe(0);
    expect(year22.stateNolExpired).toBeCloseTo(result.years[0].excessToNol, 4);
    expect(year23.stateNolExpired).toBeCloseTo(1000000, 4);
  });

  it('D-019 interaction: the stall guard still stops extension years; expiry does not break the loop', () => {
    // Zero income → the NOL can never be consumed, so the projection stops
    // at the standard horizon (stall guard) even though CA NOL would
    // eventually expire — expiry never extends or breaks the projection.
    const stalled = calculate(
      createInputs({
        qfafEnabled: false,
        existingNolCarryforward: 5000000,
        annualIncome: 0,
        ltGainsEnabled: false,
      })
    );
    expect(stalled.years.length).toBe(10);
    expect(stalled.summary.totalStateNolExpired).toBe(0);

    // Slow-burn case: extension years keep running on the FEDERAL balance
    // (which expiry never reduces) and stop at the 40-year hard cap, with
    // the state-side expiry reported along the way.
    const capped = calculate(
      createInputs({
        qfafEnabled: false,
        existingNolCarryforward: 50000000,
        annualIncome: 100000,
      })
    );
    expect(capped.years.length).toBe(40);
    expect(capped.years[39].nolCarryforward).toBeGreaterThan(0);
    expect(capped.years[22].stateNolExpired).toBeGreaterThan(40000000);
    for (const y of capped.years.slice(23)) {
      expect(y.stateNolExpired).toBe(0);
      expect(y.nolUsedThisYear).toBeGreaterThan(0);
    }
  });

  it('sensitivity engine mirrors the ledger (default sensitivity params)', () => {
    const inputs = createInputs({
      qfafEnabled: false,
      existingNolCarryforward: 50000000,
      annualIncome: 200000,
    });
    const settings = { ...DEFAULT_SETTINGS, projectionYears: 30 };
    const result = calculateWithSensitivity(inputs, settings, DEFAULT_SENSITIVITY);
    const year23 = result.years[22];
    expect(year23.year).toBe(23);
    for (const y of result.years.slice(0, 22)) expect(y.stateNolExpired).toBe(0);
    expect(year23.stateNolExpired).toBeGreaterThan(40000000);
    // Same drop in per-dollar NOL value after the state pool expires
    const perDollar22 = result.years[21].nolUsageBenefit / result.years[21].nolUsedThisYear;
    const perDollar24 = result.years[23].nolUsageBenefit / result.years[23].nolUsedThisYear;
    expect(perDollar22 - perDollar24).toBeCloseTo(0.133, 3);
  });
});
