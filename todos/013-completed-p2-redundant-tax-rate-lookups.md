---
status: completed
priority: p2
issue_id: "013"
tags: [code-review, performance, calculations]
dependencies: []
---

# Redundant Tax Rate Lookups in Calculation Loop

## Problem Statement

Inside the 10-year calculation loop, tax rates are fetched repeatedly even though `inputs` doesn't change. This creates unnecessary function calls.

## Findings

**Location:** `src/calculations.ts:260-261` (inside calculateTaxes, called 10 times)

```typescript
// Called 10 times per calculation with identical inputs
const stRate = getFederalStRate(inputs.annualIncome, inputs.filingStatus);
const ltRate = getFederalLtRate(inputs.annualIncome, inputs.filingStatus);
```

**Also repeated:** State rate lookup (lines 285-287), Section 461 limit (line 131)

**Total redundant operations per calculation:**
- 10 years × (2 federal rate lookups + 2 state rate lookups + 1 section 461 lookup) = 50 redundant operations

## Proposed Solutions

### Option A: Pre-calculate rates before loop (Recommended)
```typescript
export function calculate(inputs: CalculatorInputs): CalculationResult {
  const sizing = calculateSizing(inputs);
  const strategy = getStrategy(inputs.strategyId)!;

  // Pre-calculate constant values
  const taxRates = {
    stRate: getFederalStRate(inputs.annualIncome, inputs.filingStatus),
    ltRate: getFederalLtRate(inputs.annualIncome, inputs.filingStatus),
    stateRate: inputs.stateCode === 'OTHER' ? inputs.stateRate : getStateRate(inputs.stateCode),
    section461Limit: SECTION_461L_LIMITS[inputs.filingStatus],
  };

  for (let year = 1; year <= 10; year++) {
    const result = calculateYear(/* ..., taxRates */);
  }
}
```
- **Pros:** Eliminates redundant lookups, cleaner code
- **Cons:** Need to update function signatures
- **Effort:** Medium (1-2 hours)
- **Risk:** Low

## Recommended Action

[To be filled during triage]

## Technical Details

**Affected files:**
- `src/calculations.ts`

**Functions to update:**
- `calculate()` - pre-compute rates
- `calculateYear()` - accept rates parameter
- `calculateTaxes()` - accept rates parameter

## Acceptance Criteria

- [ ] Tax rates calculated once before loop
- [ ] State rate calculated once before loop
- [ ] Section 461 limit calculated once before loop
- [ ] calculateYear and calculateTaxes receive pre-calculated values

## Work Log

| Date | Action | Result/Learning |
|------|--------|-----------------|
| 2026-01-26 | Identified during performance review | 50 redundant ops/calculation |

## Resources

- Performance Oracle agent report
