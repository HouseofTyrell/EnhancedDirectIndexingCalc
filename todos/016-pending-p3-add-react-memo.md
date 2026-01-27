---
status: completed
priority: p3
issue_id: "016"
tags: [code-review, performance, react]
dependencies: ["006", "007"]
---

# Add React.memo to Child Components

## Problem Statement

Child components like `StickyHeader`, `ResultsSummary`, `TaxSavingsChart`, and `PortfolioValueChart` are not wrapped in `React.memo()`, causing them to re-render whenever Calculator re-renders, even if their props haven't changed.

## Findings

**Components without React.memo:**

| Component | File | Re-renders when |
|-----------|------|-----------------|
| `StickyHeader` | `components/StickyHeader.tsx` | Any Calculator state changes |
| `ResultsSummary` | `components/ResultsSummary.tsx` | Any Calculator state changes |
| `TaxSavingsChart` | `WealthChart.tsx` | Any Calculator state changes |
| `PortfolioValueChart` | `WealthChart.tsx` | Any Calculator state changes |
| `ResultsTable` | `ResultsTable.tsx` | Any Calculator state changes |

**Example fix:**
```typescript
// Current
export function StickyHeader({ ... }: StickyHeaderProps) {
  return (...);
}

// With memo
export const StickyHeader = React.memo(function StickyHeader({ ... }: StickyHeaderProps) {
  return (...);
});
```

## Proposed Solutions

### Option A: Add React.memo to all presentational components (Recommended)
Wrap components that receive primitive props in React.memo.
- **Pros:** Prevents unnecessary re-renders
- **Cons:** Slight complexity, need stable prop references
- **Effort:** Small (1 hour)
- **Risk:** Low

**Note:** This is most effective AFTER fixing issues 006 (useCallback) and 007 (chart memoization).

## Recommended Action

[To be filled during triage]

## Technical Details

**Affected files:**
- `src/components/StickyHeader.tsx`
- `src/components/ResultsSummary.tsx`
- `src/WealthChart.tsx`
- `src/ResultsTable.tsx`
- `src/AdvancedMode/*.tsx` (all 6 components)

## Acceptance Criteria

- [ ] All presentational components wrapped in React.memo
- [ ] Parent handlers wrapped in useCallback (depends on 006)
- [ ] No unnecessary re-renders in React DevTools Profiler

## Work Log

| Date | Action | Result/Learning |
|------|--------|-----------------|
| 2026-01-26 | Identified during performance review | Re-render inefficiency |

## Resources

- Performance Oracle agent report
