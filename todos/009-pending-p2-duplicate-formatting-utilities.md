---
status: completed
priority: p2
issue_id: "009"
tags: [code-review, quality, dry]
dependencies: []
---

# Duplicate Formatting Utilities Across Files

## Problem Statement

Formatting functions (`formatWithCommas`, `parseFormattedNumber`, `formatCurrency`, `formatPercent`) are duplicated across 5+ files. Bug fixes in one location may not propagate to others.

## Findings

**Duplicated functions:**

| Function | Calculator.tsx | YearByYearPlanning.tsx | SettingsPanel.tsx | SensitivityAnalysis.tsx | StrategyComparison.tsx | StickyHeader.tsx | ResultsSummary.tsx |
|----------|---------------|------------------------|-------------------|-------------------------|------------------------|------------------|-------------------|
| `formatWithCommas` | Lines 29-31 | Lines 12-14 | - | - | - | - | - |
| `parseFormattedNumber` | Lines 34-37 | Lines 17-20 | Lines 25-27 | - | - | - | - |
| `formatCurrency` | Lines 108-110 | - | - | - | Lines 13-14 | Lines 10-12 | Lines 12-14 |
| `formatPercent` | Lines 112-114 | - | Lines 19-22 | Lines 11-28 | Lines 16-17 | - | - |

**Total duplicated lines:** ~60 lines across 7 files

## Proposed Solutions

### Option A: Extract to shared utils module (Recommended)
```typescript
// src/utils/formatters.ts
export const formatCurrency = (value: number): string =>
  `$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

export const formatPercent = (value: number): string =>
  `${(value * 100).toFixed(2)}%`;

export const formatWithCommas = (value: number): string =>
  value.toLocaleString(undefined, { maximumFractionDigits: 0 });

export const parseFormattedNumber = (value: string): number => {
  const parsed = Number(value.replace(/,/g, ''));
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.min(parsed, 1e15);
};
```
- **Pros:** Single source of truth, easy to enhance (bounds checking)
- **Cons:** Import needed in each file
- **Effort:** Small (1 hour)
- **Risk:** Low

## Recommended Action

[To be filled during triage]

## Technical Details

**New file to create:**
- `src/utils/formatters.ts`

**Files to update:**
- `src/Calculator.tsx`
- `src/components/StickyHeader.tsx`
- `src/components/ResultsSummary.tsx`
- `src/ResultsTable.tsx`
- `src/AdvancedMode/YearByYearPlanning.tsx`
- `src/AdvancedMode/SettingsPanel.tsx`
- `src/AdvancedMode/SensitivityAnalysis.tsx`
- `src/AdvancedMode/StrategyComparison.tsx`

## Acceptance Criteria

- [ ] All formatting functions in single `src/utils/formatters.ts`
- [ ] All components import from shared location
- [ ] No duplicate function definitions remain
- [ ] Input validation (from P1 issue) added to parseFormattedNumber

## Work Log

| Date | Action | Result/Learning |
|------|--------|-----------------|
| 2026-01-26 | Identified during pattern analysis | ~60 lines duplicated |

## Resources

- Pattern Recognition Specialist agent report
