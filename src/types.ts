// Filing Status type and constants
export const FILING_STATUSES = [
  { value: 'single', label: 'Single' },
  { value: 'mfj', label: 'Married Filing Jointly' },
  { value: 'mfs', label: 'Married Filing Separately' },
  { value: 'hoh', label: 'Head of Household' },
] as const;

export type FilingStatus = (typeof FILING_STATUSES)[number]['value'];

// Split allocation: allow a single analysis to fund collateral with both
// cash (Core) and appreciated stock (Overlay). When `enabled` is true the
// calculation engine ignores the top-level `strategyId` / `collateralAmount`
// and uses the per-leg amounts below.
export interface SplitAllocation {
  enabled: boolean;
  coreStrategyId: string;
  coreAmount: number;
  overlayStrategyId: string;
  overlayAmount: number;
}

// Deleveraging plan (D-016/D-017): unwind the extension strategy to a
// lower-leverage target, all at once (durationYears = 1) or linearly over a
// glide path. The engine derives a per-year schedule that blends harvest/LT
// rates and financing source→target and realizes pro-rata unwind gains as
// endogenous strategy costs (charged against taxSavings, unlike D-012 gain
// events). NAV is unchanged by deleveraging: gross exposure falls, the net
// collateral stays invested.
export interface DeleveragePlan {
  enabled: boolean;
  /** First year any unwind happens (>= 1) */
  startYear: number;
  /** Years to glide from full extension to target; 1 = all-at-once (default) */
  durationYears: number;
  /** 'long-only' (traditional DI) or the strategyId of a lower-leverage strategy */
  target: 'long-only' | string;
  // D-017 defensible-default knobs, all optional/overridable:
  /** Character of unwound long-extension gains. Default: 'lt' once seasoned (startYear > 2), 'st' before. */
  unwindGainCharacter?: 'lt' | 'st';
  /** Lot-selection discount on pro-rata embedded gain (1.0 = pro-rata, <1 = HIFO discount). Default 1.0. */
  lotSelectionHaircut?: number;
  /** Fraction of covered short notional realized as ST gain. Default 0 (shorts continuously loss-recycled) — disclosed on screen. */
  shortCoverGainPct?: number;
}

export interface CalculatorInputs {
  // Client profile
  filingStatus: FilingStatus;
  stateCode: string;
  stateRate: number;
  annualIncome: number;

  // Strategy selection (replaces collateralType + leverageRatio)
  strategyId: string;
  collateralAmount: number;

  // Optional: split collateral between a Core (cash) leg and an Overlay
  // (appreciated stock) leg. When enabled, overrides strategyId/collateralAmount.
  splitAllocation?: SplitAllocation;

  // Existing carryforwards
  existingStLossCarryforward: number;
  existingLtLossCarryforward: number;
  existingNolCarryforward: number;

  // Advanced: QFAF override (optional)
  qfafOverride?: number;

  // Toggle QFAF on/off (for testing collateral-only scenarios)
  qfafEnabled: boolean;

  // QFAF sizing window: number of years to average collateral losses for sizing
  // 1 = Year 1 only (legacy), 10 = average across all projection years (default)
  qfafSizingYears: number;

  // QFAF sizing cushion: reduces auto-sized QFAF by this percentage (0–0.10 = 0–10%)
  qfafSizingCushion: number;

  // QFAF duration: years QFAF runs before breakeven unwind (1–10, default 5)
  qfafDuration: number;

  // QFAF sizing mode: 'fixed' = sized once at inception, 'dynamic' = resized each year to match EDI losses
  qfafSizingMode: 'fixed' | 'dynamic';

  // Partial year start: month the strategy begins (1=January=full year, 4=April=9 months)
  startMonth: number;

  // Toggle LT gains on/off (when off, no LT gains are realized each year).
  // Optional: all consumers treat undefined as enabled (`!== false`).
  ltGainsEnabled?: boolean;

  // Redeploy QFAF redemptions (dynamic-resize distributions + terminal
  // unwind proceeds) into the core/collateral at the start of the following
  // year, instead of holding them as uninvested cash. Default: false.
  redeployQfafProceeds?: boolean;

  // Cost basis of the collateral at inception (optional). When set below the
  // collateral amount — the concentrated-appreciated-stock case — the
  // pre-existing embedded gain flows into the liquidation/exit-tax analysis.
  // Default: undefined = basis equals initial market value.
  collateralCostBasis?: number;

  // NYC resident (only meaningful when stateCode === 'NY'): adds the ~3.876%
  // NYC resident income tax on top of the NY state rate. Default: false.
  nycResident?: boolean;

  // Deleveraging plan (D-016/D-017). Workspace-only v1; ignored when
  // splitAllocation is enabled (UI shows a warning) and in sensitivity grids
  // (D-013 precedent — cells must stay comparable).
  deleveragePlan?: DeleveragePlan;
}

