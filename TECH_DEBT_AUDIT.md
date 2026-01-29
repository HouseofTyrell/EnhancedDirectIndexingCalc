# Tech Debt Audit Report

**Date:** 2026-01-29
**Scope:** Full codebase audit of EnhancedDirectIndexingCalc
**Branch:** `claude/audit-tech-debt-105vM`

---

## 1. Executive Summary

- **Calculator.tsx (1,110 lines) and index.css (5,624 lines) are the two largest maintenance risks.** Calculator owns all state, orchestrates every advanced feature, and is the single most-changed file. The CSS is a monolith with no modular structure.
- **19 tech-debt items already tracked in `/todos/`** with detailed write-ups—but filenames say "pending" while frontmatter says `status: completed`. This metadata mismatch makes the backlog untrustworthy.
- **Duplicate `formatPercent` in SettingsPanel.tsx** (1-decimal local copy) diverges from the shared `utils/formatters.ts` version (2-decimal). The existing todo #009 documents broader duplication that was partially fixed—this leftover was missed.
- **localStorage key naming is inconsistent:** `theme-preference` (kebab), `taxCalc_advancedMode` (prefixed camelCase), `strategy-rate-overrides` (kebab, no prefix). Four different patterns across four keys.
- **No React Error Boundary exists.** A rendering exception in any component will white-screen the entire app.
- **Hardcoded financial constants in QfafTestByYear.tsx** (alpha rates, fees, start year = 2026) are independent of the shared `strategyData.ts`/`types.ts` defaults, creating a hidden divergence risk.
- **`JSON.stringify` used for deep equality** in SettingsPanel.tsx is fragile, order-dependent, and needlessly expensive.
- **JSDoc coverage is split:** reusable `components/` are well-documented; `AdvancedMode/` components and `taxData.ts` utility functions have none.
- **No `.env` documentation** in README, though the project currently needs no env vars—worth stating explicitly so future contributors don't waste time looking.
- **Test coverage floor is 40%.** Good that it exists; the threshold could be raised now that core calculation logic is well-covered.

---

## 2. Prioritized Issues

### P0 — Must Fix (correctness / crash risk)

| # | File / Path | Issue | Why It Matters | Suggested Fix | Effort |
|---|------------|-------|----------------|---------------|--------|
| 1 | _entire app_ | No React Error Boundary | Any render error crashes the whole page with a blank white screen. Users lose all input state. | Add `<ErrorBoundary>` wrapper around `<Calculator />` and `<QfafTestPage />` in `App.tsx`. | S |
| 2 | `todos/*.md` | Filename says "pending" but frontmatter says `status: completed` on all 19 items | Backlog is untrustworthy — impossible to know what's actually done vs. open. Blocks prioritization. | Rename files to match actual status, or fix frontmatter to match reality. Script: `for f in todos/*; do …; done`. | S |

### P1 — High Impact (data integrity / divergence)

| # | File / Path | Issue | Why It Matters | Suggested Fix | Effort |
|---|------------|-------|----------------|---------------|--------|
| 3 | `src/AdvancedMode/SettingsPanel.tsx:12` | Local `formatPercent` duplicates `utils/formatters.ts:57` with **different precision** (1 vs 2 decimals) | Users see inconsistent percentage displays depending on which panel they're in. | Delete local copy; import from `utils/formatters.ts` with `decimals=1` parameter. | S |
| 4 | `src/AdvancedMode/QfafTestByYear.tsx:8-20` | Hardcoded constants (`QFAF_ALPHA_RATE=0.0557`, `START_YEAR=2026`, `ADVISOR_MGMT_FEE_RATE=0.0057`, etc.) | These shadow values in `strategyData.ts` and `types.ts`. A rate change in one place won't propagate. | Import from shared modules or derive from `AdvancedSettings` / `strategyData`. | M |
| 5 | `src/AdvancedMode/SettingsPanel.tsx:33` | `JSON.stringify()` for deep equality check of settings objects | Order-dependent; breaks silently if key order changes; O(n) string allocation on every render. | Use a shallow key-by-key comparison (object is flat) or a tiny `shallowEqual` util. | S |
| 6 | `src/hooks/useDarkMode.ts`, `useAdvancedMode.ts`, `useQualifiedPurchaser.ts`, `utils/strategyRates.ts` | Inconsistent localStorage key naming: `theme-preference`, `taxCalc_advancedMode`, `taxCalc_qpAcknowledged`, `strategy-rate-overrides` | Impossible to enumerate all app keys; no namespace collision protection; makes a "clear all app data" feature harder. | Centralize keys in a `STORAGE_KEYS` constant map with a consistent `taxCalc:` prefix. | S |

### P2 — Medium Impact (maintainability / performance)

