import { CalculatorInputs } from './types';

// All 50 US States + DC with 2026 top marginal income tax rates
// Sources: Tax Foundation, state tax authorities
// Note: Rates shown are top marginal rates for high-income earners
export const STATES = [
  // No income tax states
  { code: 'AK', name: 'Alaska', rate: 0 },
  { code: 'FL', name: 'Florida', rate: 0 },
  { code: 'NV', name: 'Nevada', rate: 0 },
  { code: 'NH', name: 'New Hampshire', rate: 0 }, // No tax on earned income (only interest/dividends, phasing out)
  { code: 'SD', name: 'South Dakota', rate: 0 },
  { code: 'TN', name: 'Tennessee', rate: 0 },
  { code: 'TX', name: 'Texas', rate: 0 },
  { code: 'WA', name: 'Washington', rate: 0 }, // No income tax (has capital gains tax of 7% on gains > $270k)
  { code: 'WY', name: 'Wyoming', rate: 0 },

  // States with income tax (alphabetical)
  { code: 'AL', name: 'Alabama', rate: 0.05 },
  { code: 'AZ', name: 'Arizona', rate: 0.025 }, // Flat rate as of 2023
  { code: 'AR', name: 'Arkansas', rate: 0.039 }, // Reduced in 2026
  { code: 'CA', name: 'California', rate: 0.133 }, // Highest in nation (12.3% + 1% mental health surtax >$1M)
  { code: 'CO', name: 'Colorado', rate: 0.044 }, // Flat rate
  { code: 'CT', name: 'Connecticut', rate: 0.0699 },
  { code: 'DE', name: 'Delaware', rate: 0.066 },
  { code: 'DC', name: 'District of Columbia', rate: 0.1075 },
  { code: 'GA', name: 'Georgia', rate: 0.0519 }, // Reduced from 5.39% mid-2025
  { code: 'HI', name: 'Hawaii', rate: 0.11 },
  { code: 'ID', name: 'Idaho', rate: 0.058 }, // Flat rate
  { code: 'IL', name: 'Illinois', rate: 0.0495 }, // Flat rate
  { code: 'IN', name: 'Indiana', rate: 0.0295 }, // Reduced in 2026
  { code: 'IA', name: 'Iowa', rate: 0.0375 }, // Flat rate as of 2026
  { code: 'KS', name: 'Kansas', rate: 0.057 },
  { code: 'KY', name: 'Kentucky', rate: 0.04 }, // Flat rate, reduced from 4.5%
  { code: 'LA', name: 'Louisiana', rate: 0.03 }, // Single flat rate as of 2026
  { code: 'ME', name: 'Maine', rate: 0.0715 },
  { code: 'MD', name: 'Maryland', rate: 0.0575 }, // Plus local taxes up to 3.2%
  { code: 'MA', name: 'Massachusetts', rate: 0.09 }, // 5% flat + 4% surtax on income >$1M
  { code: 'MI', name: 'Michigan', rate: 0.0405 }, // Reduced from 4.25%
  { code: 'MN', name: 'Minnesota', rate: 0.0985 },
  { code: 'MS', name: 'Mississippi', rate: 0.04 }, // Reduced in 2026
  { code: 'MO', name: 'Missouri', rate: 0.048 }, // Reduced from 4.95%
  { code: 'MT', name: 'Montana', rate: 0.059 }, // Reduced from 6.75%
  { code: 'NE', name: 'Nebraska', rate: 0.0455 }, // Reduced from 5.2% in 2026
  { code: 'NJ', name: 'New Jersey', rate: 0.1075 },
  { code: 'NM', name: 'New Mexico', rate: 0.059 },
  { code: 'NY', name: 'New York', rate: 0.109 }, // Top rate with temporary high-earner surtax extended
  { code: 'NC', name: 'North Carolina', rate: 0.0399 }, // Reduced from 4.25% in 2026 (final reduction)
  { code: 'ND', name: 'North Dakota', rate: 0.0225 }, // Reduced from 2.5%
  { code: 'OH', name: 'Ohio', rate: 0.0275 }, // Flat rate on income >$26,050 as of 2026
  { code: 'OK', name: 'Oklahoma', rate: 0.0475 }, // Reduced from 4.75%
  { code: 'OR', name: 'Oregon', rate: 0.099 },
  { code: 'PA', name: 'Pennsylvania', rate: 0.0307 }, // Flat rate
  { code: 'RI', name: 'Rhode Island', rate: 0.0599 },
  { code: 'SC', name: 'South Carolina', rate: 0.064 }, // Being phased down
  { code: 'UT', name: 'Utah', rate: 0.0465 }, // Flat rate
  { code: 'VT', name: 'Vermont', rate: 0.0875 },
  { code: 'VA', name: 'Virginia', rate: 0.0575 },
  { code: 'WV', name: 'West Virginia', rate: 0.047 }, // Reduced from 5.12%
  { code: 'WI', name: 'Wisconsin', rate: 0.0765 },

  // Custom entry option
  { code: 'OTHER', name: 'Other (enter rate)', rate: 0 },
];