export interface SizingLeg {
  strategyId: string;
  strategyName: string;
  strategyType: 'core' | 'overlay';
  collateralValue: number;
  avgStLossRate: number;
  year1StLosses: number;
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
  // Sizing metadata
  avgStLossRate: number; // Average ST loss rate used for sizing
  sizingYears: number; // Number of years averaged
  // When split allocation is active, per-leg breakdown. Leg 0 is Core, Leg 1 is Overlay.
  splitLegs?: SizingLeg[];
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
  // Minimum W-2/ordinary income this year that fully absorbs the §461(l)
  // deduction AND lets the 80% limit consume the entire start-of-year NOL
  // balance (planning target for bonuses/option exercises)
  incomeRequiredForFullUtilization: number;

  // Tax benefit breakdown (gross benefits and costs)
  ordinaryLossBenefit: number; // usableOrdinaryLoss × combined ST rate
  nolUsageBenefit: number; // nolUsed × combined ST rate
  stToLtConversionBenefit: number; // min(ST gains, ST losses) × (ST rate - LT rate)
  capitalLossBenefit: number; // capitalLossUsedAgainstIncome × combined ST rate
  ltGainCost: number; // ltGainsRealized × combined LT rate
  remainingStGainCost: number; // max(0, netStGainLoss) × combined ST rate

  // Component-specific tax benefits (for view mode breakdown)
  qfafTaxBenefit: number; // Ordinary loss + NOL usage + ST→LT conversion benefit
  collateralTaxBenefit: number; // Capital loss benefit - LT gain cost - remaining ST cost

  // ST gain leakage: excess QFAF ST gains not offset by collateral ST losses (QFAF oversized)
  stGainLeakage: number;
  // Planned gain event (D-012): amount, tax after shelter, and the
  // counterfactual tax without the program's carryforwards
  gainEventAmount: number;
  gainEventTax: number;
  gainEventTaxWithoutStrategy: number;
  gainEventCfShelter: number; // event dollars absorbed by CFs/current losses
  // Cash returned from QFAF resizing (dynamic mode only, 0 in fixed mode)
  qfafCashReturned: number;
  // Financing fees charged this year (QFAF + collateral, on end-of-year
  // grown values). 0 when financing fees are disabled.
  financingCostPaid: number;
  // Whether the strategy is actively generating new tax events this year
  strategyActive: boolean;

  // Deleveraging (D-016/D-017). All 0 (extensionFraction 1) when no plan is active.
  /** End-of-year extension weight: 1 = fully levered, 0 = fully delevered to target */
  extensionFraction: number;
  /** Gains realized this year by unwinding the extension (long side + short cover) */
  deleverageGainRealized: number;
  /** ST-character portion of the unwind gain (incl. any short-cover gain) */
  deleverageGainSt: number;
  /** LT-character portion of the unwind gain */
  deleverageGainLt: number;
  /** Incremental tax attributable to the unwind gains after netting/CF shelter, at this year's rates */
  deleverageTax: number;
  /** (source financing rate − blended rate) × start-of-year collateral; 0 when fees disabled */
  financingSaved: number;
}

export interface CalculationResult {
  sizing: CalculatedSizing;
  years: YearResult[];
  summary: {
    totalTaxSavings: number;
    finalPortfolioValue: number;
    effectiveTaxAlpha: number;
    totalNolGenerated: number;
    /** Cumulative cash returned by QFAF resizing + terminal unwind (held outside the portfolio) */
    totalQfafCashReturned: number;
    /** finalPortfolioValue + totalQfafCashReturned: total wealth including returned cash */
    finalTotalWealth: number;
    /** Σ taxSavings_n / (1 + discountRate)^n — present value of the nominal savings (D-006) */
    totalTaxSavingsPV: number;
    /** ST capital loss carryforward balance at the end of the last projected year */
    finalStCarryforward: number;
    /** LT capital loss carryforward balance at the end of the last projected year */
    finalLtCarryforward: number;
    /**
     * Contingent tax value of the final carryforward balances at the
     * final year's statutory rates: ST CF × combined ST rate + LT CF ×
     * combined LT rate (D-015 "loss reserve built"). CF shelter offsets
     * future capital GAINS, so it is valued at the state's gains rates even
     * where the state disallows ordinary-income offsets (PA/NJ). Contingent
     * on future gains being realized — NOT included in totalTaxSavings.
     */
    lossReserveShelterValue: number;
  };
}

// ============================================
// ADVANCED MODE TYPES
// ============================================

// Year-by-Year Planning
export type CashInfusionTaxType = 'gross' | 'net';

