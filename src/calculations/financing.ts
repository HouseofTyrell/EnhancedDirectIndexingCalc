import { AdvancedSettings } from '../types';
import { Strategy, getLongLeverageRatio, getShortRatio } from '../strategyData';
import { ResolvedAllocation } from './splitAllocation';

/**
 * Ratio-based financing core: cost for an arbitrary (longLeverage, shortRatio)
 * pair. Strategy lookups and deleverage glide interpolation (D-016) both
 * delegate here, so interpolated mid-glide books price identically to a
 * hypothetical strategy with the same ratios.
 *
 * Simple mode: wealth management fee + manager fees (base rate × leverage% +
 * fixed component, where leverage% is the SHORT ratio — matches the legacy
 * strategy-based formula). Detailed mode: component rates × ratios.
 *
 * @param longLeverage - Borrowed long ratio (e.g. 0.45 for Core 145/45, 0 for long-only)
 * @param shortRatio - Short notional ratio (e.g. 0.45 for 145/45, 0 for long-only)
 * @returns Effective financing cost as a decimal (e.g., 0.025 = 2.5% of portfolio per year)
 */
export function getFinancingCostForRatios(
  longLeverage: number,
  shortRatio: number,
  settings: AdvancedSettings
): number {
  if (!settings.financingFeesEnabled) return 0;

  if (settings.financingMode === 'simple') {
    // Simple mode: two components
    // 1. Wealth management fee (flat, e.g. 55 bps)
    // 2. Manager fees: base rate × leverage% + fixed component (e.g. 90bp × 45% + 14.2bp)
    const managerFee = settings.simpleManagerFeeBase * shortRatio + settings.simpleManagerFeeFixed;
    return settings.simpleWealthMgmtFee + managerFee;
  }

  // Detailed mode: calculate from component rates
  // Margin interest cost: broker rate × long leverage
  const marginCost = settings.brokerMarginRate * longLeverage;

  // Short position costs: (borrow fees + dividend payments) × short ratio
  const shortCosts = (settings.shortBorrowRate + settings.shortDividendRate) * shortRatio;

  // Wealth management advisory fee: applied to entire portfolio
  return marginCost + shortCosts + settings.wealthManagementFeeRate;
}

/**
 * Effective financing cost for a strategy: parses the leverage ratios from
 * the strategy definition and delegates to the ratio-based core.
 *
 * Single shared implementation — this used to be copy-pasted into core,
 * overrides, and sensitivity, which let the engines drift apart.
 */
export function getEffectiveFinancingCost(strategy: Strategy, settings: AdvancedSettings): number {
  return getFinancingCostForRatios(
    getLongLeverageRatio(strategy),
    getShortRatio(strategy),
    settings
  );
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
