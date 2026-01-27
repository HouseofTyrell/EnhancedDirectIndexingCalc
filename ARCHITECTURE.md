# Architecture Overview

This document describes the architecture and data flow of the Tax Optimization Calculator.

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Calculator.tsx                        │
│                    (Main Application State)                  │
├─────────────────────────────────────────────────────────────┤
│  Inputs (CalculatorInputs)  →  calculate()  →  Results     │
└─────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┴───────────────┐
              ▼                               ▼
      ┌──────────────┐               ┌──────────────┐
      │ calculations │               │   Display    │
      │    Engine    │               │  Components  │
      └──────────────┘               └──────────────┘
```

## Directory Structure

```
src/
├── Calculator.tsx          # Main container component
├── calculations.ts         # Core calculation engine
├── types.ts                # TypeScript interfaces
├── taxData.ts              # Federal/state tax rates
├── strategyData.ts         # Strategy definitions & constants
│
├── components/             # Display components
│   ├── ResultsSummary.tsx  # Summary cards
│   ├── TaxRatesDisplay.tsx # Tax rate display
│   ├── StickyHeader.tsx    # Scroll-aware header
│   └── ...
│
├── AdvancedMode/           # Advanced planning tools
│   ├── YearByYearPlanning.tsx
│   ├── SensitivityAnalysis.tsx
│   ├── StrategyComparison.tsx
│   └── ...
│
├── hooks/                  # Custom React hooks
│   ├── useAdvancedMode.ts  # Advanced mode state
│   ├── useQualifiedPurchaser.ts
│   └── useScrollHeader.ts
│
└── utils/                  # Utility functions
    ├── formatters.ts       # Number formatting
    └── strategyRates.ts    # Rate override management
```

## Data Flow

### 1. User Input → State

```
User Input
    │
    ▼
Calculator.tsx (useState)
    │
    ├── inputs: CalculatorInputs
    ├── advancedSettings: AdvancedSettings
    ├── sensitivityParams: SensitivityParams
    └── yearOverrides: YearOverride[]
```

### 2. State → Calculations

```
CalculatorInputs + AdvancedSettings
    │
    ▼
calculate(inputs, settings)
    │
    ├── calculateSizing(inputs)     # QFAF auto-sizing
    │       │
    │       └── Returns: CalculatedSizing
    │
    ├── calculateYear() × 10        # Year-by-year projections
    │       │
    │       ├── calculateTax()      # Tax liability
    │       └── calculateCarryforwards()
    │
    └── Returns: CalculationResult
            │
            ├── sizing: CalculatedSizing
            ├── years: YearResult[]
            └── summary: { totalTaxSavings, finalPortfolioValue, ... }
```

### 3. Calculations → Display

```
CalculationResult
    │
    ├── ResultsSummary         ← summary
    ├── TaxRatesDisplay        ← computed tax rates
    ├── ResultsTable           ← years[]
    ├── TaxSavingsChart        ← years[]
    └── PortfolioValueChart    ← years[]
```

## Key Components

### Calculator.tsx (916 lines)

The main container component that:
- Manages all application state
- Orchestrates the calculation pipeline
- Renders the form and results sections

**State Management:**
```typescript
const [inputs, setInputs] = useState<CalculatorInputs>(DEFAULTS);
const advancedMode = useAdvancedMode();  // localStorage-backed
const results = useMemo(() => calculate(inputs, settings), [inputs, settings]);
```

### calculations.ts

Pure functions for tax calculations:

| Function | Purpose |
|----------|---------|
| `calculateSizing()` | Auto-size QFAF based on collateral ST losses |
| `calculate()` | Main entry point, returns 10-year projection |
| `calculateYear()` | Single year tax calculation |
| `calculateTax()` | Federal + state tax liability |
| `calculateCarryforwards()` | Loss carryforward logic |

### Tax Rate Lookup

```
getFederalStRate(income, filingStatus)
    │
    └── Looks up from FEDERAL_TAX_BRACKETS
        │
        └── Returns marginal rate + NIIT if applicable
