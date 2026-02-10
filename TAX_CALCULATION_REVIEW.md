# Tax Calculation Review - Enhanced Direct Indexing Calculator

**Review Date**: 2026-02-09
**Reviewer**: Tax Accuracy Reviewer
**Scope**: Federal and state tax calculations, IRC compliance, QFAF mechanics

---

## Executive Summary

This review analyzed tax calculations in the Enhanced Direct Indexing Calculator for accuracy and compliance with US tax law. The calculator implements a complex tax-advantaged investment strategy combining:
- Qualified Fund of Allocated Funds (QFAF) generating ordinary losses and short-term gains
- Direct indexing collateral generating short-term losses and long-term gains
- Section 461(l) excess business loss limitations
- Net Operating Loss (NOL) carryforwards
- Capital loss netting and IRC §1211(b) limitations

**Overall Assessment**: The tax calculations are **substantially accurate** with generally correct implementation of IRS regulations. Several findings require attention ranging from critical documentation issues to minor enhancements.

---

## Findings Summary

| Severity | Count | Category |
|----------|-------|----------|
| **Critical** | 1 | Documentation/Transparency |
| **High** | 2 | Calculation Accuracy |
| **Medium** | 4 | Edge Cases & Compliance |
| **Low** | 3 | Enhancement Opportunities |

---

## CRITICAL FINDINGS

### 1. QFAF 150% Tax Treatment - Insufficient Documentation

**Severity**: Critical
**Files**: `src/strategyData.ts:162-163`, `src/calculations/core.ts:112-116`, `src/calculations/sizing.ts:15`

**Issue**: The QFAF mechanism generates 150% of market value in **both** short-term capital gains AND ordinary losses. This extraordinary tax treatment is central to the entire calculator but lacks sufficient documentation of:
- Legal basis for this treatment under IRC
- Which specific fund structures qualify for this treatment
- Regulatory requirements (e.g., IRC §988, §1256 elections, or partnership rules)
- Limitations or disqualification scenarios

**Current Implementation**:
```typescript
// strategyData.ts
export const QFAF_ST_GAIN_RATE = 1.5; // 150% of MV per year
export const QFAF_ORDINARY_LOSS_RATE = 1.5; // 150% of MV per year
```

**Code Location**:
- `src/calculations/core.ts:115-116`
- `src/calculations/sizing.ts:27-28`

**Risk**: Users may rely on this calculator for multi-million dollar investment decisions without understanding:
1. Whether their specific fund qualifies for this treatment
2. What documentation/elections are required
3. Potential IRS challenge risks
4. State tax conformity issues

**Recommendation**: **URGENT**
1. Add comprehensive documentation explaining the legal basis for 150% treatment
2. Add warnings about qualification requirements
3. Consider adding a "fund type" selector if different structures have different treatment
4. Consult with tax counsel to validate the 150% mechanism assumptions
5. Add disclaimer about necessity of professional tax advice for actual implementation

**User Impact**: Investors could make incorrect assumptions about tax benefits if their fund doesn't qualify for this treatment.

---

## HIGH SEVERITY FINDINGS

### 2. Section 461(l) Income Limitation May Be Overly Restrictive

**Severity**: High
**Files**: `src/calculations/core.ts:139-143`, `src/strategyData.ts:165-172`

**Issue**: The calculator limits ordinary loss deductions to the **lesser of**:
1. Losses generated
2. Section 461(l) statutory limit ($512K MFJ, $256K others for 2026)
3. **Taxable income for the year**

The third constraint (taxable income) may be **overly restrictive** per IRC §461(l).

**Current Implementation**:
```typescript
// core.ts:139-143
const usableOrdinaryLoss = Math.min(
  ordinaryLossesGenerated,
  taxRates.section461Limit,
  effectiveIncome  // ← This may be incorrect
);
```

**IRS Guidance**: Section 461(l) limits "excess business losses" but does NOT directly limit the deduction to taxable income in the same year. The proper sequencing is:
1. Apply the 461(l) limitation ($512K/$256K)
2. Excess over 461(l) limit → NOL carryforward
3. The NOL carryforward (not current year loss) is then limited to 80% of taxable income in **future years** per IRC §172(a)(2)

**Example of Current Behavior**:
- Taxpayer has $100K W-2 income
- QFAF generates $1M ordinary loss
- Calculator limits deduction to $100K (income)
- Sends $900K to NOL

