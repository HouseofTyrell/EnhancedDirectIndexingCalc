# Architecture

Engine-first description of the Enhanced Direct Indexing Calculator. The decision log
(`docs/DECISIONS.md`) is the source of truth for *why* things are the way they are; this
document describes *how* they fit together. For exact signatures see `docs/API.md`.

## Data flow

```
CalculatorInputs + AdvancedSettings (+ YearOverride[])
        │
        ▼
calculate() / calculateWithOverrides()        src/calculations/core.ts
        │
        ├── resolveAllocation()               splitAllocation.ts (legs: single or Core+Overlay)
        ├── calculateSizing()                 sizing.ts (QFAF auto-size)
        ├── resolveDeleverageSchedule()       deleverage.ts (per-year glide, if a plan is on)
        ├── per year: calculateYear()
        │       ├── getStateTaxProfile()      taxData.ts (per-state character rates, D-005)
        │       ├── calculateCarryforwards()  helpers.ts (§1211/§1212/§461(l)/NOL ordering)
        │       └── getEffectiveFinancingCost() / getFinancingCostForRatios()  financing.ts
        └── calculateSummary()                helpers.ts
        │
        ▼
CalculationResult { sizing, years: YearResult[], summary }
        │
        ├── computeExitTaxAnalysis()          exitTax.ts (post-processing, pure over result)
        ├── computeEdiInsights() / computeStepUpComparison()   ediInsights.ts
        └── UI (WorkspaceTab, Calculator, ResultsTable, charts, Meeting Mode)
```

`calculate()` is a thin wrapper over `calculateWithOverrides(inputs, settings, [])`.
There used to be two near-identical projection loops (`core.ts` and a separate
`overrides.ts`) plus a third inline copy; they repeatedly drifted apart and were
consolidated into exactly **one loop** in `core.ts`. `sensitivity.ts` keeps its own
variance-adjusted loop that mirrors `core.ts` line-for-line (a known, documented
duplication — see Bugs #8 in DECISIONS.md).

## The one-engine rule

**Any new view consumes `calculate()` outputs. Never build a parallel projection.**

This is the lesson of the deleted `src/calculations/ediOnly.ts` (D-014): a second
EDI-only engine disagreed with the Workspace by ~150x on the same client. The fix was to
delete the tab and its engine, and re-express its unique analytics (`ediInsights.ts`,
`exitTax.ts`) as **pure functions over `CalculationResult`**. Follow that pattern: new
analyses post-process `YearResult[]`/`summary`, never re-net losses or re-project values.

## Module map — `src/calculations/`

| Module | Role |
|---|---|
| `core.ts` | The unified projection loop: `calculate`, `calculateWithOverrides`, `calculateYear`, the `CalculateYearOverrides` per-year hook (blended rates, gain events, unwind gains). Handles partial-year starts, dynamic QFAF resizing, terminal unwind, redeployment, and the NOL run-until-used extension (D-013: extends past the horizon until NOL is consumed; 40-year hard cap; stall guard; extension years continue the final scheduled income). |
| `helpers.ts` | `calculateCarryforwards` — the single netting implementation: ST CF→ST gains, LT CF→LT gains, cross-apply per §1211, current-year ST loss handling, **event gains sheltered LAST**, $3K/$1.5K against income, NOL at the 80% limit. Also `calculateSummary`, calendar-year rate blending, operating fractions. |
| `sizing.ts` | `calculateSizing` (QFAF = harvestable ST losses ÷ multiplier, net of wash-sale and cushion) and `solveCollateralForTotal` (total-budget funding: C = T / (1 + k)). |
| `splitAllocation.ts` | Resolves single vs. Core+Overlay legs; collateral-weighted rate blends feeding the per-year hook. |
| `deleverage.ts` | D-016/D-017 glide-path resolution: extension weight w glides 1→0, per-year blended ST/LT/financing rates (target schedule sampled *seasoned* at the current year index), `LONG_ONLY_TARGET` + canonical trad-DI rates carried over from the retired ediOnly.ts. |
| `financing.ts` | Ratio-based core `getFinancingCostForRatios(longLev, shortRatio)`; strategy lookup and leg blends delegate to it, so interpolated mid-glide books price identically. |
| `exitTax.ts` | `computeExitTaxAnalysis`: embedded gain from actual dollar flows (basis reduction = Σ harvested ST losses − LT gains − deleverage gains already realized, + pre-existing gain from `collateralCostBasis`), CF shelter, exit tax vs. passive baseline, **signed** `incrementalDeferredTax` (deliberately unclamped — negative means the strategy exits cheaper than passive). |
| `ediInsights.ts` | `computeEdiInsights` (loss reserve, protection ratio, break-even gain event) and `computeStepUpComparison` (D-018 hold-to-step-up vs. liquidate vs. optimal partial unwind). Pure over `CalculationResult` + `ExitTaxAnalysis`. |
| `sensitivity.ts` | `calculateWithSensitivity`: rate/return/variance stress grid. Intentionally keeps the fixed horizon (no NOL extension) and ignores deleverage plans so grid cells stay comparable (D-013/D-016). |
| `lossBreakdown.ts` | Monthly/quarterly intra-year loss attribution for display. |
| `types.ts` | `TaxRates` (NIIT-inclusive ST/LT, NIIT-free `ordinaryRate`) and `StrategyRates`. |
| `index.ts` | The public surface (documented in `docs/API.md`). |

Shared domain data lives one level up: `taxData.ts` (2026 federal brackets/LTCG
thresholds per Rev. Proc. 2025-32, state list, `getStateTaxProfile`,
`computeLtcgExcise`), `strategyData.ts` (10 strategies, QFAF constants, decay
factors, leverage-ratio parsers), `types.ts` (all input/result interfaces and
`DEFAULT_SETTINGS`).

## Attribution principles

These are decided conventions (D-012/D-015/D-016/D-017) — do not blur them:

- **Exogenous gain events** (`YearOverride.gainEvent`, D-012): a client's business sale
  or RSU sale. They flow through the real netting **event-LAST** (strategy gains claim
  carryforwards first), absorb the §461(l) deduction and widen the NOL base — but their
  tax is reported separately (`gainEventTax`, `gainEventTaxWithoutStrategy`,
  `gainEventCfShelter`) and **never charged against `taxSavings`**.
- **Endogenous deleverage unwind gains** (D-016/D-017): a cost the strategy itself
  incurs. They net **WITH** the strategy's own flows (current-year harvest first, then
  CFs per §1211) and their tax **is charged against `taxSavings`**. `deleverageTax` is a
  reporting decomposition of dollars already inside `ltGainCost`/`remainingStGainCost`,
  not a second subtraction.
