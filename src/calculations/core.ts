import {
  CalculatorInputs,
  YearResult,
  CalculationResult,
  AdvancedSettings,
  DEFAULT_SETTINGS,
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
 * Calculate the effective financing cost based on strategy leverage and user settings.
 * Simple mode: wealth management fee + manager fees (base rate × leverage% + fixed component).
 * Detailed mode: calculates cost from individual component rates and strategy leverage.
 * @param strategy - The investment strategy (determines leverage ratios)
 * @param settings - Advanced settings with financing cost configuration
 * @returns Effective financing cost as a decimal (e.g., 0.025 = 2.5% of portfolio per year)
 */
function getEffectiveFinancingCost(strategy: Strategy, settings: AdvancedSettings): number {
  if (!settings.financingFeesEnabled) return 0;

  if (settings.financingMode === 'simple') {
    // Simple mode: two components
    // 1. Wealth management fee (flat, e.g. 55 bps)
    // 2. Manager fees: base rate × leverage% + fixed component (e.g. 90bp × 45% + 14.2bp)
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

/**
 * Compute the collateral-weighted financing cost across all legs of an
 * allocation. In single-strategy mode this just returns the one leg's cost.
 */
function getBlendedFinancingCost(
  allocation: ResolvedAllocation,
  settings: AdvancedSettings
): number {
  if (allocation.totalCollateral <= 0) return 0;
  let weightedSum = 0;
  for (const leg of allocation.legs) {
    weightedSum += leg.collateralAmount * getEffectiveFinancingCost(leg.strategy, settings);
  }
  return weightedSum / allocation.totalCollateral;
}

export function calculate(
  inputs: CalculatorInputs,
  settings: AdvancedSettings = DEFAULT_SETTINGS
): CalculationResult {
  const sizing = calculateSizing(inputs, settings.qfafMultiplier, settings.washSaleDisallowanceRate);
  const allocation = resolveAllocation(inputs);

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
  const bracketOrdinaryRate = getFederalOrdinaryRate(inputs.annualIncome, inputs.filingStatus);
  const stateRate =
    inputs.stateCode === 'OTHER' ? inputs.stateRate : getStateRate(inputs.stateCode);

  // When using custom rates, apply them directly; otherwise use bracket-based rates
  // NIIT is added on top of LT rate when applicable (income > $250k MFJ, $200k single)
  // ordinaryRate excludes NIIT: deductions against wages don't reduce NII (§1411)
  const taxRates: TaxRates = {
    stRate: useCustomRates ? settings.stcgRate : bracketStRate,
    ltRate: useCustomRates ? settings.ltcgRate + settings.niitRate : bracketLtRate,
    ordinaryRate: useCustomRates ? settings.stcgRate : bracketOrdinaryRate,
    stateRate,
    section461Limit,
  };

  const years: YearResult[] = [];

  let qfafValue = sizing.qfafValue;
  const initialQfafValue = sizing.qfafValue;
  const isDynamic = inputs.qfafSizingMode === 'dynamic' && inputs.qfafEnabled !== false;
  // Track each leg's collateral separately so per-leg financing fees compound
  // correctly. In single-strategy mode this collapses to one leg.
  const legCollateral = allocation.legs.map(leg => leg.collateralAmount);
  let stCarryforward = inputs.existingStLossCarryforward;
  let ltCarryforward = inputs.existingLtLossCarryforward;
  let nolCarryforward = inputs.existingNolCarryforward;

  // Use projectionYears from settings (defaults to 10)
  const projectionYears = settings.projectionYears ?? 10;

  // QFAF duration determines when strategy ends; the projection then shows the
  // wind-down tail so carryforward usage stays visible.
  const qfafDuration = inputs.qfafEnabled !== false ? (inputs.qfafDuration ?? 10) : 0;

  // Partial year: month 1 = full year (12/12), month 4 = 9/12, month 12 = 1/12.
  // For partial-year starts (yf < 1), the strategy spans qfafDuration + 1
  // calendar years (with Y1 and the final year being partial).
  const yf = (13 - (inputs.startMonth ?? 1)) / 12;
  const isPartialStart = yf < 1;
  // Last calendar year in which the strategy is still operating.
  const strategyLastCalendarYear =
    qfafDuration > 0 ? qfafDuration + (isPartialStart ? 1 : 0) : 0;

  // Auto-extend the projection to show at least 2 post-QFAF wind-down years
  // (D-004). Matches calculateWithOverrides so the two views agree.
  const minProjection =
    qfafDuration > 0 ? strategyLastCalendarYear + 2 : projectionYears;
  const effectiveProjectionYears = Math.max(projectionYears, minProjection);

  for (let year = 1; year <= effectiveProjectionYears; year++) {
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

    // Operating fraction: how much of this calendar year the strategy is
    // active. Y1 = yf, Y2..duration = 1.0, Y_{duration+1} = 1-yf, after = 0.
    const opFraction = getOperatingFraction(year, inputs.startMonth ?? 1, qfafDuration);
    // Calendar-year time-weighted ST loss rate: blends two operating years
    // when start month != January. Already encodes the fractional weighting.
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

    // Dynamic resizing: shrink QFAF to match this calendar year's collateral
    // ST losses. Both sides scale with operating fraction, so it cancels out
    // of the sizing target, but we use the calendar-year-blended rate.
    let cashReturned = 0;
    if (isDynamic && effectiveQfafValue > 0 && opFraction > 0) {
      // calStLossRate already includes the operating fraction; QFAF gains
      // also include opFraction. Setting them equal:
      //   qfaf × mult × opFrac = collateral × calRate
      // Both calRate and (mult × opFrac) for an operating-year-aligned year
      // simplify to give the steady-state QFAF size.
      const neededQfaf =
        yearStartTotalCollateral *
        calStLossRate *
        (1 - settings.washSaleDisallowanceRate) /
        ((settings.qfafMultiplier ?? QFAF_ST_GAIN_RATE) * opFraction) *
        (1 - (inputs.qfafSizingCushion ?? 0));
      // Can only shrink, never grow beyond initial or current value
      const cappedQfaf = Math.min(effectiveQfafValue, neededQfaf, initialQfafValue);
      cashReturned = Math.max(0, effectiveQfafValue - cappedQfaf);
      effectiveQfafValue = cappedQfaf;
    }

    // Strategy is active (harvesting) only while opFraction > 0.
    const strategyActive = opFraction > 0;
    // Operating fraction passed to calculateYear: drives QFAF activity, LT
    // gains, growth, and fees. After strategy ends, growth still applies for
    // a full year (wind-down).
    const yearFractionForCall = strategyActive ? opFraction : 1.0;

    // For split mode, pre-compute the blended rates the inner math needs.
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
      taxRates,
      settings,
      undefined, // yearIncome (not overridden)
      allocation.isSplit ? undefined : allocation.primary.strategy, // Pass full strategy for financing cost calculation
      yearFractionForCall,
      strategyActive,
      yearOverrides
    );

    // In split mode, calculateYear returns the combined growth-applied collateral,
    // but we want to track each leg's value separately so next year's blends
    // reflect their diverging financing/growth costs. Recompute per leg here
    // and override the displayed totals with the leg-tracked sum.
    if (allocation.isSplit) {
      const baseReturn = settings.growthEnabled ? settings.defaultAnnualReturn : 0;
      for (let i = 0; i < legCollateral.length; i++) {
        const legStrategy = yearStartLegs[i].strategy;
        const legFinancing = getEffectiveFinancingCost(legStrategy, settings);
        const grown = legCollateral[i] * (1 + baseReturn * yearFractionForCall);
        legCollateral[i] = safeNumber(grown * (1 - legFinancing * yearFractionForCall));
      }
      const legSum = legCollateral.reduce((s, v) => s + v, 0);
      result.collateralValue = legSum;
      result.totalValue = result.qfafValue + legSum;
    } else {
      // Single-strategy mode: keep behavior identical to legacy code by
      // pulling the next year's start value from calculateYear's result.
      legCollateral[0] = result.collateralValue;
    }

    // Terminal unwind: in the strategy's last operating calendar year the
    // QFAF is redeemed at its end-of-year value (breakeven unwind — annual
    // gain/loss allocations keep outside basis at NAV, so no tax on exit in
    // this model) and the proceeds are returned to the client as cash.
    // Without this, the QFAF principal silently vanished from total wealth.
    const terminalProceeds =
      strategyLastCalendarYear > 0 && year === strategyLastCalendarYear ? result.qfafValue : 0;
    years.push({ ...result, qfafCashReturned: cashReturned + terminalProceeds });
    // Don't track QFAF growth after the strategy's final calendar year.
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