| # | File / Path | Issue | Why It Matters | Suggested Fix | Effort |
|---|------------|-------|----------------|---------------|--------|
| 7 | `src/Calculator.tsx` (1,110 lines) | God component — owns all state, renders form + results + charts + 7 advanced panels | Every feature change touches this file; merge conflicts are inevitable; hard to test in isolation. | Extract `<CalculatorForm>`, `<ResultsSection>`, `<AdvancedToolsSection>` sub-components. Use context or a reducer for shared state. | L |
| 8 | `src/index.css` (5,624 lines) | Monolithic stylesheet, no modular structure | Finding the right selector requires full-text search; dead CSS accumulates silently; no scoping. | Split into per-component `.module.css` or co-located CSS files (already done for `QfafTestByYear.css`—extend the pattern). | L |
| 9 | `src/calculations.ts` (896 lines) | Single file for all calculation logic | Hard to navigate; mixing sizing, year-by-year, sensitivity, and scenario code. | Split into `sizing.ts`, `yearProjection.ts`, `sensitivity.ts`, `scenarios.ts` under a `calculations/` directory, re-exporting from `index.ts`. | M |
| 10 | `src/AdvancedMode/*` components | No `React.memo` on any AdvancedMode component | These re-render on every Calculator state change even when their props haven't changed. | Wrap each export in `React.memo`. Props are already value/callback — memoization is safe. | S |
| 11 | `src/Calculator.tsx:85-88` | Default comparison strategies hardcoded as string IDs (`'core-145-45'`, `'core-130-30'`) | If strategy IDs change, this silently breaks with no type error. | Use `STRATEGIES[0].id` / `STRATEGIES[1].id` or a typed enum/const for strategy IDs. | S |
| 12 | `src/InfoPopup.tsx` (483 lines) | Three components (`InfoPopup`, `FieldInfoPopup`, `InfoText`) plus formula components in one file | File is large and mixes generic popup logic with domain-specific formula renderers. | Extract formula components (`QfafSizingFormula`, `StrategyRatesFormula`, `ProjectionFormula`) to `src/components/Formulas/`. | M |
| 13 | _all hooks_ | Silent `catch {}` blocks for localStorage errors | Users don't know their preferences failed to save. State resets on next visit with no explanation. | Log to `console.warn` at minimum; consider a toast/banner for persistent failures. | S |

### P3 — Low Impact (polish / conventions)

| # | File / Path | Issue | Why It Matters | Suggested Fix | Effort |
|---|------------|-------|----------------|---------------|--------|
| 14 | `src/AdvancedMode/SensitivityAnalysis.tsx`, `ScenarioAnalysis.tsx`, `YearByYearPlanning.tsx`, `StrategyRateEditor.tsx` | Props interfaces have no JSDoc comments | Inconsistent with `components/` directory where props are fully documented. | Add `/** */` comments matching the pattern in `TaxRatesDisplay.tsx`. | S |
| 15 | `src/taxData.ts:66,149,169` | Exported functions `getStateRate`, `getFederalStRate`, `getFederalLtRate` have no JSDoc | These are core API functions consumed by calculations.ts; undocumented parameter semantics. | Add JSDoc with `@param` and `@returns` tags. | S |
| 16 | `src/utils/strategyRates.ts` | 7 exported functions with no JSDoc | Public API surface is undocumented. | Add JSDoc to all exports. | S |
| 17 | `README.md` | No mention of env vars (even to say "none required") | New contributors waste time looking for `.env.example`. | Add a one-line note: "No environment variables are required for local development." | S |
| 18 | `vitest.config.ts` | Coverage threshold at 40% | Core calculation logic is well-tested; threshold could be 60%+ now. | Raise incrementally: 50% → 60% as coverage improves. | S |
| 19 | `src/AdvancedMode/QfafTestByYear.tsx:70-74` | Hardcoded default values (`1000000`, `4700000`, `0.541`) for test page inputs | If defaults change in `types.ts`, this page shows stale values. | Import from `DEFAULTS` or derive from `types.ts`. | S |
| 20 | `TaxOptimizationCalculator.html` (673 KB) | Pre-built distribution HTML checked into repo | Bloats git history; stale the moment any source changes; confusing whether it's source or artifact. | Add to `.gitignore`; generate in CI only. Or document why it's committed (offline distribution). | S |

---

## 3. Quick Wins (< 30 minutes each)

