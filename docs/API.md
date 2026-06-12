# Calculation Layer API Reference

Public surface of the calculation engine, re-exported from
`src/calculations/index.ts`. All functions are pure (no React, no DOM); custom
strategy-rate overrides are read from localStorage via `utils/strategyRates.ts`.
Signatures below are copied from the source — see `docs/ARCHITECTURE.md` for how they
compose.

## Projection

### `calculate(inputs, settings?)` — `core.ts`

```typescript
function calculate(
  inputs: CalculatorInputs,
  settings: AdvancedSettings = DEFAULT_SETTINGS
): CalculationResult;
```

Standard projection. Thin wrapper over `calculateWithOverrides(inputs, settings, [])` —
there is exactly one projection loop.

### `calculateWithOverrides(inputs, settings?, overrides?)` — `core.ts`

```typescript
function calculateWithOverrides(
  inputs: CalculatorInputs,
  settings: AdvancedSettings = DEFAULT_SETTINGS,
  overrides: YearOverride[] = []
): CalculationResult;
```

The unified loop. Per-year overrides supply income changes, cash infusions (gross or
net), and planned gain events. Behaviors baked into the loop:

- Auto-extends to at least QFAF duration + 2 wind-down years (D-004); partial-year
  starts add one calendar year.
- **NOL run-until-used** (D-013): if NOL remains at the end of the standard horizon, the
  projection keeps adding wind-down years until it is consumed — hard cap 40 years,
  stall guard (stops if an extension year uses no NOL), extension years continue the
  final scheduled year's income.
- Dynamic QFAF resizing, terminal unwind proceeds (`qfafCashReturned`), optional
  redeployment (`inputs.redeployQfafProceeds`).
- Split allocation and deleverage schedules are resolved here and fed to `calculateYear`
  through the `CalculateYearOverrides` hook (split wins over a deleverage plan in v1).

### `calculateWithSensitivity(inputs, settings?, sensitivity?)` — `sensitivity.ts`

```typescript
function calculateWithSensitivity(
  inputs: CalculatorInputs,
  settings: AdvancedSettings = DEFAULT_SETTINGS,
  sensitivity: SensitivityParams = DEFAULT_SENSITIVITY
): CalculationResult;
```

Stress-test variant: federal/state rate deltas, return override, ST/LT rate variances
amplified by tracking error. Scope limits (by decision): fixed horizon (no NOL
extension) and no deleverage plans, so grid cells stay comparable.

## Sizing

### `calculateSizing(inputs, qfafMultiplier?, washSaleDisallowanceRate?)` — `sizing.ts`

```typescript
function calculateSizing(
  inputs: CalculatorInputs,
  qfafMultiplier?: number,
  washSaleDisallowanceRate: number = 0
): CalculatedSizing;
```

QFAF = (collateral × avg ST loss rate over the sizing window, net of wash-sale) ÷
multiplier, reduced by the cushion. Split-aware (blended rates, per-leg breakdown in
`splitLegs`).

### `solveCollateralForTotal(totalAvailable, inputs, qfafMultiplier?, washSaleDisallowanceRate?)` — `sizing.ts`

```typescript
function solveCollateralForTotal(
  totalAvailable: number,
  inputs: CalculatorInputs,
  qfafMultiplier?: number,
  washSaleDisallowanceRate: number = 0
): number;
```

Total-budget funding mode: returns the collateral C such that C + auto-sized QFAF =
total (C = T / (1 + k), k scale-invariant). Whole budget when QFAF is disabled; budget
minus the override when `qfafOverride` is set.

## Exit tax and EDI insights (post-processing over `CalculationResult`)

### `computeExitTaxAnalysis(result, combinedLtRate, passiveAnnualReturn?, ltcgExcise?, collateralCostBasis?)` — `exitTax.ts`

```typescript
function computeExitTaxAnalysis(
  result: CalculationResult,
  combinedLtRate: number,
  passiveAnnualReturn: number = 0,
  ltcgExcise?: StateTaxProfile['ltcgExcise'],
  collateralCostBasis?: number
): ExitTaxAnalysis;
```

Embedded gain from actual dollar flows: market appreciation + pre-existing gain (when a
cost basis is supplied) + Σ(harvested ST losses − realized LT gains − deleverage gains
already realized). CFs shelter the exit gain dollar-for-dollar; remaining NOL is NOT
applied (kept as separate value). Key fields of `ExitTaxAnalysis`:

