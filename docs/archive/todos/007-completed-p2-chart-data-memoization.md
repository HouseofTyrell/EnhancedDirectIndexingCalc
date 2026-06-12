---
status: completed
priority: p2
issue_id: "007"
tags: [code-review, performance, react]
dependencies: []
---

# Chart Data Transformation Not Memoized + O(n²) Algorithm

## Problem Statement

Chart data transformation runs on every render without memoization. Additionally, the cumulative calculation uses an O(n²) algorithm that recalculates sums repeatedly.

## Findings

**Location:** `src/WealthChart.tsx:31-39`

```typescript
// Runs on EVERY render - not memoized
const chartData = data.map(year => ({
  year: `Year ${year.year}`,
  'Tax Savings': year.taxSavings,
  'Cumulative Tax Savings': data
    .slice(0, year.year)  // Creates new array each iteration
    .reduce((sum, y) => sum + y.taxSavings, 0),  // O(n) each iteration
  // ...
}));
```

**Algorithmic complexity:**
- For each of 10 years, it slices and reduces the array
- Total: 1+2+3+4+5+6+7+8+9+10 = 55 operations (O(n²))

**Impact:** Chart updates cause visual stutter during slider drag operations.

## Proposed Solutions

### Option A: Memoize + fix algorithm (Recommended)
```typescript
const chartData = useMemo(() => {
  let cumulativeSavings = 0;
  return data.map(year => {
    cumulativeSavings += year.taxSavings;
    return {
      year: `Year ${year.year}`,
      'Tax Savings': year.taxSavings,
      'Cumulative Tax Savings': cumulativeSavings,  // O(1)
      // ...
    };
  });
}, [data]);
```
- **Pros:** O(n) algorithm, memoized, no stutter
- **Cons:** None
- **Effort:** Small (30 minutes)
- **Risk:** Low

### Option B: Also add React.memo to chart components
```typescript
export const TaxSavingsChart = React.memo(function TaxSavingsChart({ data }: WealthChartProps) {
  // ...
});
```
- **Pros:** Prevents re-render if data reference unchanged
- **Cons:** Need to ensure data reference stability
- **Effort:** Small (15 minutes)
- **Risk:** Low

## Recommended Action

[To be filled during triage]

## Technical Details

**Affected files:**
- `src/WealthChart.tsx`

**Both charts affected:**
- `TaxSavingsChart`
- `PortfolioValueChart`

## Acceptance Criteria

- [ ] Chart data transformation uses useMemo
- [ ] Cumulative calculation is O(n) not O(n²)
- [ ] No visible stutter during rapid input changes
- [ ] Charts wrapped in React.memo

## Work Log

| Date | Action | Result/Learning |
|------|--------|-----------------|
| 2026-01-26 | Identified during performance review | O(n²) algorithm in render |

## Resources

- Performance Oracle agent report
