---
title: "feat: UI Review & Improvements"
type: feat
date: 2026-01-29
---

# UI Review & Improvements

## Overview

Comprehensive UI overhaul of the Tax Optimization Calculator based on a detailed design review. Covers visual polish, layout restructuring, dark mode, responsive improvements, accessibility compliance, and new features (Excel export, onboarding wizard, input validation).

## Problem Statement / Motivation

The calculator is functionally complete but has visual and UX gaps: inconsistent card styling, no dark mode, limited mobile/tablet support (single 768px breakpoint), WCAG color contrast failures in the sticky header, no input validation, and no export options beyond browser print. First-time users have no guided onboarding.

## Proposed Solution

Implement changes in 4 phases, ordered by dependency and risk:

1. **Foundation** — Dark mode infrastructure, CSS variable cleanup, consistent card system, tablet breakpoint
2. **Visual Polish** — Section-specific layout improvements, animations, hero metric, timeline connector
3. **Interactivity** — Input validation, onboarding wizard, reset button, loading states
4. **Export & Advanced** — Excel export, sticky print/export bar, accordion icons/previews

---

## Phase 1: Foundation

### 1.1 Dark Mode Implementation

**Files:** `src/index.css`, `src/Calculator.tsx`, `src/components/StickyHeader.tsx`, `src/WealthChart.tsx`

- Add `[data-theme="dark"]` CSS variable overrides for all `--var` properties
  ```css
  [data-theme="dark"] {
    --text: #f3f4f6;
    --text-light: #9ca3af;
    --bg: #111827;
    --card-bg: #1f2937;
    --border: #374151;
    --shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
  }
  ```
- Audit and replace all hardcoded hex colors in `index.css` with CSS variables (target: zero hardcoded colors outside `:root`)
- Refactor chart colors in `WealthChart.tsx` to read from CSS variables or a theme context. Currently hardcoded: `stroke="#16a34a"`, `fill="#16a34a"`, `stroke="#7c3aed"`, `stroke="#f59e0b"`, etc.
- Add dark mode toggle component in the header tab bar area
- Add tooltip on hover: "Switch to dark mode" / "Switch to light mode"
- Persist preference to `localStorage` key `taxCalc_theme`
- Respect `prefers-color-scheme` as default when no saved preference exists
- Ensure `@media print` forces light theme regardless of active mode

**Acceptance Criteria:**
- [x] All page elements render correctly in both light and dark modes
- [x] Charts use theme-aware colors (readable on dark backgrounds)
- [x] Toggle persists across page reloads
- [x] Print always outputs light theme
- [x] `prefers-reduced-motion` respected for toggle transition

### 1.2 Consistent Card System

**Files:** `src/index.css`

- Define a base `.card` class with unified: `border-radius: 12px`, `box-shadow: var(--shadow)`, `padding: 1.5rem`, `background: var(--card-bg)`, `border: 1px solid var(--border)`
- Migrate existing card variants to extend the base: `.summary-cards .card`, `.sizing-card`, `.benefit-card`, `.tax-rate-item`, `.results-card`
- Allow accent color overrides via modifier classes (`.card--primary`, `.card--success`, `.card--warning`)
- Ensure dark mode compatibility for all card variants

**Acceptance Criteria:**
- [x] All cards share consistent border-radius, shadow, padding
- [x] Accent colors work in both themes
- [x] No visual regressions in existing card layouts

### 1.3 Tablet Breakpoint

**Files:** `src/index.css`

- Add `@media (max-width: 1024px)` breakpoint for tablet
- Key tablet adjustments:
  - Tax rate cards (Section 5): 3x2 grid instead of 6x1
  - Summary cards: 2x2 grid
  - Sizing cards: 2x2 grid
  - Chart height: reduce from 350px to 300px
  - Side-by-side layouts collapse to stacked where needed
- Keep existing 768px breakpoint for mobile

**Acceptance Criteria:**
- [x] Tax rate cards display in 3x2 grid on tablets (769px-1024px)
- [x] No horizontal overflow on any section at tablet width
- [x] Charts resize appropriately

