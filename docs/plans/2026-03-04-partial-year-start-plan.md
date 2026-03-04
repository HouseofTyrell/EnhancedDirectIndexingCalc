# Partial Year Start — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow advisors to model strategy effectiveness when a client starts mid-year by pro-rating all Year 1 calculations by the fraction of the year remaining.

**Architecture:** Add `startMonth` (1–12) to `CalculatorInputs`. Compute `yearFraction = (13 - startMonth) / 12`. Pass `yearFraction` to `calculateYear()` as a new optional parameter (default `1.0`). All rate-driven Year 1 calculations are multiplied by this fraction. Year 2+ are unaffected.

**Tech Stack:** React, TypeScript, Vitest

---

### Task 1: Add `startMonth` to `CalculatorInputs` type and defaults

**Files:**
- Modify: `src/types.ts:11-45` (CalculatorInputs interface)
- Modify: `src/taxData.ts:242-272` (DEFAULTS)

**Step 1: Add `startMonth` field to `CalculatorInputs` interface**

In `src/types.ts`, add after the `qfafSizingMode` field (line 44):

```typescript
  // Partial year start: month the strategy begins (1=January=full year, 4=April=9 months)
  startMonth: number;
```

**Step 2: Add default value in `src/taxData.ts` DEFAULTS**

In `src/taxData.ts`, add after the `qfafSizingMode` line (around line 271):

```typescript
  // Start month: January by default (full year)
  startMonth: 1,
```

**Step 3: Run type checker to find any new compilation errors**

Run: `npx tsc --noEmit 2>&1 | head -30`
Expected: No new errors (startMonth has a default, existing createInputs helpers in tests will need updating in Task 3)

**Step 4: Commit**

```bash
git add src/types.ts src/taxData.ts
git commit -m "feat: add startMonth field to CalculatorInputs type and defaults"
```

---

### Task 2: Add `yearFraction` parameter to `calculateYear()` in core.ts

**Files:**
- Modify: `src/calculations/core.ts:156-169` (calculateYear signature)
- Modify: `src/calculations/core.ts:175-184` (rate calculations inside calculateYear)
- Modify: `src/calculations/core.ts:286-301` (growth calculations inside calculateYear)
- Modify: `src/calculations/core.ts:110` (calculate() loop — pass yearFraction for Year 1)

**Step 1: Add `yearFraction` parameter to `calculateYear()` signature**

In `src/calculations/core.ts`, update the `calculateYear` function signature (line 156-169) to add `yearFraction` after `fullStrategy`:

```typescript
export function calculateYear(
  year: number,
  qfafValue: number,
  collateralValue: number,
  stCarryforward: number,
  ltCarryforward: number,
  nolCarryforward: number,
  inputs: CalculatorInputs,
  strategy: StrategyRates,
  taxRates: TaxRates,
  settings: AdvancedSettings,
  yearIncome?: number,
  fullStrategy?: Strategy,
  yearFraction: number = 1.0,
): YearResult {
```

**Step 2: Apply `yearFraction` to all rate-driven calculations in `calculateYear()`**

Replace the rate calculation block (lines ~175-184) with yearFraction-scaled versions:

```typescript
  const qfafMultiplier = settings.qfafMultiplier ?? QFAF_ST_GAIN_RATE;
  const stGainsGenerated = safeNumber(qfafValue * qfafMultiplier * yearFraction);
  const ordinaryLossesGenerated = safeNumber(qfafValue * qfafMultiplier * yearFraction);

  const effectiveStLossRate = getEffectiveStLossRate(inputs.strategyId, strategy.ltGainRate, year);
  const grossStLosses = collateralValue * effectiveStLossRate * yearFraction;
  const stLossesHarvested = safeNumber(grossStLosses * (1 - settings.washSaleDisallowanceRate));
  const ltGainsRealized = safeNumber(collateralValue * strategy.ltGainRate * yearFraction);
```

**Step 3: Apply `yearFraction` to portfolio growth calculations**

Replace the growth calculation block (lines ~286-301):