1. **Add Error Boundary** — Create a 20-line `ErrorBoundary.tsx`, wrap in `App.tsx`. (P0 #1)
2. **Fix todo file metadata** — One-liner script to align filenames with frontmatter status. (P0 #2)
3. **Delete local `formatPercent` in SettingsPanel.tsx** — Replace with `import { formatPercent } from '../utils/formatters'` using `decimals=1`. (P1 #3)
4. **Replace `JSON.stringify` comparison** — Write 5-line `shallowEqual` or inline key comparison in SettingsPanel.tsx. (P1 #5)
5. **Centralize localStorage keys** — Create `src/constants/storageKeys.ts` with 4 key definitions; update 4 files. (P1 #6)
6. **Add `React.memo` to AdvancedMode components** — Wrap 7 component exports; no logic changes. (P2 #10)
7. **Use typed strategy references** — Replace hardcoded `'core-145-45'` strings with `STRATEGIES[n].id`. (P2 #11)
8. **Add JSDoc to AdvancedMode props** — Copy pattern from `TaxRatesDisplay.tsx`; ~30 lines total. (P3 #14)
9. **Add "no env vars" note to README** — One line. (P3 #17)
10. **Add JSDoc to taxData.ts exports** — 3 functions, ~15 lines. (P3 #15)

---

## 4. Recommended Conventions / Style Guide

### File & Folder Structure
- **One component per file.** If a file has 2+ exported components, split them.
- **Co-locate CSS:** Use `ComponentName.css` alongside `ComponentName.tsx` (pattern already established with `QfafTestByYear.css`). Migrate away from the monolithic `index.css` over time.
- **Group by feature:** `AdvancedMode/` is a good example. Apply the same pattern if new feature areas emerge.

### Naming
- **Files:** PascalCase for components (`Calculator.tsx`), camelCase for utilities (`formatters.ts`), camelCase for hooks (`useAdvancedMode.ts`). ✓ Already consistent.
- **localStorage keys:** Use `taxCalc:<feature>` prefix with kebab-case: `taxCalc:theme`, `taxCalc:advanced-mode`, `taxCalc:qp-acknowledged`, `taxCalc:rate-overrides`.
- **Props interfaces:** Always `<ComponentName>Props` with JSDoc on every field.
- **Event handlers:** `on<Event>` for props, `handle<Event>` for internal functions. ✓ Already mostly consistent.

### TypeScript
- **No `any`** — enforced by ESLint (`warn` → change to `error`).
- **No non-null assertions (`!`)** except where a preceding type-guard makes it provably safe.
- **Prefer `satisfies`** over `as` for type narrowing.
- **Export types alongside their module** (co-location over barrel files).

### State Management
- **localStorage-backed state:** Always go through a custom hook (`useXxx`). Never call `localStorage` directly in components.
- **Shared constants:** Single source in `types.ts` or `constants/`. Never re-declare defaults in component files.

### CSS
- **Use CSS custom properties** for all colors, spacing, shadows (already done well in `:root`).
- **BEM-like naming** for class selectors (already in use).
- **No inline styles** except for truly dynamic values (e.g., computed widths). ✓ Already enforced.
- **`transition: all`** — never use it; always list specific properties.

### Testing
- **Calculation logic:** Unit tests with known inputs/outputs (well-covered).
- **Components:** At minimum, smoke-test render + key interactions.
- **Coverage floor:** Raise to 50% in next sprint, 60% after.

### Documentation
- **Every exported function** gets a JSDoc block with `@param` and `@returns`.
- **Every Props interface** gets `/** */` on each field.
- **README** stays updated with any new setup steps, scripts, or env vars.

---

## 5. Follow-up Questions / Unknowns

1. **Are the 19 `/todos/` items actually completed or still pending?** The filenames say "pending" but frontmatter says `status: completed`. Which is the source of truth? This needs to be resolved before planning sprints.

2. **Is `TaxOptimizationCalculator.html` intentionally committed?** It's a 673 KB pre-built artifact. If it's meant for offline distribution (e.g., emailing to advisors), it should be documented. If it's just a build artifact, add it to `.gitignore`.

3. **What's the target browser matrix?** `tsconfig` targets ES2020, which excludes IE11 but still covers modern browsers. Are there specific Safari/mobile requirements given the financial advisor audience?

4. **Is the 40% coverage threshold a temporary floor or a conscious choice?** Core calculations have excellent test coverage, but component tests are sparse. Raising the floor would catch regressions.

5. **Should `AdvancedSettings` actually be wired into calculations?** Todo #008 flags that advanced settings may not flow through to all calculation paths. Is this a known limitation or a bug?

6. **Are the hardcoded rates in `QfafTestByYear.tsx` (alpha=5.57%, financing=0.536%) intentionally different from the main calculator's rates?** If the test page is meant to validate the main calculator, divergent constants defeat that purpose.

7. **Is there a plan to add routing (React Router)?** Currently the app uses manual view state (`'calculator' | 'qfaf-test'`). If more pages are planned, a router would prevent the pattern from scaling poorly.

8. **Who maintains the `docs/brainstorms/` and `docs/plans/` directories?** There are 10 planning docs. Are they living documents or historical artifacts? If historical, consider moving to a `docs/archive/` folder.