export interface YearOverride {
  year: number;
  w2Income: number; // Override annual income for this year
  cashInfusion: number; // Additional capital added at year start
  cashInfusionTaxType: CashInfusionTaxType; // 'gross' = pre-tax, 'net' = after-tax (default: 'gross')
  note: string; // User note (e.g., "Retirement", "Bonus")
  // Planned capital-gain event this year (business sale, IPO lockup, RSU
  // sale): flows through the real netting — carryforwards shelter it
  // (event-last), it absorbs the §461(l) deduction and widens the NOL base.
  gainEvent?: { amount: number; character: 'st' | 'lt' };
}

// Sensitivity Analysis
export interface SensitivityParams {
  federalRateChange: number; // -0.05 to +0.05 (percentage points)
  stateRateChange: number; // -0.05 to +0.05
  annualReturn: number; // -0.20 to +0.20 (replaces 0% default)
  trackingErrorMultiplier: number; // 0 to 2 (multiplier on variance)
  stLossRateVariance: number; // -0.50 to +0.50 (percentage change)
  ltGainRateVariance: number; // -0.50 to +0.50 (percentage change)
}

export const DEFAULT_SENSITIVITY: SensitivityParams = {
  federalRateChange: 0,
  stateRateChange: 0,
  annualReturn: 0,
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

  // Present-value display (D-006): show discounted total savings alongside nominal
  presentValueEnabled: boolean; // Default: false (opt-in complexity)
  discountRate: number; // Default: 0.05 (5%/yr, used when presentValueEnabled)

  // Portfolio assumptions
  growthEnabled: boolean; // Default: false (no growth assumption)
  defaultAnnualReturn: number; // Default: 0.07 (7% when growth enabled)
  qfafAnnualReturn: number | null; // Default: null (uses defaultAnnualReturn), allows separate QFAF growth rate
  financingFeesEnabled: boolean; // Default: false (subtract financing costs from growth)
  financingMode: 'simple' | 'detailed'; // Default: 'simple'

  // Simple financing mode (two components: wealth mgmt fee + manager fees)
  simpleWealthMgmtFee: number; // Default: 0.0055 (55 bps)
  simpleManagerFeeBase: number; // Default: 0.009 (90 bps, multiplied by leverage %)
  simpleManagerFeeFixed: number; // Default: 0.00142 (14.2 bps, added on top)

  // Detailed financing mode (component rates)
  brokerMarginRate: number; // Default: 0.0425 (4.25% charged on margin debit)
  shortBorrowRate: number; // Default: 0.005 (0.5% stock borrow fees)
  shortDividendRate: number; // Default: 0.015 (1.5% dividend payments on shorts)
  wealthManagementFeeRate: number; // Default: 0.0075 (0.75% = 75 bps)

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
  presentValueEnabled: false,
  discountRate: 0.05,
  growthEnabled: false,
  defaultAnnualReturn: 0.07,
  qfafAnnualReturn: null, // null means use defaultAnnualReturn
  financingFeesEnabled: false,
  financingMode: 'simple',

  // Simple mode defaults (two components)
  simpleWealthMgmtFee: 0.0055, // 55 bps
  simpleManagerFeeBase: 0.009, // 90 bps (multiplied by leverage %)
  simpleManagerFeeFixed: 0.00142, // 14.2 bps (added on top)

  // Detailed mode defaults
  brokerMarginRate: 0.0425, // 4.25%
  shortBorrowRate: 0.005, // 0.5%
  shortDividendRate: 0.015, // 1.5%
  wealthManagementFeeRate: 0.0075, // 0.75%

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
  section461Limit: 512000, // 2026 MFJ limit per Rev. Proc. 2025-32
};

// ============================================
// PINNED SCENARIO COMPARISON TYPES
// ============================================

export interface PinnedScenario {
  id: string;
  label: string; // Auto-generated: "CA $3.0M / Overlay 45/45"
  pinnedAt: number;
  inputs: CalculatorInputs;
  advancedSettings: AdvancedSettings;
  results: CalculationResult;
}

export interface ComparisonMetric {
  label: string;
  pinnedValue: number;
  currentValue: number;
  delta: number;
  deltaPercent: number;
  format: 'currency' | 'percent';
  higherIsBetter: boolean;
}

export interface InputChange {
  label: string;
  pinnedDisplay: string;
  currentDisplay: string;
}

// Section 461(l) limits by filing status for 2026
// OBBBA reset base to $250K/$500K with inflation indexing from 2024 base year
// Matches SECTION_461L_LIMITS in strategyData.ts (per Rev. Proc. 2025-32)
export const SECTION_461_LIMITS_2026: Record<FilingStatus, number> = {
  single: 256000,
  mfj: 512000,
  mfs: 256000,
  hoh: 256000,
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
