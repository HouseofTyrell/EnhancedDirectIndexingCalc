import {
  CalculatorInputs,
  YearResult,
  CalculationResult,
  CalculatedSizing,
  AdvancedSettings,
  DEFAULT_SETTINGS,
  YearOverride,
} from '../types';
import {
  getFederalStRate,
  getFederalLtRate,
  getFederalOrdinaryRate,
  getStateRate,
  getStateTaxProfile,
  computeLtcgExcise,
} from '../taxData';
import {
  getStrategy,
  QFAF_ST_GAIN_RATE,
  CAPITAL_LOSS_LIMITS,
  SECTION_461L_LIMITS,
  NOL_OFFSET_PERCENTAGE,
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
import { resolveDeleveragePlan, resolveDeleverageSchedule } from './deleverage';

/**
 * Optional per-year overrides used by the split-allocation and deleverage
 * paths. When these are supplied, `calculateYear` skips its single-strategy
 * lookups and uses the pre-blended values instead.
 */
export interface CalculateYearOverrides {
  effectiveStLossRate?: number;
  ltGainRate?: number;
  financingCost?: number;
  /** Planned capital-gain event this year (D-012) */
  eventStGain?: number;
  eventLtGain?: number;
  // Deleverage plan (D-016/D-017). Unlike D-012 gain events (exogenous,
  // sheltered event-LAST, never charged to savings), unwind gains are
  // ENDOGENOUS strategy costs: they net WITH strategy flows and their tax
  // IS charged against taxSavings.
  /** End-of-year extension weight (1 when no plan) */
  extensionFraction?: number;
  /** ST-character unwind gain realized this year (incl. short-cover gain) */
  unwindStGain?: number;
  /** LT-character unwind gain realized this year */
  unwindLtGain?: number;
  /** Financing-fee dollars saved vs the un-delevered source book this year */
  deleverageFinancingSaved?: number;
  /**
   * D-020: sum of UNEXPIRED state NOL vintages at the start of the year
   * (CA 20-year carryover). When defined, the state-rate component of the
   * NOL usage benefit is applied to at most this many dollars; federal NOL
   * math is untouched. Undefined = no state expiry (ledger off).
   */
  stateNolAvailable?: number;
}

/**
 * State NOL vintage (D-020). CA NOLs expire 20 years after the loss year
 * (R&TC §17276); SB 167 extends the carryover of NOLs whose deduction was
 * suspended (+1 year per suspension year). The ledger gates ONLY the state
 * component of NOL benefits — federal NOLs are indefinite.
 */
interface StateNolVintage {
  yearCreated: number;
  amount: number;
  /** Last projection year in which this vintage is deductible; it expires at the END of this year. */
  lastUsableYear: number;
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
  const baseSizing = calculateSizing(
    inputs,
    settings.qfafMultiplier,
    settings.washSaleDisallowanceRate
  );

  // Pre-calculate base tax rates and the per-state treatment profile (D-005)
  const baseStateRate =
    inputs.stateCode === 'OTHER' ? inputs.stateRate : getStateRate(inputs.stateCode);
  const stateProfile = getStateTaxProfile(inputs.stateCode, baseStateRate, inputs.nycResident);

  // D-020: state NOL vintage ledger (CA only — runs only when the profile
  // defines a carryover period; zero behavior change for every other state).
  // Vintages are consumed FIFO (oldest first, matching CA ordering rules and
  // the taxpayer-favorable default) whenever NOL is used, and expire at the
  // end of year `yearCreated + carryover`. Pre-existing NOL assumption: it is
  // treated as a single pre-2024 loss whose deduction was suspended for all
  // three SB 167 years (2024–2026), so it gets the full +3-year extension —
  // carryover 20 + 3 measured from vintage year 0 (the year before the
  // projection starts), i.e. usable through the end of projection year 23.
  const stateNolCarryoverYears = stateProfile.nolCarryoverYears;
  const stateNolVintages: StateNolVintage[] = [];
  if (stateNolCarryoverYears !== undefined && inputs.existingNolCarryforward > 0) {
    stateNolVintages.push({
      yearCreated: 0,
      amount: inputs.existingNolCarryforward,
      lastUsableYear: stateNolCarryoverYears + 3,
    });
  }

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
  // QFAF redemptions awaiting redeployment into the core leg (toggle).
  // Proceeds land at the START of the following year.
  const redeployProceeds = inputs.redeployQfafProceeds === true;
  let pendingRedeploy = 0;
  const initialQfafValue = baseSizing.qfafValue;
  const isDynamic = inputs.qfafSizingMode === 'dynamic' && inputs.qfafEnabled !== false;

  // Use projectionYears from settings (defaults to 10)
  const projectionYears = settings.projectionYears ?? 10;

  // Auto-extend projection to show at least 2 post-QFAF years.
  // Partial-year starts extend the strategy's life by one calendar year.
  const qfafDuration = inputs.qfafEnabled !== false ? (inputs.qfafDuration ?? 10) : 0;
  const yf = (13 - (inputs.startMonth ?? 1)) / 12;
  const isPartialStart = yf < 1;
  const strategyLastCalendarYear = qfafDuration > 0 ? qfafDuration + (isPartialStart ? 1 : 0) : 0;
  const minProjection = qfafDuration > 0 ? strategyLastCalendarYear + 2 : projectionYears;
  const effectiveProjectionYears = Math.max(projectionYears, minProjection);
  // NOL exhaustion extension: if NOL remains at the end of the standard
  // horizon, keep projecting wind-down years until it is fully used (capped,
  // and stopping early if no income is consuming it).
  const hardCapYears = Math.max(effectiveProjectionYears, 40);

  // Deleveraging (D-016/D-017): resolve the per-year glide schedule once.
  // Null when the plan is disabled/invalid or split allocation is enabled
  // (split wins in v1; the UI shows a "plan ignored" warning).
  const dlvPlan = allocation.isSplit ? null : resolveDeleveragePlan(inputs);
  const dlvSchedule = dlvPlan ? resolveDeleverageSchedule(inputs, settings, hardCapYears) : null;
  // Running embedded-gain state for unwind-gain sizing (consistent with
  // exitTax.ts: market appreciation + pre-existing gain + Σ(harvested ST
  // losses − realized LT gains) − Σ prior unwind gains realized).
  const dlvInitialCollateral = allocation.totalCollateral;
  const dlvCostBasis =
    inputs.collateralCostBasis !== undefined
      ? Math.min(inputs.collateralCostBasis, dlvInitialCollateral)
      : dlvInitialCollateral;
  const dlvPreExistingGain = Math.max(0, dlvInitialCollateral - dlvCostBasis);
  let dlvCumNetHarvest = 0;
  let dlvCumUnwindRealized = 0;
  // Income for extension years continues the FINAL scheduled year's income
  // (e.g., a retirement schedule persists), not the base input.
  let carryIncome = inputs.annualIncome;
  // Final projected year's combined gains rates, for valuing the ending
  // carryforward balances as a contingent loss reserve (D-015).
  let finalYearRates: TaxRates | undefined;

  for (let year = 1; year <= hardCapYears; year++) {
    const inNolExtension = year > effectiveProjectionYears;
    // Extension runs while NOL or capital-loss carryforwards remain; the
    // stall guard below stops it once nothing is meaningfully consuming them
    // (the $3K/yr ordinary offset alone doesn't justify decades of rows).
    if (inNolExtension && nolCarryforward <= 0.5 && stCarryforward + ltCarryforward <= 0.5) break;

    const override = overrideMap.get(year);

    // Redeploy last year's QFAF redemptions into the core/collateral leg
    if (redeployProceeds && pendingRedeploy > 0) {
      legCollateral[infusionTargetIndex] += pendingRedeploy;
      pendingRedeploy = 0;
    }

    // Get effective income for this year
    const yearIncome = override?.w2Income ?? (inNolExtension ? carryIncome : inputs.annualIncome);

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
      state: stateProfile,
      section461Limit:
        settings.section461Limits[inputs.filingStatus] ?? SECTION_461L_LIMITS[inputs.filingStatus],
    };

    // Apply cash infusion at the start of the year
    const rawCashInfusion = override?.cashInfusion ?? 0;
    const cashInfusionTaxType = override?.cashInfusionTaxType ?? 'gross';
    let cashInfusion = rawCashInfusion;
    if (rawCashInfusion !== 0 && cashInfusionTaxType === 'gross') {
      const combinedStRate = yearTaxRates.stRate + yearTaxRates.state.stRate;
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
    const dlvYear = dlvSchedule ? dlvSchedule[year - 1] : undefined;
    // Deleverage years replace the rate with the source→target blend; the
    // dynamic-QFAF sizing below consumes the same blended rate, so dynamic
    // sizing self-corrects as the book delevers (fixed sizing does not —
    // the UI warns about ST gain leakage).
    const calStLossRate = dlvYear
      ? dlvYear.stLossRate
      : allocation.isSplit
        ? getBlendedCalendarYearStLossRate(
            yearAllocation,
            year,
            inputs.startMonth ?? 1,
            qfafDuration
          )
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
        ((yearStartTotalCollateral * calStLossRate * (1 - settings.washSaleDisallowanceRate)) /
          ((settings.qfafMultiplier ?? QFAF_ST_GAIN_RATE) * opFraction)) *
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
    } else if (dlvYear && dlvPlan) {
      strategyForCalc = { stLossRate: calStLossRate, ltGainRate: dlvYear.ltGainRate };
      yearOverrides = {
        effectiveStLossRate: calStLossRate,
        ltGainRate: dlvYear.ltGainRate,
        financingCost: dlvYear.financingCost,
        extensionFraction: dlvYear.w,
        deleverageFinancingSaved:
          dlvYear.financingSavedRate * yearStartTotalCollateral * yearFractionForCall,
      };
    } else {
      strategyForCalc = allocation.primary.strategy;
      yearOverrides = { effectiveStLossRate: calStLossRate };
    }

    // Unwind gains for the fraction delevered this year (D-017 defaults:
    // pro-rata embedded gain on the long extension, LT once seasoned; short
    // covers realize shortCoverGainPct — 0 by default, shorts are
    // continuously loss-recycled). Gains deplete the embedded-gain pool.
    let dlvLongUnwindGain = 0;
    if (dlvYear && dlvPlan && dlvYear.fracUnwoundThisYear > 0) {
      const embeddedGain = Math.max(
        0,
        yearStartTotalCollateral -
          dlvInitialCollateral +
          dlvPreExistingGain +
          dlvCumNetHarvest -
          dlvCumUnwindRealized
      );
      // Pro-rata: gain per dollar of the LONG book (NAV × (1 + long leverage)).
      const grossLongValue = yearStartTotalCollateral * (1 + dlvPlan.sourceLongLeverage);
      const embeddedGainPct = grossLongValue > 0 ? embeddedGain / grossLongValue : 0;
      const longDollarsUnwound =
        dlvYear.fracUnwoundThisYear *
        Math.max(0, dlvPlan.sourceLongLeverage - dlvPlan.targetLongLeverage) *
        yearStartTotalCollateral;
      dlvLongUnwindGain = dlvPlan.lotSelectionHaircut * embeddedGainPct * longDollarsUnwound;
      const shortDollarsCovered =
        dlvYear.fracUnwoundThisYear *
        Math.max(0, dlvPlan.sourceShortRatio - dlvPlan.targetShortRatio) *
        yearStartTotalCollateral;
      const shortCoverGain = dlvPlan.shortCoverGainPct * shortDollarsCovered;
      yearOverrides.unwindStGain =
        (dlvPlan.unwindGainCharacter === 'st' ? dlvLongUnwindGain : 0) + shortCoverGain;
      yearOverrides.unwindLtGain = dlvPlan.unwindGainCharacter === 'lt' ? dlvLongUnwindGain : 0;
    }

    const ev = override?.gainEvent;
    if (ev && ev.amount > 0) {
      yearOverrides.eventStGain = ev.character === 'st' ? ev.amount : 0;
      yearOverrides.eventLtGain = ev.character === 'lt' ? ev.amount : 0;
    }

    // D-020: unexpired state-side NOL available this year. Expired vintages
    // are removed at the end of their last usable year, so the ledger sum is
    // exactly the live state pool. Until something expires this equals the
    // federal balance, so the cap never binds and results are unchanged.
    if (stateNolCarryoverYears !== undefined) {
      yearOverrides.stateNolAvailable = stateNolVintages.reduce((s, v) => s + v.amount, 0);
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

    // Advance the embedded-gain pool: this year's net harvest deepens it,
    // long-side unwind realizations deplete it (short-cover gains are not
    // drawn from the long book's pool).
    dlvCumNetHarvest += result.stLossesHarvested - result.ltGainsRealized;
    dlvCumUnwindRealized += dlvLongUnwindGain;

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
    // last operating calendar year. With redeployment on, all redemptions
    // (resize distributions + terminal proceeds) flow back into the core at
    // the start of the next year instead of sitting as outside cash — so
    // qfafCashReturned reports 0 and finalTotalWealth doesn't double count.
    const terminalProceeds =
      strategyLastCalendarYear > 0 && year === strategyLastCalendarYear ? result.qfafValue : 0;
    const totalRedeemed = cashReturned + terminalProceeds;
    // Stall guard: an extension year must consume NOL or burn capital-loss
    // carryforward beyond the $3K ordinary-offset trickle (LT-gain
    // realization, deleverage unwinds); otherwise stop instead of emitting
    // empty years (a $6M CF at $3K/yr would mean ~2,000 of them).
    const cfConsumed =
      stCarryforward + ltCarryforward - (result.stLossCarryforward + result.ltLossCarryforward);
    if (inNolExtension && result.nolUsedThisYear <= 0.5 && cfConsumed <= 3000 + 0.5) {
      break;
    }

    // D-020: advance the state NOL vintage ledger. The D-019 extension/stall
    // guard above is deliberately untouched — it watches the FEDERAL NOL
    // balance, which expiry never reduces.
    if (stateNolCarryoverYears !== undefined) {
      // 1) Consume this year's NOL usage FIFO (oldest vintage first). The
      //    federal nolUsed never exceeds the start-of-year balance, so the
      //    ledger covers it except where vintages have already expired.
      let toConsume = result.nolUsedThisYear;
      for (const vintage of stateNolVintages) {
        if (toConsume <= 0) break;
        const consumed = Math.min(vintage.amount, toConsume);
        vintage.amount -= consumed;
        toConsume -= consumed;
      }
      // 2) Record NOL generated this year as a new vintage. A vintage whose
      //    state deduction was suspended this year (SB 167, MAGI ≥ $1M; year
      //    1 = tax year 2026, the last suspension year) gets +1 carryover.
      if (result.excessToNol > 0) {
        const suspendedThisYear =
          stateProfile.nolStateSuspension !== undefined &&
          year <= stateProfile.nolStateSuspension.throughProjectionYear &&
          yearIncome >= stateProfile.nolStateSuspension.magiThreshold;
        stateNolVintages.push({
          yearCreated: year,
          amount: result.excessToNol,
          lastUsableYear: year + stateNolCarryoverYears + (suspendedThisYear ? 1 : 0),
        });
      }
      // 3) Expire vintages at the end of their last usable year; report the
      //    unused dollars (state-side only — federal NOL is unaffected).
      let stateNolExpiredThisYear = 0;
      for (let i = stateNolVintages.length - 1; i >= 0; i--) {
        const vintage = stateNolVintages[i];
        if (vintage.lastUsableYear <= year) {
          stateNolExpiredThisYear += Math.max(0, vintage.amount);
          stateNolVintages.splice(i, 1);
        } else if (vintage.amount <= 0) {
          stateNolVintages.splice(i, 1);
        }
      }
      result.stateNolExpired = safeNumber(stateNolExpiredThisYear);
    }

    if (redeployProceeds) {
      pendingRedeploy += totalRedeemed;
      years.push({ ...result, qfafCashReturned: 0 });
    } else {
      years.push({ ...result, qfafCashReturned: totalRedeemed });
    }
    carryIncome = yearIncome;
    finalYearRates = yearTaxRates;

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
    summary: calculateSummary(
      years,
      adjustedSizing,
      inputs.qfafEnabled !== false ? inputs.qfafDuration : undefined,
      settings.discountRate,
      // Reserve valuation rates: PA/NJ give individuals NO loss carryforwards,
      // so the state-level shelter of an end-of-horizon CF balance is zero —
      // those losses expire each state tax year. Federal (incl. NIIT) remains.
      finalYearRates && {
        combinedStRate:
          finalYearRates.stRate +
          (finalYearRates.state.allowsLossOffsetAgainstIncome ? finalYearRates.state.stRate : 0),
        combinedLtRate:
          finalYearRates.ltRate +
          (finalYearRates.state.allowsLossOffsetAgainstIncome ? finalYearRates.state.ltRate : 0),
      }
    ),
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
  const stGainsGenerated = strategyActive
    ? safeNumber(qfafValue * qfafMultiplier * yearFraction)
    : 0;
  const ordinaryLossesGenerated = strategyActive
    ? safeNumber(qfafValue * qfafMultiplier * yearFraction)
    : 0;

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
  const ltGainsRealized =
    strategyActive && inputs.ltGainsEnabled !== false
      ? safeNumber(collateralValue * ltGainRate * yearFraction)
      : 0;

  // Deleverage unwind gains (D-016/D-017): ENDOGENOUS strategy costs, the
  // opposite of D-012 gain events — they net WITH the strategy's own flows
  // (current-year harvest first, then carryforwards per the existing §1211
  // ordering) and their tax IS charged against taxSavings.
  const unwindStGain = overrides?.unwindStGain ?? 0;
  const unwindLtGain = overrides?.unwindLtGain ?? 0;

  // Net ST position (should be ~0 with proper auto-sizing; unwind ST gains
  // are absorbed by harvested losses before anything is taxable)
  const grossNetSt = stGainsGenerated - stLossesHarvested + unwindStGain;

  // Apply ST carryforward to offset any remaining ST gains
  let netStGainLoss = grossNetSt;
  let usedStCarryforward = 0;
  if (netStGainLoss > 0 && stCarryforward > 0) {
    usedStCarryforward = Math.min(stCarryforward, netStGainLoss);
    netStGainLoss -= usedStCarryforward;
  }

  // Section 461(l) limitation on ordinary losses — precise model (D-010):
  // the current-year deduction is capped only by the statutory limit; the
  // excess business loss becomes NOL. If the allowed deduction exceeds the
  // income available to shelter (wages + net capital gains − $3K usage), the
  // shortfall ALSO flows to NOL (negative taxable income → NOL, IRC §172)
  // rather than being lost.
  const allowedOrdinaryLoss = Math.min(ordinaryLossesGenerated, taxRates.section461Limit);

  // Calculate carryforwards and NOL usage
  const eventStGain = overrides?.eventStGain ?? 0;
  const eventLtGain = overrides?.eventLtGain ?? 0;

  const {
    newStCarryforward,
    newLtCarryforward,
    nolUsed,
    capitalLossUsedAgainstIncome,
    taxableSt,
    taxableLt,
    eventTaxableSt,
    eventTaxableLt,
  } = calculateCarryforwards(
    netStGainLoss,
    ltGainsRealized + unwindLtGain,
    allowedOrdinaryLoss,
    stCarryforward - usedStCarryforward,
    ltCarryforward,
    nolCarryforward,
    inputs,
    settings,
    effectiveIncome,
    eventStGain,
    eventLtGain
  );

  // Income actually sheltered this year by the §461(l) deduction. Capital
  // gain income absorbs deduction too (the cap base is full taxable income).
  const incomeAvailable = Math.max(
    0,
    effectiveIncome +
      taxableSt +
      taxableLt +
      eventTaxableSt +
      eventTaxableLt -
      capitalLossUsedAgainstIncome
  );
  const usableOrdinaryLoss = Math.min(allowedOrdinaryLoss, incomeAvailable);
  const shortfallToNol = allowedOrdinaryLoss - usableOrdinaryLoss;
  const excessToNol = safeNumber(ordinaryLossesGenerated - allowedOrdinaryLoss + shortfallToNol);

  // Update NOL carryforward: add excess, subtract used
  const newNolCarryforward = safeNumber(nolCarryforward + excessToNol - nolUsed);

  // Calculate tax savings directly as sum of benefits minus costs
  // This matches the Year 1 Tax Benefit breakdown in the UI
  // State rates are character-specific (D-005): PA/NJ give no state benefit
  // for deductions against wages, MA splits ST/LT rates, WA adds an excise.
  const { stRate, ltRate, ordinaryRate, state } = taxRates;
  const combinedStRate = stRate + state.stRate;
  const combinedLtRate = ltRate + state.ltRate;
  // Deductions against ordinary income (wages) don't reduce net investment
  // income, so NIIT is excluded from their value (IRC §1411). This matches
  // the treatment already used in ediOnly.ts for the $3K deduction.
  const stateDeductionRate = state.allowsLossOffsetAgainstIncome ? state.ordinaryRate : 0;
  const combinedOrdinaryRate = ordinaryRate + stateDeductionRate;

  // Benefits:
  // 1. Ordinary loss reduces W2 income tax
  const ordinaryLossBenefit = safeNumber(usableOrdinaryLoss * combinedOrdinaryRate);

  // 2. Capital loss carryforward used against ordinary income ($3k/yr limit)
  const capitalLossBenefit = safeNumber(capitalLossUsedAgainstIncome * combinedOrdinaryRate);

  // 3. NOL used against taxable income. The STATE component is suppressed
  // when the state suspends NOL deductions (CA SB 167: MAGI ≥ $1M through
  // tax year 2026 = projection year 1).
  const stateNolSuspended =
    state.nolStateSuspension !== undefined &&
    year <= state.nolStateSuspension.throughProjectionYear &&
    effectiveIncome >= state.nolStateSuspension.magiThreshold;
  const nolStateRate = stateNolSuspended ? 0 : stateDeductionRate;
  // NOL displaces ordinary-rate income first; with a large gain event the
  // overflow displaces LT-taxed dollars and is valued at the LT rate
  // excluding NIIT (an NOL deduction does not reduce net investment income).
  const ordinaryNolBase = Math.max(
    0,
    effectiveIncome + taxableSt + eventTaxableSt - usableOrdinaryLoss - capitalLossUsedAgainstIncome
  );
  const nolAtOrdinary = Math.min(nolUsed, ordinaryNolBase);
  const nolAtLt = nolUsed - nolAtOrdinary;
  const fedLtNolRate = Math.max(0, ltRate - (settings.niitRate ?? 0.038));
  const ltNolRate = fedLtNolRate + nolStateRate;
  // D-020: when expired CA vintages leave the state-side NOL pool smaller
  // than the federal balance, only the unexpired portion earns the state
  // rate (both NOL tranches share the same state rate, so the state benefit
  // is simply stateEligibleNol × nolStateRate). The original expression is
  // kept when nothing has expired so the no-ledger path is bit-identical.
  const stateEligibleNol =
    overrides?.stateNolAvailable !== undefined
      ? Math.min(nolUsed, overrides.stateNolAvailable)
      : nolUsed;
  const nolUsageBenefit =
    stateEligibleNol >= nolUsed
      ? safeNumber(nolAtOrdinary * (ordinaryRate + nolStateRate) + nolAtLt * ltNolRate)
      : safeNumber(
          nolAtOrdinary * ordinaryRate + nolAtLt * fedLtNolRate + stateEligibleNol * nolStateRate
        );

  // Costs:
  // 1. LT gains are taxed at LT rates (+ WA-style excise above the annual exemption).
  // Charged on TAXABLE LT gains (after carryforward and current-year ST loss
  // offsets), not gross realization — in QFAF mode these are identical (ST
  // losses are consumed by QFAF gains), but in collateral-only mode harvested
  // ST losses offset the LT gains and the cost would otherwise be overstated,
  // inflating the incremental benefit of adding the QFAF. (CPA review finding E.)
  const ltcgExciseTax = computeLtcgExcise(taxableLt, state.ltcgExcise);
  const ltGainCost = safeNumber(taxableLt * combinedLtRate + ltcgExciseTax);

  // Planned gain event (D-012): taxed separately — it is exogenous, so it is
  // NOT charged against the strategy's taxSavings. The program's help shows
  // up as carryforward shelter (event-last), §461(l) absorption, and NOL
  // usage. Marginal excise above the strategy's own gains is event-borne.
  const gainEventAmount = eventStGain + eventLtGain;
  const totalExcise = computeLtcgExcise(taxableLt + eventTaxableLt, state.ltcgExcise);
  const gainEventTax = safeNumber(
    eventTaxableSt * combinedStRate +
      eventTaxableLt * combinedLtRate +
      (totalExcise - ltcgExciseTax)
  );
  const gainEventTaxWithoutStrategy = safeNumber(
    eventStGain * combinedStRate +
      eventLtGain * combinedLtRate +
      computeLtcgExcise(eventLtGain, state.ltcgExcise)
  );
  const gainEventCfShelter = safeNumber(
    eventStGain - eventTaxableSt + (eventLtGain - eventTaxableLt)
  );

  // 2. Any remaining net ST gains (if ST gains > ST losses) taxed at ST rates
  const remainingStGainCost = safeNumber(Math.max(0, netStGainLoss) * combinedStRate);

  // Deleverage tax (D-016): the incremental tax attributable to the unwind
  // amounts at this year's rates — the taxable residue of each character
  // after netting/CF shelter, capped at the unwind amount. This is a
  // REPORTING decomposition: the dollars are already inside ltGainCost /
  // remainingStGainCost (and so already charged against taxSavings), not a
  // second subtraction.
  const taxableUnwindSt = Math.min(unwindStGain, Math.max(0, netStGainLoss));
  const taxableUnwindLt = Math.min(unwindLtGain, taxableLt);
  const deleverageTax = safeNumber(
    taxableUnwindSt * combinedStRate + taxableUnwindLt * combinedLtRate
  );

  // Net tax savings: ordinary deductions minus capital gains costs
  // ST gains and ST losses wash (by design) — no phantom "conversion benefit"
  const taxSavings = safeNumber(
    ordinaryLossBenefit + capitalLossBenefit + nolUsageBenefit - ltGainCost - remainingStGainCost
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
    Math.max(0, netStGainLoss) * combinedStRate + taxableLt * combinedLtRate
  );
  const federalTax = safeNumber(
    Math.max(0, grossInvestmentTax - ordinaryLossBenefit - capitalLossBenefit - nolUsageBenefit) *
      (combinedStRate > 0 ? stRate / combinedStRate : 1)
  );
  const stateTax = safeNumber(
    Math.max(0, grossInvestmentTax - ordinaryLossBenefit - capitalLossBenefit - nolUsageBenefit) *
      (combinedStRate > 0 ? state.stRate / combinedStRate : 0)
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
    ? settings.qfafAnnualReturn !== null
      ? settings.qfafAnnualReturn
      : settings.defaultAnnualReturn
    : 0;
  const qfafGrowthRate = settings.qfafGrowthEnabled ? qfafBaseReturn : 0;
  // Grow at full return rate, then deduct fees at end of year on the grown value
  const grownQfafValue = safeNumber(qfafValue * (1 + qfafGrowthRate * yearFraction));
  const newQfafValue = safeNumber(grownQfafValue * (1 - totalFinancingCost * yearFraction));
  const grownCollateralValue = safeNumber(collateralValue * (1 + baseReturn * yearFraction));
  const newCollateralValue = safeNumber(
    grownCollateralValue * (1 - totalFinancingCost * yearFraction)
  );
  // Dollar financing cost charged this year (D-014 insights input). In split
  // mode the blended rate is weighted by start-of-year collateral and all
  // legs grow at the same base return, so charging it on the grown total
  // matches the per-leg fees the calling loop applies exactly.
  const financingCostPaid = safeNumber(
    (grownQfafValue + grownCollateralValue) * totalFinancingCost * yearFraction
  );

  // Calculate total income offset for this year
  // This is the sum of all deductions that reduce taxable income
  const incomeOffsetAmount = safeNumber(
    usableOrdinaryLoss + nolUsed + capitalLossUsedAgainstIncome
  );

  // Minimum W-2 income that fully utilizes this year's shelter (planning
  // target for bonuses / option exercises): the §461(l) deduction must be
  // fully absorbed and 80% of pre-NOL taxable income must cover the entire
  // start-of-year NOL balance. Capital-gain income already contributes, so
  // it is netted out; nolCarryforward here is the start-of-year balance.
  const nolLimitForRequired = settings.nolOffsetLimit ?? NOL_OFFSET_PERCENTAGE;
  const incomeRequiredForFullUtilization = safeNumber(
    Math.max(
      0,
      allowedOrdinaryLoss +
        capitalLossUsedAgainstIncome +
        (nolLimitForRequired > 0 ? nolCarryforward / nolLimitForRequired : 0) -
        taxableSt -
        taxableLt -
        eventTaxableSt -
        eventTaxableLt
    )
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
    stateNolExpired: 0, // Set by the calling loop's vintage ledger (D-020)
    effectiveStLossRate,
    incomeOffsetAmount,
    maxIncomeOffsetCapacity,
    incomeRequiredForFullUtilization,
    gainEventAmount: safeNumber(gainEventAmount),
    gainEventTax,
    gainEventTaxWithoutStrategy,
    gainEventCfShelter,
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
    financingCostPaid,
    strategyActive,
    extensionFraction: overrides?.extensionFraction ?? 1,
    deleverageGainRealized: safeNumber(unwindStGain + unwindLtGain),
    deleverageGainSt: safeNumber(unwindStGain),
    deleverageGainLt: safeNumber(unwindLtGain),
    deleverageTax,
    financingSaved: safeNumber(overrides?.deleverageFinancingSaved ?? 0),
  };
}
