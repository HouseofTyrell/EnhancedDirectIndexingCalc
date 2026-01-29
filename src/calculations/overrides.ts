import {
  CalculatorInputs,
  YearResult,
  CalculationResult,
  CalculatedSizing,
  AdvancedSettings,
  DEFAULT_SETTINGS,
  YearOverride,
} from '../types';
import { getFederalStRate, getFederalLtRate, getStateRate } from '../taxData';
import {
  getStrategy,
  QFAF_ST_GAIN_RATE,
  SECTION_461L_LIMITS,
} from '../strategyData';
import { TaxRates } from './types';
import { calculateSummary } from './helpers';
import { calculateSizing } from './sizing';
import { calculateYear } from './core';

/**
 * Calculate with year-by-year overrides for income and cash infusions.
 *
 * This function extends the base calculate() function to support:
 * - Income overrides: Change W-2 income for specific years (affects 461(l) limits and NOL usage)
 * - Cash infusions: Add/remove capital in specific years (affects collateral and QFAF sizing)
 */
export function calculateWithOverrides(
  inputs: CalculatorInputs,
  settings: AdvancedSettings = DEFAULT_SETTINGS,
  overrides: YearOverride[]
): CalculationResult {
  const strategy = getStrategy(inputs.strategyId);

  // Validate strategy exists
  if (!strategy) {
    throw new Error(`Invalid strategy ID: ${inputs.strategyId}`);
  }

  // Build a map of overrides by year for quick lookup
  const overrideMap = new Map<number, YearOverride>();
  for (const override of overrides) {
    overrideMap.set(override.year, override);
  }

  // Calculate initial sizing (will be adjusted for infusions)
  const baseSizing = calculateSizing(inputs);

  // Pre-calculate base tax rates
  const baseStateRate =
    inputs.stateCode === 'OTHER' ? inputs.stateRate : getStateRate(inputs.stateCode);

  const years: YearResult[] = [];

  let qfafValue = baseSizing.qfafValue;
  let collateralValue = baseSizing.collateralValue;
  let stCarryforward = inputs.existingStLossCarryforward;
  let ltCarryforward = inputs.existingLtLossCarryforward;
  let nolCarryforward = inputs.existingNolCarryforward;

  // Track cumulative infusions for sizing recalculation
  let cumulativeInfusion = 0;

  // Use projectionYears from settings (defaults to 10)
  const projectionYears = settings.projectionYears ?? 10;

  for (let year = 1; year <= projectionYears; year++) {
    const override = overrideMap.get(year);

    // Get effective income for this year
    const yearIncome = override?.w2Income ?? inputs.annualIncome;

    // Apply cash infusion at the start of the year
    const cashInfusion = override?.cashInfusion ?? 0;
    if (cashInfusion !== 0) {
      // Add/subtract from collateral
      collateralValue += cashInfusion;
      cumulativeInfusion += cashInfusion;

      // Resize QFAF to match new collateral ST loss capacity (if QFAF is enabled)
      if (inputs.qfafEnabled !== false) {
        const newStLossCapacity = collateralValue * strategy.stLossRate;
        qfafValue = newStLossCapacity / QFAF_ST_GAIN_RATE;
      }
    }

    // Calculate tax rates for this year's income
    // (Tax brackets may differ based on income level)
    const yearTaxRates: TaxRates = {
      stRate: getFederalStRate(yearIncome, inputs.filingStatus),
      ltRate: getFederalLtRate(yearIncome, inputs.filingStatus),
      stateRate: baseStateRate,
      section461Limit:
        settings.section461Limits[inputs.filingStatus] ??
        SECTION_461L_LIMITS[inputs.filingStatus],
    };

    const result = calculateYear(
      year,
      qfafValue,
      collateralValue,
      stCarryforward,
      ltCarryforward,
      nolCarryforward,
      inputs,
      strategy,
      yearTaxRates,
      settings,
      yearIncome // Pass the year-specific income
    );

    years.push(result);

    // Update state for next year
    qfafValue = result.qfafValue;
    collateralValue = result.collateralValue;
    stCarryforward = result.stLossCarryforward;
    ltCarryforward = result.ltLossCarryforward;
    nolCarryforward = result.nolCarryforward;
  }

  // Recalculate sizing to reflect any infusions
  // (The sizing should reflect the initial state plus any year-1 infusion)
  const adjustedSizing: CalculatedSizing = {
    ...baseSizing,
    collateralValue: baseSizing.collateralValue + (overrideMap.get(1)?.cashInfusion ?? 0),
    totalExposure:
      baseSizing.totalExposure +
      cumulativeInfusion +
      (inputs.qfafEnabled !== false
        ? (cumulativeInfusion * strategy.stLossRate) / QFAF_ST_GAIN_RATE
        : 0),
  };

  return {
    sizing: adjustedSizing,
    years,
    summary: calculateSummary(years, adjustedSizing),
  };
}
