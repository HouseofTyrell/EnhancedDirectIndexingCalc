# EDI Tab UX Reorder — Usability & Flow Improvements

## Status: Implemented (2026-02-14)

## Context

Three-persona user testing review (HNW financial advisor, sophisticated HNW client, average HNW client) identified that the EDI tab is analytically excellent but structurally cluttered — too many sections, redundant data, buried key comparisons, and upside-only framing. The tab reads like a reference document instead of a client presentation tool.

## Priority Changes (Synthesized from 3 Personas)

### 1. Move Assumptions Above Summary Cards (Unanimous)
- **Current**: Summary cards (5) -> Assumptions (11 inputs)
- **Proposed**: Assumptions -> Summary cards
- **Why**: Computed outputs precede inputs — disorienting on first visit. Advisor needs to "set up the client" before seeing results.
- **Files**: `src/components/EdiOnlyTab.tsx` — swap the two sections (~lines 448-710)

### 2. Rebalance Summary Cards to Show Cost AND Benefit (2 of 3)
- **Current**: 5 cards, all upside (Potential Tax Protection, Realized Benefit, Break-Even, Tax-Free Exit, Protection Ratio)
- **Proposed**: 4 cards balanced: (a) Total Financing Cost (red), (b) Total CF Tax Shield (green, "contingent" tag), (c) Protection Ratio, (d) Break-Even Gain Event
- **Why**: Sophisticated clients respect honesty about costs. "What does this cost?" is unanswered until section 11.

### 3. Move Charts Up (After Summary Cards) (2 of 3)
- **Current**: Charts at position 7 (after sensitivity tables)
- **Proposed**: Tax Savings + Crossover charts immediately after summary cards. Move Embedded Gain chart down to Unwind Analysis section.
- **Why**: Crossover chart ("CF exceeds embedded gains") is the visual "aha moment." Currently buried.

### 4. Promote Liquidation Comparison, Expanded by Default (Advisor + Sophisticated)
- **Current**: Collapsed at position 18, behind toggle
- **Proposed**: Position 7 (after charts), expanded by default, renamed "Why EDI? Passive vs Traditional DI vs EDI"
- **Why**: This section answers "Why should I pay for EDI instead of using Parametric?" — the core prospect question. The "EDI Upgrade Value" metric is the single most decision-relevant number.
- **Average client note**: May still be too detailed; consider a summary callout card above the table.

### 5. Merge Protection Value Summary + Strategy Cost & Protection Build (Unanimous)
- **Current**: Two separate sections (~lines 714-781 and ~1191-1298) with nearly identical data
- **Proposed**: Single "Strategy Economics" section with one year-by-year table: Financing Cost, Advisory Fee (muted), CF Protection Built, Cumulative CF, Protection Ratio, Break-Even
- **Why**: Eliminates scrolling through the same data twice. Saves ~80 lines of rendered content.

### 6. Merge 3 Realization Sections Into One (Unanimous)
- **Current**: Custom Realization Scenario, Preset Realization Scenarios, Realization Size Sensitivity — three separate sections
- **Proposed**: Single "Life Events & Realization" section: presets at top, custom builder below, sensitivity table at bottom, all sharing one year-of-event selector
- **Also**: Swap preset scenarios above custom (presets are more immediately actionable)
- **Also**: Add cost-vs-benefit callout per scenario (net value = tax saved - financing through that year)

### 7. Eliminate NIIT Section (Unanimous)
- **Current**: 4 summary cards for a $114/year detail
- **Proposed**: Single bullet in Notes & Disclosures: "$3K deduction rate excludes 3.8% NIIT (offsets ordinary income, not NII)"
- **Why**: Disproportionate screen real estate for an immaterial amount on $10M+ portfolios

### 8. Collapse Financing Detail Inputs (Unanimous)
- **Current**: 4 visible inputs (broker margin, short borrow, short dividend, computed rate)
- **Proposed**: Show only computed incremental rate by default. "Financing Details" toggle expands the component inputs.
- **Why**: 95% of meetings use defaults. Visible "short borrow rate" creates anxiety for non-sophisticated clients.

## Additional Recommendations

### From Advisor Persona
- Add one-sentence EDI framing subtitle under tab header
- Add "bottom line" callout box after summary cards
- Export should also be accessible from sticky header
- Assumptions footer summary line is redundant — remove it

### From Sophisticated Client Persona
- Move preset realization scenarios above custom scenario
- Embed Crossover chart directly in Unwind Analysis section
- No dedicated "risks" section exists — consider adding one
- Year-by-year table could be collapsed by default (charts tell the visual story)

### From Average Client Persona
- Consider a client/advisor view toggle (5 sections vs full detail)
- Replace jargon: "CF" -> "tax defense balance", "harvested" -> "generated", "embedded gain" -> "unrealized profit"
- Add dedicated "Risks & Considerations" section in plain English
- Lead with personalized scenario ("What could this save YOU?")
- Reduce visible sections from ~15 to ~5 for client-facing mode

## Proposed Section Order (Post-Changes)

| # | Section | Default State |
|---|---------|---------------|
| 1 | Sticky Header | Always visible |
| 2 | Comparison Panel (if pinned) | Conditional |
| 3 | State Warnings | Conditional |
| 4 | Assumptions (financing details collapsed) | Expanded |
| 5 | Summary Cards (4, balanced cost/benefit) | Expanded |
| 6 | Charts (Tax Savings + Crossover) | Expanded |
| 7 | Why EDI? Liquidation Comparison | Expanded |
| 8 | Life Events & Realization (merged) | Expanded |
| 9 | Strategy Economics (merged cost/protection) | Expanded |
| 10 | Year-by-Year Table | Collapsed |
| 11 | Unwind Analysis (+ Embedded Gain chart) | Expanded |
| 12 | Estate Comparison | Expanded |
| 13 | Best Strategy Per Life Event | Collapsed |
| 14 | Strategy Comparison | Collapsed |
| 15 | Tax Rate Sensitivity | Collapsed |
| 16 | How It Works | Collapsed |
| 17 | Notes & Disclosures (absorbs NIIT) | Expanded |
| 18 | Export | Expanded |

## Files to Modify

| File | Changes |
|------|---------|
| `src/components/EdiOnlyTab.tsx` | Section reordering, merges, summary card restructure, financing collapse toggle |
| `src/components/EdiOnlyTab.css` | Styling adjustments for merged sections, collapsed financing |
| `src/popupContent.ts` | Update/remove NIIT popup entries, add any new merged-section entries |

## Verification
1. `npx tsc --noEmit` — clean compile
2. `npx vitest run` — all tests pass (no logic changes)
3. Visual walkthrough: verify section order, collapsed states, merged tables
