import {
  CalculatorInputs,
  YearResult,
  CalculationResult,
  CalculatedSizing,
  AdvancedSettings,
  DEFAULT_SETTINGS,
  YearOverride,
} from './types';
import { getFederalStRate, getFederalLtRate, getStateRate } from './taxData';
import {
  getStrategy,
  Strategy,
  QFAF_ST_GAIN_RATE,
  QFAF_ORDINARY_LOSS_RATE,
  SECTION_461L_LIMITS,
  CAPITAL_LOSS_LIMITS,
  NOL_OFFSET_PERCENTAGE,
} from './strategyData';
import { safeNumber } from './utils/formatters';
import { getNetCapitalLossRate } from './utils/strategyRates';

/**
 * Get effective ST loss rate, using custom rates if set.
 * Custom rates are stored as "net capital loss rate" (ST - LT).
 * We derive ST loss rate by adding back the LT gain rate.
 */
function getEffectiveStLossRate(strategyId: string, ltGainRate: number, year: number): number {
  // Get the net capital loss rate (may be custom or default with decay)
  const netCapitalLossRate = getNetCapitalLossRate(strategyId, year);
  // ST Loss Rate = Net Capital Loss Rate + LT Gain Rate
  return netCapitalLossRate + ltGainRate;
}

// Type for strategy rates needed in calculations
type StrategyRates = Pick<Strategy, 'stLossRate' | 'ltGainRate' | 'financingCostRate'>;

// Pre-calculated tax rates passed through the calculation chain
interface TaxRates {
  stRate: number;
  ltRate: number;
  stateRate: number;
  section461Limit: number;
}

/**
 * Calculate QFAF sizing based on strategy selection and collateral amount.
 *
 * QFAF is auto-sized so its ST gains equal collateral's ST losses.
 * Formula: QFAF = (Collateral × ST_Loss_Rate) / 150%
 */
export function calculateSizing(inputs: CalculatorInputs): CalculatedSizing {
  const strategy = getStrategy(inputs.strategyId);
  if (!strategy) {
    throw new Error(`Invalid strategy ID: ${inputs.strategyId}`);
  }

  const collateralValue = inputs.collateralAmount;

  // Calculate collateral ST losses
  const year1StLosses = collateralValue * strategy.stLossRate;

  // QFAF can be disabled for collateral-only scenarios
  let qfafValue = 0;
  let year1StGains = 0;
  let year1OrdinaryLosses = 0;

  if (inputs.qfafEnabled !== false) {
    // Auto-size QFAF so ST gains = ST losses (or use override)
    qfafValue = inputs.qfafOverride ?? year1StLosses / QFAF_ST_GAIN_RATE;
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
  };
}

