/**
 * The legacy EDI-only projection engine (`src/calculations/ediOnly.ts`) was
 * retired in the D-014 single-engine refactor: the Workspace's EDI-only mode
 * now runs on `core.ts`, with the tab's unique analytics ported to
 * `src/calculations/ediInsights.ts` (protection ratio, break-even gain event,
 * loss-reserve valuation, estate/step-up comparison) and `exitTax.ts`
 * (embedded gain, CF shelter, signed incremental deferred tax). Those ported
 * concepts are covered by `src/ediInsights.test.ts` and `src/exitTax.test.ts`.
 *
 * What remains here is the strategy-level incremental financing cost helper,
 * which lives in `strategyData.ts` and survives the retirement (it is the
 * basis for the ratio-based financing refactor planned with deleveraging).
 */

import { describe, it, expect } from 'vitest';
import { computeIncrementalFinancingCost, STRATEGIES } from './strategyData';

describe('computeIncrementalFinancingCost', () => {
  it('should compute Overlay 45/45 financing at ~2.81%', () => {
    const strategy = STRATEGIES.find(s => s.id === 'overlay-45-45')!;
    const cost = computeIncrementalFinancingCost(strategy, 0.0425, 0.005, 0.015);
    // 4.25% × 0.45 + (0.5% + 1.5%) × 0.45 = 1.9125% + 0.9% = 2.8125%
    expect(cost).toBeCloseTo(0.028125, 5);
  });

  it('should compute Core 145/45 financing correctly', () => {
    const strategy = STRATEGIES.find(s => s.id === 'core-145-45')!;
    const cost = computeIncrementalFinancingCost(strategy, 0.0425, 0.005, 0.015);
    // Core 145/45: long leverage = (145-100)/100 = 0.45, short = 0.45
    // 4.25% × 0.45 + (0.5% + 1.5%) × 0.45 = 1.9125% + 0.9% = 2.8125%
    expect(cost).toBeCloseTo(0.028125, 5);
  });

  it('should compute different costs for different leverage levels', () => {
    const s30 = STRATEGIES.find(s => s.id === 'overlay-30-30')!;
    const s125 = STRATEGIES.find(s => s.id === 'overlay-125-125')!;
    const cost30 = computeIncrementalFinancingCost(s30, 0.0425, 0.005, 0.015);
    const cost125 = computeIncrementalFinancingCost(s125, 0.0425, 0.005, 0.015);
    // Higher leverage = higher financing cost
    expect(cost125).toBeGreaterThan(cost30);
  });
});
