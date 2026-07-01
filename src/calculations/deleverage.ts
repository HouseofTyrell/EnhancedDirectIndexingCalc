import { CalculatorInputs, AdvancedSettings, DeleveragePlan } from '../types';
import { Strategy, getStrategy, getLongLeverageRatio, getShortRatio } from '../strategyData';
import { getEffectiveStLossRate } from './helpers';
import { getFinancingCostForRatios } from './financing';

/**
 * Deleveraging schedule resolution (D-016/D-017).
 *
 * Mirrors splitAllocation.ts: pure functions that turn a `DeleveragePlan`
 * into per-year blended rates the projection loop feeds through the existing
 * `CalculateYearOverrides` hook. The extension weight w glides 1 → 0
 * linearly over `durationYears` starting at `startYear` (1 = all-at-once),
 * and every per-year rate is `w·source + (1−w)·target` with the target
 * schedule sampled at the CURRENT year index — the target book is seasoned
 * by the years already operated; restarting it at year 1 would
 * phantom-inflate harvesting (D-017).
 *
 * NAV is unchanged by deleveraging: gross exposure falls, net stays 100%.
 */

/** Target id for unwinding to traditional long-only direct indexing. */
export const LONG_ONLY_TARGET = 'long-only';

/**
 * Industry-standard long-only TLH rates (Parametric/Aperio/Wealthfront-style),
 * indexed by year (0-based). Canonical values carried over from the retired
 * ediOnly.ts trad-DI benchmark.
 */
export const TRAD_DI_ST_LOSS_RATES = [
  0.05, 0.035, 0.025, 0.02, 0.015, 0.015, 0.015, 0.015, 0.015, 0.015,
];

/** Occasional rebalancing LT gain rate for traditional DI (no overlay). */
export const TRAD_DI_LT_GAIN_RATE = 0.005;

export interface ResolvedDeleveragePlan {
  startYear: number;
  durationYears: number;
  target: string;
  targetLabel: string;
  /** D-017 default: 'lt' once seasoned (startYear > 2), 'st' before */
  unwindGainCharacter: 'lt' | 'st';
  /** D-017 default: 1.0 (pro-rata embedded gain, no HIFO discount) */
  lotSelectionHaircut: number;
  /** D-017 default: 0 (shorts continuously loss-recycled) — disclosed on screen */
  shortCoverGainPct: number;
  source: Strategy;
  sourceLongLeverage: number;
  sourceShortRatio: number;
  targetLongLeverage: number;
  targetShortRatio: number;
}

export interface DeleverageYearSchedule {
  year: number;
  /** End-of-year extension weight: 1 = fully levered, 0 = fully at target */
  w: number;
  /** w(y−1) − w(y): fraction of the full glide unwound during this year */
  fracUnwoundThisYear: number;
  /** Calendar-year blended ST loss rate (already time-weighted; no extra yearFraction) */
  stLossRate: number;
  /** Blended LT gain rate (operating rate; caller applies yearFraction) */
  ltGainRate: number;
  /** Financing cost at the year's interpolated leverage ratios (0 when fees disabled) */
  financingCost: number;
  /** source financing cost − blended cost (≥ 0 for a deleverage; 0 when fees disabled) */
  financingSavedRate: number;
}

/**
 * Resolve a plan against an explicit source strategy (no inputs coupling).
 * Returns null when the plan is malformed or its target can't be resolved.
 * Shared by the single-strategy path (`resolveDeleveragePlan`) and the
 * per-leg split path (`resolveLegDeleveragePlan`, D-028).
 */
function resolvePlanForSource(
  plan: DeleveragePlan,
  source: Strategy
): ResolvedDeleveragePlan | null {
  if (!(plan.startYear >= 1) || !(plan.durationYears >= 1)) return null;

  let targetLongLeverage: number;
  let targetShortRatio: number;
  let targetLabel: string;
  if (plan.target === LONG_ONLY_TARGET) {
    // Long-only DI: no margin debt, no shorts.
    targetLongLeverage = 0;
    targetShortRatio = 0;
    targetLabel = 'Long-only direct indexing';
  } else {
    const target = getStrategy(plan.target);
    if (!target) return null;
    targetLongLeverage = getLongLeverageRatio(target);
    targetShortRatio = getShortRatio(target);
    targetLabel = target.name;
  }

  return {
    startYear: Math.floor(plan.startYear),
    durationYears: Math.floor(plan.durationYears),
    target: plan.target,
    targetLabel,
    unwindGainCharacter: plan.unwindGainCharacter ?? (plan.startYear > 2 ? 'lt' : 'st'),
    lotSelectionHaircut: plan.lotSelectionHaircut ?? 1.0,
    shortCoverGainPct: plan.shortCoverGainPct ?? 0,
    source,
    sourceLongLeverage: getLongLeverageRatio(source),
    sourceShortRatio: getShortRatio(source),
    targetLongLeverage,
    targetShortRatio,
  };
}

/**
 * Validate and resolve the single-strategy plan against the inputs. Returns
 * null when the plan is disabled, malformed, or out of scope: split allocation
 * runs its own PER-LEG plans (D-028), so the top-level plan is ignored when
 * split is enabled.
 */
export function resolveDeleveragePlan(inputs: CalculatorInputs): ResolvedDeleveragePlan | null {
  const plan = inputs.deleveragePlan;
  if (!plan || !plan.enabled) return null;
  if (inputs.splitAllocation?.enabled) return null;

  const source = getStrategy(inputs.strategyId);
  if (!source) return null;

  return resolvePlanForSource(plan, source);
}

/**
 * Resolve a per-leg plan in split mode (D-028). Unlike `resolveDeleveragePlan`
 * there is no split guard — these plans ARE the split-mode deleverage path —
 * and the source strategy is the leg's own strategy, not `inputs.strategyId`.
 */
