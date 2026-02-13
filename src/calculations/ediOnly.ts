import { STRATEGIES, getStLossRateForYear, CAPITAL_LOSS_LIMITS } from '../strategyData';
import type { FilingStatus } from '../types';
import { safeNumber } from '../utils/formatters';

// ============================================
// TYPES
// ============================================

export interface EdiYearInput {
  year: number;
  strategyId: string;
  collateralValue: number;
  combinedStRate: number;
  combinedLtRate: number;
  filingStatus: FilingStatus;
  washSaleRate: number;
  priorStCarryforward: number;
  priorLtCarryforward: number;
  niitRate?: number; // Default 0.038; excluded from $3K deduction (offsets ordinary income, not NII)
}

export interface EdiYearResult {
  year: number;
  collateralValue: number;

  // Gross generation
  stLossesHarvested: number;
  ltGainsRealized: number;

  // IRC netting (ST losses shelter LT gains)
  stLossesUsedToOffsetLtGains: number;
  netLtGainAfterOffset: number;
  excessStLossAfterOffset: number;

  // Prior carryforward application
  priorCfUsedAgainstLtGains: number;

  // Tax on remaining LT gains (after all offsets)
  taxOnRemainingLtGains: number;

  // $3K ordinary income deduction
  capitalLossDeduction: number;
  taxSavedByCapitalLossDeduction: number;

  // Net annual realized benefit (positive = saves money)
  annualRealizedBenefit: number;

  // Carryforward balances at year end
  endingStCarryforward: number;
  endingLtCarryforward: number;

  // Harvesting efficiency
  harvestingEfficiency: number;
}

// ============================================
// CORE YEAR CALCULATION
// ============================================

export function computeEdiYear(input: EdiYearInput): EdiYearResult {
  const {
    year, strategyId, collateralValue, combinedStRate, combinedLtRate,
    filingStatus, washSaleRate, priorStCarryforward, priorLtCarryforward,
  } = input;

  const strategy = STRATEGIES.find(s => s.id === strategyId);
  if (!strategy) throw new Error(`Unknown strategy: ${strategyId}`);

  // --- Step 1: Gross generation ---
  const stLossRate = getStLossRateForYear(strategy, year);
  const ltGainRate = strategy.ltGainRate;
  const stLossesHarvested = safeNumber(collateralValue * stLossRate * (1 - washSaleRate));
  const ltGainsRealized = safeNumber(collateralValue * ltGainRate);

  // --- Step 2: IRC netting - ST losses offset LT gains ---
  const stLossesUsedToOffsetLtGains = Math.min(stLossesHarvested, ltGainsRealized);
  const netLtGainAfterOffset = safeNumber(ltGainsRealized - stLossesUsedToOffsetLtGains);
  const excessStLossAfterOffset = safeNumber(stLossesHarvested - stLossesUsedToOffsetLtGains);

  // --- Step 3: Apply prior carryforward to any remaining LT gains ---
  let remainingLtGain = netLtGainAfterOffset;
  let stCf = priorStCarryforward;
  let ltCf = priorLtCarryforward;

  // LT carryforward offsets LT gains first
  const ltCfUsed = Math.min(ltCf, remainingLtGain);
  remainingLtGain -= ltCfUsed;
  ltCf -= ltCfUsed;

  // ST carryforward cross-applies to remaining LT gains
  const stCfUsedAgainstLt = Math.min(stCf, remainingLtGain);
  remainingLtGain -= stCfUsedAgainstLt;
  stCf -= stCfUsedAgainstLt;

  const priorCfUsedAgainstLtGains = ltCfUsed + stCfUsedAgainstLt;

  // --- Step 4: Add excess ST losses to carryforward ---
  stCf += excessStLossAfterOffset;

  // --- Step 5: $3K ordinary income deduction ---
  const capitalLossLimit = CAPITAL_LOSS_LIMITS[filingStatus];
  const totalAvailable = stCf + ltCf;
  const capitalLossDeduction = Math.min(totalAvailable, capitalLossLimit);

  // Consume from ST first, then LT
  let deductionRemaining = capitalLossDeduction;
  if (deductionRemaining > 0 && stCf > 0) {
    const used = Math.min(deductionRemaining, stCf);
    stCf -= used;
    deductionRemaining -= used;
  }
  if (deductionRemaining > 0 && ltCf > 0) {
    const used = Math.min(deductionRemaining, ltCf);
    ltCf -= used;
    deductionRemaining -= used;
  }

  // --- Step 6: Tax calculations ---
  const taxOnRemainingLtGains = safeNumber(remainingLtGain * combinedLtRate);
  // $3K capital loss deduction offsets ordinary income, NOT net investment income,
  // so NIIT (3.8%) does not apply. Use combined rate minus NIIT for this deduction.
  const effectiveNiitRate = input.niitRate ?? 0.038;
  const deductionRate = combinedStRate - effectiveNiitRate;
  const taxSavedByCapitalLossDeduction = safeNumber(capitalLossDeduction * deductionRate);
  const annualRealizedBenefit = safeNumber(taxSavedByCapitalLossDeduction - taxOnRemainingLtGains);

  // --- Step 7: Harvesting efficiency ---
  const harvestingEfficiency = ltGainsRealized > 0
    ? safeNumber(stLossesHarvested / ltGainsRealized)
    : Infinity;

  return {
    year,
    collateralValue,
    stLossesHarvested,
    ltGainsRealized,
    stLossesUsedToOffsetLtGains,
    netLtGainAfterOffset,
    excessStLossAfterOffset,
    priorCfUsedAgainstLtGains,
    taxOnRemainingLtGains,
    capitalLossDeduction,
    taxSavedByCapitalLossDeduction,
    annualRealizedBenefit,
    endingStCarryforward: safeNumber(stCf),
    endingLtCarryforward: safeNumber(ltCf),
    harvestingEfficiency,
  };
}

