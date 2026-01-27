---
title: "feat: Layout & Flow Improvements"
type: feat
date: 2026-01-26
status: ready
brainstorm: docs/brainstorms/2026-01-26-layout-flow-improvements-brainstorm.md
---

# Layout & Flow Improvements

## Overview

Improve the Tax Optimization Calculator's layout and navigation to make it easier for financial advisors to present to clients during live meetings and generate reports. The core changes address confusing navigation, unclear section relationships, and buried results.

**Target Users:** Financial advisors using the calculator for live client presentations and PDF report generation.

**Key Changes:**
1. Sticky header with compact metrics strip that expands on scroll
2. Results-first section ordering (4 summary cards move above inputs)
3. Section numbering for clear visual flow (Step 1, Step 2, etc.)
4. Enhanced guidance text in Client Profile and Tax Rates sections
5. Simplify strategy dropdown (remove ST/LT percentages from display)

## Problem Statement

### Current Issues

1. **Overall navigation is confusing** - The page is long (~2000px on desktop) and requires significant scrolling between inputs and results
2. **Section relationships unclear** - Hard to see how inputs flow to outputs; sections feel disconnected
3. **Results buried** - The "payoff" (Total Tax Savings) appears only after scrolling past 4 sections
4. **Sparse guidance** - Client Profile and Tax Rates lack context for advisor-client conversations

### User Impact

- Advisors lose client attention while scrolling to show results
- Clients don't understand the connection between their inputs and the calculated benefits
- Live presentations require awkward back-and-forth scrolling
- Reports lack clear narrative flow from situation to outcome

## Proposed Solution

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│  STICKY HEADER (compact by default, expands after 400px scroll) │
│  ┌─────────────┬─────────────┬─────────────────────────────────┐│
│  │ Collateral  │ QFAF Value  │ Annual Tax Savings              ││
│  │ $1,000,000  │ $450,000    │ $8,743                          ││
│  └─────────────┴─────────────┴─────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  HEADER                                                         │
│  "Tax Optimization Calculator" + "QFAF + Collateral Strategy"   │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  RESULTS SUMMARY (NEW POSITION) - Step 1: Your Projected Benefit│
│  ┌───────────────┬───────────────┬───────────────┬─────────────┐│
│  │ Total Tax     │ Final         │ Annualized    │ Total NOL   ││
│  │ Savings       │ Portfolio     │ Tax Alpha     │ Generated   ││
│  │ $87,432       │ $1,967,151    │ 0.87%         │ $45,000     ││
│  │ (primary)     │               │               │             ││
│  └───────────────┴───────────────┴───────────────┴─────────────┘│
│  "Based on inputs below. Adjust to see updated projections."    │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  CLIENT PROFILE - Step 2: Your Situation                        │
│  "Tell us about your client's investment and tax profile"       │
│  [Strategy] [Collateral] [Income] [Filing Status] [State]       │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  MARGINAL TAX RATES - Step 3: Tax Rate Analysis                 │
│  "These rates determine the value of each tax event"            │
│  [Federal ST] [Federal LT] [State] [Combined ST] [Combined LT]  │
│  [ST→LT Benefit]                                                │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  STRATEGY SIZING - Step 4: Optimized Strategy                   │
│  "How we balance your positions to maximize tax efficiency"     │
│  [Collateral] [Auto-Sized QFAF] [Total Exposure] [§461(l)]      │
│  [Offset Status details...]                                     │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  ADVANCED SETTINGS (collapsed) + ADVANCED MODE (toggle)         │
│  [Existing carryforwards] [Year-by-Year] [Sensitivity] [etc.]   │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  DETAILED RESULTS - Step 5: Year-by-Year Breakdown              │
│  [Tax Benefits Chart] [Results Table] [Portfolio Value Chart]   │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  ACTIONS + DISCLAIMER                                           │
└─────────────────────────────────────────────────────────────────┘
```

### Component Changes

#### 1. New Component: `StickyHeader.tsx`

```typescript
// src/components/StickyHeader.tsx
interface StickyHeaderProps {
  collateral: number;
  qfafValue: number;
  annualTaxSavings: number;
  isExpanded: boolean;
}
```

**Behavior:**
- Uses CSS `position: sticky` with `top: 0`
- Compact state (default): Single row, ~48px height, subtle background
- Expanded state (after scroll): ~80px height, adds explanatory subtext
- Transition: 200ms ease-out on all properties
- Mobile (< 768px): Always compact, no expansion

#### 2. New Hook: `useScrollHeader.ts`

```typescript
// src/hooks/useScrollHeader.ts
export function useScrollHeader(threshold = 400) {
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => setIsExpanded(!entry.isIntersecting),
      { threshold: 0, rootMargin: '-400px 0px 0px 0px' }
    );
    // Observe sentinel element at top of Client Profile section
    const sentinel = document.getElementById('scroll-sentinel');
    if (sentinel) observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  return { isExpanded };
}
```

#### 3. Modified: `Calculator.tsx`

- Add scroll sentinel element after header
- Reorder sections: Results Summary → Client Profile → Tax Rates → Sizing → Advanced → Detailed Results
- Add `StickyHeader` component at top
- Add section numbering to each `<section>`
- Simplify strategy dropdown to show only name and label (remove ST/LT percentages)

#### 4. Modified: `index.css`

- Add `.sticky-header` styles with compact/expanded states
- Add `.section-number` styles (Step 1, Step 2, etc.)
- Add `.section-guidance` styles for contextual help text
- Update print styles to handle new structure
- Add `prefers-reduced-motion` media query for animations

## Technical Approach

### Sticky Header Implementation

**Why CSS `position: sticky` over JavaScript:**
- Native browser support (97%+ on caniuse)
- No scroll event listeners = better performance
- Smooth, jank-free scrolling
- Works automatically with browser's compositor

**Why IntersectionObserver over scroll listener:**
- More performant (browser-optimized)
- Cleaner API for detecting threshold crossing
- No need for throttling/debouncing

**Z-index hierarchy:**
```css
/* Establish layering */
:root {
  --z-base: auto;
  --z-sticky: 100;
  --z-popup-overlay: 999;
  --z-popup: 1000;
}
```

### Section Numbering

```css
.section-number {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--primary);
  margin-bottom: 0.25rem;
}

