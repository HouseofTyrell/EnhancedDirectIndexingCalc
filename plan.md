# UI Clarity & Label Fixes — Implementation Plan

Based on review by three personas (Portfolio Manager, Financial Advisor, HNW Client), plus the gross-vs-usable ordinary loss visibility gap.

---

## Phase 1: Ordinary Loss Visibility (User's Priority Issue)

### 1A. Show gross ordinary loss in the table
**File:** `src/ResultsTable.tsx`
- When Ord. Loss column is expanded (or NOL section is expanded), add a **"Gross Loss"** sub-column showing `year.ordinaryLossesGenerated`
- Keep the existing "Ord. Loss" column showing the usable (capped) amount
- When gross ≠ usable, this makes the §461(l) cap visually obvious

### 1B. Show excess-to-NOL explicitly
- In the expanded NOL detail, the "NOL Chg." column already shows the net change (`excessToNol - nolUsed`). This is correct but conflates two distinct events (generation and usage).
- Split into: keep "NOL Chg." as-is but add a tooltip or, if space allows, show `+excess / -used` breakdown
- **Simpler alternative:** Make the "Ord. Loss" column itself expandable (like Cap Gains), showing:
  - **Gross Loss** (`ordinaryLossesGenerated`) — the full 150% amount
  - **§461 Cap** (`usableOrdinaryLoss`) — what's deductible this year
  - **→ NOL** (`excessToNol`) — what rolls into carryforward

**Recommended approach:** Make "Ord. Loss" an expandable column group:
- Collapsed: shows `usableOrdinaryLoss` (current behavior)
- Expanded: shows 3 sub-columns: **Gross** | **Usable** | **→ NOL**

---

## Phase 2: Label & Naming Fixes (Low Effort, High Impact)

### 2A. Fix "Cap Gains" → "Net Capital" inconsistency
**File:** `src/ResultsTable.tsx:199`
- Combined mode currently says "Cap Gains", collateral-only says "Net Capital"
- Change combined mode label to **"Net Capital"** for consistency

### 2B. Fix duplicate "Ord. Loss" label
**File:** `src/ResultsTable.tsx:285`
- The Savings breakdown sub-column "Ord. Loss" (line 285) conflicts with the main Ord. Loss column
- Rename savings breakdown column to **"Ord. Ded."** (ordinary deduction benefit) to differentiate

### 2C. Rename "NOL" in savings breakdown → "NOL Ben."
**File:** `src/ResultsTable.tsx:289`
- Currently just "NOL" — ambiguous (amount vs benefit)
- Rename to **"NOL Ben."** to clarify it's the tax benefit from NOL usage

### 2D. Rename "Offset Cap." → "Max Shelter"
**File:** `src/ResultsTable.tsx:245`
- "Offset Cap." is opaque to non-tax-specialists
- Rename to **"Max Shelter"** — more intuitive for clients and advisors
- Update the carryforward explanation note accordingly (line 540)

### 2E. Rename "ST→LT" → "Rate Arb."
**File:** `src/ResultsTable.tsx:292`
- "ST→LT" is tax jargon; "Rate Arb." communicates the concept better
- Update tooltip to explain: "Savings from gains taxed at the lower long-term rate"

### 2F. Rename "CF" badge → "W/D" or spell out
**File:** `src/ResultsTable.tsx:386`
- "CF" (carryforward) is cryptic
- Change to **"W/D"** with tooltip "Wind-down: strategy ended, carryforward usage only"
- Alternative: on the first wind-down row, add an inline note

---

## Phase 3: Formatting Consistency

### 3A. Standardize negative number format
**File:** `src/ResultsTable.tsx`
- Currently mixed: parentheses `($150,000)` in some places, minus sign `−$150,000` in others (NOL Change)
- Standardize on **parentheses** throughout (accounting convention matches the professional audience)
- Fix NOL Change column (line 453) to use `(${formatCurrency(...)})` instead of `−$...`

---

## Phase 4: Medium-Effort Enhancements

### 4A. Add cumulative savings column (optional)
**File:** `src/ResultsTable.tsx`
- Add a "Cumul." column next to Savings showing running total
- This lets PMs and advisors quickly see milestone crossings
- Keep it always visible (not expandable) since it's a key planning number

### 4B. Add QFAF definition tooltip
**File:** `src/ResultsTable.tsx` (view mode buttons, line 126)
- Add a tooltip to the "QFAF Only" button: "Qualified Financial Asset Fund — generates ordinary losses and short-term gains"
- Also add a brief definition in the guidance text of the results section

### 4C. Improve wind-down row clarity
**File:** `src/ResultsTable.tsx`
- First wind-down row: add a subtle divider or label row "— Strategy Wind-Down —"
- Makes the transition from active to wind-down visually obvious

---

## Files Modified

| File | Changes |
|------|---------|
| `src/ResultsTable.tsx` | All table label changes, expandable Ord. Loss, cumulative column, formatting |
| `src/components/ResultsSummary.tsx` | Minor: NOL card subtext enhancement |
| `src/index.css` | Styling for new expandable Ord. Loss sub-columns, wind-down divider |
| `src/InfoPopup.tsx` or popup content | New/updated tooltip text for renamed columns |

## Implementation Order

1. **Phase 1** (Ordinary Loss visibility) — highest user priority
2. **Phase 2** (Label fixes) — batch all renames together
3. **Phase 3** (Formatting) — quick pass
4. **Phase 4** (Enhancements) — if time permits