```typescript
  const baseReturn = settings.growthEnabled ? settings.defaultAnnualReturn : 0;
  const strategyForFinancing = fullStrategy || getStrategy(inputs.strategyId);
  const totalFinancingCost = strategyForFinancing
    ? getEffectiveFinancingCost(strategyForFinancing, settings)
    : 0;
  const growthRate = baseReturn - totalFinancingCost;
  const qfafBaseReturn = settings.growthEnabled
    ? (settings.qfafAnnualReturn !== null ? settings.qfafAnnualReturn : settings.defaultAnnualReturn)
    : 0;
  const qfafGrowthRateWithFees = qfafBaseReturn - totalFinancingCost;
  const qfafGrowthRate = settings.qfafGrowthEnabled ? qfafGrowthRateWithFees : 0;
  const newQfafValue = safeNumber(qfafValue * (1 + qfafGrowthRate * yearFraction));
  const newCollateralValue = safeNumber(collateralValue * (1 + growthRate * yearFraction));
```

**Step 4: Pass `yearFraction` from `calculate()` loop for Year 1 only**

In the `calculate()` function (around line 110), compute yearFraction and pass it:

After `const effectiveProjectionYears = ...` (line 108), add:

```typescript
  const yearFraction = (13 - (inputs.startMonth ?? 1)) / 12;
```

Then update the `calculateYear` call (around line 125) to pass yearFraction:

```typescript
    const result = calculateYear(
      year,
      effectiveQfafValue,
      collateralValue,
      stCarryforward,
      ltCarryforward,
      nolCarryforward,
      inputs,
      strategy,
      taxRates,
      settings,
      undefined,
      strategy,
      year === 1 ? yearFraction : 1.0,
    );
```

**Step 5: Apply `yearFraction` to dynamic resizing in Year 1**

In the `calculate()` loop (around line 117-123), the dynamic QFAF resizing also needs pro-rating for Year 1:

```typescript
    if (isDynamic && effectiveQfafValue > 0) {
      const yearStLossRate = getEffectiveStLossRate(inputs.strategyId, strategy.ltGainRate, year);
      const effectiveYearFraction = year === 1 ? yearFraction : 1.0;
      const neededQfaf = collateralValue * yearStLossRate * effectiveYearFraction * (1 - settings.washSaleDisallowanceRate) / QFAF_ST_GAIN_RATE * (1 - (inputs.qfafSizingCushion ?? 0));
      const cappedQfaf = Math.min(effectiveQfafValue, neededQfaf, initialQfafValue);
      cashReturned = Math.max(0, effectiveQfafValue - cappedQfaf);
      effectiveQfafValue = cappedQfaf;
    }
```

**Step 6: Run type checker**

Run: `npx tsc --noEmit 2>&1 | head -30`
Expected: May show errors in test files missing `startMonth` — that's OK, fixed in Task 3.

**Step 7: Commit**

```bash
git add src/calculations/core.ts
git commit -m "feat: add yearFraction parameter to calculateYear for partial year support"
```

---

### Task 3: Write unit tests for partial year calculation

**Files:**
- Create: `src/partialYear.test.ts`

**Step 1: Write the test file**

