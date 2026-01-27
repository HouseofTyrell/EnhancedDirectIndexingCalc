---
status: completed
priority: p3
issue_id: "017"
tags: [code-review, cleanup, components]
dependencies: []
---

# Extract Inline SVG Icons to Component

## Problem Statement

SVG icons are defined inline in Calculator.tsx, making the component larger and harder to maintain.

## Findings

**Location:** `src/Calculator.tsx:482-485`

```tsx
<button className="advanced-settings-btn" onClick={() => setIsAdvancedModalOpen(true)}>
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4..." />
  </svg>
  Advanced Settings
</button>
```

This is a settings/gear icon that could be extracted to a reusable component.

## Proposed Solutions

### Option A: Create Icons component (Recommended)
```typescript
// src/components/Icons.tsx
export function SettingsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" ...>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15..." />
    </svg>
  );
}

// Usage
<button className="advanced-settings-btn">
  <SettingsIcon />
  Advanced Settings
</button>
```
- **Pros:** Reusable, cleaner Calculator.tsx
- **Cons:** New file
- **Effort:** Small (30 minutes)
- **Risk:** Low

### Option B: Use icon library (lucide-react, heroicons)
Replace inline SVG with library component.
- **Pros:** More icons available, consistent styling
- **Cons:** Adds dependency, increases bundle size
- **Effort:** Small (30 minutes)
- **Risk:** Low

## Recommended Action

[To be filled during triage]

## Technical Details

**New file to create:**
- `src/components/Icons.tsx`

**Files to update:**
- `src/Calculator.tsx`

## Acceptance Criteria

- [ ] Settings icon extracted to Icons component
- [ ] Calculator.tsx imports icon from shared location
- [ ] Icon renders identically to current inline version

## Work Log

| Date | Action | Result/Learning |
|------|--------|-----------------|
| 2026-01-26 | Identified during pattern analysis | Inline SVG in component |

## Resources

- Pattern Recognition Specialist agent report
