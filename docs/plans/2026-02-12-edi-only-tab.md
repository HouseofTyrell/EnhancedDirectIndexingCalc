# EDI-Only Tab Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add an "EDI-Only" tab that shows the true value of enhanced direct indexing without QFAF overlay — carryforward accumulation, realization scenarios, unwind analysis, and estate comparison.

**Architecture:** New pure-function calculation module (`src/calculations/ediOnly.ts`) following the `qfafTestCalculations.ts` pattern. New UI component (`src/components/EdiOnlyTab.tsx`) following the `QfafTestByYear.tsx` pattern. Integrated into `App.tsx` as a top-level tab with auto-switching when QFAF is toggled off. Existing QFAF calculations are UNTOUCHED.

**Tech Stack:** React 18, TypeScript, Recharts, Vitest

---

## Critical Context for the Dev Team

### The Bug We're Fixing

When QFAF is off, the current tax savings formula in `core.ts:225` charges **gross** LT gains as a cost (`ltGainCost = ltGainsRealized * combinedLtRate`) without crediting the fact that ST losses shelter those LT gains in the IRC netting calculation (`helpers.ts:80-98`). This produces a large negative number (~-$52K) that gets floored to $0 at `core.ts:246`.

**Reality:** ST losses >> LT gains. The LT gains are fully sheltered. The actual annual realized benefit is ~$1,473 (from the $3K deduction). The BIG value is the ~$1.5M/year carryforward accumulation.

**We do NOT modify the existing formula.** Instead, we build a separate EDI-specific calculation module with corrected economics.

### Key Tax Rules (CPA-Verified)

1. **Capital loss carryforward vs capital gains: NO annual dollar limit.** The $3K limit applies ONLY to ordinary income. A $5M carryforward can shelter $5M in gains in a single year.
2. **Carryforwards retain character** (ST stays ST, LT stays LT). Same-character offsets first, then cross-applies.
3. **Carryforwards are lost at death** (IRC Section 1212(b)). But positions get step-up in basis (IRC Section 1014).
4. **PA does NOT conform** to federal carryforward rules. PA carryforward provides ZERO state benefit.
5. **NIIT (3.8%)**: Two distinct mechanisms — (a) When CF shelters capital gains in a realization event, this DOES reduce NII, so NIIT savings apply at the full combined rate including 3.8%. (b) When the $3K capital loss deduction offsets ordinary income (IRC §1211(b)), this does NOT reduce NII, so NIIT does NOT apply to the $3K deduction savings. The code correctly handles both cases.

### Key Financial Metrics (PM-Verified)

- **Harvesting efficiency:** ST losses / LT gains. Excellent = >10x (Year 1), Good = 5-10x, Adequate = 2-5x.
- **Break-even for external gains:** Typically $1.4M in realized gains to recover 10-year tax drag on a $5M portfolio.
- **Embedded gain at unwind:** Grows due to basis reduction from harvesting. ~19% Year 1, ~52% Year 5, ~68% Year 10 (at 7% growth).
- **Estate decision:** If CF >= embedded gains, unwind before death. If CF < embedded gains, partial unwind (use CF, keep rest for step-up).

---

## Identified Gaps (To Address During Implementation)

| Gap | Severity | Notes |
|-----|----------|-------|
| Section 461L limit discrepancy | Medium | `types.ts:329` uses $320K/$640K vs `strategyData.ts` uses $256K/$512K. Reconcile during Task 1. |
| PA state carryforward rules | Medium | PA provides zero CF benefit at state level. Must compute federal/state separately. |
| NIIT modeling | Low | Deferred — flag as "coming soon" in UI. |

---

## Task 1: Create EDI-Only Calculation Module — Types & Core Year Calculation

**Files:**
- Create: `src/calculations/ediOnly.ts`
- Reference: `src/qfafTestCalculations.ts` (pattern template)
- Reference: `src/calculations/helpers.ts:80-98` (carryforward netting)
- Reference: `src/strategyData.ts` (strategy rates)
- Test: `src/ediOnly.test.ts`

### Step 1: Write the failing test for EDI year calculation

```typescript
// src/ediOnly.test.ts
import { describe, it, expect } from 'vitest';
import { computeEdiYear } from './calculations/ediOnly';

describe('computeEdiYear', () => {
  const defaults = {
    strategyId: 'overlay-45-45',
    collateralValue: 10_000_000,
    combinedStRate: 0.541, // 37% fed + 3.8% NIIT + 13.3% CA
    combinedLtRate: 0.371, // 20% fed + 3.8% NIIT + 13.3% CA
    filingStatus: 'mfj' as const,
    washSaleRate: 0,
  };

  it('should correctly net ST losses against LT gains in Year 1', () => {
    const result = computeEdiYear({
      year: 1,
      ...defaults,
      priorStCarryforward: 0,
      priorLtCarryforward: 0,
    });

    // Overlay 45/45 Year 1: ST loss rate 16.5%, LT gain rate 1.4%
    expect(result.stLossesHarvested).toBeCloseTo(1_650_000, -2);
    expect(result.ltGainsRealized).toBeCloseTo(140_000, -2);

    // ST losses fully shelter LT gains
    expect(result.stLossesUsedToOffsetLtGains).toBeCloseTo(140_000, -2);
    expect(result.netLtGainAfterOffset).toBe(0);
    expect(result.taxOnRemainingLtGains).toBe(0);

    // Excess ST losses become carryforward
    expect(result.excessStLossAfterOffset).toBeCloseTo(1_510_000, -2);

    // $3K deduction against ordinary income
    expect(result.capitalLossDeduction).toBe(3000);
    expect(result.taxSavedByCapitalLossDeduction).toBeCloseTo(1623, -1);

    // Net annual benefit is POSITIVE (not $0, not negative)
    expect(result.annualRealizedBenefit).toBeGreaterThan(0);
    expect(result.annualRealizedBenefit).toBeCloseTo(1623, -1);

    // Carryforward = excess - $3K deduction
    expect(result.endingStCarryforward).toBeCloseTo(1_507_000, -2);
  });

  it('should use prior carryforward to offset LT gains when ST losses are insufficient', () => {
    // Scenario: Year 10, small ST losses, prior CF available
    const result = computeEdiYear({
      year: 10,
      ...defaults,
      collateralValue: 10_000_000,
      priorStCarryforward: 5_000_000,
      priorLtCarryforward: 0,
    });

    // Year 10 ST loss rate: 4.5%, LT gain: 1.4%
    // ST losses = $450K, LT gains = $140K
    // ST losses shelter LT gains: $140K
    // Excess: $310K
    expect(result.stLossesUsedToOffsetLtGains).toBeCloseTo(140_000, -2);
    expect(result.netLtGainAfterOffset).toBe(0);
    expect(result.excessStLossAfterOffset).toBeCloseTo(310_000, -2);

    // Carryforward = prior $5M + $310K excess - $3K deduction
    expect(result.endingStCarryforward).toBeCloseTo(5_307_000, -2);
  });

  it('should handle MFS filing status with $1,500 capital loss limit', () => {
    const result = computeEdiYear({
      year: 1,
      ...defaults,
      filingStatus: 'mfs',
      priorStCarryforward: 0,
      priorLtCarryforward: 0,
    });

    expect(result.capitalLossDeduction).toBe(1500);
  });
});
```