```typescript
/**
 * Partial Year Start Tests
 *
 * Tests that starting mid-year correctly pro-rates Year 1 calculations
 * while leaving subsequent years unaffected.
 */
import { describe, it, expect } from 'vitest';
import { calculate } from './calculations';
import { CalculatorInputs, AdvancedSettings, DEFAULT_SETTINGS } from './types';

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

    it('should NOT affect Year 2 calculations', () => {
      const fullYear = calculate(createInputs({ startMonth: 1 }));
      const halfYear = calculate(createInputs({ startMonth: 7 }));

      // Year 2 ST losses should differ only because of Year 1 portfolio growth difference,
      // not because of pro-rating. With growth disabled (default), Year 2 should use full rates.
      // The collateral value entering Year 2 may differ due to partial Year 1 growth.
      // With growth disabled, collateral stays the same, so Year 2 rates are full.
      expect(halfYear.years[1].effectiveStLossRate).toBeCloseTo(
        fullYear.years[1].effectiveStLossRate, 6
      );
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

      // Tax savings should be roughly 75% of full year
      // Not exact because some benefits are nonlinear (carryforwards, 461(l) cap)
      const ratio = aprilStart.years[0].taxSavings / fullYear.years[0].taxSavings;
      expect(ratio).toBeGreaterThan(0.6);
      expect(ratio).toBeLessThan(0.9);
    });
  });

  describe('December start (1/12 = 8.33% of Year 1)', () => {
    it('should produce minimal Year 1 activity', () => {
      const decStart = calculate(createInputs({ startMonth: 12 }));

      // 1/12 of a year — very small numbers
      expect(decStart.years[0].stLossesHarvested).toBeGreaterThan(0);
      expect(decStart.years[0].stLossesHarvested).toBeLessThan(25000); // full year is ~230K
    });
  });

  describe('Section 461(l) limits remain annual', () => {
    it('should still use full annual 461(l) limit even for partial year', () => {
      // Use large collateral so ordinary losses would exceed limit
      const inputs = createInputs({
        startMonth: 7,
        collateralAmount: 10000000,
      });
      const result = calculate(inputs);

      // Even with half-year, the 461(l) limit is still $512K (MFJ)
      // But ordinary losses are halved, so they may be below the limit
      expect(result.years[0].usableOrdinaryLoss).toBeLessThanOrEqual(512000);
    });
  });

  describe('Portfolio growth with partial year', () => {
    it('should pro-rate Year 1 growth when growth is enabled', () => {
      const settings: AdvancedSettings = { ...DEFAULT_SETTINGS, growthEnabled: true, defaultAnnualReturn: 0.10 };

      const fullYear = calculate(createInputs({ startMonth: 1 }), settings);
      const halfYear = calculate(createInputs({ startMonth: 7 }), settings);

      // Full year: collateral * (1 + 0.10) = 1.10x
      // Half year: collateral * (1 + 0.10 * 0.5) = 1.05x
      // Year 1 ending collateral value should reflect partial growth
      const fullGrowth = fullYear.years[0].collateralValue / 1000000;
      const halfGrowth = halfYear.years[0].collateralValue / 1000000;

      expect(fullGrowth).toBeCloseTo(1.10, 1);
      expect(halfGrowth).toBeCloseTo(1.05, 1);
    });
  });
});
```

**Step 2: Run tests to verify they pass**

Run: `npx vitest run src/partialYear.test.ts`
Expected: All tests PASS

**Step 3: Commit**

```bash
git add src/partialYear.test.ts
git commit -m "test: add partial year start unit tests"
```

---

### Task 4: Apply yearFraction to sensitivity.ts path

**Files:**
- Modify: `src/calculations/sensitivity.ts:67-202` (calculateWithSensitivity loop)
- Modify: `src/calculations/sensitivity.ts:209-389` (calculateYearWithSensitivity)

**Step 1: Add `yearFraction` to `calculateWithSensitivity()` loop**

After the `effectiveProjectionYears` calculation (line ~133), add:

```typescript
  const yearFraction = (13 - (inputs.startMonth ?? 1)) / 12;
```

Update the dynamic resizing block in the loop (around line 141-148) to include yearFraction for Year 1:

```typescript
    if (isDynamic && effectiveQfafValue > 0) {
      const yearStLossRate = getEffectiveStLossRate(inputs.strategyId, strategy.ltGainRate, year);
      const effectiveYearFraction = year === 1 ? yearFraction : 1.0;
      const neededQfaf = collateralValue * yearStLossRate * effectiveYearFraction * (1 - settings.washSaleDisallowanceRate) / QFAF_ST_GAIN_RATE * (1 - (inputs.qfafSizingCushion ?? 0));
      const cappedQfaf = Math.min(effectiveQfafValue, neededQfaf, initialQfafValue);
      cashReturned = Math.max(0, effectiveQfafValue - cappedQfaf);
      effectiveQfafValue = cappedQfaf;
    }
```

Pass yearFraction to `calculateYearWithSensitivity` (around line 169-184):

Add `year === 1 ? yearFraction : 1.0` as the last argument to `calculateYearWithSensitivity()`.

**Step 2: Add `yearFraction` parameter to `calculateYearWithSensitivity()`**

