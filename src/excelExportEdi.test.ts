/**
 * D-021 export parity: the EDI metrics shown on screen (loss reserve,
 * protection ratio / break-even gain event / cumulative financing cost,
 * step-up comparison) must reach the Excel export's Summary sheet.
 *
 * The workbook is built via `buildWorkbook` (no download) and parsed back
 * with the xlsx lib. Honest-attribution rules under test:
 * - the loss reserve is labeled contingent and NEVER summed into
 *   Total Tax Savings;
 * - protection ratio prints "—" (not Infinity) when no financing cost
 *   was modeled;
 * - Step-Up Advantage stays SIGNED (negative = liquidation beats step-up
 *   because carryforward shelter makes the strategy exit cheaper than
 *   passive).
 */

import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { calculate, computeEdiInsights, computeStepUpComparison } from './calculations';
import { computeExitTaxAnalysis } from './calculations/exitTax';
import { buildWorkbook } from './utils/excelExport';
import { CalculatorInputs, AdvancedSettings, DEFAULT_SETTINGS } from './types';

const COMBINED_LT_RATE = 0.238 + 0.133; // 20% + 3.8% NIIT + 13.3% CA

// $3M MFJ income → 37% + 3.8% NIIT federal ST; 20% + 3.8% federal LT
const TAX_RATES = {
  federalStRate: 0.408,
  federalLtRate: 0.238,
  stateRate: 0.133,
  combinedStRate: 0.541,
  combinedLtRate: COMBINED_LT_RATE,
  rateDifferential: 0.17,
};

function createInputs(overrides: Partial<CalculatorInputs> = {}): CalculatorInputs {
  return {
    filingStatus: 'mfj',
    stateCode: 'CA',
    stateRate: 0.133,
    annualIncome: 3000000,
    strategyId: 'overlay-45-45',
    collateralAmount: 10000000,
    existingStLossCarryforward: 0,
    existingLtLossCarryforward: 0,
    existingNolCarryforward: 0,
    qfafEnabled: false, // EDI-only mode
    qfafSizingYears: 1,
    qfafSizingCushion: 0,
    qfafDuration: 5,
    qfafSizingMode: 'dynamic',
    startMonth: 1,
    ...overrides,
  };
}

type Row = (string | number | undefined)[];

async function exportSummaryRows(
  inputs: CalculatorInputs,
  settings: AdvancedSettings,
  passiveReturn = 0
): Promise<{
  rows: Row[];
  result: ReturnType<typeof calculate>;
  exit: ReturnType<typeof computeExitTaxAnalysis>;
}> {
  const result = calculate(inputs, settings);
  const exit = computeExitTaxAnalysis(result, COMBINED_LT_RATE, passiveReturn);
  const wb = await buildWorkbook({
    inputs,
    results: result,
    settings,
    taxRates: TAX_RATES,
    exitAnalysis: exit,
  });
  const rows = XLSX.utils.sheet_to_json<Row>(wb.Sheets['Summary'], { header: 1 });
  return { rows, result, exit };
}

/** Finds the (unique) summary row whose label starts with `label`. */
function rowValue(rows: Row[], label: string): string | number | undefined {
  const matches = rows.filter(r => typeof r[0] === 'string' && (r[0] as string).startsWith(label));
  expect(matches, `expected exactly one row labeled "${label}"`).toHaveLength(1);
  return matches[0][1];
}

describe('Excel export — loss reserve block (D-021)', () => {
  it('exports final CF balances and the contingent shelter value, labeled contingent', async () => {
    const inputs = createInputs({ existingLtLossCarryforward: 1000000, ltGainsEnabled: false });
    const { rows, result } = await exportSummaryRows(inputs, DEFAULT_SETTINGS);

    expect(rowValue(rows, 'Final ST Loss Carryforward')).toBeCloseTo(
      result.summary.finalStCarryforward,
      2
    );
    expect(rowValue(rows, 'Final LT Loss Carryforward')).toBeCloseTo(
      result.summary.finalLtCarryforward,
      2
    );
    expect(rowValue(rows, 'Loss Reserve Shelter Value (contingent on future gains)')).toBeCloseTo(
      result.summary.lossReserveShelterValue,
      2
    );
    // The block header spells out the attribution rule.
    const header = rows.find(
      r => typeof r[0] === 'string' && (r[0] as string).startsWith('Loss Reserve Built')
    );
    expect(header?.[0]).toContain('contingent on future gains');
    expect(header?.[0]).toContain('NOT added to savings');
  });

  it('never folds the reserve into the exported Total Tax Savings', async () => {
    const { rows, result } = await exportSummaryRows(createInputs(), DEFAULT_SETTINGS);
    expect(result.summary.lossReserveShelterValue).toBeGreaterThan(0);
    expect(rowValue(rows, 'Total Tax Savings (All Years)')).toBeCloseTo(
      result.summary.totalTaxSavings,
      2
    );
  });
});

