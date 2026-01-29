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
} from '../strategyData';
import { safeNumber } from '../utils/formatters';
import { StrategyRates, TaxRates } from './types';
import { getEffectiveStLossRate, calculateCarryforwards, calculateSummary } from './helpers';
import { calculateSizing } from './sizing';

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
  const sizing = calculateSizing(inputs);

  // Get base state rate
  const baseStateRate =
    inputs.stateCode === 'OTHER' ? inputs.stateRate : getStateRate(inputs.stateCode);

  // Apply sensitivity adjustments to rates
  const adjustedStateRate = Math.max(0, baseStateRate + sensitivity.stateRateChange);

  // Apply ST loss and LT gain variance to strategy rates
  const adjustedStLossRate = strategy.stLossRate * (1 + sensitivity.stLossRateVariance);
  const adjustedLtGainRate = strategy.ltGainRate * (1 + sensitivity.ltGainRateVariance);

  // Create adjusted strategy with modified rates
  const adjustedStrategy: StrategyRates = {
    stLossRate: adjustedStLossRate,
    ltGainRate: adjustedLtGainRate,
    financingCostRate: strategy.financingCostRate,
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

  // Use projectionYears from settings (defaults to 10)
  const projectionYears = settings.projectionYears ?? 10;

  for (let year = 1; year <= projectionYears; year++) {
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

    const result = calculateYearWithSensitivity(
      year,
      qfafValue,
      collateralValue,
      stCarryforward,
      ltCarryforward,
      nolCarryforward,
      inputs,
      adjustedStrategy,
      yearTaxRates,
      adjustedSettings,
      sensitivity.stLossRateVariance,
      sensitivity.ltGainRateVariance
    );

    years.push(result);

    // Update state for next year
    qfafValue = result.qfafValue;
    collateralValue = result.collateralValue;
    stCarryforward = result.stLossCarryforward;
    ltCarryforward = result.ltLossCarryforward;
    nolCarryforward = result.nolCarryforward;
  }

  return {
    sizing,
    years,
    summary: calculateSummary(years, sizing),
  };
}

/**
 * Calculate a single year with sensitivity-adjusted rates.
 * Applies the same decay logic as base calculation, but with variance-adjusted base rates.
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
  ltGainVariance: number
): YearResult {
  // QFAF generates ST gains and ordinary losses at qfafMultiplier rate
  const qfafMultiplier = settings.qfafMultiplier ?? QFAF_ST_GAIN_RATE;
  const stGainsGenerated = safeNumber(qfafValue * qfafMultiplier);
  const ordinaryLossesGenerated = safeNumber(qfafValue * qfafMultiplier);

  // Get base rates with decay (same as normal calculation)
  const baseStLossRate = getEffectiveStLossRate(inputs.strategyId, strategy.ltGainRate, year);
  // Apply variance to the decayed rate
  const adjustedStLossRate = baseStLossRate * (1 + stLossVariance);
  const adjustedLtGainRate = strategy.ltGainRate * (1 + ltGainVariance);

  const grossStLosses = collateralValue * adjustedStLossRate;
  const stLossesHarvested = safeNumber(grossStLosses * (1 - settings.washSaleDisallowanceRate));
  const ltGainsRealized = safeNumber(collateralValue * adjustedLtGainRate);

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
  const financingCost = settings.financingFeesEnabled ? strategy.financingCostRate : 0;
  const growthRate = baseReturn - financingCost;
  const qfafGrowthRate = settings.qfafGrowthEnabled ? growthRate : 0;
  const newQfafValue = safeNumber(qfafValue * (1 + qfafGrowthRate));
  const newCollateralValue = safeNumber(collateralValue * (1 + growthRate));

  // Calculate total income offset for this year
  const incomeOffsetAmount = safeNumber(
    usableOrdinaryLoss + nolUsed + capitalLossUsedAgainstIncome
  );

  // Calculate maximum income offset capacity for this year
  const capitalLossLimit = CAPITAL_LOSS_LIMITS[inputs.filingStatus];
  const remainingCapitalLoss = newStCarryforward + newLtCarryforward;
  const maxCapitalLossOffset = Math.min(capitalLossLimit, remainingCapitalLoss);
  const maxIncomeOffsetCapacity = safeNumber(
    usableOrdinaryLoss + newNolCarryforward + maxCapitalLossOffset
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
    taxSavings: Math.max(0, taxSavings),
    stLossCarryforward: newStCarryforward,
    ltLossCarryforward: newLtCarryforward,
    nolCarryforward: newNolCarryforward,
    nolUsedThisYear: nolUsed,
    capitalLossUsedAgainstIncome,
    effectiveStLossRate: adjustedStLossRate,
    incomeOffsetAmount,
    maxIncomeOffsetCapacity,
    qfafTaxBenefit,
    collateralTaxBenefit,
  };
}
