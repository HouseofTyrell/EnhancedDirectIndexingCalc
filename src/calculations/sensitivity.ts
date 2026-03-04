import {
  CalculatorInputs,
  YearResult,
  CalculationResult,
  AdvancedSettings,
  DEFAULT_SETTINGS,
  SensitivityParams,
  DEFAULT_SENSITIVITY,
} from '../types';
import { getFederalStRate, getFederalLtRate, getStateRate } from '../taxData';
import {
  getStrategy,
  QFAF_ST_GAIN_RATE,
  CAPITAL_LOSS_LIMITS,
  SECTION_461L_LIMITS,
  getLongLeverageRatio,
  getShortRatio,
  Strategy,
} from '../strategyData';
import { safeNumber } from '../utils/formatters';
import { StrategyRates, TaxRates } from './types';
import { getEffectiveStLossRate, calculateCarryforwards, calculateSummary } from './helpers';
import { calculateSizing } from './sizing';

/**
 * Calculate the effective financing cost based on strategy leverage and user settings.
 * In simple mode, uses the user-specified rate directly.
 * In detailed mode, calculates cost from component rates and strategy leverage.
 * @param strategy - The investment strategy (determines leverage ratios)
 * @param settings - Advanced settings with financing cost configuration
 * @returns Effective financing cost as a decimal (e.g., 0.025 = 2.5% of portfolio per year)
 */
function getEffectiveFinancingCost(strategy: Strategy, settings: AdvancedSettings): number {
  if (!settings.financingFeesEnabled) return 0;

  if (settings.financingMode === 'simple') {
    // Simple mode: use the single effective rate directly
    return settings.simpleFinancingRate;
  } else {
    // Detailed mode: calculate from component rates
    const longLeverage = getLongLeverageRatio(strategy);
    const shortRatio = getShortRatio(strategy);

    // Margin interest cost: broker rate × long leverage
    const marginCost = settings.brokerMarginRate * longLeverage;

    // Short position costs: (borrow fees + dividend payments) × short ratio
    const shortCosts = (settings.shortBorrowRate + settings.shortDividendRate) * shortRatio;

    // Wealth management advisory fee: applied to entire portfolio
    const advisoryFee = settings.wealthManagementFeeRate;

    return marginCost + shortCosts + advisoryFee;
  }
}

/**
 * Calculate with sensitivity analysis adjustments.
 *
 * This function extends the base calculate() function to support stress-testing:
 * - Federal rate changes: Adjust federal tax rates up/down
 * - State rate changes: Adjust state tax rates up/down
 * - Annual return: Override portfolio growth rate
 * - ST loss rate variance: Adjust strategy ST loss rates
 * - LT gain rate variance: Adjust strategy LT gain rates
 */