// ============================================
// MULTI-YEAR PROJECTION
// ============================================

export interface EdiProjectionInput {
  strategyId: string;
  collateralValue: number;
  combinedStRate: number;
  combinedLtRate: number;
  filingStatus: FilingStatus;
  washSaleRate: number;
  existingStCarryforward: number;
  existingLtCarryforward: number;
  annualReturn: number;
  projectionYears: number;
  /** Incremental financing cost rate. When provided, collateral growth is reduced by this rate. */
  financingCostRate?: number;
}

export interface EdiProjectionSummary {
  totalRealizedBenefit: number;
  totalStLossesHarvested: number;
  totalLtGainsRealized: number;
  finalCarryforward: number;
  carryforwardTaxShield: number;
  cumulativeHarvestingEfficiency: number;
}

export interface EdiProjectionResult {
  years: EdiYearResult[];
  summary: EdiProjectionSummary;
}

export function computeEdiProjection(input: EdiProjectionInput): EdiProjectionResult {
  const years: EdiYearResult[] = [];
  let stCf = input.existingStCarryforward;
  let ltCf = input.existingLtCarryforward;
  let collateralValue = input.collateralValue;

  for (let year = 1; year <= input.projectionYears; year++) {
    const yearResult = computeEdiYear({
      year,
      strategyId: input.strategyId,
      collateralValue,
      combinedStRate: input.combinedStRate,
      combinedLtRate: input.combinedLtRate,
      filingStatus: input.filingStatus,
      washSaleRate: input.washSaleRate,
      priorStCarryforward: stCf,
      priorLtCarryforward: ltCf,
    });

    years.push(yearResult);

    // Thread state forward
    stCf = yearResult.endingStCarryforward;
    ltCf = yearResult.endingLtCarryforward;
    // Grow collateral net of financing drag when provided (PM review: 30% overstatement at year 10 without this)
    const netGrowthRate = input.annualReturn - (input.financingCostRate ?? 0);
    collateralValue = safeNumber(collateralValue * (1 + netGrowthRate));
  }

  // Compute summary
  const totalStLosses = years.reduce((s, y) => s + y.stLossesHarvested, 0);
  const totalLtGains = years.reduce((s, y) => s + y.ltGainsRealized, 0);
  const finalCf = stCf + ltCf;

  const summary: EdiProjectionSummary = {
    totalRealizedBenefit: safeNumber(years.reduce((s, y) => s + y.annualRealizedBenefit, 0)),
    totalStLossesHarvested: safeNumber(totalStLosses),
    totalLtGainsRealized: safeNumber(totalLtGains),
    finalCarryforward: safeNumber(finalCf),
    carryforwardTaxShield: safeNumber(finalCf * input.combinedLtRate),
    cumulativeHarvestingEfficiency: totalLtGains > 0 ? safeNumber(totalStLosses / totalLtGains) : Infinity,
  };

  return { years, summary };
}