export function calculate(
  inputs: CalculatorInputs,
  settings: AdvancedSettings = DEFAULT_SETTINGS
): CalculationResult {
  const sizing = calculateSizing(inputs);
  const strategy = getStrategy(inputs.strategyId);

  // Validate strategy exists (003 - fix non-null assertion)
  if (!strategy) {
    throw new Error(`Invalid strategy ID: ${inputs.strategyId}`);
  }

  // Pre-calculate tax rates once before the loop (013 - redundant lookups)
  // Use settings section461Limits if provided, otherwise fall back to defaults
  const section461Limit =
    settings.section461Limits[inputs.filingStatus] ?? SECTION_461L_LIMITS[inputs.filingStatus];

  const taxRates: TaxRates = {
    stRate: getFederalStRate(inputs.annualIncome, inputs.filingStatus),
    ltRate: getFederalLtRate(inputs.annualIncome, inputs.filingStatus),
    stateRate: inputs.stateCode === 'OTHER' ? inputs.stateRate : getStateRate(inputs.stateCode),
    section461Limit,
  };

  const years: YearResult[] = [];

  let qfafValue = sizing.qfafValue;
  let collateralValue = sizing.collateralValue;
  let stCarryforward = inputs.existingStLossCarryforward;
  let ltCarryforward = inputs.existingLtLossCarryforward;
  let nolCarryforward = inputs.existingNolCarryforward;

  for (let year = 1; year <= 10; year++) {
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

function calculateYear(
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

  // Portfolio growth using configured annual return minus financing costs
  const netGrowthRate = settings.defaultAnnualReturn - strategy.financingCostRate;
  // QFAF growth can be disabled (e.g., to model fees/hedging costs eating returns)
  const qfafGrowthRate = settings.qfafGrowthEnabled ? netGrowthRate : 0;
  const newQfafValue = safeNumber(qfafValue * (1 + qfafGrowthRate));
  const newCollateralValue = safeNumber(collateralValue * (1 + netGrowthRate));

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
  };
}

/**
 * Calculate carryforward usage and updates.
 * Returns updated carryforward balances and amounts used this year.
 */
function calculateCarryforwards(
  netStGainLoss: number,
  ltGains: number,
  usableOrdinaryLoss: number,
  remainingStCarryforward: number,
  remainingLtCarryforward: number,
  nolCarryforward: number,
  inputs: CalculatorInputs,
  settings: AdvancedSettings,
  effectiveIncome?: number // Optional income override
): {
  newStCarryforward: number;
  newLtCarryforward: number;
  nolUsed: number;
  capitalLossUsedAgainstIncome: number;
} {
  let taxableSt = netStGainLoss;
  let taxableLt = ltGains;
  let stCarryforward = remainingStCarryforward;
  let ltCarryforward = remainingLtCarryforward;
  let capitalLossUsedAgainstIncome = 0;

  // Step 1: Apply ST carryforward to offset ST gains
  if (taxableSt > 0 && stCarryforward > 0) {
    const offset = Math.min(stCarryforward, taxableSt);
    taxableSt -= offset;
    stCarryforward -= offset;
  }

  // Step 2: Apply LT carryforward to offset LT gains
  if (taxableLt > 0 && ltCarryforward > 0) {
    const offset = Math.min(ltCarryforward, taxableLt);
    taxableLt -= offset;
    ltCarryforward -= offset;
  }

  // Step 3: Cross-apply remaining ST carryforward to LT gains
  if (taxableLt > 0 && stCarryforward > 0) {
    const offset = Math.min(stCarryforward, taxableLt);
    taxableLt -= offset;
    stCarryforward -= offset;
  }

  // Step 4: Cross-apply remaining LT carryforward to ST gains
  if (taxableSt > 0 && ltCarryforward > 0) {
    const offset = Math.min(ltCarryforward, taxableSt);
    taxableSt -= offset;
    ltCarryforward -= offset;
  }

  // Step 5: Handle current year net ST loss
  if (netStGainLoss < 0) {
    // Current year ST loss can offset LT gains
    const currentLoss = Math.abs(netStGainLoss);
    let remainingLoss = currentLoss;

    if (taxableLt > 0) {
      const offset = Math.min(remainingLoss, taxableLt);
      taxableLt -= offset;
      remainingLoss -= offset;
    }

    // Track unused current-year losses as ST carryforward
    if (remainingLoss > 0) {
      stCarryforward += remainingLoss;
    }

    taxableSt = 0;
  }

  // Step 6: Apply capital loss carryforward against ordinary income
  // Per IRC §1211(b): $3,000 limit for most filers, $1,500 for MFS
  const capitalLossLimit = CAPITAL_LOSS_LIMITS[inputs.filingStatus];
  const totalRemainingCarryforward = stCarryforward + ltCarryforward;
  if (totalRemainingCarryforward > 0) {
    capitalLossUsedAgainstIncome = Math.min(totalRemainingCarryforward, capitalLossLimit);
    // Reduce from ST first, then LT
    if (stCarryforward >= capitalLossUsedAgainstIncome) {
      stCarryforward -= capitalLossUsedAgainstIncome;
    } else {
      const fromLt = capitalLossUsedAgainstIncome - stCarryforward;
      stCarryforward = 0;
      ltCarryforward -= fromLt;
    }
  }

  // Step 7: Calculate NOL usage with configurable limit (default 80%)
  // NOL can offset up to nolOffsetLimit of taxable income
  const yearIncome = effectiveIncome ?? inputs.annualIncome;
  const taxableIncomeBeforeNol =
    yearIncome + taxableSt + taxableLt - usableOrdinaryLoss - capitalLossUsedAgainstIncome;
  const nolOffsetLimit = settings.nolOffsetLimit ?? NOL_OFFSET_PERCENTAGE;
  const maxNolUsage = Math.max(0, taxableIncomeBeforeNol) * nolOffsetLimit;
  const nolUsed = Math.min(nolCarryforward, maxNolUsage);

  return {
    newStCarryforward: safeNumber(stCarryforward),
    newLtCarryforward: safeNumber(ltCarryforward),
    nolUsed: safeNumber(nolUsed),
    capitalLossUsedAgainstIncome: safeNumber(capitalLossUsedAgainstIncome),
  };
}

function calculateSummary(years: YearResult[], sizing: CalculatedSizing) {
  const totalTaxSavings = years.reduce((sum, y) => sum + y.taxSavings, 0);
  const totalNolGenerated = years.reduce((sum, y) => sum + y.excessToNol, 0);
  // Safe array access (005 - fix unchecked array access)
  const lastYear = years.length > 0 ? years[years.length - 1] : undefined;
  const finalPortfolioValue = lastYear?.totalValue ?? 0;
  const effectiveTaxAlpha =
    sizing.totalExposure > 0 ? totalTaxSavings / sizing.totalExposure / 10 : 0;

  return { totalTaxSavings, finalPortfolioValue, effectiveTaxAlpha, totalNolGenerated };
}

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

  for (let year = 1; year <= 10; year++) {
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
