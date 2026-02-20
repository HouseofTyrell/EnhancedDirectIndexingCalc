# QFAF Duration & Cushion Restoration — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a QFAF duration slider (1–10 years, default 5) that stops QFAF contributions after year N, auto-extends projection to show the EDI-only tail, and restore the accidentally removed QFAF cushion slider.

**Architecture:** QFAF duration is a new field on `CalculatorInputs`. The calculation engine zeros out `qfafValue` after the duration year. Sizing window auto-caps to duration. Cushion UI was lost during Sprint 2 refactoring — the backend logic in `sizing.ts` already works, so this is purely a UI restoration. All changes are additive; no existing calculation logic is modified.

**Tech Stack:** React 18, TypeScript, Vitest

**Design doc:** `docs/plans/2026-02-19-qfaf-duration-cushion-design.md`

---

### Task 1: Add `qfafDuration` to types and defaults

**Files:**
- Modify: `src/types.ts:38` (add field after `qfafSizingCushion`)
- Modify: `src/taxData.ts:265` (add default after `qfafSizingCushion`)

**Step 1: Add the type field**

In `src/types.ts`, after the `qfafSizingCushion` line (line 38), add:

```typescript
  // QFAF duration: years QFAF runs before breakeven unwind (1–10, default 5)
  qfafDuration: number;
```

**Step 2: Add the default value**

In `src/taxData.ts`, after the `qfafSizingCushion: 0,` line, add:

```typescript
  // QFAF duration: 5 years default
  qfafDuration: 5,
```

**Step 3: Add `qfafDuration` to all test fixtures**

Every test file with a `CalculatorInputs` fixture needs `qfafDuration: 10` (use 10 to match existing projection period so current test assertions remain valid):

- `src/calculations.test.ts` — `makeInputs()` helper (line ~35, after `qfafSizingCushion: 0,`)
- `src/advancedFeatures.test.ts` — `baseInputs` (line ~25, after `qfafSizingCushion: 0,`)
- `src/advancedSettings.test.ts` — `baseInputs` (line ~25, after `qfafSizingCushion: 0,`)
- `src/sensitivityAnalysis.test.ts` — `baseInputs` (line ~32, after `qfafSizingCushion: 0,`)
- `src/scenarios.test.ts` — `baseInputs` (line ~24, after `qfafSizingCushion: 0,`)
- Also check `src/advancedFeatures.test.ts` for any inline `CalculatorInputs` objects (~lines 227, 315) — add `qfafDuration: 10` there too.

**Step 4: Run all tests to verify nothing breaks**

Run: `npx vitest run`
Expected: All existing tests pass (the new field defaults to 10 which matches current behavior).

**Step 5: Commit**

```bash
git add src/types.ts src/taxData.ts src/*.test.ts
git commit -m "feat: add qfafDuration field to CalculatorInputs (default 5, tests use 10)"
```

---

### Task 2: Implement QFAF duration cutoff in calculation engine

**Files:**
- Modify: `src/calculations/core.ts:93-125` (the main loop in `calculate()`)
- Test: `src/calculations.test.ts` (new test block)

**Step 1: Write the failing tests**

Add a new `describe('QFAF Duration', ...)` block in `src/calculations.test.ts`:

