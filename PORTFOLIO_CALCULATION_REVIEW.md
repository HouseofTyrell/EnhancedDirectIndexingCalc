# Portfolio Calculation Review Report

**Reviewer**: portfolio-reviewer
**Date**: 2026-02-09
**Focus**: Investment calculations, strategy rates, and portfolio management logic

---

## Executive Summary

The Enhanced Direct Indexing Calculator implements sophisticated tax-aware portfolio management calculations for direct indexing strategies paired with Quantified Alternative Funds (QFAF). The calculation engine demonstrates solid foundational accuracy with well-structured rate definitions and proper year-by-year decay modeling. However, several areas require attention to ensure calculation accuracy and risk-adjusted return assumptions align with industry standards.

**Overall Assessment**: Medium-High Quality with notable areas for improvement

---

## 1. Direct Indexing Strategy Rates

### Location
- `/src/strategyData.ts` (lines 20-159)

### Implementation Analysis

#### ✅ Strengths
1. **Clear Strategy Definitions**: 10 well-defined strategies (5 Core, 5 Overlay) with distinct risk/return profiles
2. **Year-by-Year ST Loss Rates**: Properly implements declining loss rates across 10 years
   - Core 130/30: 23% → 7% → 6% → 4% → 3% (stabilizes)
   - Core 200/100: 48.7% → 29.3% → 23% → 14.3% → 11% → 10% (stabilizes)
3. **Tracking Error Ranges**: Each strategy has both numeric and display tracking error
4. **Financing Cost Rates**: Properly scales with leverage (1.5% for 130/30, 4.5% for 225/125)

#### ⚠️ Issues Identified

##### MEDIUM: ST Loss Rate Decay Pattern
**File**: `/src/strategyData.ts` (lines 20-34)
**Issue**: Year-by-year ST loss rates show aggressive decay in early years, but the economic justification is unclear.

**Current Pattern** (Core 145/45):
- Year 1: 28.5% ST losses
- Year 2: 16.5% (42% decline)
- Year 3: 12.0% (27% decline)
- Year 4: 7.0% (42% decline)
- Years 5+: 5.5%-4.5% (stabilizes)

**Concern**: The Year 1 ST loss rate appears exceptionally high (28.5% for Core 145/45, 48.7% for Core 200/100). This assumes:
1. Immediate full implementation of tax-loss harvesting
2. Existing embedded gains in transitioned portfolio
3. No wash sale constraints in Year 1

**Recommendation**:
- **Priority**: Medium
- **Action**: Document the assumptions underlying Year 1 elevated rates
- Consider adding a UI disclosure: "Year 1 rates assume one-time transition losses from existing portfolio rebalancing"
- Validate with actual Quantinno Beta 1 performance data if available

##### MEDIUM: Tracking Error vs. ST Loss Rate Relationship
**File**: `/src/strategyData.ts` (lines 46-157)
**Issue**: The relationship between tracking error and ST loss generation may be understated for high-leverage strategies.

**Analysis**:
- Core 200/100: 48.7% Year 1 ST losses, 3.5-4.0% tracking error
- Core 130/30: 23% Year 1 ST losses, 1.3-1.5% tracking error

Higher tracking error typically means:
1. Greater deviation from benchmark → more rebalancing → more tax events ✅
2. BUT ALSO: Higher portfolio risk and potential for performance drag

**Current Issue**: The calculator does not model tracking error's impact on returns. In a bear market year, a 4% tracking error could mean:
- Benchmark: -10% return
- Portfolio: -6% to -14% return (4% band)

**Recommendation**:
- **Priority**: Medium
- **Action**: Add optional tracking error simulation in Sensitivity Analysis mode
- Document that base calculations assume tracking error is symmetric and mean-zero
- Consider adding risk-adjusted return metrics (Sharpe ratio, information ratio)

##### LOW: LT Gain Rate Consistency
**File**: `/src/strategyData.ts` (lines 45-157)
**Issue**: LT gain rates appear consistent but lack documentation on their source.

**Current Rates**:
- Core 130/30: 2.4% annual LT gains
- Core 200/100: 4.5% annual LT gains
- Overlay 30/30: 0.9% annual LT gains