// ============================================
// REALIZATION SCENARIO ENGINE
// ============================================

export type GainCharacter = 'st' | 'lt';

export interface RealizationInput {
  gainAmount: number;
  gainCharacter: GainCharacter;
  availableStCarryforward: number;
  availableLtCarryforward: number;
  combinedStRate: number;
  combinedLtRate: number;
}

export interface RealizationResult {
  gainAmount: number;
  gainCharacter: GainCharacter;
  applicableTaxRate: number;
  carryforwardUsed: number;
  taxableGainAfterCf: number;
  taxWithoutCarryforward: number;
  taxWithCarryforward: number;
  taxSaved: number;
  remainingStCarryforward: number;
  remainingLtCarryforward: number;
}

export function calculateRealizationScenario(input: RealizationInput): RealizationResult {
  const {
    gainAmount, gainCharacter, availableStCarryforward,
    availableLtCarryforward, combinedStRate, combinedLtRate,
  } = input;

  const applicableTaxRate = gainCharacter === 'lt' ? combinedLtRate : combinedStRate;
  const taxWithoutCarryforward = safeNumber(gainAmount * applicableTaxRate);

  let remainingGain = gainAmount;
  let stCf = availableStCarryforward;
  let ltCf = availableLtCarryforward;

  // Same-character CF first
  if (gainCharacter === 'lt') {
    const ltUsed = Math.min(ltCf, remainingGain);
    remainingGain -= ltUsed;
    ltCf -= ltUsed;
    // Cross-apply ST CF
    const stUsed = Math.min(stCf, remainingGain);
    remainingGain -= stUsed;
    stCf -= stUsed;
  } else {
    const stUsed = Math.min(stCf, remainingGain);
    remainingGain -= stUsed;
    stCf -= stUsed;
    // Cross-apply LT CF
    const ltUsed = Math.min(ltCf, remainingGain);
    remainingGain -= ltUsed;
    ltCf -= ltUsed;
  }

  const cfUsed = gainAmount - remainingGain;
  const taxWithCarryforward = safeNumber(remainingGain * applicableTaxRate);

  return {
    gainAmount,
    gainCharacter,
    applicableTaxRate,
    carryforwardUsed: safeNumber(cfUsed),
    taxableGainAfterCf: safeNumber(remainingGain),
    taxWithoutCarryforward,
    taxWithCarryforward,
    taxSaved: safeNumber(taxWithoutCarryforward - taxWithCarryforward),
    remainingStCarryforward: safeNumber(stCf),
    remainingLtCarryforward: safeNumber(ltCf),
  };
}

// ============================================
// DEFAULT SCENARIOS & SCENARIO RESULTS
// ============================================

export interface RealizationScenario {
  label: string;
  description: string;
  gainAmount: number;
  gainCharacter: GainCharacter;
  yearOfEvent: number;
  isMultiYear: boolean;
  annualGainAmount?: number;
  durationYears?: number;
}

export interface ScenarioResult {
  scenario: RealizationScenario;
  taxWithoutCarryforward: number;
  taxWithCarryforward: number;
  taxSaved: number;
  carryforwardUsed: number;
  remainingCarryforward: number;
  yearDetails?: Array<{
    year: number;
    gainThisYear: number;
    cfAvailable: number;
    cfUsed: number;
    taxableGain: number;
    taxOwed: number;
    taxSaved: number;
    cfRemaining: number;
  }>;
}

