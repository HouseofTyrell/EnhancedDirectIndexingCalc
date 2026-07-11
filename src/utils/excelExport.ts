import type { CalculationResult, CalculatorInputs } from '../types';
import type { AdvancedSettings } from '../types';
import type { ExitTaxAnalysis } from '../calculations/exitTax';
import { computeEdiInsights, computeStepUpComparison } from '../calculations/ediInsights';
import { getEffectiveView } from './effectiveAllocation';
import { brandText } from '../branding';

interface ExportData {
  inputs: CalculatorInputs;
  results: CalculationResult;
  settings: AdvancedSettings;
  taxRates: {
    federalStRate: number;
    federalLtRate: number;
    stateRate: number;
    combinedStRate: number;
    combinedLtRate: number;
    rateDifferential: number;
  };
  /**
   * Exit-tax / deferred-gain analysis already computed from `results` by the
   * caller (D-003). Needed for the step-up comparison block (D-018/D-021).
   */
  exitAnalysis: ExitTaxAnalysis;
}

type Workbook = import('xlsx').WorkBook;

/**
 * Builds the export workbook. Separated from `exportToExcel` so tests can
 * parse the sheets back without triggering a browser download.
 * All 4 sheets: Summary, Year-by-Year, Assumptions, Disclaimer.
 */
