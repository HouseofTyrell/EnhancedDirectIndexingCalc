---
status: completed
priority: p1
issue_id: "005"
tags: [code-review, typescript, runtime-error]
dependencies: []
---

# Unchecked Array Access Without Bounds Check

## Problem Statement

Multiple locations access array elements without checking if the array is empty, which can cause runtime crashes.

## Findings

**Location 1:** `src/calculations.ts:312`
```typescript
const finalPortfolioValue = years[years.length - 1].totalValue;
// If years is empty, this throws: Cannot read property 'totalValue' of undefined
```

**Location 2:** `src/Calculator.tsx:452-458`
```typescript
results.years[0]?.ltGainsRealized  // Uses optional chaining - GOOD
// But the same access is repeated 4+ times without storing in variable
```

**Location 3:** `src/ResultsTable.tsx:64-72`
```typescript
data[data.length - 1].stLossCarryforward  // No optional chaining
data[data.length - 1].ltLossCarryforward
data[data.length - 1].nolCarryforward
```

## Proposed Solutions

### Option A: Use optional chaining with nullish coalescing (Recommended)
```typescript
// calculations.ts
const finalPortfolioValue = years.at(-1)?.totalValue ?? 0;

// ResultsTable.tsx
const lastYear = data.at(-1);
// Then use lastYear?.stLossCarryforward ?? 0
```
- **Pros:** Safe, concise, modern JS
- **Cons:** Requires fallback values
- **Effort:** Small (30 minutes)
- **Risk:** Low

### Option B: Add early return guard
```typescript
if (years.length === 0) {
  return { totalTaxSavings: 0, finalPortfolioValue: 0, ... };
}
```
- **Pros:** Explicit handling
- **Cons:** More verbose
- **Effort:** Small (30 minutes)
- **Risk:** Low

## Recommended Action

[To be filled during triage]

## Technical Details

**Affected files:**
- `src/calculations.ts`
- `src/Calculator.tsx`
- `src/ResultsTable.tsx`

## Acceptance Criteria

- [ ] Empty arrays do not cause runtime crashes
- [ ] Fallback values are sensible (0 for numbers)
- [ ] Repeated array access is stored in variables

## Work Log

| Date | Action | Result/Learning |
|------|--------|-----------------|
| 2026-01-26 | Identified during TypeScript review | Multiple unsafe access patterns |

## Resources

- TypeScript reviewer agent report