**Question**: Are these based on:
1. Historical Quantinno strategy data?
2. Theoretical model of portfolio turnover?
3. Conservative industry assumptions?

**Recommendation**:
- **Priority**: Low
- **Action**: Add inline comments documenting LT gain rate sources
- Consider making LT gain rates editable in Advanced Settings for sensitivity testing

---

## 2. QFAF Sizing Methodology

### Location
- `/src/calculations/sizing.ts` (lines 19-76)
- `/src/components/Formulas/QfafSizingFormula.tsx`

### Implementation Analysis

#### ✅ Strengths
1. **Auto-Sizing Logic**: QFAF sized to match collateral ST losses
   ```typescript
   qfafValue = year1StLosses / QFAF_ST_GAIN_RATE
   // Result: QFAF ST gains = Collateral ST losses
   ```
2. **Flexible Sizing Window**: Supports 1-10 year averaging (lines 26-31)
3. **Sizing Cushion**: Allows 0-10% reduction for conservative sizing (line 44)

#### ⚠️ Issues Identified

##### HIGH: Average ST Loss Rate Calculation
**File**: `/src/calculations/sizing.ts` (lines 30-31)
**Issue**: Uses simple average of year-by-year rates, which may not reflect economic reality.

**Current Code**:
```typescript
const avgStLossRate = getAverageStLossRate(strategy, 1, sizingYears);
const year1StLosses = collateralValue * avgStLossRate;
```

**Problem**: For a $10M Core 145/45 with 10-year window:
- Avg ST loss rate: ~9.7% (average of 28.5%, 16.5%, 12%, 7%, 5.5%...)
- Year 1 actual losses: $2,850,000 (28.5% × $10M)
- QFAF sized for: $970,000 avg → QFAF value = $646,667
- Year 1 QFAF ST gains: $970,000
- **Mismatch**: $2,850K collateral losses vs $970K QFAF gains = $1,880K unmatched!

**Impact**: When using multi-year averaging, the calculator significantly under-sizes QFAF for Year 1, leaving substantial ST gains unmatched and taxed at ordinary rates.

**Recommendation**:
- **Priority**: HIGH
- **Action**: Change default sizing window to Year 1 only (`qfafSizingYears: 1`)
- Add prominent UI warning when multi-year averaging is used:
  > "⚠️ Multi-year averaging may under-size QFAF for Year 1. Consider Year 1-only sizing for maximum tax benefit."
- Consider renaming feature to "QFAF Rightsizing" with explanation that it optimizes for average across all years, not Year 1 peak

##### MEDIUM: Section 461(l) Limit Interaction
**File**: `/src/calculations/sizing.ts` (lines 54-56)
**Issue**: Sizing doesn't account for Section 461(l) limitations upfront.

**Current Flow**:
1. Size QFAF based on collateral losses
2. Generate ordinary losses = QFAF × 150%
3. Cap at 461(l) limit in yearly calculation

**Problem**: For high collateral amounts, QFAF may be sized larger than what can be used:
- $10M collateral → ~$2.85M QFAF (Year 1 sizing)
- $2.85M × 150% = $4.275M ordinary losses generated
- MFJ 461(l) limit: $512,000 usable
- $3.763M excess → NOL carryforward

**While correct**, this creates substantial NOL that may never be used (NOL can only offset 80% of income, expires in 20 years).

**Recommendation**:
- **Priority**: Medium
- **Action**: Add "Limit-Aware Sizing" option that caps QFAF at:
  ```
  Max QFAF = section461Limit / 1.5
  ```
  For MFJ: $512,000 / 1.5 = $341,333 max QFAF
- Show user both sizing approaches with tradeoffs:
  - **Match Collateral**: Full offset of ST losses, large NOL generation
  - **Limit-Aware**: Maximizes current-year deduction, partial ST offset

---

## 3. ST Loss Harvesting Calculations

### Location
- `/src/calculations/core.ts` (lines 118-124)
- `/src/calculations/helpers.ts` (lines 18-24)

### Implementation Analysis