export async function buildWorkbook(data: ExportData): Promise<Workbook> {
  const XLSX = await import('xlsx');

  const wb = XLSX.utils.book_new();

  // EDI metrics (D-021 export parity): derived INSIDE the export from the
  // same CalculationResult + ExitTaxAnalysis the screen uses — one engine,
  // one set of numbers. Labels mirror the on-screen names.
  const insights = computeEdiInsights(data.results);
  const stepUp = computeStepUpComparison(data.results, data.exitAnalysis);

  // Sheet 1: Summary
  const view = getEffectiveView(data.inputs);
  const summaryRows: (string | number)[][] = [
    ['Tax Optimization Calculator — Summary'],
    [],
    ['Strategy', view.displayName],
    ['Collateral Amount', view.totalCollateral],
    ...(view.isSplit
      ? view.legs.map(leg => [`  ${leg.label}: ${leg.strategy.name}`, leg.amount])
      : []),
    [brandText('Auto-Sized QFAF'), data.results.sizing.qfafValue],
    ['Total Exposure', data.results.sizing.totalExposure],
    [],
    ['Year 1 Tax Savings', data.results.years[0]?.taxSavings ?? 0],
    [
      'Year 2+ Tax Savings',
      data.results.years.length > 1 ? (data.results.years[1]?.taxSavings ?? 0) : 'N/A',
    ],
    ['Total Tax Savings (All Years)', data.results.summary.totalTaxSavings],
    ['Effective Tax Alpha', data.results.summary.effectiveTaxAlpha],
    ['Final Portfolio Value', data.results.summary.finalPortfolioValue],
    ['Total NOL Generated', data.results.summary.totalNolGenerated],
    [],
    // Loss reserve (D-015): CONTINGENT shelter value — reported alongside,
    // and never summed into, Total Tax Savings.
    ['Loss Reserve Built — contingent on future gains, NOT added to savings'],
    ['Final ST Loss Carryforward', insights.finalStCarryforward],
    ['Final LT Loss Carryforward', insights.finalLtCarryforward],
    ['Loss Reserve Shelter Value (contingent on future gains)', insights.lossReserveShelterValue],
    [],
    ['EDI Economics'],
    // Ratio over zero financing cost is meaningless — print "—", not Infinity.
    [
      'Protection Ratio (shelter value ÷ financing cost)',
      insights.protectionRatio !== null ? insights.protectionRatio : '—',
    ],
    ['Break-Even Gain Event', insights.breakEvenGainEvent],
    ['Cumulative Financing Cost', insights.cumulativeFinancingCost],
    [],
    ['Step-Up Comparison (IRC §1014, mortality-contingent)'],
    ['Net If Held to Step-Up', stepUp.netIfHeldToStepUp],
    ['Net If Liquidated', stepUp.netIfLiquidated],
    // Signed (D-018): negative means the strategy exits cheaper than passive.
    ['Step-Up Advantage (signed)', stepUp.stepUpAdvantage],
    [
      'Carryforward Value Lost at Death (contingent; not counted in either figure)',
      stepUp.continueAndDie.carryforwardValueLost,
    ],
  ];
  const summarySheet = XLSX.utils.aoa_to_sheet(summaryRows);
  // Format currency columns. Identify special rows by label since
  // split-allocation breakdown can shift later rows down.
  const currencyFmt = '$#,##0';
  const pctFmt = '0.00%';
  const ratioFmt = '0.0"×"';
  const alphaRow = summaryRows.findIndex(row => row[0] === 'Effective Tax Alpha');
  const ratioRow = summaryRows.findIndex(
    row => typeof row[0] === 'string' && row[0].startsWith('Protection Ratio')
  );
  for (let r = 2; r < summaryRows.length; r++) {
    const cell = summarySheet[XLSX.utils.encode_cell({ r, c: 1 })];
    if (cell && typeof cell.v === 'number') {
      cell.z = r === alphaRow ? pctFmt : r === ratioRow ? ratioFmt : currencyFmt;
    }
  }
  XLSX.utils.book_append_sheet(wb, summarySheet, 'Summary');

  // Sheet 2: Year-by-Year. Deleverage columns (D-016) appear only when a
  // plan actually unwound something — keeps the default export uncluttered.
  const hasDeleverage = data.results.years.some(y => y.extensionFraction < 1);
  // Per-leg unwind attribution (D-028) — split mode only.
  const hasPerLegDeleverage = data.results.years.some(y => y.overlayDeleverageGain !== undefined);
  const yearHeaders: (string | number)[] = [
    'Year',
    'Collateral Value',
    brandText('QFAF Value'),
    'Total Value',
    'ST Losses Harvested',
    'LT Gains Realized',
    brandText('ST Gains (QFAF)'),
    'Ordinary Losses',
    'Usable Ordinary Loss',
    'NOL Carryforward',
    'State NOL Expired',
    'WA Income Tax (2028+)',
    'WA Capital-Gains Tax Credit',
    'Tax Savings',
    'Income Offset',
    ...(hasDeleverage ? ['Extension %', 'Unwind Gain', 'Tax on Unwind', 'Financing Saved'] : []),
    ...(hasPerLegDeleverage ? ['Core Unwind Gain', 'Overlay Unwind Gain'] : []),
  ];
  const yearRows: (string | number)[][] = [yearHeaders];
  for (const y of data.results.years) {
    yearRows.push([
      y.year,
      y.collateralValue,
      y.qfafValue,
      y.totalValue,
      y.stLossesHarvested,
      y.ltGainsRealized,
      y.stGainsGenerated,
      y.ordinaryLossesGenerated,
      y.usableOrdinaryLoss,
      y.nolCarryforward,
      y.stateNolExpired,
      y.waIncomeTax,
      y.waCapitalGainsTaxCredit,
      y.taxSavings,
      y.incomeOffsetAmount,
      ...(hasDeleverage
        ? [y.extensionFraction, y.deleverageGainRealized, y.deleverageTax, y.financingSaved]
        : []),
      ...(hasPerLegDeleverage ? [y.coreDeleverageGain ?? 0, y.overlayDeleverageGain ?? 0] : []),
    ]);
  }
  const yearSheet = XLSX.utils.aoa_to_sheet(yearRows);
  // Apply currency format to data cells (skip header row, skip year column,
  // and format the Extension % column as a percentage)
  const extensionCol = hasDeleverage ? yearHeaders.indexOf('Extension %') : -1;
  for (let r = 1; r < yearRows.length; r++) {
    for (let c = 1; c < yearHeaders.length; c++) {
      const cell = yearSheet[XLSX.utils.encode_cell({ r, c })];
      if (cell && typeof cell.v === 'number') {
        cell.z = c === extensionCol ? pctFmt : currencyFmt;
      }
    }
  }
  XLSX.utils.book_append_sheet(wb, yearSheet, 'Year-by-Year');

  // Sheet 3: Assumptions
  const assumptionRows = [
    ['Tax Optimization Calculator — Assumptions'],
    [],
    ['Filing Status', data.inputs.filingStatus.toUpperCase()],
    ['State', data.inputs.stateCode],
    ['Annual Income', data.inputs.annualIncome],
    [brandText('QFAF Enabled'), data.inputs.qfafEnabled ? 'Yes' : 'No'],
    [],
    ['Federal ST Rate', data.taxRates.federalStRate],
    ['Federal LT Rate', data.taxRates.federalLtRate],
    ['State Rate', data.taxRates.stateRate],
    ['Combined Ordinary Rate', data.taxRates.combinedStRate],
    ['Combined LT Rate', data.taxRates.combinedLtRate],
    ['ST→LT Differential', data.taxRates.rateDifferential],
    [],
    ['Projection Years', data.settings.projectionYears],
    [brandText('QFAF Multiplier'), data.settings.qfafMultiplier],
    ['Annual Return', data.settings.defaultAnnualReturn],
    ['Growth Enabled', data.settings.growthEnabled ? 'Yes' : 'No'],
  ];
  const assumptionSheet = XLSX.utils.aoa_to_sheet(assumptionRows);
  // Format tax rate cells
  for (let r = 7; r <= 12; r++) {
    const cell = assumptionSheet[XLSX.utils.encode_cell({ r, c: 1 })];
    if (cell && typeof cell.v === 'number') {
      cell.z = pctFmt;
    }
  }
  XLSX.utils.book_append_sheet(wb, assumptionSheet, 'Assumptions');

  // Sheet 4: Disclaimer
  const disclaimerRows = [
    ['Tax Optimization Calculator — Disclaimers'],
    [],
    [
      'This tool provides estimates for educational and illustrative purposes only. ' +
        'It does not constitute tax, legal, or investment advice.',
    ],
    [],
    [
      'Projection Limitations: All projections assume constant tax rates, strategy performance, ' +
        'and market conditions. Actual results will vary based on market movements, tax law changes, ' +
        'and individual circumstances.',
    ],
    [],
    [
      'Tax & Regulatory: Tax calculations use simplified federal bracket estimates and flat state rates. ' +
        'Actual tax liability depends on full tax return context including AMT, NIIT, and other provisions.',
    ],
    [],
    [
      'Investment Risks: Past performance does not guarantee future results. All investments involve risk ' +
        brandText(
          'of loss. Strategy returns, loss harvesting rates, and QFAF performance are based on historical '
        ) +
        'averages and may not be achieved.',
    ],
    [],
    [
      'Suitability: This tool is designed for qualified purchasers and their advisors. Minimum investment ' +
        'thresholds and investor qualification requirements apply. Consult a qualified professional before ' +
        'making investment decisions.',
    ],
    [],
    [
      'Estimates do not reflect advisory fees, financing costs, tracking error impacts, transaction costs, ' +
        'or behavioral effects.',
    ],
  ];
  const disclaimerSheet = XLSX.utils.aoa_to_sheet(disclaimerRows);
  // Set column width for readability
  disclaimerSheet['!cols'] = [{ wch: 100 }];
  XLSX.utils.book_append_sheet(wb, disclaimerSheet, 'Disclaimer');

  return wb;
}

/**
 * Lazily loads SheetJS, builds the workbook, and triggers an .xlsx download.
 */
export async function exportToExcel(data: ExportData): Promise<void> {
  const XLSX = await import('xlsx');
  const wb = await buildWorkbook(data);
  XLSX.writeFile(wb, 'TaxOptimizationCalculator.xlsx');
}
