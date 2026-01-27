# API Reference

This document describes the public API for the Tax Optimization Calculator.

## Calculations (`src/calculations.ts`)

### `calculateSizing(inputs)`

Calculate QFAF sizing based on strategy selection and collateral amount.

**Parameters:**
- `inputs: CalculatorInputs` - User inputs including strategy, collateral, and filing status

**Returns:** `CalculatedSizing`

```typescript
interface CalculatedSizing {
  strategyId: string;           // Selected strategy ID
  strategyName: string;         // Display name (e.g., "Core 145/45")
  strategyType: 'core' | 'overlay';
  collateralValue: number;      // Input collateral amount
  qfafValue: number;            // Auto-sized QFAF position
  qfafMaxValue: number;         // Maximum allowed QFAF
  totalExposure: number;        // collateralValue + qfafValue
  qfafRatio: number;            // qfafValue / collateralValue
  year1StLosses: number;        // Collateral ST losses (Year 1)
  year1StGains: number;         // QFAF ST gains (Year 1)
  year1OrdinaryLosses: number;  // QFAF ordinary losses (Year 1)
  year1UsableOrdinaryLoss: number; // After Section 461(l) limit
  year1ExcessToNol: number;     // Excess → NOL carryforward
  section461Limit: number;      // Filing status limit ($256K/$512K)
}
```

**Formula:**
```
QFAF = (Collateral × ST_Loss_Rate) / 150%
```

---

### `calculate(inputs, settings)`

Main calculation entry point. Generates 10-year projections.

**Parameters:**
- `inputs: CalculatorInputs` - User inputs
- `settings: AdvancedSettings` - Advanced settings (optional, uses defaults)

**Returns:** `CalculationResult`

```typescript
interface CalculationResult {
  sizing: CalculatedSizing;     // Strategy sizing details
  years: YearResult[];          // 10 years of projections
  summary: {
    totalTaxSavings: number;    // Sum of all years
    finalPortfolioValue: number; // Year 10 portfolio value
    effectiveTaxAlpha: number;  // Annualized tax benefit %
    totalNolGenerated: number;  // Cumulative NOL created
  };
}
```

---

## Tax Data (`src/taxData.ts`)

### `getFederalStRate(income, filingStatus)`

Get federal marginal rate for ordinary income and short-term gains.

**Parameters:**
- `income: number` - Annual taxable income
- `filingStatus: FilingStatus` - 'single' | 'mfj' | 'mfs' | 'hoh'

**Returns:** `number` - Decimal rate (e.g., 0.37 for 37%)

**Notes:**
- Includes NIIT (3.8%) for incomes above threshold
- Uses 2026 federal tax brackets

---

### `getFederalLtRate(income, filingStatus)`

Get federal marginal rate for long-term capital gains.

**Parameters:**
- `income: number` - Annual taxable income
- `filingStatus: FilingStatus`

**Returns:** `number` - Decimal rate (0%, 15%, or 20% + NIIT)

---

### `getStateRate(stateCode)`

Get state income tax rate.

**Parameters:**
- `stateCode: string` - Two-letter state code (e.g., 'CA', 'NY')

**Returns:** `number` - Decimal rate

---

## Strategy Data (`src/strategyData.ts`)

### `getStrategy(id)`

Get strategy definition by ID.

**Parameters:**
- `id: string` - Strategy ID (e.g., 'core-145-45')

**Returns:** `Strategy | undefined`

```typescript
interface Strategy {
  id: string;
  type: 'core' | 'overlay';
  name: string;                 // "Core 145/45"
  label: string;                // "Moderate"
  stLossRate: number;           // Annual ST loss rate
  ltGainRate: number;           // Annual LT gain rate
  trackingError: number;        // Tracking error (decimal)
  trackingErrorDisplay: string; // "1.8-2.0%"
  financingCostRate: number;    // Annual financing cost
}
```

### Constants

| Constant | Value | Description |
|----------|-------|-------------|
| `QFAF_ST_GAIN_RATE` | 1.50 | 150% of MV per year |
| `QFAF_ORDINARY_LOSS_RATE` | 1.50 | 150% of MV per year |
| `LOSS_RATE_DECAY_FACTOR` | 0.93 | 7% annual decay |
| `LOSS_RATE_FLOOR` | 0.30 | Minimum 30% of initial |
| `NOL_OFFSET_PERCENTAGE` | 0.80 | 80% taxable income limit |
| `SECTION_461L_LIMITS` | Record | $256K single, $512K MFJ |
| `CAPITAL_LOSS_LIMITS` | Record | $3K ($1.5K MFS) |

---