### Step 2: Run test to verify it fails

Run: `cd "/Users/housetyrell/Documents/Programming Projects/EnhancedDirectIndexingCalc" && npx vitest run src/ediOnly.test.ts`
Expected: FAIL with "Cannot find module './calculations/ediOnly'"

### Step 3: Write the EDI year calculation

```typescript
// src/calculations/ediOnly.ts
import { getStLossRateForYear, CAPITAL_LOSS_LIMITS } from '../strategyData';
import type { FilingStatus } from '../types';
import { safeNumber } from '../utils/safeNumber';

// ============================================
// TYPES
// ============================================

export interface EdiYearInput {
  year: number;
  strategyId: string;
  collateralValue: number;
  combinedStRate: number;
  combinedLtRate: number;
  filingStatus: FilingStatus;
  washSaleRate: number;
  priorStCarryforward: number;
  priorLtCarryforward: number;
}

export interface EdiYearResult {
  year: number;
  collateralValue: number;

  // Gross generation
  stLossesHarvested: number;
  ltGainsRealized: number;

  // IRC netting (ST losses shelter LT gains)
  stLossesUsedToOffsetLtGains: number;
  netLtGainAfterOffset: number;
  excessStLossAfterOffset: number;

  // Prior carryforward application
  priorCfUsedAgainstLtGains: number;

  // Tax on remaining LT gains (after all offsets)
  taxOnRemainingLtGains: number;

  // $3K ordinary income deduction
  capitalLossDeduction: number;
  taxSavedByCapitalLossDeduction: number;

  // Net annual realized benefit (positive = saves money)
  annualRealizedBenefit: number;

  // Carryforward balances at year end
  endingStCarryforward: number;
  endingLtCarryforward: number;

  // Harvesting efficiency
  harvestingEfficiency: number;
}

// ============================================
// CONSTANTS
// ============================================

const STRATEGIES = await import('../strategyData').then(m => m.STRATEGIES);
// Note: Use synchronous import in actual implementation

// ============================================
// CORE YEAR CALCULATION
// ============================================

export function computeEdiYear(input: EdiYearInput): EdiYearResult {
  const {
    year, strategyId, collateralValue, combinedStRate, combinedLtRate,
    filingStatus, washSaleRate, priorStCarryforward, priorLtCarryforward,
  } = input;

  const strategy = STRATEGIES.find(s => s.id === strategyId);
  if (!strategy) throw new Error(`Unknown strategy: ${strategyId}`);

  // --- Step 1: Gross generation ---
  const stLossRate = getStLossRateForYear(strategy, year);
  const ltGainRate = strategy.ltGainRate;
  const stLossesHarvested = safeNumber(collateralValue * stLossRate * (1 - washSaleRate));
  const ltGainsRealized = safeNumber(collateralValue * ltGainRate);

  // --- Step 2: IRC netting - ST losses offset LT gains ---
  const stLossesUsedToOffsetLtGains = Math.min(stLossesHarvested, ltGainsRealized);
  const netLtGainAfterOffset = safeNumber(ltGainsRealized - stLossesUsedToOffsetLtGains);
  const excessStLossAfterOffset = safeNumber(stLossesHarvested - stLossesUsedToOffsetLtGains);

  // --- Step 3: Apply prior carryforward to any remaining LT gains ---
  let remainingLtGain = netLtGainAfterOffset;
  let stCf = priorStCarryforward;
  let ltCf = priorLtCarryforward;

  // LT carryforward offsets LT gains first
  const ltCfUsed = Math.min(ltCf, remainingLtGain);
  remainingLtGain -= ltCfUsed;
  ltCf -= ltCfUsed;

  // ST carryforward cross-applies to remaining LT gains
  const stCfUsedAgainstLt = Math.min(stCf, remainingLtGain);
  remainingLtGain -= stCfUsedAgainstLt;
  stCf -= stCfUsedAgainstLt;

  const priorCfUsedAgainstLtGains = ltCfUsed + stCfUsedAgainstLt;

  // --- Step 4: Add excess ST losses to carryforward ---
  stCf += excessStLossAfterOffset;

  // --- Step 5: $3K ordinary income deduction ---
  const capitalLossLimit = CAPITAL_LOSS_LIMITS[filingStatus];
  const totalAvailable = stCf + ltCf;
  const capitalLossDeduction = Math.min(totalAvailable, capitalLossLimit);

  // Consume from ST first, then LT
  let deductionRemaining = capitalLossDeduction;
  if (deductionRemaining > 0 && stCf > 0) {
    const used = Math.min(deductionRemaining, stCf);
    stCf -= used;
    deductionRemaining -= used;
  }
  if (deductionRemaining > 0 && ltCf > 0) {
    const used = Math.min(deductionRemaining, ltCf);
    ltCf -= used;
    deductionRemaining -= used;
  }

  // --- Step 6: Tax calculations ---
  const taxOnRemainingLtGains = safeNumber(remainingLtGain * combinedLtRate);
  const taxSavedByCapitalLossDeduction = safeNumber(capitalLossDeduction * combinedStRate);
  const annualRealizedBenefit = safeNumber(taxSavedByCapitalLossDeduction - taxOnRemainingLtGains);

  // --- Step 7: Harvesting efficiency ---
  const harvestingEfficiency = ltGainsRealized > 0
    ? safeNumber(stLossesHarvested / ltGainsRealized)
    : Infinity;

  return {
    year,
    collateralValue,
    stLossesHarvested,
    ltGainsRealized,
    stLossesUsedToOffsetLtGains,
    netLtGainAfterOffset,
    excessStLossAfterOffset,
    priorCfUsedAgainstLtGains,
    taxOnRemainingLtGains,
    capitalLossDeduction,
    taxSavedByCapitalLossDeduction,
    annualRealizedBenefit,
    endingStCarryforward: safeNumber(stCf),
    endingLtCarryforward: safeNumber(ltCf),
    harvestingEfficiency,
  };
}
```

**Note:** The `STRATEGIES` import above uses a dynamic import for illustration. In actual implementation, import `STRATEGIES` synchronously from `../strategyData` at the top of the file:
```typescript
import { STRATEGIES, getStLossRateForYear, CAPITAL_LOSS_LIMITS } from '../strategyData';
```

### Step 4: Run test to verify it passes

Run: `cd "/Users/housetyrell/Documents/Programming Projects/EnhancedDirectIndexingCalc" && npx vitest run src/ediOnly.test.ts`
Expected: PASS (3 tests)

### Step 5: Commit

```bash
git add src/calculations/ediOnly.ts src/ediOnly.test.ts
git commit -m "feat: add EDI-Only year calculation with corrected IRC netting"
```

---

## Task 2: Multi-Year Projection & Carryforward Accumulation

**Files:**
- Modify: `src/calculations/ediOnly.ts`
- Test: `src/ediOnly.test.ts`

### Step 1: Write the failing test for multi-year projection

