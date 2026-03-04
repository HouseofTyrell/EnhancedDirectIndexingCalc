# Partial Year Start Feature — Design

## Problem
Advisors pitching new clients mid-year need to model strategy effectiveness when the start date isn't January 1. For example, a client onboarding April 1 only gets 9 months of Year 1 tax-loss harvesting, growth, and financing costs.

## Approach: Year-Fraction Multiplier
Add a `startMonth` input (1–12). Compute `yearFraction = (13 - startMonth) / 12`. Apply this fraction to all Year 1 rate-driven calculations via a `yearFraction` parameter on `calculateYear()`. Years 2+ are unaffected (full years).

## What Gets Pro-Rated (Year 1 Only)
- ST losses harvested: `collateral × stLossRate × yearFraction`
- LT gains realized: `collateral × ltGainRate × yearFraction`
- QFAF ST gains generated: `qfafValue × multiplier × yearFraction`
- QFAF ordinary losses generated: `qfafValue × multiplier × yearFraction`
- Portfolio growth: `(1 + growthRate × yearFraction)` instead of `(1 + growthRate)`
- Financing costs: included in growth rate, so pro-rated automatically
- QFAF sizing: Year 1 contribution to average ST loss rate is pro-rated

## What Stays the Same
- Section 461(l) limits (annual statutory threshold)
- Capital loss deduction limit ($3,000/$1,500)
- NOL offset percentage (80%)
- Year-by-year rate indexing (Year 1 rates still apply, just scaled)
- W2 income (annual, not pro-rated)

## Input Design
- Field: `startMonth: number` on `CalculatorInputs`, default `1` (January)
- UI: Month dropdown in Strategy Selection section, always visible
- Shows remaining months: "April (9 months remaining)"
- January selection = full year (backward compatible, no behavioral change)

## Results Display
- Year 1 label annotated when partial: "Year 1 (9 mo)"
- All other year labels unchanged

## Files Changed
1. `src/types.ts` — Add `startMonth` to `CalculatorInputs`
2. `src/calculations/core.ts` — Add `yearFraction` param to `calculateYear()`, apply in Year 1
3. `src/calculations/sensitivity.ts` — Mirror Year 1 fraction in sensitivity path
4. `src/calculations/sizing.ts` — Pro-rate Year 1 in average ST loss rate calculation
5. `src/components/StrategySelectionInputs.tsx` — Add Start Month dropdown
6. `src/Calculator.tsx` — Wire up `startMonth` state, pass to calculation
7. Tests — Unit + integration coverage

## Edge Cases
- January (startMonth=1): yearFraction=1.0, no change (backward compatible)
- December (startMonth=12): yearFraction=1/12, minimal Year 1 activity
- QFAF dynamic resizing: Year 1 needed QFAF is also pro-rated (less ST losses to match)
- Pinned scenarios: `startMonth` captured in pinned state for comparison
- Sensitivity analysis: same fraction applied in stress-test path
