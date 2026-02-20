# Dynamic QFAF Resizing Design

**Date:** 2026-02-19
**Status:** Approved (post PM + FA review)

## Problem

In Fixed mode, QFAF is sized once at inception based on the average ST loss rate across the sizing window. As EDI loss rates decay (e.g., Overlay 45/45: 16.5% → 4.5% by Year 5), QFAF becomes oversized relative to actual collateral losses. The excess ST gains from an oversized QFAF create unnecessary tax drag ("ST gain leakage").

For a $1M collateral / Overlay 45/45 scenario, the FA estimates ~$260K unnecessary tax exposure by Year 5 under fixed sizing.

## Review Findings (PM + FA)

### Gain-Match Mode: Eliminated
The PM flagged gain-match mode as **economically incoherent** — QFAF generates ST gains + ordinary losses at a fixed 150% of MV; it cannot selectively generate less. Eliminated from design.

### Vintage Cohort: Avoided
Reinvesting redeemed capital into collateral creates a vintage cohort problem — new capital doesn't harvest at the same year-specific decay rates as inception capital. **Solution:** Redeemed capital exits as cash (not reinvested). Sidesteps multi-cohort complexity.

### Dynamic as Default
FA recommends dynamic as default because fixed mode leaves material unnecessary tax exposure. Adopted.

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Number of modes | 2: Fixed + Dynamic | Gain-match eliminated per PM review |
| Default mode | Dynamic | FA: fixed leaves ~$260K unnecessary tax by Year 5 |
| Redeemed capital | Exits as cash | Avoids vintage cohort tracking complexity |
| QFAF can grow in dynamic mode? | No — can only shrink | PM: no-new-subscriptions is realistic |
| ST Gain Leakage display | Show excess ST gains cost | PM: replaces gain-match with transparency |
| NOL impact | Show in comparison | FA: dynamic reduces NOL accumulation — advisors need to see this |

## Data Model Changes

### `src/types.ts` — `CalculatorInputs`

Add one field:

```typescript
// QFAF sizing mode: 'fixed' = sized once at inception, 'dynamic' = resized each year
qfafSizingMode: 'fixed' | 'dynamic';
```

### `src/taxData.ts` — defaults

```typescript
qfafSizingMode: 'dynamic',
```

### `src/types.ts` — `YearResult`

Add two fields:

```typescript
stGainLeakage: number;     // Excess ST gains not offset by ST losses (QFAF oversized)
qfafCashReturned: number;  // Capital exiting QFAF this year (dynamic mode only)
```

## Calculation Engine Changes

### Dynamic QFAF Resizing Logic

In dynamic mode, before each year's calculation:

1. Look up the ST loss rate for year N from `stLossRatesByYear`
2. Calculate needed QFAF: `collateralValue × yearStLossRate / QFAF_ST_GAIN_RATE`
3. If `neededQfaf < currentQfaf`: redeem difference, record as `qfafCashReturned`
4. If `neededQfaf >= currentQfaf`: keep current (can't grow — no new subscriptions)
5. Apply duration cutoff on top (year > duration → QFAF = 0)

### Where Changes Go

**`src/calculations/core.ts`** — `calculate()`:
- Before the year loop, store `initialQfafValue` from sizing
- In the loop, if dynamic mode: recalculate QFAF target for this year
- Track `qfafCashReturned` per year
- Pass through to `calculateYear()` which already works with any qfafValue

**`src/calculations/sensitivity.ts`** — same dynamic logic (mirrors core.ts loop)

**`src/calculations/overrides.ts`** — same dynamic logic

### ST Gain Leakage

Already implicitly computed as `Math.max(0, stGainsGenerated - stLossesHarvested)`.
Store explicitly in YearResult for display.

## UI Changes

### `src/components/StrategySelectionInputs.tsx`

Add a two-option button group in the QFAF Configuration section:

```
[Dynamic ✓] [Fixed]
```

- Dynamic (default): "QFAF resizes each year to match decaying EDI losses"
- Fixed: "QFAF sized once at inception, held constant"

### Results Display

Add ST Gain Leakage column/metric to year-by-year results table showing:
- Per-year excess ST gains (in both modes, but near-zero in dynamic)
- Cumulative leakage cost over the projection

### Scenario Comparison

Track `qfafSizingMode` changes in the comparison panel.

## Test Plan

- Dynamic mode produces smaller QFAF in later years
- Dynamic mode QFAF never exceeds initial sizing
- Dynamic mode records cash returned each year
- ST gain leakage is near-zero in dynamic mode
- ST gain leakage is material in fixed mode with decaying losses
- Duration cutoff still works in dynamic mode
- Fixed mode behavior is unchanged from current
- Sensitivity + overrides paths mirror core.ts behavior
