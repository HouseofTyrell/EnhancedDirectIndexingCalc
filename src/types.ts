export interface CalculatorInputs {
  // Client profile
  investmentAmount: number;
  filingStatus: 'single' | 'mfj' | 'mfs' | 'hoh';
  stateCode: string;
  stateRate: number;
  annualIncome: number;

  // Allocation
  ediAllocation: number;

  // Strategy assumptions
  qfafReturn: number;
  qfafStGainPct: number;
  ediReturn: number;
  ediHarvestingYear1: number;

  // Carryforwards
  existingStLossCarryforward: number;
  existingLtLossCarryforward: number;
}

export interface YearResult {
  year: number;

  // Portfolio values
  qfafValue: number;
  ediValue: number;
  totalValue: number;

  // Tax events
  stGainsGenerated: number;
  stLossesHarvested: number;
  ltGainsRealized: number;
  netStGainLoss: number;

  // Taxes
  federalTax: number;
  stateTax: number;
  totalTax: number;

  // Comparison
  baselineTax: number;
  taxSavings: number;

  // Carryforward balance
  stLossCarryforward: number;
  ltLossCarryforward: number;
}

export interface CalculationResult {
  years: YearResult[];
  summary: {
    totalTaxSavings: number;
    finalPortfolioValue: number;
    effectiveTaxAlpha: number;
  };
}
