import { CalculatorInputs } from '../types';
import { Strategy, getStrategy, getLongLeverageRatio, getShortRatio } from '../strategyData';

/**
 * UI-facing helpers for resolving the "effective" strategy and collateral
 * for display purposes. In split-allocation mode these aggregate across
 * both legs (collateral-weighted leverage, summed amount). In single mode
 * they fall back to inputs.strategyId / inputs.collateralAmount.
 *
 * Use these in display code so the financing-fee panel, scenario labels,
 * meeting mode, and exports all reflect the same view of the analysis.
 */

export interface EffectiveAllocationView {
  // True when split allocation is enabled with two valid legs.
  isSplit: boolean;
  // Sum of leg amounts in split mode; inputs.collateralAmount otherwise.
  totalCollateral: number;
  // The "primary" strategy for legacy displays — the larger leg in split
  // mode, or the only strategy in single mode.
  primaryStrategy: Strategy | undefined;
  // Display name: "Split: Core 145/45 + Overlay 45/45" or just the strategy name.
  displayName: string;
  // Collateral-weighted long leverage ratio across legs.
  weightedLongLeverage: number;
  // Collateral-weighted short ratio across legs.
  weightedShortRatio: number;
  // Per-leg breakdown (always populated; one entry in single mode).
  legs: Array<{
    strategy: Strategy;
    amount: number;
    label: 'Core' | 'Overlay' | 'Strategy';
  }>;
}

export function getEffectiveView(inputs: CalculatorInputs): EffectiveAllocationView {
  const split = inputs.splitAllocation;
  if (split && split.enabled && split.coreAmount > 0 && split.overlayAmount > 0) {
    const core = getStrategy(split.coreStrategyId);
    const overlay = getStrategy(split.overlayStrategyId);
    if (core && overlay) {
      const total = split.coreAmount + split.overlayAmount;
      const weightedLong =
        (split.coreAmount * getLongLeverageRatio(core) +
          split.overlayAmount * getLongLeverageRatio(overlay)) /
        total;
      const weightedShort =
        (split.coreAmount * getShortRatio(core) +
          split.overlayAmount * getShortRatio(overlay)) /
        total;
      const primary = split.coreAmount >= split.overlayAmount ? core : overlay;
      return {
        isSplit: true,
        totalCollateral: total,
        primaryStrategy: primary,
        displayName: `Split: ${core.name} + ${overlay.name}`,
        weightedLongLeverage: weightedLong,
        weightedShortRatio: weightedShort,
        legs: [
          { strategy: core, amount: split.coreAmount, label: 'Core' },
          { strategy: overlay, amount: split.overlayAmount, label: 'Overlay' },
        ],
      };
    }
  }

  const strategy = getStrategy(inputs.strategyId);
  return {
    isSplit: false,
    totalCollateral: inputs.collateralAmount,
    primaryStrategy: strategy,
    displayName: strategy?.name ?? inputs.strategyId,
    weightedLongLeverage: strategy ? getLongLeverageRatio(strategy) : 0,
    weightedShortRatio: strategy ? getShortRatio(strategy) : 0,
    legs: strategy
      ? [{ strategy, amount: inputs.collateralAmount, label: 'Strategy' }]
      : [],
  };
}