#### ✅ Strengths
1. **Year-Specific Rates**: Uses `getStLossRateForYear()` for accurate yearly modeling
2. **Wash Sale Adjustment**: Configurable disallowance rate (default 0%, adjustable in Advanced Settings)
3. **Net Capital Loss Formula**: Properly calculates ST Loss Rate - LT Gain Rate

#### ⚠️ Issues Identified

##### MEDIUM: Wash Sale Disallowance Default
**File**: `/src/calculations/core.ts` (line 123)
**Issue**: Default wash sale disallowance is 0%, which is unrealistic for real-world implementations.

**Current Code**:
```typescript
const stLossesHarvested = grossStLosses * (1 - settings.washSaleDisallowanceRate);
// Default: washSaleDisallowanceRate = 0
```

**Reality**: Even with sophisticated TLH software:
- 5-10% wash sale disallowance is typical (user trades, portfolio flows)
- 15-20% is common for active investors
- 0% assumes perfect coordination and no external account activity

**Impact**: Overstates tax benefits by ~5-15% for typical investors.

**Recommendation**:
- **Priority**: Medium
- **Action**: Change default to 5% (`washSaleDisallowanceRate: 0.05`)
- Add UI disclosure: "Assumes 5% wash sale disallowance. Adjust in Advanced Settings if you actively trade or have multiple accounts."

##### LOW: Loss Rate Decay Documentation
**File**: `/src/strategyData.ts` (lines 186-189)
**Issue**: Legacy decay constants still present but marked as "NO LONGER USED"

**Code**:
```typescript
// Tax-Loss Harvesting Decay - NO LONGER USED (replaced by year-by-year rates)
export const LOSS_RATE_DECAY_FACTOR = 0.93; // 7% annual decay
export const LOSS_RATE_FLOOR = 0.3; // Minimum 30% of initial rate
```

**Recommendation**:
- **Priority**: Low
- **Action**: Remove unused constants or move to comments-only documentation
- Prevents future confusion about active vs. legacy calculation methods

---

## 4. LT Gain Realization Logic

### Location
- `/src/calculations/core.ts` (lines 124)
- `/src/strategyData.ts` (LT gain rates per strategy)

### Implementation Analysis

#### ✅ Strengths
1. **Consistent Annual Application**: LT gains applied uniformly each year
   ```typescript
   const ltGainsRealized = collateralValue * strategy.ltGainRate;
   ```
2. **Strategy-Specific Rates**: Each strategy has calibrated LT gain rate
3. **Proper Tax Treatment**: LT gains taxed at preferential rates + NIIT when applicable

#### ⚠️ Issues Identified

##### MEDIUM: Zero Documentation on LT Gain Sources
**File**: `/src/strategyData.ts` (lines 45-157)
**Issue**: No explanation of what generates LT gains in direct indexing strategy

**Questions**:
1. Are LT gains from:
   - Rebalancing long-held positions? (most likely)
   - Index reconstitution?
   - Drift-based trading?
2. Why do higher-leverage strategies generate more LT gains?
   - Core 130/30: 2.4% LT gains
   - Core 200/100: 4.5% LT gains
   - Implication: 200/100 has nearly 2x the LT gain "leakage"

3. Are these "forced" gains (must realize to maintain strategy) or "opportunistic" (can defer)?

**Recommendation**:
- **Priority**: Medium
- **Action**: Add inline documentation explaining LT gain generation mechanism
- If gains are forced (strategy requirement), document why
- If gains are opportunistic, consider making them optional/adjustable for tax-sensitive clients

##### LOW: LT Gain Carryforward Interaction
**File**: `/src/calculations/helpers.ts` (lines 59-64)
**Issue**: LT carryforwards properly offset LT gains, but this is rarely utilized in direct indexing scenarios.

**Current Logic**:
```typescript
if (taxableLt > 0 && ltCarryforward > 0) {
  const offset = Math.min(ltCarryforward, taxableLt);
  taxableLt -= offset;
  ltCarryforward -= offset;
}
```

**Reality**: Direct indexing strategies generate ST losses (desired) and LT gains (cost). Rare to have LT carryforwards unless:
1. Prior year had massive LT losses (unlikely with index tracking)
2. User brought in LT losses from outside portfolio (edge case)

