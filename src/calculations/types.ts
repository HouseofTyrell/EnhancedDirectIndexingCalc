import { Strategy } from '../strategyData';

// Type for strategy rates needed in calculations
export type StrategyRates = Pick<Strategy, 'stLossRate' | 'ltGainRate' | 'financingCostRate'>;

// Pre-calculated tax rates passed through the calculation chain
export interface TaxRates {
  stRate: number;
  ltRate: number;
  stateRate: number;
  section461Limit: number;
}