- `embeddedGain`, `cumulativeBasisReduction`, `preExistingGain`, `marketAppreciation`
- `remainingCapitalLossCf`, `cfShelterUsed`, `taxableGainAfterShelter`
- `exitTax`, `passiveExitTax`
- `incrementalDeferredTax` — **signed** (`exitTax − passiveExitTax`, deliberately
  unclamped): negative means the strategy exits *cheaper* than passive buy-and-hold
- `netBenefitAfterLiquidation = totalTaxSavings − incrementalDeferredTax`
- `remainingNolCarryforward`, `combinedLtRate`

### `computeEdiInsights(result)` — `ediInsights.ts`

```typescript
function computeEdiInsights(result: CalculationResult): EdiInsights;
```

Returns `finalStCarryforward`, `finalLtCarryforward`, `lossReserveShelterValue`
(contingent — never added to savings), `cumulativeFinancingCost`, `protectionRatio`
(`null` when no financing cost was modeled — display as "—"), and `breakEvenGainEvent`
(largest single gain fully shelterable by the ending CFs).

### `computeStepUpComparison(result, exit)` — `ediInsights.ts`

```typescript
function computeStepUpComparison(
  result: CalculationResult,
  exit: ExitTaxAnalysis
): StepUpComparison;
```

D-018 estate comparison: `netIfHeldToStepUp` (full savings, deferred tax never paid; CF
value disclosed as lost, not netted), `netIfLiquidated`, signed `stepUpAdvantage`,
`continueAndDie` / `unwindBeforeDeath` breakdowns, `recommendation`
(`'continue' | 'unwind' | 'partial_unwind'`), and `optimalUnwindPct` (unwind exactly
enough to consume the CFs).

## Deleveraging — `deleverage.ts`

```typescript
function resolveDeleveragePlan(inputs: CalculatorInputs): ResolvedDeleveragePlan | null;

function resolveDeleverageSchedule(
  inputs: CalculatorInputs,
  settings: AdvancedSettings,
  maxYears: number,
  startMonth?: number,
  qfafDuration?: number
): DeleverageYearSchedule[] | null;

function getExtensionWeight(
  plan: Pick<ResolvedDeleveragePlan, 'startYear' | 'durationYears'>,
  year: number
): number;

const LONG_ONLY_TARGET = 'long-only';
const TRAD_DI_ST_LOSS_RATES: number[];  // canonical long-only TLH schedule
const TRAD_DI_LT_GAIN_RATE = 0.005;
```

`resolveDeleveragePlan` returns `null` when the plan is disabled, malformed, or split
allocation is enabled (split wins in v1). The schedule blends source→target rates with
the extension weight w (1→0 linear glide; `durationYears: 1` = all-at-once), samples the
target schedule *seasoned* at the current year index, and prices financing at the
interpolated leverage ratios.

## Financing — `financing.ts`

```typescript
function getFinancingCostForRatios(
  longLeverage: number,
  shortRatio: number,
  settings: AdvancedSettings
): number;  // 0 when settings.financingFeesEnabled is false

function getEffectiveFinancingCost(strategy: Strategy, settings: AdvancedSettings): number;
```

Ratio-based core shared by strategy lookups, split-leg blends, and glide interpolation.

## Key types (`src/types.ts`)

### `CalculatorInputs`

`filingStatus` (`'single' | 'mfj' | 'mfs' | 'hoh'`), `stateCode`, `stateRate` (used when
`stateCode === 'OTHER'`), `annualIncome`, `strategyId`, `collateralAmount`,
`splitAllocation?`, `existingStLossCarryforward`, `existingLtLossCarryforward`,
`existingNolCarryforward`, `qfafOverride?`, `qfafEnabled`, `qfafSizingYears`,
`qfafSizingCushion`, `qfafDuration`, `qfafSizingMode` (`'fixed' | 'dynamic'`),
`startMonth`, `ltGainsEnabled?` (undefined = enabled), `redeployQfafProceeds?`,
`collateralCostBasis?` (concentrated-stock case), `nycResident?`, `deleveragePlan?`.

### `DeleveragePlan`

`enabled`, `startYear` (≥ 1), `durationYears` (1 = all-at-once), `target`
(`'long-only'` or a strategyId), and the D-017 knobs: `unwindGainCharacter?`
(`'lt' | 'st'`; default LT once seasoned, i.e. `startYear > 2`), `lotSelectionHaircut?`
(default 1.0 = pro-rata), `shortCoverGainPct?` (default 0).

