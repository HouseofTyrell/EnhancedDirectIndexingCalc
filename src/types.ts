// Filing Status type and constants
export const FILING_STATUSES = [
  { value: 'single', label: 'Single' },
  { value: 'mfj', label: 'Married Filing Jointly' },
  { value: 'mfs', label: 'Married Filing Separately' },
  { value: 'hoh', label: 'Head of Household' },
] as const;

export type FilingStatus = (typeof FILING_STATUSES)[number]['value'];

export interface CalculatorInputs {
  // Client profile
  filingStatus: FilingStatus;
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

  // Toggle QFAF on/off (for testing collateral-only scenarios)
  qfafEnabled: boolean;
}

export interface CalculatedSizing {
  strategyId: string;
  strategyName: string;
  strategyType: 'core' | 'overlay';
  collateralValue: number;
  qfafValue: number; // Auto-calculated
  qfafMaxValue: number; // Same as qfafValue (for display)
  totalExposure: number;
  qfafRatio: number; // qfafValue / collateralValue
  year1StLosses: number; // Collateral ST losses
  year1StGains: number; // QFAF ST gains (always equals year1StLosses)
  year1OrdinaryLosses: number; // QFAF ordinary losses
  year1UsableOrdinaryLoss: number; // Capped by 461(l)
  year1ExcessToNol: number; // Excess ordinary loss → NOL
  section461Limit: number;
}

export interface YearResult {
  year: number;

  // Portfolio values
  qfafValue: number;
  collateralValue: number;
  totalValue: number;

  // QFAF tax events
  stGainsGenerated: number; // 150% of QFAF MV
  ordinaryLossesGenerated: number; // 150% of QFAF MV
  usableOrdinaryLoss: number; // Capped by 461(l)
  excessToNol: number; // Ordinary losses above limit

  // Collateral tax events
  stLossesHarvested: number; // Strategy rate × collateral
  ltGainsRealized: number; // Strategy rate × collateral

  // Net positions
  netStGainLoss: number; // Should be ~0 with auto-sizing

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
  nolCarryforward: number; // Cumulative NOL
  nolUsedThisYear: number; // NOL applied this year
  capitalLossUsedAgainstIncome: number; // Up to $3,000 per §1211(b)

  // Effective rates (for debugging/display)
  effectiveStLossRate: number; // Actual ST loss rate used (may be custom)

  // Income offset tracking
  incomeOffsetAmount: number; // Total income offset: ordinary loss + NOL used + capital loss used
  maxIncomeOffsetCapacity: number; // Max income that could be offset (useful for option exercise planning)

  // Component-specific tax benefits (for view mode breakdown)
  qfafTaxBenefit: number; // Ordinary loss + NOL usage + ST→LT conversion benefit
  collateralTaxBenefit: number; // Capital loss benefit - LT gain cost - remaining ST cost
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
  w2Income: number; // Override annual income for this year
  cashInfusion: number; // Additional capital added at year start
  note: string; // User note (e.g., "Retirement", "Bonus")
}

// Liquidity Planning
export interface LiquidityParams {
  qfafLockupYears: number; // Number of years QFAF is locked (default: 3)
  qfafRedemptionPenalty: number; // Early redemption penalty (default: 0.05 = 5%)
  emergencyFundTarget: number; // Target emergency fund as months of income
}

export const DEFAULT_LIQUIDITY: LiquidityParams = {
  qfafLockupYears: 3,
  qfafRedemptionPenalty: 0.05,
  emergencyFundTarget: 6,
};

// Sensitivity Analysis
export interface SensitivityParams {
  federalRateChange: number; // -0.05 to +0.05 (percentage points)
  stateRateChange: number; // -0.05 to +0.05
  annualReturn: number; // -0.20 to +0.20 (replaces 7% default)
  trackingErrorMultiplier: number; // 0 to 2 (multiplier on variance)
  stLossRateVariance: number; // -0.50 to +0.50 (percentage change)
  ltGainRateVariance: number; // -0.50 to +0.50 (percentage change)
}

export const DEFAULT_SENSITIVITY: SensitivityParams = {
  federalRateChange: 0,
  stateRateChange: 0,
  annualReturn: 0.07,
  trackingErrorMultiplier: 1.0,
  stLossRateVariance: 0,
  ltGainRateVariance: 0,
};

// Scenario Analysis (Bull/Base/Bear)
export type ScenarioType = 'bull' | 'base' | 'bear';

export interface ScenarioParams {
  return: number;
  probability: number;
  label: string;
}

export const DEFAULT_SCENARIOS: Record<ScenarioType, ScenarioParams> = {
  bull: { return: 0.12, probability: 0.25, label: 'Bull Market' },
  base: { return: 0.07, probability: 0.5, label: 'Base Case' },
  bear: { return: 0.02, probability: 0.25, label: 'Bear Market' },
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
  trackingErrorDisplay: string;
}

