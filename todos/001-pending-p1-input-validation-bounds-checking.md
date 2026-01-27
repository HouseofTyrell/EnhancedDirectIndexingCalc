---
status: completed
priority: p1
issue_id: "001"
tags: [code-review, security, input-validation]
dependencies: []
---

# Input Validation - Missing Bounds Checking

## Problem Statement

The calculator accepts user input for financial amounts without proper bounds validation. This can lead to:
- Negative values producing nonsensical tax "benefits"
- Extremely large numbers (1e308+) causing overflow in calculations
- `Infinity` values propagating through all calculations (not caught by NaN check)

This is critical for a financial calculator where accuracy is paramount.

## Findings

**Location:** `src/Calculator.tsx:34-37`

```typescript
const parseFormattedNumber = (value: string) => {
  const parsed = Number(value.replace(/,/g, ''));
  return isNaN(parsed) ? 0 : parsed;  // Does NOT catch Infinity or negative
};
```

**Attack vectors:**
- Input `1e309` produces `Infinity` (passes NaN check)
- Input `-1000000` produces negative collateral
- Input `1e308` causes overflow in multiplication operations

**Also affects:** State rate input (lines 253-266) has HTML min/max but no JS validation.

## Proposed Solutions

### Option A: Add comprehensive validation (Recommended)
```typescript
const parseFormattedNumber = (value: string) => {
  const parsed = Number(value.replace(/,/g, ''));
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.min(parsed, 1e15); // Reasonable max for financial calculations
};
```
- **Pros:** Simple, catches all edge cases
- **Cons:** Silent correction (user may not notice)
- **Effort:** Small (30 minutes)
- **Risk:** Low

### Option B: Add validation with user feedback
Show validation error messages when bounds are exceeded.
- **Pros:** Better UX, user knows their input was invalid
- **Cons:** More UI work required
- **Effort:** Medium (2 hours)
- **Risk:** Low

## Recommended Action

[To be filled during triage]

## Technical Details

**Affected files:**
- `src/Calculator.tsx` (parseFormattedNumber function)
- `src/AdvancedMode/YearByYearPlanning.tsx` (same function duplicated)
- `src/AdvancedMode/SettingsPanel.tsx` (similar pattern)

**Components affected:** All input fields accepting numeric values

## Acceptance Criteria

- [ ] Negative numbers are rejected or converted to 0
- [ ] `Infinity` and `-Infinity` are rejected
- [ ] Values above reasonable threshold (1e15) are capped
- [ ] State rate is validated to 0-100% range in JS, not just HTML

## Work Log

| Date | Action | Result/Learning |
|------|--------|-----------------|
| 2026-01-26 | Identified during security review | Multiple input vectors found |

## Resources

- PR: Current branch `feat/qfaf-collateral-mechanics`
- Security Sentinel agent report
