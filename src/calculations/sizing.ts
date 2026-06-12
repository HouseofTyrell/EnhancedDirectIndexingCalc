import { CalculatorInputs, CalculatedSizing, SizingLeg } from '../types';
import {
  QFAF_ST_GAIN_RATE,
  QFAF_ORDINARY_LOSS_RATE,
  SECTION_461L_LIMITS,
  getAverageStLossRate,
} from '../strategyData';
import { resolveAllocation, getBlendedAverageStLossRate } from './splitAllocation';

/**
 * Calculate QFAF sizing based on strategy selection and collateral amount.
 *
 * QFAF is sized so its ST gains equal the collateral's average ST losses
 * over a configurable window (default: all projection years).
 * Formula: QFAF = (Collateral × Avg_ST_Loss_Rate) / 150%
 *
 * When qfafSizingYears = 1, this is equivalent to the legacy Year 1-only sizing.
 *
 * Split allocation: when `inputs.splitAllocation.enabled` is true and both legs
 * are valid, the collateral and ST-loss-generation rate are blended across the
 * Core (cash) and Overlay (appreciated stock) legs. The QFAF is auto-sized
 * against the combined ST losses so a single QFAF position offsets both legs.
 */
export function calculateSizing(
  inputs: CalculatorInputs,
  qfafMultiplier?: number,
  washSaleDisallowanceRate: number = 0
): CalculatedSizing {
  const allocation = resolveAllocation(inputs);

  const collateralValue = allocation.totalCollateral;
  const maxSizingYears = inputs.qfafDuration ?? 10;
  const sizingYears = Math.min(inputs.qfafSizingYears ?? 10, maxSizingYears);
  const stGainRate = qfafMultiplier ?? QFAF_ST_GAIN_RATE;
  const ordLossRate = qfafMultiplier ?? QFAF_ORDINARY_LOSS_RATE;

  // Calculate the average ST loss rate across the sizing window.
  // In split mode this is collateral-weighted across both legs.
  const avgStLossRate = allocation.isSplit
    ? getBlendedAverageStLossRate(allocation, 1, sizingYears)
    : getAverageStLossRate(allocation.primary.strategy, 1, sizingYears);

  // Aggregate ST losses across all legs for sizing.
  const year1StLosses = collateralValue * avgStLossRate;

  // QFAF can be disabled for collateral-only scenarios
  let qfafValue = 0;
  let year1StGains = 0;
  let year1OrdinaryLosses = 0;

  if (inputs.qfafEnabled !== false) {
    // Auto-size QFAF so its ST gains (at the actual generation multiplier)
    // equal the collateral's harvestable ST losses net of expected wash-sale
    // disallowance. Matches the dynamic-resizing target in core.ts so fixed
    // and dynamic modes agree in Year 1.
    const cushion = inputs.qfafSizingCushion ?? 0;
    const harvestableStLosses = year1StLosses * (1 - washSaleDisallowanceRate);
    const baseSizing = inputs.qfafOverride ?? harvestableStLosses / stGainRate;
    qfafValue = baseSizing * (1 - cushion);
    // QFAF generates ST gains and ordinary losses at the user-selected generation rate
    year1StGains = qfafValue * stGainRate;
    year1OrdinaryLosses = qfafValue * ordLossRate;
  }

  // Section 461(l) limitation on ordinary losses
  const section461Limit = SECTION_461L_LIMITS[inputs.filingStatus] || SECTION_461L_LIMITS.single;
  const year1UsableOrdinaryLoss = Math.min(year1OrdinaryLosses, section461Limit);
  const year1ExcessToNol = year1OrdinaryLosses - year1UsableOrdinaryLoss;

  // Per-leg breakdown for the sizing summary (only meaningful in split mode).
  const splitLegs: SizingLeg[] | undefined = allocation.isSplit
    ? allocation.legs.map(leg => {
        const legAvgRate = getAverageStLossRate(leg.strategy, 1, sizingYears);
        return {
          strategyId: leg.strategy.id,
          strategyName: leg.strategy.name,
          strategyType: leg.strategy.type,
          collateralValue: leg.collateralAmount,
          avgStLossRate: legAvgRate,
          year1StLosses: leg.collateralAmount * legAvgRate,
        };
      })
    : undefined;

  // For the headline strategy fields, fall back to the primary leg (the larger
  // one in split mode; the only leg otherwise).
  const primary = allocation.primary.strategy;

  return {
    strategyId: primary.id,
    strategyName: allocation.isSplit ? 'Split: Core + Overlay' : primary.name,
    strategyType: primary.type,
    collateralValue,
    qfafValue,
    qfafMaxValue: qfafValue, // With auto-sizing, this equals qfafValue
    totalExposure: collateralValue + qfafValue,
    qfafRatio: collateralValue > 0 ? qfafValue / collateralValue : 0,
    year1StLosses,
    year1StGains,
    year1OrdinaryLosses,
    year1UsableOrdinaryLoss,
    year1ExcessToNol,
    section461Limit,
    avgStLossRate,
    sizingYears,
    splitLegs,
  };
}

/**
 * Solve for the collateral amount such that collateral + auto-sized QFAF
 * equals a target total (the client's available portfolio).
 *
 * The auto-sized QFAF is proportional to collateral: QFAF = C × k, where
 * k = avgStLossRate × (1 − washSale) × (1 − cushion) ÷ multiplier. So the
 * collateral that exhausts a total budget T is C = T / (1 + k). k is
 * scale-invariant, so we probe calculateSizing once to read it off rather
 * than duplicating the sizing formula here.
 *
 * With the QFAF disabled the whole budget is collateral. With a manual
 * qfafOverride the remainder after the override is collateral.
 */
export function solveCollateralForTotal(
  totalAvailable: number,
  inputs: CalculatorInputs,
  qfafMultiplier?: number,
  washSaleDisallowanceRate: number = 0
): number {
  if (!(totalAvailable > 0)) return 0;
  if (inputs.qfafEnabled === false) return totalAvailable;
  if (inputs.qfafOverride !== undefined) {
    return Math.max(0, totalAvailable - inputs.qfafOverride);
  }
  const probe = calculateSizing(
    { ...inputs, collateralAmount: totalAvailable },
    qfafMultiplier,
    washSaleDisallowanceRate
  );
  const k = probe.collateralValue > 0 ? probe.qfafValue / probe.collateralValue : 0;
  return totalAvailable / (1 + k);
}
