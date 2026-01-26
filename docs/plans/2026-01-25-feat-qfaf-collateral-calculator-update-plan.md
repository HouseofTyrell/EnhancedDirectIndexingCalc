---
title: "feat: Update Calculator with QFAF + Collateral Mechanics"
type: feat
date: 2026-01-25
---

# Update Calculator with QFAF + Collateral Mechanics

## Overview

Replace the current leverage-based calculator with the correct QFAF + Collateral investment model, featuring auto-sized QFAF based on collateral ST loss capacity, Section 461(l) ordinary loss limitations, and NOL carryforward tracking.

## Problem Statement

The current calculator uses a simplified model where users manually select a leverage ratio. The actual Quantinno investment structure works differently:

1. **QFAF** is a K-1 hedge fund with locked 250/250 leverage generating **150% of MV** in both ST gains AND ordinary losses annually
2. **Collateral accounts** (Core/Overlay SMAs) have predefined strategies with specific ST loss and LT gain rates
3. QFAF must be **auto-sized** so its ST gains equal collateral's ST losses (annual matching requirement)
4. Ordinary losses are capped by **Section 461(l)** ($512K MFJ / $256K Single for 2026)
5. Excess ordinary losses become **NOL carryforward** (can offset 80% of future taxable income)

## Proposed Solution

### New Input Model

Replace current inputs with:

| Input | Type | Options/Range |
|-------|------|---------------|
| **Strategy** | Dropdown | 8 strategies (4 Core + 4 Overlay) |
| **Collateral Amount** | Currency | $100K - $100M |
| **Filing Status** | Dropdown | Single, MFJ, MFS, HOH |
| **Annual Income** | Currency | $0+ |
| **State** | Dropdown | CA, NY, TX, FL, WA, Other |

### Strategy Data

```typescript
// src/strategyData.ts
export const STRATEGIES = [
  // Core (Cash Funded)
  { id: 'core-130-30', type: 'core', name: 'Core 130/30', label: 'Conservative', stLossRate: 0.10, ltGainRate: 0.024, trackingError: '1.3-1.5%' },
  { id: 'core-145-45', type: 'core', name: 'Core 145/45', label: 'Moderate', stLossRate: 0.13, ltGainRate: 0.029, trackingError: '1.8-2.0%' },
  { id: 'core-175-75', type: 'core', name: 'Core 175/75', label: 'Enhanced', stLossRate: 0.19, ltGainRate: 0.038, trackingError: '2.5-3.0%' },
  { id: 'core-225-125', type: 'core', name: 'Core 225/125', label: 'Aggressive', stLossRate: 0.29, ltGainRate: 0.053, trackingError: '4.0-4.5%' },
  // Overlay (Appreciated Stock)
  { id: 'overlay-30-30', type: 'overlay', name: 'Overlay 30/30', label: 'Conservative', stLossRate: 0.06, ltGainRate: 0.009, trackingError: '1.0%' },
  { id: 'overlay-45-45', type: 'overlay', name: 'Overlay 45/45', label: 'Moderate', stLossRate: 0.09, ltGainRate: 0.014, trackingError: '1.5%' },
  { id: 'overlay-75-75', type: 'overlay', name: 'Overlay 75/75', label: 'Enhanced', stLossRate: 0.15, ltGainRate: 0.023, trackingError: '2.5%' },
  { id: 'overlay-125-125', type: 'overlay', name: 'Overlay 125/125', label: 'Aggressive', stLossRate: 0.25, ltGainRate: 0.038, trackingError: '4.2%' },
];

// QFAF Constants
export const QFAF_ST_GAIN_RATE = 1.50;      // 150% of MV
export const QFAF_ORDINARY_LOSS_RATE = 1.50; // 150% of MV

// Section 461(l) Limits (2026)
export const SECTION_461L_LIMITS = {
  single: 256000,
  mfj: 512000,
  mfs: 256000,
  hoh: 256000,
};

// NOL Usage Limitation
export const NOL_OFFSET_PERCENTAGE = 0.80; // Can offset 80% of taxable income
```