**Potentially Correct Behavior**:
- Taxpayer has $100K W-2 income
- QFAF generates $1M ordinary loss
- 461(l) limit: $512K deductible (MFJ)
- Result: $100K income - $512K loss = -$412K taxable income → $412K NOL
- Excess: $1M - $512K = $488K → additional NOL
- Total NOL: $900K (same result, but different calculation path)

**Analysis**: In this specific example, the result is the same, but the **conceptual model** may be wrong. The income limitation should apply to the **net result** (which becomes NOL), not to the current-year deduction amount.

**Code Location**: `src/calculations/core.ts:139-143`

**Recommendation**: **HIGH PRIORITY**
1. Review IRC §461(l) regulations and IRS guidance on the interaction with taxable income
2. Verify whether the current implementation is conservative (correct) or incorrect
3. If incorrect, separate the 461(l) limitation from the income limitation
4. Add test cases with negative taxable income scenarios
5. Document the intended behavior in code comments

**User Impact**: May understate deductions in low-income years or overstate NOL carryforwards.

---

### 3. NOL 80% Limitation Calculation - Verify Pre-NOL Taxable Income

**Severity**: High
**Files**: `src/calculations/helpers.ts:116-123`

**Issue**: The NOL offset limitation calculation may have an order-of-operations issue in computing "taxable income before NOL."

**Current Implementation**:
```typescript
// helpers.ts:119-122
const taxableIncomeBeforeNol =
  yearIncome + taxableSt + taxableLt - usableOrdinaryLoss - capitalLossUsedAgainstIncome;
const nolOffsetLimit = settings.nolOffsetLimit ?? NOL_OFFSET_PERCENTAGE;
const maxNolUsage = Math.max(0, taxableIncomeBeforeNol) * nolOffsetLimit;
```

**IRC §172(a)(2) Requirement**: NOL deduction cannot exceed 80% of taxable income **computed without regard to the NOL deduction**.

