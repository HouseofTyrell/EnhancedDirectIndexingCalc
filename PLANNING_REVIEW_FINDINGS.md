# Financial Planning Logic and Assumptions Review

**Reviewer:** planning-reviewer (AI Agent)
**Date:** 2026-02-09
**Scope:** QFAF sizing methodology, multi-year projection assumptions, wealth accumulation modeling, income offset strategies, qualified purchaser requirements, and cost assumptions

---

## Executive Summary

The Enhanced Direct Indexing Calculator implements a sophisticated financial planning system for high-net-worth tax optimization strategies. After comprehensive review of the codebase, I found the planning logic to be **methodologically sound** with **reasonable assumptions** for its target audience. However, several areas warrant attention for improved accuracy, transparency, and client planning effectiveness.

### Overall Assessment
- **Strengths:** Advanced QFAF sizing methodology, comprehensive tax rule implementation, flexible multi-year planning
- **Concerns:** Fee assumptions disconnected from strategy-specific reality, limited sensitivity around QFAF performance assumptions, qualified purchaser verification could be strengthened
- **Recommendation:** Address Medium-severity findings before client deployment; consider High-severity items for production readiness

---

## Detailed Findings

### 1. QFAF Sizing Methodology

#### 1.1 Auto-Sizing Algorithm (MEDIUM)

**Location:** `/src/calculations/sizing.ts:19-76`

**Finding:**
The QFAF auto-sizing algorithm uses a configurable window approach (default: 10-year average) to match collateral short-term losses. The core formula is sound:

```typescript
QFAF = (Collateral × Avg_ST_Loss_Rate) / QFAF_ST_GAIN_RATE
```

**Strengths:**
- Configurable sizing window (1-10 years) provides flexibility for different planning horizons
- Sizing cushion feature (0-10% reduction) allows conservative positioning
- Properly handles strategy-specific loss rate decay over time
- Correctly applies Section 461(l) limits by filing status

**Concerns:**
1. **Default 10-year window assumption:** While more sophisticated than year-1-only sizing, this assumes stable collateral allocation over a decade. Many HNW clients rebalance within 3-5 years.
   - **Impact:** May oversize QFAF for clients with shorter time horizons
   - **Recommendation:** Consider 5-year default with clear guidance on appropriate window selection

2. **No validation for extreme sizing ratios:** The calculator doesn't warn when QFAF/Collateral ratio exceeds reasonable bounds (e.g., >50% for overlay strategies).
   - **Current behavior:** Overlay 125/125 can produce 30%+ QFAF ratios
   - **Recommendation:** Add visual warning when ratio exceeds strategy-typical ranges

**Severity:** Medium
**Status:** Acceptable for current use; recommend enhancements

---

#### 1.2 QFAF Generation Rate Assumptions (HIGH)

**Location:** `/src/strategyData.ts:162-163`, `/src/AdvancedMode/QfafTestByYear.tsx:16-18`

**Finding:**
The calculator uses fixed 150% rates for both ST gains and ordinary losses:

```typescript
QFAF_ST_GAIN_RATE = 1.5;          // 150% of MV per year
QFAF_ORDINARY_LOSS_RATE = 1.5;    // 150% of MV per year
```

However, the QFAF Test page references **actual historical performance data** showing significant variance:

```typescript
// Historical ordinary loss rates (2020-2024):
// Min: 131.31%, Max: 157.88%, Avg: 142.67%
```

**Concerns:**
1. **Overstated certainty:** The fixed 150% assumption doesn't reflect the 131-158% historical range
2. **No stress testing:** Clients see projections based on mean performance without downside scenarios
3. **Planning risk:** If actual generation is 135% instead of 150%, QFAF undersizes by ~10%, leaving unmatched ST gains

**Recommendations:**
1. **Add generation rate sensitivity:** Show 135%/150%/158% scenarios in Advanced Mode
2. **Document assumption prominently:** Clarify that 150% is historical average, not guaranteed
3. **Consider conservative default:** Use 140% for sizing but show 150% upside in scenarios

**Severity:** High
**Rationale:** Materially impacts client expectations and sizing accuracy

