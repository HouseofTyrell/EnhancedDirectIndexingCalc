# CLAUDE.md

Tax-impact calculator (QFAF + enhanced direct indexing) for advisors. React 19 + TS +
Vite. Engine in `src/calculations/`, primary UI in `src/workspace/WorkspaceTab.tsx`.

## Commands

- `npm run test:run` — full vitest suite (352 tests). Gate on the raw exit code; NEVER
  pipe vitest output through `grep`/`head` to judge success — colors and reporters make
  that unreliable.
- `npm run build` — `tsc` type-check THEN `vite build` (single-file HTML). A change
  isn't done until this passes.
- `npm run lint` / `npm run lint:fix`, `npm run format` / `npm run format:check` —
  ESLint + Prettier are enforced; run before declaring work complete.
- `npm run dev` — Vite dev server at http://localhost:5173.

## Binding decisions — read `docs/DECISIONS.md` BEFORE proposing changes

The decision log (D-001…D-018 + owner directives) is the single source of truth. Decided
items are constraints; do not re-litigate them. The ones you will hit most:

- **D-001**: never commit to `main` or to `baseline-2026-06-11` (the frozen
  pre-improvement marker; `TaxOptimizationCalculator.html` is its distributable). All
  work lands via PRs on working branches.
- **D-002**: defaults stay simple/high-level and GROSS. Fees, wash sales, PV, and other
  complexity are opt-in. Do not propose flipping `DEFAULT_SETTINGS` defaults on.
- **Audit-complete table directive**: every new per-year engine output MUST be surfaced
  in `src/ResultsTable.tsx` in BOTH orientations (rows and transposed years-as-columns)
  AND get a `popupContent.ts` entry. No silent engine fields.
- Quality bar: when "bigger headline number" conflicts with "defensible to a client's
  CPA," choose defensible.

## The one-engine rule

Any new view or analysis consumes `calculate()` / `calculateWithOverrides()` outputs
(`src/calculations/core.ts`). NEVER write a parallel projection or re-implement
netting — that is how the deleted `ediOnly.ts` produced a 150x disagreement (D-014).
Post-process `CalculationResult` like `exitTax.ts` / `ediInsights.ts` do.

## Attribution conventions (decided; tests enforce them)

- **Exogenous** D-012 gain events (`YearOverride.gainEvent`): sheltered event-LAST
  (strategy gains claim carryforwards first); their tax is reported separately and is
  NEVER charged against `taxSavings`.
- **Endogenous** deleverage unwind gains (D-016/D-017): netted WITH strategy flows
  (current-year harvest first, then CFs per §1211); their tax IS charged against
  `taxSavings`. `deleverageTax` is a reporting decomposition, not a second subtraction.
- `summary.lossReserveShelterValue` is CONTINGENT (CF value at statutory gains rates) —
  never add it to `totalTaxSavings`.
- `incrementalDeferredTax` (exitTax.ts) is SIGNED and deliberately unclamped; negative
  means the strategy exits cheaper than passive. Do not clamp it.
- Deductions against ordinary income are valued NIIT-free (`TaxRates.ordinaryRate`);
  gain costs keep NIIT-inclusive rates.

## State-profile gotchas (`getStateTaxProfile` in `src/taxData.ts`)

- **PA/NJ**: `allowsLossOffsetAgainstIncome: false` — $0 state benefit on ordinary
  deductions/NOL and no individual loss carryforwards, but gains ARE still taxed at the
  state rate. Don't zero the whole state out.
- **MA**: split rates — ST 12.5%, wages/LT 9%. Never use one MA rate for everything.
- **WA**: no income tax but a 7% LTCG excise above the annual exemption (+2.9% surcharge
  tier above $1M taxed gains) via `computeLtcgExcise` — applies to annual gains AND the
  liquidation analysis.
- **CA**: SB 167 suspends the STATE NOL component (year 1 / MAGI ≥ $1M). **NY**: optional
  NYC resident +3.876% on all characters.

## Workflow expectations

- Browser-verify UI changes with Playwright against `npm run dev` — don't claim a UI
  change works from code reading alone.
- Decision-worthy findings (tradeoffs in scope, defaults, presentation, modeling
  philosophy) go through the PM agent (`.claude/agents/pm.md`) to the owner in batches
  of ≤ 4, with options + one recommendation. Plain bugs just get fixed and logged in
  DECISIONS.md's bug list.
- New `CalculatorInputs` fields must round-trip through CSV (`src/utils/csvScenario.ts`,
  covered by `csvScenario.test.ts`) and be reflected in Excel export
  (`src/utils/excelExport.ts`).
- Every new user-visible metric needs a `POPUP_CONTENT` entry in `src/popupContent.ts`.
- Sensitivity grid (`sensitivity.ts`) intentionally skips NOL extension and deleverage
  plans (cells must stay comparable) — keep it that way and keep it mirroring core.ts.