### Auto-Sizing Formula

```typescript
// QFAF is sized so ST gains = Collateral ST losses
const collateralStLosses = collateralAmount * strategy.stLossRate;
const qfafValue = collateralStLosses / QFAF_ST_GAIN_RATE;
// Simplified: qfafValue = (collateralAmount * stLossRate) / 1.50
```

### Tax Alpha Calculation

```typescript
// Annual tax events
const qfafStGains = qfafValue * 1.50;           // Always matches collateral ST losses
const qfafOrdinaryLosses = qfafValue * 1.50;
const collateralStLosses = collateralAmount * strategy.stLossRate;
const collateralLtGains = collateralAmount * strategy.ltGainRate;

// Section 461(l) limitation
const section461Limit = SECTION_461L_LIMITS[filingStatus];
const usableOrdinaryLoss = Math.min(qfafOrdinaryLosses, section461Limit);
const excessOrdinaryLoss = qfafOrdinaryLosses - usableOrdinaryLoss;

// Tax alpha components
const stLtConversionBenefit = collateralStLosses * (stRate - ltRate);  // ~17% differential
const ordinaryLossBenefit = usableOrdinaryLoss * ordinaryRate;         // ~40.8% at top bracket
const ltGainCost = collateralLtGains * ltRate;                         // 23.8% at top bracket

const netTaxAlpha = stLtConversionBenefit + ordinaryLossBenefit - ltGainCost;
```

## Technical Approach

### Phase 1: Data Model Updates

#### src/types.ts

```typescript
// Replace CalculatorInputs
export interface CalculatorInputs {
  // Client profile
  filingStatus: 'single' | 'mfj' | 'mfs' | 'hoh';
  stateCode: string;
  stateRate: number;
  annualIncome: number;

  // Strategy selection (replaces collateralType + leverageRatio)
  strategyId: string;
  collateralAmount: number;

  // Existing carryforwards
  existingStLossCarryforward: number;
  existingLtLossCarryforward: number;
  existingNolCarryforward: number;  // NEW

  // Advanced: QFAF override (optional)
  qfafOverride?: number;
}

// Update CalculatedSizing
export interface CalculatedSizing {
  strategyId: string;
  strategyName: string;
  collateralValue: number;
  qfafValue: number;              // Auto-calculated
  qfafMaxValue: number;           // Same as qfafValue (for display)
  totalExposure: number;
  qfafRatio: number;              // qfafValue / collateralValue
  year1StLosses: number;
  year1StGains: number;           // Always equals year1StLosses
  year1OrdinaryLosses: number;
  year1UsableOrdinaryLoss: number;
  year1ExcessToNol: number;
  section461Limit: number;
}

// Update YearResult
export interface YearResult {
  year: number;

  // Portfolio values
  qfafValue: number;
  collateralValue: number;
  totalValue: number;

  // QFAF tax events
  stGainsGenerated: number;       // 150% of QFAF MV
  ordinaryLossesGenerated: number; // 150% of QFAF MV
  usableOrdinaryLoss: number;     // Capped by 461(l)
  excessToNol: number;            // Ordinary losses above limit

  // Collateral tax events
  stLossesHarvested: number;      // Strategy rate × collateral
  ltGainsRealized: number;        // Strategy rate × collateral

  // Net positions
  netStGainLoss: number;          // Should be ~0 with auto-sizing

  // Taxes
  federalTax: number;
  stateTax: number;
  totalTax: number;

  // Comparison
  baselineTax: number;
  taxSavings: number;

  // Carryforwards
  stLossCarryforward: number;
  ltLossCarryforward: number;
  nolCarryforward: number;        // NEW: Cumulative NOL
  nolUsedThisYear: number;        // NEW: NOL applied this year
}
```

### Phase 2: Strategy Data

#### src/strategyData.ts (NEW FILE)