**Potential Issue**: The calculation subtracts `usableOrdinaryLoss` (current year Section 461(l) ordinary losses) from income before applying the 80% limit. This is likely **correct** since:
- Current year ordinary losses are NOT part of NOL (they're current year deductions)
- Only **excess** losses over 461(l) limit become NOL
- NOL carryforwards from **prior years** are subject to the 80% limit

**Verification Needed**:
1. Confirm that `usableOrdinaryLoss` is correctly excluded from the base for 80% calculation
2. Verify that capital loss offset ($3K) is correctly included
3. Ensure that current year's "excess to NOL" is NOT included in NOL usage in the same year

**Code Location**: `src/calculations/helpers.ts:116-123`

**Test Coverage**: The test file (`calculations.test.ts:184-195`) verifies the 80% limit but doesn't test edge cases with multiple income sources.

**Recommendation**: **HIGH PRIORITY**
1. Add detailed code comments explaining the order of operations
2. Add test case with:
   - High W-2 income ($1M)
   - Large NOL carryforward ($2M)
   - Current year ordinary losses exceeding 461(l) limit
   - ST/LT gains
3. Verify calculation matches IRS Form 1045 worksheet
4. Document any conservative assumptions

**User Impact**: Incorrect NOL limitation could overstate or understate tax benefits by significant amounts.

---

## MEDIUM SEVERITY FINDINGS

### 4. State Tax Conformity Issues Not Addressed

**Severity**: Medium
**Files**: `src/taxData.ts:6-64`, `src/calculations/core.ts:165-167`

**Issue**: The calculator applies federal Section 461(l) limitations universally but does **not account for state tax conformity** differences.

**State Variations**:
- **California**: Does NOT conform to IRC §461(l) - no excess business loss limitation
- **New York**: Conforms to federal 461(l) with modifications
- **Many states**: Have their own NOL carryforward rules (e.g., limited years, different percentages)

**Current Implementation**:
```typescript
// core.ts:165-167
const combinedStRate = stRate + stateRate;
const combinedLtRate = ltRate + stateRate;
```

The calculator adds state rates to federal rates, implicitly assuming **identical tax treatment** at state level.

**Example Impact**:
- California taxpayer with $1M ordinary loss
- Federal: Limited to $512K (461(l)), excess to NOL
- California: **Full $1M deduction** (no 461(l) limit)
- Calculator understates California benefit by $488K × 13.3% = $64,904

**Code Location**:
- `src/calculations/core.ts:165-220`
- `src/taxData.ts` (state rates defined but no conformity data)

**Recommendation**: **MEDIUM PRIORITY**
1. Add disclaimer that state tax calculations assume federal conformity
2. Consider adding state-specific adjustments for major states (CA, NY, NJ)
3. Add "state conformity override" option in advanced settings
4. Document known state deviations in help text
5. Consider separate federal/state tax benefit calculations

**User Impact**: May significantly overstate or understate state tax benefits depending on state conformity.

---

### 5. Capital Loss Carryforward Order - ST vs LT Sequencing

**Severity**: Medium
**Files**: `src/calculations/helpers.ts:100-114`

**Issue**: IRC §1212 requires that when capital loss carryforwards are used against ordinary income, **short-term losses must be used first**, then long-term losses. The current implementation follows this rule (line 107-112), which is **correct**.

**Current Implementation** (CORRECT):
```typescript
// helpers.ts:107-112
if (stCarryforward >= capitalLossUsedAgainstIncome) {
  stCarryforward -= capitalLossUsedAgainstIncome;
} else {
  const fromLt = capitalLossUsedAgainstIncome - stCarryforward;
  stCarryforward = 0;
  ltCarryforward -= fromLt;
}
```

**Verification**: This correctly prioritizes ST carryforward depletion before touching LT carryforward.

**Enhancement Opportunity**: The code correctly implements the rule but lacks:
1. Comment citing IRC §1212(b)(1)(B)
2. Explanation of why this ordering matters (tax efficiency)
3. Test case explicitly verifying this ordering

**Code Location**: `src/calculations/helpers.ts:100-114`

**Recommendation**: **MEDIUM PRIORITY**
1. Add code comment: `// IRC §1212(b)(1)(B): ST losses applied before LT losses`
2. Add test case verifying ST depletion priority
3. Consider adding to documentation/help text

**User Impact**: None (already correctly implemented) - this is a documentation enhancement.

---

### 6. NIIT Threshold Test for Modified AGI vs Taxable Income

**Severity**: Medium
**Files**: `src/taxData.ts:121-126`, `src/taxData.ts:162-179`, `src/taxData.ts:191-220`

**Issue**: The Net Investment Income Tax (NIIT) 3.8% surtax applies when **Modified Adjusted Gross Income (MAGI)** exceeds thresholds ($250K MFJ, $200K Single). The calculator tests `income > niitThreshold` but it's unclear if `income` represents:
- Gross income
- Adjusted Gross Income (AGI)
- Modified AGI (MAGI)
- Taxable income

**Current Implementation**:
```typescript
// taxData.ts:175-177
if (income > niitThreshold) {
  marginalRate += NIIT_RATE;
}
```

**IRS Requirement**: NIIT applies to the **lesser of**:
1. Net investment income, OR
2. MAGI exceeding threshold

The calculator uses the `income` parameter, which appears to be the user's "Annual Income" input. This is likely **AGI or similar**, which is reasonable for NIIT purposes.

**Potential Issue**:
- If user enters "taxable income" instead of AGI, NIIT threshold test will be wrong
- No validation that input represents the correct income measure
- No adjustment for MAGI modifications (e.g., foreign earned income exclusion)

**Code Location**:
- `src/taxData.ts:162-179` (ST rate calculation)
- `src/taxData.ts:191-220` (LT rate calculation)

**Recommendation**: **MEDIUM PRIORITY**
1. Document in UI that "Annual Income" should be AGI or MAGI
2. Add tooltip/help text clarifying the income measure
3. Consider renaming variable from `annualIncome` to `adjustedGrossIncome`
4. Add disclaimer about MAGI modifications
5. Add test case with income just above/below NIIT threshold

**User Impact**: Minor - most users will enter a reasonable income proxy, but documentation would improve accuracy.

---

### 7. Wash Sale Disallowance - Implementation Incomplete

**Severity**: Medium
**Files**: `src/calculations/core.ts:120-123`, `src/types.ts:187`

**Issue**: The calculator includes a `washSaleDisallowanceRate` setting (default 0%) to model wash sale loss disallowances, but:
1. It applies uniformly to ALL harvested losses
2. Wash sales depend on **actual trading patterns** (30-day rule)
3. No modeling of timing or reinvestment behavior

**Current Implementation**:
```typescript
// core.ts:123
const stLossesHarvested = safeNumber(grossStLosses * (1 - settings.washSaleDisallowanceRate));
```

**IRC §1091 Rules**: Wash sales disallow losses when:
- Substantially identical security purchased within 30 days before/after sale
- Applies security-by-security, not portfolio-wide

**Reality**: A well-managed direct indexing strategy can **minimize or avoid** wash sales through:
- Strategic pair trading
- Sector/factor substitutes
- Careful timing

**Code Location**: `src/calculations/core.ts:120-123`

**Recommendation**: **MEDIUM PRIORITY**
1. Rename to `estimatedWashSaleRate` to clarify it's an approximation
2. Add UI help text explaining this is a **portfolio-level approximation**
3. Default to 0% with note that skilled managers can avoid most wash sales
4. Consider adding ranges: "Conservative 10-15%, Moderate 5-10%, Aggressive 0-5%"
5. Add disclaimer that actual wash sales depend on implementation

**User Impact**: Users may misunderstand the wash sale setting as precise vs. an estimate.

---

## LOW SEVERITY FINDINGS

### 8. Federal Tax Bracket Data Recency

**Severity**: Low
**Files**: `src/taxData.ts:75-119`

**Issue**: Tax brackets are labeled as "2026" values with a comment referencing "IRS Rev. Proc. 2025-XX" and "OBBBA adjustments" with specific inflation rates.

**Current Implementation**:
```typescript
// taxData.ts:75-77
// Federal brackets for 2026 (MFJ)
// Source: IRS Rev. Proc. 2025-XX, includes OBBBA adjustments
// Bottom two brackets get 4% inflation adjustment, upper brackets get 2.3%
```

**Verification Needed**:
1. Confirm 2026 brackets match final IRS guidance (Rev. Proc. typically released in October/November of prior year)
2. Verify OBBBA (One-time Baseline Build-out Budget Adjustment?) - unusual acronym
3. Confirm differential inflation adjustments (4% vs 2.3%) are correctly applied

**Code Location**: `src/taxData.ts:75-119`

**Current Values** (MFJ):
- 10%: $0 - $24,800
- 12%: $24,800 - $100,800
- 22%: $100,800 - $211,400
- 24%: $211,400 - $403,550
- 32%: $403,550 - $512,450
- 35%: $512,450 - $768,700
- 37%: $768,700+

**Recommendation**: **LOW PRIORITY**
1. Verify brackets against IRS Rev. Proc. 2025-32 (or latest)
2. Update comment with actual Rev. Proc. number when available
3. Add update date to code comments
4. Consider adding "last verified" date to UI
5. Add note about potential mid-year updates

**User Impact**: Minor - brackets are likely close to correct, but precision matters for high-income taxpayers.

---

### 9. LTCG Brackets - 2026 Inflation Adjustment Verification

**Severity**: Low
**Files**: `src/taxData.ts:194-213`

**Issue**: Long-term capital gains brackets for 2026 show inflation-adjusted values but lack source documentation.

**Current Implementation**:
```typescript
// taxData.ts:196-199 (MFJ)
if (income > 610350) ltRate = 0.2;
else if (income > 96700) ltRate = 0.15;
else ltRate = 0;
```

**2025 Known Values** (for comparison):
- MFJ: 0% up to ~$94,050, 15% up to ~$583,750, 20% above
- 2026 values in code: 0% up to $96,700, 15% up to $610,350, 20% above
- Implied inflation: ~2.8% adjustment

**Verification**: Check against IRS Rev. Proc. 2025-32 when published.

**Code Location**: `src/taxData.ts:194-213`

**Recommendation**: **LOW PRIORITY**
1. Verify 2026 LTCG brackets when IRS publishes final numbers
2. Add source comment
3. Add test cases at bracket boundaries
4. Consider adding inflation assumption to documentation

**User Impact**: Minimal - LTCG brackets have less impact on marginal calculations than ordinary income brackets.

---

### 10. Section 461(l) Limit - 2026 Projection

**Severity**: Low
**Files**: `src/strategyData.ts:165-172`

**Issue**: The 461(l) limits are labeled as "2026 values per Rev. Proc. 2025-32" but this guidance may not have been published yet (as of knowledge cutoff).

**Current Values**:
```typescript
export const SECTION_461L_LIMITS: Record<FilingStatus, number> = {
  single: 256000,  // Down from 2025: $305K
  mfj: 512000,     // Down from 2025: $610K
  mfs: 256000,
  hoh: 256000,
};
```

**Issue**: These values appear to be **significantly lower** than 2025 values:
- 2025 MFJ: ~$610,000
- 2026 (in code): $512,000
- This is a **$98K reduction**, inconsistent with inflation

**Analysis**: This might be due to:
1. OBBBA provision resetting the base amounts (mentioned in taxData.ts:76)
2. Scheduled phase-down of limits
3. Error in projection

**Code Location**: `src/strategyData.ts:165-172`

**Recommendation**: **LOW PRIORITY**
1. **URGENT SUB-TASK**: Verify these values against IRS guidance
2. If these are projections, clearly label as "Estimated 2026"
3. Add explanation of why limits decreased if intentional
4. Update when official Rev. Proc. is published
5. Add test comparing to known 2025 values

**User Impact**: If limits are too low, calculator will overstate NOL carryforwards and understate immediate deductions.

---

## POSITIVE FINDINGS (What's Done Right)

### Correct Implementations ✓

1. **Capital Loss Netting Hierarchy** (helpers.ts:30-98)
   - Correctly implements IRC §1212 ordering
   - ST losses offset ST gains first
   - Cross-netting handled properly
   - LT carryforward priority correct

2. **IRC §1211(b) $3,000/$1,500 Limits** (strategyData.ts:174-181)
   - Correctly applies $3,000 limit for most filers
   - Correctly applies $1,500 limit for MFS filers
   - Properly integrated into carryforward calculations

3. **NOL 80% Limitation** (helpers.ts:121-123)
   - Implements TCJA 80% offset limit
   - Configurable via settings (good for scenario testing)
   - Default of 0.8 is correct per IRC §172(a)(2)

4. **NIIT 3.8% Rate** (taxData.ts:126)
   - Correct rate
   - Correct thresholds ($250K MFJ, $200K Single, etc.)
   - Applied to both STCG and LTCG appropriately

5. **Safe Number Handling** (utils/formatters.ts, core.ts throughout)
   - Prevents NaN/Infinity propagation
   - Good defensive programming

6. **Multi-Year Projections** (core.ts:66-88)
   - Properly tracks carryforwards year-over-year
   - Accumulates NOL correctly
   - Portfolio value updates logically

---

## EDGE CASES REQUIRING ATTENTION

### Edge Case 1: Zero or Negative Income

**Scenario**: Taxpayer has zero or negative W-2 income (retirees, business losses)

**Current Behavior**:
```typescript
// core.ts:142
effectiveIncome
```
If `effectiveIncome` is negative, the `Math.min()` in line 139 will use the negative value, resulting in zero usable ordinary loss.

**Correct Behavior**: Negative income should still allow up to the 461(l) limit for business losses.

**Test Coverage**: Not explicitly tested in calculations.test.ts

**Recommendation**: Add test case and potentially adjust logic.

---

### Edge Case 2: AMT Considerations

**Status**: Not implemented (acknowledged gap)

**Issue**: Alternative Minimum Tax (AMT) can affect:
- NOL deduction limitations (different rules)
- State tax deduction disallowance
- Investment income timing

**Current Behavior**: Calculator ignores AMT entirely.

**Recommendation**: Add disclaimer that AMT may affect actual results. For high-income taxpayers ($500K+), AMT is less likely post-TCJA but still possible.

---

### Edge Case 3: State-Specific Capital Loss Rules

**Example**: New Jersey limits capital loss deduction to $3,000 but may have different carryforward rules.

**Current Behavior**: Assumes all states follow federal rules.

**Recommendation**: Add state conformity notes in documentation.

---

## TEST COVERAGE ASSESSMENT

### Strong Coverage ✓
- Basic calculation flows (calculations.test.ts)
- Section 461(l) limit behavior
- NOL accumulation and usage
- Capital loss netting
- MFS $1,500 limit
- QFAF toggle functionality
- Wash sale adjustments

### Gaps Requiring Tests
1. **Negative income scenarios**
2. **NIIT threshold boundary cases**
3. **Multiple carryforward types simultaneously**
4. **State conformity edge cases**
5. **Extreme values (overflow/underflow)**
6. **Year-by-year income variations**
7. **461(l) limit interaction with low income**

---

## REGULATORY COMPLIANCE CHECKLIST

| Regulation | Status | Notes |
|------------|--------|-------|
| IRC §461(l) - Excess Business Loss | ✓ Implemented | Verify income limitation logic |
| IRC §172 - NOL Carryforward | ✓ Implemented | 80% limit correctly applied |
| IRC §172(a)(2) - NOL 80% Limit | ✓ Implemented | Calculation method needs verification |
| IRC §1211(b) - $3,000 Capital Loss Limit | ✓ Implemented | Correct for MFS ($1,500) |
| IRC §1212 - Capital Loss Carryforward | ✓ Implemented | ST/LT ordering correct |
| IRC §1(h) - LTCG Rates | ✓ Implemented | Verify 2026 brackets |
| IRC §1(j) - NIIT | ✓ Implemented | Correct rates and thresholds |
| State Conformity | ⚠️ Partial | Assumes full federal conformity |
| IRC §1091 - Wash Sales | ⚠️ Approximation | Portfolio-level estimate only |
| AMT Rules | ✗ Not Implemented | Disclosed limitation |

**Legend**: ✓ = Implemented, ⚠️ = Partial/Approximate, ✗ = Not Implemented

---

## RECOMMENDATIONS BY PRIORITY

### Immediate Actions (Within 1 Week)

1. **Add QFAF documentation** - Critical transparency issue
2. **Verify Section 461(l) income limitation** - High-impact calculation
3. **Verify 461(l) 2026 limits** - Values seem incorrect
4. **Add state conformity disclaimers** - Legal protection

### Short-Term (Within 1 Month)

5. **Clarify NOL 80% calculation** - Add code comments and tests
6. **Document income measure for NIIT** - UI clarity
7. **Verify 2026 tax brackets** - When IRS publishes final numbers
8. **Add IRC citations to code** - Regulatory traceability

### Medium-Term Enhancements

9. **Add state-specific adjustments** - CA, NY priority
10. **Enhance wash sale documentation** - User expectations
11. **Add AMT disclaimer** - Risk disclosure
12. **Expand test coverage** - Edge cases and boundary conditions

---

## DISCLAIMER RECOMMENDATIONS

Suggest adding these disclaimers to the calculator UI:

1. **General Tax Disclaimer**:
   > "This calculator provides estimates based on current tax law and certain assumptions. Actual tax benefits depend on your complete financial situation, fund structure qualification, state tax conformity, and proper implementation. Consult with qualified tax professionals before making investment decisions."

2. **QFAF Qualification Warning**:
   > "The 150% tax treatment assumes your fund structure qualifies under applicable IRS regulations. Not all funds qualify for this treatment. Verify qualification requirements with your tax advisor."

3. **State Tax Conformity Note**:
   > "State tax calculations assume full federal conformity. Some states (notably California) do not conform to federal Section 461(l) limitations, which may result in different state tax benefits."

4. **Professional Advice Required**:
   > "This calculator is for educational and planning purposes only. Investment decisions involving $1M+ should be made only with professional tax and legal advice."

---

## CONCLUSION

The Enhanced Direct Indexing Calculator demonstrates **sophisticated understanding** of complex tax provisions including Section 461(l), NOL carryforwards, capital loss limitations, and NIIT. The core calculation logic is **generally accurate** and well-structured.

**Key Strengths**:
- Correct implementation of capital loss netting rules
- Proper NOL 80% limitation
- Accurate NIIT thresholds and rates
- Good handling of edge cases in carryforward logic
- Comprehensive test coverage for major scenarios

**Primary Concerns**:
1. **QFAF 150% mechanism lacks documentation** - transparency critical for user trust
2. **Section 461(l) income limitation** - verify calculation methodology
3. **State tax conformity** - significant benefit variations not captured
4. **Tax bracket verification** - ensure 2026 values are correct when finalized

**Overall Risk Assessment**: **MEDIUM-LOW**
- Calculation logic is sound for federal tax
- Primary risks are in assumptions (QFAF qualification, state conformity)
- Proper disclaimers can mitigate most legal risks
- High-value users will validate with professionals anyway

**Recommended Next Steps**:
1. Address critical QFAF documentation immediately
2. Verify Section 461(l) and 2026 bracket values
3. Add recommended disclaimers
4. Expand test coverage for edge cases
5. Consider tax counsel review for high-value deployment

---

**Review Complete**: 2026-02-09
**Files Analyzed**: 15+ calculation and tax files
**Lines of Code Reviewed**: ~3,000+
**Test Files Reviewed**: calculations.test.ts, advancedSettings.test.ts, scenarios.test.ts