```typescript
describe('QFAF Duration', () => {
  it('should zero out QFAF contributions after duration expires', () => {
    const inputs = makeInputs({ qfafDuration: 3 });
    const settings = { ...DEFAULT_SETTINGS, projectionYears: 5 };
    const result = calculate(inputs, settings);

    // Years 1-3 should have QFAF ST gains
    expect(result.years[0].stGainsGenerated).toBeGreaterThan(0);
    expect(result.years[1].stGainsGenerated).toBeGreaterThan(0);
    expect(result.years[2].stGainsGenerated).toBeGreaterThan(0);

    // Years 4-5 should have zero QFAF ST gains (QFAF unwound)
    expect(result.years[3].stGainsGenerated).toBe(0);
    expect(result.years[4].stGainsGenerated).toBe(0);

    // Years 4-5 should also have zero ordinary losses from QFAF
    expect(result.years[3].ordinaryLossesGenerated).toBe(0);
    expect(result.years[4].ordinaryLossesGenerated).toBe(0);
  });

  it('should continue collateral ST losses after QFAF expires', () => {
    const inputs = makeInputs({ qfafDuration: 2 });
    const settings = { ...DEFAULT_SETTINGS, projectionYears: 5 };
    const result = calculate(inputs, settings);

    // Collateral ST losses should still be generated in post-QFAF years
    expect(result.years[3].stLossesHarvested).toBeGreaterThan(0);
    expect(result.years[4].stLossesHarvested).toBeGreaterThan(0);
  });

  it('should carry forward losses built during QFAF years into post-QFAF years', () => {
    const inputs = makeInputs({ qfafDuration: 1 });
    const settings = { ...DEFAULT_SETTINGS, projectionYears: 5 };
    const result = calculate(inputs, settings);

    // NOL generated in year 1 should persist into later years
    const year1Nol = result.years[0].nolCarryforward;
    expect(year1Nol).toBeGreaterThan(0);

    // Year 2+ should still have NOL carryforward (may decrease as it's used)
    expect(result.years[1].nolCarryforward).toBeGreaterThanOrEqual(0);
  });

  it('should auto-extend projection when duration + 2 > projectionYears', () => {
    const inputs = makeInputs({ qfafDuration: 9 });
    const settings = { ...DEFAULT_SETTINGS, projectionYears: 5 };
    const result = calculate(inputs, settings);

    // Should extend to at least duration + 2 = 11 years
    expect(result.years.length).toBeGreaterThanOrEqual(11);
  });

  it('should not extend projection when projectionYears already exceeds duration + 2', () => {
    const inputs = makeInputs({ qfafDuration: 3 });
    const settings = { ...DEFAULT_SETTINGS, projectionYears: 10 };
    const result = calculate(inputs, settings);

    // Should stay at 10 (no extension needed)
    expect(result.years.length).toBe(10);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/calculations.test.ts`
Expected: FAIL — QFAF years 4+ still have `stGainsGenerated > 0`

**Step 3: Implement the duration cutoff in `core.ts`**

In `src/calculations/core.ts`, modify the `calculate()` function:

After line 101 (`const projectionYears = settings.projectionYears ?? 10;`), add projection auto-extension:

```typescript
  // Auto-extend projection to show at least 2 post-QFAF years
  const qfafDuration = inputs.qfafEnabled !== false ? (inputs.qfafDuration ?? 10) : 0;
  const minProjection = qfafDuration > 0 ? qfafDuration + 2 : projectionYears;
  const effectiveProjectionYears = Math.max(projectionYears, minProjection);
```

Change the loop bound from `projectionYears` to `effectiveProjectionYears`:

```typescript
  for (let year = 1; year <= effectiveProjectionYears; year++) {
```

Inside the loop, before the `calculateYear` call, add the QFAF cutoff:

```typescript
    // Zero out QFAF after duration expires (breakeven unwind)
    const effectiveQfafValue = (qfafDuration > 0 && year > qfafDuration) ? 0 : qfafValue;

    const result = calculateYear(
      year,
      effectiveQfafValue,  // was: qfafValue
      collateralValue,
      ...
    );
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/calculations.test.ts`
Expected: All tests pass including the new QFAF Duration tests.

**Step 5: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass.

**Step 6: Commit**

```bash
git add src/calculations/core.ts src/calculations.test.ts
git commit -m "feat: zero out QFAF after duration expires, auto-extend projection"
```

---

### Task 3: Auto-cap sizing window to duration

**Files:**
- Modify: `src/calculations/sizing.ts:26`
- Test: `src/calculations.test.ts` (new test in sizing or QFAF Duration block)

**Step 1: Write the failing test**

Add to the QFAF Duration describe block in `src/calculations.test.ts`:

```typescript
  it('should cap sizing window to duration when sizingYears > duration', () => {
    const inputs = makeInputs({ qfafDuration: 3, qfafSizingYears: 10 });
    const result = calculate(inputs);

    // Sizing should use 3-year average (capped to duration), not 10-year
    // The 3-year average rate for overlay-45-45 is (0.165+0.105+0.090)/3 = 0.12
    // The 10-year average would be different
    expect(result.sizing.sizingYears).toBe(3);
  });
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/calculations.test.ts -t "should cap sizing window"`
Expected: FAIL — `sizingYears` is 10, not 3

