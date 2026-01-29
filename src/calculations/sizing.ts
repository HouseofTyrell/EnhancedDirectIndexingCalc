import { CalculatorInputs, CalculatedSizing } from '../types';
import {
  getStrategy,
  QFAF_ST_GAIN_RATE,
  QFAF_ORDINARY_LOSS_RATE,
  SECTION_461L_LIMITS,
  getAverageStLossRate,
} from '../strategyData';

/**
 * Calculate QFAF sizing based on strategy selection and collateral amount.
 *
 * QFAF is sized so its ST gains equal the collateral's average ST losses
 * over a configurable window (default: all projection years).
 * Formula: QFAF = (Collateral × Avg_ST_Loss_Rate) / 150%
 *
 * When qfafSizingYears = 1, this is equivalent to the legacy Year 1-only sizing.
 */
export function calculateSizing(inputs: CalculatorInputs): CalculatedSizing {
  const strategy = getStrategy(inputs.strategyId);
  if (!strategy) {
    throw new Error(`Invalid strategy ID: ${inputs.strategyId}`);
  }

  const collateralValue = inputs.collateralAmount;
  const sizingYears = inputs.qfafSizingYears ?? 10;

  // Calculate the average ST loss rate across the sizing window
  const avgStLossRate = getAverageStLossRate(strategy, 1, sizingYears);

  // Calculate collateral ST losses based on average rate (for sizing purposes)
  const year1StLosses = collateralValue * avgStLossRate;

  // QFAF can be disabled for collateral-only scenarios
  let qfafValue = 0;
  let year1StGains = 0;
  let year1OrdinaryLosses = 0;

  if (inputs.qfafEnabled !== false) {
    // Auto-size QFAF so ST gains = average ST losses (or use override)
    // Apply sizing cushion to reduce QFAF by up to 10%
    const cushion = inputs.qfafSizingCushion ?? 0;
    const baseSizing = inputs.qfafOverride ?? year1StLosses / QFAF_ST_GAIN_RATE;
    qfafValue = baseSizing * (1 - cushion);
    // QFAF generates ST gains and ordinary losses at 150% of MV
    year1StGains = qfafValue * QFAF_ST_GAIN_RATE;
    year1OrdinaryLosses = qfafValue * QFAF_ORDINARY_LOSS_RATE;
  }

  // Section 461(l) limitation on ordinary losses
  const section461Limit = SECTION_461L_LIMITS[inputs.filingStatus] || SECTION_461L_LIMITS.single;
  const year1UsableOrdinaryLoss = Math.min(year1OrdinaryLosses, section461Limit);
  const year1ExcessToNol = year1OrdinaryLosses - year1UsableOrdinaryLoss;

  return {
    strategyId: strategy.id,
    strategyName: strategy.name,
    strategyType: strategy.type,
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
  };
}
