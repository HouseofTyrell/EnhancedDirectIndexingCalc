# UI vs Calculation Gap Analysis

## Executive Summary

Cross-reference analysis of UI inputs in Calculator.tsx against actual calculation usage in core.ts, sizing.ts, overrides.ts, and sensitivity.ts.

**Key Finding:** The `trackingErrorMultiplier` field in `SensitivityParams` appears in the UI but is **NEVER used in any calculations**.

---

## Analysis Methodology

1. **UI Catalog**: Reviewed Calculator.tsx (933 lines) for all input controls
2. **Calculation Trace**: Analyzed calculation files to identify which inputs affect results
3. **Cross-Reference**: Mapped each UI element to its calculation usage

---

## FINDINGS: Non-Functional UI Elements

### **CRITICAL: Completely Non-Functional**

#### 1. Tracking Error Multiplier (Sensitivity Analysis)
- **Location**: Lines 881-892 in Calculator.tsx (Sensitivity Analysis section)
- **UI Element**: Part of `SensitivityParams` interface
- **State Variable**: `sensitivityParams.trackingErrorMultiplier`
- **Evidence of Non-Functionality**:
  - Defined in types.ts:138 as part of SensitivityParams
  - Default value set in DEFAULT_SENSITIVITY (line 147)
  - **NEVER referenced in sensitivity.ts calculation logic**
  - **NEVER used in core.ts, sizing.ts, or overrides.ts**
  - **Search result**: Zero calculation usage

**Impact**: Users can adjust this slider thinking it affects results, but it does absolutely nothing.

**Recommendation**: Either implement the tracking error logic or remove this field entirely.

---

## VERIFIED: Fully Functional UI Elements

### Core Inputs (All Used)
✅ **Filing Status** → Used in tax bracket lookups (core.ts:138, 143)
✅ **Annual Income** → Used for 461(l) limits, NOL calculations (core.ts:111, 142)
✅ **State Code** → Used for state tax rate lookup (core.ts:141)
✅ **State Rate** (when OTHER) → Direct tax rate input (core.ts:141)
✅ **Strategy ID** → Determines loss/gain rates (core.ts:25, sizing.ts:20)
✅ **Collateral Amount** → Base sizing input (sizing.ts:25)

### QFAF Controls (All Used)
✅ **qfafEnabled** → Toggles QFAF on/off (sizing.ts:41)
✅ **qfafSizingYears** → Averaging window for sizing (sizing.ts:26, 31)
✅ **qfafSizingCushion** → Conservative sizing reduction (sizing.ts:44, 47)

### Advanced Settings (All Used)
✅ **qfafMultiplier** (Loss Generation Rate) → Controls loss generation (core.ts:114, sizing.ts:27-28)
✅ **growthEnabled** → Enables portfolio growth (core.ts:223, 255)
✅ **defaultAnnualReturn** → Growth rate when enabled (core.ts:223, 255)
✅ **financingFeesEnabled** → Deducts fees from returns (core.ts:224-226)
✅ **custodianMarginFeeRate** → Fee calculation (core.ts:225)
✅ **wealthManagementFeeRate** → Fee calculation (core.ts:225)

### Carryforwards (All Used)
✅ **existingStLossCarryforward** → ST loss carryforward tracking (core.ts:61, 132-134)
✅ **existingLtLossCarryforward** → LT loss carryforward tracking (core.ts:62)
✅ **existingNolCarryforward** → NOL carryforward tracking (core.ts:63, 161)

### Year-by-Year Planning (All Used)
✅ **w2Income** override → Income adjustment per year (overrides.ts:71, 89-90)
✅ **cashInfusion** override → Capital injection per year (overrides.ts:74-84)

### Sensitivity Analysis (Partial)
✅ **federalRateChange** → Tax rate stress test (sensitivity.ts:95-96)
✅ **stateRateChange** → State tax stress test (sensitivity.ts:52)
✅ **annualReturn** → Growth override (sensitivity.ts:65-68)
✅ **stLossRateVariance** → Loss rate variance (sensitivity.ts:55, 167)
✅ **ltGainRateVariance** → Gain rate variance (sensitivity.ts:56, 168)
❌ **trackingErrorMultiplier** → **NOT USED ANYWHERE**

---

## Display-Only Elements (By Design)

These are **intentionally** display-only and not broken:

### Results Display
- Total Tax Savings (line 784)
- Final Portfolio Value (line 785)
- Effective Tax Alpha (line 786)
- Total NOL Generated (line 787)
- All year-by-year results in ResultsTable (line 818)
- Charts (lines 813, 826)

### Tax Rates Display
- Federal ST Rate (calculated, line 138)
- Federal LT Rate (calculated, line 139)
- State Rate (calculated/looked up, line 140-141)
- Combined rates (calculated, lines 146-148)

### Sizing Summary
- QFAF Value (calculated, line 232)
- Total Exposure (calculated, line 233)
- Sizing metrics (line 765-773)

---

## Informational/Navigation Elements

These provide context but don't affect calculations:

- Section headers and guidance text (lines 242-247, 270-272, 807-809)
- InfoPopup components (lines 266, 803)
- Advanced options toggle (lines 641-652)
- Reset to defaults button (lines 726-742)
- Print/Export buttons (lines 836-852)

---

## Summary Statistics

| Category | Count |
|----------|-------|
| **Total UI Input Fields** | ~35 |
| **Functional Inputs** | 34 |
| **Non-Functional Inputs** | 1 |
| **Display-Only (by design)** | ~25 |
| **Navigation/Info** | ~10 |

---

## Recommendations

### Immediate Action Required

1. **Remove `trackingErrorMultiplier`**
   - Delete from SensitivityParams interface (types.ts:138)
   - Remove from DEFAULT_SENSITIVITY (types.ts:147)
   - Remove any UI controls in Sensitivity Analysis section
   - Update SensitivityAnalysis component to remove slider

### Alternative: Implement It

If tracking error was intended to be functional:
- Add tracking error logic to sensitivity calculations
- Apply variance based on portfolio composition
- Document expected behavior

---

## Verification Commands

To verify this analysis:

```bash
# Search for trackingErrorMultiplier usage in calculations
grep -r "trackingErrorMultiplier" src/calculations/

# Expected: No results (proves it's unused)

# Search for all SensitivityParams usage
grep -r "SensitivityParams" src/calculations/

# Expected: Type imports only, no actual usage of trackingErrorMultiplier
```

---

## Notes

- All other advanced mode sections are fully functional
- The Rate Editor modal is functional but complex
- Strategy Comparison uses its own calculation path but is functional
- Scenario Analysis computes bull/base/bear cases correctly
