---
status: completed
priority: p1
issue_id: "002"
tags: [code-review, security, localstorage]
dependencies: []
---

# localStorage JSON Parsing Without Schema Validation

## Problem Statement

The `useAdvancedMode` hook parses JSON from localStorage without validating the structure matches `AdvancedModeState`. This creates two risks:
1. **Prototype pollution:** Malicious JSON like `{"__proto__":{"polluted":true}}`
2. **Runtime errors:** Corrupted data causes crashes when accessing `state.sections.yearByYear`

## Findings

**Location:** `src/hooks/useAdvancedMode.ts:26-36`

```typescript
const [state, setState] = useState<AdvancedModeState>(() => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);  // No validation!
    }
  } catch (e) {
    // Only catches JSON syntax errors, not shape mismatch
  }
  return DEFAULT_STATE;
});
```

**Attack scenarios:**
- XSS attack modifies localStorage
- Shared computer with malicious user
- Browser extension injects data
- Corrupted data from app update

## Proposed Solutions

### Option A: Add type guard validation (Recommended)
```typescript
function isAdvancedModeState(value: unknown): value is AdvancedModeState {
  return (
    typeof value === 'object' &&
    value !== null &&
    'enabled' in value &&
    typeof (value as any).enabled === 'boolean' &&
    'sections' in value &&
    typeof (value as any).sections === 'object'
  );
}

// In useState:
const parsed = JSON.parse(stored);
if (isAdvancedModeState(parsed)) return parsed;
```
- **Pros:** Validates shape, falls back gracefully
- **Cons:** Manual validation code
- **Effort:** Small (1 hour)
- **Risk:** Low

### Option B: Use Zod schema validation
```typescript
const AdvancedModeStateSchema = z.object({
  enabled: z.boolean(),
  sections: z.object({
    yearByYear: z.boolean(),
    // ...
  })
});
```
- **Pros:** Declarative, reusable, better error messages
- **Cons:** Adds dependency, larger bundle
- **Effort:** Medium (2 hours)
- **Risk:** Low

## Recommended Action

[To be filled during triage]

## Technical Details

**Affected files:**
- `src/hooks/useAdvancedMode.ts`

**localStorage key:** `taxCalc_advancedMode`

## Acceptance Criteria

- [ ] Invalid JSON structure falls back to DEFAULT_STATE
- [ ] Prototype pollution attempts are neutralized
- [ ] Partial/corrupted data does not crash the app
- [ ] Type guard validates all required properties

## Work Log

| Date | Action | Result/Learning |
|------|--------|-----------------|
| 2026-01-26 | Identified during security review | Prototype pollution risk noted |

## Resources

- Security Sentinel agent report
- TypeScript reviewer agent report