**Step 3: Implement the auto-cap in `sizing.ts`**

In `src/calculations/sizing.ts`, change line 26 from:

```typescript
  const sizingYears = inputs.qfafSizingYears ?? 10;
```

to:

```typescript
  const maxSizingYears = inputs.qfafDuration ?? 10;
  const sizingYears = Math.min(inputs.qfafSizingYears ?? 10, maxSizingYears);
```

**Step 4: Run tests**

Run: `npx vitest run`
Expected: All tests pass.

**Step 5: Commit**

```bash
git add src/calculations/sizing.ts src/calculations.test.ts
git commit -m "feat: auto-cap sizing window to QFAF duration"
```

---

### Task 4: Add QFAF Duration slider to UI

**Files:**
- Modify: `src/components/StrategySelectionInputs.tsx` (inside the QFAF config section, ~line 408–546)

**Step 1: Add the duration slider**

In `src/components/StrategySelectionInputs.tsx`, inside the `<div className="qfaf-inputs-section">` block, add a new slider in the `<div className="input-pair">` after the Sizing Window slider (after line 474, before the closing `</div>` of `input-pair`). Replace the existing `input-pair` div containing QFAF Multiplier and Sizing Window with a restructured version that includes Duration:

Add this new input group alongside the existing Multiplier and Sizing Window sliders. Insert after the Sizing Window `</div>` (line 474) but before the `</div>` closing the `input-pair`:

```tsx
              <div className="input-group">
                <label htmlFor="qfafDuration">QFAF Duration</label>
                <input
                  id="qfafDuration"
                  type="range"
                  min={1}
                  max={10}
                  step={1}
                  value={inputs.qfafDuration}
                  onChange={e => {
                    const val = parseInt(e.target.value, 10);
                    if (!isNaN(val)) {
                      onUpdateInput('qfafDuration', val);
                      // Auto-cap sizing window if it exceeds new duration
                      if (inputs.qfafSizingYears > val) {
                        onUpdateInput('qfafSizingYears', val);
                      }
                    }
                  }}
                />
                <div className="slider-labels">
                  <span>1 year</span>
                  <span className="current-value">{inputs.qfafDuration} {inputs.qfafDuration === 1 ? 'year' : 'years'}</span>
                  <span>10 years</span>
                </div>
                <span className="input-hint">
                  Years QFAF runs before breakeven unwind — default: 5
                </span>
              </div>
```

**Step 2: Cap the sizing window slider max to duration**

Update the Sizing Window slider (around line 453) to use `inputs.qfafDuration` as the max:

Change:
```tsx
                  max={10}
```
to:
```tsx
                  max={inputs.qfafDuration}
```

This visually prevents the sizing window from exceeding the duration.

**Step 3: Run dev server to verify**

Run: `npx vite dev` and verify:
- Duration slider appears in QFAF Configuration section
- Changing duration auto-caps sizing window
- Sizing window slider max adjusts when duration changes

**Step 4: Commit**

```bash
git add src/components/StrategySelectionInputs.tsx
git commit -m "feat: add QFAF duration slider with sizing window auto-cap"
```

---

### Task 5: Restore QFAF Cushion slider to UI

**Files:**
- Modify: `src/components/StrategySelectionInputs.tsx` (inside the QFAF config section)

**Step 1: Add the cushion slider**

In the QFAF config section, after the Duration slider added in Task 4, add:

```tsx
              <div className="input-group">
                <label htmlFor="sizingCushion">Sizing Cushion</label>
                <input
                  id="sizingCushion"
                  type="range"
                  min={0}
                  max={0.10}
                  step={0.01}
                  value={inputs.qfafSizingCushion}
                  onChange={e => {
                    const val = parseFloat(e.target.value);
                    if (!isNaN(val)) {
                      onUpdateInput('qfafSizingCushion', val);
                    }
                  }}
                />
                <div className="slider-labels">
                  <span>0%</span>
                  <span className="current-value">{(inputs.qfafSizingCushion * 100).toFixed(0)}%</span>
                  <span>10%</span>
                </div>
                <span className="input-hint">
                  Reduces auto-sized QFAF for conservative sizing
                </span>
              </div>
```

