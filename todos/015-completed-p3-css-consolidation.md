---
status: completed
priority: p3
issue_id: "015"
tags: [code-review, cleanup, css]
dependencies: []
---

# CSS Consolidation - Duplicate Card Styles

## Problem Statement

Multiple card-style components (`.sizing-card`, `.tax-rate-item`, `.benefit-card`, `.card`) have nearly identical CSS that could be consolidated.

## Findings

**Current duplicate patterns (150+ lines):**

```css
/* Four separate card styles with similar properties */
.sizing-card {
  display: flex;
  flex-direction: column;
  background: white;
  border-radius: 8px;
  padding: 1rem;
  text-align: center;
}

.tax-rate-item {
  display: flex;
  flex-direction: column;
  background: white;
  border-radius: 6px;
  padding: 0.75rem;
  text-align: center;
}

.benefit-card {
  background: var(--bg);
  border-radius: 8px;
  padding: 1rem;
  display: flex;
  flex-direction: column;
}

.card {
  background: var(--bg);
  border-radius: 8px;
  padding: 1.5rem;
  text-align: center;
}
```

**Other duplication areas:**
- Table styles repeated for `.year-table`, `.comparison-table`, base `table`
- Action button styles repeated for `.year-actions`, `.sensitivity-actions`, `.settings-actions`
- Modified input state styles duplicated

## Proposed Solutions

### Option A: Create base classes with modifiers (Recommended)
```css
/* Single base card */
.metric-card {
  display: flex;
  flex-direction: column;
  background: var(--bg);
  border-radius: 8px;
  padding: 1rem;
  text-align: center;
}

/* Modifiers */
.metric-card--compact { padding: 0.75rem; border-radius: 6px; }
.metric-card--white { background: white; }
.metric-card--primary { background: var(--primary); color: white; }
.metric-card--large { padding: 1.5rem; }
```
- **Pros:** ~100 LOC reduction, consistent styling
- **Cons:** Need to update class names in JSX
- **Effort:** Medium (2-3 hours)
- **Risk:** Low

### Option B: Add CSS custom properties for design tokens
```css
:root {
  --radius-sm: 4px;
  --radius-md: 6px;
  --radius-lg: 8px;
  --spacing-sm: 0.75rem;
  --spacing-md: 1rem;
  --spacing-lg: 1.5rem;
}
```
- **Pros:** Consistency, easier theme changes
- **Cons:** Still has separate classes
- **Effort:** Medium (2 hours)
- **Risk:** Low

## Recommended Action

[To be filled during triage]

## Technical Details

**Affected files:**
- `src/index.css`
- Various component files (to update class names)

**Consolidation targets:**
1. Card styles (~100 LOC)
2. Table styles (~60 LOC)
3. Action button styles (~30 LOC)

## Acceptance Criteria

- [ ] Single `.metric-card` base class with modifiers
- [ ] Design tokens for border-radius and spacing
- [ ] ~150 LOC reduction in CSS
- [ ] No visual changes to UI

## Work Log

| Date | Action | Result/Learning |
|------|--------|-----------------|
| 2026-01-26 | Identified during pattern analysis | 150+ LOC CSS duplication |

## Resources

- Pattern Recognition Specialist agent report
- Code Simplicity reviewer agent report