**Recommendation**:
- **Priority**: Low
- **Action**: Current implementation is correct; no changes needed
- Consider adding UI note: "LT loss carryforwards are rare with direct indexing. Most clients have ST losses."

---

## 5. Portfolio Sizing Methodology

### Location
- `/src/calculations/sizing.ts`
- `/src/calculations/core.ts` (portfolio growth logic, lines 222-231)

### Implementation Analysis

#### ✅ Strengths
1. **Conservative Default**: Growth disabled by default (`growthEnabled: false`)
2. **Financing Fees**: Properly models custodian margin + wealth management fees when enabled
3. **Component Breakdown**: Separates QFAF vs. collateral growth

#### ⚠️ Issues Identified

##### HIGH: Financing Cost Assumptions
**File**: `/src/strategyData.ts` (lines 48-157)
**Issue**: Financing cost rates may be outdated given 2026 interest rate environment.

**Current Rates**:
- Core 130/30: 1.5% financing cost
- Core 145/45: 2.3% financing cost
- Core 200/100: 4.0% financing cost
- Overlay 30/30: 1.0% financing cost

**Context**: These rates were calibrated in a low-rate environment. As of 2026:
- Federal Funds Rate: ~4.5-5.0% (assumed, verify current)
- Prime Rate: ~7.5-8.0%
- Portfolio financing: Typically Prime - 1% to Prime + 1%
- Expected cost: 6.5-9.0% for leveraged positions

**Impact**: Current financing costs may understate true cost by 2-5%, significantly overstating net returns and tax alpha for leveraged strategies.

**Recommendation**:
- **Priority**: HIGH
- **Action**: Update financing costs to reflect 2026 rate environment:
  - Core 130/30: 1.5% → 2.5-3.0%
  - Core 145/45: 2.3% → 3.5-4.0%
  - Core 200/100: 4.0% → 6.0-7.0%
- Add note: "Financing costs assume [X]% short-term rates. Adjust in Advanced Settings if your custodian offers different terms."
- Consider making financing costs a top-level input (currently buried in Advanced Settings)

##### MEDIUM: QFAF Growth Rate Assumption
**File**: `/src/calculations/core.ts` (lines 228-230)
**Issue**: QFAF assumed to grow at same rate as market when growth enabled.

**Current Code**:
```typescript
const qfafGrowthRate = settings.qfafGrowthEnabled ? growthRate : 0;
const newQfafValue = qfafValue * (1 + qfafGrowthRate);
```

**Question**: QFAF is a hedge fund structure with:
1. 150% ordinary loss generation (fees, expenses, shorting costs)
2. 150% ST gain generation (presumably from trading)
3. Complex derivatives and leverage

**Is it realistic that QFAF grows at 7% annually like an index?** More likely:
- Gross returns: 10-15% (to generate 150% gains on notional)
- Net returns: 0-5% (after fees, expenses, financing)

**Recommendation**:
- **Priority**: Medium
- **Action**: Add separate QFAF return assumption (default 0-2% vs. 7% for collateral)
- Document: "QFAF returns are uncertain. Conservative projection assumes returns offset fees."
- Allow user to input expected QFAF performance in Advanced Settings

##### LOW: Portfolio Growth Disabled by Default
**File**: `/src/types.ts` (line 201)
**Issue**: Default assumption of 0% growth is overly conservative for 10-year projections.

**Current Default**:
```typescript
growthEnabled: false, // No growth assumption
defaultAnnualReturn: 0.07, // 7% when enabled
```

**Reality**: A 10-year direct indexing engagement likely assumes:
1. Market returns (~7-10% historical average)
2. Client is comparing to "do nothing" scenario which would grow
3. Tax alpha should be calculated as incremental benefit above growth

**Recommendation**:
- **Priority**: Low
- **Action**: Consider changing default to `growthEnabled: true` with 7% return
- Update UI to clarify: "Tax alpha shown includes portfolio growth. Disable growth to see tax savings in isolation."

---

## 6. Risk-Adjusted Return Assumptions

