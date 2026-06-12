---
status: completed
priority: p1
issue_id: "004"
tags: [code-review, security, calculations]
dependencies: ["001"]
---

# NaN/Infinity Propagation Through Calculations

## Problem Statement

The calculation chain does not have intermediate NaN/Infinity checks. If any input produces these values, they will silently propagate through all 319 lines of calculations, resulting in "NaN" or "Infinity" displayed in the UI.

## Findings

**Location:** `src/calculations.ts` (entire file)

**Propagation chain example:**
```typescript
// Line 26 - If strategy.stLossRate is somehow NaN
const year1StLosses = collateralValue * strategy.stLossRate;  // NaN

// Line 29 - Now qfafValue is NaN
const qfafValue = inputs.qfafOverride ?? (year1StLosses / QFAF_ST_GAIN_RATE);

// Line 32 - year1StGains is NaN
const year1StGains = qfafValue * QFAF_ST_GAIN_RATE;

// And so on through all calculations...
```

**UI Impact:** `toLocaleString()` with NaN returns `"NaN"` which displays to users.

**Division by zero risk:** Line 29 divides by `QFAF_ST_GAIN_RATE` (constant 1.50). If ever changed to 0, produces Infinity.

## Proposed Solutions

### Option A: Add validation wrapper utility (Recommended)
```typescript
function safeNumber(value: number, fallback: number = 0): number {
  return Number.isFinite(value) ? value : fallback;
}

// Usage at calculation entry points
const year1StLosses = safeNumber(collateralValue * strategy.stLossRate);
```
- **Pros:** Centralized, reusable, minimal code changes
- **Cons:** Could mask bugs (silent fallback)
- **Effort:** Medium (2 hours)
- **Risk:** Low

### Option B: Add defensive checks before critical operations
```typescript
if (!Number.isFinite(year1StLosses)) {
  throw new Error('Invalid calculation: year1StLosses is not finite');
}
```
- **Pros:** Fails fast, surfaces bugs immediately
- **Cons:** More verbose, user-facing errors
- **Effort:** Medium (2 hours)
- **Risk:** Medium (could show errors to users)

## Recommended Action

[To be filled during triage]

## Technical Details

**Affected files:**
- `src/calculations.ts`

**Critical calculation points:**
- Line 26: `year1StLosses`
- Line 29: `qfafValue` (division)
- Line 48: `qfafRatio` (division)
- Lines 313-314: `effectiveTaxAlpha` (division)

## Acceptance Criteria

- [ ] NaN inputs produce sensible fallback values (0 or error)
- [ ] Infinity values are caught before propagation
- [ ] Division by zero is prevented with defensive checks
- [ ] UI never displays "NaN" or "Infinity"

## Work Log

| Date | Action | Result/Learning |
|------|--------|-----------------|
| 2026-01-26 | Identified during security review | Silent NaN propagation risk |

## Resources

- Security Sentinel agent report
