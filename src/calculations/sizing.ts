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
export function calculateSizing(inputs: CalculatorInputs, qfafMultiplier?: number): CalculatedSizing {
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
    // Auto-size QFAF so ST gains = average ST losses (or use override)
    // Apply sizing cushion to reduce QFAF by up to 10%
    const cushion = inputs.qfafSizingCushion ?? 0;
    // Size QFAF based on default 150% rate (sizing target is always to match ST losses at full rate)
    const baseSizing = inputs.qfafOverride ?? year1StLosses / QFAF_ST_GAIN_RATE;
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
