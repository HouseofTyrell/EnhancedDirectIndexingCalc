import { CalculatorInputs, SplitAllocation } from '../types';
import { Strategy, getStrategy } from '../strategyData';
import { getEffectiveStLossRate } from './helpers';

export interface ResolvedLeg {
  strategy: Strategy;
  collateralAmount: number;
}

export interface ResolvedAllocation {
  // True when the user has enabled split allocation AND both legs are valid.
  isSplit: boolean;
  // Total collateral across all legs.
  totalCollateral: number;
  // Single-strategy "primary" view used for legacy displays (e.g. financing
  // cost lookups in code paths that haven't been split-aware yet). For split
  // mode, this is the leg with the larger collateral amount.
  primary: ResolvedLeg;
  // Always populated. In single-strategy mode, contains one entry. In split
  // mode, contains [coreLeg, overlayLeg] (in the order coreFirst → overlay).
  legs: ResolvedLeg[];
}

function isSplitEnabled(split: SplitAllocation | undefined): split is SplitAllocation {
  if (!split || !split.enabled) return false;
  // Treat zero-amount legs as a misconfiguration that falls back to single mode.
  return split.coreAmount > 0 && split.overlayAmount > 0;
}

/**
 * Resolve calculator inputs into the set of strategy legs that drive the
 * calculation. When split allocation is enabled and both legs are valid,
 * this returns two legs; otherwise it returns the single legacy leg.
 */
export function resolveAllocation(inputs: CalculatorInputs): ResolvedAllocation {
  const split = inputs.splitAllocation;
  if (isSplitEnabled(split)) {
    const core = getStrategy(split.coreStrategyId);
    const overlay = getStrategy(split.overlayStrategyId);
    if (core && overlay) {
      const legs: ResolvedLeg[] = [
        { strategy: core, collateralAmount: split.coreAmount },
        { strategy: overlay, collateralAmount: split.overlayAmount },
      ];
      const totalCollateral = split.coreAmount + split.overlayAmount;
      // Pick the larger leg as the "primary" so legacy single-strategy paths
      // (financing fees, tracking error display) still produce a reasonable
      // representative value when no split-aware override exists.
      const primary = split.coreAmount >= split.overlayAmount ? legs[0] : legs[1];
      return { isSplit: true, totalCollateral, primary, legs };
    }
  }

  const strategy = getStrategy(inputs.strategyId);
  if (!strategy) {
    throw new Error(`Invalid strategy ID: ${inputs.strategyId}`);
  }
  const leg: ResolvedLeg = { strategy, collateralAmount: inputs.collateralAmount };
  return {
    isSplit: false,
    totalCollateral: inputs.collateralAmount,
    primary: leg,
    legs: [leg],
  };
}

/**
 * Compute the collateral-weighted ST loss rate across all legs for the given
 * year, using each leg's strategy-specific year schedule (with custom rate
 * overrides honored via `getEffectiveStLossRate`).
 */
export function getBlendedStLossRate(allocation: ResolvedAllocation, year: number): number {
  if (allocation.totalCollateral <= 0) return 0;
  let weightedSum = 0;
  for (const leg of allocation.legs) {
    const legRate = getEffectiveStLossRate(leg.strategy.id, leg.strategy.ltGainRate, year);
    weightedSum += leg.collateralAmount * legRate;
  }
  return weightedSum / allocation.totalCollateral;
}

/**
 * Compute the collateral-weighted LT gain rate across all legs.
 */
export function getBlendedLtGainRate(allocation: ResolvedAllocation): number {
  if (allocation.totalCollateral <= 0) return 0;
  let weightedSum = 0;
  for (const leg of allocation.legs) {
    weightedSum += leg.collateralAmount * leg.strategy.ltGainRate;
  }
  return weightedSum / allocation.totalCollateral;
}

/**
 * Compute the collateral-weighted average ST loss rate across the sizing
 * window for QFAF auto-sizing. Mirrors `getAverageStLossRate` but blended.
 */
export function getBlendedAverageStLossRate(
  allocation: ResolvedAllocation,
  fromYear: number,
  toYear: number
): number {
  const clampedFrom = Math.max(1, fromYear);
  const clampedTo = Math.max(clampedFrom, toYear);
  const count = clampedTo - clampedFrom + 1;
  if (count <= 0) return 0;
  let sum = 0;
  for (let year = clampedFrom; year <= clampedTo; year++) {
    sum += getBlendedStLossRate(allocation, year);
  }
  return sum / count;
}
