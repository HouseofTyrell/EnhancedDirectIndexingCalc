# Dynamic QFAF Resizing Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a Fixed/Dynamic QFAF sizing toggle where Dynamic mode physically resizes QFAF each year to match decaying EDI losses, with ST gain leakage tracking.

**Architecture:** New `qfafSizingMode` field on `CalculatorInputs` controls behavior. In dynamic mode, the year loop in `core.ts` (and mirrors in `sensitivity.ts`, `overrides.ts`) recalculates needed QFAF each year using that year's ST loss rate. QFAF can only shrink (no new subscriptions). Redeemed capital exits as cash. Two new `YearResult` fields (`stGainLeakage`, `qfafCashReturned`) provide transparency. UI adds a two-button toggle in the QFAF Configuration section.

**Tech Stack:** React, TypeScript, Vitest

**Design doc:** `docs/plans/2026-02-19-dynamic-qfaf-resizing-design.md`

---

### Task 1: Add types, defaults, and update test fixtures

**Files:**
- Modify: `src/types.ts:11-42` (CalculatorInputs interface)
- Modify: `src/types.ts:64-111` (YearResult interface)
- Modify: `src/taxData.ts:258-269` (DEFAULTS)
- Modify: `src/calculations.test.ts:22-39` (createInputs helper)
- Modify: 5 other test files with base fixtures

**Step 1: Add `qfafSizingMode` to `CalculatorInputs` in `src/types.ts`**

After the `qfafDuration` field (line 41), add:

```typescript
  // QFAF sizing mode: 'fixed' = sized once at inception, 'dynamic' = resized each year to match EDI losses
  qfafSizingMode: 'fixed' | 'dynamic';
```

**Step 2: Add `stGainLeakage` and `qfafCashReturned` to `YearResult` in `src/types.ts`**

After `collateralTaxBenefit` (line 110), add:

```typescript
  // ST gain leakage: excess QFAF ST gains not offset by collateral ST losses (QFAF oversized)
  stGainLeakage: number;
  // Cash returned from QFAF resizing (dynamic mode only, 0 in fixed mode)
  qfafCashReturned: number;
```

**Step 3: Add default to `src/taxData.ts`**

After `qfafDuration: 5,` (line 268), add:

```typescript
  // QFAF sizing mode: dynamic resizes each year (recommended)
  qfafSizingMode: 'dynamic',
```

**Step 4: Update test fixture in `src/calculations.test.ts`**

In `createInputs()` (line 22-39), add after `qfafDuration: 10,`:

```typescript
    qfafSizingMode: 'fixed',
```

Use `'fixed'` in test fixtures to preserve all existing test behavior unchanged.

**Step 5: Update all other test fixture files**

Add `qfafSizingMode: 'fixed'` to the base input objects in:
- `src/__tests__/advancedSettings.test.ts`
- `src/__tests__/advancedFeatures.test.ts`
- `src/__tests__/scenarios.test.ts`
- `src/__tests__/sensitivityAnalysis.test.ts`
- `src/__tests__/yearOverrides.test.ts`

Search each file for the `createInputs` or base inputs object and add the field.

**Step 6: Run tests to verify no regressions**