---

### 2. Multi-Year Projection Assumptions

#### 2.1 Portfolio Growth and Return Assumptions (LOW)

**Location:** `/src/types.ts:200-206`, `/src/calculations/core.ts:223-231`

**Finding:**
Portfolio growth modeling is properly implemented with:
- Default 0% growth (conservative baseline)
- Optional 7% annual return setting
- Proper application of growth to both QFAF and collateral
- Financing cost deductions (custodian margin + wealth management fees)

**Strengths:**
- Conservative default (0% growth) avoids overstating future values
- Financing costs properly reduce net returns
- Clear UI toggles for growth assumptions

**Minor Observation:**
The default 7% return assumption is reasonable for equity markets but:
- No inflation adjustment documentation (returns are nominal, not real)
- Could benefit from explicit "real return" vs "nominal return" labeling

**Severity:** Low
**Status:** Acceptable as-is; consider documentation enhancement

---

#### 2.2 Strategy-Specific ST Loss Rate Decay (MEDIUM)

**Location:** `/src/strategyData.ts:20-34`, `/src/utils/strategyRates.ts`

**Finding:**
The calculator implements **year-by-year ST loss rate schedules** based on Beta 0 estimates:

```typescript
// Example: Overlay 45/45
stLossRatesByYear: [16.5%, 10.5%, 9.0%, 6.0%, 4.5%, 4.5%, 4.5%, 4.5%, 4.5%, 4.5%]
```

This approach is **significantly more accurate** than the legacy 7% annual decay formula and properly reflects:
- Higher year-1 harvesting opportunities (fresh positions)
- Rapid decline in years 2-4 (diminishing high-basis lots)
- Steady-state harvesting rates from year 5+ onward

**Strengths:**
- Strategy-specific decay profiles (Core vs Overlay)
- Empirically derived from backtest data
- Floor rates prevent unrealistic decay to zero

**Concern:**
The year-by-year rates are **hardcoded** without documenting their source or update frequency:
- When were these rates last calibrated?
- What market conditions were assumed?
- How should advisors explain these curves to clients?

**Recommendations:**
1. Add metadata documenting rate source and date (e.g., "Quantinno Beta 0, Q4 2025")
2. Provide export showing the full decay curve for client education
3. Consider sensitivity analysis showing +/- 20% variance on decay rates

**Severity:** Medium
**Status:** Methodology sound; documentation needed

---

### 3. Wealth Accumulation Modeling

#### 3.1 Income Offset Capacity Tracking (LOW)

**Location:** `/src/calculations/core.ts:234-251`

**Finding:**
The calculator tracks **maximum income offset capacity** for option exercise planning:

```typescript
const maxIncomeOffsetCapacity = safeNumber(
  usableOrdinaryLoss + newNolCarryforward + maxCapitalLossOffset
);
```

This is an **excellent planning feature** that helps clients identify years with high offset capacity for timing:
- Stock option exercises
- Roth conversions
- Bonus acceleration

**Strengths:**
- Forward-looking capacity calculation
- Includes all offset sources (ordinary loss + NOL + capital loss)
- Properly respects statutory limits

**Enhancement Opportunity:**
Currently only exposed in year-by-year table. Consider:
- Dedicated "Option Exercise Planning" view
- Visual timeline showing capacity peaks
- Alert when capacity exceeds income (unused opportunity)

**Severity:** Low (enhancement opportunity)
**Status:** Current implementation excellent

---

#### 3.2 NOL Carryforward Modeling (LOW)

**Location:** `/src/calculations/helpers.ts:116-124`, `/src/calculations/core.ts:160-161`

**Finding:**
NOL generation and usage follows correct tax rules:

```typescript
// Generation: Excess ordinary losses above 461(l) limit
const excessToNol = ordinaryLossesGenerated - usableOrdinaryLoss;

// Usage: Limited to 80% of taxable income (IRC §172)
const maxNolUsage = Math.max(0, taxableIncomeBeforeNol) * nolOffsetLimit;
const nolUsed = Math.min(nolCarryforward, maxNolUsage);
```

