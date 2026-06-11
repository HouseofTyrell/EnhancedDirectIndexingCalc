import { Strategy } from '../strategyData';

// Type for strategy rates needed in calculations
export type StrategyRates = Pick<Strategy, 'stLossRate' | 'ltGainRate'>;

// Pre-calculated tax rates passed through the calculation chain
export interface TaxRates {
  /** Marginal federal rate on ST gains (includes NIIT when applicable) */
  stRate: number;
  /** Marginal federal rate on LT gains (includes NIIT when applicable) */
  ltRate: number;
  /**
   * Marginal federal rate on ordinary income WITHOUT NIIT. Used to value
   * deductions against ordinary income (ordinary losses, NOL usage, the
   * $3K capital loss deduction): these don't reduce net investment income,
   * so the 3.8% NIIT doesn't apply to them (IRC §1411).
   */
  ordinaryRate: number;
  stateRate: number;
  section461Limit: number;
}