Update signature (line ~209-224) to add `yearFraction: number = 1.0` as the last parameter:

```typescript
function calculateYearWithSensitivity(
  year: number,
  qfafValue: number,
  collateralValue: number,
  stCarryforward: number,
  ltCarryforward: number,
  nolCarryforward: number,
  inputs: CalculatorInputs,
  strategy: StrategyRates,
  taxRates: TaxRates,
  settings: AdvancedSettings,
  stLossVariance: number,
  ltGainVariance: number,
  scaledTrackingError: number,
  fullStrategy?: Strategy,
  yearFraction: number = 1.0,
): YearResult {
```

**Step 3: Apply yearFraction in `calculateYearWithSensitivity()` rate calculations**

Update QFAF generation (lines ~226-228):

```typescript
  const qfafMultiplier = settings.qfafMultiplier ?? QFAF_ST_GAIN_RATE;
  const stGainsGenerated = safeNumber(qfafValue * qfafMultiplier * yearFraction);
  const ordinaryLossesGenerated = safeNumber(qfafValue * qfafMultiplier * yearFraction);
```

Update collateral calculations (lines ~245-247):

```typescript
  const grossStLosses = collateralValue * adjustedStLossRate * yearFraction;
  const stLossesHarvested = safeNumber(grossStLosses * (1 - settings.washSaleDisallowanceRate));
  const ltGainsRealized = safeNumber(collateralValue * adjustedLtGainRate * yearFraction);
```

Update growth calculations (lines ~343-344):

```typescript
  const newQfafValue = safeNumber(qfafValue * (1 + qfafGrowthRate * yearFraction));
  const newCollateralValue = safeNumber(collateralValue * (1 + growthRate * yearFraction));
```

**Step 4: Run type checker and tests**

Run: `npx tsc --noEmit && npx vitest run src/sensitivityAnalysis.test.ts src/partialYear.test.ts`
Expected: All PASS

**Step 5: Commit**

```bash
git add src/calculations/sensitivity.ts
git commit -m "feat: apply yearFraction to sensitivity analysis path"
```

---

### Task 5: Apply yearFraction to overrides.ts path

**Files:**
- Modify: `src/calculations/overrides.ts:28-162` (calculateWithOverrides loop)

**Step 1: Add `yearFraction` and pass to `calculateYear()` call**

After the `effectiveProjectionYears` calculation (line ~72), add:

```typescript
  const yearFraction = (13 - (inputs.startMonth ?? 1)) / 12;
```

Update the dynamic resizing block (around line 99-106) to apply yearFraction for Year 1:

```typescript
    if (isDynamic && effectiveQfafValue > 0) {
      const yearStLossRate = getEffectiveStLossRate(inputs.strategyId, strategy.ltGainRate, year);
      const effectiveYearFraction = year === 1 ? yearFraction : 1.0;
      const neededQfaf = collateralValue * yearStLossRate * effectiveYearFraction * (1 - settings.washSaleDisallowanceRate) / QFAF_ST_GAIN_RATE * (1 - (inputs.qfafSizingCushion ?? 0));
      const cappedQfaf = Math.min(effectiveQfafValue, neededQfaf, initialQfafValue);
      cashReturned = Math.max(0, effectiveQfafValue - cappedQfaf);
      effectiveQfafValue = cappedQfaf;
    }
```

Update the `calculateYear` call (around line 119-131) to pass yearFraction:

```typescript
    const result = calculateYear(
      year,
      effectiveQfafValue,
      collateralValue,
      stCarryforward,
      ltCarryforward,
      nolCarryforward,
      inputs,
      strategy,
      yearTaxRates,
      settings,
      yearIncome,
      undefined,
      year === 1 ? yearFraction : 1.0,
    );
```

**Step 2: Run tests**

Run: `npx vitest run src/advancedFeatures.test.ts src/partialYear.test.ts`
Expected: All PASS

**Step 3: Commit**

```bash
git add src/calculations/overrides.ts
git commit -m "feat: apply yearFraction to year-by-year overrides path"
```

---

### Task 6: Add sensitivity test for partial year

**Files:**
- Modify: `src/partialYear.test.ts` (add sensitivity test section)