// Advanced Settings (Hardcoded Formula Constants)
export interface AdvancedSettings {
  // QFAF mechanics
  qfafMultiplier: number; // Default: 1.50 (150% ST gains and ordinary losses)
  qfafGrowthEnabled: boolean; // Default: true (QFAF appreciates with market)

  // Tax-loss harvesting adjustments
  washSaleDisallowanceRate: number; // Default: 0 (can increase if wash sales expected)

  // Section 461(l) limits by filing status
  section461Limits: {
    mfj: number; // Default: 512000 (2026)
    single: number; // Default: 256000
    mfs: number; // Default: 256000
    hoh: number; // Default: 256000
  };

  // NOL rules
  nolOffsetLimit: number; // Default: 0.80 (80% of taxable income)

  // Portfolio assumptions
  defaultAnnualReturn: number; // Default: 0.07 (7%)
  projectionYears: number; // Default: 10

  // Tax rate assumptions
  niitRate: number; // Default: 0.038 (3.8% Net Investment Income Tax)
  ltcgRate: number; // Default: 0.20 (20% LTCG rate)
  stcgRate: number; // Default: 0.37 (37% ordinary income rate)
}

export const DEFAULT_SETTINGS: AdvancedSettings = {
  qfafMultiplier: 1.5,
  qfafGrowthEnabled: true,
  washSaleDisallowanceRate: 0,
  section461Limits: {
    mfj: 512000,
    single: 256000,
    mfs: 256000,
    hoh: 256000,
  },
  nolOffsetLimit: 0.8,
  defaultAnnualReturn: 0.07,
  projectionYears: 10,
  niitRate: 0.038,
  ltcgRate: 0.2,
  stcgRate: 0.37,
};

// ============================================
// QFAF TEST (BY YEAR) TYPES
// ============================================

// Editable input fields for a single year
export interface QfafTestYearInput {
  readonly year: number;
  cashInfusion: number; // New capital invested this year
  subscriptionPct: number; // % of infusion allocated to QFAF (0-1)
  lossRate: number; // Expected ordinary loss rate (default 1.5 = 150%)
  marginalTaxRate: number; // Combined federal + state marginal rate (0-1)
  managementFeeRate: number; // Annual management fee (default 0.01 = 1%)
  qfafFeeRate: number; // QFAF fee rate (default 0.015 = 1.5%)
  section461Limit: number; // §461(l) limit for this year
}

// Computed result fields extending input (readonly to prevent mutation)
export interface QfafTestYearResult extends QfafTestYearInput {
  readonly subscriptionSize: number; // cashInfusion × subscriptionPct
  readonly estimatedOrdinaryLoss: number; // subscriptionSize × lossRate
  readonly carryForwardPrior: number; // Carryforward from previous year
  readonly lossAvailable: number; // estimatedOrdinaryLoss + carryForwardPrior
  readonly allowedLoss: number; // min(lossAvailable, section461Limit)
  readonly carryForwardNext: number; // lossAvailable - allowedLoss
  readonly taxSavings: number; // allowedLoss × marginalTaxRate
  readonly managementFee: number; // subscriptionSize × managementFeeRate
  readonly qfafFee: number; // subscriptionSize × qfafFeeRate
  readonly totalFees: number; // managementFee + qfafFee
  readonly netSavingsNoAlpha: number; // taxSavings - totalFees
}

// Default values for QFAF Test inputs
export const DEFAULT_QFAF_TEST_YEAR: Omit<QfafTestYearInput, 'year'> = {
  cashInfusion: 0,
  subscriptionPct: 1.0, // 100% to QFAF by default
  lossRate: 1.5, // 150% ordinary loss generation
  marginalTaxRate: 0.45, // ~45% combined federal + state
  managementFeeRate: 0.01, // 1% management fee
  qfafFeeRate: 0.015, // 1.5% QFAF fee
  section461Limit: 640000, // 2026 projected MFJ limit
};

// Section 461(l) limits by filing status for 2026 (projected)
export const SECTION_461_LIMITS_2026: Record<FilingStatus, number> = {
  single: 320000,
  mfj: 640000,
  mfs: 320000,
  hoh: 320000,
};

// Summary totals for the QFAF Test table
export interface QfafTestSummary {
  readonly totalCashInfusion: number;
  readonly totalSubscriptionSize: number;
  readonly totalEstimatedOrdinaryLoss: number;
  readonly totalAllowedLoss: number;
  readonly totalTaxSavings: number;
  readonly totalFees: number;
  readonly totalNetSavingsNoAlpha: number;
  readonly finalCarryForward: number;
}