- Define `STRATEGIES` array with all 8 strategies
- Define `QFAF_ST_GAIN_RATE` and `QFAF_ORDINARY_LOSS_RATE` constants
- Define `SECTION_461L_LIMITS` by filing status
- Define `NOL_OFFSET_PERCENTAGE` constant
- Helper function: `getStrategy(id: string)`

### Phase 3: Calculation Engine

#### src/calculations.ts

- [x] Update `calculateSizing()`:
  - Look up strategy by ID
  - Auto-calculate QFAF: `(collateral × stLossRate) / 1.50`
  - Calculate year 1 projections including 461(l) split

- [x] Update `calculate()`:
  - Initialize NOL carryforward from existing
  - Loop 10 years with updated logic

- [x] Update `calculateYear()`:
  - QFAF generates 150% ST gains + 150% ordinary losses
  - Collateral generates ST losses + LT gains per strategy rates
  - Apply 461(l) limit to ordinary losses
  - Track NOL generation and usage
  - Apply NOL with 80% limitation

- [x] Remove `getHarvestingRate()` decay function (rates are constant now)

- [x] Add `applyNolCarryforward()`:
  - Calculate 80% of taxable income cap
  - Apply available NOL up to cap
  - Return amount used and remaining NOL

### Phase 4: Tax Data Updates

#### src/taxData.ts

- [x] Add `SECTION_461L_LIMITS` object
- [x] Update `DEFAULTS` with new structure:
  ```typescript
  export const DEFAULTS: CalculatorInputs = {
    filingStatus: 'mfj',
    stateCode: 'CA',
    stateRate: 0,
    annualIncome: 3000000,
    strategyId: 'core-145-45',
    collateralAmount: 10000000,
    existingStLossCarryforward: 0,
    existingLtLossCarryforward: 0,
    existingNolCarryforward: 0,
  };
  ```

### Phase 5: UI Updates

#### src/Calculator.tsx

- [x] Replace collateral type + leverage dropdowns with single Strategy dropdown:
  ```tsx
  <select id="strategy" value={inputs.strategyId} onChange={...}>
    <optgroup label="Core (Cash Funded)">
      <option value="core-130-30">Core 130/30 - Conservative (-10% ST / +2.4% LT)</option>
      <option value="core-145-45">Core 145/45 - Moderate (-13% ST / +2.9% LT)</option>
      <option value="core-175-75">Core 175/75 - Enhanced (-19% ST / +3.8% LT)</option>
      <option value="core-225-125">Core 225/125 - Aggressive (-29% ST / +5.3% LT)</option>
    </optgroup>
    <optgroup label="Overlay (Appreciated Stock)">
      <option value="overlay-30-30">Overlay 30/30 - Conservative (-6% ST / +0.9% LT)</option>
      <option value="overlay-45-45">Overlay 45/45 - Moderate (-9% ST / +1.4% LT)</option>
      <option value="overlay-75-75">Overlay 75/75 - Enhanced (-15% ST / +2.3% LT)</option>
      <option value="overlay-125-125">Overlay 125/125 - Aggressive (-25% ST / +3.8% LT)</option>
    </optgroup>
  </select>
  ```

- [x] Update Sizing Section to show:
  - Collateral Value
  - Auto-Sized QFAF
  - Total Exposure
  - QFAF Ratio (e.g., "8.7%")
  - Section 461(l) Limit
  - Year 1 Usable Ordinary Loss
  - Year 1 Excess → NOL

- [x] Add NOL carryforward input to Advanced Settings

- [x] Update summary cards:
  - Total Tax Savings
  - Final Portfolio Value
  - Cumulative NOL Generated

- [x] Remove leverage override warning (QFAF is always properly sized)

#### src/ResultsTable.tsx

- [x] Update columns:
  - Year
  - Total Value
  - ST Gains (QFAF)
  - ST Losses (Collateral)
  - Ordinary Loss (Usable)
  - Excess → NOL
  - LT Gains
  - Tax Savings
  - Cumulative NOL

