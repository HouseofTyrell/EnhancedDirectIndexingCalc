---
status: completed
priority: p2
issue_id: "011"
tags: [code-review, typescript, dry]
dependencies: []
---

# Duplicate Strategy Interface in calculations.ts

## Problem Statement

A local `Strategy` interface is defined in `calculations.ts` that shadows the exported `Strategy` interface from `strategyData.ts`. This creates maintenance risk if the source definition changes.

## Findings

**Location 1:** `src/calculations.ts:96-99`
```typescript
interface Strategy {
  stLossRate: number;
  ltGainRate: number;
}
```

**Location 2:** `src/strategyData.ts:2-10`
```typescript
export interface Strategy {
  id: string;
  name: string;
  type: 'core' | 'overlay';
  longPct: number;
  shortPct: number;
  stLossRate: number;
  ltGainRate: number;
  trackingError: string;
}
```

The local interface is a subset used only for the `calculateYear` function parameter.

## Proposed Solutions

### Option A: Import and use Pick (Recommended)
```typescript
import { Strategy } from './strategyData';

type StrategyRates = Pick<Strategy, 'stLossRate' | 'ltGainRate'>;

function calculateYear(
  // ...
  strategy: StrategyRates
): YearResult {
```
- **Pros:** Single source of truth, changes propagate automatically
- **Cons:** None
- **Effort:** Small (15 minutes)
- **Risk:** Low

### Option B: Use full Strategy type
```typescript
import { Strategy } from './strategyData';

function calculateYear(
  // ...
  strategy: Strategy
): YearResult {
```
- **Pros:** Simpler, no Pick needed
- **Cons:** Function receives more properties than it needs
- **Effort:** Small (10 minutes)
- **Risk:** Low

## Recommended Action

[To be filled during triage]

## Technical Details

**Affected files:**
- `src/calculations.ts`

## Acceptance Criteria

- [ ] Local Strategy interface removed from calculations.ts
- [ ] Either full Strategy or Pick<Strategy, ...> imported from strategyData.ts
- [ ] No type errors after change

## Work Log

| Date | Action | Result/Learning |
|------|--------|-----------------|
| 2026-01-26 | Identified during TypeScript review | Duplicate interface |

## Resources

- TypeScript reviewer agent report