Run: `npx vitest run`
Expected: All 164+ tests pass (TypeScript will complain about missing fields in `calculateYear` return — that's addressed in Task 2)

**Step 7: Commit**

```bash
git add src/types.ts src/taxData.ts src/calculations.test.ts src/__tests__/*.test.ts
git commit -m "feat: add qfafSizingMode type, stGainLeakage/qfafCashReturned YearResult fields"
```

---

### Task 2: Add stGainLeakage to calculateYear return + qfafCashReturned default

**Files:**
- Modify: `src/calculations/core.ts:143-335` (calculateYear function)
- Modify: `src/calculations.test.ts` (new tests)

**Step 1: Write failing tests in `src/calculations.test.ts`**

Add a new `describe` block after the existing `QFAF Duration` block:

```typescript
describe('ST Gain Leakage', () => {
  it('should report zero leakage when QFAF is properly sized (Year 1)', () => {
    // With Year-1-only sizing (qfafSizingYears=1), Year 1 should have near-zero leakage
    const inputs = createInputs({ qfafSizingYears: 1 });
    const result = calculate(inputs);
    // Year 1: ST gains ≈ ST losses, leakage ≈ 0
    expect(result.years[0].stGainLeakage).toBeCloseTo(0, -2); // within ~$100
  });

  it('should report positive leakage in later years with fixed sizing', () => {
    // Fixed mode: QFAF stays large while EDI losses decay
    const inputs = createInputs({ qfafSizingYears: 1, qfafSizingMode: 'fixed' });
    const result = calculate(inputs);
    // By Year 5, ST loss rate has decayed significantly but QFAF still generates at Year-1 rate
    // stGainLeakage = max(0, stGainsGenerated - stLossesHarvested)
    expect(result.years[4].stGainLeakage).toBeGreaterThan(0);
  });

  it('should default qfafCashReturned to 0 in fixed mode', () => {
    const inputs = createInputs({ qfafSizingMode: 'fixed' });
    const result = calculate(inputs);
    for (const year of result.years) {
      expect(year.qfafCashReturned).toBe(0);
    }
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/calculations.test.ts`
Expected: FAIL — `stGainLeakage` and `qfafCashReturned` not on YearResult

**Step 3: Add stGainLeakage and qfafCashReturned to calculateYear return**

In `src/calculations/core.ts`, in the `calculateYear` function:

After the `const taxSavings = ...` block (~line 240), add:

```typescript
  // ST gain leakage: excess QFAF ST gains not offset by collateral losses
  const stGainLeakage = Math.max(0, stGainsGenerated - stLossesHarvested);
```

In the return statement (~line 307), add after `collateralTaxBenefit,`:

```typescript
    stGainLeakage,
    qfafCashReturned: 0, // Set by the calling loop in dynamic mode
```

**Step 4: Update sensitivity.ts calculateYearWithSensitivity return**

In `src/calculations/sensitivity.ts`, in the `calculateYearWithSensitivity` function return (~line 346), add the same two fields:

```typescript
    stGainLeakage: Math.max(0, stGainsGenerated - stLossesHarvested),
    qfafCashReturned: 0,
```

**Step 5: Run tests to verify they pass**

Run: `npx vitest run`
Expected: All tests pass including the 3 new ones

**Step 6: Commit**

```bash
git add src/calculations/core.ts src/calculations/sensitivity.ts src/calculations.test.ts
git commit -m "feat: add stGainLeakage and qfafCashReturned to YearResult"
```

---

### Task 3: Implement dynamic QFAF resizing in core.ts

**Files:**
- Modify: `src/calculations/core.ts:55-141` (calculate function year loop)
- Modify: `src/calculations.test.ts` (new tests)

**Step 1: Write failing tests**

Add a new `describe` block in `src/calculations.test.ts`:

```typescript
describe('Dynamic QFAF Resizing', () => {
  it('should resize QFAF each year to match decaying ST losses', () => {
    const inputs = createInputs({
      qfafSizingMode: 'dynamic',
      qfafSizingYears: 1, // size based on Year 1 rate
      strategyId: 'overlay-45-45', // 16.5% → 10.5% → 9.0% → 6.0% → 4.5%
    });
    const result = calculate(inputs);

    // Year 1: QFAF should match Year-1 losses (full size)
    const y1StGains = result.years[0].stGainsGenerated;
    const y1StLosses = result.years[0].stLossesHarvested;
    expect(y1StGains).toBeCloseTo(y1StLosses, -2);

    // Year 5: QFAF should be smaller (matching Year-5 rate)
    // So ST gains should still approximately match ST losses
    const y5StGains = result.years[4].stGainsGenerated;
    const y5StLosses = result.years[4].stLossesHarvested;
    expect(y5StGains).toBeCloseTo(y5StLosses, -2);
    expect(y5StGains).toBeLessThan(y1StGains); // QFAF shrunk
  });

  it('should never increase QFAF beyond initial sizing', () => {
    const inputs = createInputs({
      qfafSizingMode: 'dynamic',
      qfafSizingYears: 10, // average-based sizing (smaller initial QFAF)
      strategyId: 'core-130-30',
    });
    const result = calculate(inputs);
    const initialQfaf = result.sizing.qfafValue;

    // No year should have QFAF ST gains implying a larger QFAF
    for (const year of result.years) {
      if (year.stGainsGenerated > 0) {
        // QFAF value = stGainsGenerated / multiplier
        const impliedQfaf = year.stGainsGenerated / 1.5;
        expect(impliedQfaf).toBeLessThanOrEqual(initialQfaf + 1); // +1 for rounding
      }
    }
  });

  it('should record cash returned when QFAF shrinks', () => {
    const inputs = createInputs({
      qfafSizingMode: 'dynamic',
      qfafSizingYears: 1,
      strategyId: 'overlay-45-45',
    });
    const result = calculate(inputs);

    // Year 1: no resize needed (matches initial sizing)
    expect(result.years[0].qfafCashReturned).toBeCloseTo(0, -2);

    // Year 2+: rates decay, so QFAF should shrink → cash returned > 0
    expect(result.years[1].qfafCashReturned).toBeGreaterThan(0);
  });

  it('should have near-zero ST gain leakage in dynamic mode', () => {
    const inputs = createInputs({
      qfafSizingMode: 'dynamic',
      qfafSizingYears: 1,
      strategyId: 'overlay-45-45',
    });
    const result = calculate(inputs);

    // In dynamic mode, every year's QFAF matches losses, so leakage ≈ 0
    for (const year of result.years) {
      if (year.stGainsGenerated > 0) {
        // Allow small tolerance for rounding
        expect(year.stGainLeakage).toBeLessThan(year.stGainsGenerated * 0.05);
      }
    }
  });

  it('should still respect duration cutoff in dynamic mode', () => {
    const inputs = createInputs({
      qfafSizingMode: 'dynamic',
      qfafDuration: 3,
    });
    const settings = { ...DEFAULT_SETTINGS, projectionYears: 6 };
    const result = calculate(inputs, settings);

    // Years 1-3: QFAF active (dynamic)
    expect(result.years[0].stGainsGenerated).toBeGreaterThan(0);
    expect(result.years[2].stGainsGenerated).toBeGreaterThan(0);

    // Year 4+: QFAF unwound
    expect(result.years[3].stGainsGenerated).toBe(0);
    expect(result.years[3].qfafCashReturned).toBe(0); // already unwound, nothing to return
  });

  it('fixed mode should behave identically to current behavior', () => {
    const inputsFixed = createInputs({ qfafSizingMode: 'fixed' });
    const inputsDefault = createInputs(); // fixture already sets 'fixed'

    const resultFixed = calculate(inputsFixed);
    const resultDefault = calculate(inputsDefault);

    // Every year should be identical
    for (let i = 0; i < resultFixed.years.length; i++) {
      expect(resultFixed.years[i].taxSavings).toBe(resultDefault.years[i].taxSavings);
      expect(resultFixed.years[i].stGainsGenerated).toBe(resultDefault.years[i].stGainsGenerated);
    }
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/calculations.test.ts -t "Dynamic QFAF"`
Expected: FAIL — dynamic mode not implemented yet

**Step 3: Implement dynamic resizing in core.ts calculate()**

In `src/calculations/core.ts`, in the `calculate()` function:

After line 94 (`let qfafValue = sizing.qfafValue;`), add:

```typescript
  const initialQfafValue = sizing.qfafValue;
  const qfafMultiplier = settings.qfafMultiplier ?? QFAF_ST_GAIN_RATE;
  const isDynamic = inputs.qfafSizingMode === 'dynamic' && inputs.qfafEnabled !== false;
```

Replace the existing year-loop body (lines 108-134) with:

```typescript
  for (let year = 1; year <= effectiveProjectionYears; year++) {
    // Zero out QFAF after duration expires (breakeven unwind)
    let effectiveQfafValue = (qfafDuration > 0 && year > qfafDuration) ? 0 : qfafValue;

    // Dynamic resizing: shrink QFAF to match this year's ST losses
    let cashReturned = 0;
    if (isDynamic && effectiveQfafValue > 0) {
      const yearStLossRate = getEffectiveStLossRate(inputs.strategyId, strategy.ltGainRate, year);
      const neededQfaf = collateralValue * yearStLossRate / QFAF_ST_GAIN_RATE * (1 - (inputs.qfafSizingCushion ?? 0));
      // Can only shrink, never grow beyond initial or current value
      const cappedQfaf = Math.min(effectiveQfafValue, neededQfaf, initialQfafValue);
      cashReturned = Math.max(0, effectiveQfafValue - cappedQfaf);
      effectiveQfafValue = cappedQfaf;
    }

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
      strategy
    );

    years.push({ ...result, qfafCashReturned: cashReturned });
    // Don't track QFAF growth after unwind
    qfafValue = (qfafDuration > 0 && year >= qfafDuration) ? 0 : result.qfafValue;
    collateralValue = result.collateralValue;
    stCarryforward = result.stLossCarryforward;
    ltCarryforward = result.ltLossCarryforward;
    nolCarryforward = result.nolCarryforward;
  }
```

Note the key addition: `{ ...result, qfafCashReturned: cashReturned }` overrides the default `0` from `calculateYear`.

You need to add the `getEffectiveStLossRate` import at the top of core.ts. It's already imported from `./helpers`.

**Step 4: Run tests**

Run: `npx vitest run`
Expected: All tests pass including the new Dynamic QFAF Resizing tests

**Step 5: Commit**

```bash
git add src/calculations/core.ts src/calculations.test.ts
git commit -m "feat: implement dynamic QFAF resizing in core calculation loop"
```

---

### Task 4: Mirror dynamic resizing in sensitivity.ts and overrides.ts

**Files:**
- Modify: `src/calculations/sensitivity.ts:117-189`
- Modify: `src/calculations/overrides.ts:53-149`

**Step 1: Add dynamic resizing to sensitivity.ts**

In `src/calculations/sensitivity.ts`, in the `calculateWithSensitivity()` function:

After `let nolCarryforward = ...` (line 123), add:

```typescript
  const initialQfafValue = sizing.qfafValue;
  const isDynamic = inputs.qfafSizingMode === 'dynamic' && inputs.qfafEnabled !== false;
```

Replace the year-loop body (lines 133-182) with the same pattern as core.ts, but using the sensitivity version of calculateYear. Note that `getEffectiveStLossRate` needs to be already imported (it is — line 22).

The key difference from core.ts: sensitivity.ts uses `calculateYearWithSensitivity` instead of `calculateYear`. Apply the same dynamic resizing logic BEFORE calling it:

```typescript
  for (let year = 1; year <= effectiveProjectionYears; year++) {
    let effectiveQfafValue = (qfafDuration > 0 && year > qfafDuration) ? 0 : qfafValue;

    // Dynamic resizing
    let cashReturned = 0;
    if (isDynamic && effectiveQfafValue > 0) {
      const yearStLossRate = getEffectiveStLossRate(inputs.strategyId, strategy.ltGainRate, year);
      const neededQfaf = collateralValue * yearStLossRate / QFAF_ST_GAIN_RATE * (1 - (inputs.qfafSizingCushion ?? 0));
      const cappedQfaf = Math.min(effectiveQfafValue, neededQfaf, initialQfafValue);
      cashReturned = Math.max(0, effectiveQfafValue - cappedQfaf);
      effectiveQfafValue = cappedQfaf;
    }

    // ... existing tax rate calculations for this year ...

    const result = calculateYearWithSensitivity(
      year,
      effectiveQfafValue,
      // ... rest of args unchanged ...
    );

    years.push({ ...result, qfafCashReturned: cashReturned });
    qfafValue = (qfafDuration > 0 && year >= qfafDuration) ? 0 : result.qfafValue;
    collateralValue = result.collateralValue;
    stCarryforward = result.stLossCarryforward;
    ltCarryforward = result.ltLossCarryforward;
    nolCarryforward = result.nolCarryforward;
  }
```

Note: In sensitivity.ts, `strategy` is the full `Strategy` object (from `getStrategy`), and `adjustedStrategy` is the `StrategyRates` with variance. Use the full `strategy` for `getEffectiveStLossRate` (it uses the strategyId, not the adjusted rates). The sensitivity variance is applied inside `calculateYearWithSensitivity`.

**Step 2: Add dynamic resizing to overrides.ts**

Same pattern. In `src/calculations/overrides.ts`:

After `let cumulativeInfusion = 0;` (line 62), add:

```typescript
  const initialQfafValue = baseSizing.qfafValue;
  const isDynamic = inputs.qfafSizingMode === 'dynamic' && inputs.qfafEnabled !== false;
```

In the year loop, add dynamic resizing AFTER the cash infusion logic and AFTER the duration cutoff:

```typescript
    // Zero out QFAF after duration expires (breakeven unwind)
    let effectiveQfafValue = (qfafDuration > 0 && year > qfafDuration) ? 0 : qfafValue;

    // Dynamic resizing
    let cashReturned = 0;
    if (isDynamic && effectiveQfafValue > 0) {
      const yearStLossRate = getEffectiveStLossRate(inputs.strategyId, strategy.ltGainRate, year);
      const neededQfaf = collateralValue * yearStLossRate / QFAF_ST_GAIN_RATE * (1 - (inputs.qfafSizingCushion ?? 0));
      const cappedQfaf = Math.min(effectiveQfafValue, neededQfaf, initialQfafValue);
      cashReturned = Math.max(0, effectiveQfafValue - cappedQfaf);
      effectiveQfafValue = cappedQfaf;
    }
```

Change `const effectiveQfafValue` to `let effectiveQfafValue` (it was const before).

Add `getEffectiveStLossRate` to the imports from `./helpers`.

Add `QFAF_ST_GAIN_RATE` to the imports from `../strategyData` (already imported in core.ts and sensitivity.ts, check if missing in overrides.ts).

Update `years.push(result)` to `years.push({ ...result, qfafCashReturned: cashReturned })`.

**Step 3: Run tests**

Run: `npx vitest run`
Expected: All tests pass

**Step 4: Commit**

```bash
git add src/calculations/sensitivity.ts src/calculations/overrides.ts
git commit -m "feat: mirror dynamic QFAF resizing in sensitivity and overrides paths"
```

---

### Task 5: UI toggle for Fixed/Dynamic mode

**Files:**
- Modify: `src/components/StrategySelectionInputs.tsx:406-623`
- Modify: `src/components/ScenarioComparisonPanel.tsx` (detectInputChanges)

**Step 1: Add the sizing mode toggle to StrategySelectionInputs**

In `src/components/StrategySelectionInputs.tsx`, inside the `qfaf-inputs-section` div, right after the `<h4>QFAF Configuration</h4>` header and InfoPopup (around line 428), add the toggle:

```tsx
            <div className="qfaf-sizing-mode-toggle">
              <label className="qfaf-sizing-mode-label">Sizing Mode</label>
              <div className="btn-group btn-group--compact" role="radiogroup" aria-label="QFAF sizing mode">
                <button
                  type="button"
                  role="radio"
                  aria-checked={inputs.qfafSizingMode === 'dynamic'}
                  className={`btn-group__btn${inputs.qfafSizingMode === 'dynamic' ? ' btn-group__btn--active' : ''}`}
                  onClick={() => onUpdateInput('qfafSizingMode', 'dynamic')}
                >
                  Dynamic
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={inputs.qfafSizingMode === 'fixed'}
                  className={`btn-group__btn${inputs.qfafSizingMode === 'fixed' ? ' btn-group__btn--active' : ''}`}
                  onClick={() => onUpdateInput('qfafSizingMode', 'fixed')}
                >
                  Fixed
                </button>
              </div>
              <span className="input-hint">
                {inputs.qfafSizingMode === 'dynamic'
                  ? 'QFAF resizes each year to match decaying EDI losses — reduces ST gain leakage'
                  : 'QFAF sized once at inception, held constant through duration'}
              </span>
            </div>
```

**Step 2: Add CSS for the toggle**

In `src/index.css`, add styles for the button group (find the existing QFAF configuration styles section):

```css
.qfaf-sizing-mode-toggle {
  margin-bottom: 0.75rem;
}

.qfaf-sizing-mode-label {
  display: block;
  font-weight: 600;
  font-size: 0.85rem;
  margin-bottom: 0.35rem;
  color: var(--text-primary, #1a1a1a);
}

.btn-group--compact {
  display: inline-flex;
  border: 1px solid var(--border-color, #d1d5db);
  border-radius: 6px;
  overflow: hidden;
}

.btn-group__btn {
  padding: 0.35rem 1rem;
  font-size: 0.82rem;
  font-weight: 500;
  border: none;
  background: var(--bg-secondary, #f9fafb);
  color: var(--text-secondary, #6b7280);
  cursor: pointer;
  transition: background-color 0.15s, color 0.15s;
}

.btn-group__btn:not(:last-child) {
  border-right: 1px solid var(--border-color, #d1d5db);
}

.btn-group__btn--active {
  background: var(--accent-bg, #3b82f6);
  color: white;
  font-weight: 600;
}

.btn-group__btn:hover:not(.btn-group__btn--active) {
  background: var(--bg-hover, #f3f4f6);
}
```

**Step 3: Add scenario comparison tracking**

In `src/components/ScenarioComparisonPanel.tsx`, in the `detectInputChanges` function, after the `qfafDuration` check, add:

```typescript
  if (pinned.qfafSizingMode !== current.qfafSizingMode) {
    changes.push({
      label: 'QFAF Sizing Mode',
      pinnedDisplay: pinned.qfafSizingMode === 'dynamic' ? 'Dynamic' : 'Fixed',
      currentDisplay: current.qfafSizingMode === 'dynamic' ? 'Dynamic' : 'Fixed',
    });
  }
```

**Step 4: Update the InfoPopup content**

In the InfoPopup in StrategySelectionInputs (~line 411-428), add a paragraph about sizing mode:

```tsx
                <p>
                  <strong>Sizing Mode:</strong> Dynamic (default) resizes QFAF each year to match
                  decaying EDI losses — minimizes ST gain leakage. Fixed holds QFAF constant
                  through the full duration.
                </p>
```

**Step 5: Run the dev server and verify visually**

Run: `npx vite --port 5173`
- Toggle should appear in QFAF Configuration section
- Dynamic should be selected by default
- Switching modes should update results immediately
- Pin a scenario, switch modes, verify comparison panel shows the change

**Step 6: Commit**

```bash
git add src/components/StrategySelectionInputs.tsx src/components/ScenarioComparisonPanel.tsx src/index.css
git commit -m "feat: add Fixed/Dynamic QFAF sizing mode toggle with scenario tracking"
```

---

### Task 6: Integration test — Dynamic vs Fixed comparison

**Files:**
- Modify: `src/calculations.test.ts`

**Step 1: Write integration test**

Add at the end of `src/calculations.test.ts`:

```typescript
describe('Dynamic vs Fixed QFAF Comparison', () => {
  it('dynamic mode should produce less cumulative ST gain leakage than fixed', () => {
    const baseInputs = {
      strategyId: 'overlay-45-45' as const,
      collateralAmount: 1000000,
      qfafSizingYears: 1,
      qfafDuration: 5,
    };

    const dynamicResult = calculate(createInputs({ ...baseInputs, qfafSizingMode: 'dynamic' }));
    const fixedResult = calculate(createInputs({ ...baseInputs, qfafSizingMode: 'fixed' }));

    const dynamicLeakage = dynamicResult.years.reduce((sum, y) => sum + y.stGainLeakage, 0);
    const fixedLeakage = fixedResult.years.reduce((sum, y) => sum + y.stGainLeakage, 0);

    // Dynamic should have significantly less leakage
    expect(dynamicLeakage).toBeLessThan(fixedLeakage);
  });

  it('dynamic mode should return cash from QFAF over time', () => {
    const inputs = createInputs({
      qfafSizingMode: 'dynamic',
      qfafSizingYears: 1,
      strategyId: 'overlay-45-45',
      qfafDuration: 5,
    });
    const result = calculate(inputs);

    // Total cash returned should be positive (QFAF shrinks over duration)
    const totalCashReturned = result.years.reduce((sum, y) => sum + y.qfafCashReturned, 0);
    expect(totalCashReturned).toBeGreaterThan(0);
  });

  it('dynamic mode should produce different total tax savings than fixed', () => {
    const baseInputs = {
      strategyId: 'overlay-45-45' as const,
      collateralAmount: 1000000,
      qfafSizingYears: 1,
      qfafDuration: 5,
    };

    const dynamicResult = calculate(createInputs({ ...baseInputs, qfafSizingMode: 'dynamic' }));
    const fixedResult = calculate(createInputs({ ...baseInputs, qfafSizingMode: 'fixed' }));

    // The two modes should produce meaningfully different total savings
    expect(dynamicResult.summary.totalTaxSavings).not.toBeCloseTo(
      fixedResult.summary.totalTaxSavings,
      -3 // differ by at least $1000
    );
  });
});
```

**Step 2: Run all tests**

Run: `npx vitest run`
Expected: All tests pass

**Step 3: Commit**

```bash
git add src/calculations.test.ts
git commit -m "test: add dynamic vs fixed QFAF comparison integration tests"
```

---

### CPA/PM Review Gate

After Task 6, dispatch CPA and Portfolio Manager review agents to validate:
- Dynamic mode correctly sizes QFAF to match year-specific ST loss rates
- Cash returned accounting is correct (no double-counting)
- ST gain leakage calculation matches economic reality
- Fixed mode is identical to pre-change behavior
- Duration + dynamic interaction is sound
