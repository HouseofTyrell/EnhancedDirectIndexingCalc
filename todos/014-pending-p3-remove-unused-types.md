---
status: completed
priority: p3
issue_id: "014"
tags: [code-review, cleanup, dead-code]
dependencies: []
---

# Remove Unused Types and Interfaces

## Problem Statement

Several types, interfaces, and exported functions are defined but never used anywhere in the codebase.

## Findings

**Unused types:**

| Item | Location | Reason |
|------|----------|--------|
| `YearByYearInputs` interface | `types.ts:99-102` | Never imported/used |
| `qfafMaxValue` field | `types.ts:27` | Always equals `qfafValue` |
| `getStrategiesByType()` | `strategyData.ts:45-47` | Exported but never called |
| `calculateMaxQfaf()` | `strategyData.ts:55-61` | Exported but never called |

**Unused formula components:**

| Component | Location | Lines |
|-----------|----------|-------|
| `Section461lFormula` | `InfoPopup.tsx:160-191` | 32 lines |
| `TaxAlphaFormula` | `InfoPopup.tsx:193-228` | 36 lines |
| `QfafMechanicsFormula` | `InfoPopup.tsx:282-311` | 30 lines |

**Total dead code:** ~114 lines

## Proposed Solutions

### Option A: Remove all dead code (Recommended)
Delete the unused types, interfaces, functions, and components.
- **Pros:** Cleaner codebase, no misleading exports
- **Cons:** May need to re-add if needed later (can check git history)
- **Effort:** Small (30 minutes)
- **Risk:** Low

### Option B: Add usage or documentation
If these were intended for future use, add comments or actually use them.
- **Pros:** Preserves intentional future features
- **Cons:** Keeps dead code if not actually planned
- **Effort:** Small (30 minutes)
- **Risk:** Low

## Recommended Action

[To be filled during triage]

## Technical Details

**Files to modify:**
- `src/types.ts` - Remove `YearByYearInputs`, `qfafMaxValue`
- `src/strategyData.ts` - Remove `getStrategiesByType`, `calculateMaxQfaf`
- `src/InfoPopup.tsx` - Remove unused formula components
- `src/calculations.ts` - Remove `qfafMaxValue` assignment (line 46)

## Acceptance Criteria

- [ ] No unused exports in types.ts
- [ ] No unused exports in strategyData.ts
- [ ] No unused components in InfoPopup.tsx
- [ ] Build still passes after removal

## Work Log

| Date | Action | Result/Learning |
|------|--------|-----------------|
| 2026-01-26 | Identified during simplicity review | 114 LOC dead code |

## Resources

- Code Simplicity reviewer agent report