export function resolveLegDeleveragePlan(
  plan: DeleveragePlan | undefined,
  source: Strategy
): ResolvedDeleveragePlan | null {
  if (!plan || !plan.enabled) return null;
  return resolvePlanForSource(plan, source);
}

/**
 * End-of-year extension weight for a plan: 1 before startYear, then a linear
 * glide reaching 0 at the end of year startYear + durationYears − 1.
 */
export function getExtensionWeight(
  plan: Pick<ResolvedDeleveragePlan, 'startYear' | 'durationYears'>,
  year: number
): number {
  if (year < plan.startYear) return 1;
  const stepsTaken = year - plan.startYear + 1;
  return Math.max(0, 1 - stepsTaken / plan.durationYears);
}

/** Target ST loss rate for an operating year (seasoned: sampled at the CURRENT index). */
function targetStLossRateForYear(plan: ResolvedDeleveragePlan, year: number): number {
  if (plan.target === LONG_ONLY_TARGET) {
    const index = Math.min(Math.max(0, year - 1), TRAD_DI_ST_LOSS_RATES.length - 1);
    return TRAD_DI_ST_LOSS_RATES[index];
  }
  // Composes through getEffectiveStLossRate so localStorage custom rates for
  // the target strategy are honored.
  const target = getStrategy(plan.target);
  if (!target) return 0;
  return getEffectiveStLossRate(target.id, target.ltGainRate, year);
}

function targetLtGainRate(plan: ResolvedDeleveragePlan): number {
  if (plan.target === LONG_ONLY_TARGET) return TRAD_DI_LT_GAIN_RATE;
  return getStrategy(plan.target)?.ltGainRate ?? 0;
}

/**
 * Calendar-year time-weighting of an arbitrary operating-year rate schedule.
 * Mirrors helpers.getCalendarYearStLossRate's structure (partial-year starts
 * straddle two operating years; rates past the strategy's life are 0) so the
 * blended source/target rates window identically.
 */
function calendarRate(
  rateFn: (operatingYear: number) => number,
  calendarYear: number,
  startMonth: number,
  qfafDuration: number
): number {
  if (calendarYear <= 0) return 0;
  const yf = (13 - (startMonth ?? 1)) / 12;
  if (calendarYear === 1) return rateFn(1) * yf;
  if (qfafDuration > 0) {
    if (calendarYear === qfafDuration + 1 && yf < 1) {
      return rateFn(qfafDuration) * (1 - yf);
    }
    if (calendarYear > qfafDuration) return 0;
  }
  return rateFn(calendarYear - 1) * (1 - yf) + rateFn(calendarYear) * yf;
}

/**
 * Resolve the full per-year deleverage schedule. Returns null when no plan
 * is active. The ST loss rate is calendar-year time-weighted exactly like
 * the standard path's `getCalendarYearStLossRate`, so January starts are
 * unchanged and partial-year starts straddle operating years the same way.
 */
export function resolveDeleverageSchedule(
  inputs: CalculatorInputs,
  settings: AdvancedSettings,
  maxYears: number,
  startMonth: number = inputs.startMonth ?? 1,
  qfafDuration: number = inputs.qfafEnabled !== false ? (inputs.qfafDuration ?? 10) : 0
): DeleverageYearSchedule[] | null {
  const plan = resolveDeleveragePlan(inputs);
  if (!plan) return null;
  return buildDeleverageSchedule(plan, settings, maxYears, startMonth, qfafDuration);
}

/**
 * Build the per-year glide schedule for an already-resolved plan. Split out
 * from `resolveDeleverageSchedule` (D-028) so the per-leg split path can
 * schedule each leg's own resolved plan directly, without round-tripping
 * through `inputs`.
 */
export function buildDeleverageSchedule(
  plan: ResolvedDeleveragePlan,
  settings: AdvancedSettings,
  maxYears: number,
  startMonth: number,
  qfafDuration: number
): DeleverageYearSchedule[] {
  const srcLt = plan.source.ltGainRate;
  const tgtLt = targetLtGainRate(plan);
  const sourceFinancing = getFinancingCostForRatios(
    plan.sourceLongLeverage,
    plan.sourceShortRatio,
    settings
  );
  const srcRateFn = (y: number) => getEffectiveStLossRate(plan.source.id, srcLt, y);
  const tgtRateFn = (y: number) => targetStLossRateForYear(plan, y);

  const schedule: DeleverageYearSchedule[] = [];
  let prevW = 1;
  for (let year = 1; year <= maxYears; year++) {
    const w = getExtensionWeight(plan, year);
    const calSrc = calendarRate(srcRateFn, year, startMonth, qfafDuration);
    const calTgt = calendarRate(tgtRateFn, year, startMonth, qfafDuration);
    // Glide-year leverage interpolates between source and target books, and
    // financing prices the interpolated ratios — not a blend of the two
    // endpoint costs (identical for linear fee models, but the ratio-based
    // core is the single source of truth).
    const longLev = w * plan.sourceLongLeverage + (1 - w) * plan.targetLongLeverage;
    const shortLev = w * plan.sourceShortRatio + (1 - w) * plan.targetShortRatio;
    const financingCost = getFinancingCostForRatios(longLev, shortLev, settings);
    schedule.push({
      year,
      w,
      fracUnwoundThisYear: Math.max(0, prevW - w),
      stLossRate: w * calSrc + (1 - w) * calTgt,
      ltGainRate: w * srcLt + (1 - w) * tgtLt,
      financingCost,
      financingSavedRate: Math.max(0, sourceFinancing - financingCost),
    });
    prevW = w;
  }
  return schedule;
}
