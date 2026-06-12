import {
  CalculatorInputs,
  YearResult,
  CalculationResult,
  CalculatedSizing,
  AdvancedSettings,
  DEFAULT_SETTINGS,
  YearOverride,
} from '../types';
import { getFederalStRate, getFederalLtRate, getFederalOrdinaryRate, getStateRate } from '../taxData';
import {
  getStrategy,
  QFAF_ST_GAIN_RATE,
  CAPITAL_LOSS_LIMITS,
  SECTION_461L_LIMITS,
  Strategy,
} from '../strategyData';
import { safeNumber } from '../utils/formatters';
import { StrategyRates, TaxRates } from './types';
import {
  getEffectiveStLossRate,
  getCalendarYearStLossRate,
  getOperatingFraction,
  calculateCarryforwards,
  calculateSummary,
} from './helpers';
import { getEffectiveFinancingCost, getBlendedFinancingCost } from './financing';
import { calculateSizing } from './sizing';
import {
  resolveAllocation,
  getBlendedStLossRate,
  getBlendedLtGainRate,
  getBlendedCalendarYearStLossRate,
  ResolvedAllocation,
  ResolvedLeg,
} from './splitAllocation';

/**
 * Optional per-year overrides used by the split-allocation path. When these
 * are supplied, `calculateYear` skips its single-strategy lookups and uses
 * the pre-blended values instead.
 */
export interface CalculateYearOverrides {
  effectiveStLossRate?: number;
  ltGainRate?: number;
  financingCost?: number;
}

/**
 * Standard projection. Thin wrapper over the unified projection loop with no
 * per-year overrides — `calculate()` and `calculateWithOverrides()` used to
 * be two near-identical loops that repeatedly drifted apart (custom rates,
 * auto-extension, unwind accounting). There is now exactly one loop.
 */
export function calculate(
  inputs: CalculatorInputs,
  settings: AdvancedSettings = DEFAULT_SETTINGS
): CalculationResult {
  return calculateWithOverrides(inputs, settings, []);
}

/**
 * Unified projection loop with optional year-by-year overrides for income
 * and cash infusions.
 *
 * - Income overrides: change W-2 income for specific years (affects 461(l)
 *   limits, NOL usage, and that year's bracket-based tax rates)
 * - Cash infusions: add/remove capital in specific years (affects collateral
 *   and QFAF sizing)
 *
 * Split allocation: when enabled, cash infusions are added to the Core (cash)
 * leg only — appreciated-stock contributions to Overlay are not modeled here.
 */
