---
title: "Tax Optimization Calculator Enhancements"
type: design
date: 2026-01-25
---

# Tax Optimization Calculator Enhancements

## Overview

Enhance the existing Tax Optimization Calculator with Advanced Mode features, comprehensive field-level documentation popups, and production polish. The goal is to provide advisors and clients with powerful analysis tools while maintaining a clean default experience.

## Design Decisions

### User Selections
- **Focus Areas**: Polish & Production Ready + Advanced Analysis
- **Advanced Features**: Sensitivity Analysis, Strategy Comparison, Year-by-Year Planning (dynamic W-2/cash changes)
- **Detail Level**: Year-by-year input for dynamic changes
- **UI Approach**: Progressive disclosure with collapsible sections

---

## Section 1: Overall Structure

Add an "Advanced Mode" toggle that reveals three collapsible analysis sections while keeping the default experience clean.

```
┌─────────────────────────────────────────────────────────────┐
│ Tax Optimization Calculator                                 │
│ QFAF + Collateral Strategy                                 │
├─────────────────────────────────────────────────────────────┤
│ [Client Profile]        [Standard inputs as today]         │
│ [Tax Rates]             [Marginal rates display]           │
│ [Strategy Sizing]       [Auto-sized QFAF display]          │
├─────────────────────────────────────────────────────────────┤
│ ┌─ Advanced Mode ──────────────────────────────── [Toggle] │
│ │  ▶ Year-by-Year Planning                                 │
│ │  ▶ Sensitivity Analysis                                  │
│ │  ▶ Strategy Comparison                                   │
│ └──────────────────────────────────────────────────────────│
├─────────────────────────────────────────────────────────────┤
│ [10-Year Projection Results]                               │
│ [Charts & Tables]                                          │
└─────────────────────────────────────────────────────────────┘
```

**Behavior:**
- Toggle OFF (default): Advanced sections hidden, calculator works as today
- Toggle ON: Three collapsible sections appear, each collapsed by default
- State persists in localStorage
- Each section expands independently

---

## Section 2: Year-by-Year Planning

Allow users to model changing W-2 income and additional cash infusions over the 10-year projection period.

**Layout:**
```
┌─────────────────────────────────────────────────────────────┐
│ ▼ Year-by-Year Planning                                     │
├─────────────────────────────────────────────────────────────┤
│ Model income changes and additional investments over time   │
│                                                             │
│ ┌──────┬─────────────────┬─────────────────┬──────────────┐│
│ │ Year │ W-2 Income      │ Cash Infusion   │ Notes        ││
│ ├──────┼─────────────────┼─────────────────┼──────────────┤│
│ │ 1    │ [$3,000,000   ] │ [$0          ]  │ [        ]   ││
│ │ 2    │ [$3,000,000   ] │ [$0          ]  │ [        ]   ││
│ │ 3    │ [$2,500,000   ] │ [$500,000    ]  │ [Bonus   ]   ││
│ │ ...  │                 │                 │              ││
│ │ 10   │ [$1,000,000   ] │ [$0          ]  │ [Retire  ]   ││
│ └──────┴─────────────────┴─────────────────┴──────────────┘│
│                                                             │
│ [Reset to Default] [Apply Changes]                         │
└─────────────────────────────────────────────────────────────┘
```

**Features:**
- Pre-populated with current annual income
- Cash infusions add to collateral (triggers QFAF re-sizing)
- Changes recalculate projections in real-time
- Notes field for advisor documentation
- Export includes year-by-year assumptions

**Calculation Impact:**
- W-2 changes affect §461(l) limit utilization and NOL usage (80% of taxable income)
- Cash infusions increase collateral mid-stream, requiring QFAF adjustment
- Each year recalculates based on that year's parameters

---

## Section 3: Sensitivity Analysis

Allow users to stress-test assumptions with interactive sliders, including negative returns and tracking error impact.

