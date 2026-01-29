---
status: completed
priority: p2
issue_id: "010"
tags: [code-review, typescript, type-safety]
dependencies: []
---

# Filing Status Type Not Properly Constrained

## Problem Statement

The filing status is typed as a union in `CalculatorInputs` but `SECTION_461L_LIMITS` uses `Record<string, number>` allowing any string key. The type assertion in the select onChange bypasses TypeScript's checking.

## Findings

**Location 1:** `src/strategyData.ts:30`
```typescript
export const SECTION_461L_LIMITS: Record<string, number> = {
  single: 256000,
  mfj: 512000,
  // ...
};
// Should be: Record<FilingStatus, number>
```

**Location 2:** `src/Calculator.tsx:228`
```typescript
onChange={e => updateInput('filingStatus', e.target.value as CalculatorInputs['filingStatus'])}
// Type assertion bypasses checking - invalid values accepted
```

**Location 3:** `src/calculations.ts:36`
```typescript
const section461Limit = SECTION_461L_LIMITS[inputs.filingStatus] || SECTION_461L_LIMITS.single;
// Fallback masks potential bugs - should not be needed with proper typing
```

## Proposed Solutions

### Option A: Create shared FilingStatus type (Recommended)
```typescript
// src/types.ts
export const FILING_STATUSES = ['single', 'mfj', 'mfs', 'hoh'] as const;
export type FilingStatus = typeof FILING_STATUSES[number];

// src/strategyData.ts
export const SECTION_461L_LIMITS: Record<FilingStatus, number> = {
  single: 256000,
  mfj: 512000,
  mfs: 256000,
  hoh: 256000,
};

// src/Calculator.tsx - generate options from constant
{FILING_STATUSES.map(status => (
  <option key={status} value={status}>{getFilingStatusLabel(status)}</option>
))}
```
- **Pros:** Type-safe, single source of truth, no fallbacks needed
- **Cons:** Minor refactor
- **Effort:** Small (1 hour)
- **Risk:** Low

## Recommended Action

[To be filled during triage]

## Technical Details

**Affected files:**
- `src/types.ts` (add FilingStatus type)
- `src/strategyData.ts` (use FilingStatus)
- `src/Calculator.tsx` (use FilingStatus, generate options)
- `src/calculations.ts` (remove fallbacks)
- `src/taxData.ts` (use FilingStatus in function params)

## Acceptance Criteria

- [ ] `FilingStatus` type exported from types.ts
- [ ] `FILING_STATUSES` constant array used for select options
- [ ] `SECTION_461L_LIMITS` typed as `Record<FilingStatus, number>`
- [ ] Fallback logic removed from calculations.ts
- [ ] Type assertions removed from Calculator.tsx

## Work Log

| Date | Action | Result/Learning |
|------|--------|-----------------|
| 2026-01-26 | Identified during TypeScript review | Type safety gap |

## Resources

- TypeScript reviewer agent report