### 1.4 WCAG Color Contrast Audit

**Files:** `src/index.css`

- Fix sticky header labels: `--text-light: #6b7280` at `0.7rem` fails WCAG AA. Change to `#4b5563` (gray-600) or increase font size to 14px+
- Audit all `--text-light` usage in small text contexts
- Verify green savings colors (`#16a34a`) against both light and dark backgrounds
- Verify chart legend text contrast
- Add `:focus-visible` outlines on all interactive elements (buttons, toggles, links) for keyboard navigation

**Acceptance Criteria:**
- [x] All text meets WCAG AA contrast ratio (4.5:1 normal text, 3:1 large text)
- [x] Focus indicators visible on all interactive elements
- [x] Tested at both light and dark themes

---

## Phase 2: Visual Polish

### 2.1 Client Profile Input Sub-Cards

**Files:** `src/Calculator.tsx`, `src/index.css`

- Extract the inline input form (currently in `Calculator.tsx` ~lines 410-550) into a new component `src/components/ClientProfileInputs.tsx`
- Group inputs into 3 visual sub-cards:
  - **Strategy Selection**: Strategy dropdown, QFAF toggle
  - **Financial Profile**: Collateral amount, Annual income
  - **Tax Profile**: Filing status, State, conditional state rate
- Each sub-card gets a subtle header label and the unified `.card` base style
- Restyle "Edit Rates by Year" as an outlined secondary button (`.btn--outline`)
- Improve toggle alignment: vertical stack on mobile, horizontal with consistent spacing on desktop
- Add contextual tooltips (using existing `InfoPopup` component) to slider labels explaining each parameter
- Move "Advanced Options" inline button to bottom of inputs section

**Acceptance Criteria:**
- [x] Inputs visually grouped into 3 sub-cards
- [x] Sub-cards stack on mobile, 2-column or 3-column on desktop
- [x] All sliders have tooltip help
- [x] "Edit Rates" button styled as outlined secondary
- [x] No change to calculation logic

### 2.2 Sticky Summary Bar Enhancements

**Files:** `src/components/StickyHeader.tsx`, `src/index.css`

- Add hover state on metric items (subtle background highlight, cursor pointer if they link to sections)
- Add value change animation: flash highlight + number transition when values update
  - Track previous values via `useRef`
  - Apply `.value-changed` CSS class with `animation: flash 0.6s ease` on change
  - Respect `prefers-reduced-motion`: no animation if reduced motion preferred
- Ensure WCAG contrast on all label text (addressed in Phase 1.4)

**Acceptance Criteria:**
- [x] Hover state visible on metric cards
- [x] Values flash/highlight when they change
- [x] Animation disabled when `prefers-reduced-motion` is active
- [x] `aria-live="polite"` maintained for screen readers

### 2.3 Tax Rate Card Improvements (Section 5)

**Files:** `src/components/TaxRatesDisplay.tsx`, `src/index.css`

- Add subtle background shading to white/uncolored cards to unify the row visually
- Remove underlines from labels that are not clickable (misleading affordance)
- Responsive: 3x2 grid on tablet (via Phase 1.3), 2x3 on mobile

**Acceptance Criteria:**
- [x] All 6 cards have consistent visual weight
- [x] No misleading clickable styling on non-interactive labels

### 2.4 Strategy Sizing Improvements (Section 6)

**Files:** `src/Calculator.tsx` (sizing section), `src/index.css`

- Add zebra striping to the breakdown table rows
- Color code NOL value with green (positive) to match savings color scheme
- Ensure "Total Exposure" blue card uses the `.card--primary` accent variant

**Acceptance Criteria:**
- [x] Table rows alternate background colors
- [x] Positive NOL values display in green
- [x] Total Exposure card visually prominent

### 2.5 Year 1 / Year 2+ Timeline Connector

**Files:** `src/Calculator.tsx` (tax benefit sections ~lines 554-710), `src/index.css`