## Formatting Utilities (`src/utils/formatters.ts`)

### `formatCurrency(value)`

Format number as USD currency.

```typescript
formatCurrency(1234567) // "$1,234,567"
formatCurrency(-5000)   // "-$5,000"
```

---

### `formatPercent(value)`

Format decimal as percentage.

```typescript
formatPercent(0.0725) // "7.25%"
formatPercent(0.5)    // "50.00%"
```

---

### `formatWithCommas(value)`

Format number with thousands separators.

```typescript
formatWithCommas(1000000) // "1,000,000"
```

---

### `parseFormattedNumber(value)`

Parse formatted string back to number with validation.

```typescript
parseFormattedNumber("1,000,000") // 1000000
parseFormattedNumber("invalid")   // 0
parseFormattedNumber("-5000")     // 0 (negative rejected)
```

**Validation:**
- Returns 0 for NaN, Infinity, or negative values
- Caps at `MAX_FINANCIAL_VALUE` (1e15)

---

### `safeNumber(value, fallback)`

Ensure a finite number, with fallback.

```typescript
safeNumber(NaN, 0)      // 0
safeNumber(Infinity, 0) // 0
safeNumber(42, 0)       // 42
```

---

## Strategy Rate Utilities (`src/utils/strategyRates.ts`)

### `getNetCapitalLossRate(strategyId, year)`

Get effective net capital loss rate for a strategy and year.

**Parameters:**
- `strategyId: string` - Strategy ID
- `year: number` - Year number (1-10)

**Returns:** `number` - Net capital loss rate (ST loss - LT gain)

**Notes:**
- Checks for custom overrides in localStorage
- Falls back to decay formula: `baseRate × 0.93^(year-1)`
- Enforces 30% floor

---

### `loadRateOverrides()`

Load custom rate overrides from localStorage.

**Returns:** `StrategyRateOverrides` - Map of `{strategyId-year: rate}`

---

### `saveRateOverrides(overrides)`

Save custom rate overrides to localStorage.

---

### `clearRateOverrides()`

Remove all custom rate overrides.

---

## Custom Hooks

### `useAdvancedMode()`

Manage advanced mode state with localStorage persistence.

```typescript
const advancedMode = useAdvancedMode();

advancedMode.enabled           // boolean
advancedMode.toggleEnabled()   // Toggle on/off
advancedMode.sections          // { settings, yearPlanning, ... }
advancedMode.toggleSection('settings')
```

---

### `useQualifiedPurchaser()`

Track qualified purchaser acknowledgment.

```typescript
const qp = useQualifiedPurchaser();

qp.isAcknowledged  // boolean
qp.acknowledge()   // Set acknowledged
```

---

### `useScrollHeader(sentinelId)`

Track scroll position for sticky header expansion.

```typescript
const { isExpanded } = useScrollHeader('scroll-sentinel');
// isExpanded = true when sentinel is above viewport
```

---

## Types (`src/types.ts`)

### `CalculatorInputs`

```typescript
interface CalculatorInputs {
  strategyId: string;
  collateralAmount: number;
  annualIncome: number;
  filingStatus: FilingStatus;
  stateCode: string;
  stateRate: number;           // Custom rate when stateCode='OTHER'
  qfafEnabled: boolean;
  qfafOverride?: number;       // Manual QFAF override
  stLossCarryforward: number;
  ltLossCarryforward: number;
  nolCarryforward: number;
}
```

### `YearResult`

```typescript
interface YearResult {
  year: number;
  collateralValue: number;
  qfafValue: number;
  totalValue: number;
  stLossesGenerated: number;
  ltGainsRealized: number;
  stGainsGenerated: number;
  ordinaryLossGenerated: number;
  taxSavings: number;
  cumulativeTaxSavings: number;
  stLossCarryforward: number;
  ltLossCarryforward: number;
  nolCarryforward: number;
  nolUsed: number;
  effectiveStLossRate: number;
  financingCost: number;
  baselineTax: number;
}
```

### `FilingStatus`

```typescript
type FilingStatus = 'single' | 'mfj' | 'mfs' | 'hoh';
```

### `AdvancedSettings`

```typescript
interface AdvancedSettings {
  annualReturn: number;        // Default: 0.07 (7%)
  projectionYears: number;     // Default: 10
  inflationRate: number;       // Default: 0.02
  qfafMultiplier: number;      // Default: 1.5
  nolOffsetLimit: number;      // Default: 0.80
  capitalLossLimit: number;    // Default: 3000
  defaultAnnualReturn: number; // Default: 0.07
  trackingErrorMultiplier: number; // Default: 1.0
  niitRate: number;            // Default: 0.038
}
```