**Layout:**
```
┌─────────────────────────────────────────────────────────────┐
│ ▼ Sensitivity Analysis                                      │
├─────────────────────────────────────────────────────────────┤
│ See how changes in assumptions affect your results          │
│                                                             │
│ Tax Rate Scenarios                                          │
│ ├─ Federal Rate Change    [-5%]────●────[+5%]    +0%       │
│ └─ State Rate Change      [-5%]────●────[+5%]    +0%       │
│                                                             │
│ Market Scenarios                                            │
│ ├─ Annual Return         [-20%]────●────[+20%]   +7%       │
│ └─ Tracking Error Impact  [0x]────●────[2x]      1.0x      │
│                                                             │
│ Strategy Performance                                        │
│ ├─ ST Loss Rate Variance [-50%]────●────[+50%]   +0%       │
│ └─ LT Gain Rate Variance [-50%]────●────[+50%]   +0%       │
│                                                             │
│ ┌─────────────────────────────────────────────────────────┐│
│ │ Impact Summary                                          ││
│ │ Base 10-Yr Tax Savings:     $4,200,000                 ││
│ │ Adjusted 10-Yr Tax Savings: $3,150,000  (-25%)         ││
│ │ Base Tax Alpha:             3.32%                       ││
│ │ Adjusted Tax Alpha:         2.49%       (-0.83%)       ││
│ └─────────────────────────────────────────────────────────┘│
│                                                             │
│ [Reset All] [Apply to Main Projection]                     │
└─────────────────────────────────────────────────────────────┘
```

**Sliders:**

| Slider | Range | Default | Purpose |
|--------|-------|---------|---------|
| Federal Rate Change | -5% to +5% | 0% | Model tax law changes |
| State Rate Change | -5% to +5% | 0% | Model state tax changes |
| Annual Return | -20% to +20% | +7% | Model market scenarios (bear to bull) |
| Tracking Error Impact | 0x to 2x | 1.0x | Model strategy volatility deviation |
| ST Loss Rate Variance | -50% to +50% | 0% | Model harvesting effectiveness |
| LT Gain Rate Variance | -50% to +50% | 0% | Model realized gain variance |

**Tracking Error Impact Explanation:**
- 0x = Strategy perfectly matches benchmark (no tracking error)
- 1x = Strategy performs as expected (baseline tracking error)
- 2x = Strategy has 2x the expected tracking error (higher volatility)
- Affects both upside and downside deviation from expected returns

---

## Section 4: Strategy Comparison

Compare 2-3 strategies side-by-side to help clients choose the right fit.

**Layout:**
```
┌─────────────────────────────────────────────────────────────┐
│ ▼ Strategy Comparison                                       │
├─────────────────────────────────────────────────────────────┤
│ Compare: [Core 145/45 ▼] [Overlay 75/75 ▼] [+ Add]         │
│                                                             │
│ ┌─────────────────┬─────────────────┬─────────────────┐    │
│ │                 │ Core 145/45     │ Overlay 75/75   │    │
│ ├─────────────────┼─────────────────┼─────────────────┤    │
│ │ QFAF Required   │ $866,667        │ $1,000,000      │    │
│ │ Total Exposure  │ $10.87M         │ $11.00M         │    │
│ │ Year 1 Tax Save │ $361,000        │ $298,000        │    │
│ │ 10-Yr Tax Save  │ $4.2M           │ $3.5M           │    │
│ │ Tax Alpha       │ 3.32%           │ 2.71%           │    │
│ │ Tracking Error  │ 1.8-2.0%        │ 2.5%            │    │
│ └─────────────────┴─────────────────┴─────────────────┘    │
│                                                             │
│ [Bar chart comparing 10-year tax savings]                  │
└─────────────────────────────────────────────────────────────┘
```

**Key metrics compared:**
- QFAF sizing and total exposure
- Year 1 and cumulative tax savings
- Tax alpha percentage
- Tracking error (volatility)

**Features:**
- Up to 3 strategies can be compared
- Uses same collateral amount for fair comparison
- Highlights "best" values in each row
- Bar chart visualization of tax savings comparison

---

## Section 5: Field-Level Info Popups

Every calculated value and input field should have an info icon that explains what it is and how it's calculated. Critical for advisor-client conversations.

### Popup Coverage