**Step 2: Run dev server to verify**

Run: `npx vite dev` and verify:
- Cushion slider appears in QFAF Configuration section
- Sliding to 5% shows "5%" in the label
- The QFAF sizing value in results decreases as cushion increases

**Step 3: Commit**

```bash
git add src/components/StrategySelectionInputs.tsx
git commit -m "feat: restore QFAF cushion slider (backend logic already existed)"
```

---

### Task 6: Add `qfafDuration` to ScenarioComparisonPanel

**Files:**
- Modify: `src/components/ScenarioComparisonPanel.tsx:159` (after the cushion comparison)

**Step 1: Add duration comparison tracking**

In `src/components/ScenarioComparisonPanel.tsx`, after the cushion comparison block (after line 159), add:

```typescript
  if (pinned.qfafDuration !== current.qfafDuration) {
    changes.push({
      label: 'QFAF Duration',
      pinnedDisplay: `${pinned.qfafDuration} yr`,
      currentDisplay: `${current.qfafDuration} yr`,
    });
  }
```

**Step 2: Verify by running dev server**

Pin a scenario, change the duration, and verify the comparison panel shows the change.

**Step 3: Commit**

```bash
git add src/components/ScenarioComparisonPanel.tsx
git commit -m "feat: track QFAF duration in scenario comparison panel"
```

---

### Task 7: Final integration test and cleanup

**Files:**
- Test: `src/calculations.test.ts`

**Step 1: Write an integration test combining duration + cushion + sizing cap**

Add to the QFAF Duration describe block:

```typescript
  it('should combine duration, cushion, and sizing cap correctly', () => {
    const inputs = makeInputs({
      qfafDuration: 5,
      qfafSizingYears: 10, // will be capped to 5
      qfafSizingCushion: 0.05, // 5% reduction
    });
    const settings = { ...DEFAULT_SETTINGS, projectionYears: 10 };
    const result = calculate(inputs, settings);

    // Sizing window should be capped to 5
    expect(result.sizing.sizingYears).toBe(5);

    // QFAF value should be 95% of un-cushioned value
    const inputsNoCushion = makeInputs({
      qfafDuration: 5,
      qfafSizingYears: 10,
      qfafSizingCushion: 0,
    });
    const resultNoCushion = calculate(inputsNoCushion, settings);
    expect(result.sizing.qfafValue).toBeCloseTo(
      resultNoCushion.sizing.qfafValue * 0.95,
      0
    );

    // Year 5 should have QFAF, year 6 should not
    expect(result.years[4].stGainsGenerated).toBeGreaterThan(0);
    expect(result.years[5].stGainsGenerated).toBe(0);

    // Projection should be at least 10 years (projectionYears already >= duration + 2)
    expect(result.years.length).toBe(10);
  });
```

**Step 2: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass.

**Step 3: Commit**

```bash
git add src/calculations.test.ts
git commit -m "test: add integration test for QFAF duration + cushion + sizing cap"
```

---

## Summary of all changes

| File | Change |
|------|--------|
| `src/types.ts` | Add `qfafDuration: number` to `CalculatorInputs` |
| `src/taxData.ts` | Add `qfafDuration: 5` to defaults |
| `src/calculations/core.ts` | Zero out QFAF after duration, auto-extend projection |
| `src/calculations/sizing.ts` | Auto-cap sizing window to duration |
| `src/components/StrategySelectionInputs.tsx` | Add Duration slider, restore Cushion slider, cap sizing max |
| `src/components/ScenarioComparisonPanel.tsx` | Track duration in scenario comparison |
| `src/calculations.test.ts` | Duration cutoff, carryforward continuity, auto-extend, sizing cap, integration |
| `src/advancedFeatures.test.ts` | Add `qfafDuration: 10` to fixtures |
| `src/advancedSettings.test.ts` | Add `qfafDuration: 10` to fixtures |
| `src/sensitivityAnalysis.test.ts` | Add `qfafDuration: 10` to fixtures |
| `src/scenarios.test.ts` | Add `qfafDuration: 10` to fixtures |

## Future enhancement (deferred)

**Dynamic QFAF resizing:** A mode where QFAF is resized each year to match the current year's EDI loss rate, shrinking as losses decay. Separate design + implementation.
