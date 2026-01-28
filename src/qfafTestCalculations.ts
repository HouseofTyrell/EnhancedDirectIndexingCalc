import {
  QfafTestYearInput,
  QfafTestYearResult,
  QfafTestSummary,
  DEFAULT_QFAF_TEST_YEAR,
  SECTION_461_LIMITS_2026,
  FilingStatus,
} from './types';

/**
 * Compute a single year's QFAF Test results.
 * Pure function - no side effects.
 */
export function computeQfafTestYear(
  input: QfafTestYearInput,
  carryForwardPrior: number = 0
): QfafTestYearResult {
  const subscriptionSize = input.cashInfusion * input.subscriptionPct;
  const estimatedOrdinaryLoss = subscriptionSize * input.lossRate;
  const lossAvailable = estimatedOrdinaryLoss + carryForwardPrior;
  const allowedLoss = Math.min(lossAvailable, input.section461Limit);
  const carryForwardNext = lossAvailable - allowedLoss;
  const taxSavings = allowedLoss * input.marginalTaxRate;
  const managementFee = subscriptionSize * input.managementFeeRate;
  const qfafFee = subscriptionSize * input.qfafFeeRate;
  const totalFees = managementFee + qfafFee;
  const netSavingsNoAlpha = taxSavings - totalFees;

  return {
    ...input,
    subscriptionSize,
    estimatedOrdinaryLoss,
    carryForwardPrior,
    lossAvailable,
    allowedLoss,
    carryForwardNext,
    taxSavings,
    managementFee,
    qfafFee,
    totalFees,
    netSavingsNoAlpha,
  };
}

/**
 * Compute all years with rolling carryforward.
 * Pure function - no side effects.
 */
export function computeQfafTestYears(
  inputs: QfafTestYearInput[],
  initialCarryForward: number = 0
): QfafTestYearResult[] {
  const results: QfafTestYearResult[] = [];
  let carryForward = initialCarryForward;

  for (const input of inputs) {
    const result = computeQfafTestYear(input, carryForward);
    results.push(result);
    carryForward = result.carryForwardNext;
  }

  return results;
}

/**
 * Compute summary totals from year results.
 * Pure function - no side effects.
 */
export function computeQfafTestSummary(results: QfafTestYearResult[]): QfafTestSummary {
  return {
    totalCashInfusion: results.reduce((sum, r) => sum + r.cashInfusion, 0),
    totalSubscriptionSize: results.reduce((sum, r) => sum + r.subscriptionSize, 0),
    totalEstimatedOrdinaryLoss: results.reduce((sum, r) => sum + r.estimatedOrdinaryLoss, 0),
    totalAllowedLoss: results.reduce((sum, r) => sum + r.allowedLoss, 0),
    totalTaxSavings: results.reduce((sum, r) => sum + r.taxSavings, 0),
    totalFees: results.reduce((sum, r) => sum + r.totalFees, 0),
    totalNetSavingsNoAlpha: results.reduce((sum, r) => sum + r.netSavingsNoAlpha, 0),
    finalCarryForward: results.length > 0 ? results[results.length - 1].carryForwardNext : 0,
  };
}

/**
 * Create default inputs for a given number of years.
 * Pure function - no side effects.
 */
export function createDefaultQfafTestInputs(
  numYears: number,
  filingStatus: FilingStatus = 'mfj',
  startYear: number = 1
): QfafTestYearInput[] {
  const section461Limit = SECTION_461_LIMITS_2026[filingStatus];

  return Array.from({ length: numYears }, (_, i) => ({
    year: startYear + i,
    ...DEFAULT_QFAF_TEST_YEAR,
    section461Limit,
  }));
}

/**
 * Update a single field in a year's input.
 * Type-safe with whitelist of allowed fields.
 * Pure function - returns new array.
 */
const EDITABLE_FIELDS = [
  'cashInfusion',
  'subscriptionPct',
  'lossRate',
  'marginalTaxRate',
  'managementFeeRate',
  'qfafFeeRate',
  'section461Limit',
] as const;

type EditableField = (typeof EDITABLE_FIELDS)[number];

export function isEditableField(field: string): field is EditableField {
  return EDITABLE_FIELDS.includes(field as EditableField);
}

export function updateQfafTestInput(
  inputs: QfafTestYearInput[],
  year: number,
  field: EditableField,
  value: number
): QfafTestYearInput[] {
  return inputs.map(input => {
    if (input.year === year) {
      return { ...input, [field]: value };
    }
    return input;
  });
}

/**
 * Update section 461 limits for all years based on filing status.
 * Pure function - returns new array.
 */
export function updateSection461LimitsForFilingStatus(
  inputs: QfafTestYearInput[],
  filingStatus: FilingStatus
): QfafTestYearInput[] {
  const newLimit = SECTION_461_LIMITS_2026[filingStatus];
  return inputs.map(input => ({
    ...input,
    section461Limit: newLimit,
  }));
}