export function getDefaultScenarios(collateralValue: number): RealizationScenario[] {
  return [
    {
      label: 'Concentrated Stock Exit',
      description: 'Client sells appreciated stock position',
      gainAmount: collateralValue * 1.0,
      gainCharacter: 'lt',
      yearOfEvent: 5,
      isMultiYear: false,
    },
    {
      label: 'Business Sale',
      description: 'Owner sells business, realizes large capital gain',
      gainAmount: collateralValue * 2.0,
      gainCharacter: 'lt',
      yearOfEvent: 7,
      isMultiYear: false,
    },
    {
      label: 'Portfolio Transition',
      description: 'Client moves to new advisor, realizes embedded gains',
      gainAmount: collateralValue * 0.2,
      gainCharacter: 'lt',
      yearOfEvent: 3,
      isMultiYear: false,
    },
    {
      label: 'RSU/IPO Vest',
      description: 'Short-term gains from RSU vest or IPO lockup sale',
      gainAmount: collateralValue * 0.3,
      gainCharacter: 'st',
      yearOfEvent: 3,
      isMultiYear: false,
    },
    {
      label: 'Retirement Liquidation',
      description: 'Systematic drawdown over multiple years',
      gainAmount: 0,
      gainCharacter: 'lt',
      yearOfEvent: 7,
      isMultiYear: true,
      annualGainAmount: collateralValue * 0.05,
      durationYears: 5,
    },
  ];
}

export function computeScenarioResults(
  scenario: RealizationScenario,
  projection: EdiProjectionResult,
  combinedStRate: number,
  combinedLtRate: number,
): ScenarioResult {
  const yearIdx = Math.min(scenario.yearOfEvent - 1, projection.years.length - 1);
  const cfAtEvent = projection.years[yearIdx];
  let stCf = cfAtEvent.endingStCarryforward;
  let ltCf = cfAtEvent.endingLtCarryforward;

  if (!scenario.isMultiYear) {
    const result = calculateRealizationScenario({
      gainAmount: scenario.gainAmount,
      gainCharacter: scenario.gainCharacter,
      availableStCarryforward: stCf,
      availableLtCarryforward: ltCf,
      combinedStRate,
      combinedLtRate,
    });
    return {
      scenario,
      taxWithoutCarryforward: result.taxWithoutCarryforward,
      taxWithCarryforward: result.taxWithCarryforward,
      taxSaved: result.taxSaved,
      carryforwardUsed: result.carryforwardUsed,
      remainingCarryforward: result.remainingStCarryforward + result.remainingLtCarryforward,
    };
  }

  // Multi-year realization with ongoing CF replenishment from EDI harvesting
  const yearDetails: NonNullable<ScenarioResult['yearDetails']> = [];
  let totalTaxWithout = 0;
  let totalTaxWith = 0;

  // Track cumulative CF consumed by the scenario across years.
  // Each year, available CF = projection ending CF for that year minus
  // what this scenario has already consumed in prior years.
  let cumulativeStConsumed = 0;
  let cumulativeLtConsumed = 0;

  for (let i = 0; i < (scenario.durationYears ?? 1); i++) {
    const annualGain = scenario.annualGainAmount ?? scenario.gainAmount;
    const currentYear = scenario.yearOfEvent + i;
    const currentYearIdx = Math.min(currentYear - 1, projection.years.length - 1);
    const projYear = projection.years[currentYearIdx];

    // Available CF = projection ending CF (includes new harvesting) minus what
    // this scenario has already consumed in prior iteration years
    const availStCf = Math.max(0, projYear.endingStCarryforward - cumulativeStConsumed);
    const availLtCf = Math.max(0, projYear.endingLtCarryforward - cumulativeLtConsumed);
    const cfAvailable = availStCf + availLtCf;

    const result = calculateRealizationScenario({
      gainAmount: annualGain,
      gainCharacter: scenario.gainCharacter,
      availableStCarryforward: availStCf,
      availableLtCarryforward: availLtCf,
      combinedStRate,
      combinedLtRate,
    });

    // Track how much CF was consumed this year
    const stConsumedThisYear = availStCf - result.remainingStCarryforward;
    const ltConsumedThisYear = availLtCf - result.remainingLtCarryforward;
    cumulativeStConsumed += stConsumedThisYear;
    cumulativeLtConsumed += ltConsumedThisYear;

    yearDetails.push({
      year: currentYear,
      gainThisYear: annualGain,
      cfAvailable,
      cfUsed: result.carryforwardUsed,
      taxableGain: result.taxableGainAfterCf,
      taxOwed: result.taxWithCarryforward,
      taxSaved: result.taxSaved,
      cfRemaining: result.remainingStCarryforward + result.remainingLtCarryforward,
    });

    totalTaxWithout += result.taxWithoutCarryforward;
    totalTaxWith += result.taxWithCarryforward;
  }

  // Total CF used = cumulative consumed across all years
  const totalCfUsed = cumulativeStConsumed + cumulativeLtConsumed;
  // Remaining CF after the final year of the scenario
  const finalYearIdx = Math.min(scenario.yearOfEvent + (scenario.durationYears ?? 1) - 2, projection.years.length - 1);
  const finalProjYear = projection.years[finalYearIdx];
  const remainingCf = Math.max(0,
    (finalProjYear.endingStCarryforward - cumulativeStConsumed) +
    (finalProjYear.endingLtCarryforward - cumulativeLtConsumed)
  );

  return {
    scenario,
    taxWithoutCarryforward: safeNumber(totalTaxWithout),
    taxWithCarryforward: safeNumber(totalTaxWith),
    taxSaved: safeNumber(totalTaxWithout - totalTaxWith),
    carryforwardUsed: safeNumber(totalCfUsed),
    remainingCarryforward: safeNumber(remainingCf),
    yearDetails,
  };
}

