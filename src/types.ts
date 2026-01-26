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

// ============================================
// ADVANCED MODE TYPES
// ============================================

// Year-by-Year Planning
export interface YearOverride {
  year: number;
  w2Income: number;      // Override annual income for this year
  cashInfusion: number;  // Additional capital added at year start
  note: string;          // User note (e.g., "Retirement", "Bonus")
}

export interface YearByYearInputs {
  enabled: boolean;
  overrides: YearOverride[];
}

// Sensitivity Analysis
export interface SensitivityParams {
  federalRateChange: number;      // -0.05 to +0.05 (percentage points)
  stateRateChange: number;        // -0.05 to +0.05
  annualReturn: number;           // -0.20 to +0.20 (replaces 7% default)
  trackingErrorMultiplier: number; // 0 to 2 (multiplier on variance)
  stLossRateVariance: number;     // -0.50 to +0.50 (percentage change)
  ltGainRateVariance: number;     // -0.50 to +0.50 (percentage change)
}

export const DEFAULT_SENSITIVITY: SensitivityParams = {
  federalRateChange: 0,
  stateRateChange: 0,
  annualReturn: 0.07,
  trackingErrorMultiplier: 1.0,
  stLossRateVariance: 0,
  ltGainRateVariance: 0,
};

// Strategy Comparison
export interface ComparisonResult {
  strategyId: string;
  strategyName: string;
  strategyType: 'core' | 'overlay';
  qfafRequired: number;
  totalExposure: number;
  year1TaxSavings: number;
  tenYearTaxSavings: number;
  taxAlpha: number;
  trackingError: string;
}

// Advanced Settings (Hardcoded Formula Constants)
export interface AdvancedSettings {
  // QFAF mechanics
  qfafMultiplier: number;           // Default: 1.50 (150% ST gains and ordinary losses)

  // Section 461(l) limits by filing status
  section461Limits: {
    mfj: number;                    // Default: 512000 (2024)
    single: number;                 // Default: 256000
    mfs: number;                    // Default: 256000
    hoh: number;                    // Default: 256000
  };

  // NOL rules
  nolOffsetLimit: number;           // Default: 0.80 (80% of taxable income)

  // Portfolio assumptions
  defaultAnnualReturn: number;      // Default: 0.07 (7%)
  projectionYears: number;          // Default: 10

  // Tax rate assumptions
  niitRate: number;                 // Default: 0.038 (3.8% Net Investment Income Tax)
  ltcgRate: number;                 // Default: 0.20 (20% LTCG rate)
  stcgRate: number;                 // Default: 0.37 (37% ordinary income rate)
}

export const DEFAULT_SETTINGS: AdvancedSettings = {
  qfafMultiplier: 1.50,
  section461Limits: {
    mfj: 512000,
    single: 256000,
    mfs: 256000,
    hoh: 256000,
  },
  nolOffsetLimit: 0.80,
  defaultAnnualReturn: 0.07,
  projectionYears: 10,
  niitRate: 0.038,
  ltcgRate: 0.20,
  stcgRate: 0.37,
};
