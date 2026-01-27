---
status: completed
priority: p2
issue_id: "012"
tags: [code-review, performance, css]
dependencies: []
---

# CSS Uses transition: all Anti-Pattern

## Problem Statement

Several CSS rules use `transition: all` or unspecified `transition: 0.3s`, which transitions ALL properties including layout-triggering ones. This can cause jank on lower-end devices.

## Findings

**Location 1:** `src/index.css:1273-1286`
```css
.toggle-slider {
  transition: 0.3s;  /* Transitions ALL properties */
}

.toggle-slider:before {
  transition: 0.3s;  /* Transitions ALL properties including position */
}
```

**Location 2:** `src/index.css:277-278`
```css
.advanced-settings-btn {
  transition: all 0.15s;  /* Transitions ALL properties */
}
```

**Location 3:** `src/index.css:69-70`
```css
.sticky-header {
  transition: padding 0.2s ease-out, box-shadow 0.2s ease-out;
  will-change: transform;  /* But transform isn't being transitioned! */
}
```

**Performance impact:** `padding` transitions cause layout recalculation. `transition: all` includes layout-triggering properties.

## Proposed Solutions

### Option A: Specify exact properties (Recommended)
```css
/* Toggle */
.toggle-slider {
  transition: background-color 0.3s ease;
}
.toggle-slider:before {
  transition: transform 0.3s ease;  /* Use transform, not left */
}

/* Button */
.advanced-settings-btn {
  transition: background-color 0.15s, box-shadow 0.15s, border-color 0.15s;
}

/* Sticky header - use transform instead of padding */
.sticky-header {
  transition: box-shadow 0.2s ease-out;
  /* Handle expansion via transform or separate classes */
}
```
- **Pros:** Only animates compositor-friendly properties
- **Cons:** Need to identify what actually needs transitioning
- **Effort:** Small (1 hour)
- **Risk:** Low

## Recommended Action

[To be filled during triage]

## Technical Details

**Affected files:**
- `src/index.css`

**Performance-safe transition properties:**
- `opacity`
- `transform`
- `filter`

**Layout-triggering properties to avoid:**
- `padding`, `margin`
- `width`, `height`
- `top`, `left`, `right`, `bottom`
- `border-width`

## Acceptance Criteria

- [ ] No `transition: all` in codebase
- [ ] All transitions specify exact properties
- [ ] `will-change` only set for actually transitioning properties
- [ ] Sticky header uses transform instead of padding for expansion

## Work Log

| Date | Action | Result/Learning |
|------|--------|-----------------|
| 2026-01-26 | Identified during performance review | Jank potential |

## Resources

- Performance Oracle agent report