#### src/WealthChart.tsx

- [x] Update data keys to match new field names
- [ ] Consider adding NOL line to chart (deferred)

## Acceptance Criteria

### Functional Requirements

- [x] Strategy dropdown shows all 8 strategies grouped by Core/Overlay
- [x] QFAF auto-calculates as `(Collateral × ST_Loss_Rate) / 1.50`
- [x] Section 461(l) limits applied correctly:
  - Single/MFS/HOH: $256,000
  - MFJ: $512,000
- [x] Ordinary losses above 461(l) limit become NOL carryforward
- [x] NOL can offset up to 80% of future taxable income
- [x] 10-year projection shows cumulative NOL tracking
- [x] Tax alpha calculation matches formula in brainstorm doc

### Edge Cases

- [ ] $0 collateral → $0 QFAF, no tax events, display gracefully
- [ ] Very large collateral ($100M) → calculations don't overflow
- [ ] Strategy switch recalculates all values immediately
- [ ] Existing NOL carryforward applies with 80% limitation

### Quality Gates

- [x] TypeScript compiles without errors
- [x] All calculations verified against brainstorm example ($10M Core 145/45)
- [ ] Mobile viewport displays correctly
- [ ] Print output is readable

## Example Verification

**Test Case: $10M Core 145/45 (MFJ)**

From brainstorm document:
- Collateral: $10M
- Strategy ST Loss Rate: 13%
- Strategy LT Gain Rate: 2.9%
- Max QFAF: $10M × 13% / 150% = **$867K**

Annual Tax Events:
| Item | Calculation | Amount |
|------|-------------|--------|
| QFAF ST Gains | $867K × 150% | $1.30M |
| QFAF Ordinary Losses | $867K × 150% | $1.30M |
| Usable Ordinary Loss | min($1.30M, $512K) | $512K |
| Excess → NOL | $1.30M - $512K | $788K |
| Collateral ST Losses | $10M × 13% | $1.30M |
| Collateral LT Gains | $10M × 2.9% | $290K |

Tax Alpha (top bracket):
| Component | Calculation | Value |
|-----------|-------------|-------|
| ST→LT Conversion | $1.30M × 17% | +$221K |
| Ordinary Loss Benefit | $512K × 40.8% | +$209K |
| LT Gain Cost | $290K × 23.8% | -$69K |
| **Net Tax Alpha** | | **+$361K** |

**Expected: ~$361K/year tax alpha (3.3% of $10.87M total)**

## Implementation Checklist

### Phase 1: Data Model
- [x] Update `src/types.ts` with new interfaces
- [x] Create `src/strategyData.ts` with strategy definitions

### Phase 2: Calculations
- [x] Update `src/calculations.ts` with new auto-sizing logic
- [x] Implement 461(l) and NOL carryforward mechanics
- [x] Update `src/taxData.ts` with new constants and defaults

### Phase 3: UI
- [x] Update `src/Calculator.tsx` with strategy dropdown
- [x] Update sizing section display
- [x] Update `src/ResultsTable.tsx` columns
- [x] Update `src/WealthChart.tsx` data keys

### Phase 4: Testing
- [x] Verify $10M Core 145/45 example matches expected values
- [ ] Test all 8 strategies
- [ ] Test edge cases ($0, large amounts)
- [ ] Test all filing statuses

### Phase 5: Polish
- [ ] Update print styles if needed
- [x] Update disclaimer text
- [ ] Final review

## References

- Brainstorm: `docs/brainstorms/2026-01-25-qfaf-collateral-mechanics-design.md`
- Current implementation: `src/calculations.ts`, `src/Calculator.tsx`
- Section 461(l): [IRS 2026 Inflation Adjustments](https://www.currentfederaltaxdevelopments.com/blog/2025/10/9/2026-inflation-adjustments-for-tax-professionals-revenue-procedure-2025-32-analysis)
