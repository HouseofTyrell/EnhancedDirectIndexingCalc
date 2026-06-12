import { YearResult } from '../types';

export type BreakdownGranularity = 'monthly' | 'quarterly';

/**
 * One contiguous run of months within a sub-period that share the same
 * deployment year. A quarterly sub-period may split into two segments when
 * the start month is not 1/4/7/10 (e.g., for startMonth=5, Q2 of any
 * calendar year straddles two deployment years).
 */
export interface DeploymentSegment {
  deploymentYear: number;
  /** First and last month-within-deployment-year covered (inclusive, 1–12). */
  monthsInDY: [number, number];
  /** Number of calendar months in the sub-period covered by this segment. */
  monthsInPeriod: number;
}

export interface LossSubPeriod {
  /** Display label, e.g. "Jan" or "Q1". */
  label: string;
  /** Inclusive calendar-month range, 1–12. */
  monthRange: [number, number];
  /** True if the strategy was active in any month of this sub-period. */
  active: boolean;
  /** Deployment-year breakdown of the months in this sub-period. */
  segments: DeploymentSegment[];
  /** Sub-period's share of the year's ST losses harvested (after wash sale). */
  stLosses: number;
  /** Sub-period's share of the year's QFAF ordinary losses generated. */
  ordinaryLosses: number;
}

const MONTH_ABBRS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

interface MonthInfo {
  /** Calendar month, 1–12. */
  cm: number;
  active: boolean;
  /** Deployment year (1-indexed) when active, else null. */
  dy: number | null;
  /** Month within the deployment year (1–12) when active. */
  dyMonth: number | null;
}

function computeMonthInfo(
  yearIndex: number,
  startMonth: number,
  qfafDuration: number
): MonthInfo[] {
  const months: MonthInfo[] = [];
  for (let cm = 1; cm <= 12; cm++) {
    // Deployment month index: month #1 lands at calendar month `startMonth`
    // of calendar year 1. Negative or zero means the strategy hasn't started.
    const dm = (yearIndex - 1) * 12 + cm - startMonth + 1;
    const past = qfafDuration > 0 && dm > qfafDuration * 12;
    if (dm < 1 || past) {
      months.push({ cm, active: false, dy: null, dyMonth: null });
    } else {
      const dy = Math.floor((dm - 1) / 12) + 1;
      const dyMonth = ((dm - 1) % 12) + 1;
      months.push({ cm, active: true, dy, dyMonth });
    }
  }
  return months;
}

function groupSegments(months: MonthInfo[]): DeploymentSegment[] {
  const segments: DeploymentSegment[] = [];
  for (const m of months) {
    if (!m.active) continue;
    const last = segments[segments.length - 1];
    // Extend the prior segment if same DY and contiguous within the DY.
    if (last && last.deploymentYear === m.dy && last.monthsInDY[1] === (m.dyMonth as number) - 1) {
      last.monthsInDY = [last.monthsInDY[0], m.dyMonth as number];
      last.monthsInPeriod += 1;
    } else {
      segments.push({
        deploymentYear: m.dy as number,
        monthsInDY: [m.dyMonth as number, m.dyMonth as number],
        monthsInPeriod: 1,
      });
    }
  }
  return segments;
}

export interface BuildLossBreakdownArgs {
  year: YearResult;
  /** 1-indexed calendar year. */
  yearIndex: number;
  startMonth: number;
  qfafDuration: number;
  granularity: BreakdownGranularity;
  /**
   * Optional per-deployment-year ST loss rate lookup. When supplied, the
   * year's ST losses are split across months proportional to each month's
   * deployment-year rate — this surfaces the OY1 vs OY2 difference that
   * the calendar-year-blended rate hides. When omitted (e.g. split
   * allocation), losses are spread uniformly across active months.
   */
  rateForDeploymentYear?: (dy: number) => number;
}

export function buildLossBreakdown(args: BuildLossBreakdownArgs): LossSubPeriod[] {
  const { year, yearIndex, startMonth, qfafDuration, granularity, rateForDeploymentYear } = args;

  const monthInfo = computeMonthInfo(yearIndex, startMonth, qfafDuration);

  // Weight each month for splitting the annual ST loss total. When we know
  // the per-DY rate, weight by rate (so a month in DY1 with high decay gets
  // more of the year's loss than a month in DY2). Otherwise uniform.
  const stWeights: number[] = monthInfo.map(m => {
    if (!m.active) return 0;
    if (rateForDeploymentYear) return rateForDeploymentYear(m.dy as number);
    return 1;
  });
  // QFAF ordinary losses have a flat rate, so always uniform across
  // active months.
  const ordWeights: number[] = monthInfo.map(m => (m.active ? 1 : 0));

  const stWeightSum = stWeights.reduce((s, w) => s + w, 0);
  const ordWeightSum = ordWeights.reduce((s, w) => s + w, 0);
  const stPerWeight = stWeightSum > 0 ? year.stLossesHarvested / stWeightSum : 0;
  const ordPerWeight = ordWeightSum > 0 ? year.ordinaryLossesGenerated / ordWeightSum : 0;

  const monthStLoss = stWeights.map(w => w * stPerWeight);
  const monthOrdLoss = ordWeights.map(w => w * ordPerWeight);

  const periodSize = granularity === 'monthly' ? 1 : 3;
  const periods: LossSubPeriod[] = [];
  for (let start = 0; start < 12; start += periodSize) {
    const end = start + periodSize;
    const slice = monthInfo.slice(start, end);
    const segments = groupSegments(slice);
    const active = slice.some(m => m.active);
    const stLosses = monthStLoss.slice(start, end).reduce((s, v) => s + v, 0);
    const ordinaryLosses = monthOrdLoss.slice(start, end).reduce((s, v) => s + v, 0);
    const label = granularity === 'monthly' ? MONTH_ABBRS[start] : `Q${Math.floor(start / 3) + 1}`;
    periods.push({
      label,
      monthRange: [start + 1, end],
      active,
      segments,
      stLosses,
      ordinaryLosses,
    });
  }
  return periods;
}

/**
 * Render a segment list as a compact human-readable string for display.
 * Examples:
 *   "—"                            (inactive)
 *   "D-Y1 mo 7–9"                  (single segment, multi-month)
 *   "D-Y1 mo 12"                   (single segment, single month)
 *   "D-Y1 mo 12 + D-Y2 mo 1–2"     (quarter straddling two DYs)
 */
export function describeSegments(segments: DeploymentSegment[]): string {
  if (segments.length === 0) return '—';
  return segments
    .map(s => {
      const [a, b] = s.monthsInDY;
      const range = a === b ? `${a}` : `${a}–${b}`;
      return `D-Y${s.deploymentYear} mo ${range}`;
    })
    .join(' + ');
}