/**
 * Look up the top marginal state income tax rate for a given state.
 * @param code - Two-letter state code (e.g. "CA", "NY") or "OTHER"
 * @returns The top marginal state income tax rate as a decimal, or 0 if not found
 */
export function getStateRate(code: string): number {
  return STATES.find(s => s.code === code)?.rate ?? 0;
}

// Federal brackets for 2026 (MFJ)
// Source: IRS Rev. Proc. 2025-XX, includes OBBBA adjustments
// Bottom two brackets get 4% inflation adjustment, upper brackets get 2.3%
const FEDERAL_BRACKETS_MFJ = [
  { min: 0, max: 24800, rate: 0.1 },
  { min: 24800, max: 100800, rate: 0.12 },
  { min: 100800, max: 211400, rate: 0.22 },
  { min: 211400, max: 403550, rate: 0.24 },
  { min: 403550, max: 512450, rate: 0.32 },
  { min: 512450, max: 768700, rate: 0.35 },
  { min: 768700, max: Infinity, rate: 0.37 },
];

// Federal brackets for 2026 (Single)
const FEDERAL_BRACKETS_SINGLE = [
  { min: 0, max: 12400, rate: 0.1 },
  { min: 12400, max: 50400, rate: 0.12 },
  { min: 50400, max: 105700, rate: 0.22 },
  { min: 105700, max: 201775, rate: 0.24 },
  { min: 201775, max: 256225, rate: 0.32 },
  { min: 256225, max: 640600, rate: 0.35 },
  { min: 640600, max: Infinity, rate: 0.37 },
];

// Federal brackets for 2026 (Married Filing Separately)
const FEDERAL_BRACKETS_MFS = [
  { min: 0, max: 12400, rate: 0.1 },
  { min: 12400, max: 50400, rate: 0.12 },
  { min: 50400, max: 105700, rate: 0.22 },
  { min: 105700, max: 201775, rate: 0.24 },
  { min: 201775, max: 256225, rate: 0.32 },
  { min: 256225, max: 384350, rate: 0.35 },
  { min: 384350, max: Infinity, rate: 0.37 },
];

// Federal brackets for 2026 (Head of Household)
const FEDERAL_BRACKETS_HOH = [
  { min: 0, max: 17650, rate: 0.1 },
  { min: 17650, max: 67450, rate: 0.12 },
  { min: 67450, max: 105700, rate: 0.22 },
  { min: 105700, max: 201775, rate: 0.24 },
  { min: 201775, max: 256225, rate: 0.32 },
  { min: 256225, max: 640600, rate: 0.35 },
  { min: 640600, max: Infinity, rate: 0.37 },
];