**Step 1: Add sensitivity path tests**

Append to `src/partialYear.test.ts`:

```typescript
import { calculateWithSensitivity } from './calculations';
import { SensitivityParams, DEFAULT_SENSITIVITY } from './types';

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

  it('should NOT pro-rate Year 2 in sensitivity analysis', () => {
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

    // Year 2 rates should be the same (both full year)
    expect(halfYear.years[1].effectiveStLossRate).toBeCloseTo(
      fullYear.years[1].effectiveStLossRate, 6
    );
  });
});
```

**Step 2: Update the import at the top of the file**

Add `calculateWithSensitivity` to the imports:

```typescript
import { calculate, calculateWithSensitivity } from './calculations';
import { CalculatorInputs, AdvancedSettings, DEFAULT_SETTINGS, SensitivityParams, DEFAULT_SENSITIVITY } from './types';
```

(Remove the duplicate imports added earlier — just merge into the existing import lines.)

**Step 3: Run tests**

Run: `npx vitest run src/partialYear.test.ts`
Expected: All PASS

**Step 4: Commit**

```bash
git add src/partialYear.test.ts
git commit -m "test: add sensitivity path tests for partial year start"
```

---

### Task 7: Add `startMonth` to existing test helpers

**Files:**
- Modify: `src/calculations.test.ts:22-40` (createInputs helper)
- Modify: `src/advancedSettings.test.ts:13-28` (baseClient)
- Modify: `src/scenarios.test.ts` (if it has its own createInputs)
- Modify: `src/sensitivityAnalysis.test.ts` (if it has its own createInputs)
- Modify: `src/advancedFeatures.test.ts` (if it has its own createInputs)

**Step 1: Add `startMonth: 1` to each test file's input helper**

For each test file that creates `CalculatorInputs`, add `startMonth: 1` to the defaults. Search for all `createInputs` or `baseClient` definitions:

In `src/calculations.test.ts` (around line 37):
```typescript
    qfafSizingMode: 'fixed',
    startMonth: 1,
    ...overrides,
```

In `src/advancedSettings.test.ts` (around line 27):
```typescript
  qfafSizingMode: 'fixed' as const,
  startMonth: 1,
```

Repeat for any other test files with inline `CalculatorInputs` objects. Search with:
`grep -rn "qfafSizingMode" src/*.test.ts` to find them all.

**Step 2: Run full test suite**

Run: `npx vitest run`
Expected: All 164+ tests PASS (no regressions)

**Step 3: Commit**

```bash
git add src/*.test.ts
git commit -m "test: add startMonth to existing test input helpers"
```

---

### Task 8: Add Start Month dropdown to StrategySelectionInputs UI

**Files:**
- Modify: `src/components/StrategySelectionInputs.tsx:40-88` (add dropdown after collateral amount)

**Step 1: Add the Start Month dropdown**

After the Collateral Amount `input-group` div (around line 87, just before the closing `</div>` of `input-pair`), add a new input group. Change the existing `input-pair` to `input-triple` (or add a new `input-pair` row after) with the month picker:

Add a new `input-pair` row after the existing strategy/collateral `input-pair` (after line 88):

```tsx
      <div className="input-pair">
        <div className="input-group">
          <label htmlFor="startMonth">Start Month</label>
          <select
            id="startMonth"
            value={inputs.startMonth}
            onChange={e => onUpdateInput('startMonth', parseInt(e.target.value, 10))}
          >
            {[
              { value: 1, label: 'January', months: 12 },
              { value: 2, label: 'February', months: 11 },
              { value: 3, label: 'March', months: 10 },
              { value: 4, label: 'April', months: 9 },
              { value: 5, label: 'May', months: 8 },
              { value: 6, label: 'June', months: 7 },
              { value: 7, label: 'July', months: 6 },
              { value: 8, label: 'August', months: 5 },
              { value: 9, label: 'September', months: 4 },
              { value: 10, label: 'October', months: 3 },
              { value: 11, label: 'November', months: 2 },
              { value: 12, label: 'December', months: 1 },
            ].map(m => (
              <option key={m.value} value={m.value}>
                {m.label} ({m.months} {m.months === 1 ? 'month' : 'months'})
              </option>
            ))}
          </select>
          <span className="input-hint">
            {inputs.startMonth === 1
              ? 'Full calendar year'
              : `Year 1 pro-rated to ${13 - inputs.startMonth} months`}
          </span>
        </div>
        <div className="input-group" /> {/* Spacer for pair layout */}
      </div>
```