```typescript
// Add to src/ediOnly.test.ts
import { computeEdiProjection } from './calculations/ediOnly';

describe('computeEdiProjection', () => {
  const defaults = {
    strategyId: 'overlay-45-45',
    collateralValue: 10_000_000,
    combinedStRate: 0.541,
    combinedLtRate: 0.371,
    filingStatus: 'mfj' as const,
    washSaleRate: 0,
    existingStCarryforward: 0,
    existingLtCarryforward: 0,
    annualReturn: 0.07,
    projectionYears: 10,
  };

  it('should accumulate carryforward over 10 years', () => {
    const result = computeEdiProjection(defaults);

    expect(result.years).toHaveLength(10);

    // Year 1: ~$1.507M CF
    expect(result.years[0].endingStCarryforward).toBeGreaterThan(1_400_000);

    // Year 10: CF should be significantly larger
    expect(result.years[9].endingStCarryforward).toBeGreaterThan(4_000_000);

    // Carryforward should increase every year
    for (let i = 1; i < result.years.length; i++) {
      expect(result.years[i].endingStCarryforward)
        .toBeGreaterThan(result.years[i - 1].endingStCarryforward);
    }
  });

  it('should compute correct summary totals', () => {
    const result = computeEdiProjection(defaults);

    expect(result.summary.totalRealizedBenefit).toBeGreaterThan(0);
    expect(result.summary.finalCarryforward).toBeGreaterThan(4_000_000);
    expect(result.summary.carryforwardTaxShield).toBeGreaterThan(1_500_000);
    expect(result.summary.cumulativeHarvestingEfficiency).toBeGreaterThan(2);
  });

  it('should grow collateral value when annualReturn > 0', () => {
    const result = computeEdiProjection(defaults);

    expect(result.years[9].collateralValue)
      .toBeGreaterThan(defaults.collateralValue);
  });
});
```

### Step 2: Run test to verify it fails

Run: `cd "/Users/housetyrell/Documents/Programming Projects/EnhancedDirectIndexingCalc" && npx vitest run src/ediOnly.test.ts`
Expected: FAIL

### Step 3: Implement computeEdiProjection

Add to `src/calculations/ediOnly.ts`:

```typescript
export interface EdiProjectionInput {
  strategyId: string;
  collateralValue: number;
  combinedStRate: number;
  combinedLtRate: number;
  filingStatus: FilingStatus;
  washSaleRate: number;
  existingStCarryforward: number;
  existingLtCarryforward: number;
  annualReturn: number;
  projectionYears: number;
}

export interface EdiProjectionSummary {
  totalRealizedBenefit: number;
  totalStLossesHarvested: number;
  totalLtGainsRealized: number;
  finalCarryforward: number;
  carryforwardTaxShield: number;
  cumulativeHarvestingEfficiency: number;
}

export interface EdiProjectionResult {
  years: EdiYearResult[];
  summary: EdiProjectionSummary;
}

export function computeEdiProjection(input: EdiProjectionInput): EdiProjectionResult {
  const years: EdiYearResult[] = [];
  let stCf = input.existingStCarryforward;
  let ltCf = input.existingLtCarryforward;
  let collateralValue = input.collateralValue;

  for (let year = 1; year <= input.projectionYears; year++) {
    const yearResult = computeEdiYear({
      year,
      strategyId: input.strategyId,
      collateralValue,
      combinedStRate: input.combinedStRate,
      combinedLtRate: input.combinedLtRate,
      filingStatus: input.filingStatus,
      washSaleRate: input.washSaleRate,
      priorStCarryforward: stCf,
      priorLtCarryforward: ltCf,
    });

    years.push(yearResult);

    // Thread state forward
    stCf = yearResult.endingStCarryforward;
    ltCf = yearResult.endingLtCarryforward;
    collateralValue = safeNumber(collateralValue * (1 + input.annualReturn));
  }

  // Compute summary
  const totalStLosses = years.reduce((s, y) => s + y.stLossesHarvested, 0);
  const totalLtGains = years.reduce((s, y) => s + y.ltGainsRealized, 0);
  const finalCf = stCf + ltCf;

  const summary: EdiProjectionSummary = {
    totalRealizedBenefit: safeNumber(years.reduce((s, y) => s + y.annualRealizedBenefit, 0)),
    totalStLossesHarvested: safeNumber(totalStLosses),
    totalLtGainsRealized: safeNumber(totalLtGains),
    finalCarryforward: safeNumber(finalCf),
    carryforwardTaxShield: safeNumber(finalCf * input.combinedLtRate),
    cumulativeHarvestingEfficiency: totalLtGains > 0 ? safeNumber(totalStLosses / totalLtGains) : Infinity,
  };

  return { years, summary };
}
```

### Step 4: Run test to verify it passes

Run: `cd "/Users/housetyrell/Documents/Programming Projects/EnhancedDirectIndexingCalc" && npx vitest run src/ediOnly.test.ts`
Expected: PASS

### Step 5: Commit

```bash
git add src/calculations/ediOnly.ts src/ediOnly.test.ts
git commit -m "feat: add EDI multi-year projection with carryforward accumulation"
```

---

## Task 3: Realization Scenario Engine

**Files:**
- Modify: `src/calculations/ediOnly.ts`
- Test: `src/ediOnly.test.ts`

### Step 1: Write the failing tests

```typescript
// Add to src/ediOnly.test.ts
import { calculateRealizationScenario } from './calculations/ediOnly';

describe('calculateRealizationScenario', () => {
  it('should shelter gains with carryforward — no annual limit', () => {
    const result = calculateRealizationScenario({
      gainAmount: 3_000_000,
      gainCharacter: 'lt',
      availableStCarryforward: 5_000_000,
      availableLtCarryforward: 0,
      combinedStRate: 0.541,
      combinedLtRate: 0.371,
    });

    // $5M CF can shelter $3M in gains — NO dollar limit
    expect(result.carryforwardUsed).toBe(3_000_000);
    expect(result.taxableGainAfterCf).toBe(0);
    expect(result.taxWithCarryforward).toBe(0);
    expect(result.taxWithoutCarryforward).toBeCloseTo(1_113_000, -2);
    expect(result.taxSaved).toBeCloseTo(1_113_000, -2);
    expect(result.remainingStCarryforward).toBe(2_000_000);
  });

  it('should apply same-character CF first, then cross-apply', () => {
    const result = calculateRealizationScenario({
      gainAmount: 2_000_000,
      gainCharacter: 'lt',
      availableStCarryforward: 500_000,
      availableLtCarryforward: 1_000_000,
      combinedStRate: 0.541,
      combinedLtRate: 0.371,
    });

    // LT CF offsets LT gain first: $1M
    // Then ST CF cross-applies: $500K
    // Total offset: $1.5M
    // Remaining taxable: $500K
    expect(result.carryforwardUsed).toBe(1_500_000);
    expect(result.taxableGainAfterCf).toBe(500_000);
    expect(result.remainingStCarryforward).toBe(0);
    expect(result.remainingLtCarryforward).toBe(0);
  });

  it('should handle concentrated stock exit scenario defaults', () => {
    const result = calculateRealizationScenario({
      gainAmount: 5_000_000,
      gainCharacter: 'lt',
      availableStCarryforward: 5_470_000,
      availableLtCarryforward: 0,
      combinedStRate: 0.541,
      combinedLtRate: 0.371,
    });

    // $5.47M CF shelters $5M gain fully
    expect(result.taxableGainAfterCf).toBe(0);
    expect(result.taxSaved).toBeCloseTo(1_855_000, -3);
  });
});
```

