---
title: "feat: Calculator Enhancements - Advanced Mode, Popups, and Analysis Tools"
type: feat
date: 2026-01-26
---

# Calculator Enhancements - Advanced Mode, Popups, and Analysis Tools

## Overview

Enhance the Tax Optimization Calculator with comprehensive field-level documentation popups, an Advanced Mode toggle revealing Year-by-Year Planning, Sensitivity Analysis, and Strategy Comparison features. This creates a professional tool suitable for advisor-client conversations while maintaining a clean default experience.

## Problem Statement / Motivation

Advisors need to:
1. **Explain calculations** to clients - every number should have a popup explaining what it is and how it's calculated
2. **Model dynamic scenarios** - clients' income changes over time, they may add capital
3. **Stress-test assumptions** - show what happens in bear markets or with tax law changes
4. **Compare strategies** - help clients choose between Core and Overlay options

The current calculator provides a single static projection without these capabilities.

## Proposed Solution

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│ Calculator.tsx (existing)                                       │
│   ├── Client Profile inputs                                     │
│   ├── Tax Rates display + field-level popups                   │
│   ├── Strategy Sizing display + field-level popups             │
│   │                                                             │
│   ├── AdvancedModeToggle (NEW)                                 │
│   │   └── localStorage persistence                              │
│   │                                                             │
│   ├── AdvancedMode/ (NEW directory)                            │
│   │   ├── YearByYearPlanning.tsx                               │
│   │   ├── SensitivityAnalysis.tsx                              │
│   │   └── StrategyComparison.tsx                               │
│   │                                                             │
│   ├── Results Section + field-level popups                     │
│   ├── TaxSavingsChart + PortfolioValueChart                    │
│   └── ResultsTable + column header popups                      │
│                                                                 │
├── InfoPopup.tsx (enhanced)                                      │
│   ├── InfoPopup component (existing)                           │
│   ├── FieldInfoPopup component (NEW - inline version)          │
│   └── popupContent.ts (NEW - all popup definitions)            │
│                                                                 │
├── calculations.ts (enhanced)                                    │
│   ├── calculateWithOverrides() (NEW - year-by-year support)    │
│   ├── calculateSensitivity() (NEW - stress testing)            │
│   └── calculateStrategyComparison() (NEW - multi-strategy)     │
│                                                                 │
└── types.ts (enhanced)                                           │
    ├── YearOverride interface (NEW)                              │
    ├── SensitivityParams interface (NEW)                         │
    └── ComparisonResult interface (NEW)                          │
```

## Technical Approach

### Phase 1: Field-Level Info Popups

**Goal:** Add info icons to all calculated values with definitions, formulas, and impact explanations.

#### 1.1 Create Popup Content File

Create `src/popupContent.ts` with all popup definitions:

```typescript
// src/popupContent.ts
export interface PopupContent {
  title: string;
  definition: string;
  formula?: string;
  example?: string;
  impact: string;
}

export const POPUP_CONTENT: Record<string, PopupContent> = {
  // Tax Rates Section
  'federal-st-rate': {
    title: 'Federal Ordinary/ST Rate',
    definition: 'Your marginal federal tax rate on ordinary income and short-term capital gains.',
    formula: 'Tax Bracket Rate + NIIT (3.8% if AGI > threshold)',
    example: '37% + 3.8% = 40.8%',
    impact: 'Higher rate = more value from ST→LT conversion strategy',
  },
  'federal-lt-rate': {
    title: 'Federal LT Capital Gains Rate',
    definition: 'Your marginal federal tax rate on long-term capital gains (held >1 year).',
    formula: '0%/15%/20% based on income + NIIT (3.8% if applicable)',
    example: '20% + 3.8% = 23.8%',
    impact: 'Lower than ordinary rate creates the arbitrage opportunity',
  },
  // ... 40+ more definitions
};
```

#### 1.2 Create FieldInfoPopup Component

Create inline version of InfoPopup for individual values:

```typescript
// In InfoPopup.tsx - add new component
interface FieldInfoPopupProps {
  contentKey: string;
  currentValue?: string;
}

