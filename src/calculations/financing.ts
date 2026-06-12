import { AdvancedSettings } from '../types';
import { Strategy, getLongLeverageRatio, getShortRatio } from '../strategyData';
import { ResolvedAllocation } from './splitAllocation';

/**
 * Calculate the effective financing cost based on strategy leverage and user settings.
 * Simple mode: wealth management fee + manager fees (base rate × leverage% + fixed component).
 * Detailed mode: calculates cost from individual component rates and strategy leverage.
 *
 * Single shared implementation — this used to be copy-pasted into core,
 * overrides, and sensitivity, which let the engines drift apart.
 * @param strategy - The investment strategy (determines leverage ratios)
 * @param settings - Advanced settings with financing cost configuration
 * @returns Effective financing cost as a decimal (e.g., 0.025 = 2.5% of portfolio per year)
 */
export function getEffectiveFinancingCost(strategy: Strategy, settings: AdvancedSettings): number {
  if (!settings.financingFeesEnabled) return 0;

  if (settings.financingMode === 'simple') {
    // Simple mode: two components
    // 1. Wealth management fee (flat, e.g. 55 bps)
    // 2. Manager fees: base rate × leverage% + fixed component (e.g. 90bp × 45% + 14.2bp)
    const leveragePct = getShortRatio(strategy);
    const managerFee = settings.simpleManagerFeeBase * leveragePct + settings.simpleManagerFeeFixed;
    return settings.simpleWealthMgmtFee + managerFee;
  }

  // Detailed mode: calculate from component rates
  const longLeverage = getLongLeverageRatio(strategy);
  const shortRatio = getShortRatio(strategy);

  // Margin interest cost: broker rate × long leverage
  const marginCost = settings.brokerMarginRate * longLeverage;

  // Short position costs: (borrow fees + dividend payments) × short ratio
  const shortCosts = (settings.shortBorrowRate + settings.shortDividendRate) * shortRatio;

  // Wealth management advisory fee: applied to entire portfolio
  return marginCost + shortCosts + settings.wealthManagementFeeRate;
}

/**
 * Compute the collateral-weighted financing cost across all legs of an
 * allocation. In single-strategy mode this just returns the one leg's cost.
 */
export function getBlendedFinancingCost(
  allocation: ResolvedAllocation,
  settings: AdvancedSettings
): number {
  if (allocation.totalCollateral <= 0) return 0;
  let weightedSum = 0;
  for (const leg of allocation.legs) {
    weightedSum += leg.collateralAmount * getEffectiveFinancingCost(leg.strategy, settings);
  }
  return weightedSum / allocation.totalCollateral;
}