describe('Excel export — EDI economics (D-021)', () => {
  it('prints "—" for the protection ratio when no financing cost is modeled', async () => {
    // DEFAULT_SETTINGS keeps financing fees off (D-002).
    const { rows } = await exportSummaryRows(createInputs(), DEFAULT_SETTINGS);
    expect(rowValue(rows, 'Protection Ratio')).toBe('—');
    expect(rowValue(rows, 'Cumulative Financing Cost')).toBe(0);
  });

  it('exports the numeric protection ratio, break-even, and financing cost with fees on', async () => {
    const settings = { ...DEFAULT_SETTINGS, financingFeesEnabled: true };
    const { rows, result } = await exportSummaryRows(createInputs(), settings);
    const insights = computeEdiInsights(result);

    expect(insights.protectionRatio).not.toBeNull();
    expect(rowValue(rows, 'Protection Ratio')).toBeCloseTo(insights.protectionRatio!, 6);
    expect(rowValue(rows, 'Break-Even Gain Event')).toBeCloseTo(
      result.summary.finalStCarryforward + result.summary.finalLtCarryforward,
      2
    );
    expect(rowValue(rows, 'Cumulative Financing Cost')).toBeCloseTo(
      insights.cumulativeFinancingCost,
      2
    );
  });
});

describe('Excel export — step-up comparison (D-021)', () => {
  it('exports net-if-held / net-if-liquidated / signed advantage / CF value lost', async () => {
    const settings = { ...DEFAULT_SETTINGS, growthEnabled: true, defaultAnnualReturn: 0.07 };
    const { rows, result, exit } = await exportSummaryRows(createInputs(), settings, 0.07);
    const stepUp = computeStepUpComparison(result, exit);

    expect(rowValue(rows, 'Net If Held to Step-Up')).toBeCloseTo(stepUp.netIfHeldToStepUp, 2);
    expect(rowValue(rows, 'Net If Liquidated')).toBeCloseTo(exit.netBenefitAfterLiquidation, 2);
    expect(rowValue(rows, 'Step-Up Advantage (signed)')).toBeCloseTo(
      exit.incrementalDeferredTax,
      2
    );
    expect(rowValue(rows, 'Carryforward Value Lost at Death')).toBeCloseTo(
      result.summary.lossReserveShelterValue,
      2
    );
    // The mortality-contingent framing is disclosed on the block header.
    const header = rows.find(
      r => typeof r[0] === 'string' && (r[0] as string).startsWith('Step-Up Comparison')
    );
    expect(header?.[0]).toContain('mortality-contingent');
  });

  it('keeps a NEGATIVE step-up advantage signed (strategy exits cheaper than passive)', async () => {
    // Massive pre-existing CF: the strategy liquidates tax-free while the
    // passive holder pays in full — liquidation BEATS holding to step-up.
    const settings = { ...DEFAULT_SETTINGS, growthEnabled: true, defaultAnnualReturn: 0.07 };
    const inputs = createInputs({ existingStLossCarryforward: 30000000 });
    const { rows, exit } = await exportSummaryRows(inputs, settings, 0.07);

    expect(exit.incrementalDeferredTax).toBeLessThan(0);
    const advantage = rowValue(rows, 'Step-Up Advantage (signed)');
    expect(advantage).toBeCloseTo(exit.incrementalDeferredTax, 2);
    expect(advantage as number).toBeLessThan(0);
  });
});
