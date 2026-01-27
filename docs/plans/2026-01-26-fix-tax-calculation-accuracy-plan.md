# Fix Tax Calculation Accuracy & IRS Compliance

---
title: "Fix Tax Calculation Accuracy & IRS Compliance"
type: fix
date: 2026-01-26
priority: critical
---

## Overview

This plan addresses critical tax-law misapplications, calculation errors, and missing modeling components identified in technical review. The goal is to transform the calculator from an illustrative marketing tool into a tax-defensible estimator suitable for advisor use.

**Scope:** 4 phases, ~15 files modified, significant calculation logic rewrite

## Problem Statement

The current calculator overstates tax benefits and certainty due to:

1. **§461(l) misapplication** - Treats limit as flat cap without income context
2. **NOL usage errors** - Double-counts benefits, ignores ordering rules
3. **Capital gain/loss netting** - Incomplete IRS waterfall implementation
4. **Missing carryforwards** - ST/LT loss carryforwards not properly tracked
5. **No income modeling** - Cannot correctly apply §461(l) or NOL rules without taxable income

## Technical Findings

### Current Implementation Gaps

| Issue | Location | Current Behavior | Required Behavior |
|-------|----------|------------------|-------------------|
| §461(l) | `calculations.ts:174-176` | Simple `Math.min(losses, limit)` | Must consider taxable income first |
| NOL 80% | `calculations.ts:315-320` | Applied correctly but timing wrong | Must apply after all other deductions |
| Capital netting | `calculations.ts:244-303` | 6-step waterfall for carryforwards only | Must include current-year losses |
| ST carryforward | N/A | Auto-sizing prevents excess ST losses | Must track when sizing fails |
| Income modeling | `calculations.ts:317` | Static `annualIncome` only | Need full taxable income computation |

---

## Proposed Solution

### Phase 1: Taxable Income Modeling (Foundation)

**Rationale:** Every subsequent fix depends on knowing taxable income.

#### 1.1 Add Income Model Interface

**File:** `src/types.ts`

```typescript
export interface IncomeModel {
  // W-2 / Ordinary Income
  w2Income: number;
  otherOrdinaryIncome: number;  // Interest, dividends, business

  // Above-the-line deductions
  retirementContributions: number;
  hsaContributions: number;

  // Itemized vs Standard
  useStandardDeduction: boolean;
  itemizedDeductions: number;

  // Computed
  agi: number;
  taxableIncomeBeforeStrategy: number;
}

export const DEFAULT_INCOME_MODEL: IncomeModel = {
  w2Income: 500000,
  otherOrdinaryIncome: 0,
  retirementContributions: 23000,  // 401k max 2026
  hsaContributions: 4300,          // Family max 2026
  useStandardDeduction: false,
  itemizedDeductions: 40000,
  agi: 0,                          // Computed
  taxableIncomeBeforeStrategy: 0,  // Computed
};
```

#### 1.2 Add Income Calculator

**File:** `src/calculations.ts` (new function)

```typescript
export function calculateTaxableIncome(
  income: IncomeModel,
  filingStatus: FilingStatus
): { agi: number; taxableIncome: number } {
  // AGI = Gross income - above-the-line deductions
  const grossIncome = income.w2Income + income.otherOrdinaryIncome;
  const agi = grossIncome - income.retirementContributions - income.hsaContributions;

  // Standard deduction by filing status (2026 projected)
  const standardDeductions: Record<FilingStatus, number> = {
    single: 15700,
    mfj: 31400,
    mfs: 15700,
    hoh: 23500,
  };

  const deduction = income.useStandardDeduction
    ? standardDeductions[filingStatus]
    : income.itemizedDeductions;

  const taxableIncome = Math.max(0, agi - deduction);

  return { agi, taxableIncome };
}
```

#### 1.3 Update Calculator Inputs

**File:** `src/types.ts` - Modify `CalculatorInputs`

```typescript
export interface CalculatorInputs {
  // ... existing fields ...

  // Replace simple annualIncome with full model
  incomeModel: IncomeModel;

  // Keep annualIncome as computed shorthand
  annualIncome: number;  // = taxableIncomeBeforeStrategy
}
```

#### 1.4 Add Income Input Section to UI

**File:** `src/Calculator.tsx` - New collapsible section

Add income modeling inputs between "Client Profile" and "Strategy Selection" sections.

---

### Phase 2: Fix §461(l) Logic

**Rationale:** Current implementation applies limit without considering income.

#### 2.1 Correct §461(l) Application

**File:** `src/calculations.ts` - Modify `calculateYear()`

**Current (wrong):**
```typescript
const usableOrdinaryLoss = Math.min(ordinaryLossesGenerated, taxRates.section461Limit);
```