export function FieldInfoPopup({ contentKey, currentValue }: FieldInfoPopupProps) {
  const content = POPUP_CONTENT[contentKey];
  if (!content) return null;

  return (
    <InfoPopup title={content.title}>
      <div className="field-popup">
        <p className="definition">{content.definition}</p>
        {content.formula && (
          <div className="formula">
            <strong>Formula:</strong>
            <code>{content.formula}</code>
          </div>
        )}
        {currentValue && (
          <div className="current-value">
            <strong>Your value:</strong> {currentValue}
          </div>
        )}
        <p className="impact"><strong>Impact:</strong> {content.impact}</p>
      </div>
    </InfoPopup>
  );
}
```

#### 1.3 Add Popups Throughout Calculator

Update Calculator.tsx to add FieldInfoPopup to each value:

```typescript
// Example in Tax Rates section
<div className="tax-rate-item">
  <span className="rate-label">
    Federal Ordinary/ST
    <FieldInfoPopup
      contentKey="federal-st-rate"
      currentValue={formatPercent(federalStRate)}
    />
  </span>
  <span className="rate-value">{(federalStRate * 100).toFixed(1)}%</span>
</div>
```

#### 1.4 Add Popups to ResultsTable Column Headers

Update ResultsTable.tsx:

```typescript
// src/ResultsTable.tsx
<thead>
  <tr>
    <th>Year</th>
    <th>
      Total Value
      <FieldInfoPopup contentKey="total-value" />
    </th>
    <th>
      ST Gains (QFAF)
      <FieldInfoPopup contentKey="st-gains-qfaf" />
    </th>
    {/* ... more columns */}
  </tr>
</thead>
```

#### Tasks - Phase 1

- [ ] Create `src/popupContent.ts` with all popup definitions
- [ ] Add `FieldInfoPopup` component to `InfoPopup.tsx`
- [ ] Add CSS for `.field-popup` styles
- [ ] Add popups to Tax Rates section (6 fields)
- [ ] Add popups to Strategy Sizing section (10 fields)
- [ ] Add popups to Offset Status section (6 fields)
- [ ] Add popups to Results Summary cards (4 fields)
- [ ] Add popups to ResultsTable column headers (12 columns)
- [ ] Test popup accessibility (keyboard, screen reader)
- [ ] Test mobile popup display

---

### Phase 2: Advanced Mode Infrastructure

**Goal:** Add toggle that reveals three collapsible sections with localStorage persistence.

#### 2.1 localStorage Schema

```typescript
// Stored in localStorage key: 'taxCalc_advancedMode'
interface AdvancedModeState {
  enabled: boolean;
  sections: {
    yearByYear: boolean;  // expanded state
    sensitivity: boolean;
    comparison: boolean;
  };
}

// Default state
const DEFAULT_ADVANCED_STATE: AdvancedModeState = {
  enabled: false,
  sections: {
    yearByYear: false,
    sensitivity: false,
    comparison: false,
  },
};
```

#### 2.2 Advanced Mode Hook

Create custom hook for state management:

```typescript
// src/hooks/useAdvancedMode.ts
export function useAdvancedMode() {
  const [state, setState] = useState<AdvancedModeState>(() => {
    const stored = localStorage.getItem('taxCalc_advancedMode');
    return stored ? JSON.parse(stored) : DEFAULT_ADVANCED_STATE;
  });

  useEffect(() => {
    localStorage.setItem('taxCalc_advancedMode', JSON.stringify(state));
  }, [state]);

  const toggleEnabled = () => setState(s => ({ ...s, enabled: !s.enabled }));
  const toggleSection = (section: keyof AdvancedModeState['sections']) =>
    setState(s => ({
      ...s,
      sections: { ...s.sections, [section]: !s.sections[section] },
    }));

  return { state, toggleEnabled, toggleSection };
}
```

#### 2.3 Advanced Mode Toggle Component

```typescript
// src/AdvancedMode/AdvancedModeToggle.tsx
interface Props {
  enabled: boolean;
  onToggle: () => void;
}