// ============================================
// EMBEDDED GAIN ESTIMATION & UNWIND ANALYSIS
// ============================================

export function estimateEmbeddedGainPct(
  strategyId: string,
  year: number,
  annualReturn: number,
  washSaleRate: number = 0,
): number {
  const strategy = STRATEGIES.find(s => s.id === strategyId);
  if (!strategy) return 0;

  let portfolioValue = 1.0;
  let cumulativeBasisReduction = 0;

  for (let y = 1; y <= year; y++) {
    const stLossRate = getStLossRateForYear(strategy, y);
    const ltGainRate = strategy.ltGainRate;
    // Net basis reduction: harvesting lowers basis (adjusted for wash sales), LT realization raises it
    // Allow negative values when ltGainRate > stLossRate (PM Issue 1)
    const netStLoss = stLossRate * (1 - washSaleRate) - ltGainRate;

    cumulativeBasisReduction += portfolioValue * netStLoss;
    portfolioValue *= (1 + annualReturn);
  }

  // Embedded gain = unrealized appreciation + cumulative net basis reduction
  const cumulativeAppreciation = portfolioValue - 1.0;
  const embeddedGain = cumulativeAppreciation + cumulativeBasisReduction;
  return Math.max(0, embeddedGain / portfolioValue);
}

export interface UnwindInput {
  unwindYear: number;
  projection: EdiProjectionResult;
  strategyId: string;
  annualReturn: number;
  combinedLtRate: number;
  washSaleRate?: number;
  /** Financing cost rate — used to compute net growth rate for embedded gain consistency */
  financingCostRate?: number;
}

export interface UnwindResult {
  unwindYear: number;
  portfolioValueAtUnwind: number;
  embeddedGainPct: number;
  embeddedGainEstimate: number;
  availableCarryforward: number;
  carryforwardUsed: number;
  taxableGainAfterCf: number;
  grossUnwindTax: number;
  netUnwindTax: number;
  taxSavedByCf: number;
  remainingCarryforward: number;
}