export function calculateWithSensitivity(
  inputs: CalculatorInputs,
  settings: AdvancedSettings = DEFAULT_SETTINGS,
  sensitivity: SensitivityParams = DEFAULT_SENSITIVITY
): CalculationResult {
  const strategy = getStrategy(inputs.strategyId);

  // Validate strategy exists
  if (!strategy) {
    throw new Error(`Invalid strategy ID: ${inputs.strategyId}`);
  }

  // Calculate initial sizing
  const sizing = calculateSizing(inputs, settings.qfafMultiplier);

  // Get base state rate
  const baseStateRate =
    inputs.stateCode === 'OTHER' ? inputs.stateRate : getStateRate(inputs.stateCode);

  // Apply sensitivity adjustments to rates
  const adjustedStateRate = Math.max(0, baseStateRate + sensitivity.stateRateChange);

  // Get base tracking error from strategy and scale by multiplier
  // This models implementation risk: 0x = perfect, 1x = baseline, 2x = high variance
  const scaledTrackingError = strategy.trackingError * sensitivity.trackingErrorMultiplier;

  // Apply ST loss and LT gain variance to strategy rates
  const adjustedStLossRate = strategy.stLossRate * (1 + sensitivity.stLossRateVariance);
  const adjustedLtGainRate = strategy.ltGainRate * (1 + sensitivity.ltGainRateVariance);

  // Create adjusted strategy with modified rates
  const adjustedStrategy: StrategyRates = {
    stLossRate: adjustedStLossRate,
    ltGainRate: adjustedLtGainRate,
  };

  // Use sensitivity annual return if different from default
  const sensitivityOverride = sensitivity.annualReturn !== DEFAULT_SENSITIVITY.annualReturn;
  const effectiveAnnualReturn = sensitivityOverride
    ? sensitivity.annualReturn
    : settings.defaultAnnualReturn;

  // Create adjusted settings with sensitivity return
  // If sensitivity overrides annual return, force growth enabled
  const adjustedSettings: AdvancedSettings = {
    ...settings,
    defaultAnnualReturn: effectiveAnnualReturn,
    growthEnabled: sensitivityOverride ? true : settings.growthEnabled,
  };

  const years: YearResult[] = [];

  let qfafValue = sizing.qfafValue;
  let collateralValue = sizing.collateralValue;
  let stCarryforward = inputs.existingStLossCarryforward;
  let ltCarryforward = inputs.existingLtLossCarryforward;
  let nolCarryforward = inputs.existingNolCarryforward;
  const initialQfafValue = sizing.qfafValue;
  const isDynamic = inputs.qfafSizingMode === 'dynamic' && inputs.qfafEnabled !== false;

  // Use projectionYears from settings (defaults to 10)
  const projectionYears = settings.projectionYears ?? 10;

  // Auto-extend projection to show at least 2 post-QFAF years
  const qfafDuration = inputs.qfafEnabled !== false ? (inputs.qfafDuration ?? 10) : 0;
  const minProjection = qfafDuration > 0 ? qfafDuration + 2 : projectionYears;
  const effectiveProjectionYears = Math.max(projectionYears, minProjection);

  // Partial year: month 1 = full year (12/12), month 4 = 9/12, month 12 = 1/12
  const yearFraction = (13 - (inputs.startMonth ?? 1)) / 12;

  for (let year = 1; year <= effectiveProjectionYears; year++) {
    // Zero out QFAF after duration expires (breakeven unwind)
    let effectiveQfafValue = (qfafDuration > 0 && year > qfafDuration) ? 0 : qfafValue;

    // Dynamic resizing: shrink QFAF to match this year's collateral ST losses
    let cashReturned = 0;
    if (isDynamic && effectiveQfafValue > 0) {
      const yearStLossRate = getEffectiveStLossRate(inputs.strategyId, strategy.ltGainRate, year);
      const effectiveYearFraction = year === 1 ? yearFraction : 1.0;
      const neededQfaf = collateralValue * yearStLossRate * effectiveYearFraction * (1 - settings.washSaleDisallowanceRate) / QFAF_ST_GAIN_RATE * (1 - (inputs.qfafSizingCushion ?? 0));
      // Can only shrink, never grow beyond initial or current value
      const cappedQfaf = Math.min(effectiveQfafValue, neededQfaf, initialQfafValue);
      cashReturned = Math.max(0, effectiveQfafValue - cappedQfaf);
      effectiveQfafValue = cappedQfaf;
    }

    // Calculate tax rates with sensitivity adjustments
    const baseFederalStRate = getFederalStRate(inputs.annualIncome, inputs.filingStatus);
    const baseFederalLtRate = getFederalLtRate(inputs.annualIncome, inputs.filingStatus);

    // Apply federal rate change (affects both ST and LT rates proportionally)
    const adjustedFederalStRate = Math.max(0, baseFederalStRate + sensitivity.federalRateChange);
    const adjustedFederalLtRate = Math.max(0, baseFederalLtRate + sensitivity.federalRateChange);

    // Use settings section461Limits if provided
    const section461Limit =
      settings.section461Limits[inputs.filingStatus] ?? SECTION_461L_LIMITS[inputs.filingStatus];

    const yearTaxRates: TaxRates = {
      stRate: adjustedFederalStRate,
      ltRate: adjustedFederalLtRate,
      stateRate: adjustedStateRate,
      section461Limit,
    };

    // After strategy duration, zero out tax-harvesting activity
    const strategyActive = !(qfafDuration > 0 && year > qfafDuration);

    const result = calculateYearWithSensitivity(
      year,
      effectiveQfafValue,
      collateralValue,
      stCarryforward,
      ltCarryforward,
      nolCarryforward,
      inputs,
      adjustedStrategy,
      yearTaxRates,
      adjustedSettings,
      sensitivity.stLossRateVariance,
      sensitivity.ltGainRateVariance,
      scaledTrackingError,
      strategy, // Pass full strategy for financing cost calculation
      year === 1 ? yearFraction : 1.0, // Partial year applies to Year 1 only
      strategyActive
    );

    years.push({ ...result, qfafCashReturned: cashReturned });

    // Update state for next year
    // Don't track QFAF growth after unwind
    qfafValue = (qfafDuration > 0 && year >= qfafDuration) ? 0 : result.qfafValue;
    collateralValue = result.collateralValue;
    stCarryforward = result.stLossCarryforward;
    ltCarryforward = result.ltLossCarryforward;
    nolCarryforward = result.nolCarryforward;
  }

  return {
    sizing,
    years,
    summary: calculateSummary(years, sizing, inputs.qfafEnabled !== false ? inputs.qfafDuration : undefined),
  };
}

