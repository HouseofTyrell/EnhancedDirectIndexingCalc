import { CalculatorInputs, YearResult, CalculationResult } from './types';
import { getFederalStRate, getFederalLtRate, getStateRate } from './taxData';

export function calculate(inputs: CalculatorInputs): CalculationResult {
  const years: YearResult[] = [];
  let qfafValue = inputs.investmentAmount * (1 - inputs.ediAllocation);
  let ediValue = inputs.investmentAmount * inputs.ediAllocation;
  let stCarryforward = inputs.existingStLossCarryforward;
  let ltCarryforward = inputs.existingLtLossCarryforward;

  for (let year = 1; year <= 10; year++) {
    const result = calculateYear(
      year,
      qfafValue,
      ediValue,
      stCarryforward,
      ltCarryforward,
      inputs
    );

    years.push(result);
    qfafValue = result.qfafValue;
    ediValue = result.ediValue;
    stCarryforward = result.stLossCarryforward;
    ltCarryforward = result.ltLossCarryforward;
  }

  return {
    years,
    summary: calculateSummary(years, inputs),
  };
}

function calculateYear(
  year: number,
  qfafValue: number,
  ediValue: number,
  stCarryforward: number,
  ltCarryforward: number,
  inputs: CalculatorInputs
): YearResult {
  // QFAF generates returns and ST gains
  const qfafReturn = qfafValue * inputs.qfafReturn;
  const stGainsGenerated = qfafReturn * inputs.qfafStGainPct;

  // EDI generates returns and harvests losses
  const ediReturn = ediValue * inputs.ediReturn;
  const harvestingRate = getHarvestingRate(year, inputs.ediHarvestingYear1);
  const stLossesHarvested = ediValue * harvestingRate * 0.85; // 85% ST
  const ltLossesHarvested = ediValue * harvestingRate * 0.15; // 15% LT

  // EDI realizes some gains (2% of portfolio, 90% LT)
  const realizedGains = ediValue * 0.02;
  const ltGainsRealized = realizedGains * 0.90;

  // Net positions (apply carryforwards)
  const grossNetSt = stGainsGenerated - stLossesHarvested;
  const grossNetLt = ltGainsRealized - ltLossesHarvested;

  // Apply carryforwards to offset gains
  let netStGainLoss = grossNetSt;
  let netLtGainLoss = grossNetLt;
  let usedStCarryforward = 0;
  let usedLtCarryforward = 0;

  // First, use ST carryforward to offset ST gains
  if (netStGainLoss > 0 && stCarryforward > 0) {
    usedStCarryforward = Math.min(stCarryforward, netStGainLoss);
    netStGainLoss -= usedStCarryforward;
  }

  // Then, use LT carryforward to offset LT gains
  if (netLtGainLoss > 0 && ltCarryforward > 0) {
    usedLtCarryforward = Math.min(ltCarryforward, netLtGainLoss);
    netLtGainLoss -= usedLtCarryforward;
  }

  // Calculate taxes
  const { federalTax, stateTax, newStCarryforward, newLtCarryforward } =
    calculateTaxes(netStGainLoss, netLtGainLoss, stCarryforward - usedStCarryforward, ltCarryforward - usedLtCarryforward, inputs);

  // Baseline: what if all gains taxed at ST rates (no optimization)?
  const baselineTax = calculateBaselineTax(stGainsGenerated + ltGainsRealized, inputs);

  // Update portfolio values (reinvest returns minus taxes)
  const newQfafValue = qfafValue + qfafReturn;
  const newEdiValue = ediValue + ediReturn;

  return {
    year,
    qfafValue: newQfafValue,
    ediValue: newEdiValue,
    totalValue: newQfafValue + newEdiValue,
    stGainsGenerated,
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
  };
}

function getHarvestingRate(year: number, year1Rate: number): number {
  // Decay curve based on research
  const decayMultipliers = [1.0, 0.8, 0.6, 0.4, 0.3, 0.2, 0.2, 0.2, 0.2, 0.2];
  return year1Rate * (decayMultipliers[year - 1] ?? 0.2);
}

function calculateTaxes(
  netStGainLoss: number,
  netLtGainLoss: number,
  remainingStCarryforward: number,
  remainingLtCarryforward: number,
  inputs: CalculatorInputs
): { federalTax: number; stateTax: number; newStCarryforward: number; newLtCarryforward: number } {
  let taxableSt = netStGainLoss;
  let taxableLt = netLtGainLoss;
  let newStCarryforward = remainingStCarryforward;
  let newLtCarryforward = remainingLtCarryforward;

  // Handle net ST loss (§1211 limitation)
  if (netStGainLoss < 0) {
    // Can offset up to $3,000 against ordinary income per year
    const offsetUsed = Math.min(Math.abs(netStGainLoss), 3000);
    newStCarryforward = remainingStCarryforward + Math.abs(netStGainLoss) - offsetUsed;
    taxableSt = 0;
  }

  // Handle net LT loss
  if (netLtGainLoss < 0) {
    newLtCarryforward = remainingLtCarryforward + Math.abs(netLtGainLoss);
    taxableLt = 0;
  }

  // Federal rates
  const stRate = getFederalStRate(inputs.annualIncome, inputs.filingStatus);
  const ltRate = getFederalLtRate(inputs.annualIncome, inputs.filingStatus);

  const federalTax = Math.max(0, (taxableSt * stRate) + (taxableLt * ltRate));

  // State tax
  const stateRate = inputs.stateCode === 'OTHER'
    ? inputs.stateRate
    : getStateRate(inputs.stateCode);
  const stateTax = Math.max(0, (taxableSt + taxableLt) * stateRate);

  return { federalTax, stateTax, newStCarryforward, newLtCarryforward };
}

function calculateBaselineTax(totalGains: number, inputs: CalculatorInputs): number {
  // All gains taxed at ordinary income rates (no optimization)
  const stRate = getFederalStRate(inputs.annualIncome, inputs.filingStatus);
  const stateRate = inputs.stateCode === 'OTHER'
    ? inputs.stateRate
    : getStateRate(inputs.stateCode);
  return totalGains * (stRate + stateRate);
}

function calculateSummary(years: YearResult[], inputs: CalculatorInputs) {
  const totalTaxSavings = years.reduce((sum, y) => sum + y.taxSavings, 0);
  const finalPortfolioValue = years[years.length - 1].totalValue;
  const effectiveTaxAlpha = totalTaxSavings / inputs.investmentAmount / 10;

  return { totalTaxSavings, finalPortfolioValue, effectiveTaxAlpha };
}
