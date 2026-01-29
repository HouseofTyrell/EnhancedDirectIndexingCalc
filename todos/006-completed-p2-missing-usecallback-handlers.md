---
status: completed
priority: p2
issue_id: "006"
tags: [code-review, performance, react]
dependencies: []
---

# Missing useCallback for Event Handlers

## Problem Statement

Event handlers in Calculator.tsx are recreated on every render, causing unnecessary re-renders of child components that receive these handlers as props.

## Findings

**Location:** `src/Calculator.tsx:76-106`

```typescript
// These are recreated on every render:
const updateInput = <K extends keyof CalculatorInputs>(...) => { ... };
const resetYearOverrides = () => { ... };
const resetAdvancedSettings = () => { ... };
const resetSensitivityParams = () => { ... };
const formatCurrency = (value: number) => { ... };
const formatPercent = (value: number) => { ... };
```

**Impact:** Child components like `YearByYearPlanning`, `SensitivityAnalysis`, `SettingsPanel` re-render when Calculator re-renders, even if their props haven't changed semantically.

## Proposed Solutions

### Option A: Wrap handlers in useCallback (Recommended)
```typescript
const updateInput = useCallback(<K extends keyof CalculatorInputs>(
  key: K,
  value: CalculatorInputs[K]
) => {
  setInputs(prev => ({ ...prev, [key]: value }));
  // ...
}, [inputs.annualIncome]);  // Only dependency needed for the side effect

const resetYearOverrides = useCallback(() => {
  setYearOverrides(generateDefaultOverrides(inputs.annualIncome));
}, [inputs.annualIncome]);
```
- **Pros:** Prevents unnecessary child re-renders
- **Cons:** Slightly more complex code
- **Effort:** Medium (1-2 hours)
- **Risk:** Low

### Option B: Move formatters outside component
```typescript
// Top of file, outside component
const formatCurrency = (value: number) => `$${value.toLocaleString(...)}`;
const formatPercent = (value: number) => `${(value * 100).toFixed(2)}%`;
```
- **Pros:** Zero overhead, simpler
- **Cons:** Only works for pure functions
- **Effort:** Small (30 minutes)
- **Risk:** Low

## Recommended Action

[To be filled during triage]

## Technical Details

**Affected files:**
- `src/Calculator.tsx`

**Child components affected:**
- `YearByYearPlanning`
- `SensitivityAnalysis`
- `SettingsPanel`
- `StrategyComparison`

## Acceptance Criteria

- [ ] Event handlers are wrapped in useCallback with correct dependencies
- [ ] Pure formatters moved outside component
- [ ] Child components don't re-render when parent state unrelated to them changes

## Work Log

| Date | Action | Result/Learning |
|------|--------|-----------------|
| 2026-01-26 | Identified during performance review | Re-render inefficiency |

## Resources

- Performance Oracle agent report