export function AdvancedModeToggle({ enabled, onToggle }: Props) {
  return (
    <div className="advanced-mode-toggle">
      <label>
        <span>Advanced Mode</span>
        <input
          type="checkbox"
          checked={enabled}
          onChange={onToggle}
          aria-describedby="advanced-mode-hint"
        />
        <span className="toggle-slider" />
      </label>
      <span id="advanced-mode-hint" className="toggle-hint">
        {enabled ? 'Showing advanced analysis tools' : 'Enable for planning and analysis'}
      </span>
    </div>
  );
}
```

#### 2.4 Collapsible Section Component

```typescript
// src/AdvancedMode/CollapsibleSection.tsx
interface Props {
  title: string;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  hint?: string;
}

export function CollapsibleSection({ title, expanded, onToggle, children, hint }: Props) {
  return (
    <div className={`collapsible-section ${expanded ? 'expanded' : ''}`}>
      <button
        className="section-toggle"
        onClick={onToggle}
        aria-expanded={expanded}
      >
        <span className="toggle-icon">{expanded ? '▼' : '▶'}</span>
        <span className="section-title">{title}</span>
        {hint && <span className="section-hint">{hint}</span>}
      </button>
      {expanded && (
        <div className="section-content">
          {children}
        </div>
      )}
    </div>
  );
}
```

#### Tasks - Phase 2

- [ ] Create `src/hooks/useAdvancedMode.ts`
- [ ] Create `src/AdvancedMode/AdvancedModeToggle.tsx`
- [ ] Create `src/AdvancedMode/CollapsibleSection.tsx`
- [ ] Add toggle and section CSS to `index.css`
- [ ] Integrate into Calculator.tsx between Sizing and Results
- [ ] Add placeholder content for three sections
- [ ] Test localStorage persistence (refresh, clear)
- [ ] Test keyboard accessibility

---

### Phase 3: Year-by-Year Planning

**Goal:** Allow users to model changing W-2 income and cash infusions over 10 years.

#### 3.1 Types

```typescript
// src/types.ts - add
export interface YearOverride {
  year: number;
  w2Income: number;      // Override annual income for this year
  cashInfusion: number;  // Additional capital added this year
  note: string;          // User note (e.g., "Retirement", "Bonus")
}

export interface YearByYearInputs {
  enabled: boolean;
  overrides: YearOverride[];
}
```

#### 3.2 Calculation Updates

**Cash Infusion Mechanics (Assumption):**
- Cash infusion is added at the **start** of the year
- QFAF is re-sized to match new collateral's ST loss capacity
- Growth (7%) applies to the new total for the full year

```typescript
// src/calculations.ts - update calculateYear or create calculateYearWithOverrides
export function calculateYearWithOverrides(
  year: number,
  prevYear: YearResult | null,
  inputs: CalculatorInputs,
  override: YearOverride | null,
  prevNolCarryforward: number,
): YearResult {
  // Get base values from previous year or initial sizing
  let collateralValue = prevYear
    ? prevYear.collateralValue * GROWTH_RATE
    : inputs.collateralAmount;

  // Apply cash infusion at year start
  if (override?.cashInfusion) {
    collateralValue += override.cashInfusion;
  }

  // Re-calculate QFAF based on new collateral
  const strategy = getStrategy(inputs.strategyId);
  const qfafValue = (collateralValue * strategy.stLossRate) / QFAF_ST_GAIN_RATE;

  // Use overridden income for this year (affects §461(l) and NOL usage)
  const effectiveIncome = override?.w2Income ?? inputs.annualIncome;

  // ... rest of calculation with effectiveIncome
}
```

#### 3.3 Component

```typescript
// src/AdvancedMode/YearByYearPlanning.tsx
interface Props {
  baseIncome: number;
  overrides: YearOverride[];
  onChange: (overrides: YearOverride[]) => void;
  onReset: () => void;
}