**Fixed:**
```typescript
// §461(l) limits deduction of business losses against NON-business income
// First, determine how much non-business income exists
const nonBusinessIncome = taxableIncomeBeforeStrategy;  // W-2, interest, etc.

// Ordinary losses can offset:
// 1. All business income (if any) - not limited
// 2. Non-business income up to §461(l) limit
const usableAgainstNonBusiness = Math.min(
  ordinaryLossesGenerated,
  nonBusinessIncome,
  taxRates.section461Limit
);

// Excess becomes NOL carryforward
const excessToNol = ordinaryLossesGenerated - usableAgainstNonBusiness;
```

#### 2.2 Update YearResult Interface

**File:** `src/types.ts`

```typescript
export interface YearResult {
  // ... existing fields ...

  // Add clarity on ordinary loss usage
  ordinaryLossAgainstIncome: number;  // Actually used this year
  ordinaryLossDisallowed461l: number; // Exceeded limit → NOL
}
```

---

### Phase 3: Fix Capital Gain/Loss Netting

**Rationale:** IRS requires specific ordering that current code doesn't fully implement.

#### 3.1 Implement Full IRC Netting Rules

**File:** `src/calculations.ts` - Replace `calculateTaxes()` netting logic

```typescript
interface CapitalGainLossNetting {
  // Inputs
  currentYearStGains: number;
  currentYearStLosses: number;
  currentYearLtGains: number;
  currentYearLtLosses: number;  // NEW - currently not modeled
  priorStCarryforward: number;
  priorLtCarryforward: number;

  // Outputs
  netStGain: number;        // Taxable at ordinary rates
  netLtGain: number;        // Taxable at LT rates
  newStCarryforward: number;
  newLtCarryforward: number;
  capitalLossVsIncome: number;  // $3,000 limit
}

function netCapitalGainsLosses(input: CapitalGainLossNetting): CapitalGainLossNetting {
  // Step 1: Net ST gains against ST losses (current year + carryforward)
  let stPool = input.currentYearStGains - input.currentYearStLosses - input.priorStCarryforward;

  // Step 2: Net LT gains against LT losses (current year + carryforward)
  let ltPool = input.currentYearLtGains - input.currentYearLtLosses - input.priorLtCarryforward;

  // Step 3: Cross-netting
  if (stPool > 0 && ltPool < 0) {
    // Excess LT loss offsets ST gain
    const offset = Math.min(stPool, Math.abs(ltPool));
    stPool -= offset;
    ltPool += offset;
  } else if (stPool < 0 && ltPool > 0) {
    // Excess ST loss offsets LT gain
    const offset = Math.min(Math.abs(stPool), ltPool);
    stPool += offset;
    ltPool -= offset;
  }

  // Step 4: Determine carryforwards and $3,000 deduction
  let newStCarryforward = 0;
  let newLtCarryforward = 0;
  let capitalLossVsIncome = 0;

  if (stPool < 0 || ltPool < 0) {
    const totalNetLoss = Math.abs(Math.min(0, stPool)) + Math.abs(Math.min(0, ltPool));
    capitalLossVsIncome = Math.min(totalNetLoss, 3000);  // Use filing status limit

    // Remaining loss carries forward
    const remainingLoss = totalNetLoss - capitalLossVsIncome;

    // Allocate to ST first, then LT (simplified)
    if (stPool < 0) {
      newStCarryforward = Math.min(Math.abs(stPool), remainingLoss);
    }
    newLtCarryforward = remainingLoss - newStCarryforward;
  }

  return {
    ...input,
    netStGain: Math.max(0, stPool),
    netLtGain: Math.max(0, ltPool),
    newStCarryforward,
    newLtCarryforward,
    capitalLossVsIncome,
  };
}
```

#### 3.2 Add LT Loss Modeling to Collateral

**File:** `src/strategyData.ts`

Current collateral strategies only have `ltGainRate`. In reality, rebalancing can sometimes realize LT losses.

```typescript
export interface Strategy {
  // ... existing fields ...
  ltLossRate: number;  // Occasional LT losses from rebalancing (typically 0-2%)
}
```

---

### Phase 4: Fix NOL Usage & Timing

**Rationale:** NOL usage is interacting incorrectly with other deductions.

#### 4.1 Correct NOL Application Order

**File:** `src/calculations.ts`

NOLs should be applied AFTER:
1. Capital gain/loss netting
2. Ordinary loss deduction (§461(l) limited)
3. $3,000 capital loss deduction

**Fixed order:**
```typescript
function calculateTaxes(...) {
  // 1. Start with taxable income before strategy
  let taxableIncome = taxableIncomeBeforeStrategy;

  // 2. Add net capital gains (after full netting)
  taxableIncome += netStGain + netLtGain;

  // 3. Subtract ordinary loss (§461(l) limited)
  taxableIncome -= usableOrdinaryLoss;

  // 4. Subtract capital loss vs income ($3,000)
  taxableIncome -= capitalLossVsIncome;

  // 5. NOW apply NOL (80% limit)
  const maxNolUsage = taxableIncome * 0.80;
  const nolUsed = Math.min(nolCarryforward, maxNolUsage);
  taxableIncome -= nolUsed;

  // 6. Calculate tax on remaining taxable income
  // ...
}
```