### `YearOverride`

`year`, `w2Income`, `cashInfusion`, `cashInfusionTaxType` (`'gross' | 'net'`), `note`,
`gainEvent?: { amount: number; character: 'st' | 'lt' }` (sheltered event-LAST; tax
never charged against strategy savings).

### `AdvancedSettings` (defaults in `DEFAULT_SETTINGS`)

QFAF: `qfafMultiplier` (1.5), `qfafGrowthEnabled` (true). Harvest:
`washSaleDisallowanceRate` (0). Tax rules: `section461Limits` (512K MFJ / 256K others),
`nolOffsetLimit` (0.80), `niitRate` (0.038), `ltcgRate` (0.20), `stcgRate` (0.37) —
custom ST/LT/NIIT rates replace bracket lookups when changed from defaults. PV (D-006):
`presentValueEnabled` (false), `discountRate` (0.05). Growth: `growthEnabled` (false),
`defaultAnnualReturn` (0.07), `qfafAnnualReturn` (null = same). Financing:
`financingFeesEnabled` (false), `financingMode` (`'simple' | 'detailed'`) plus the
simple (wealth-mgmt 55bps, manager 90bps×short + 14.2bps) and detailed (margin 4.25%,
borrow 0.5%, short dividends 1.5%, advisory 75bps) component rates. `projectionYears`
(10).

### `YearResult` (selected fields)

- Values: `qfafValue`, `collateralValue`, `totalValue`
- QFAF events: `stGainsGenerated`, `ordinaryLossesGenerated`, `usableOrdinaryLoss`,
  `excessToNol`
- Collateral events: `stLossesHarvested`, `ltGainsRealized`, `netStGainLoss`
- Savings: `taxSavings`, `baselineTax`, plus the reconciliation components
  `ordinaryLossBenefit`, `nolUsageBenefit`, `capitalLossBenefit`, `ltGainCost`,
  `remainingStGainCost` (these sum exactly to `taxSavings`)
- Carryforwards: `stLossCarryforward`, `ltLossCarryforward`, `nolCarryforward`,
  `nolUsedThisYear`, `capitalLossUsedAgainstIncome`
- Planning: `incomeOffsetAmount`, `maxIncomeOffsetCapacity`,
  `incomeRequiredForFullUtilization` (min W-2 income that absorbs the §461(l) deduction
  and lets the 80% rule consume the start-of-year NOL)
- Gain events (D-012): `gainEventAmount`, `gainEventTax`,
  `gainEventTaxWithoutStrategy`, `gainEventCfShelter`
- Deleveraging (D-016/D-017): `extensionFraction` (end-of-year extension weight; **1
  when no plan**), `deleverageGainRealized` / `deleverageGainSt` / `deleverageGainLt`,
  `deleverageTax` (reporting decomposition — already inside the gain costs),
  `financingSaved`
- Misc: `qfafCashReturned`, `financingCostPaid`, `stGainLeakage`, `strategyActive`,
  `effectiveStLossRate`

### `CalculationResult.summary`

`totalTaxSavings`, `totalTaxSavingsPV` (D-006), `finalPortfolioValue`,
`finalTotalWealth` (= portfolio + `totalQfafCashReturned`), `effectiveTaxAlpha`,
`totalNolGenerated`, `totalQfafCashReturned`, `finalStCarryforward`,
`finalLtCarryforward`, `lossReserveShelterValue` (final CFs valued at the final year's
combined **gains** rates — contingent, never included in `totalTaxSavings`).

## Conventions

- **Signed `incrementalDeferredTax`**: never clamp it; both signs are meaningful and
  tested.
- **`extensionFraction`** defaults to 1 (fully levered) in every engine; the sensitivity
  grid always reports 1.
- **Contingent vs. realized**: `lossReserveShelterValue` and everything derived from it
  (protection ratio, break-even event) is contingent on future gains. Realized shelter
  only moves into savings when a gain event actually consumes CFs in-projection.
- **Exogenous vs. endogenous** (see ARCHITECTURE.md): D-012 event taxes are reported
  beside savings, never subtracted; deleverage unwind taxes are charged against savings.
- **Rates**: deductions against ordinary income are valued NIIT-free
  (`TaxRates.ordinaryRate`); gains keep NIIT-inclusive rates; state components come from
  `getStateTaxProfile`, character by character.
