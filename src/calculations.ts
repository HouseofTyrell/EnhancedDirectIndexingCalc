import { CalculatorInputs, YearResult, CalculationResult, CalculatedSizing } from './types';
import { getFederalStRate, getFederalLtRate, getStateRate } from './taxData';
import {
  getStrategy,
  QFAF_ST_GAIN_RATE,
  QFAF_ORDINARY_LOSS_RATE,
  SECTION_461L_LIMITS,
  NOL_OFFSET_PERCENTAGE,
} from './strategyData';

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

  // Auto-size QFAF so ST gains = ST losses
  const qfafValue = inputs.qfafOverride ?? (year1StLosses / QFAF_ST_GAIN_RATE);

  // QFAF generates ST gains and ordinary losses at 150% of MV
  const year1StGains = qfafValue * QFAF_ST_GAIN_RATE;
  const year1OrdinaryLosses = qfafValue * QFAF_ORDINARY_LOSS_RATE;

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

export function calculate(inputs: CalculatorInputs): CalculationResult {
  const sizing = calculateSizing(inputs);
  const strategy = getStrategy(inputs.strategyId)!;
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
      strategy
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

interface Strategy {
  stLossRate: number;
  ltGainRate: number;
}

function calculateYear(
  year: number,
  qfafValue: number,
  collateralValue: number,
  stCarryforward: number,
  ltCarryforward: number,
  nolCarryforward: number,
  inputs: CalculatorInputs,
  strategy: Strategy
): YearResult {
  // QFAF generates ST gains and ordinary losses (150% of MV each)
  const stGainsGenerated = qfafValue * QFAF_ST_GAIN_RATE;
  const ordinaryLossesGenerated = qfafValue * QFAF_ORDINARY_LOSS_RATE;

  // Collateral generates ST losses and LT gains per strategy rates
  const stLossesHarvested = collateralValue * strategy.stLossRate;
  const ltGainsRealized = collateralValue * strategy.ltGainRate;

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
  const section461Limit = SECTION_461L_LIMITS[inputs.filingStatus] || SECTION_461L_LIMITS.single;
  const usableOrdinaryLoss = Math.min(ordinaryLossesGenerated, section461Limit);
  const excessToNol = ordinaryLossesGenerated - usableOrdinaryLoss;

  // Calculate taxes with ordinary loss benefit and NOL usage
  const { federalTax, stateTax, newStCarryforward, newLtCarryforward, nolUsed } =
    calculateTaxes(
      netStGainLoss,
      ltGainsRealized,
      usableOrdinaryLoss,
      stCarryforward - usedStCarryforward,
      ltCarryforward,
      nolCarryforward,
      inputs
    );

  // Update NOL carryforward: add excess, subtract used
  const newNolCarryforward = nolCarryforward + excessToNol - nolUsed;

  // Baseline: what if we just had passive investments taxed at LT rates (no optimization)?
  const baselineTax = calculateBaselineTax(ltGainsRealized, inputs);

  // Portfolio growth assumptions (conservative ~7% annual return)
  const portfolioGrowthRate = 0.07;
  const newQfafValue = qfafValue * (1 + portfolioGrowthRate);
  const newCollateralValue = collateralValue * (1 + portfolioGrowthRate);

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
    taxSavings: Math.max(0, baselineTax - (federalTax + stateTax)),
    stLossCarryforward: newStCarryforward,
    ltLossCarryforward: newLtCarryforward,
    nolCarryforward: newNolCarryforward,
    nolUsedThisYear: nolUsed,
  };
}

function calculateTaxes(
  netStGainLoss: number,
  ltGains: number,
  usableOrdinaryLoss: number,
  remainingStCarryforward: number,
  remainingLtCarryforward: number,
  nolCarryforward: number,
  inputs: CalculatorInputs
): {
  federalTax: number;
  stateTax: number;
  newStCarryforward: number;
  newLtCarryforward: number;
  nolUsed: number;
} {
  let taxableSt = netStGainLoss;
  let taxableLt = ltGains;
  let newStCarryforward = remainingStCarryforward;
  let newLtCarryforward = remainingLtCarryforward;

  // Apply LT carryforward to offset LT gains
  if (taxableLt > 0 && remainingLtCarryforward > 0) {
    const ltOffset = Math.min(remainingLtCarryforward, taxableLt);
    taxableLt -= ltOffset;
    newLtCarryforward -= ltOffset;
  }

  // Handle net ST loss (§1211 limitation: $3,000/year against ordinary income)
  if (netStGainLoss < 0) {
    const offsetUsed = Math.min(Math.abs(netStGainLoss), 3000);
    newStCarryforward = remainingStCarryforward + Math.abs(netStGainLoss) - offsetUsed;
    taxableSt = 0;
  }

  // Federal rates
  const stRate = getFederalStRate(inputs.annualIncome, inputs.filingStatus);
  const ltRate = getFederalLtRate(inputs.annualIncome, inputs.filingStatus);

  // Ordinary loss benefit: reduces ordinary income tax
  // At top bracket (~40.8%), this is the primary tax alpha driver
  const ordinaryLossBenefit = usableOrdinaryLoss * stRate;

  // Calculate NOL usage with 80% limitation
  // NOL can offset up to 80% of taxable income
  const taxableIncomeBeforeNol = inputs.annualIncome + (taxableSt * stRate) + (taxableLt * ltRate);
  const maxNolUsage = taxableIncomeBeforeNol * NOL_OFFSET_PERCENTAGE;
  const nolUsed = Math.min(nolCarryforward, maxNolUsage);
  const nolBenefit = nolUsed * stRate;

  // Calculate taxes
  // ST gains taxed at ordinary rates, LT gains at preferential rates
  const grossFederalTax = (taxableSt * stRate) + (taxableLt * ltRate);

  // Apply benefits from ordinary losses and NOL
  const federalTax = Math.max(0, grossFederalTax - ordinaryLossBenefit - nolBenefit);

  // State tax (simplified: all investment income at state rate)
  const stateRate = inputs.stateCode === 'OTHER'
    ? inputs.stateRate
    : getStateRate(inputs.stateCode);
  const stateTax = Math.max(0, (taxableSt + taxableLt - usableOrdinaryLoss) * stateRate);

  return { federalTax, stateTax, newStCarryforward, newLtCarryforward, nolUsed };
}

function calculateBaselineTax(ltGains: number, inputs: CalculatorInputs): number {
  // Baseline: LT gains taxed at LT rate (no optimization strategy)
  const ltRate = getFederalLtRate(inputs.annualIncome, inputs.filingStatus);
  const stateRate = inputs.stateCode === 'OTHER'
    ? inputs.stateRate
    : getStateRate(inputs.stateCode);
  return ltGains * (ltRate + stateRate);
}

function calculateSummary(years: YearResult[], sizing: CalculatedSizing) {
  const totalTaxSavings = years.reduce((sum, y) => sum + y.taxSavings, 0);
  const totalNolGenerated = years.reduce((sum, y) => sum + y.excessToNol, 0);
  const finalPortfolioValue = years[years.length - 1].totalValue;
  const effectiveTaxAlpha = sizing.totalExposure > 0
    ? totalTaxSavings / sizing.totalExposure / 10
    : 0;

  return { totalTaxSavings, finalPortfolioValue, effectiveTaxAlpha, totalNolGenerated };
}
