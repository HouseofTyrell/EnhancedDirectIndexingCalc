import {
  CalculatorInputs,
  YearResult,
  CalculationResult,
  AdvancedSettings,
  DEFAULT_SETTINGS,
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

export function calculate(
  inputs: CalculatorInputs,
  settings: AdvancedSettings = DEFAULT_SETTINGS
): CalculationResult {
  const sizing = calculateSizing(inputs, settings.qfafMultiplier);
  const strategy = getStrategy(inputs.strategyId);

  // Validate strategy exists (003 - fix non-null assertion)
  if (!strategy) {
    throw new Error(`Invalid strategy ID: ${inputs.strategyId}`);
  }

  // Pre-calculate tax rates once before the loop (013 - redundant lookups)
  // Use settings section461Limits if provided, otherwise fall back to defaults
  const section461Limit =
    settings.section461Limits[inputs.filingStatus] ?? SECTION_461L_LIMITS[inputs.filingStatus];

  // Determine tax rates: use custom settings if different from defaults, otherwise use bracket lookup
  const useCustomRates =
    settings.stcgRate !== DEFAULT_SETTINGS.stcgRate ||
    settings.ltcgRate !== DEFAULT_SETTINGS.ltcgRate ||
    settings.niitRate !== DEFAULT_SETTINGS.niitRate;

  const bracketStRate = getFederalStRate(inputs.annualIncome, inputs.filingStatus);
  const bracketLtRate = getFederalLtRate(inputs.annualIncome, inputs.filingStatus);
  const stateRate =
    inputs.stateCode === 'OTHER' ? inputs.stateRate : getStateRate(inputs.stateCode);

  // When using custom rates, apply them directly; otherwise use bracket-based rates
  // NIIT is added on top of LT rate when applicable (income > $250k MFJ, $200k single)
  const taxRates: TaxRates = {
    stRate: useCustomRates ? settings.stcgRate : bracketStRate,
    ltRate: useCustomRates ? settings.ltcgRate + settings.niitRate : bracketLtRate,
    stateRate,
    section461Limit,
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
    const result = calculateYear(
      year,
      qfafValue,
      collateralValue,
      stCarryforward,
      ltCarryforward,
      nolCarryforward,
      inputs,
      strategy,
      taxRates,
      settings
    );

    years.push(result);
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

export function calculateYear(
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
  yearIncome?: number // Optional income override for this year
): YearResult {
  // Use year income override if provided, otherwise use base annual income
  const effectiveIncome = yearIncome ?? inputs.annualIncome;
  // QFAF generates ST gains and ordinary losses at qfafMultiplier rate (default 150% of MV each)
  // Use safeNumber to prevent NaN/Infinity propagation (004)
  const qfafMultiplier = settings.qfafMultiplier ?? QFAF_ST_GAIN_RATE;
  const stGainsGenerated = safeNumber(qfafValue * qfafMultiplier);
  const ordinaryLossesGenerated = safeNumber(qfafValue * qfafMultiplier);

  // Collateral generates ST losses and LT gains per strategy rates
  // Uses custom rates if set, otherwise applies 7% annual decay
  // Also applies wash sale disallowance (typically 5-15% disallowed)
  const effectiveStLossRate = getEffectiveStLossRate(inputs.strategyId, strategy.ltGainRate, year);
  const grossStLosses = collateralValue * effectiveStLossRate;
  const stLossesHarvested = safeNumber(grossStLosses * (1 - settings.washSaleDisallowanceRate));
  const ltGainsRealized = safeNumber(collateralValue * strategy.ltGainRate);

  // Net ST position (should be ~0 with proper auto-sizing)
  const grossNetSt = stGainsGenerated - stLossesHarvested;

  // Apply ST carryforward to offset any remaining ST gains
  let netStGainLoss = grossNetSt;
  let usedStCarryforward = 0;
  if (netStGainLoss > 0 && stCarryforward > 0) {
    usedStCarryforward = Math.min(stCarryforward, netStGainLoss);
    netStGainLoss -= usedStCarryforward;
  }

  // Section 461(l) limitation on ordinary losses
  // Cannot deduct more than: (1) losses generated, (2) statutory limit, (3) taxable income
  const usableOrdinaryLoss = Math.min(
    ordinaryLossesGenerated,
    taxRates.section461Limit,
    effectiveIncome
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
      settings,
      effectiveIncome
    );

  // Update NOL carryforward: add excess, subtract used
  const newNolCarryforward = safeNumber(nolCarryforward + excessToNol - nolUsed);

  // Calculate tax savings directly as sum of benefits minus costs
  // This matches the Year 1 Tax Benefit breakdown in the UI
  const { stRate, ltRate, stateRate } = taxRates;
  const combinedStRate = stRate + stateRate;
  const combinedLtRate = ltRate + stateRate;
  const rateDifferential = stRate - ltRate;

  // Benefits:
  // 1. Ordinary loss reduces W2 income tax
  const ordinaryLossBenefit = safeNumber(usableOrdinaryLoss * combinedStRate);

  // 2. ST→LT conversion: ST losses offset ST gains, converting tax treatment
  //    The benefit is the rate differential on the amount of ST gains offset
  const stGainsOffset = Math.min(stGainsGenerated, stLossesHarvested);
  const stToLtConversionBenefit = safeNumber(stGainsOffset * rateDifferential);

  // 3. Capital loss carryforward used against ordinary income ($3k/yr limit)
  const capitalLossBenefit = safeNumber(capitalLossUsedAgainstIncome * combinedStRate);

  // 4. NOL used against taxable income
  const nolUsageBenefit = safeNumber(nolUsed * combinedStRate);

  // Costs:
  // 1. LT gains are taxed at LT rates
  const ltGainCost = safeNumber(ltGainsRealized * combinedLtRate);

  // 2. Any remaining net ST gains (if ST gains > ST losses) taxed at ST rates
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
  // QFAF benefit: ordinary loss offset + NOL usage + ST→LT conversion (what QFAF enables)
  const qfafTaxBenefit = safeNumber(ordinaryLossBenefit + nolUsageBenefit + stToLtConversionBenefit);
  // Collateral benefit: capital loss offset - LT gain cost - any remaining ST gain cost
  const collateralTaxBenefit = safeNumber(capitalLossBenefit - ltGainCost - remainingStGainCost);

  // For display/debugging: calculate what taxes would be without benefits
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
  // QFAF growth can be disabled (e.g., to model fees/hedging costs eating returns)
  const qfafGrowthRate = settings.qfafGrowthEnabled ? growthRate : 0;
  const newQfafValue = safeNumber(qfafValue * (1 + qfafGrowthRate));
  const newCollateralValue = safeNumber(collateralValue * (1 + growthRate));

  // Calculate total income offset for this year
  // This is the sum of all deductions that reduce taxable income
  const incomeOffsetAmount = safeNumber(
    usableOrdinaryLoss + nolUsed + capitalLossUsedAgainstIncome
  );

  // Calculate maximum income offset capacity for this year
  // This shows how much income COULD be offset if the taxpayer had additional income
  // (useful for planning stock option exercises or vesting)
  // Components:
  // 1. Ordinary loss (up to 461(l) limit)
  // 2. NOL carryforward (can offset 80% of additional taxable income)
  // 3. Capital loss carryforward (up to $3k or remaining carryforward)
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
    effectiveStLossRate,
    incomeOffsetAmount,
    maxIncomeOffsetCapacity,
    qfafTaxBenefit,
    collateralTaxBenefit,
  };
}