- Add a visual timeline/connector element between Year 1 and Year 2+ benefit sections
- Design: vertical line with dot markers, step labels ("Year 1", "Year 2+", "Cumulative")
- Handle conditional rendering: when Year 2+ is hidden (QFAF disabled), show only Year 1 dot with no connector
- Use CSS-only implementation (no JS dependency)

**Acceptance Criteria:**
- [x] Visual connector shows between Year 1 and Year 2+ when both visible
- [x] Graceful display when only Year 1 is shown
- [x] Works in both light and dark themes
- [x] Does not break print layout

### 2.6 Results Section Hero Metric

**Files:** `src/components/ResultsSummary.tsx`, `src/index.css`

- Make the total savings metric card larger: bigger font size, centered, with subtle box-shadow glow
- Style "What this means:" text block as a light callout box (`.callout-box` with left border accent and background tint)
- Move "Note:" disclaimer text to the consolidated disclaimer section at page bottom

**Acceptance Criteria:**
- [x] Hero metric is visually dominant in the results section
- [x] Callout box is visually distinct but not overpowering
- [x] Disclaimer text consolidated at bottom

### 2.7 Main Title Enhancement

**Files:** `src/Calculator.tsx`, `src/index.css`

- Add a brief one-line description below the subtitle for first-time users
- Example: "Model tax-loss harvesting strategies with QFAF overlays and collateral optimization"
- Style as subdued text (`--text-light`, smaller font)

**Acceptance Criteria:**
- [x] Description visible below title
- [x] Does not clutter the header area
- [x] Hidden in print (optional, per print stylesheet)

### 2.8 Section Numbering Fix

**Files:** `src/Calculator.tsx`

- Ensure consistent sequential numbering across all sections: 1 (Results), 2 (Inputs), 3 (Tax Rates), 4 (Strategy Sizing), 5 (Year-by-Year)
- Audit `data-step` attributes and visible step labels for consistency

**Acceptance Criteria:**
- [x] Sequential numbering with no gaps or duplicates

### 2.9 Chart Legend Repositioning

**Files:** `src/WealthChart.tsx`

- Move Recharts `<Legend>` to top of chart (`verticalAlign="top"`) on desktop
- On mobile (via responsive container or media query), keep legend below chart
- Improve tooltip formatting for clarity (exact values with currency formatting)

**Acceptance Criteria:**
- [x] Legend above chart on desktop, below on mobile
- [x] Tooltips show formatted currency values

---

## Phase 3: Interactivity

### 3.1 Real-Time Input Validation

**Files:** `src/Calculator.tsx` (or new `ClientProfileInputs.tsx`), `src/index.css`

- Define validation rules:
  - Collateral amount: min $100,000, max $100,000,000, required
  - Annual income: min $0, max $100,000,000, required
  - State rate (when "OTHER"): 0-15%
  - All numeric fields: no negative values
- Show inline validation feedback:
  - Red border on invalid fields
  - Error message text below field
  - Validation fires on blur and on submit (not on every keystroke to avoid noise)
- Do not block calculation — show warning state, calculate with whatever value is entered

**Acceptance Criteria:**
- [x] Invalid fields show red border + error message
- [x] Validation runs on blur
- [x] Calculator still computes (warning, not blocking)
- [x] Works in both themes

### 3.2 Onboarding Wizard (Lightweight Overlay)

**Files:** New `src/components/OnboardingTour.tsx`, `src/index.css`

- Implement a step-by-step tooltip tour for first-time users (no external library — custom implementation to preserve single-file build)
- Steps:
  1. Point to Results Summary: "Your projected tax savings appear here"
  2. Point to Strategy selector: "Choose your strategy type"
  3. Point to QFAF toggle: "Enable QFAF overlay for additional benefits"
  4. Point to Collateral input: "Enter your collateral amount"
  5. Point to Advanced Settings button: "Access advanced modeling tools here"