**Strengths:**
- Indefinite carryforward (post-TCJA rules)
- 80% taxable income limitation properly applied
- Configurable limit in Advanced Settings for scenario analysis

**Documentation Strength:**
Popup content clearly explains NOL mechanics and limitations to clients.

**Severity:** Low
**Status:** Correctly implemented

---

### 4. Income Offset Strategies

#### 4.1 Section 461(l) Limit Implementation (LOW)

**Location:** `/src/strategyData.ts:165-172`, `/src/calculations/core.ts:139-144`

**Finding:**
Section 461(l) excess business loss limitations are correctly implemented:

```typescript
// 2026 limits (Rev. Proc. 2025-32)
SECTION_461L_LIMITS: {
  single: 256000,
  mfj: 512000,
  mfs: 256000,
  hoh: 256000,
}

// Applied as triple-limit: min(generated, statutory, income)
const usableOrdinaryLoss = Math.min(
  ordinaryLossesGenerated,
  taxRates.section461Limit,
  effectiveIncome
);
```

**Strengths:**
- Current 2026 inflation-adjusted limits
- Correctly limits to lesser of (1) loss generated, (2) statutory cap, (3) taxable income
- Proper filing status differentiation

**Minor Concern:**
**2026 limits are estimates** pending final IRS publication (noted in comments). Should be updated once Rev. Proc. 2026-XX publishes.

**Severity:** Low
**Status:** Correctly implemented with appropriate caveats

---

#### 4.2 Capital Loss Carryforward Usage (LOW)

**Location:** `/src/calculations/helpers.ts:100-114`

**Finding:**
Capital loss carryforward mechanics follow IRC §1211(b):

```typescript
// $3,000 limit ($1,500 for MFS)
const capitalLossLimit = CAPITAL_LOSS_LIMITS[inputs.filingStatus];
const totalRemainingCarryforward = stCarryforward + ltCarryforward;
if (totalRemainingCarryforward > 0) {
  capitalLossUsedAgainstIncome = Math.min(totalRemainingCarryforward, capitalLossLimit);
  // Reduce from ST first, then LT
  if (stCarryforward >= capitalLossUsedAgainstIncome) {
    stCarryforward -= capitalLossUsedAgainstIncome;
  } else {
    // ...
  }
}
```

**Strengths:**
- Correct MFS $1,500 limit
- Proper ordering (ST losses applied before LT)
- Clear tracking of capital loss vs. ordinary income offset

**Severity:** Low
**Status:** Correctly implemented

---

### 5. Qualified Purchaser Requirements

#### 5.1 QP Verification Modal (MEDIUM)

**Location:** `/src/components/QualifiedPurchaserModal.tsx`

**Finding:**
The calculator gates access with a multi-acknowledgment modal requiring confirmation of:

1. Accredited Investor status (SEC Rule 501)
2. Qualified Purchaser status ($5M+ investments)
3. Leverage risk understanding
4. Not investment advice disclaimer

**Strengths:**
- Multi-layer verification prevents casual misuse
- Persistent local storage prevents re-prompting
- Clear educational language

**Concerns:**
1. **No documentation capture:** Acknowledgments are stored locally but not logged or timestamped
2. **Self-certification only:** No verification mechanism (appropriate for demo, questionable for client-facing deployment)
3. **Clearing browser data bypasses:** Users can clear localStorage to bypass

**Recommendations:**
1. **For demo/internal use:** Current implementation acceptable
2. **For client deployment:**
   - Add timestamped acknowledgment logging
   - Consider requiring advisor confirmation before sharing with client
   - Add session expiry (e.g., re-confirm every 90 days)

**Severity:** Medium
**Context-Dependent:** Low for internal use, High for client-facing deployment

---

### 6. Cost Assumptions

#### 6.1 Fee Rate Assumptions (HIGH)

**Location:** `/src/types.ts:203-205`, `/src/AdvancedMode/QfafTestByYear.tsx:70-71`

**Finding:**
Fee assumptions are **inconsistent** between the main calculator and the QFAF Test page:

**Main Calculator (Advanced Settings):**
```typescript
custodianMarginFeeRate: 0.01,       // 1% = 100 bps (generic)
wealthManagementFeeRate: 0.0075,    // 0.75% = 75 bps (generic)
```