export function calculateWithOverrides(
  inputs: CalculatorInputs,
  settings: AdvancedSettings = DEFAULT_SETTINGS,
  overrides: YearOverride[] = []
): CalculationResult {

  const allocation = resolveAllocation(inputs);

  // Build a map of overrides by year for quick lookup
  const overrideMap = new Map<number, YearOverride>();
  for (const override of overrides) {
    overrideMap.set(override.year, override);
  }

  // Calculate initial sizing (will be adjusted for infusions)
  const baseSizing = calculateSizing(inputs, settings.qfafMultiplier, settings.washSaleDisallowanceRate);

  // Pre-calculate base tax rates
  const baseStateRate =
    inputs.stateCode === 'OTHER' ? inputs.stateRate : getStateRate(inputs.stateCode);

  // Honor custom tax rates the same way calculate() does, so the standard
  // view and Year-by-Year Planning agree when custom rates are set.
  const useCustomRates =
    settings.stcgRate !== DEFAULT_SETTINGS.stcgRate ||
    settings.ltcgRate !== DEFAULT_SETTINGS.ltcgRate ||
    settings.niitRate !== DEFAULT_SETTINGS.niitRate;

  const years: YearResult[] = [];

  let qfafValue = baseSizing.qfafValue;
  // Track each leg's collateral. In split mode, cash infusions go to the core leg
  // (the leg with type === 'core' if present, otherwise leg 0).
  const legCollateral = allocation.legs.map(leg => leg.collateralAmount);
  const coreLegIndex = allocation.legs.findIndex(l => l.strategy.type === 'core');
  const infusionTargetIndex = coreLegIndex >= 0 ? coreLegIndex : 0;
  let stCarryforward = inputs.existingStLossCarryforward;
  let ltCarryforward = inputs.existingLtLossCarryforward;
  let nolCarryforward = inputs.existingNolCarryforward;

  // Track cumulative infusions for sizing recalculation
  let cumulativeInfusion = 0;
  const initialQfafValue = baseSizing.qfafValue;
  const isDynamic = inputs.qfafSizingMode === 'dynamic' && inputs.qfafEnabled !== false;

  // Use projectionYears from settings (defaults to 10)
  const projectionYears = settings.projectionYears ?? 10;

  // Auto-extend projection to show at least 2 post-QFAF years.
  // Partial-year starts extend the strategy's life by one calendar year.
  const qfafDuration = inputs.qfafEnabled !== false ? (inputs.qfafDuration ?? 10) : 0;
  const yf = (13 - (inputs.startMonth ?? 1)) / 12;
  const isPartialStart = yf < 1;
  const strategyLastCalendarYear =
    qfafDuration > 0 ? qfafDuration + (isPartialStart ? 1 : 0) : 0;
  const minProjection =
    qfafDuration > 0 ? strategyLastCalendarYear + 2 : projectionYears;
  const effectiveProjectionYears = Math.max(projectionYears, minProjection);

  for (let year = 1; year <= effectiveProjectionYears; year++) {
    const override = overrideMap.get(year);

    // Get effective income for this year
    const yearIncome = override?.w2Income ?? inputs.annualIncome;

    // Calculate tax rates for this year's income (needed for cash infusion tax adjustment)
    const yearTaxRates: TaxRates = {
      stRate: useCustomRates
        ? settings.stcgRate
        : getFederalStRate(yearIncome, inputs.filingStatus),
      ltRate: useCustomRates
        ? settings.ltcgRate + settings.niitRate
        : getFederalLtRate(yearIncome, inputs.filingStatus),
      ordinaryRate: useCustomRates
        ? settings.stcgRate
        : getFederalOrdinaryRate(yearIncome, inputs.filingStatus),
      stateRate: baseStateRate,
      section461Limit:
        settings.section461Limits[inputs.filingStatus] ??
        SECTION_461L_LIMITS[inputs.filingStatus],
    };

    // Apply cash infusion at the start of the year
    const rawCashInfusion = override?.cashInfusion ?? 0;
    const cashInfusionTaxType = override?.cashInfusionTaxType ?? 'gross';
    let cashInfusion = rawCashInfusion;
    if (rawCashInfusion !== 0 && cashInfusionTaxType === 'gross') {
      const combinedStRate = yearTaxRates.stRate + yearTaxRates.stateRate;
      cashInfusion = rawCashInfusion * (1 - combinedStRate);
    }
    if (cashInfusion !== 0) {
      legCollateral[infusionTargetIndex] += cashInfusion;
      cumulativeInfusion += cashInfusion;

      // Resize QFAF to match new combined ST loss capacity (if QFAF is enabled)
      if (inputs.qfafEnabled !== false) {
        const updatedAllocation: ResolvedAllocation = {
          isSplit: allocation.isSplit,
          totalCollateral: legCollateral.reduce((s, v) => s + v, 0),
          primary: allocation.primary,
          legs: allocation.legs.map((leg, i) => ({
            strategy: leg.strategy,
            collateralAmount: legCollateral[i],
          })),
        };
        const yearOneStLossRate = allocation.isSplit
          ? getBlendedStLossRate(updatedAllocation, 1)
          : allocation.primary.strategy.stLossRate;
        const newStLossCapacity = updatedAllocation.totalCollateral * yearOneStLossRate;
        qfafValue = newStLossCapacity / (settings.qfafMultiplier ?? QFAF_ST_GAIN_RATE);
      }
    }

    // Snapshot the per-leg state for this year's computations.
    const yearStartLegs: ResolvedLeg[] = allocation.legs.map((leg, i) => ({
      strategy: leg.strategy,
      collateralAmount: legCollateral[i],
    }));
    const yearStartTotalCollateral = legCollateral.reduce((s, v) => s + v, 0);
    const yearAllocation: ResolvedAllocation = {
      isSplit: allocation.isSplit,
      totalCollateral: yearStartTotalCollateral,
      primary: allocation.primary,
      legs: yearStartLegs,
    };

    // Calendar-year rate blending + operating fraction (see core.ts for derivation).
    const opFraction = getOperatingFraction(year, inputs.startMonth ?? 1, qfafDuration);
    const calStLossRate = allocation.isSplit
      ? getBlendedCalendarYearStLossRate(yearAllocation, year, inputs.startMonth ?? 1, qfafDuration)
      : getCalendarYearStLossRate(
          allocation.primary.strategy.id,
          allocation.primary.strategy.ltGainRate,
          year,
          inputs.startMonth ?? 1,
          qfafDuration
        );

    // Zero out QFAF after the strategy's last operating year (breakeven unwind)
    let effectiveQfafValue =
      strategyLastCalendarYear > 0 && year > strategyLastCalendarYear ? 0 : qfafValue;

    // Dynamic resizing: shrink QFAF to match this calendar year's collateral ST losses.
    let cashReturned = 0;
    if (isDynamic && effectiveQfafValue > 0 && opFraction > 0) {
      const neededQfaf =
        yearStartTotalCollateral *
        calStLossRate *
        (1 - settings.washSaleDisallowanceRate) /
        ((settings.qfafMultiplier ?? QFAF_ST_GAIN_RATE) * opFraction) *
        (1 - (inputs.qfafSizingCushion ?? 0));
      const cappedQfaf = Math.min(effectiveQfafValue, neededQfaf, initialQfafValue);
      cashReturned = Math.max(0, effectiveQfafValue - cappedQfaf);
      effectiveQfafValue = cappedQfaf;
    }

    const strategyActive = opFraction > 0;
    const yearFractionForCall = strategyActive ? opFraction : 1.0;

    // Pre-blend rates for split mode.
    let yearOverrides: CalculateYearOverrides | undefined;
    let strategyForCalc: StrategyRates;
    if (allocation.isSplit) {
      const blendedLt = getBlendedLtGainRate(yearAllocation);
      strategyForCalc = { stLossRate: calStLossRate, ltGainRate: blendedLt };
      yearOverrides = {
        effectiveStLossRate: calStLossRate,
        ltGainRate: blendedLt,
        financingCost: getBlendedFinancingCost(yearAllocation, settings),
      };
    } else {
      strategyForCalc = allocation.primary.strategy;
      yearOverrides = { effectiveStLossRate: calStLossRate };
    }

    const result = calculateYear(
      year,
      effectiveQfafValue,
      yearStartTotalCollateral,
      stCarryforward,
      ltCarryforward,
      nolCarryforward,
      inputs,
      strategyForCalc,
      yearTaxRates,
      settings,
      yearIncome,
      allocation.isSplit ? undefined : allocation.primary.strategy,
      yearFractionForCall,
      strategyActive,
      yearOverrides
    );

    // In split mode, recompute per-leg next-year values.
    if (allocation.isSplit) {
      const baseReturn = settings.growthEnabled ? settings.defaultAnnualReturn : 0;
      for (let i = 0; i < legCollateral.length; i++) {
        const legStrategy = yearStartLegs[i].strategy;
        const legFinancing = getEffectiveFinancingCost(legStrategy, settings);
        const grown = legCollateral[i] * (1 + baseReturn * yearFractionForCall);
        legCollateral[i] = grown * (1 - legFinancing * yearFractionForCall);
      }
      const legSum = legCollateral.reduce((s, v) => s + v, 0);
      result.collateralValue = legSum;
      result.totalValue = result.qfafValue + legSum;
    } else {
      legCollateral[0] = result.collateralValue;
    }

    // Terminal unwind: return the QFAF's end-of-year value as cash in the
    // last operating calendar year (see core.ts for rationale).
    const terminalProceeds =
      strategyLastCalendarYear > 0 && year === strategyLastCalendarYear ? result.qfafValue : 0;
    years.push({ ...result, qfafCashReturned: cashReturned + terminalProceeds });

    // Update QFAF state for next year. Don't track QFAF growth after the
    // strategy's final calendar year.
    qfafValue =
      strategyLastCalendarYear > 0 && year >= strategyLastCalendarYear ? 0 : result.qfafValue;
    stCarryforward = result.stLossCarryforward;
    ltCarryforward = result.ltLossCarryforward;
    nolCarryforward = result.nolCarryforward;
  }

  // Recalculate sizing to reflect any infusions
  const yearOneInfusion = overrideMap.get(1)?.cashInfusion ?? 0;
  const yearOneStLossRateForSizing = allocation.isSplit
    ? baseSizing.avgStLossRate
    : allocation.primary.strategy.stLossRate;
  const adjustedSizing: CalculatedSizing = {
    ...baseSizing,
    collateralValue: baseSizing.collateralValue + yearOneInfusion,
    totalExposure:
      baseSizing.totalExposure +
      cumulativeInfusion +
      (inputs.qfafEnabled !== false
        ? (cumulativeInfusion * yearOneStLossRateForSizing) /
          (settings.qfafMultiplier ?? QFAF_ST_GAIN_RATE)
        : 0),
  };

  return {
    sizing: adjustedSizing,
    years,
    summary: calculateSummary(years, adjustedSizing, inputs.qfafEnabled !== false ? inputs.qfafDuration : undefined),
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
  yearIncome?: number, // Optional income override for this year
  fullStrategy?: Strategy, // Full strategy object for financing cost calculation
  yearFraction: number = 1.0, // Partial year: (13 - startMonth) / 12, applied to Year 1 only
  strategyActive: boolean = true, // Whether the strategy is actively generating tax events
  overrides?: CalculateYearOverrides // Pre-blended rates for split allocation mode
): YearResult {
  // Use year income override if provided, otherwise use base annual income
  const effectiveIncome = yearIncome ?? inputs.annualIncome;
  // QFAF generates ST gains and ordinary losses at qfafMultiplier rate (default 150% of MV each)
  // Use safeNumber to prevent NaN/Infinity propagation (004)
  const qfafMultiplier = settings.qfafMultiplier ?? QFAF_ST_GAIN_RATE;
  const stGainsGenerated = strategyActive ? safeNumber(qfafValue * qfafMultiplier * yearFraction) : 0;
  const ordinaryLossesGenerated = strategyActive ? safeNumber(qfafValue * qfafMultiplier * yearFraction) : 0;

  // Collateral generates ST losses and LT gains per strategy rates
  // Uses custom rates if set, otherwise applies 7% annual decay
  // Also applies wash sale disallowance (typically 5-15% disallowed)
  // When strategy is inactive (post-duration), no new harvesting occurs
  // The caller is expected to pass `effectiveStLossRate` as a calendar-year
  // time-weighted rate (already accounts for partial-year starts straddling
  // two operating years). When no override is supplied (legacy callers),
  // fall back to the operating-year rate multiplied by `yearFraction`.
  const ltGainRate = overrides?.ltGainRate ?? strategy.ltGainRate;
  let effectiveStLossRate: number;
  let grossStLosses: number;
  if (overrides?.effectiveStLossRate !== undefined) {
    // Calendar-year-blended rate already encodes the fractional weighting.
    effectiveStLossRate = overrides.effectiveStLossRate;
    grossStLosses = strategyActive ? collateralValue * effectiveStLossRate : 0;
  } else {
    effectiveStLossRate = getEffectiveStLossRate(inputs.strategyId, strategy.ltGainRate, year);
    grossStLosses = strategyActive ? collateralValue * effectiveStLossRate * yearFraction : 0;
  }
  const stLossesHarvested = safeNumber(grossStLosses * (1 - settings.washSaleDisallowanceRate));
  const ltGainsRealized = strategyActive && inputs.ltGainsEnabled !== false ? safeNumber(collateralValue * ltGainRate * yearFraction) : 0;

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
  // Income clamped at 0 so a negative year-income override can't produce a
  // negative deduction. (Precise negative-income → NOL modeling is D-010.)
  const usableOrdinaryLoss = Math.min(
    ordinaryLossesGenerated,
    taxRates.section461Limit,
    Math.max(0, effectiveIncome)
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
  const { stRate, ltRate, ordinaryRate, stateRate } = taxRates;
  const combinedStRate = stRate + stateRate;
  const combinedLtRate = ltRate + stateRate;
  // Deductions against ordinary income (wages) don't reduce net investment
  // income, so NIIT is excluded from their value (IRC §1411). This matches
  // the treatment already used in ediOnly.ts for the $3K deduction.
  const combinedOrdinaryRate = ordinaryRate + stateRate;

  // Benefits:
  // 1. Ordinary loss reduces W2 income tax
  const ordinaryLossBenefit = safeNumber(usableOrdinaryLoss * combinedOrdinaryRate);

  // 2. Capital loss carryforward used against ordinary income ($3k/yr limit)
  const capitalLossBenefit = safeNumber(capitalLossUsedAgainstIncome * combinedOrdinaryRate);

  // 3. NOL used against taxable income
  const nolUsageBenefit = safeNumber(nolUsed * combinedOrdinaryRate);

  // Costs:
  // 1. LT gains are taxed at LT rates
  const ltGainCost = safeNumber(ltGainsRealized * combinedLtRate);

  // 2. Any remaining net ST gains (if ST gains > ST losses) taxed at ST rates
  const remainingStGainCost = safeNumber(Math.max(0, netStGainLoss) * combinedStRate);

  // Net tax savings: ordinary deductions minus capital gains costs
  // ST gains and ST losses wash (by design) — no phantom "conversion benefit"
  const taxSavings = safeNumber(
    ordinaryLossBenefit +
      capitalLossBenefit +
      nolUsageBenefit -
      ltGainCost -
      remainingStGainCost
  );

  // ST gain leakage: excess QFAF ST gains not offset by collateral losses
  const stGainLeakage = Math.max(0, stGainsGenerated - stLossesHarvested);

  // Component-specific benefits for view mode breakdown
  // QFAF benefit: ordinary loss offset + NOL usage (what QFAF uniquely creates)
  const qfafTaxBenefit = safeNumber(ordinaryLossBenefit + nolUsageBenefit);
  // Collateral cost: capital loss offset - LT gain cost - any remaining ST gain cost
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

  // Portfolio growth: apply annual return first, then deduct financing fees at end of year.
  // This separates growth and fee timing so that fees don't reduce the growth rate directly —
  // the portfolio grows at the full return rate, then fees are charged on the grown value.
  const baseReturn = settings.growthEnabled ? settings.defaultAnnualReturn : 0;
  // Financing cost may be supplied directly (split-allocation blended rate);
  // otherwise look up by strategy.
  let totalFinancingCost: number;
  if (overrides?.financingCost !== undefined) {
    totalFinancingCost = overrides.financingCost;
  } else {
    const strategyForFinancing = fullStrategy || getStrategy(inputs.strategyId);
    totalFinancingCost = strategyForFinancing
      ? getEffectiveFinancingCost(strategyForFinancing, settings)
      : 0;
  }
  // QFAF growth can be disabled (e.g., to model fees/hedging costs eating returns)
  // QFAF can also use a separate return rate if specified (defaults to collateral growth rate)
  const qfafBaseReturn = settings.growthEnabled
    ? (settings.qfafAnnualReturn !== null ? settings.qfafAnnualReturn : settings.defaultAnnualReturn)
    : 0;
  const qfafGrowthRate = settings.qfafGrowthEnabled ? qfafBaseReturn : 0;
  // Grow at full return rate, then deduct fees at end of year on the grown value
  const grownQfafValue = safeNumber(qfafValue * (1 + qfafGrowthRate * yearFraction));
  const newQfafValue = safeNumber(grownQfafValue * (1 - totalFinancingCost * yearFraction));
  const grownCollateralValue = safeNumber(collateralValue * (1 + baseReturn * yearFraction));
  const newCollateralValue = safeNumber(grownCollateralValue * (1 - totalFinancingCost * yearFraction));

  // Calculate total income offset for this year
  // This is the sum of all deductions that reduce taxable income
  const incomeOffsetAmount = safeNumber(
    usableOrdinaryLoss + nolUsed + capitalLossUsedAgainstIncome
  );

  // Calculate maximum income offset capacity for this year
  // This shows the theoretical max income that COULD be sheltered if the taxpayer
  // had unlimited additional income (useful for planning stock option exercises)
  // Components:
  // 1. Section 461(l) limit: max ordinary loss deductible (annual renewable capacity)
  // 2. Start-of-year NOL carryforward: banked NOL available this year
  //    (with unlimited income, 80% rule is not binding since 80% of ∞ > any NOL balance)
  // 3. Capital loss limit: statutory $3k/$1.5k annual deduction
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
    effectiveStLossRate,
    incomeOffsetAmount,
    maxIncomeOffsetCapacity,
    ordinaryLossBenefit,
    nolUsageBenefit,
    stToLtConversionBenefit: 0, // Deprecated: ST gains/losses wash by design, no phantom conversion benefit
    capitalLossBenefit,
    ltGainCost,
    remainingStGainCost,
    qfafTaxBenefit,
    collateralTaxBenefit,
    stGainLeakage,
    qfafCashReturned: 0, // Set by the calling loop in dynamic mode
    strategyActive,
  };
}