### Location
- `/src/strategyData.ts` (tracking error definitions)
- `/src/calculations/core.ts` (return calculations)

### Implementation Analysis

#### ⚠️ Issues Identified

##### HIGH: Missing Risk-Adjusted Return Metrics
**Files**: Across calculation engine
**Issue**: Calculator does not compute risk-adjusted returns (Sharpe ratio, Sortino ratio, Information ratio)

**Current Metrics**:
- Total tax savings ✅
- Tax alpha (%) ✅
- Final portfolio value ✅
- Tracking error (display only, not used in calculations) ❌

**Missing**:
1. **Sharpe Ratio**: (Return - Risk-Free Rate) / Standard Deviation
2. **Information Ratio**: Excess Return / Tracking Error
3. **Maximum Drawdown**: Worst peak-to-trough decline
4. **Probability of Underperformance**: Monte Carlo simulation

**Why This Matters**:
- Core 200/100 generates 4.5% tax alpha but has 3.5-4.0% tracking error
- In a bad year, tracking error could wipe out tax alpha gains
- High-net-worth investors need risk-adjusted metrics to compare strategies

**Recommendation**:
- **Priority**: HIGH
- **Action**: Add risk-adjusted metrics to summary panel:
  ```typescript
  interface CalculationSummary {
    totalTaxSavings: number;
    finalPortfolioValue: number;
    effectiveTaxAlpha: number;
    totalNolGenerated: number;
    // NEW:
    sharpeRatio: number; // Tax alpha / tracking error
    probabilityOfUnderperformance: number; // Monte Carlo
    maxDrawdownRisk: number; // Tracking error × 3 (3-sigma event)
  }
  ```
- Add Monte Carlo mode: run 1,000 simulations with randomized returns within tracking error bounds

##### MEDIUM: No Downside Risk Modeling
**Files**: Across calculation engine
**Issue**: All projections assume strategies perform as expected. No stress testing.

**Current Approach**: Deterministic projections with fixed rates

**Missing Scenarios**:
1. **Bear Market**: What if market drops 20-30%?
   - Do ST loss rates increase (more harvesting opportunities)?
   - Do LT gains decrease (less need to rebalance)?
2. **Low Volatility**: What if VIX < 15 for multiple years?
   - ST loss rates may fall below projections
   - Tax alpha significantly reduced
3. **Wash Sale Violation**: What if 20% of losses disallowed?
   - Current model allows adjustment, but no scenario analysis

**Recommendation**:
- **Priority**: Medium
- **Action**: Add "Stress Test" tab with pre-built scenarios:
  - Best Case: High vol, max TLH, no wash sales
  - Base Case: Current assumptions
  - Worst Case: Low vol, 15% wash sales, 25% ST loss reduction
- Show tax alpha range across scenarios

---

## 7. Additional Findings

### Positive Observations

1. **Robust Carryforward Logic**: Capital loss carryforward and NOL calculations are thorough and accurate (`/src/calculations/helpers.ts`, lines 30-131)

2. **Section 461(l) Compliance**: Proper implementation of 2026 limits ($512K MFJ, $256K others) with excess properly tracked to NOL

3. **Custom Rate Overrides**: System supports user-defined rates per strategy per year (`/src/utils/strategyRates.ts`)

4. **Test Coverage**: Calculation tests demonstrate understanding of edge cases (MFS $1,500 limit, low-income 461(l) behavior)

### Technical Debt

1. **Magic Numbers**: Several hardcoded constants could be made configurable:
   - QFAF 150% generation rate (currently hardcoded as `QFAF_ST_GAIN_RATE = 1.5`)
   - NOL offset percentage (80%) - now configurable but could be more prominent

2. **Calculation Complexity**: The `calculateYear()` function is 180+ lines and handles multiple concerns (tax calcs, portfolio growth, carryforwards). Consider refactoring into smaller, testable units.

3. **Type Safety**: Some calculations use `number` types where more specific types would help (e.g., `Percentage` type for rates, `Currency` for dollar amounts)

---

## 8. Summary of Findings by Severity

### CRITICAL (0 issues)
None identified. Core calculation logic is sound.