**QFAF Test Page:**
```typescript
ADVISOR_MGMT_FEE_RATE = 0.0057;     // ~0.57% (strategy-specific)
QFAF_FINANCING_FEE_RATE = 0.00536;  // ~0.54% (strategy-specific)
```

**Concerns:**
1. **Disconnected assumptions:** Main calculator uses generic 1% + 0.75% (175 bps total), but QFAF Test uses specific 0.57% + 0.54% (111 bps total)
2. **No strategy differentiation:** Core strategies (higher leverage) should have higher financing costs than Overlay strategies (using appreciated stock)
3. **Wealth management fee seems high:** 75 bps on full exposure (including leverage) is above market for HNW ($50B+ clients often 50 bps or less)

**Strategy-Specific Reality:**
- **Overlay strategies:** Lower financing cost (margin on appreciated stock ≈ 50-75 bps)
- **Core strategies:** Higher financing cost (cash borrowing ≈ 100-150 bps depending on leverage)

**Recommendations:**
1. **Align fee assumptions:** Use strategy-specific rates consistently
2. **Document fee structure:** Make clear what's included (advisor fee vs. financing vs. QFAF management)
3. **Add fee sensitivity:** Show net tax alpha after 100 bps / 150 bps / 200 bps total cost scenarios

**Severity:** High
**Rationale:** Material impact on net benefit calculations; current assumptions may overstate costs and understate alpha

---

#### 6.2 Wash Sale Disallowance Rate (MEDIUM)

**Location:** `/src/types.ts:187`, `/src/calculations/core.ts:123`

**Finding:**
Wash sale disallowance is configurable with 0% default:

```typescript
washSaleDisallowanceRate: 0,    // Default: 0 (can increase if wash sales expected)
```

**Concern:**
**0% default is optimistic.** Even sophisticated direct indexing with active tax-loss harvesting typically experiences 5-10% wash sale disallowance due to:
- Corporate actions (mergers, spin-offs)
- Rebalancing timing
- Overlapping positions across accounts

**Recommendation:**
- Change default to 5% (conservative baseline)
- Document that 0% assumes perfect tax-lot tracking and no cross-account wash sales
- Add sensitivity showing impact of 0% / 5% / 10% disallowance

**Severity:** Medium
**Rationale:** Affects accuracy of benefit projections; 0% default overstates harvestable losses

---

### 7. Tax Calculation Accuracy

#### 7.1 Tax Benefit Components (LOW)

**Location:** `/src/calculations/core.ts:165-200`, `/src/components/SizingSummary.tsx:185-352`

**Finding:**
Tax benefit calculations properly decompose into constituent parts:

1. **Ordinary Loss Benefit:** `usableOrdinaryLoss × combinedStRate`
2. **ST→LT Conversion:** `stGainsOffset × (stRate - ltRate)`
3. **Capital Loss Benefit:** `capitalLossUsedAgainstIncome × combinedStRate`
4. **NOL Usage Benefit:** `nolUsed × combinedStRate`
5. **Costs:** LT gains + remaining ST gains

**Strengths:**
- Clear component breakdown helps advisors explain value drivers
- Year 1 vs. Year 2+ comparison shows NOL accumulation impact
- Formula tooltips educate users on mechanics

**Severity:** Low
**Status:** Excellent implementation

---

#### 7.2 State Tax Conformity (LOW - Documentation)

**Location:** `/src/popupContent.ts:396`, `/src/pages/QfafTestPage.tsx:68`

**Finding:**
Calculator assumes state conformity to federal §461(l) rules. The QFAF Test page notes:

> "State tax treatment varies; some states do not conform to federal §461(l)"

**Non-Conforming States (Sample):**
- California: Suspends §461(l) for 2024+ (may reinstate)
- New York: Modified conformity
- Several states without income tax: N/A

**Recommendation:**
Add state-specific notes in tax rate display for known non-conforming states:
- "CA: State may not conform to federal §461(l) - consult tax advisor"