export function calculateUnwindAnalysis(input: UnwindInput): UnwindResult {
  const { unwindYear, projection, strategyId, annualReturn, combinedLtRate, washSaleRate = 0, financingCostRate = 0 } = input;
  const yearIdx = Math.min(unwindYear - 1, projection.years.length - 1);
  const yearData = projection.years[yearIdx];

  // Use net growth rate consistent with projection's financing drag
  const netGrowthRate = annualReturn - financingCostRate;
  // Use end-of-year portfolio value to match estimateEmbeddedGainPct's denominator
  // and endingCarryforward timing (both are end-of-year values)
  const portfolioValue = yearData.collateralValue * (1 + netGrowthRate);
  const embeddedGainPct = estimateEmbeddedGainPct(strategyId, unwindYear, netGrowthRate, washSaleRate);
  const embeddedGain = safeNumber(portfolioValue * embeddedGainPct);

  const totalCf = yearData.endingStCarryforward + yearData.endingLtCarryforward;
  const cfUsed = Math.min(totalCf, embeddedGain);
  const taxableAfterCf = Math.max(0, embeddedGain - cfUsed);

  return {
    unwindYear,
    portfolioValueAtUnwind: safeNumber(portfolioValue),
    embeddedGainPct,
    embeddedGainEstimate: embeddedGain,
    availableCarryforward: safeNumber(totalCf),
    carryforwardUsed: safeNumber(cfUsed),
    taxableGainAfterCf: safeNumber(taxableAfterCf),
    grossUnwindTax: safeNumber(embeddedGain * combinedLtRate),
    netUnwindTax: safeNumber(taxableAfterCf * combinedLtRate),
    taxSavedByCf: safeNumber(cfUsed * combinedLtRate),
    remainingCarryforward: safeNumber(totalCf - cfUsed),
  };
}

// ============================================
// ESTATE COMPARISON
// ============================================

export interface EstateComparisonInput {
  portfolioValue: number;
  embeddedGainPct: number;
  availableStCarryforward: number;
  availableLtCarryforward: number;
  combinedLtRate: number;
}

export interface EstateComparisonResult {
  continueAndDie: {
    stepUpValue: number;
    carryforwardLost: number;
    carryforwardValueLost: number;
    netBenefit: number;
  };
  unwindBeforeDeath: {
    embeddedGains: number;
    carryforwardUsed: number;
    taxPaid: number;
    netCost: number;
  };
  recommendation: 'continue' | 'unwind' | 'partial_unwind';
  optimalUnwindPct: number;
  explanation: string;
}

// ============================================
// STRATEGY ECONOMICS & TAX ALPHA
// ============================================

export interface StrategyEconomicsYear {
  year: number;
  collateralValue: number;
  financingCost: number;
  advisoryFee: number;
  totalIncrementalCost: number; // Financing only (advisory excluded)
  realizedBenefit: number;
  cfProtectionBuilt: number; // CF added this year (ST + LT delta)
  cumulativeCfProtection: number;
  cumulativeIncrementalCost: number;
  protectionToCostRatio: number; // cumCfProtection / cumCost
  breakEvenGainEvent: number; // Gain needed to recover cumulative cost
}

export interface StrategyEconomicsSummary {
  totalIncrementalCost: number; // Financing only
  totalAdvisoryFee: number;
  totalCfProtection: number;
  protectionToCostRatio: number;
  breakEvenGainEvent: number;
  totalRealizedBenefit: number;
}

export interface StrategyEconomicsResult {
  years: StrategyEconomicsYear[];
  summary: StrategyEconomicsSummary;
}