| Section | Fields with Popups |
|---------|-------------------|
| **Client Profile** | Strategy (what Core vs Overlay means), Collateral Amount (minimum requirements), Filing Status (tax implications) |
| **Tax Rates** | Federal ST Rate, Federal LT Rate, State Rate, NIIT inclusion, ST→LT Benefit differential |
| **Strategy Sizing** | QFAF Value (auto-sizing formula), Total Exposure, QFAF Ratio, §461(l) Limit |
| **Offset Status** | ST Losses, ST Gains, Net ST Position, Ordinary Loss, Usable vs Excess |
| **Results Summary** | Total Tax Savings, Tax Alpha, NOL Generated, Final Portfolio Value |
| **Results Table** | Each column header (ST Gains, Ordinary Loss, NOL Carryforward, etc.) |
| **Sensitivity Analysis** | Each slider (what changing it models) |
| **Strategy Comparison** | Each metric row (how it's calculated) |

### Popup Content Structure

```
┌─────────────────────────────────────┐
│ Federal ST Rate              [×]   │
├─────────────────────────────────────┤
│ Your marginal federal tax rate on  │
│ ordinary income and short-term     │
│ capital gains.                     │
│                                    │
│ Formula:                           │
│ Tax Bracket Rate + NIIT (3.8%)     │
│                                    │
│ Your rate: 37% + 3.8% = 40.8%      │
│                                    │
│ Impact: Higher rate = more value   │
│ from ST→LT conversion strategy     │
└─────────────────────────────────────┘
```

Each popup includes:
- **Definition**: What this field represents
- **Formula**: How it's calculated (if applicable)
- **Your Value**: The current calculated value with breakdown
- **Impact**: Why this matters for the strategy

### New Popups to Add

Beyond existing section-level popups, add field-level popups for:

**Tax Rates Section:**
- Federal Ordinary/ST Rate
- Federal LT Cap Gains Rate
- State Rate
- Combined Ordinary Rate
- Combined LT Rate
- ST→LT Benefit

**Sizing Section:**
- Collateral Value
- Auto-Sized QFAF
- Total Exposure
- QFAF Ratio
- Year 1 ST Losses
- Year 1 ST Gains
- Net ST Position
- Year 1 Ordinary Loss
- Usable Ordinary Loss
- Excess → NOL

**Results Section:**
- Total Tax Savings
- Final Portfolio Value
- Annualized Tax Alpha
- Total NOL Generated

**Results Table Columns:**
- Year
- Total Value
- QFAF Value
- Collateral Value
- ST Gains (QFAF)
- ST Losses (Collateral)
- Net ST
- Ordinary Loss
- Usable Ordinary Loss
- Excess → NOL
- LT Gains
- Tax Savings
- Cumulative Savings
- NOL Carryforward

---

## Implementation Priority

### Phase 1: Field-Level Popups (Foundation)
1. Create popup content for all existing fields
2. Add info icons throughout Calculator.tsx
3. Update ResultsTable.tsx with column header popups
4. Test popup accessibility and mobile behavior

### Phase 2: Advanced Mode Infrastructure
1. Add Advanced Mode toggle with localStorage persistence
2. Create collapsible section component
3. Add three empty collapsible sections
4. Style toggle and sections

### Phase 3: Year-by-Year Planning
1. Create YearByYearPlanning component
2. Add state management for per-year inputs
3. Update calculations.ts to accept year-specific parameters
4. Wire up to projection engine

### Phase 4: Sensitivity Analysis
1. Create SensitivityAnalysis component
2. Add slider components with real-time preview
3. Create impact summary calculations
4. Add "Apply to Main" functionality

### Phase 5: Strategy Comparison
1. Create StrategyComparison component
2. Add multi-strategy calculation logic
3. Create comparison table and chart
4. Style for clear visual comparison

### Phase 6: Polish
1. Edge case handling ($0, large amounts)
2. Mobile responsiveness testing
3. Print styles for all new sections
4. Performance optimization

---

## Technical Notes

### State Management
- Advanced mode settings stored in localStorage
- Year-by-year data managed in component state
- Sensitivity sliders use local state with "Apply" action
- Strategy comparison recalculates on selection change

### Calculations Integration
- Year-by-year planning requires refactoring `calculateYear()` to accept per-year parameters
- Sensitivity analysis creates modified inputs and runs full calculation
- Strategy comparison runs parallel calculations for each selected strategy

### Component Structure
```
src/
├── Calculator.tsx           # Main component with Advanced Mode toggle
├── AdvancedMode/
│   ├── YearByYearPlanning.tsx
│   ├── SensitivityAnalysis.tsx
│   └── StrategyComparison.tsx
├── InfoPopup.tsx            # Enhanced with field-level content
├── calculations.ts          # Extended for year-specific params
└── types.ts                 # New types for advanced features
```

---

## References

- Current implementation: `src/Calculator.tsx`, `src/calculations.ts`
- Existing popup system: `src/InfoPopup.tsx`
- Strategy data: `src/strategyData.ts`
- Plan document: `docs/plans/2026-01-25-feat-qfaf-collateral-calculator-update-plan.md`