**Severity:** Low (Documentation enhancement)
**Status:** Acceptable; consider adding state-specific guidance

---

### 8. Year-by-Year Planning Features

#### 8.1 Income Override and Cash Infusions (LOW)

**Location:** `/src/AdvancedMode/YearByYearPlanning.tsx`, `/src/types.ts:126-131`

**Finding:**
The Year-by-Year Planning feature allows modeling:
- Annual income changes (retirement, bonus years)
- Cash infusions (inheritance, stock option exercises)
- Custom notes per year

**Strengths:**
- Clean interface for complex scenarios
- Changes properly flow through to §461(l) and NOL calculations
- Good use case for option exercise planning

**Enhancement Opportunity:**
No **preset templates** for common scenarios:
- "Retirement in Year 5"
- "Annual $1M option exercises"
- "Stepped income reduction"

Consider adding scenario templates for faster planning.

**Severity:** Low (Enhancement)
**Status:** Current implementation strong

---

## Summary of Findings by Severity

### Critical
None identified.

### High
1. **QFAF Generation Rate Assumptions** (1.2): Fixed 150% doesn't reflect 131-158% historical variance; add scenarios
2. **Fee Rate Assumptions** (6.1): Inconsistent and potentially overstated; align to strategy-specific reality

### Medium
3. **Auto-Sizing Window Default** (1.1): 10-year default may be too long for many clients; consider 5-year
4. **Strategy-Specific Loss Rate Documentation** (2.2): Year-by-year rates lack source attribution and update guidance
5. **Wash Sale Default** (6.2): 0% default overly optimistic; change to 5%
6. **QP Verification for Client Use** (5.1): Current implementation acceptable for demo, needs hardening for production

### Low
7. All other findings: Documentation enhancements, nice-to-have features, correctly implemented logic

---

## Recommendations

### Immediate Actions (Before Client Deployment)
1. **Revise QFAF generation rate documentation:** Add 135%/150%/158% scenario comparison
2. **Align fee assumptions:** Implement strategy-specific financing costs
3. **Update wash sale default:** Change from 0% to 5% with clear documentation
4. **Add QFAF/Collateral ratio warnings:** Alert when sizing exceeds typical bounds

### Short-Term Enhancements
5. **Document loss rate sources:** Add metadata showing backtest period and assumptions
6. **Add state conformity notes:** Flag non-conforming states in tax rate display
7. **Strengthen QP verification:** Add timestamp logging and session expiry for client use

### Long-Term Enhancements
8. **Option exercise planning view:** Dedicated UI for capacity-based timing analysis
9. **Scenario templates:** Pre-built year-by-year patterns for common situations
10. **Real vs. nominal returns:** Clarify inflation treatment in growth assumptions

---

## Conclusion

The financial planning logic in the Enhanced Direct Indexing Calculator is **methodologically sound and implements tax rules correctly**. The QFAF sizing algorithm is sophisticated and the multi-year projection engine properly handles complex carryforward scenarios.

**Key Strengths:**
- Advanced auto-sizing with configurable windows and cushions
- Comprehensive tax rule implementation (§461(l), §172, §1211(b))
- Excellent income offset capacity tracking for planning
- Clear benefit component decomposition

**Key Concerns:**
- QFAF generation rate presented as fixed 150% when historical data shows 131-158% range
- Fee assumptions inconsistent and potentially overstated
- Some defaults (wash sales, sizing window) may need recalibration

**Overall Grade:** B+ (Very Good)
**Recommendation:** Address High-severity items before broad client deployment; current state acceptable for advisor-guided internal use.

---

## Technical Validation

All findings have been validated against:
- Source code in `/src/calculations/`, `/src/types.ts`, `/src/strategyData.ts`
- Test coverage in `/src/calculations.test.ts`, `/src/qfafTestCalculations.test.ts`
- UI components in `/src/components/`, `/src/AdvancedMode/`
- Documentation in `/README.md`, `/API.md`, `/src/popupContent.ts`

Code review conducted using systematic analysis of:
- Formula correctness against tax code
- Assumption reasonableness vs. industry standards
- Edge case handling and input validation
- Documentation completeness and accuracy