- Show on first visit (check `localStorage` key `taxCalc_tourCompleted`)
- "Skip Tour" and "Next" buttons on each tooltip
- Dim/overlay background behind the highlighted element
- Respect `prefers-reduced-motion` for transitions

**Acceptance Criteria:**
- [x] Tour shows on first visit only
- [x] Each step highlights the correct element with tooltip
- [x] "Skip" dismisses and sets `localStorage` flag
- [x] Completing all steps sets `localStorage` flag
- [x] Works on mobile (tooltips reposition)
- [x] Does not interfere with QualifiedPurchaserModal (tour starts after QP acknowledgment)

### 3.3 Reset to Defaults Button

**Files:** `src/Calculator.tsx` (or `ClientProfileInputs.tsx`), `src/index.css`

- Add "Reset to Defaults" button at the bottom of the inputs section
- Styled as a subtle text/link button (not prominent)
- Resets: `inputs`, `yearOverrides`, `advancedSettings`, `sensitivityParams`, `comparisonStrategies`
- Does NOT reset: QP acknowledgment, tour completion, theme preference
- Show confirmation dialog before resetting: "Reset all inputs to defaults? This cannot be undone."

**Acceptance Criteria:**
- [x] Confirmation dialog appears before reset
- [x] All input state returns to defaults
- [x] Persistent flags (QP, tour, theme) unaffected
- [x] Button is not visually prominent (prevents accidental clicks)

### 3.4 Loading States

**Files:** `src/Calculator.tsx`, `src/index.css`

- Charts already have loading fallbacks via `React.lazy` + `Suspense` — no changes needed there
- Add subtle transition effect when calculation results update (opacity fade or skeleton pulse on result cards during recalculation)
- Use `useTransition` from React 19 to defer expensive recalculations if needed
- Ensure `aria-busy="true"` on sections during updates for accessibility

**Acceptance Criteria:**
- [x] Visual feedback when results are recalculating
- [x] No layout shift during loading states
- [x] Accessible loading indicators

---

## Phase 4: Export & Advanced

### 4.1 Excel Export

**Files:** New `src/utils/excelExport.ts`, `src/Calculator.tsx`, `package.json`

- Install SheetJS (`xlsx` package) — note: ~300KB bundle increase
- Export function generates `.xlsx` with sheets:
  - **Summary**: Strategy, collateral, QFAF value, Year 1 savings, Year 2+ savings, total 10-year savings
  - **Year-by-Year**: Full breakdown table (all columns, all years)
  - **Assumptions**: Tax rates, filing status, state, strategy parameters
  - **Disclaimer**: Full disclaimer text
- Add "Export to Excel" button next to the Print button
- Lazy-load the SheetJS library to minimize initial bundle impact

**Acceptance Criteria:**
- [x] `.xlsx` file downloads with correct data
- [x] All 4 sheets populated
- [x] Numbers formatted as currency/percentage in Excel
- [x] Lazy-loaded (not in initial bundle)
- [x] Works in both themes (export is data, not visual)

### 4.2 Sticky Print/Export Bar

**Files:** `src/Calculator.tsx` (or new `src/components/ExportBar.tsx`), `src/index.css`

- Replace the bottom-of-page print button with a sticky export bar
- Position: fixed bottom of viewport, appears when user scrolls past the Results section
- Contains: "Print / Save as PDF" button + "Export to Excel" button
- Auto-hides when user scrolls back to top (same IntersectionObserver pattern as sticky header)
- On mobile: compact bar with icon-only buttons + labels on tap

**Acceptance Criteria:**
- [x] Bar appears on scroll past results
- [x] Both print and Excel export buttons functional
- [x] Does not overlap with other sticky elements
- [x] Responsive on mobile

### 4.3 Advanced Accordion Improvements

**Files:** `src/AdvancedMode/CollapsibleSection.tsx`, `src/index.css`

- Add unique SVG icons per section using existing `Icons.tsx` pattern:
  - Year-by-Year Planning: calendar icon
  - Sensitivity Analysis: chart/sliders icon
  - Scenario Analysis: layers/compare icon
  - Strategy Comparison: scale/balance icon
  - Settings: gear icon