**Step 2: Verify the app renders without errors**

Run: `npm run dev` (manual check in browser)
Expected: Start Month dropdown appears below the Strategy/Collateral row, defaults to "January (12 months)"

**Step 3: Commit**

```bash
git add src/components/StrategySelectionInputs.tsx
git commit -m "feat: add Start Month dropdown to strategy selection UI"
```

---

### Task 9: Add "Year 1 (X mo)" annotation to results display

**Files:**
- Modify: `src/WealthChart.tsx:29-37` (TaxSavingsChart year label)
- Modify: `src/WealthChart.tsx:112-118` (WealthProjectionChart year label)

**Step 1: Add `startMonth` prop to chart components**

Update `WealthChartProps` interface to accept `startMonth`:

```typescript
interface WealthChartProps {
  data: YearResult[];
  trackingError?: number;
  startMonth?: number;
}
```

**Step 2: Generate year label helper**

Add a helper function at the top of `src/WealthChart.tsx` (after imports):

```typescript
function getYearLabel(yearNum: number, startMonth?: number): string {
  if (yearNum === 1 && startMonth && startMonth > 1) {
    const months = 13 - startMonth;
    return `Year 1 (${months} mo)`;
  }
  return `Year ${yearNum}`;
}
```

**Step 3: Use the helper in chart data transformations**

In `TaxSavingsChart` (around line 32):
```typescript
        year: getYearLabel(year.year, startMonth),
```

In `WealthProjectionChart` (around line 115):
```typescript
          year: getYearLabel(year.year, startMonth),
```

**Step 4: Pass `startMonth` from ResultsChartsSection**

In `src/components/ResultsChartsSection.tsx`, add `startMonth` prop and pass it through to chart components. The `ResultsChartsSection` receives `inputs` or individual props — check how it currently receives data and thread `startMonth` through.

**Step 5: Commit**

```bash
git add src/WealthChart.tsx src/components/ResultsChartsSection.tsx
git commit -m "feat: annotate Year 1 label with partial month count in charts"
```

---

### Task 10: Thread `startMonth` through pinned scenarios

**Files:**
- Check: `src/hooks/usePinnedScenario.ts` — verify `inputs` is captured (it already captures full `CalculatorInputs`, so `startMonth` is included automatically)
- Check: `src/components/ScenarioComparisonPanel.tsx` — verify comparison displays work

**Step 1: Verify pinned scenario captures startMonth**

Read `src/hooks/usePinnedScenario.ts` and confirm the `pin()` function captures the full `inputs` object. Since `startMonth` is now part of `CalculatorInputs`, it should be captured automatically.

**Step 2: Add startMonth to the InputChange display in comparison**

If the comparison panel shows "changed inputs", verify `startMonth` appears when it differs between pinned and current. Check the `getInputChanges` function or equivalent in `ScenarioComparisonPanel.tsx`.

**Step 3: Run full test suite**

Run: `npx vitest run`
Expected: All tests PASS

**Step 4: Commit (if any changes needed)**

```bash
git add src/hooks/usePinnedScenario.ts src/components/ScenarioComparisonPanel.tsx
git commit -m "feat: include startMonth in pinned scenario tracking"
```

---

### Task 11: Run full test suite and verify no regressions

**Files:** None (verification only)

**Step 1: Run full test suite**

Run: `npx vitest run`
Expected: All tests PASS (164+ existing tests + new partial year tests)

**Step 2: Run type checker**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Manual verification**

Run: `npm run dev`

Verify in browser:
1. Default (January): No change to existing behavior
2. Select April: Year 1 values approximately 75% of January values
3. Select July: Year 1 values approximately 50%
4. Year 2+ values should be comparable regardless of start month
5. Charts show "Year 1 (9 mo)" for April start
6. Sensitivity analysis correctly pro-rates Year 1
