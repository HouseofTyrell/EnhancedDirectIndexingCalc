import type { CalculationResult, CalculatorInputs } from '../types';
import type { AdvancedSettings } from '../types';

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
}

/**
 * Lazily loads SheetJS and exports calculator data to an .xlsx file.
 * All 4 sheets: Summary, Year-by-Year, Assumptions, Disclaimer.
 */
export async function exportToExcel(data: ExportData): Promise<void> {
  const XLSX = await import('xlsx');

  const wb = XLSX.utils.book_new();

  // Sheet 1: Summary
  const summaryRows = [
    ['Tax Optimization Calculator — Summary'],
    [],
    ['Strategy', data.results.sizing.strategyName],
    ['Collateral Amount', data.inputs.collateralAmount],
    ['Auto-Sized QFAF', data.results.sizing.qfafValue],
    ['Total Exposure', data.results.sizing.totalExposure],
    [],
    ['Year 1 Tax Savings', data.results.years[0]?.taxSavings ?? 0],
    [
      'Year 2+ Tax Savings',
      data.results.years.length > 1 ? data.results.years[1]?.taxSavings ?? 0 : 'N/A',
    ],
    ['Total Tax Savings (All Years)', data.results.summary.totalTaxSavings],
    ['Effective Tax Alpha', data.results.summary.effectiveTaxAlpha],
    ['Final Portfolio Value', data.results.summary.finalPortfolioValue],
    ['Total NOL Generated', data.results.summary.totalNolGenerated],
  ];
  const summarySheet = XLSX.utils.aoa_to_sheet(summaryRows);
  // Format currency columns
  const currencyFmt = '$#,##0';
  const pctFmt = '0.00%';
  for (let r = 2; r <= 12; r++) {
    const cell = summarySheet[XLSX.utils.encode_cell({ r, c: 1 })];
    if (cell && typeof cell.v === 'number') {
      cell.z = r === 10 ? pctFmt : currencyFmt;
    }
  }
  XLSX.utils.book_append_sheet(wb, summarySheet, 'Summary');

  // Sheet 2: Year-by-Year
  const yearHeaders: (string | number)[] = [
    'Year',
    'Collateral Value',
    'QFAF Value',
    'Total Value',
    'ST Losses Harvested',
    'LT Gains Realized',
    'ST Gains (QFAF)',
    'Ordinary Losses',
    'Usable Ordinary Loss',
    'NOL Carryforward',
    'Tax Savings',
    'Income Offset',
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
      y.taxSavings,
      y.incomeOffsetAmount,
    ]);
  }
  const yearSheet = XLSX.utils.aoa_to_sheet(yearRows);
  // Apply currency format to data cells (skip header row, skip year column)
  for (let r = 1; r < yearRows.length; r++) {
    for (let c = 1; c < yearHeaders.length; c++) {
      const cell = yearSheet[XLSX.utils.encode_cell({ r, c })];
      if (cell && typeof cell.v === 'number') {
        cell.z = currencyFmt;
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
    ['QFAF Enabled', data.inputs.qfafEnabled ? 'Yes' : 'No'],
    [],
    ['Federal ST Rate', data.taxRates.federalStRate],
    ['Federal LT Rate', data.taxRates.federalLtRate],
    ['State Rate', data.taxRates.stateRate],
    ['Combined Ordinary Rate', data.taxRates.combinedStRate],
    ['Combined LT Rate', data.taxRates.combinedLtRate],
    ['ST→LT Differential', data.taxRates.rateDifferential],
    [],
    ['Projection Years', data.settings.projectionYears],
    ['QFAF Multiplier', data.settings.qfafMultiplier],
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
        'of loss. Strategy returns, loss harvesting rates, and QFAF performance are based on historical ' +
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

  // Trigger download
  XLSX.writeFile(wb, 'TaxOptimizationCalculator.xlsx');
}