export function computeStrategyEconomics(
  projection: EdiProjectionResult,
  financingCostRate: number,
  advisoryFeeRate: number,
  combinedLtRate: number,
): StrategyEconomicsResult {
  const years: StrategyEconomicsYear[] = [];
  let cumulativeCost = 0;
  let cumulativeCfProtection = 0;
  let totalAdvisoryFee = 0;
  let totalRealizedBenefit = 0;

  let prevTotalCf = 0;

  for (let i = 0; i < projection.years.length; i++) {
    const yr = projection.years[i];
    const cv = yr.collateralValue;

    const financingCost = safeNumber(cv * financingCostRate);
    const advisoryFee = safeNumber(cv * advisoryFeeRate);

    cumulativeCost += financingCost;
    totalAdvisoryFee += advisoryFee;
    totalRealizedBenefit += yr.annualRealizedBenefit;

    const currentTotalCf = yr.endingStCarryforward + yr.endingLtCarryforward;
    const cfProtectionBuilt = safeNumber(currentTotalCf - prevTotalCf);
    prevTotalCf = currentTotalCf;

    cumulativeCfProtection += cfProtectionBuilt;

    const protectionToCostRatio = cumulativeCost > 0
      ? safeNumber(cumulativeCfProtection * combinedLtRate / cumulativeCost)
      : 0;

    // Break-even gain event: how much gain must be realized to recover cumulative cost via CF tax savings
    // Credits realized benefits already banked ($3K deductions) per standard break-even methodology
    const netUnrecoveredCost = Math.max(0, cumulativeCost - totalRealizedBenefit);
    const breakEvenGainEvent = combinedLtRate > 0
      ? safeNumber(netUnrecoveredCost / combinedLtRate)
      : 0;

    years.push({
      year: yr.year,
      collateralValue: cv,
      financingCost,
      advisoryFee,
      totalIncrementalCost: financingCost,
      realizedBenefit: yr.annualRealizedBenefit,
      cfProtectionBuilt,
      cumulativeCfProtection: safeNumber(cumulativeCfProtection),
      cumulativeIncrementalCost: safeNumber(cumulativeCost),
      protectionToCostRatio,
      breakEvenGainEvent,
    });
  }

  const totalProtectionValue = safeNumber(cumulativeCfProtection * combinedLtRate);
  const finalProtectionRatio = cumulativeCost > 0
    ? safeNumber(totalProtectionValue / cumulativeCost)
    : 0;
  const netUnrecoveredCostFinal = Math.max(0, cumulativeCost - totalRealizedBenefit);
  const finalBreakEven = combinedLtRate > 0
    ? safeNumber(netUnrecoveredCostFinal / combinedLtRate)
    : 0;

  return {
    years,
    summary: {
      totalIncrementalCost: safeNumber(cumulativeCost),
      totalAdvisoryFee: safeNumber(totalAdvisoryFee),
      totalCfProtection: safeNumber(cumulativeCfProtection),
      protectionToCostRatio: finalProtectionRatio,
      breakEvenGainEvent: finalBreakEven,
      totalRealizedBenefit: safeNumber(totalRealizedBenefit),
    },
  };
}

// ============================================
// BASELINE COMPARISON ("DOING NOTHING")
// ============================================

export interface BaselineComparisonYear {
  year: number;
  passiveValue: number;
  passiveEmbeddedGain: number;
  passiveExitTax: number;
  passiveAfterTax: number;
  ediValue: number;
  ediEmbeddedGain: number;
  ediExitTax: number;
  ediTaxBenefit: number;
  ediAfterTax: number;
  ediAdvantage: number;
}

export interface BaselineComparisonResult {
  years: BaselineComparisonYear[];
  terminalPassive: number;
  terminalEdi: number;
  ediAdvantage: number;
  ediAdvantagePct: number;
}