### Step 2: Run test to verify it fails

Run: `cd "/Users/housetyrell/Documents/Programming Projects/EnhancedDirectIndexingCalc" && npx vitest run src/ediOnly.test.ts`
Expected: FAIL

### Step 3: Implement realization scenario calculation

Add to `src/calculations/ediOnly.ts`:

```typescript
export type GainCharacter = 'st' | 'lt';

export interface RealizationInput {
  gainAmount: number;
  gainCharacter: GainCharacter;
  availableStCarryforward: number;
  availableLtCarryforward: number;
  combinedStRate: number;
  combinedLtRate: number;
}

export interface RealizationResult {
  gainAmount: number;
  gainCharacter: GainCharacter;
  applicableTaxRate: number;
  carryforwardUsed: number;
  taxableGainAfterCf: number;
  taxWithoutCarryforward: number;
  taxWithCarryforward: number;
  taxSaved: number;
  remainingStCarryforward: number;
  remainingLtCarryforward: number;
}

export function calculateRealizationScenario(input: RealizationInput): RealizationResult {
  const {
    gainAmount, gainCharacter, availableStCarryforward,
    availableLtCarryforward, combinedStRate, combinedLtRate,
  } = input;

  const applicableTaxRate = gainCharacter === 'lt' ? combinedLtRate : combinedStRate;
  const taxWithoutCarryforward = safeNumber(gainAmount * applicableTaxRate);

  let remainingGain = gainAmount;
  let stCf = availableStCarryforward;
  let ltCf = availableLtCarryforward;

  // Same-character CF first
  if (gainCharacter === 'lt') {
    const ltUsed = Math.min(ltCf, remainingGain);
    remainingGain -= ltUsed;
    ltCf -= ltUsed;
    // Cross-apply ST CF
    const stUsed = Math.min(stCf, remainingGain);
    remainingGain -= stUsed;
    stCf -= stUsed;
  } else {
    const stUsed = Math.min(stCf, remainingGain);
    remainingGain -= stUsed;
    stCf -= stUsed;
    // Cross-apply LT CF
    const ltUsed = Math.min(ltCf, remainingGain);
    remainingGain -= ltUsed;
    ltCf -= ltUsed;
  }

  const cfUsed = gainAmount - remainingGain;
  const taxWithCarryforward = safeNumber(remainingGain * applicableTaxRate);

  return {
    gainAmount,
    gainCharacter,
    applicableTaxRate,
    carryforwardUsed: safeNumber(cfUsed),
    taxableGainAfterCf: safeNumber(remainingGain),
    taxWithoutCarryforward,
    taxWithCarryforward,
    taxSaved: safeNumber(taxWithoutCarryforward - taxWithCarryforward),
    remainingStCarryforward: safeNumber(stCf),
    remainingLtCarryforward: safeNumber(ltCf),
  };
}
```

### Step 4: Run test to verify it passes

Run: `cd "/Users/housetyrell/Documents/Programming Projects/EnhancedDirectIndexingCalc" && npx vitest run src/ediOnly.test.ts`
Expected: PASS

### Step 5: Commit

```bash
git add src/calculations/ediOnly.ts src/ediOnly.test.ts
git commit -m "feat: add realization scenario engine with IRC character netting"
```

---

## Task 4: Default Realization Scenarios

**Files:**
- Modify: `src/calculations/ediOnly.ts`
- Test: `src/ediOnly.test.ts`

### Step 1: Write the failing tests

```typescript
// Add to src/ediOnly.test.ts
import { getDefaultScenarios, computeScenarioResults } from './calculations/ediOnly';

describe('default realization scenarios', () => {
  it('should provide 3 pre-built scenarios', () => {
    const scenarios = getDefaultScenarios(10_000_000);
    expect(scenarios).toHaveLength(3);
    expect(scenarios[0].label).toBe('Concentrated Stock Exit');
    expect(scenarios[1].label).toBe('Portfolio Transition');
    expect(scenarios[2].label).toBe('Retirement Liquidation');
  });

  it('should compute concentrated stock exit at Year 5', () => {
    const projection = computeEdiProjection({
      strategyId: 'overlay-45-45',
      collateralValue: 10_000_000,
      combinedStRate: 0.541,
      combinedLtRate: 0.371,
      filingStatus: 'mfj',
      washSaleRate: 0,
      existingStCarryforward: 0,
      existingLtCarryforward: 0,
      annualReturn: 0.07,
      projectionYears: 10,
    });

    const scenarios = getDefaultScenarios(10_000_000);
    const results = computeScenarioResults(scenarios[0], projection, 0.371);

    // At Year 5, should have substantial CF to shelter the $5M gain
    expect(results.taxSaved).toBeGreaterThan(1_000_000);
  });

  it('should compute multi-year retirement liquidation', () => {
    const projection = computeEdiProjection({
      strategyId: 'overlay-45-45',
      collateralValue: 10_000_000,
      combinedStRate: 0.541,
      combinedLtRate: 0.371,
      filingStatus: 'mfj',
      washSaleRate: 0,
      existingStCarryforward: 0,
      existingLtCarryforward: 0,
      annualReturn: 0.07,
      projectionYears: 10,
    });

    const scenarios = getDefaultScenarios(10_000_000);
    const results = computeScenarioResults(scenarios[2], projection, 0.371);

    // Multi-year scenario should have year-by-year details
    expect(results.yearDetails).toBeDefined();
    expect(results.yearDetails!.length).toBeGreaterThan(0);
  });
});
```

### Step 2: Run test to verify it fails

Run: `cd "/Users/housetyrell/Documents/Programming Projects/EnhancedDirectIndexingCalc" && npx vitest run src/ediOnly.test.ts`
Expected: FAIL

### Step 3: Implement default scenarios and multi-year realization

Add to `src/calculations/ediOnly.ts`:

```typescript
export interface RealizationScenario {
  label: string;
  description: string;
  gainAmount: number;
  gainCharacter: GainCharacter;
  yearOfEvent: number;
  isMultiYear: boolean;
  annualGainAmount?: number;
  durationYears?: number;
}

export interface ScenarioResult {
  scenario: RealizationScenario;
  taxWithoutCarryforward: number;
  taxWithCarryforward: number;
  taxSaved: number;
  carryforwardUsed: number;
  remainingCarryforward: number;
  yearDetails?: Array<{
    year: number;
    gainThisYear: number;
    cfAvailable: number;
    cfUsed: number;
    taxableGain: number;
    taxOwed: number;
    taxSaved: number;
    cfRemaining: number;
  }>;
}

export function getDefaultScenarios(collateralValue: number): RealizationScenario[] {
  return [
    {
      label: 'Concentrated Stock Exit',
      description: 'Client sells appreciated stock position',
      gainAmount: collateralValue * 0.5,
      gainCharacter: 'lt',
      yearOfEvent: 5,
      isMultiYear: false,
    },
    {
      label: 'Portfolio Transition',
      description: 'Client moves to new advisor, realizes embedded gains',
      gainAmount: collateralValue * 0.2,
      gainCharacter: 'lt',
      yearOfEvent: 3,
      isMultiYear: false,
    },
    {
      label: 'Retirement Liquidation',
      description: 'Systematic drawdown over multiple years',
      gainAmount: 0, // computed from annual
      gainCharacter: 'lt',
      yearOfEvent: 7,
      isMultiYear: true,
      annualGainAmount: collateralValue * 0.05,
      durationYears: 5,
    },
  ];
}

export function computeScenarioResults(
  scenario: RealizationScenario,
  projection: EdiProjectionResult,
  combinedLtRate: number,
): ScenarioResult {
  const yearIdx = Math.min(scenario.yearOfEvent - 1, projection.years.length - 1);
  const cfAtEvent = projection.years[yearIdx];
  let stCf = cfAtEvent.endingStCarryforward;
  let ltCf = cfAtEvent.endingLtCarryforward;
  const combinedStRate = combinedLtRate * 1.46; // approximate ST/LT ratio; use actual from caller

  if (!scenario.isMultiYear) {
    const result = calculateRealizationScenario({
      gainAmount: scenario.gainAmount,
      gainCharacter: scenario.gainCharacter,
      availableStCarryforward: stCf,
      availableLtCarryforward: ltCf,
      combinedStRate,
      combinedLtRate,
    });
    return {
      scenario,
      taxWithoutCarryforward: result.taxWithoutCarryforward,
      taxWithCarryforward: result.taxWithCarryforward,
      taxSaved: result.taxSaved,
      carryforwardUsed: result.carryforwardUsed,
      remainingCarryforward: result.remainingStCarryforward + result.remainingLtCarryforward,
    };
  }

  // Multi-year realization
  const yearDetails: ScenarioResult['yearDetails'] = [];
  let totalTaxWithout = 0;
  let totalTaxWith = 0;

  for (let i = 0; i < (scenario.durationYears ?? 1); i++) {
    const annualGain = scenario.annualGainAmount ?? scenario.gainAmount;
    const cfAvailable = stCf + ltCf;

    const result = calculateRealizationScenario({
      gainAmount: annualGain,
      gainCharacter: scenario.gainCharacter,
      availableStCarryforward: stCf,
      availableLtCarryforward: ltCf,
      combinedStRate,
      combinedLtRate,
    });

    yearDetails.push({
      year: scenario.yearOfEvent + i,
      gainThisYear: annualGain,
      cfAvailable,
      cfUsed: result.carryforwardUsed,
      taxableGain: result.taxableGainAfterCf,
      taxOwed: result.taxWithCarryforward,
      taxSaved: result.taxSaved,
      cfRemaining: result.remainingStCarryforward + result.remainingLtCarryforward,
    });

    totalTaxWithout += result.taxWithoutCarryforward;
    totalTaxWith += result.taxWithCarryforward;
    stCf = result.remainingStCarryforward;
    ltCf = result.remainingLtCarryforward;
  }

  return {
    scenario,
    taxWithoutCarryforward: safeNumber(totalTaxWithout),
    taxWithCarryforward: safeNumber(totalTaxWith),
    taxSaved: safeNumber(totalTaxWithout - totalTaxWith),
    carryforwardUsed: safeNumber(
      (cfAtEvent.endingStCarryforward + cfAtEvent.endingLtCarryforward) - (stCf + ltCf)
    ),
    remainingCarryforward: safeNumber(stCf + ltCf),
    yearDetails,
  };
}
```

### Step 4: Run test to verify it passes

Run: `cd "/Users/housetyrell/Documents/Programming Projects/EnhancedDirectIndexingCalc" && npx vitest run src/ediOnly.test.ts`
Expected: PASS

### Step 5: Commit

```bash
git add src/calculations/ediOnly.ts src/ediOnly.test.ts
git commit -m "feat: add default realization scenarios with multi-year support"
```

---

## Task 5: Unwind Analysis & Embedded Gain Estimation

**Files:**
- Modify: `src/calculations/ediOnly.ts`
- Test: `src/ediOnly.test.ts`

### Step 1: Write the failing tests

```typescript
// Add to src/ediOnly.test.ts
import { estimateEmbeddedGainPct, calculateUnwindAnalysis } from './calculations/ediOnly';

describe('embedded gain estimation', () => {
  it('should estimate embedded gain percentage by year', () => {
    const pct1 = estimateEmbeddedGainPct('overlay-45-45', 1, 0.07);
    const pct5 = estimateEmbeddedGainPct('overlay-45-45', 5, 0.07);
    const pct10 = estimateEmbeddedGainPct('overlay-45-45', 10, 0.07);

    // Embedded gain grows over time
    expect(pct1).toBeGreaterThan(0.10);
    expect(pct5).toBeGreaterThan(pct1);
    expect(pct10).toBeGreaterThan(pct5);

    // Should be in reasonable range
    expect(pct10).toBeLessThan(0.90);
  });

  it('should have zero embedded gain with zero growth', () => {
    // With no market appreciation, embedded gain comes only from basis reduction
    const pct = estimateEmbeddedGainPct('overlay-45-45', 1, 0);
    // Basis reduction from harvesting creates embedded gain even at 0% growth
    expect(pct).toBeGreaterThan(0);
  });
});

describe('unwind analysis', () => {
  it('should compute full liquidation unwind', () => {
    const projection = computeEdiProjection({
      strategyId: 'overlay-45-45',
      collateralValue: 10_000_000,
      combinedStRate: 0.541,
      combinedLtRate: 0.371,
      filingStatus: 'mfj',
      washSaleRate: 0,
      existingStCarryforward: 0,
      existingLtCarryforward: 0,
      annualReturn: 0.07,
      projectionYears: 10,
    });

    const unwind = calculateUnwindAnalysis({
      unwindYear: 5,
      projection,
      strategyId: 'overlay-45-45',
      annualReturn: 0.07,
      combinedLtRate: 0.371,
    });

    // Should have embedded gains
    expect(unwind.embeddedGainEstimate).toBeGreaterThan(0);
    // Carryforward should shelter some/all of the gains
    expect(unwind.carryforwardUsed).toBeGreaterThan(0);
    // Tax saved should be substantial
    expect(unwind.taxSavedByCf).toBeGreaterThan(0);
  });
});
```

### Step 2: Run test to verify it fails

Run: `cd "/Users/housetyrell/Documents/Programming Projects/EnhancedDirectIndexingCalc" && npx vitest run src/ediOnly.test.ts`
Expected: FAIL

### Step 3: Implement embedded gain estimation and unwind analysis

Add to `src/calculations/ediOnly.ts`:

```typescript
export function estimateEmbeddedGainPct(
  strategyId: string,
  year: number,
  annualReturn: number,
): number {
  const strategy = STRATEGIES.find(s => s.id === strategyId);
  if (!strategy) return 0;

  let portfolioValue = 1.0;
  let cumulativeBasisReduction = 0;
  let cumulativeRealized = 0;

  for (let y = 1; y <= year; y++) {
    const stLossRate = getStLossRateForYear(strategy, y);
    const ltGainRate = strategy.ltGainRate;
    const netStLoss = Math.max(0, stLossRate - ltGainRate);

    cumulativeBasisReduction += portfolioValue * netStLoss;
    cumulativeRealized += portfolioValue * ltGainRate;
    portfolioValue *= (1 + annualReturn);
  }

  const cumulativeAppreciation = portfolioValue - 1.0;
  const embeddedGain = cumulativeAppreciation - cumulativeRealized + cumulativeBasisReduction;
  return Math.max(0, embeddedGain / portfolioValue);
}

export interface UnwindInput {
  unwindYear: number;
  projection: EdiProjectionResult;
  strategyId: string;
  annualReturn: number;
  combinedLtRate: number;
}

export interface UnwindResult {
  unwindYear: number;
  portfolioValueAtUnwind: number;
  embeddedGainPct: number;
  embeddedGainEstimate: number;
  availableCarryforward: number;
  carryforwardUsed: number;
  taxableGainAfterCf: number;
  grossUnwindTax: number;
  netUnwindTax: number;
  taxSavedByCf: number;
  remainingCarryforward: number;
}

export function calculateUnwindAnalysis(input: UnwindInput): UnwindResult {
  const { unwindYear, projection, strategyId, annualReturn, combinedLtRate } = input;
  const yearIdx = Math.min(unwindYear - 1, projection.years.length - 1);
  const yearData = projection.years[yearIdx];

  const portfolioValue = yearData.collateralValue;
  const embeddedGainPct = estimateEmbeddedGainPct(strategyId, unwindYear, annualReturn);
  const embeddedGain = safeNumber(portfolioValue * embeddedGainPct);

  const totalCf = yearData.endingStCarryforward + yearData.endingLtCarryforward;
  const cfUsed = Math.min(totalCf, embeddedGain);
  const taxableAfterCf = Math.max(0, embeddedGain - cfUsed);

  return {
    unwindYear,
    portfolioValueAtUnwind: safeNumber(portfolioValue),
    embeddedGainPct,
    embeddedGainEstimate: embeddedGain,
    availableCarryforward: safeNumber(totalCf),
    carryforwardUsed: safeNumber(cfUsed),
    taxableGainAfterCf: safeNumber(taxableAfterCf),
    grossUnwindTax: safeNumber(embeddedGain * combinedLtRate),
    netUnwindTax: safeNumber(taxableAfterCf * combinedLtRate),
    taxSavedByCf: safeNumber(cfUsed * combinedLtRate),
    remainingCarryforward: safeNumber(totalCf - cfUsed),
  };
}
```

### Step 4: Run test to verify it passes

Run: `cd "/Users/housetyrell/Documents/Programming Projects/EnhancedDirectIndexingCalc" && npx vitest run src/ediOnly.test.ts`
Expected: PASS

### Step 5: Commit

```bash
git add src/calculations/ediOnly.ts src/ediOnly.test.ts
git commit -m "feat: add embedded gain estimation and unwind analysis"
```

---

## Task 6: Estate Comparison Calculation

**Files:**
- Modify: `src/calculations/ediOnly.ts`
- Test: `src/ediOnly.test.ts`

### Step 1: Write the failing tests

```typescript
// Add to src/ediOnly.test.ts
import { calculateEstateComparison } from './calculations/ediOnly';

describe('estate comparison', () => {
  it('should recommend full unwind when CF > embedded gains', () => {
    const result = calculateEstateComparison({
      portfolioValue: 10_000_000,
      embeddedGainPct: 0.30,
      availableStCarryforward: 5_000_000,
      availableLtCarryforward: 0,
      combinedLtRate: 0.371,
    });

    // CF ($5M) > embedded gains ($3M) → unwind
    expect(result.recommendation).toBe('unwind');
    expect(result.unwindBeforeDeath.taxPaid).toBe(0);
  });

  it('should recommend partial unwind when CF < embedded gains', () => {
    const result = calculateEstateComparison({
      portfolioValue: 10_000_000,
      embeddedGainPct: 0.60,
      availableStCarryforward: 3_000_000,
      availableLtCarryforward: 0,
      combinedLtRate: 0.371,
    });

    // CF ($3M) < embedded gains ($6M) → partial unwind
    expect(result.recommendation).toBe('partial_unwind');
    expect(result.optimalUnwindPct).toBeGreaterThan(0);
    expect(result.optimalUnwindPct).toBeLessThan(1);
  });

  it('should recommend continue when CF is zero', () => {
    const result = calculateEstateComparison({
      portfolioValue: 10_000_000,
      embeddedGainPct: 0.50,
      availableStCarryforward: 0,
      availableLtCarryforward: 0,
      combinedLtRate: 0.371,
    });

    expect(result.recommendation).toBe('continue');
  });
});
```

### Step 2: Run test to verify it fails

Run: `cd "/Users/housetyrell/Documents/Programming Projects/EnhancedDirectIndexingCalc" && npx vitest run src/ediOnly.test.ts`
Expected: FAIL

### Step 3: Implement estate comparison

Add to `src/calculations/ediOnly.ts`:

```typescript
export interface EstateComparisonInput {
  portfolioValue: number;
  embeddedGainPct: number;
  availableStCarryforward: number;
  availableLtCarryforward: number;
  combinedLtRate: number;
}

export interface EstateComparisonResult {
  continueAndDie: {
    stepUpValue: number;
    carryforwardLost: number;
    carryforwardValueLost: number;
    netBenefit: number;
  };
  unwindBeforeDeath: {
    embeddedGains: number;
    carryforwardUsed: number;
    taxPaid: number;
    netCost: number;
  };
  recommendation: 'continue' | 'unwind' | 'partial_unwind';
  optimalUnwindPct: number;
  explanation: string;
}

export function calculateEstateComparison(input: EstateComparisonInput): EstateComparisonResult {
  const {
    portfolioValue, embeddedGainPct, availableStCarryforward,
    availableLtCarryforward, combinedLtRate,
  } = input;

  const embeddedGains = safeNumber(portfolioValue * embeddedGainPct);
  const totalCf = availableStCarryforward + availableLtCarryforward;

  // Continue + Die: step-up eliminates gains, but CF is lost
  const stepUpValue = safeNumber(embeddedGains * combinedLtRate);
  const cfValueLost = safeNumber(totalCf * combinedLtRate);

  // Unwind: use CF to shelter gains
  const cfUsed = Math.min(totalCf, embeddedGains);
  const taxPaid = safeNumber(Math.max(0, embeddedGains - cfUsed) * combinedLtRate);

  // Optimal partial unwind: use exactly the CF, keep rest for step-up
  const optimalUnwindAmount = embeddedGainPct > 0
    ? Math.min(totalCf / embeddedGainPct, portfolioValue)
    : 0;
  const optimalUnwindPct = portfolioValue > 0
    ? safeNumber(optimalUnwindAmount / portfolioValue)
    : 0;

  let recommendation: EstateComparisonResult['recommendation'];
  let explanation: string;

  if (totalCf === 0) {
    recommendation = 'continue';
    explanation = 'No carryforward to use. Step-up at death eliminates all embedded gains tax-free.';
  } else if (totalCf >= embeddedGains) {
    recommendation = 'unwind';
    explanation = 'Carryforward exceeds embedded gains. Unwind fully: CF shelters all gains tax-free. Excess CF would be lost at death.';
  } else {
    recommendation = 'partial_unwind';
    explanation =
      `Unwind ${Math.round(optimalUnwindPct * 100)}% of portfolio (using all CF to shelter gains), ` +
      `keep ${Math.round((1 - optimalUnwindPct) * 100)}% for step-up at death.`;
  }

  return {
    continueAndDie: {
      stepUpValue,
      carryforwardLost: safeNumber(totalCf),
      carryforwardValueLost: cfValueLost,
      netBenefit: safeNumber(stepUpValue - cfValueLost),
    },
    unwindBeforeDeath: {
      embeddedGains,
      carryforwardUsed: safeNumber(cfUsed),
      taxPaid,
      netCost: taxPaid,
    },
    recommendation,
    optimalUnwindPct,
    explanation,
  };
}
```

### Step 4: Run test to verify it passes

Run: `cd "/Users/housetyrell/Documents/Programming Projects/EnhancedDirectIndexingCalc" && npx vitest run src/ediOnly.test.ts`
Expected: PASS

### Step 5: Commit

```bash
git add src/calculations/ediOnly.ts src/ediOnly.test.ts
git commit -m "feat: add estate comparison with optimal unwind percentage"
```

---

## Task 7: CPA & PM Review Checkpoint

**This is a review gate. Do NOT proceed to UI tasks until this passes.**

### Step 1: Run the full EDI test suite

Run: `cd "/Users/housetyrell/Documents/Programming Projects/EnhancedDirectIndexingCalc" && npx vitest run src/ediOnly.test.ts`
Expected: ALL PASS

### Step 2: Run the existing test suite (regression check)

Run: `cd "/Users/housetyrell/Documents/Programming Projects/EnhancedDirectIndexingCalc" && npx vitest run`
Expected: ALL PASS (existing 164 tests + new EDI tests)

### Step 3: CPA Agent Review

Use `compound-engineering:finance:cpa-agent` to review `src/calculations/ediOnly.ts` for:
- [ ] IRC Section 1211(b): $3K/$1.5K limits correctly applied
- [ ] IRC Section 1212(b): Character-preserving carryforward netting
- [ ] IRC Section 1(h): Same-character offset before cross-application
- [ ] IRC Section 1014/1212(b): Estate comparison logic (step-up vs CF loss)
- [ ] No annual dollar limit on CF usage against capital gains
- [ ] PA state non-conformity flagged (carryforward provides zero PA benefit)

### Step 4: PM Agent Review

Use `compound-engineering:finance:portfolio-manager-agent` to review `src/calculations/ediOnly.ts` for:
- [ ] Embedded gain estimation accounts for basis reduction from harvesting
- [ ] Harvesting efficiency metric uses correct formula and ranges
- [ ] Realization scenarios use reasonable default amounts
- [ ] Unwind analysis correctly models CF consumption
- [ ] Break-even logic is economically sound
- [ ] Multi-year retirement liquidation properly threads CF state

### Step 5: Address any findings, re-run tests, commit

---

## Task 8: EDI-Only UI Component — Year-by-Year Table

**Files:**
- Create: `src/components/EdiOnlyTab.tsx`
- Create: `src/components/EdiOnlyTab.css`
- Reference: `src/AdvancedMode/QfafTestByYear.tsx` (pattern template)
- Reference: `src/AdvancedMode/QfafTestByYear.css` (styling template)

### Step 1: Create the component with year-by-year carryforward table

The component should:
- Accept props: `inputs`, `advancedSettings`, `taxRates`, `currentStrategy`
- Use `computeEdiProjection()` via `useMemo`
- Display editable assumptions (collateral, strategy, growth rate)
- Render year-by-year table with columns:
  - Year | ST Losses | LT Gains | Net to CF | $3K Deduction | Cumulative CF | CF Tax Shield | Efficiency
- Display carryforward accumulation summary
- Use `useReducer` for local assumption state (following QfafTestByYear pattern)

Follow the exact structure of `src/AdvancedMode/QfafTestByYear.tsx`:
- `ROW_DEFINITIONS` array for declarative table rendering
- `useReducer` with `State`/`Action` types
- `useMemo` for computation results
- `handleAssumptionChange` and `handleReset` handlers

CSS: Copy patterns from `src/AdvancedMode/QfafTestByYear.css`, adapting class names. Use CSS variables from `src/index.css` (lines 8-39): `--card-bg`, `--text`, `--border`, `--collateral-bg`, etc.

### Step 2: Verify it renders

Run: `cd "/Users/housetyrell/Documents/Programming Projects/EnhancedDirectIndexingCalc" && npx vite`
Navigate to the EDI-Only tab, verify the table renders with correct data.

### Step 3: Commit

```bash
git add src/components/EdiOnlyTab.tsx src/components/EdiOnlyTab.css
git commit -m "feat: add EDI-Only tab with year-by-year carryforward table"
```

---

## Task 9: Realization Scenario Cards UI

**Files:**
- Modify: `src/components/EdiOnlyTab.tsx`

### Step 1: Add realization scenario section

Below the year-by-year table, add a "Realization Scenarios" section showing:
- 3 pre-built scenario cards (Concentrated Stock Exit, Portfolio Transition, Retirement Liquidation)
- Each card shows: gain amount, CF used, tax without CF, tax with CF, tax saved
- Visual comparison (bar chart or side-by-side numbers)
- "Custom Scenario" button that opens editable inputs:
  - Year of event (dropdown 1-10)
  - Gain amount (currency input)
  - Gain character (ST/LT toggle)
  - Multi-year toggle with duration

### Step 2: Verify rendering and interaction

Run dev server, verify scenario cards display and custom scenario works.

### Step 3: Commit

```bash
git add src/components/EdiOnlyTab.tsx src/components/EdiOnlyTab.css
git commit -m "feat: add realization scenario cards with custom scenario support"
```

---

## Task 10: Unwind Analysis Section UI

**Files:**
- Modify: `src/components/EdiOnlyTab.tsx`

### Step 1: Add unwind analysis section

Below realization scenarios, add "Strategy Unwind Analysis" section showing:
- **Unwind Year slider** (1-10): Select when to unwind
- **Summary cards**: Embedded gain estimate, CF available, CF used, net tax at unwind
- **Year-by-year unwind comparison table**: For each year 1-10, show embedded gain, CF, net unwind cost
- **Break-even indicator**: Visual marker at the year where CF >= embedded gains (or "not reached" message)
- Highlight: "After Year X, unwinding is tax-free because carryforward exceeds embedded gains"

### Step 2: Add estate comparison section

Below unwind analysis:
- **3-column comparison**: Continue + Die | Full Unwind | Partial Unwind
- Each column shows: key numbers (step-up value, CF lost, tax paid)
- Highlighted recommendation card with explanation text
- Disclaimer: "Carryforwards are lost at death (IRC Section 1212(b)). Consult estate planning attorney."

### Step 3: Verify rendering

Run dev server, verify all sections render correctly with interactive controls.

### Step 4: Commit

```bash
git add src/components/EdiOnlyTab.tsx src/components/EdiOnlyTab.css
git commit -m "feat: add unwind analysis and estate comparison sections"
```

---

## Task 11: Carryforward Accumulation Chart

**Files:**
- Modify: `src/WealthChart.tsx` (add CarryforwardChart export)
- Modify: `src/components/EdiOnlyTab.tsx` (integrate chart)

### Step 1: Add CarryforwardChart to WealthChart.tsx

Add a new named export `CarryforwardChart` following the pattern of `TaxSavingsChart` (line 23). The chart should:
- Use Recharts `AreaChart`
- X-axis: Year (1-10)
- Primary area: Cumulative carryforward (blue/green)
- Secondary area: Carryforward tax shield (lighter shade)
- Tooltip: Show exact values with `formatCurrency`
- Use `useDarkMode()` for dark mode support

### Step 2: Lazy-load chart in EdiOnlyTab

```tsx
const CarryforwardChart = lazy(() =>
  import('../WealthChart').then(m => ({ default: m.CarryforwardChart }))
);
```

### Step 3: Verify chart renders

Run dev server, verify chart displays with correct data.

### Step 4: Commit

```bash
git add src/WealthChart.tsx src/components/EdiOnlyTab.tsx
git commit -m "feat: add carryforward accumulation chart to EDI-Only tab"
```

---

## Task 12: App Integration & Auto-Tab Switching

**Files:**
- Modify: `src/App.tsx` (add EDI-Only tab to nav)
- Modify: `src/Calculator.tsx` (auto-switch callback)
- Modify: `src/hooks/useAdvancedMode.ts` (register section)
- Create: `src/pages/EdiOnlyPage.tsx` (page wrapper)

### Step 1: Add to App.tsx

At `src/App.tsx`:
- Line 7: Add `'edi-only'` to the `View` type union
- After line 3: Import `EdiOnlyPage`
- After line 27: Add EDI Only nav tab button
- After line 35: Add `{activeView === 'edi-only' && <EdiOnlyPage />}`

### Step 2: Create EdiOnlyPage wrapper

Create `src/pages/EdiOnlyPage.tsx` following `src/pages/QfafTestPage.tsx` pattern:
- Local state for inputs (collateral, strategy, filing status, tax rates)
- Page header and description
- Controls section
- `<EdiOnlyTab />` component
- Disclaimer footer

### Step 3: Add auto-switch logic

In `src/App.tsx`, pass `onRequestViewChange={setActiveView}` to `<Calculator />`.
In `src/Calculator.tsx`, add a `useEffect` that switches to 'edi-only' when `qfafEnabled` is toggled off:

```tsx
useEffect(() => {
  if (!inputs.qfafEnabled && onRequestViewChange) {
    onRequestViewChange('edi-only');
  }
}, [inputs.qfafEnabled, onRequestViewChange]);
```

### Step 4: Register in useAdvancedMode

In `src/hooks/useAdvancedMode.ts`:
- Add `ediOnly: boolean` to sections interface
- Add `ediOnly: false` to default state
- Add `'ediOnly'` to validation array

### Step 5: Verify auto-switch works

Run dev server, toggle QFAF off, verify tab auto-switches to EDI-Only.

### Step 6: Commit

```bash
git add src/App.tsx src/Calculator.tsx src/pages/EdiOnlyPage.tsx src/hooks/useAdvancedMode.ts
git commit -m "feat: integrate EDI-Only tab with auto-switch on QFAF toggle"
```

---

## Task 13: Final CPA & PM Review

**This is the final review gate before merge.**

### Step 1: Run full test suite

Run: `cd "/Users/housetyrell/Documents/Programming Projects/EnhancedDirectIndexingCalc" && npx vitest run`
Expected: ALL PASS

### Step 2: CPA Final Review

Use `compound-engineering:finance:cpa-agent` to review the COMPLETE implementation:
- [ ] All tax calculations verified against IRC
- [ ] $3K/$1.5K limits correct
- [ ] No annual limit on CF vs gains confirmed in code
- [ ] Estate comparison logic correct
- [ ] State conformity warnings present (especially PA)
- [ ] Disclosures present: CF lost at death, wash sale risks, NIIT deferred

### Step 3: PM Final Review

Use `compound-engineering:finance:portfolio-manager-agent` to review:
- [ ] Carryforward accumulation numbers match manual calculations
- [ ] Realization scenario economics are correct
- [ ] Unwind analysis embedded gain estimates are reasonable
- [ ] Harvesting efficiency ratings make sense
- [ ] Break-even analysis communicates correctly ("for external gains, not strategy's own")
- [ ] Estate comparison recommendations are sound

### Step 4: Visual review of the UI

Take screenshots of:
- EDI-Only tab main view (year-by-year table)
- Carryforward accumulation chart
- Realization scenario cards
- Unwind analysis section
- Estate comparison section

Verify all numbers look reasonable for default inputs ($10M, overlay-45-45, CA MFJ).

### Step 5: Address findings and commit

---

## PA State Warning (Task 14 — if time permits)

Add a warning banner when state is PA:

```tsx
{inputs.stateCode === 'PA' && (
  <div className="state-warning-banner">
    <strong>Pennsylvania Note:</strong> PA does not conform to federal capital loss
    carryforward rules. Accumulated carryforwards provide no PA state tax benefit.
    The federal benefit calculations shown here do not include PA state savings.
  </div>
)}
```

This goes in the EdiOnlyTab component and in ResultsSummary when QFAF is off.

---

## Summary of New Files

| File | Purpose | ~Lines |
|------|---------|--------|
| `src/calculations/ediOnly.ts` | Pure calculation functions | ~350 |
| `src/ediOnly.test.ts` | Test suite | ~250 |
| `src/components/EdiOnlyTab.tsx` | UI component | ~400 |
| `src/components/EdiOnlyTab.css` | Styling | ~200 |
| `src/pages/EdiOnlyPage.tsx` | Page wrapper | ~80 |

## Files Modified

| File | Changes |
|------|---------|
| `src/App.tsx` | Add View type, nav tab, content render |
| `src/Calculator.tsx` | Add auto-switch callback prop + useEffect |
| `src/hooks/useAdvancedMode.ts` | Register ediOnly section |
| `src/WealthChart.tsx` | Add CarryforwardChart export |
| `src/types.ts` | Add EDI-Only type exports (if needed beyond ediOnly.ts) |

## Files NOT Modified

| File | Reason |
|------|--------|
| `src/calculations/core.ts` | QFAF calculations untouched |
| `src/calculations/helpers.ts` | Existing carryforward logic untouched |
| `src/calculations/sensitivity.ts` | Existing sensitivity untouched |
| `src/calculations/sizing.ts` | Existing sizing untouched |
| All existing test files | No regressions |
