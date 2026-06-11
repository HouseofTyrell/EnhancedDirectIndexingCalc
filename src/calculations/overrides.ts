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
  QFAF_ST_GAIN_RATE,
  SECTION_461L_LIMITS,
  Strategy,
  getLongLeverageRatio,
  getShortRatio,
} from '../strategyData';
import { StrategyRates, TaxRates } from './types';
import {
  calculateSummary,
  getCalendarYearStLossRate,
  getOperatingFraction,
} from './helpers';
import { calculateSizing } from './sizing';
import { calculateYear, CalculateYearOverrides } from './core';
import {
  resolveAllocation,
  getBlendedStLossRate,
  getBlendedLtGainRate,
  getBlendedCalendarYearStLossRate,
  ResolvedAllocation,
  ResolvedLeg,
} from './splitAllocation';

function getEffectiveFinancingCost(strategy: Strategy, settings: AdvancedSettings): number {
  if (!settings.financingFeesEnabled) return 0;
  if (settings.financingMode === 'simple') {
    const leveragePct = getShortRatio(strategy);
    const managerFee = settings.simpleManagerFeeBase * leveragePct + settings.simpleManagerFeeFixed;
    return settings.simpleWealthMgmtFee + managerFee;
  }
  const longLeverage = getLongLeverageRatio(strategy);
  const shortRatio = getShortRatio(strategy);
  const marginCost = settings.brokerMarginRate * longLeverage;
  const shortCosts = (settings.shortBorrowRate + settings.shortDividendRate) * shortRatio;
  return marginCost + shortCosts + settings.wealthManagementFeeRate;
}

function getBlendedFinancingCost(allocation: ResolvedAllocation, settings: AdvancedSettings): number {
  if (allocation.totalCollateral <= 0) return 0;
  let weightedSum = 0;
  for (const leg of allocation.legs) {
    weightedSum += leg.collateralAmount * getEffectiveFinancingCost(leg.strategy, settings);
  }
  return weightedSum / allocation.totalCollateral;
}

/**
 * Calculate with year-by-year overrides for income and cash infusions.
 *
 * This function extends the base calculate() function to support:
 * - Income overrides: Change W-2 income for specific years (affects 461(l) limits and NOL usage)
 * - Cash infusions: Add/remove capital in specific years (affects collateral and QFAF sizing)
 *
 * Split allocation: when enabled, cash infusions are added to the Core (cash)
 * leg only — appreciated-stock contributions to Overlay are not modeled here.
 */
export function calculateWithOverrides(
  inputs: CalculatorInputs,
  settings: AdvancedSettings = DEFAULT_SETTINGS,
  overrides: YearOverride[]
): CalculationResult {
  const allocation = resolveAllocation(inputs);

  // Build a map of overrides by year for quick lookup
  const overrideMap = new Map<number, YearOverride>();
  for (const override of overrides) {
    overrideMap.set(override.year, override);
  }

  // Calculate initial sizing (will be adjusted for infusions)
  const baseSizing = calculateSizing(inputs, settings.qfafMultiplier);

  // Pre-calculate base tax rates
  const baseStateRate =
    inputs.stateCode === 'OTHER' ? inputs.stateRate : getStateRate(inputs.stateCode);

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
      stRate: getFederalStRate(yearIncome, inputs.filingStatus),
      ltRate: getFederalLtRate(yearIncome, inputs.filingStatus),
      ordinaryRate: getFederalOrdinaryRate(yearIncome, inputs.filingStatus),
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
        (QFAF_ST_GAIN_RATE * opFraction) *
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

    years.push({ ...result, qfafCashReturned: cashReturned });

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
