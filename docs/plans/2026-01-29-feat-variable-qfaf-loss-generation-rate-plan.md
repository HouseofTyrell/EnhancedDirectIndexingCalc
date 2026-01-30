---
title: "feat: Variable QFAF Loss Generation Rate Modeling"
type: feat
date: 2026-01-29
---

# Variable QFAF Loss Generation Rate Modeling

## Overview

The QFAF sizing currently assumes a fixed 150% loss generation rate (the `QFAF_ORDINARY_LOSS_RATE` and `QFAF_ST_GAIN_RATE` constants). This 150% figure comes from simplified historical QFAF performance. With the historical performance reference tables now in place, users should be able to model what happens when loss generation deviates from 150% — e.g., what if QFAF only generates 120% or hits 170%?

This feature adds a loss generation rate control to the QFAF Test page, allowing users to see how varying rates affect ordinary losses, tax savings, carryforwards, and net benefit across all projection years.

## Problem Statement

- The 150% rate is a historical average, but actual performance varies year-to-year (the annual breakdown shows ST cap gain rates ranging from ~40% to ~153%)
- Users cannot currently stress-test the model against different loss generation scenarios on the test page
- The main calculator's `AdvancedSettings` already has a `qfafMultiplier` field, but the QfafTestByYear component uses a hardcoded import of `QFAF_ORDINARY_LOSS_RATE` instead

## Proposed Solution

Add a **loss generation rate slider** to the QfafTestByYear assumptions panel that replaces the hardcoded `QFAF_ORDINARY_LOSS_RATE` in the component's calculations. This lets users model scenarios like:

- **Bear case**: 120% loss generation (underperformance)
- **Base case**: 150% loss generation (historical average)
- **Bull case**: 170% loss generation (outperformance)

### UI Change

Add a slider input to the existing assumptions section in QfafTestByYear:

- **Label**: "QFAF Loss Generation Rate"
- **Range**: 100% to 200% (step: 5%)
- **Default**: 150%
- **Display**: Show current value as percentage (e.g., "150%")
- **Style**: Match existing editable-cell / slider patterns in the assumptions panel

### Calculation Change

In `computeYearResults()` inside `QfafTestByYear.tsx`:

- Replace the imported `QFAF_ORDINARY_LOSS_RATE` usage at line ~204 with the user-selected rate
- The line `const annualEstOrdinaryLosses = qfafSubscriptionSize * QFAF_ORDINARY_LOSS_RATE` becomes `const annualEstOrdinaryLosses = qfafSubscriptionSize * assumptions.lossGenerationRate`
- The ST losses matching logic (`stLossesNeeded = annualEstOrdinaryLosses`) flows through automatically

### Files to Change

| File | Change |
|------|--------|
| `src/AdvancedMode/QfafTestByYear.tsx` | Add `lossGenerationRate` to `Assumptions` interface, add slider to UI, use in `computeYearResults()` |
| `src/AdvancedMode/QfafTestByYear.css` | Minor styling if needed for the new slider row |

## Acceptance Criteria

- [ ] New "QFAF Loss Generation Rate" slider in assumptions panel (100%–200%, step 5%, default 150%)
- [ ] Changing the rate updates all year-by-year calculations reactively
- [ ] At 150%, results match current behavior exactly (no regression)
- [ ] Historical performance tables remain unchanged (reference data only)
- [ ] Slider value displays as percentage

## Technical Considerations

- The `QFAF_ORDINARY_LOSS_RATE` import from `strategyData.ts` should still be used as the **default value** — just not hardcoded in the calculation
- This change is scoped to QfafTestByYear only; the main calculator already has its own `qfafMultiplier` in `AdvancedSettings`
- The `computeYearResults` function already receives `assumptions` as a parameter, so threading the new value through is straightforward

## References

- `src/strategyData.ts:162-163` — `QFAF_ST_GAIN_RATE` and `QFAF_ORDINARY_LOSS_RATE` constants
- `src/AdvancedMode/QfafTestByYear.tsx:204` — current hardcoded usage
- `src/types.ts:226` — `DEFAULT_SETTINGS.qfafMultiplier` (main calculator equivalent)
- `src/Calculator.tsx:393-430` — existing slider patterns for QFAF sizing controls