### HIGH Priority (3 issues)

1. **Average ST Loss Rate Calculation** (sizing.ts:30-31)
   - Under-sizes QFAF when multi-year averaging used
   - Recommendation: Default to Year 1 only sizing, add UI warning

2. **Financing Cost Assumptions** (strategyData.ts:48-157)
   - Rates may be outdated for 2026 interest rate environment
   - Recommendation: Update to reflect 6-8% short-term rates

3. **Missing Risk-Adjusted Return Metrics** (calculation engine)
   - No Sharpe ratio, Information ratio, or downside risk measures
   - Recommendation: Add risk-adjusted metrics and Monte Carlo mode

### MEDIUM Priority (6 issues)

1. ST Loss Rate Decay Pattern documentation
2. Tracking Error vs. ST Loss Rate relationship
3. Section 461(l) Limit Interaction in sizing
4. Wash Sale Disallowance default (should be 5%, not 0%)
5. LT Gain Sources documentation
6. QFAF Growth Rate assumptions

### LOW Priority (4 issues)

1. LT Gain Rate source documentation
2. Legacy decay constants cleanup
3. Portfolio Growth disabled by default
4. LT Gain Carryforward edge case (already correct)

---

## 9. Recommended Action Plan

### Immediate (This Sprint)

1. ✅ Update financing costs to 2026 rates (HIGH)
2. ✅ Change QFAF sizing default to Year 1 only (HIGH)
3. ✅ Add multi-year averaging warning in UI (HIGH)
4. ✅ Change wash sale default to 5% (MEDIUM)

### Short-Term (Next Sprint)

5. ✅ Add risk-adjusted return metrics (Sharpe ratio, Information ratio) (HIGH)
6. ✅ Document ST loss rate decay assumptions (MEDIUM)
7. ✅ Document LT gain generation sources (MEDIUM)
8. ✅ Add Section 461(l)-aware sizing option (MEDIUM)

### Long-Term (Next Quarter)

9. ✅ Implement Monte Carlo simulation mode (HIGH)
10. ✅ Add stress test scenarios (MEDIUM)
11. ✅ Refactor calculateYear() for better testability (TECH DEBT)
12. ✅ Add QFAF-specific return assumptions (MEDIUM)

---

## 10. Validation Recommendations

To ensure calculation accuracy:

1. **Benchmark Against Actuals**: If Quantinno Beta 1 has 1+ year of live data, compare projected vs. actual:
   - ST loss rates (especially Year 1)
   - LT gain rates
   - Tracking error realized

2. **Third-Party Review**: Have CPA or tax attorney review:
   - Section 461(l) implementation
   - NOL carryforward logic
   - Capital loss netting rules

3. **Edge Case Testing**: Add tests for:
   - Very high income (>$10M) where AMT might apply
   - Very low income (<$100K) where 461(l) limit is binding
   - MFS filers with $1,500 capital loss limit

4. **Documentation**: Create user-facing documentation explaining:
   - What assumptions are baked in
   - What users can customize
   - Limitations and disclaimers

---

## Conclusion

The portfolio calculation engine demonstrates strong foundational work with proper year-by-year rate modeling, accurate tax rule implementation, and flexible configuration options. The three HIGH priority issues—QFAF sizing defaults, financing costs, and missing risk metrics—should be addressed to ensure the calculator provides reliable guidance for high-net-worth investors making significant capital allocation decisions.

The calculator is suitable for use with appropriate disclaimers, but improvements to risk modeling and assumption transparency would significantly enhance its value for sophisticated advisors and their clients.

---

**Files Reviewed**:
- `/src/strategyData.ts` (215 lines)
- `/src/calculations/sizing.ts` (77 lines)
- `/src/calculations/core.ts` (282 lines)
- `/src/calculations/helpers.ts` (146 lines)
- `/src/utils/strategyRates.ts` (94 lines)
- `/src/types.ts` (297 lines)
- `/src/calculations.test.ts` (478 lines, sample)
- `/src/qfafTestCalculations.ts` (149 lines)

**Total Lines Analyzed**: ~1,738 lines of calculation logic
