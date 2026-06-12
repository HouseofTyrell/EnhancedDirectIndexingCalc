---
status: completed
priority: p3
issue_id: "018"
tags: [code-review, performance, react]
dependencies: []
---

# Memoize Tax Rate Calculations in Calculator

## Problem Statement

Tax rate calculations in Calculator.tsx are recalculated on every render without memoization, even though they only depend on `inputs.annualIncome`, `inputs.filingStatus`, and `inputs.stateCode`.

## Findings

**Location:** `src/Calculator.tsx:118-124`

```typescript
// Recalculated on every render
const federalStRate = getFederalStRate(inputs.annualIncome, inputs.filingStatus);
const federalLtRate = getFederalLtRate(inputs.annualIncome, inputs.filingStatus);
const stateRate = inputs.stateCode === 'OTHER' ? inputs.stateRate : getStateRate(inputs.stateCode);
const combinedStRate = federalStRate + stateRate;
const combinedLtRate = federalLtRate + stateRate;
const rateDifferential = combinedStRate - combinedLtRate;
```

These values are used in multiple places in the JSX, so memoizing would prevent redundant calculations.

## Proposed Solutions

### Option A: Wrap in useMemo (Recommended)
```typescript
const taxRates = useMemo(() => {
  const federalStRate = getFederalStRate(inputs.annualIncome, inputs.filingStatus);
  const federalLtRate = getFederalLtRate(inputs.annualIncome, inputs.filingStatus);
  const stateRate = inputs.stateCode === 'OTHER' ? inputs.stateRate : getStateRate(inputs.stateCode);
  return {
    federalStRate,
    federalLtRate,
    stateRate,
    combinedStRate: federalStRate + stateRate,
    combinedLtRate: federalLtRate + stateRate,
    rateDifferential: federalStRate - federalLtRate,
  };
}, [inputs.annualIncome, inputs.filingStatus, inputs.stateCode, inputs.stateRate]);
```
- **Pros:** Only recalculates when dependencies change
- **Cons:** Minor complexity
- **Effort:** Small (30 minutes)
- **Risk:** Low

## Recommended Action

[To be filled during triage]

## Technical Details

**Affected files:**
- `src/Calculator.tsx`

## Acceptance Criteria

- [ ] Tax rate calculations wrapped in useMemo
- [ ] Dependencies correctly specified
- [ ] JSX updated to use memoized object properties

## Work Log

| Date | Action | Result/Learning |
|------|--------|-----------------|
| 2026-01-26 | Identified during performance review | Redundant calculations |

## Resources

- Performance Oracle agent report
