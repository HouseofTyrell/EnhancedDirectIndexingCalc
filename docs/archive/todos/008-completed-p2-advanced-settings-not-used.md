---
status: completed
priority: p2
issue_id: "008"
tags: [code-review, architecture, bug]
dependencies: []
---

# AdvancedSettings Values Not Used in Calculations

## Problem Statement

Users can modify Advanced Settings (QFAF multiplier, NOL offset limit, annual return, etc.) in the UI, but these values are NOT passed to the `calculate()` function. The calculations use hardcoded constants instead.

This is a functional bug - users see a settings panel but changes have no effect.

## Findings

**Location 1:** `src/Calculator.tsx:74`
```typescript
const results = useMemo(() => calculate(inputs), [inputs]);
// advancedSettings is NOT passed to calculate()
```

**Location 2:** `src/calculations.ts:154`
```typescript
const portfolioGrowthRate = 0.07;  // Hardcoded!
// Should use advancedSettings.defaultAnnualReturn
```

**Location 3:** `src/strategyData.ts:38`
```typescript
export const NOL_OFFSET_PERCENTAGE = 0.80;  // Hardcoded!
// advancedSettings.nolOffsetLimit exists but isn't used
```

**AdvancedSettings type defines configurable values that are ignored:**
- `qfafMultiplier` (default 1.50)
- `nolOffsetLimit` (default 0.80)
- `defaultAnnualReturn` (default 0.07)
- `projectionYears` (default 10)

## Proposed Solutions

### Option A: Wire advancedSettings to calculate() (Recommended)
```typescript
// Calculator.tsx
const results = useMemo(() => calculate(inputs, advancedSettings), [inputs, advancedSettings]);

// calculations.ts
export function calculate(inputs: CalculatorInputs, settings: AdvancedSettings = DEFAULT_SETTINGS): CalculationResult {
  const portfolioGrowthRate = settings.defaultAnnualReturn;
  // ...
}
```
- **Pros:** Settings actually work, user expectations met
- **Cons:** Need to update function signatures
- **Effort:** Medium (2-3 hours)
- **Risk:** Medium (may change calculation results)

### Option B: Remove AdvancedSettings UI
If the settings shouldn't be configurable, remove the UI to avoid confusion.
- **Pros:** No misleading UI
- **Cons:** Loses flexibility
- **Effort:** Small (1 hour)
- **Risk:** Low

## Recommended Action

[To be filled during triage]

## Technical Details

**Affected files:**
- `src/Calculator.tsx`
- `src/calculations.ts`
- `src/strategyData.ts`

**Settings that need wiring:**
1. `defaultAnnualReturn` → `portfolioGrowthRate` in calculateYear
2. `nolOffsetLimit` → `NOL_OFFSET_PERCENTAGE` in calculateTaxes
3. `qfafMultiplier` → `QFAF_ST_GAIN_RATE` and `QFAF_ORDINARY_LOSS_RATE`
4. `projectionYears` → loop bounds in calculate()

## Acceptance Criteria

- [ ] Changing Annual Return in settings affects projections
- [ ] Changing NOL Offset Limit affects NOL calculations
- [ ] Changing QFAF Multiplier affects sizing
- [ ] Changing Projection Years affects year count

## Work Log

| Date | Action | Result/Learning |
|------|--------|-----------------|
| 2026-01-26 | Identified during architecture review | Dead settings UI |

## Resources

- Architecture Strategist agent report
- Code Simplicity reviewer agent report
