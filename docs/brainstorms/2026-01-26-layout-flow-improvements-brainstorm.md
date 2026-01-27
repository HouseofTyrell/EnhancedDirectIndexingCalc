# Layout & Flow Improvements Brainstorm

**Date:** 2026-01-26
**Status:** Design validated
**Type:** Improvement

## What We're Building

A set of layout and navigation improvements to make the Tax Optimization Calculator easier to follow for financial advisors during live client presentations and report generation.

### Core Problems Identified

1. **Overall navigation is confusing** - The page is long and requires significant scrolling
2. **Section relationships unclear** - Hard to see how inputs flow to outputs
3. **Results buried** - The "payoff" (tax savings) comes too late in the flow
4. **Sparse guidance** - Client Profile and Tax Rates sections lack helpful context

### Target Users

Financial advisors who use the calculator:
- **Live presentations** - Screen-sharing or showing to clients in meetings
- **Report generation** - Preparing PDFs or printouts before client meetings

## Why This Approach

### 1. Sticky Header with Progressive Disclosure

**Design:** A compact metrics strip that expands on scroll.

**Compact state (default):**
- Subtle row showing: Collateral | QFAF | Annual Tax Savings
- Always visible at top, minimal footprint

**Expanded state (after scrolling):**
- Reveals additional context and explanation for the key metrics
- Triggered when user scrolls past the input section

**Why this approach:**
- Advisors always see the "bottom line" while adjusting inputs
- Minimal layout disruption to existing design
- Works well for both live demos (quick reference) and reports (context preserved)

### 2. Results-First Section Ordering

**Current order:**
1. Header
2. Client Profile (inputs)
3. Marginal Tax Rates
4. Strategy Sizing
5. Advanced Settings
6. Advanced Mode
7. Results (summary cards, charts, table)
8. Print/Disclaimer

**Proposed order:**
1. Header + Sticky Summary Bar
2. Key Results Summary (Total Tax Savings, Tax Alpha, Final Value)
3. Client Profile (inputs)
4. Marginal Tax Rates
5. Strategy Sizing
6. Advanced Settings / Advanced Mode
7. Detailed Results (charts, table)
8. Print/Disclaimer

**Why this approach:**
- Lead with the benefit - hook client interest immediately
- Inputs become "adjustments" to an already-visible outcome
- Detailed breakdowns remain accessible for those who want to dig deeper

### 3. Enhanced Section Context

**Client Profile improvements:**
- Add brief guidance text explaining what each input affects
- Consider grouping related inputs (Strategy + Collateral vs. Tax Profile)

**Tax Rates improvements:**
- Add explanatory subtext showing why these rates matter
- Visual connection to show: "These rates × your strategy = these savings"

### 4. Visual Flow Indicators

**Goal:** Make section relationships clear (inputs → calculations → results)

**Options to explore:**
- Subtle connecting lines or arrows between sections
- Color-coded "flow" showing input sections vs. output sections
- Section numbering (Step 1, 2, 3) for guided experience
- Summary sentences between sections explaining the connection

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Navigation approach | Sticky header | Minimal changes, immediate feedback, works for both use cases |
| Header behavior | Compact → Expands on scroll | Progressive disclosure, doesn't overwhelm initially |
| Sticky metrics | Collateral, QFAF, Annual Tax Savings | Core numbers advisors reference constantly |
| Section order | Results higher up | Lead with benefit, makes inputs feel like adjustments |
| Density fixes | More context in Profile & Tax Rates | Currently too sparse for advisor explanations |

## Open Questions

1. **Sticky header implementation details:**
   - Exact scroll threshold for expansion?
   - Animation/transition style?
   - Mobile behavior (always compact or also expandable)?

2. **Results-first ordering:**
   - Should ALL results cards move up, or just the headline "Total Tax Savings"?
   - How to handle the detailed table/charts - keep at bottom?

3. **Visual flow:**
   - Which approach (lines, colors, numbers, sentences)?
   - Risk of making it look "wizardy" vs. professional?

4. **Bug - Carry forward loss calculation:**
   - User reported: "I don't think the carry forward loss is being used in subsequent years"
   - **Action:** Investigate calculation logic in `calculations.ts` separately
   - This is a functionality bug, not a layout issue - defer to separate task

## Next Steps

1. Run `/workflows:plan` to create detailed implementation plan
2. Investigate carry forward bug separately (create issue or task)