export function YearByYearPlanning({ baseIncome, overrides, onChange, onReset }: Props) {
  const handleChange = (year: number, field: keyof YearOverride, value: string | number) => {
    const newOverrides = [...overrides];
    const idx = year - 1;
    newOverrides[idx] = { ...newOverrides[idx], [field]: value };
    onChange(newOverrides);
  };

  return (
    <div className="year-by-year-planning">
      <p className="section-description">
        Model income changes and additional investments over time.
        Changes affect §461(l) limits and NOL usage calculations.
      </p>

      <div className="year-table-container">
        <table className="year-table">
          <thead>
            <tr>
              <th>Year</th>
              <th>W-2 Income <FieldInfoPopup contentKey="w2-income-override" /></th>
              <th>Cash Infusion <FieldInfoPopup contentKey="cash-infusion" /></th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {overrides.map((override, idx) => (
              <tr key={override.year}>
                <td>{override.year}</td>
                <td>
                  <CurrencyInput
                    value={override.w2Income}
                    onChange={v => handleChange(override.year, 'w2Income', v)}
                  />
                </td>
                <td>
                  <CurrencyInput
                    value={override.cashInfusion}
                    onChange={v => handleChange(override.year, 'cashInfusion', v)}
                  />
                </td>
                <td>
                  <input
                    type="text"
                    value={override.note}
                    onChange={e => handleChange(override.year, 'note', e.target.value)}
                    maxLength={100}
                    placeholder="Optional note"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="year-actions">
        <button onClick={onReset} className="btn-secondary">Reset to Default</button>
      </div>
    </div>
  );
}
```

#### Tasks - Phase 3

- [ ] Add `YearOverride` and `YearByYearInputs` to `types.ts`
- [ ] Create `src/AdvancedMode/YearByYearPlanning.tsx`
- [ ] Create `CurrencyInput` helper component (reusable)
- [ ] Update `calculations.ts` with `calculateYearWithOverrides()`
- [ ] Add year-by-year state to Calculator.tsx
- [ ] Add CSS for year-by-year table (`.year-table`)
- [ ] Add mobile horizontal scroll for table
- [ ] Add popup content for W-2 override and cash infusion fields
- [ ] Test with varying income scenarios
- [ ] Test cash infusion QFAF re-sizing

---

### Phase 4: Sensitivity Analysis

**Goal:** Stress-test assumptions with interactive sliders.

#### 4.1 Types

```typescript
// src/types.ts - add
export interface SensitivityParams {
  federalRateChange: number;    // -0.05 to +0.05 (percentage points)
  stateRateChange: number;      // -0.05 to +0.05
  annualReturn: number;         // -0.20 to +0.20 (replaces 7% default)
  trackingErrorMultiplier: number; // 0 to 2 (multiplier on variance)
  stLossRateVariance: number;   // -0.50 to +0.50 (percentage change)
  ltGainRateVariance: number;   // -0.50 to +0.50 (percentage change)
}

export const DEFAULT_SENSITIVITY: SensitivityParams = {
  federalRateChange: 0,
  stateRateChange: 0,
  annualReturn: 0.07,
  trackingErrorMultiplier: 1.0,
  stLossRateVariance: 0,
  ltGainRateVariance: 0,
};
```

#### 4.2 Slider Configuration

```typescript
// src/AdvancedMode/sliderConfig.ts
export const SLIDER_CONFIG = {
  federalRateChange: {
    min: -0.05, max: 0.05, step: 0.005, default: 0,
    label: 'Federal Rate Change',
    format: (v: number) => `${v >= 0 ? '+' : ''}${(v * 100).toFixed(1)}%`,
  },
  stateRateChange: {
    min: -0.05, max: 0.05, step: 0.005, default: 0,
    label: 'State Rate Change',
    format: (v: number) => `${v >= 0 ? '+' : ''}${(v * 100).toFixed(1)}%`,
  },
  annualReturn: {
    min: -0.20, max: 0.20, step: 0.01, default: 0.07,
    label: 'Annual Return',
    format: (v: number) => `${v >= 0 ? '+' : ''}${(v * 100).toFixed(0)}%`,
  },
  trackingErrorMultiplier: {
    min: 0, max: 2, step: 0.1, default: 1.0,
    label: 'Tracking Error Impact',
    format: (v: number) => `${v.toFixed(1)}x`,
  },
  stLossRateVariance: {
    min: -0.50, max: 0.50, step: 0.05, default: 0,
    label: 'ST Loss Rate Variance',
    format: (v: number) => `${v >= 0 ? '+' : ''}${(v * 100).toFixed(0)}%`,
  },
  ltGainRateVariance: {
    min: -0.50, max: 0.50, step: 0.05, default: 0,
    label: 'LT Gain Rate Variance',
    format: (v: number) => `${v >= 0 ? '+' : ''}${(v * 100).toFixed(0)}%`,
  },
};
```

#### 4.3 Sensitivity Calculation

**Tracking Error Multiplier (Assumption):**
- At 1.0x, strategy performs as expected
- At 2.0x, both stLossRate and ltGainRate vary by 2x from baseline
- At 0x, strategy has no variance (matches baseline exactly)

```typescript
// src/calculations.ts - add
export function calculateWithSensitivity(
  inputs: CalculatorInputs,
  sensitivity: SensitivityParams,
): CalculationResult {
  // Adjust tax rates
  const adjustedInputs = {
    ...inputs,
    // Note: We don't modify inputs directly, we pass adjustments to tax calculations
  };

  // Get strategy with variance applied
  const baseStrategy = getStrategy(inputs.strategyId);
  const adjustedStrategy = {
    ...baseStrategy,
    stLossRate: baseStrategy.stLossRate * (1 + sensitivity.stLossRateVariance),
    ltGainRate: baseStrategy.ltGainRate * (1 + sensitivity.ltGainRateVariance),
  };

  // Calculate with modified parameters
  // Growth rate = sensitivity.annualReturn instead of fixed 7%
  // Tax rates adjusted by federalRateChange and stateRateChange

  return calculateWithAdjustments(adjustedInputs, adjustedStrategy, sensitivity);
}
```

#### 4.4 Component

```typescript
// src/AdvancedMode/SensitivityAnalysis.tsx
interface Props {
  params: SensitivityParams;
  onChange: (params: SensitivityParams) => void;
  onReset: () => void;
  onApply: () => void;
  baselineResults: CalculationResult;
  adjustedResults: CalculationResult;
}

export function SensitivityAnalysis({
  params, onChange, onReset, onApply,
  baselineResults, adjustedResults
}: Props) {
  return (
    <div className="sensitivity-analysis">
      <p className="section-description">
        See how changes in assumptions affect your results.
      </p>

      <div className="slider-groups">
        <div className="slider-group">
          <h4>Tax Rate Scenarios</h4>
          <Slider
            config={SLIDER_CONFIG.federalRateChange}
            value={params.federalRateChange}
            onChange={v => onChange({ ...params, federalRateChange: v })}
          />
          <Slider
            config={SLIDER_CONFIG.stateRateChange}
            value={params.stateRateChange}
            onChange={v => onChange({ ...params, stateRateChange: v })}
          />
        </div>

        <div className="slider-group">
          <h4>Market Scenarios</h4>
          <Slider
            config={SLIDER_CONFIG.annualReturn}
            value={params.annualReturn}
            onChange={v => onChange({ ...params, annualReturn: v })}
          />
          <Slider
            config={SLIDER_CONFIG.trackingErrorMultiplier}
            value={params.trackingErrorMultiplier}
            onChange={v => onChange({ ...params, trackingErrorMultiplier: v })}
          />
        </div>

        <div className="slider-group">
          <h4>Strategy Performance</h4>
          <Slider
            config={SLIDER_CONFIG.stLossRateVariance}
            value={params.stLossRateVariance}
            onChange={v => onChange({ ...params, stLossRateVariance: v })}
          />
          <Slider
            config={SLIDER_CONFIG.ltGainRateVariance}
            value={params.ltGainRateVariance}
            onChange={v => onChange({ ...params, ltGainRateVariance: v })}
          />
        </div>
      </div>

      <div className="impact-summary">
        <h4>Impact Summary</h4>
        <ImpactComparison baseline={baselineResults} adjusted={adjustedResults} />
      </div>

      <div className="sensitivity-actions">
        <button onClick={onReset} className="btn-secondary">Reset All</button>
        <button onClick={onApply} className="btn-primary">Apply to Main Projection</button>
      </div>
    </div>
  );
}
```

#### Tasks - Phase 4

- [ ] Add `SensitivityParams` to `types.ts`
- [ ] Create `src/AdvancedMode/sliderConfig.ts`
- [ ] Create `src/AdvancedMode/Slider.tsx` component
- [ ] Create `src/AdvancedMode/SensitivityAnalysis.tsx`
- [ ] Create `src/AdvancedMode/ImpactComparison.tsx`
- [ ] Add `calculateWithSensitivity()` to `calculations.ts`
- [ ] Add slider CSS (track, thumb, labels)
- [ ] Add popup content for each slider
- [ ] Test slider accessibility (keyboard arrows, aria-value)
- [ ] Test extreme values (-20% return, 2x tracking error)

---

### Phase 5: Strategy Comparison

**Goal:** Compare 2-3 strategies side-by-side.

#### 5.1 Types

```typescript
// src/types.ts - add
export interface ComparisonResult {
  strategyId: string;
  strategyName: string;
  qfafRequired: number;
  totalExposure: number;
  year1TaxSavings: number;
  tenYearTaxSavings: number;
  taxAlpha: number;
  trackingError: string;
}
```

#### 5.2 Comparison Calculation

```typescript
// src/calculations.ts - add
export function calculateStrategyComparison(
  inputs: CalculatorInputs,
  strategyIds: string[],
): ComparisonResult[] {
  return strategyIds.map(strategyId => {
    const modifiedInputs = { ...inputs, strategyId };
    const result = calculate(modifiedInputs);
    const strategy = getStrategy(strategyId);

    return {
      strategyId,
      strategyName: strategy.name,
      qfafRequired: result.sizing.qfafValue,
      totalExposure: result.sizing.totalExposure,
      year1TaxSavings: result.years[0].taxSavings,
      tenYearTaxSavings: result.summary.totalTaxSavings,
      taxAlpha: result.summary.effectiveTaxAlpha,
      trackingError: strategy.trackingError,
    };
  });
}
```

#### 5.3 Component

```typescript
// src/AdvancedMode/StrategyComparison.tsx
interface Props {
  currentStrategy: string;
  collateralAmount: number;
  onCalculate: (strategyIds: string[]) => ComparisonResult[];
}

export function StrategyComparison({ currentStrategy, collateralAmount, onCalculate }: Props) {
  const [selectedStrategies, setSelectedStrategies] = useState<string[]>([currentStrategy]);
  const [results, setResults] = useState<ComparisonResult[]>([]);

  const addStrategy = () => {
    if (selectedStrategies.length < 3) {
      // Find first strategy not already selected
      const available = STRATEGIES.find(s => !selectedStrategies.includes(s.id));
      if (available) {
        setSelectedStrategies([...selectedStrategies, available.id]);
      }
    }
  };

  const removeStrategy = (idx: number) => {
    if (selectedStrategies.length > 1) {
      setSelectedStrategies(selectedStrategies.filter((_, i) => i !== idx));
    }
  };

  const updateStrategy = (idx: number, strategyId: string) => {
    const newStrategies = [...selectedStrategies];
    newStrategies[idx] = strategyId;
    setSelectedStrategies(newStrategies);
  };

  useEffect(() => {
    setResults(onCalculate(selectedStrategies));
  }, [selectedStrategies, onCalculate]);

  // Find best values for highlighting
  const bestValues = {
    taxSavings: Math.max(...results.map(r => r.tenYearTaxSavings)),
    taxAlpha: Math.max(...results.map(r => r.taxAlpha)),
  };

  return (
    <div className="strategy-comparison">
      <div className="strategy-selectors">
        {selectedStrategies.map((strategyId, idx) => (
          <div key={idx} className="strategy-selector">
            <select
              value={strategyId}
              onChange={e => updateStrategy(idx, e.target.value)}
            >
              {STRATEGIES.map(s => (
                <option
                  key={s.id}
                  value={s.id}
                  disabled={selectedStrategies.includes(s.id) && s.id !== strategyId}
                >
                  {s.name}
                </option>
              ))}
            </select>
            {selectedStrategies.length > 1 && (
              <button onClick={() => removeStrategy(idx)} className="remove-btn">×</button>
            )}
          </div>
        ))}
        {selectedStrategies.length < 3 && (
          <button onClick={addStrategy} className="add-btn">+ Add</button>
        )}
      </div>

      <ComparisonTable results={results} bestValues={bestValues} />
      <ComparisonChart results={results} />
    </div>
  );
}
```

#### Tasks - Phase 5

- [ ] Add `ComparisonResult` to `types.ts`
- [ ] Add `calculateStrategyComparison()` to `calculations.ts`
- [ ] Create `src/AdvancedMode/StrategyComparison.tsx`
- [ ] Create `src/AdvancedMode/ComparisonTable.tsx`
- [ ] Create `src/AdvancedMode/ComparisonChart.tsx` (bar chart)
- [ ] Add CSS for comparison layout
- [ ] Add "best value" highlighting
- [ ] Prevent duplicate strategy selection
- [ ] Test with all 8 strategies
- [ ] Test mobile layout (horizontal scroll or cards)

---

### Phase 6: Polish

**Goal:** Handle edge cases, ensure mobile responsiveness, and finalize print styles.

#### 6.1 Edge Case Handling

```typescript
// src/calculations.ts - add validation
export function validateInputs(inputs: CalculatorInputs): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (inputs.collateralAmount <= 0) {
    errors.push('Collateral amount must be greater than $0');
  }
  if (inputs.collateralAmount > 1_000_000_000) {
    warnings.push('Collateral amount exceeds typical limits');
  }
  if (inputs.annualIncome < 0) {
    errors.push('Annual income cannot be negative');
  }

  return { isValid: errors.length === 0, errors, warnings };
}
```

#### 6.2 Mobile Responsive Updates

```css
/* src/index.css - add/update */
@media (max-width: 768px) {
  .advanced-mode-toggle {
    flex-direction: column;
    align-items: flex-start;
  }

  .year-table-container {
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }

  .slider-groups {
    flex-direction: column;
  }

  .strategy-comparison .comparison-table {
    overflow-x: auto;
  }

  .popup-content {
    max-width: 95vw;
    max-height: 85vh;
  }
}
```

#### 6.3 Print Styles

```css
/* src/index.css - add to @media print */
@media print {
  .advanced-mode-toggle,
  .sensitivity-actions,
  .year-actions,
  .strategy-selectors button {
    display: none;
  }

  /* Show year-by-year assumptions if active */
  .year-by-year-planning.has-changes {
    display: block;
    page-break-before: always;
  }

  /* Show sensitivity settings if applied */
  .sensitivity-analysis.applied {
    display: block;
  }

  /* Include strategy comparison if active */
  .strategy-comparison.has-comparison {
    display: block;
  }

  .collapsible-section {
    break-inside: avoid;
  }
}
```

#### Tasks - Phase 6

- [ ] Add input validation with error/warning display
- [ ] Test $0 collateral - show graceful message
- [ ] Test $100M+ collateral - verify no overflow
- [ ] Test $0 income scenarios
- [ ] Update mobile breakpoint styles
- [ ] Test all features on mobile viewport
- [ ] Add touch-friendly slider interaction
- [ ] Update print styles for Advanced Mode sections
- [ ] Add "Generated on [date]" to print footer
- [ ] Test print output with all features active
- [ ] Final accessibility audit (WCAG 2.1 AA)

---

## Acceptance Criteria

### Functional Requirements

- [ ] Every calculated value has an info popup with definition, formula, and impact
- [ ] Advanced Mode toggle persists across page refreshes
- [ ] Year-by-Year Planning allows different W-2 income per year
- [ ] Year-by-Year cash infusions correctly re-size QFAF
- [ ] Sensitivity Analysis shows real-time impact preview
- [ ] Sensitivity "Apply" updates main projection
- [ ] Strategy Comparison shows 2-3 strategies side-by-side
- [ ] All features work on mobile devices
- [ ] Print output includes relevant assumptions

### Non-Functional Requirements

- [ ] All popups accessible via keyboard (Tab, Enter, Escape)
- [ ] Sliders accessible via keyboard (Arrow keys)
- [ ] No performance degradation with Advanced Mode active
- [ ] Print output fits on standard letter paper

### Quality Gates

- [ ] TypeScript compiles without errors
- [ ] All existing calculations unchanged when Advanced Mode off
- [ ] Mobile viewport (375px) displays all features
- [ ] Print preview shows clean output

---

## Dependencies & Prerequisites

- Existing InfoPopup component and CSS
- Existing calculation engine (calculations.ts)
- Existing strategy data (strategyData.ts)
- Recharts library for comparison chart

---

## Risk Analysis & Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| Popup content too verbose | Poor UX | Keep definitions under 50 words, use collapsible details |
| Year-by-Year complexity | Calculation bugs | Write unit tests for cash infusion scenarios |
| Slider performance | Sluggish UI | Debounce onChange by 100ms |
| Mobile layout breaks | Unusable on phones | Test at each phase on 375px viewport |
| Print styles conflict | Broken output | Test print after each phase |

---

## File Changes Summary

### New Files

| File | Purpose |
|------|---------|
| `src/popupContent.ts` | All popup definitions (40+) |
| `src/hooks/useAdvancedMode.ts` | localStorage state management |
| `src/AdvancedMode/AdvancedModeToggle.tsx` | Toggle component |
| `src/AdvancedMode/CollapsibleSection.tsx` | Reusable collapsible |
| `src/AdvancedMode/YearByYearPlanning.tsx` | Year-by-year inputs |
| `src/AdvancedMode/SensitivityAnalysis.tsx` | Slider-based analysis |
| `src/AdvancedMode/Slider.tsx` | Reusable slider component |
| `src/AdvancedMode/sliderConfig.ts` | Slider configurations |
| `src/AdvancedMode/ImpactComparison.tsx` | Before/after comparison |
| `src/AdvancedMode/StrategyComparison.tsx` | Multi-strategy comparison |
| `src/AdvancedMode/ComparisonTable.tsx` | Comparison data table |
| `src/AdvancedMode/ComparisonChart.tsx` | Bar chart comparison |
| `src/components/CurrencyInput.tsx` | Reusable currency input |

### Modified Files

| File | Changes |
|------|---------|
| `src/types.ts` | Add YearOverride, SensitivityParams, ComparisonResult |
| `src/calculations.ts` | Add calculateWithOverrides, calculateWithSensitivity, calculateStrategyComparison |
| `src/Calculator.tsx` | Integrate Advanced Mode and all new sections |
| `src/InfoPopup.tsx` | Add FieldInfoPopup component |
| `src/ResultsTable.tsx` | Add column header popups |
| `src/index.css` | Add styles for all new components, mobile, print |

---

## References

### Internal

- Brainstorm: `docs/brainstorms/2026-01-25-calculator-enhancements-design.md`
- Existing popup system: `src/InfoPopup.tsx:1-46`
- State pattern: `src/Calculator.tsx:29-39`
- Collapsible pattern: `src/Calculator.tsx:281-327`
- Slider CSS: `src/index.css:162-187`
- Strategy data: `src/strategyData.ts:12-23`
- Calculation flow: `src/calculations.ts:58-94`

### Assumptions Made

1. **localStorage schema**: Store only toggle and section expansion states, not input data
2. **Cash infusion timing**: Added at year start, QFAF re-sizes immediately
3. **Sensitivity interaction**: Applied on top of Year-by-Year data
4. **Tracking error multiplier**: Multiplies variance in stLossRate and ltGainRate
5. **Slider increments**: As defined in sliderConfig.ts
6. **Duplicate strategy prevention**: Disable already-selected strategies in dropdowns
