---
status: completed
priority: p1
issue_id: "003"
tags: [code-review, typescript, runtime-error]
dependencies: []
---

# Non-Null Assertion Operator Misuse

## Problem Statement

The `calculate` function uses non-null assertion (`!`) on `getStrategy()` result without validation. If the strategy ID is invalid, this will cause a runtime crash.

## Findings

**Location:** `src/calculations.ts:60`

```typescript
const strategy = getStrategy(inputs.strategyId)!;  // Dangerous!
```

**Contrast with proper handling in calculateSizing (lines 17-21):**
```typescript
const strategy = getStrategy(inputs.strategyId);
if (!strategy) {
  throw new Error(`Invalid strategy ID: ${inputs.strategyId}`);
}
```

The `calculateSizing` function properly validates, but `calculate` bypasses this with `!`.

## Proposed Solutions

### Option A: Add proper null check (Recommended)
```typescript
const strategy = getStrategy(inputs.strategyId);
if (!strategy) {
  throw new Error(`Invalid strategy ID: ${inputs.strategyId}`);
}
```
- **Pros:** Consistent with calculateSizing, clear error message
- **Cons:** Duplicates error check
- **Effort:** Small (15 minutes)
- **Risk:** Low

### Option B: Reuse strategy from sizing
```typescript
const sizing = calculateSizing(inputs);
const strategy = {
  stLossRate: sizing.year1StLosses / sizing.collateralValue,
  ltGainRate: /* derive from sizing */
};
```
- **Pros:** No duplicate lookup
- **Cons:** More complex, needs to reverse-engineer rates
- **Effort:** Medium (1 hour)
- **Risk:** Medium

## Recommended Action

[To be filled during triage]

## Technical Details

**Affected files:**
- `src/calculations.ts`

**Related issue:** Line 312 also has unchecked array access: `years[years.length - 1].totalValue`

## Acceptance Criteria

- [ ] `calculate()` handles invalid strategy ID gracefully
- [ ] Clear error message is thrown (not runtime crash)
- [ ] Consistent error handling pattern with `calculateSizing()`

## Work Log

| Date | Action | Result/Learning |
|------|--------|-----------------|
| 2026-01-26 | Identified during TypeScript review | Non-null assertion bypasses safety |

## Resources

- TypeScript reviewer agent report
