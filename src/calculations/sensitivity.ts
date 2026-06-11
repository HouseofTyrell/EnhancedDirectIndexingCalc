import {
  CalculatorInputs,
  YearResult,
  CalculationResult,
  AdvancedSettings,
  DEFAULT_SETTINGS,
  SensitivityParams,
  DEFAULT_SENSITIVITY,
} from '../types';
import { getFederalStRate, getFederalLtRate, getFederalOrdinaryRate, getStateRate } from '../taxData';
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
import {
  getEffectiveStLossRate,
  getCalendarYearStLossRate,
  getOperatingFraction,
  calculateCarryforwards,
  calculateSummary,
} from './helpers';
import { calculateSizing } from './sizing';
import {
  resolveAllocation,
  getBlendedLtGainRate,
  getBlendedCalendarYearStLossRate,
  ResolvedAllocation,
  ResolvedLeg,
} from './splitAllocation';

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
    // Simple mode: wealth management fee + manager fees (base × leverage% + fixed)
    const leveragePct = getShortRatio(strategy);
    const managerFee = settings.simpleManagerFeeBase * leveragePct + settings.simpleManagerFeeFixed;
    return settings.simpleWealthMgmtFee + managerFee;
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

function getBlendedFinancingCost(allocation: ResolvedAllocation, settings: AdvancedSettings): number {
  if (allocation.totalCollateral <= 0) return 0;
  let weightedSum = 0;
  for (const leg of allocation.legs) {
    weightedSum += leg.collateralAmount * getEffectiveFinancingCost(leg.strategy, settings);
  }
  return weightedSum / allocation.totalCollateral;
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
 *
 * Split allocation: when enabled, ST loss and LT gain rates are blended across
 * legs by collateral weight before variance is applied. The tracking-error
 * multiplier uses each leg's tracking error weighted similarly.
 */
export function calculateWithSensitivity(
  inputs: CalculatorInputs,
  settings: AdvancedSettings = DEFAULT_SETTINGS,
  sensitivity: SensitivityParams = DEFAULT_SENSITIVITY
): CalculationResult {
  const allocation = resolveAllocation(inputs);

  // Calculate initial sizing
  const sizing = calculateSizing(inputs, settings.qfafMultiplier, settings.washSaleDisallowanceRate);

  // Get base state rate
  const baseStateRate =
    inputs.stateCode === 'OTHER' ? inputs.stateRate : getStateRate(inputs.stateCode);

  // Apply sensitivity adjustments to rates
  const adjustedStateRate = Math.max(0, baseStateRate + sensitivity.stateRateChange);

  // Tracking error: in split mode, blend by collateral weight.
  const blendedTrackingError = allocation.isSplit && allocation.totalCollateral > 0
    ? allocation.legs.reduce(
        (sum, leg) => sum + (leg.collateralAmount * leg.strategy.trackingError),
        0
      ) / allocation.totalCollateral
    : allocation.primary.strategy.trackingError;
  const scaledTrackingError = blendedTrackingError * sensitivity.trackingErrorMultiplier;

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
  // Track per-leg collateral so split mode handles diverging financing fees correctly.
  const legCollateral = allocation.legs.map(leg => leg.collateralAmount);
  let stCarryforward = inputs.existingStLossCarryforward;
  let ltCarryforward = inputs.existingLtLossCarryforward;
  let nolCarryforward = inputs.existingNolCarryforward;
  const initialQfafValue = sizing.qfafValue;
  const isDynamic = inputs.qfafSizingMode === 'dynamic' && inputs.qfafEnabled !== false;

  // Use projectionYears from settings (defaults to 10)
  const projectionYears = settings.projectionYears ?? 10;

  // Auto-extend projection to show at least 2 post-QFAF years.
  // Partial-year starts extend the strategy by one calendar year.
  const qfafDuration = inputs.qfafEnabled !== false ? (inputs.qfafDuration ?? 10) : 0;
  const yf = (13 - (inputs.startMonth ?? 1)) / 12;
  const isPartialStart = yf < 1;
  const strategyLastCalendarYear =
    qfafDuration > 0 ? qfafDuration + (isPartialStart ? 1 : 0) : 0;
  const minProjection =
    qfafDuration > 0 ? strategyLastCalendarYear + 2 : projectionYears;
  const effectiveProjectionYears = Math.max(projectionYears, minProjection);

  for (let year = 1; year <= effectiveProjectionYears; year++) {
    // Snapshot per-leg state for this year's blends.
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

    // Operating fraction + calendar-year ST loss rate (partial-year aware).
    const opFraction = getOperatingFraction(year, inputs.startMonth ?? 1, qfafDuration);
    const baseLtGainRate = allocation.isSplit
      ? getBlendedLtGainRate(yearAllocation)
      : allocation.primary.strategy.ltGainRate;
    // For single mode, preserve the legacy behavior where the LT rate (with
    // sensitivity variance applied once externally) feeds into the inner ST
    // loss rate via getEffectiveStLossRate's `lt` parameter. We mirror that
    // here by passing the variance-adjusted LT to the calendar-year helper.
    const stLossLtForRate = allocation.isSplit
      ? baseLtGainRate
      : baseLtGainRate * (1 + sensitivity.ltGainRateVariance);
    const calStLossRate = allocation.isSplit
      ? getBlendedCalendarYearStLossRate(yearAllocation, year, inputs.startMonth ?? 1, qfafDuration)
      : getCalendarYearStLossRate(
          allocation.primary.strategy.id,
          stLossLtForRate,
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

    // Calculate tax rates with sensitivity adjustments
    const baseFederalStRate = getFederalStRate(inputs.annualIncome, inputs.filingStatus);
    const baseFederalLtRate = getFederalLtRate(inputs.annualIncome, inputs.filingStatus);
    const baseFederalOrdinaryRate = getFederalOrdinaryRate(inputs.annualIncome, inputs.filingStatus);

    // Apply federal rate change (affects both ST and LT rates proportionally)
    const adjustedFederalStRate = Math.max(0, baseFederalStRate + sensitivity.federalRateChange);
    const adjustedFederalLtRate = Math.max(0, baseFederalLtRate + sensitivity.federalRateChange);
    const adjustedFederalOrdinaryRate = Math.max(0, baseFederalOrdinaryRate + sensitivity.federalRateChange);

    // Use settings section461Limits if provided
    const section461Limit =
      settings.section461Limits[inputs.filingStatus] ?? SECTION_461L_LIMITS[inputs.filingStatus];

    const yearTaxRates: TaxRates = {
      stRate: adjustedFederalStRate,
      ltRate: adjustedFederalLtRate,
      ordinaryRate: adjustedFederalOrdinaryRate,
      stateRate: adjustedStateRate,
      section461Limit,
    };

    const strategyActive = opFraction > 0;
    const yearFractionForCall = strategyActive ? opFraction : 1.0;

    // Strategy passed to calculateYearWithSensitivity.
    // In single-strategy mode, pre-apply variance to both rates so that the
    // inner function's existing (legacy) variance treatment continues to
    // produce identical results to before. In split mode, pass the un-adjusted
    // blended rates and let the inner function apply variance once.
    let strategyForYear: StrategyRates;
    let yearSensitivityOverrides: SensitivityYearOverrides;
    if (allocation.isSplit) {
      strategyForYear = { stLossRate: calStLossRate, ltGainRate: baseLtGainRate };
      yearSensitivityOverrides = {
        baseStLossRate: calStLossRate,
        stRateIsCalendarBlended: true,
        financingCost: getBlendedFinancingCost(yearAllocation, adjustedSettings),
      };
    } else {
      const adjustedStLossRate = allocation.primary.strategy.stLossRate * (1 + sensitivity.stLossRateVariance);
      const adjustedLtGainRate = baseLtGainRate * (1 + sensitivity.ltGainRateVariance);
      strategyForYear = { stLossRate: adjustedStLossRate, ltGainRate: adjustedLtGainRate };
      // Calendar-year blended rate already accounts for partial-year start.
      yearSensitivityOverrides = {
        baseStLossRate: calStLossRate,
        stRateIsCalendarBlended: true,
      };
    }

    const result = calculateYearWithSensitivity(
      year,
      effectiveQfafValue,
      yearStartTotalCollateral,
      stCarryforward,
      ltCarryforward,
      nolCarryforward,
      inputs,
      strategyForYear,
      yearTaxRates,
      adjustedSettings,
      sensitivity.stLossRateVariance,
      sensitivity.ltGainRateVariance,
      scaledTrackingError,
      allocation.isSplit ? undefined : allocation.primary.strategy,
      yearFractionForCall,
      strategyActive,
      yearSensitivityOverrides
    );

    // Per-leg next-year growth/fees in split mode.
    if (allocation.isSplit) {
      const baseReturn = adjustedSettings.growthEnabled ? adjustedSettings.defaultAnnualReturn : 0;
      for (let i = 0; i < legCollateral.length; i++) {
        const legStrategy = yearStartLegs[i].strategy;
        const legFinancing = getEffectiveFinancingCost(legStrategy, adjustedSettings);
        const grown = legCollateral[i] * (1 + baseReturn * yearFractionForCall);
        legCollateral[i] = safeNumber(grown * (1 - legFinancing * yearFractionForCall));
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

  return {
    sizing,
    years,
    summary: calculateSummary(years, sizing, inputs.qfafEnabled !== false ? inputs.qfafDuration : undefined),
  };
}

interface SensitivityYearOverrides {
  baseStLossRate?: number; // pre-blended rate; bypasses internal getEffectiveStLossRate
  // When true, the override above is a calendar-year time-weighted rate that
  // already includes the partial-year fractional weighting. The inner
  // computation should NOT multiply ST losses by `yearFraction` again.
  stRateIsCalendarBlended?: boolean;
  financingCost?: number;  // pre-blended financing; bypasses fullStrategy lookup
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
  strategyActive: boolean = true, // Whether the strategy is actively generating tax events
  overrides?: SensitivityYearOverrides
): YearResult {
  // QFAF generates ST gains and ordinary losses at qfafMultiplier rate
  const qfafMultiplier = settings.qfafMultiplier ?? QFAF_ST_GAIN_RATE;
  const stGainsGenerated = strategyActive ? safeNumber(qfafValue * qfafMultiplier * yearFraction) : 0;
  const ordinaryLossesGenerated = strategyActive ? safeNumber(qfafValue * qfafMultiplier * yearFraction) : 0;

  // Get base rates with decay (same as normal calculation), or use blended override.
  const baseStLossRate =
    overrides?.baseStLossRate ??
    getEffectiveStLossRate(inputs.strategyId, strategy.ltGainRate, year);

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

  // When the caller passes a calendar-year blended rate, the partial-year
  // weighting is already baked into the rate — don't multiply by yearFraction.
  const stRateIsCalendarBlended = overrides?.stRateIsCalendarBlended === true;
  const grossStLosses = strategyActive
    ? collateralValue * adjustedStLossRate * (stRateIsCalendarBlended ? 1 : yearFraction)
    : 0;
  const stLossesHarvested = safeNumber(grossStLosses * (1 - settings.washSaleDisallowanceRate));
  const ltGainsRealized = strategyActive && inputs.ltGainsEnabled !== false ? safeNumber(collateralValue * adjustedLtGainRate * yearFraction) : 0;

  // Net ST position
  const grossNetSt = stGainsGenerated - stLossesHarvested;

  // Apply ST carryforward to offset any remaining ST gains
  let netStGainLoss = grossNetSt;
  let usedStCarryforward = 0;
  if (netStGainLoss > 0 && stCarryforward > 0) {
    usedStCarryforward = Math.min(stCarryforward, netStGainLoss);
    netStGainLoss -= usedStCarryforward;
  }

  // Section 461(l) limitation on ordinary losses (income clamped ≥ 0, see core.ts)
  const usableOrdinaryLoss = Math.min(
    ordinaryLossesGenerated,
    taxRates.section461Limit,
    Math.max(0, inputs.annualIncome)
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
  const { stRate, ltRate, ordinaryRate, stateRate } = taxRates;
  const combinedStRate = stRate + stateRate;
  const combinedLtRate = ltRate + stateRate;
  // NIIT excluded from deductions against ordinary income (IRC §1411) — see core.ts
  const combinedOrdinaryRate = ordinaryRate + stateRate;

  // Benefits
  const ordinaryLossBenefit = safeNumber(usableOrdinaryLoss * combinedOrdinaryRate);
  const capitalLossBenefit = safeNumber(capitalLossUsedAgainstIncome * combinedOrdinaryRate);
  const nolUsageBenefit = safeNumber(nolUsed * combinedOrdinaryRate);

  // Costs
  const ltGainCost = safeNumber(ltGainsRealized * combinedLtRate);
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

  // Component-specific benefits for view mode breakdown
  const qfafTaxBenefit = safeNumber(ordinaryLossBenefit + nolUsageBenefit);
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
  // Financing cost: use override if supplied (split mode); otherwise look up from strategy.
  let totalFinancingCost: number;
  if (overrides?.financingCost !== undefined) {
    totalFinancingCost = overrides.financingCost;
  } else {
    const strategyForFinancing = fullStrategy || getStrategy(inputs.strategyId);
    totalFinancingCost = strategyForFinancing
      ? getEffectiveFinancingCost(strategyForFinancing, settings)
      : 0;
  }
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
    stToLtConversionBenefit: 0, // Deprecated: ST gains/losses wash by design
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
