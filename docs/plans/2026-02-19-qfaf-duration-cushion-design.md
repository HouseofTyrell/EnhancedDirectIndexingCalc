# QFAF Duration & Cushion Restoration Design

**Date:** 2026-02-19
**Status:** Approved

## Problem

QFAF is only helpful for a limited number of years because EDI loss rates decay over time. Without constant new cash inflows, the tax benefit diminishes. The calculator currently runs QFAF for the full projection period with no way to model a finite QFAF lifespan. Additionally, the QFAF cushion slider (conservative undersizing) was accidentally removed during Sprint 2 refactoring — the backend logic exists but has no UI.

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| QFAF expiry behavior | Full unwind, breakeven | No terminal tax event to model — simplest approach |
| Duration range | 1–10 years, default 5 | Matches projection window; QFAF rarely useful beyond 7–10 years |
| Projection auto-extend | Yes, duration + 2 years minimum | Advisor always sees the post-QFAF EDI-only tail |
| Sizing window interaction | Auto-cap to duration | Don't average rates beyond QFAF lifespan |
| Cushion restoration | Same 0–10% range, strategy section | Backend already works; just needs UI slider |
| Approach for duration cutoff | Zero-out QFAF value after year N | Minimal code change — conditional in the year loop |

## Data Model Changes

### `src/types.ts` — `CalculatorInputs`

Add one field:

```typescript
// QFAF duration: how many years QFAF runs before unwind (1–10, default 5)
qfafDuration: number;
```

### `src/taxData.ts` — defaults

Add to `DEFAULT_INPUTS`:

```typescript
qfafDuration: 5,
```

No changes to `AdvancedSettings` or `YearResult`.

## Calculation Engine Changes

### `src/calculations/core.ts` — `calculate()` (line 55–132)

Three changes in the main loop:

1. **Auto-extend projection:** If `projectionYears < qfafDuration + 2`, set effective projection to `qfafDuration + 2` so the advisor always sees at least 2 post-QFAF years.

2. **Zero-out QFAF after duration:** When `year > inputs.qfafDuration`, pass `qfafValue = 0` to `calculateYear()`. This naturally zeroes:
   - `stGainsGenerated` (0 × multiplier = 0)
   - `ordinaryLossesGenerated` (0 × multiplier = 0)
   - QFAF financing costs (0 value = 0 cost)
   - QFAF growth (0 × growth = 0)

3. **Carryforwards continue:** ST/LT/NOL carryforwards built during QFAF years still flow through and get used in post-QFAF years. No change needed — this already works.

### `src/calculations/sizing.ts` — `calculateSizing()`

Auto-cap sizing window:

```typescript
const sizingYears = Math.min(inputs.qfafSizingYears ?? 10, inputs.qfafDuration ?? 10);
```

## UI Changes

### `src/components/StrategySelectionInputs.tsx`

Add two sliders to the QFAF Configuration section (inside the `{inputs.qfafEnabled && ...}` block):

**QFAF Duration slider:**
- Range: 1–10, step 1, default 5
- Label: `QFAF Duration: N years`
- Hint: "Years QFAF runs before unwind — default: 5"
- When changed, auto-cap `qfafSizingYears` if it exceeds the new duration

**QFAF Cushion slider (restore):**
- Range: 0–0.10, step 0.01, default 0
- Label: `Sizing Cushion: N%`
- Hint: "Reduces auto-sized QFAF for conservative sizing"

### Sizing window auto-cap behavior

When the user changes QFAF duration to a value less than the current sizing window, automatically reduce `qfafSizingYears` to match. The sizing window slider max should also visually cap at the current duration.

### Chart annotation

Add a subtle visual marker (dashed vertical line or annotation) on the year-by-year charts at the QFAF expiration year to show the transition point.

## Test Changes

- Add `qfafDuration: 5` (or appropriate value) to all test fixture inputs
- New test: verify QFAF contributions are zero after duration expires
- New test: verify carryforwards continue post-QFAF
- New test: verify projection auto-extends when duration > projection years
- New test: verify sizing window auto-caps to duration
- Existing cushion tests remain valid (backend never changed)

## Future Enhancement (Deferred)

**Dynamic QFAF resizing:** A mode where QFAF is resized each year to match the current year's EDI loss rate (rather than using a fixed size based on the average). This would model a "right-sized" QFAF that shrinks as EDI losses decay. To be designed and implemented as a separate feature after this work is complete.