// NIIT thresholds (unchanged for 2026)
const NIIT_THRESHOLD_MFJ = 250000;
const NIIT_THRESHOLD_SINGLE = 200000;
const NIIT_THRESHOLD_MFS = 125000;
const NIIT_THRESHOLD_HOH = 200000;
const NIIT_RATE = 0.038;

function getBrackets(status: string) {
  switch (status) {
    case 'mfj':
      return FEDERAL_BRACKETS_MFJ;
    case 'mfs':
      return FEDERAL_BRACKETS_MFS;
    case 'hoh':
      return FEDERAL_BRACKETS_HOH;
    default:
      return FEDERAL_BRACKETS_SINGLE;
  }
}

function getNiitThreshold(status: string) {
  switch (status) {
    case 'mfj':
      return NIIT_THRESHOLD_MFJ;
    case 'mfs':
      return NIIT_THRESHOLD_MFS;
    case 'hoh':
      return NIIT_THRESHOLD_HOH;
    default:
      return NIIT_THRESHOLD_SINGLE;
  }
}

/**
 * Compute the federal marginal short-term capital gains tax rate for a given
 * income level and filing status. Includes the 3.8% Net Investment Income Tax
 * (NIIT) when income exceeds the applicable threshold.
 * @param income - Total taxable income in dollars
 * @param status - Filing status code ("single", "mfj", "mfs", or "hoh")
 * @returns The combined marginal federal short-term rate as a decimal
 */
export function getFederalStRate(income: number, status: string): number {
  const brackets = getBrackets(status);
  const niitThreshold = getNiitThreshold(status);

  let marginalRate = 0.1;
  for (let i = brackets.length - 1; i >= 0; i--) {
    if (income >= brackets[i].min) {
      marginalRate = brackets[i].rate;
      break;
    }
  }

  // Add NIIT for high earners
  if (income > niitThreshold) {
    marginalRate += NIIT_RATE;
  }

  return marginalRate;
}

/**
 * Compute the federal marginal long-term capital gains tax rate for a given
 * income level and filing status. Uses the 2026 inflation-adjusted LTCG
 * brackets (0% / 15% / 20%) and adds the 3.8% NIIT when income exceeds
 * the applicable threshold.
 * @param income - Total taxable income in dollars
 * @param status - Filing status code ("single", "mfj", "mfs", or "hoh")
 * @returns The combined marginal federal long-term rate as a decimal
 */
export function getFederalLtRate(income: number, status: string): number {
  const niitThreshold = getNiitThreshold(status);

  // LTCG brackets for 2026 (inflation adjusted)
  let ltRate: number;
  if (status === 'mfj') {
    if (income > 610350) ltRate = 0.2;
    else if (income > 96700) ltRate = 0.15;
    else ltRate = 0;
  } else if (status === 'mfs') {
    if (income > 305175) ltRate = 0.2;
    else if (income > 48350) ltRate = 0.15;
    else ltRate = 0;
  } else if (status === 'hoh') {
    if (income > 578100) ltRate = 0.2;
    else if (income > 64750) ltRate = 0.15;
    else ltRate = 0;
  } else {
    // Single
    if (income > 542050) ltRate = 0.2;
    else if (income > 48350) ltRate = 0.15;
    else ltRate = 0;
  }

  // Add NIIT for high earners
  if (income > niitThreshold) {
    ltRate += NIIT_RATE;
  }

  return ltRate;
}

export const DEFAULTS: CalculatorInputs = {
  // Client profile
  filingStatus: 'mfj',
  stateCode: 'CA',
  stateRate: 0,
  annualIncome: 3000000,

  // Strategy selection
  strategyId: 'core-145-45',
  collateralAmount: 10000000,

  // Carryforwards
  existingStLossCarryforward: 0,
  existingLtLossCarryforward: 0,
  existingNolCarryforward: 0,

  // QFAF toggle (enabled by default)
  qfafEnabled: true,

  // QFAF sizing: average losses over 5 years by default
  qfafSizingYears: 5,

  // QFAF sizing cushion: 0% reduction by default
  qfafSizingCushion: 0,
};
