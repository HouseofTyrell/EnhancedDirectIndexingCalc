export interface CalculatorInputs {
  // Client profile
  filingStatus: 'single' | 'mfj' | 'mfs' | 'hoh';
  stateCode: string;
  stateRate: number;
  annualIncome: number;

  // Strategy selection (replaces collateralType + leverageRatio)
  strategyId: string;
  collateralAmount: number;

  // Existing carryforwards
  existingStLossCarryforward: number;
  existingLtLossCarryforward: number;
  existingNolCarryforward: number;

  // Advanced: QFAF override (optional)
  qfafOverride?: number;
}

export interface CalculatedSizing {
  strategyId: string;
  strategyName: string;
  strategyType: 'core' | 'overlay';
  collateralValue: number;
  qfafValue: number;              // Auto-calculated
  qfafMaxValue: number;           // Same as qfafValue (for display)
  totalExposure: number;
  qfafRatio: number;              // qfafValue / collateralValue
  year1StLosses: number;          // Collateral ST losses
  year1StGains: number;           // QFAF ST gains (always equals year1StLosses)
  year1OrdinaryLosses: number;    // QFAF ordinary losses
  year1UsableOrdinaryLoss: number; // Capped by 461(l)
  year1ExcessToNol: number;       // Excess ordinary loss → NOL
  section461Limit: number;
}

export interface YearResult {
  year: number;

  // Portfolio values
  qfafValue: number;
  collateralValue: number;
  totalValue: number;

  // QFAF tax events
  stGainsGenerated: number;        // 150% of QFAF MV
  ordinaryLossesGenerated: number; // 150% of QFAF MV
  usableOrdinaryLoss: number;      // Capped by 461(l)
  excessToNol: number;             // Ordinary losses above limit

  // Collateral tax events
  stLossesHarvested: number;       // Strategy rate × collateral
  ltGainsRealized: number;         // Strategy rate × collateral

  // Net positions
  netStGainLoss: number;           // Should be ~0 with auto-sizing

  // Taxes
  federalTax: number;
  stateTax: number;
  totalTax: number;

  // Comparison
  baselineTax: number;
  taxSavings: number;

  // Carryforwards
  stLossCarryforward: number;
  ltLossCarryforward: number;
  nolCarryforward: number;         // Cumulative NOL
  nolUsedThisYear: number;         // NOL applied this year
}

export interface CalculationResult {
  sizing: CalculatedSizing;
  years: YearResult[];
  summary: {
    totalTaxSavings: number;
    finalPortfolioValue: number;
    effectiveTaxAlpha: number;
    totalNolGenerated: number;
  };
}