export function computeBaselineComparison(
  projection: EdiProjectionResult,
  initialCollateral: number,
  annualReturn: number,
  financingCostRate: number,
  combinedLtRate: number,
  strategyId: string,
  washSaleRate: number = 0,
): BaselineComparisonResult {
  const years: BaselineComparisonYear[] = [];

  // Track EDI portfolio separately with financing drag
  let ediPortfolioValue = initialCollateral;

  for (let i = 0; i < projection.years.length; i++) {
    const yr = projection.years[i];
    const yearNum = i + 1;

    // Passive: buy-and-hold at same return, advisory fee common to both
    const passiveValue = safeNumber(initialCollateral * Math.pow(1 + annualReturn, yearNum));
    const passiveEmbeddedGain = Math.max(0, passiveValue - initialCollateral);
    const passiveExitTax = safeNumber(passiveEmbeddedGain * combinedLtRate);
    const passiveAfterTax = safeNumber(passiveValue - passiveExitTax);

    // EDI: grows at annualReturn minus financing drag (compound effect)
    ediPortfolioValue = safeNumber(ediPortfolioValue * (1 + annualReturn - financingCostRate));

    // EDI embedded gain and CF shelter
    // Use net growth rate (annualReturn - financingCostRate) for consistency with EDI portfolio value
    const ediGrowthRate = annualReturn - financingCostRate;
    const embGainPct = estimateEmbeddedGainPct(strategyId, yearNum, ediGrowthRate, washSaleRate);
    const ediEmbeddedGain = safeNumber(ediPortfolioValue * embGainPct);
    const totalCf = yr.endingStCarryforward + yr.endingLtCarryforward;
    const cfUsedAtExit = Math.min(totalCf, ediEmbeddedGain);
    const ediExitTax = safeNumber(Math.max(0, ediEmbeddedGain - cfUsedAtExit) * combinedLtRate);
    const ediAfterTax = safeNumber(ediPortfolioValue - ediExitTax);

    const ediTaxBenefit = safeNumber(
      projection.years.slice(0, i + 1).reduce((s, y) => s + y.annualRealizedBenefit, 0)
      + cfUsedAtExit * combinedLtRate
    );

    years.push({
      year: yearNum,
      passiveValue: safeNumber(passiveValue),
      passiveEmbeddedGain: safeNumber(passiveEmbeddedGain),
      passiveExitTax,
      passiveAfterTax,
      ediValue: safeNumber(ediPortfolioValue),
      ediEmbeddedGain: safeNumber(ediEmbeddedGain),
      ediExitTax,
      ediTaxBenefit,
      ediAfterTax,
      ediAdvantage: safeNumber(ediAfterTax - passiveAfterTax),
    });
  }

  const lastYear = years[years.length - 1];
  return {
    years,
    terminalPassive: lastYear?.passiveAfterTax ?? initialCollateral,
    terminalEdi: lastYear?.ediAfterTax ?? initialCollateral,
    ediAdvantage: lastYear?.ediAdvantage ?? 0,
    ediAdvantagePct: lastYear && lastYear.passiveAfterTax > 0
      ? safeNumber(lastYear.ediAdvantage / lastYear.passiveAfterTax)
      : 0,
  };
}

export function calculateEstateComparison(input: EstateComparisonInput): EstateComparisonResult {
  const {
    portfolioValue, embeddedGainPct, availableStCarryforward,
    availableLtCarryforward, combinedLtRate,
  } = input;

  const embeddedGains = safeNumber(portfolioValue * embeddedGainPct);
  const totalCf = availableStCarryforward + availableLtCarryforward;

  // Continue + Die: step-up eliminates gains, but CF is lost
  const stepUpValue = safeNumber(embeddedGains * combinedLtRate);
  const cfValueLost = safeNumber(totalCf * combinedLtRate);

  // Unwind: use CF to shelter gains
  const cfUsed = Math.min(totalCf, embeddedGains);
  const taxPaid = safeNumber(Math.max(0, embeddedGains - cfUsed) * combinedLtRate);

  // Optimal partial unwind: use exactly the CF, keep rest for step-up
  const optimalUnwindAmount = embeddedGainPct > 0
    ? Math.min(totalCf / embeddedGainPct, portfolioValue)
    : 0;
  const optimalUnwindPct = portfolioValue > 0
    ? safeNumber(optimalUnwindAmount / portfolioValue)
    : 0;

  let recommendation: EstateComparisonResult['recommendation'];
  let explanation: string;

  if (totalCf === 0) {
    recommendation = 'continue';
    explanation = 'No carryforward to use. Step-up at death eliminates all embedded gains tax-free.';
  } else if (totalCf >= embeddedGains) {
    recommendation = 'unwind';
    explanation = 'Carryforward exceeds embedded gains. Unwind fully: CF shelters all gains tax-free. Excess CF would be lost at death.';
  } else {
    recommendation = 'partial_unwind';
    explanation =
      `Unwind ${Math.round(optimalUnwindPct * 100)}% of portfolio (using all CF to shelter gains), ` +
      `keep ${Math.round((1 - optimalUnwindPct) * 100)}% for step-up at death.`;
  }

  return {
    continueAndDie: {
      stepUpValue,
      carryforwardLost: safeNumber(totalCf),
      carryforwardValueLost: cfValueLost,
      netBenefit: safeNumber(stepUpValue - cfValueLost),
    },
    unwindBeforeDeath: {
      embeddedGains,
      carryforwardUsed: safeNumber(cfUsed),
      taxPaid,
      netCost: taxPaid,
    },
    recommendation,
    optimalUnwindPct,
    explanation,
  };
}
