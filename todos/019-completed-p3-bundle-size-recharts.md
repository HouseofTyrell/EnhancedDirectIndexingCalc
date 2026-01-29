---
status: completed
priority: p3
issue_id: "019"
tags: [code-review, performance, bundle-size]
dependencies: []
---

# Bundle Size - Recharts Contributes ~400KB

## Problem Statement

The production bundle is 625KB, with Recharts + d3 dependencies contributing approximately 400KB. For a relatively simple calculator with 2 charts, this is significant.

## Findings

**Current bundle composition (estimated):**
| Library | Size |
|---------|------|
| React + ReactDOM | ~130KB |
| Recharts + d3 | ~400KB |
| Application code | ~95KB |
| **Total** | **~625KB** |

**Recharts pulls in many d3 packages:**
- d3-array, d3-color, d3-ease, d3-format, d3-interpolate
- d3-path, d3-scale, d3-shape, d3-time, d3-time-format, d3-timer
- victory-vendor

**Build warning:**
```
(!) Some chunks are larger than 500 kB after minification.
```

## Proposed Solutions

### Option A: Lazy load charts (Recommended)
```typescript
const TaxSavingsChart = lazy(() => import('./WealthChart').then(m => ({ default: m.TaxSavingsChart })));
const PortfolioValueChart = lazy(() => import('./WealthChart').then(m => ({ default: m.PortfolioValueChart })));

// In JSX
<Suspense fallback={<div>Loading chart...</div>}>
  <TaxSavingsChart data={results.years} />
</Suspense>
```
- **Pros:** Faster initial load, deferred ~400KB
- **Cons:** Flash of loading state for charts
- **Effort:** Small (1 hour)
- **Risk:** Low

### Option B: Replace with lightweight alternative
Consider `uplot` (8KB) or `chart.js` (63KB).
- **Pros:** Massive size reduction
- **Cons:** Migration effort, different API
- **Effort:** High (4-8 hours)
- **Risk:** Medium

### Option C: Use native SVG for simple charts
For line/area charts, handwritten SVG could be sufficient.
- **Pros:** Zero dependency
- **Cons:** Need to implement charting features
- **Effort:** High (4-8 hours)
- **Risk:** Medium

## Recommended Action

[To be filled during triage]

## Technical Details

**Affected files:**
- `src/WealthChart.tsx`
- `src/Calculator.tsx` (if lazy loading)

## Acceptance Criteria

- [ ] Initial bundle reduced below 500KB warning threshold
- [ ] Charts still render correctly
- [ ] No significant UX degradation

## Work Log

| Date | Action | Result/Learning |
|------|--------|-----------------|
| 2026-01-26 | Identified during performance review | 400KB from charts |

## Resources

- Performance Oracle agent report
- Vite build output