- **Contingent loss-reserve value** (`summary.lossReserveShelterValue`, D-015): the
  ending CF balances valued at the final year's combined *gains* rates (gains rates even
  in PA/NJ, since CFs offset future gains which those states do tax). It is contingent
  on future gains and is **never added to `totalTaxSavings`**.
- **NIIT placement**: deductions against ordinary income (ordinary losses, NOL, $3K) are
  valued at the NIIT-free `ordinaryRate` (§1411); ST/LT gain costs keep NIIT-inclusive
  rates. NOL overflow beyond the ordinary base is valued at LT-without-NIIT.

## State tax profiles (D-005)

`getStateTaxProfile(code, fallbackRate, nycResident)` returns character-specific rates
plus rules; the engine consumes the profile, never raw flat rates:

- **CA** 13.3% all characters; SB 167 NOL suspension (state NOL benefit suppressed in
  projection year 1 / tax year 2026 for MAGI ≥ $1M) via `nolStateSuspension`.
- **NY** 10.9% all characters; §461(l) retained; optional NYC resident +3.876%.
- **PA** 3.07% / **NJ** 10.75%: `allowsLossOffsetAgainstIncome: false` — **$0 state
  benefit on ordinary deductions/NOL, but gains are still taxed** at the state rate.
- **MA** split rates: ST 12.5%, wages/LT 9% (incl. millionaire surtax).
- **WA** no income tax; 7% LTCG excise above a $278K annual exemption with the ESSB 5813
  +2.9% surcharge on taxed gains above $1M (`computeLtcgExcise`), applied to annual
  gains and the liquidation analysis.
- Everything else: flat conformity at the top marginal rate.

## UI layer

- `src/App.tsx` — tab shell. **Workspace is the default**; Classic Calculator second;
  QFAF Test hidden behind `Ctrl+Shift+Q` / `?view=qfaf-test`.
- `src/workspace/WorkspaceTab.tsx` — persistent input rail (Client / Strategy /
  Carryforwards / QFAF overlay / Deleveraging / Model / Per-Year Events / Actions) beside
  a headline metric strip and Overview / Year-by-Year / Charts sub-views. Collateral vs.
  total-budget funding modes. EDI-only mode (QFAF off) swaps in the loss-reserve
  co-headline and EDI economics cards. Per-Year Events editor includes the income
  schedule builder and scenario presets.
- `src/Calculator.tsx` + `src/components/` + `src/AdvancedMode/` — the Classic tab:
  split allocation, sensitivity analysis, year-by-year planning, scenario comparison.
- `src/ResultsTable.tsx` — the **audit-complete** year-by-year table (owner directive):
  every per-year engine output is surfaced, in both orientations (years as rows, and a
  transposed years-as-columns view), with conditional groups (Gain Events, Deleverage).
  New per-year engine outputs MUST be added here, both orientations, plus a
  `popupContent.ts` entry.
- `src/components/MeetingMode/` — full-screen client presentation with the D-008
  disclosure block; launches from the Classic tab and the Workspace Actions group.
- `src/utils/csvScenario.ts` / `excelExport.ts` — scenario CSV round-trip and Excel
  export; new inputs must round-trip through CSV.

## Testing

Vitest (`npm run test:run`), **352 tests across 15 files**, all engine-level or
component-level. The important guard rails:

- Engine parity/regression tests: standard vs. overrides paths agree, custom rates honored
  everywhere, per-state regression tests (CA suspension year 1 vs 2, WA surcharge, 2026
  LTCG boundaries), partial-year starts, NOL extension behaviors (exhaustion, stall
  guard, 40-year cap, income continuation).
- Attribution proofs: a same-year D-012 event still shelters event-last while deleverage
  unwind gains net with strategy flows; exit analysis stays strategy-attributable with a
  cost basis set; signed `incrementalDeferredTax` tested in both signs.
- `src/ediOnly.test.ts` documents the D-014 retirement and keeps the surviving
  financing-cost helper covered.

Type-checking is part of the build (`npm run build` runs `tsc` first). ESLint + Prettier
are enforced (`npm run lint`, `npm run format:check`).
