import { YearResult } from '../types';
import { formatCurrency } from './formatters';

/**
 * Quantified state-math warnings (D-005, phase 1).
 *
 * The engine applies one flat state rate to every benefit and cost, assuming
 * full federal conformity. For a handful of states that assumption is
 * materially wrong. Until per-state engine adjustments land (D-005 phase 2),
 * these warnings tell the user *which direction* and *roughly how much* the
 * state-level numbers are off, computed from the actual projection.
 */

/** WA long-term capital gains excise: 7% above the annual standard deduction. */
const WA_LTCG_EXCISE_RATE = 0.07;
const WA_LTCG_EXEMPTION = 270000; // ~2024-26 standard deduction, inflation adjusted

export function getQuantifiedStateWarning(
  stateCode: string,
  stateRate: number,
  years: YearResult[]
): string | undefined {
  // State-rate benefit modeled on deductions against ordinary income
  // (ordinary losses, NOL usage, $3K capital loss deduction).
  const stateOrdinaryBenefit =
    years.reduce(
      (s, y) => s + y.usableOrdinaryLoss + y.nolUsedThisYear + y.capitalLossUsedAgainstIncome,
      0
    ) * stateRate;

  switch (stateCode) {
    case 'PA':
      return (
        `Pennsylvania's class-based income tax does not allow business/investment losses to ` +
        `offset wages, and individuals get no loss or NOL carryforwards. Approximately ` +
        `${formatCurrency(stateOrdinaryBenefit)} of the projected savings is Pennsylvania ` +
        `state-level benefit (3.07% on ordinary deductions) that is unlikely to be available. ` +
        `Treat the state portion of these projections as federal-only.`
      );
    case 'NJ':
      return (
        `New Jersey does not allow losses in one income category to offset wages and provides ` +
        `no NOL or capital loss carryforwards for individuals. Approximately ` +
        `${formatCurrency(stateOrdinaryBenefit)} of the projected savings is New Jersey ` +
        `state-level benefit that is unlikely to be available. Treat the state portion of ` +
        `these projections as federal-only.`
      );
    case 'MA':
      return (
        `Massachusetts taxes short-term gains at 8.5% and long-term gains at 5% (each plus ` +
        `the 4% surtax on income over $1M). The single state rate used here approximates wage ` +
        `and LT treatment but misstates the value of ST losses and the cost of ST gains at ` +
        `the state level. Consult a Massachusetts tax advisor for precise figures.`
      );
    case 'WA': {
      const excise = years.reduce(
        (s, y) => s + Math.max(0, y.ltGainsRealized - WA_LTCG_EXEMPTION) * WA_LTCG_EXCISE_RATE,
        0
      );
      return (
        `Washington has no income tax but levies a 7% excise on long-term capital gains above ` +
        `~${formatCurrency(WA_LTCG_EXEMPTION)} per year, which is not modeled` +
        (excise > 0
          ? ` (approximately ${formatCurrency(excise)} over this projection)`
          : '') +
        `. A full liquidation of embedded gains would also likely trigger this excise. ` +
        `Harvested losses can offset WA gains realized in the same year.`
      );
    }
    default:
      return undefined;
  }
}