```

## State Persistence

### localStorage Keys

| Key | Hook | Purpose |
|-----|------|---------|
| `taxCalc_advancedMode` | useAdvancedMode | Advanced mode panel states |
| `taxCalc_strategyRates` | strategyRates.ts | Custom rate overrides |
| `taxCalc_qualifiedPurchaser` | useQualifiedPurchaser | QP acknowledgment |

### Validation

All localStorage data is validated before use:
```typescript
function isAdvancedModeState(value: unknown): value is AdvancedModeState {
  // Type guard validates structure before casting
}
```

## Tax Calculation Pipeline

### Year-by-Year Flow

```
For each year 1-10:
    │
    ├── 1. Apply loss rate decay (7% annual, 30% floor)
    │
    ├── 2. Calculate tax events:
    │      • QFAF: ST gains (150% MV), ordinary losses (150% MV)
    │      • Collateral: ST losses (strategy rate), LT gains
    │
    ├── 3. Apply Section 461(l) limit on ordinary losses
    │      • Excess → NOL carryforward
    │
    ├── 4. Calculate net ST gain/loss (should be ~0 with auto-sizing)
    │
    ├── 5. Apply carryforwards:
    │      • ST carryforward → ST gains
    │      • LT carryforward → LT gains
    │      • Cross-apply remaining
    │      • Up to $3,000 against ordinary income
    │
    ├── 6. Calculate tax liability
    │      • Federal ST rate × taxable ST
    │      • Federal LT rate × taxable LT
    │      • State rate × all gains
    │      • Less: ordinary loss deduction benefit
    │
    └── 7. Calculate savings vs baseline (no strategy)
```

### Key Tax Rules Implemented

| Rule | Implementation |
|------|----------------|
| Section 461(l) | Caps ordinary losses at $256K/$512K |
| IRC §1211(b) | $3,000 capital loss deduction limit |
| NOL 80% rule | NOL can offset 80% of taxable income |
| NIIT | 3.8% on investment income above threshold |

## Advanced Mode Architecture

```
AdvancedModal
    │
    ├── YearByYearPlanning     # Override income by year
    ├── SensitivityAnalysis    # Stress-test assumptions
    ├── ScenarioAnalysis       # Bull/Base/Bear scenarios
    ├── StrategyComparison     # Compare all strategies
    └── SettingsPanel          # Formula constants
```

Each panel can be expanded/collapsed independently, with state persisted in localStorage.

## Performance Optimizations

1. **Memoized Calculations**
   ```typescript
   const results = useMemo(() => calculate(inputs, settings), [inputs, settings]);
   const taxRates = useMemo(() => ({ ... }), [income, filingStatus, stateCode]);
   ```

2. **Lazy-loaded Charts** (~400KB savings)
   ```typescript
   const TaxSavingsChart = lazy(() => import('./WealthChart'));
   ```

3. **React.memo on Display Components**
   ```typescript
   export const ResultsSummary = React.memo(function ResultsSummary({ ... }) {
   ```

4. **Single-file Build**
   - Uses `vite-plugin-singlefile` for distribution
   - All assets inlined into one HTML file

## Testing Strategy

| Layer | Test Type | Coverage |
|-------|-----------|----------|
| calculations.ts | Unit tests | 36 tests |
| components/ | Component tests | ResultsSummary |
| Integration | Manual | - |

Run tests: `npm run test:run`
Coverage: `npm run test:coverage`

## Error Handling

### Input Validation
```typescript
// formatters.ts
export const parseFormattedNumber = (value: string): number => {
  const parsed = Number(value.replace(/,/g, ''));
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.min(parsed, MAX_FINANCIAL_VALUE);
};
```

### Calculation Safety
```typescript
// calculations.ts
const strategy = getStrategy(inputs.strategyId);
if (!strategy) {
  throw new Error(`Invalid strategy ID: ${inputs.strategyId}`);
}
```

### localStorage Safety
```typescript
// useAdvancedMode.ts
try {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored && isAdvancedModeState(JSON.parse(stored))) {
    return parsed;
  }
} catch {
  // Fall back to defaults
}
```

## Future Considerations

1. **State Management**: Consider Zustand or Jotai if state complexity grows
2. **Server-side Calculations**: Could move calculations to API for compliance
3. **PDF Export**: Generate client-facing reports
4. **Multi-year Override UI**: Visual timeline for year-by-year planning