/**
 * Calculate a single year with sensitivity-adjusted rates.
 * Applies the same decay logic as base calculation, but with variance-adjusted base rates.
 * Tracking error amplifies user-specified variances to model implementation risk.
 */
function calculateYearWithSensitivity(
  year: number,
  qfafValue: number,
  collateralValue: number,
  stCarryforward: number,
  ltCarryforward: number,
  nolCarryforward: number,
  inputs: CalculatorInputs,
  strategy: StrategyRates,
  taxRates: TaxRates,
  settings: AdvancedSettings,
  stLossVariance: number,
  ltGainVariance: number,
  scaledTrackingError: number,
  fullStrategy?: Strategy, // Full strategy object for financing cost calculation
  yearFraction: number = 1.0, // Partial year: (13 - startMonth) / 12, applied to Year 1 only
  strategyActive: boolean = true // Whether the strategy is actively generating tax events
): YearResult {
  // QFAF generates ST gains and ordinary losses at qfafMultiplier rate
  const qfafMultiplier = settings.qfafMultiplier ?? QFAF_ST_GAIN_RATE;
  const stGainsGenerated = strategyActive ? safeNumber(qfafValue * qfafMultiplier * yearFraction) : 0;
  const ordinaryLossesGenerated = strategyActive ? safeNumber(qfafValue * qfafMultiplier * yearFraction) : 0;

  // Get base rates with decay (same as normal calculation)
  const baseStLossRate = getEffectiveStLossRate(inputs.strategyId, strategy.ltGainRate, year);

  // Amplify user-specified variances by tracking error
  // Higher tracking error = more uncertainty in variance estimates
  // effectiveVariance = baseVariance * (1 + scaledTrackingError)
  // When tracking error = 0, no amplification (perfect implementation)
  // When tracking error > 0, variances are amplified (implementation risk)
  const effectiveStVariance = stLossVariance * (1 + scaledTrackingError);
  const effectiveLtVariance = ltGainVariance * (1 + scaledTrackingError);

  // Apply amplified variances to rates
  const adjustedStLossRate = baseStLossRate * (1 + effectiveStVariance);
  const adjustedLtGainRate = strategy.ltGainRate * (1 + effectiveLtVariance);

  const grossStLosses = strategyActive ? collateralValue * adjustedStLossRate * yearFraction : 0;
  const stLossesHarvested = safeNumber(grossStLosses * (1 - settings.washSaleDisallowanceRate));
  const ltGainsRealized = strategyActive ? safeNumber(collateralValue * adjustedLtGainRate * yearFraction) : 0;

  // Net ST position
  const grossNetSt = stGainsGenerated - stLossesHarvested;

  // Apply ST carryforward to offset any remaining ST gains
  let netStGainLoss = grossNetSt;
  let usedStCarryforward = 0;
  if (netStGainLoss > 0 && stCarryforward > 0) {
    usedStCarryforward = Math.min(stCarryforward, netStGainLoss);
    netStGainLoss -= usedStCarryforward;
  }

  // Section 461(l) limitation on ordinary losses
  const usableOrdinaryLoss = Math.min(
    ordinaryLossesGenerated,
    taxRates.section461Limit,
    inputs.annualIncome
  );
  const excessToNol = ordinaryLossesGenerated - usableOrdinaryLoss;

  // Calculate carryforwards and NOL usage
  const { newStCarryforward, newLtCarryforward, nolUsed, capitalLossUsedAgainstIncome } =
    calculateCarryforwards(
      netStGainLoss,
      ltGainsRealized,
      usableOrdinaryLoss,
      stCarryforward - usedStCarryforward,
      ltCarryforward,
      nolCarryforward,
      inputs,
      settings
    );

  // Update NOL carryforward
  const newNolCarryforward = safeNumber(nolCarryforward + excessToNol - nolUsed);

  // Calculate tax savings
  const { stRate, ltRate, stateRate } = taxRates;
  const combinedStRate = stRate + stateRate;
  const combinedLtRate = ltRate + stateRate;
  const rateDifferential = stRate - ltRate;

  // Benefits
  const ordinaryLossBenefit = safeNumber(usableOrdinaryLoss * combinedStRate);
  const stGainsOffset = Math.min(stGainsGenerated, stLossesHarvested);
  const stToLtConversionBenefit = safeNumber(stGainsOffset * rateDifferential);
  const capitalLossBenefit = safeNumber(capitalLossUsedAgainstIncome * combinedStRate);
  const nolUsageBenefit = safeNumber(nolUsed * combinedStRate);

  // Costs
  const ltGainCost = safeNumber(ltGainsRealized * combinedLtRate);
  const remainingStGainCost = safeNumber(Math.max(0, netStGainLoss) * combinedStRate);

  // Net tax savings
  const taxSavings = safeNumber(
    ordinaryLossBenefit +
      stToLtConversionBenefit +
      capitalLossBenefit +
      nolUsageBenefit -
      ltGainCost -
      remainingStGainCost
  );

  // Component-specific benefits for view mode breakdown
  const qfafTaxBenefit = safeNumber(ordinaryLossBenefit + nolUsageBenefit + stToLtConversionBenefit);
  const collateralTaxBenefit = safeNumber(capitalLossBenefit - ltGainCost - remainingStGainCost);

  // Tax breakdown for display
  const grossInvestmentTax = safeNumber(
    Math.max(0, netStGainLoss) * combinedStRate + ltGainsRealized * combinedLtRate
  );
  const federalTax = safeNumber(
    Math.max(0, grossInvestmentTax - ordinaryLossBenefit - capitalLossBenefit - nolUsageBenefit) *
      (stRate / combinedStRate)
  );
  const stateTax = safeNumber(
    Math.max(0, grossInvestmentTax - ordinaryLossBenefit - capitalLossBenefit - nolUsageBenefit) *
      (stateRate / combinedStRate)
  );
  const baselineTax = ltGainsRealized * combinedLtRate;

  // Portfolio growth: apply annual return (if enabled) minus financing fees (if enabled)
  const baseReturn = settings.growthEnabled ? settings.defaultAnnualReturn : 0;
  // Use fullStrategy if provided, otherwise lookup by ID
  const strategyForFinancing = fullStrategy || getStrategy(inputs.strategyId);
  const totalFinancingCost = strategyForFinancing
    ? getEffectiveFinancingCost(strategyForFinancing, settings)
    : 0;
  const growthRate = baseReturn - totalFinancingCost;
  // QFAF can use a separate return rate if specified (defaults to collateral growth rate)
  const qfafBaseReturn = settings.growthEnabled
    ? (settings.qfafAnnualReturn !== null ? settings.qfafAnnualReturn : settings.defaultAnnualReturn)
    : 0;
  const qfafGrowthRateWithFees = qfafBaseReturn - totalFinancingCost;
  const qfafGrowthRate = settings.qfafGrowthEnabled ? qfafGrowthRateWithFees : 0;
  const newQfafValue = safeNumber(qfafValue * (1 + qfafGrowthRate * yearFraction));
  const newCollateralValue = safeNumber(collateralValue * (1 + growthRate * yearFraction));

  // Calculate total income offset for this year
  const incomeOffsetAmount = safeNumber(
    usableOrdinaryLoss + nolUsed + capitalLossUsedAgainstIncome
  );

  // Calculate maximum income offset capacity for this year
  // Uses section 461(l) limit + start-of-year NOL + capital loss limit
  // (see core.ts calculateYear for detailed explanation)
  const capitalLossLimit = CAPITAL_LOSS_LIMITS[inputs.filingStatus];
  const maxIncomeOffsetCapacity = safeNumber(
    taxRates.section461Limit + nolCarryforward + capitalLossLimit
  );

  return {
    year,
    qfafValue: newQfafValue,
    collateralValue: newCollateralValue,
    totalValue: newQfafValue + newCollateralValue,
    stGainsGenerated,
    ordinaryLossesGenerated,
    usableOrdinaryLoss,
    excessToNol,
    stLossesHarvested,
    ltGainsRealized,
    netStGainLoss: Math.max(0, netStGainLoss),
    federalTax,
    stateTax,
    totalTax: federalTax + stateTax,
    baselineTax,
    taxSavings,
    stLossCarryforward: newStCarryforward,
    ltLossCarryforward: newLtCarryforward,
    nolCarryforward: newNolCarryforward,
    nolUsedThisYear: nolUsed,
    capitalLossUsedAgainstIncome,
    effectiveStLossRate: adjustedStLossRate,
    incomeOffsetAmount,
    maxIncomeOffsetCapacity,
    ordinaryLossBenefit,
    nolUsageBenefit,
    stToLtConversionBenefit,
    capitalLossBenefit,
    ltGainCost,
    remainingStGainCost,
    qfafTaxBenefit,
    collateralTaxBenefit,
    stGainLeakage: Math.max(0, stGainsGenerated - stLossesHarvested),
    qfafCashReturned: 0,
    strategyActive,
  };
}
