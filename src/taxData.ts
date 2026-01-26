import { CalculatorInputs } from './types';

export const STATES = [
  { code: 'CA', name: 'California', rate: 0.133 },
  { code: 'NY', name: 'New York', rate: 0.109 },
  { code: 'TX', name: 'Texas', rate: 0 },
  { code: 'FL', name: 'Florida', rate: 0 },
  { code: 'WA', name: 'Washington', rate: 0.07 },
  { code: 'OTHER', name: 'Other (enter rate)', rate: 0 },
];

export function getStateRate(code: string): number {
  return STATES.find(s => s.code === code)?.rate ?? 0;
}

// Federal brackets for 2025 (MFJ)
const FEDERAL_BRACKETS_MFJ = [
  { min: 0, max: 23850, rate: 0.10 },
  { min: 23850, max: 96950, rate: 0.12 },
  { min: 96950, max: 206700, rate: 0.22 },
  { min: 206700, max: 394600, rate: 0.24 },
  { min: 394600, max: 501050, rate: 0.32 },
  { min: 501050, max: 751600, rate: 0.35 },
  { min: 751600, max: Infinity, rate: 0.37 },
];

// Federal brackets for 2025 (Single)
const FEDERAL_BRACKETS_SINGLE = [
  { min: 0, max: 11925, rate: 0.10 },
  { min: 11925, max: 48475, rate: 0.12 },
  { min: 48475, max: 103350, rate: 0.22 },
  { min: 103350, max: 197300, rate: 0.24 },
  { min: 197300, max: 250525, rate: 0.32 },
  { min: 250525, max: 626350, rate: 0.35 },
  { min: 626350, max: Infinity, rate: 0.37 },
];

// NIIT threshold
const NIIT_THRESHOLD_MFJ = 250000;
const NIIT_THRESHOLD_SINGLE = 200000;
const NIIT_RATE = 0.038;

export function getFederalStRate(income: number, status: string): number {
  const brackets = status === 'mfj' ? FEDERAL_BRACKETS_MFJ : FEDERAL_BRACKETS_SINGLE;
  const niitThreshold = status === 'mfj' ? NIIT_THRESHOLD_MFJ : NIIT_THRESHOLD_SINGLE;

  let marginalRate = 0.10;
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

export function getFederalLtRate(income: number, status: string): number {
  const niitThreshold = status === 'mfj' ? NIIT_THRESHOLD_MFJ : NIIT_THRESHOLD_SINGLE;

  // LTCG brackets (2025)
  let ltRate: number;
  if (status === 'mfj') {
    if (income > 583750) ltRate = 0.20;
    else if (income > 89250) ltRate = 0.15;
    else ltRate = 0;
  } else {
    if (income > 518900) ltRate = 0.20;
    else if (income > 44625) ltRate = 0.15;
    else ltRate = 0;
  }

  // Add NIIT for high earners
  if (income > niitThreshold) {
    ltRate += NIIT_RATE;
  }

  return ltRate;
}

export const DEFAULTS: CalculatorInputs = {
  investmentAmount: 1000000,
  filingStatus: 'mfj',
  stateCode: 'CA',
  stateRate: 0,
  annualIncome: 500000,
  ediAllocation: 0.5,
  qfafReturn: 0.07,
  qfafStGainPct: 0.70,
  ediReturn: 0.08,
  ediHarvestingYear1: 0.05,
  existingStLossCarryforward: 0,
  existingLtLossCarryforward: 0,
};
