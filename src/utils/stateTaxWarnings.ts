import { YearResult } from '../types';

/**
 * Per-state modeled-treatment notes (D-005 phase 2).
 *
 * The engine now applies character-specific state treatment for PA, NJ, MA,
 * and WA (see `getStateTaxProfile` in taxData.ts). These notes tell the user
 * what the engine is doing for their state so the numbers aren't a surprise.
 */
export function getQuantifiedStateWarning(
  stateCode: string,
  _stateRate: number,
  _years: YearResult[]
): string | undefined {
  switch (stateCode) {
    case 'PA':
      return (
        `Modeled per Pennsylvania law: no PA state-level benefit is included for ordinary ` +
        `deductions or NOL usage (PA's class-based income system does not allow these losses ` +
        `to offset wages, and individuals get no loss carryforwards). PA's 3.07% flat rate ` +
        `still applies to gains. Federal treatment is unchanged.`
      );
    case 'NJ':
      return (
        `Modeled per New Jersey law: no NJ state-level benefit is included for ordinary ` +
        `deductions or NOL usage (NJ does not allow losses in one category to offset wages ` +
        `and provides no individual loss carryforwards). NJ's 10.75% top rate still applies ` +
        `to gains. Federal treatment is unchanged.`
      );
    case 'MA':
      return (
        `Modeled per Massachusetts law: short-term gains taxed at 12.5% (8.5% + 4% surtax) ` +
        `and wages/long-term gains at 9% (5% + 4% surtax), assuming top-bracket income over ` +
        `$1M. Massachusetts carryforward nuances are not modeled.`
      );
    case 'WA':
      return (
        `Modeled per Washington law: no tax on wages or short-term gains; a 7% excise applies ` +
        `to long-term gains above the annual exemption ($278K, the published 2025 figure — ` +
        `2026 pending), plus the ESSB 5813 surcharge of 2.9% on taxed gains above $1M ` +
        `(9.9% top). Applied to annual LT gains and the liquidation analysis.`
      );
    case 'CA':
      return (
        `Modeled per California law: gains and wages at 13.3%; SB 167 suspends CA NOL ` +
        `deductions for MAGI ≥ $1M through tax year 2026, so the state portion of NOL ` +
        `benefits is excluded in year 1.`
      );
    case 'NY':
      return (
        `Modeled per New York law: gains and wages at the 10.9% top rate with the §461(l) ` +
        `limitation applied (NY retained it through the CARES suspension). For NYC residents, ` +
        `enable the "NYC resident" option to add the ~3.876% city tax to all income characters.`
      );
    default:
      return undefined;
  }
}