- Add collapsed preview text below each accordion header showing key parameter summary when section is collapsed
  - Example: "Sensitivity: Growth ±2%, Loss ±5%"

**Acceptance Criteria:**
- [x] Each accordion has a unique descriptive icon
- [x] Collapsed sections show parameter preview text
- [x] Icons work in both light and dark themes

### 4.4 Methodology & Disclosures Improvements

**Files:** `src/Calculator.tsx` (disclaimer section), `src/index.css`

- Consolidate all disclaimer text (from Results "Note:" and other scattered notices) into the bottom Methodology section
- Make the entire section collapsible by default (expanded on click)
- Change from 4-column to 2-column layout for readability
- On mobile: single column

**Acceptance Criteria:**
- [x] All disclaimers consolidated in one location
- [x] Section collapsed by default
- [x] 2-column desktop, 1-column mobile
- [x] Print shows fully expanded

---

## Technical Considerations

### Architecture Impacts
- Extracting `ClientProfileInputs.tsx` from `Calculator.tsx` reduces the main component from ~954 to ~700 lines
- Dark mode adds a theme context or `data-theme` attribute management
- SheetJS adds ~300KB to the bundle but can be lazy-loaded
- Onboarding tour is self-contained with no external dependencies
- Single-file build (`vite-plugin-singlefile`) remains viable but bundle size increases; monitor total output size

### Performance Implications
- Value change animations use CSS transitions (GPU-accelerated, no JS animation frames)
- Lazy-loading SheetJS means Excel export has a first-use delay
- `useTransition` for loading states is zero-cost when calculations are fast
- No new network requests (all client-side)

### Known Conflict: Year Overrides + Sensitivity Mutual Exclusivity
- `Calculator.tsx:119-137` shows these are mutually exclusive (overrides take priority)
- **Recommendation**: Add a visible warning in the Advanced Modal when both are configured: "Year-by-year overrides take priority over sensitivity parameters when both are active"
- This is a UX fix, not a calculation change — include in Phase 3

### Print Stylesheet Updates
- Dark mode: force light theme in `@media print`
- Tabbed content: N/A (no tabs being added)
- Collapsible disclaimers: force expanded in print
- Sticky export bar: hidden in print
- Onboarding tour: hidden in print

---

## Dependencies & Risks

| Risk | Mitigation |
|------|-----------|
| Dark mode chart colors require JSX refactoring in `WealthChart.tsx` | Use a theme-aware color hook or CSS variable injection; test both themes |
| SheetJS bundle size (~300KB) inflates single-file build | Lazy-load via `React.lazy` or dynamic import; consider if single-file constraint should be revisited |
| Onboarding tour positioning on different screen sizes | Use `getBoundingClientRect()` for tooltip positioning; test at 375px, 768px, 1024px, 1440px |
| WCAG audit may surface more issues than identified | Budget for additional contrast fixes in Phase 1.4 |
| CSS variable migration may cause regressions in existing styles | Phase 1 is foundational — thorough visual regression testing required before proceeding |

---

## References & Research

### Internal References
- Main calculator component: `src/Calculator.tsx` (954 lines, all state management)
- CSS file: `src/index.css` (3,381 lines, single global stylesheet)
- Chart components: `src/WealthChart.tsx` (hardcoded colors at lines 49-53, 137-142)
- Sticky header: `src/components/StickyHeader.tsx` (IntersectionObserver pattern)
- Advanced modal: `src/components/AdvancedModal.tsx` (slide-out panel)
- Existing icons: `src/components/Icons.tsx`
- Architecture doc: `ARCHITECTURE.md`

### External References
- SheetJS (xlsx): https://docs.sheetjs.com/
- WCAG 2.1 Contrast Requirements: https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum.html
- React 19 `useTransition`: https://react.dev/reference/react/useTransition
- CSS `prefers-color-scheme`: https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-color-scheme
- CSS `prefers-reduced-motion`: https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion
