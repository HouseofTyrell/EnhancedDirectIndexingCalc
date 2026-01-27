# Fix Tax Calculation Accuracy - Simplified Plan

---
title: "Fix Tax Calculation Accuracy (Simplified)"
type: fix
date: 2026-01-26
priority: critical
version: 2
---

## Overview

This plan addresses critical tax-law misapplications with **minimal code changes**.

Based on code review feedback from DHH, Kieran, and Simplicity reviewers, the original 4-phase, 15-file plan was rejected as over-engineered. This revised plan fixes the core issues with ~15 lines changed in one file.

**Scope:** 1 file modified, ~15 lines changed, 2 tests enabled

---

## Problem Statement

The current calculator has two specific bugs:

1. **§461(l) misapplication** - Limits losses by cap, not by taxable income
2. **Unused current-year ST losses** - Not tracked as carryforward

### What We're NOT Doing

Per reviewer consensus, we're explicitly NOT:
- Creating new `IncomeModel` interface with 10 fields
- Adding new utility files (`taxNetting.ts`, `incomeModel.ts`)
- Adding new UI for income breakdown
- Adding `ltLossRate` to Strategy (YAGNI)
- Restructuring into 4 phases

---

## The Fix

### Fix 1: Section 461(l) Income Limit

**File:** `src/calculations.ts:175`

**Current (incorrect):**
```typescript
const usableOrdinaryLoss = Math.min(ordinaryLossesGenerated, taxRates.section461Limit);
```

**Fixed:**
```typescript
// §461(l): losses limited to lesser of (1) generated losses, (2) limit, (3) taxable income
// Cannot deduct more losses than you have income to offset
const usableOrdinaryLoss = Math.min(
  ordinaryLossesGenerated,
  taxRates.section461Limit,
  inputs.annualIncome
);
```

**Rationale:** You cannot deduct more business losses than your taxable income. The existing `annualIncome` field represents taxable income. No new interface needed.

### Fix 2: Track Unused Current-Year ST Losses

**File:** `src/calculations.ts:278-287`

**Current (incomplete):**
```typescript
// Step 5: Handle current year net ST loss
if (netStGainLoss < 0) {
  const currentLoss = Math.abs(netStGainLoss);
  if (taxableLt > 0) {
    const offset = Math.min(currentLoss, taxableLt);
    taxableLt -= offset;
  }
  taxableSt = 0;
}
```

**Fixed:**
```typescript
// Step 5: Handle current year net ST loss
if (netStGainLoss < 0) {
  const currentLoss = Math.abs(netStGainLoss);
  let remainingLoss = currentLoss;

  if (taxableLt > 0) {
    const offset = Math.min(remainingLoss, taxableLt);
    taxableLt -= offset;
    remainingLoss -= offset;
  }

  // Track unused current-year losses as ST carryforward
  if (remainingLoss > 0) {
    stCarryforward += remainingLoss;
  }

  taxableSt = 0;
}
```

**Rationale:** Current-year ST losses that exceed LT gains should become carryforward, not disappear.

---

## Verification

### Existing Tests (Already Passing)

These 28 tests capture current behavior and will continue to pass:
- Basic calculation sanity (4 tests)
- 461(l) limit application (3 tests)
- NOL behavior (3 tests)
- Capital loss netting (4 tests)
- MFS filing status (2 tests)
- Loss rate decay (2 tests)
- Wash sale adjustment (2 tests)
- Financing costs (1 test)
- Edge cases (4 tests)

### Tests to Enable After Fix

These 2 tests are currently skipped and will be enabled:

```typescript
it('461(l) should be limited by taxable income', () => {
  const inputs = createInputs({
    annualIncome: 50000,
    collateralAmount: 10000000
  });
  const result = calculate(inputs);

  // Cannot deduct more losses than you have income
  expect(result.years[0].usableOrdinaryLoss).toBeLessThanOrEqual(50000);
});

it('unused current-year ST losses should carry forward', () => {
  const inputs = createInputs({
    qfafOverride: 10000, // Very small QFAF = small ST gains
  });
  const result = calculate(inputs);

  // Excess ST losses should appear in carryforward
  expect(result.years[0].stLossCarryforward).toBeGreaterThan(0);
});
```

### Manual Verification

Compare Year 1 results for scenario:
- $100K income, $5M collateral, MFJ

| Metric | Before Fix | After Fix |
|--------|------------|-----------|
| Usable Ordinary Loss | $626,000 | $100,000 |
| Excess to NOL | Large | Larger |
| Tax Savings | Overstated | Accurate |

---

## Files Summary

| File | Changes |
|------|---------|
| `src/calculations.ts` | ~15 lines modified |
| `src/calculations.test.ts` | Enable 2 skipped tests |

**Total: 2 files, ~20 lines changed**

---

## Implementation Steps

1. [ ] Read `src/calculations.ts` (already done)
2. [ ] Apply Fix 1: Add `inputs.annualIncome` to §461(l) min() (line 175)
3. [ ] Apply Fix 2: Track remaining loss as carryforward (lines 278-287)
4. [ ] Enable skipped tests in `src/calculations.test.ts`
5. [ ] Run `npm run test:run` - all 30 tests should pass
6. [ ] Run `npm run build` - verify no build errors

---

## Why This Approach

### DHH's Critique (Addressed)
> "You have four bugs. Fix them. One PR. One review. Done."

✅ This plan: 2 bugs, 2 fixes, 1 file, ~15 lines.

### Kieran's Critique (Addressed)
> "Set up test infrastructure FIRST"

✅ Test infrastructure created with 28 baseline tests + 2 skipped tests for known issues.

### Simplicity Reviewer (Addressed)
> "Minimum viable change... approximately 15 lines changed"

✅ This plan: exactly that.

---

## What This Doesn't Fix

The following were identified but are lower priority:

1. **Double-counting concern** - Reviewers analyzed the code and found the current implementation is actually correct (no double-counting)

2. **NOL timing** - Current code applies NOL after other deductions (already correct per code review)

3. **Income breakdown UI** - Not needed; users can calculate their taxable income externally

If these become real issues, they can be addressed in future PRs with test-first approach.