.section-number::before {
  content: attr(data-step);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.5rem;
  height: 1.5rem;
  border-radius: 50%;
  background: var(--primary);
  color: white;
  font-size: 0.75rem;
}
```

### Guidance Text Content

**Results Summary:**
> "Based on inputs below. Adjust values to see updated projections."

**Client Profile (Step 2):**
> "Tell us about your client's investment and tax profile. These inputs determine the strategy sizing and tax impact."

**Tax Rates (Step 3):**
> "These marginal rates determine the value of each tax event. Higher ST→LT benefit means more savings from the strategy."

**Strategy Sizing (Step 4):**
> "We auto-size the QFAF to offset short-term gains, maximizing your tax efficiency within IRS limits."

**Detailed Results (Step 5):**
> "Year-by-year breakdown showing how tax benefits compound over the 10-year projection."

## Acceptance Criteria

### Functional Requirements

- [x] Sticky header appears at top of viewport when page loads
- [x] Sticky header displays: Collateral, QFAF Value, Annual Tax Savings (Year 1)
- [x] Sticky header transitions from compact to expanded after scrolling ~400px (past Client Profile)
- [x] Sticky header values update in real-time as user changes inputs
- [x] Results Summary section (4 cards) appears above Client Profile inputs
- [x] Each section displays step number (Step 1 through Step 5)
- [x] Each section displays guidance text below the header
- [x] Section order matches the architecture diagram above
- [x] Strategy dropdown shows simplified labels (e.g., "Core 145-45 - Aggressive" without ST/LT percentages)
- [x] All existing functionality continues to work (calculations, Advanced Mode, print)

### Non-Functional Requirements

- [x] Sticky header transition completes in ≤200ms
- [x] No layout shift (CLS) when sticky header state changes
- [ ] Scrolling remains smooth (60fps) on mobile devices
- [ ] Works in Chrome, Firefox, Safari, Edge (last 2 versions)
- [x] Print output shows logical flow (results, then methodology)

### Accessibility Standards

- [x] Sticky header has `role="banner"` or appropriate landmark
- [x] Sticky header values have `aria-live="polite"` for screen reader updates
- [x] Animation respects `prefers-reduced-motion: reduce`
- [x] Tab order follows visual order (Results → Inputs → ... → Detailed)
- [ ] Color contrast meets WCAG AA (4.5:1 for text)

### Quality Gates

- [x] TypeScript compiles without errors
- [ ] No console warnings or errors
- [ ] Responsive at 320px, 768px, 1024px, 1440px widths
- [ ] Print preview shows correct layout

## Alternative Approaches Considered

### 1. Two-Column Dashboard Layout

**Description:** Split page into inputs (left 40%) and results (right 60%) on desktop.

**Why rejected:**
- Significant redesign of existing layout
- Mobile experience requires completely different approach
- Print layout becomes complex
- Higher implementation effort for marginal benefit over sticky header

### 2. Tabbed Interface

**Description:** Separate tabs for "Profile", "Analysis", "Results"

**Why rejected:**
- Hides relationships between sections
- More clicks to see everything
- Loses the "adjust and see" immediacy
- Not suitable for live presentations where you want everything visible

### 3. Floating Action Button with Summary

**Description:** Small FAB in corner that expands to show key metrics

**Why rejected:**
- Less discoverable than sticky header
- Requires additional click/tap to see metrics
- Mobile FAB positioning is problematic
- Doesn't solve the results-buried problem

### 4. Scroll-to-Results Button

**Description:** Fixed button that scrolls to results section

**Why rejected:**
- Still requires scrolling back to inputs
- Doesn't improve the narrative flow
- Doesn't help with live presentations

## Risk Analysis & Mitigation

### Risk 1: Performance Degradation on Mobile

**Likelihood:** Medium
**Impact:** High (poor UX for mobile users)

**Mitigation:**
- Use CSS `position: sticky` (hardware-accelerated)
- Use IntersectionObserver instead of scroll listeners
- Test on low-end Android devices during development
- Add `will-change: transform` for animated elements

### Risk 2: Print Layout Breaks

**Likelihood:** Medium
**Impact:** Medium (report generation is key use case)

**Mitigation:**
- Update print styles in same PR as layout changes
- Test print preview in Chrome, Safari, Firefox
- Add print-specific section ordering if needed
- Hide sticky header entirely in print mode

### Risk 3: Confusion with Results Before Inputs

**Likelihood:** Low
**Impact:** Medium (could confuse new users)

**Mitigation:**
- Add clear guidance text: "Based on inputs below"
- Keep results visually connected to inputs (no large gap)
- Consider subtle "↓ Adjust inputs below" indicator
- Monitor user feedback after launch

### Risk 4: z-index Conflicts with Popups

**Likelihood:** Low
**Impact:** Low (visual glitch, not functional)

**Mitigation:**
- Establish clear z-index hierarchy in CSS variables
- Test all popup interactions with sticky header visible
- Ensure popup overlay covers sticky header

### Risk 5: Browser Compatibility Issues

**Likelihood:** Low
**Impact:** Medium

**Mitigation:**
- `position: sticky` has 97%+ support
- IntersectionObserver has 96%+ support
- Add fallback for unsupported browsers (static header)
- Test in BrowserStack across target browsers

## Implementation Phases

### Phase 1: Sticky Header (Foundation)

**Scope:**
- Create `useScrollHeader` hook with IntersectionObserver
- Create `StickyHeader` component with compact state
- Add scroll sentinel element to Calculator
- Add CSS for sticky positioning and compact state
- Test on desktop and mobile

**Files changed:**
- `src/hooks/useScrollHeader.ts` (new)
- `src/components/StickyHeader.tsx` (new)
- `src/Calculator.tsx` (add sticky header + sentinel)
- `src/index.css` (sticky header styles)

**Acceptance:**
- [ ] Sticky header visible and updates with input changes
- [ ] Compact state displays correctly
- [ ] Works on mobile (always compact)

### Phase 2: Expanded Header State

**Scope:**
- Add expanded state styles
- Implement IntersectionObserver threshold detection
- Add smooth transition animation
- Add `prefers-reduced-motion` support

**Files changed:**
- `src/hooks/useScrollHeader.ts` (add threshold logic)
- `src/components/StickyHeader.tsx` (add expanded state)
- `src/index.css` (expanded styles, transitions, reduced-motion)

**Acceptance:**
- [ ] Header expands after scrolling past inputs
- [ ] Smooth 200ms transition
- [ ] Respects reduced-motion preference
- [ ] No layout shift during transition

### Phase 3: Results-First Ordering

**Scope:**
- Move Results Summary section above Client Profile
- Extract summary cards into separate component
- Add guidance text to Results Summary
- Update print styles

**Files changed:**
- `src/Calculator.tsx` (reorder sections)
- `src/components/ResultsSummary.tsx` (new, extracted from Calculator)
- `src/index.css` (results summary styles, print updates)

**Acceptance:**
- [ ] 4 summary cards appear above inputs
- [ ] Guidance text displays correctly
- [ ] Print output shows results at top
- [ ] Existing results section still shows charts/table

### Phase 4: Section Numbering, Guidance & UI Cleanup

**Scope:**
- Add step numbers to all main sections
- Add guidance text to each section
- Style section headers consistently
- Simplify strategy dropdown labels (remove ST/LT percentages)

**Files changed:**
- `src/Calculator.tsx` (add section numbers + guidance, simplify dropdown)
- `src/index.css` (section number styles, guidance text styles)

**Acceptance:**
- [ ] Steps 1-5 display on each section
- [ ] Guidance text appears below each section header
- [ ] Styling is consistent and professional
- [ ] Mobile responsive
- [ ] Strategy dropdown shows clean labels without technical percentages

### Phase 5: Polish & Testing

**Scope:**
- Cross-browser testing
- Mobile device testing
- Print testing
- Accessibility audit
- Performance profiling

**Acceptance:**
- [ ] All acceptance criteria pass
- [ ] No console errors
- [ ] Lighthouse accessibility score ≥ 90
- [ ] Print preview correct in all browsers

## Resource Requirements

**Developer:** 1 frontend developer familiar with React/TypeScript

**Testing:**
- Chrome, Firefox, Safari, Edge (desktop)
- iOS Safari, Chrome Android (mobile)
- Print preview in all browsers

**Design:**
- No new mockups required (changes are incremental)
- May need feedback on guidance text copy

## Future Considerations

### Potential Enhancements (Not in Scope)

1. **Sticky header customization** - Let users choose which metrics to display
2. **Section collapse/expand** - Allow collapsing sections user has reviewed
3. **Guided tour mode** - Step-by-step walkthrough for new users
4. **Scroll progress indicator** - Show how far through the calculator user is
5. **Quick-jump navigation** - Click step numbers to scroll to sections

### Extensibility Points

- `useScrollHeader` hook can be extended with multiple thresholds
- Section numbering can be made dynamic (skip Advanced Mode sections)
- Guidance text could be loaded from a content file for easy updates

## Documentation Plan

- [ ] Update any internal docs about calculator structure
- [ ] Add inline code comments for new hooks/components
- [ ] No external documentation changes needed (user-facing behavior improved, not changed)

## References & Research

### Internal References

- Brainstorm: `docs/brainstorms/2026-01-26-layout-flow-improvements-brainstorm.md`
- Calculator component: `src/Calculator.tsx`
- CSS styles: `src/index.css`
- Advanced Mode hook pattern: `src/hooks/useAdvancedMode.ts`
- Existing popups: `src/InfoPopup.tsx`

### External References

- CSS `position: sticky`: https://developer.mozilla.org/en-US/docs/Web/CSS/position#sticky
- IntersectionObserver: https://developer.mozilla.org/en-US/docs/Web/API/Intersection_Observer_API
- `prefers-reduced-motion`: https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion

### Related Work

- Previous plan: `docs/plans/2026-01-26-feat-calculator-enhancements-plan.md` (Advanced Mode implementation)

---

## Open Items (Deferred)

### Bug: Carry Forward Loss Not Used in Subsequent Years

**Reported:** User noticed carry forward losses may not be applied correctly in year 2+.

**Status:** Deferred to separate investigation/fix task.

**Location:** `src/calculations.ts`

**Action:** Create separate bug investigation task after this plan is approved.