#### 4.2 Prevent Double-Counting

Current code claims ST→LT conversion benefit AND ordinary loss benefit simultaneously.

**Fix:** The ST→LT benefit only exists when ST gains are offset by ST losses. If ST losses exceed ST gains, there's no "conversion" - just a net loss.

```typescript
// Only claim ST→LT benefit when there's actual conversion
const stLtConversionBenefit =
  (currentYearStGains > 0 && currentYearStLosses > 0)
    ? Math.min(currentYearStGains, currentYearStLosses) * (stRate - ltRate)
    : 0;
```

---

## Acceptance Criteria

### Functional Requirements

- [ ] Taxable income is explicitly modeled with W-2, deductions, AGI
- [ ] §461(l) limit is applied against taxable income, not raw losses
- [ ] Capital netting follows IRC order: ST-ST, LT-LT, cross-net, $3,000
- [ ] NOL usage is applied after all other deductions
- [ ] No double-counting of tax benefits
- [ ] Carryforwards (ST, LT, NOL) are tracked and displayed accurately

### Non-Functional Requirements

- [ ] All existing tests pass after refactor
- [ ] New unit tests cover each netting scenario
- [ ] Performance: calculations complete in <100ms
- [ ] Backward compatibility: existing saved scenarios can be loaded

### Quality Gates

- [ ] Code review by tax-aware engineer
- [ ] Manual verification against hand-calculated scenarios
- [ ] Comparison with prior version shows expected reduction in projected benefits

---

## Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Tax savings accuracy | Unknown (overstated) | Within 10% of hand calculation |
| Carryforward accuracy | Missing | 100% visible |
| IRS netting compliance | Partial | Full IRC compliance |
| Advisor confidence | "Marketing tool" | "Defensible estimate" |

---

## Risk Analysis & Mitigation

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Calculation changes break UI | High | Medium | Phase 1 adds fields before changing logic |
| Users confused by new inputs | Medium | High | Add sensible defaults, progressive disclosure |
| Lower projected benefits disappoint users | Medium | High | Frame as "more accurate", add disclaimers |
| Edge cases in netting logic | High | Medium | Extensive test cases, manual verification |

---

## Implementation Order

| Order | Phase | Items | Effort |
|-------|-------|-------|--------|
| 1 | Phase 1 | Income modeling (foundation) | Medium |
| 2 | Phase 2 | §461(l) fix | Small |
| 3 | Phase 3 | Capital netting fix | Large |
| 4 | Phase 4 | NOL timing fix | Medium |
| 5 | - | UI updates, disclaimers | Small |
| 6 | - | Testing & validation | Medium |

---

## Files Summary

### Modified Files

| File | Phase | Changes |
|------|-------|---------|
| `src/types.ts` | 1,2,3 | Add IncomeModel, update YearResult |
| `src/calculations.ts` | 1,2,3,4 | Major refactor of tax logic |
| `src/strategyData.ts` | 3 | Add ltLossRate to Strategy |
| `src/Calculator.tsx` | 1 | Add income input section |
| `src/ResultsTable.tsx` | 3 | Show carryforwards properly |
| `src/popupContent.ts` | All | Update formulas in help text |

### New Files

| File | Purpose |
|------|---------|
| `src/utils/taxNetting.ts` | IRC-compliant capital netting logic |
| `src/utils/incomeModel.ts` | Taxable income calculation |
| `src/__tests__/taxNetting.test.ts` | Unit tests for netting |

---

## Verification Plan

### Test Scenarios

1. **High income, large QFAF** - §461(l) limit binding
2. **Low income, small QFAF** - Full loss usable
3. **Existing carryforwards** - Correct netting order
4. **NOL accumulation** - Multi-year usage
5. **MFS filing status** - $1,500 capital loss limit

### Manual Verification

Create 3-year hand-calculated scenario:
- Year 1: $500K income, $100K QFAF, generate NOL
- Year 2: $300K income, use partial NOL
- Year 3: $600K income, use remaining NOL

Compare calculator output to hand calculation.

---

## References

### IRS Publications

- IRC §461(l) - Excess Business Loss Limitation
- IRC §1211 - Capital Loss Limitation
- IRC §1212 - Capital Loss Carryforward
- IRC §172 - Net Operating Loss Deduction
- Pub 544 - Sales and Other Dispositions of Assets

### Internal References

- Current implementation: `src/calculations.ts:208-358`
- Strategy data: `src/strategyData.ts:14-28`
- Types: `src/types.ts:48-95`
