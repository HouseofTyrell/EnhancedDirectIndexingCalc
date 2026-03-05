import { lazy, Suspense, useCallback, useEffect, useMemo } from 'react';
import { ResultsTable } from '../ResultsTable';
import { CalculatorInputs, AdvancedSettings, CalculationResult } from '../types';
import { Strategy } from '../strategyData';
import { formatShortcut } from '../hooks/useKeyboardShortcuts';

interface TaxRates {
  federalStRate: number;
  federalLtRate: number;
  stateRate: number;
  combinedStRate: number;
  combinedLtRate: number;
  rateDifferential: number;
}

// Lazy load chart components to reduce initial bundle size
const TaxSavingsChart = lazy(() =>
  import('../WealthChart').then(m => ({ default: m.TaxSavingsChart }))
);
const PortfolioValueChart = lazy(() =>
  import('../WealthChart').then(m => ({ default: m.PortfolioValueChart }))
);

interface ResultsChartsSectionProps {
  results: CalculationResult;
  inputs: CalculatorInputs;
  advancedSettings: AdvancedSettings;
  currentStrategy?: Strategy;
  taxRates: TaxRates;
  projectionYears: number;
  startMonth?: number;
  onPrintRef?: (handler: () => void) => void;
  onExportRef?: (handler: () => void) => void;
}

export function ResultsChartsSection({
  results,
  inputs,
  advancedSettings,
  currentStrategy,
  taxRates,
  projectionYears,
  startMonth,
  onPrintRef,
  onExportRef,
}: ResultsChartsSectionProps) {
  // Filter chart data to only show strategy-active years (no wind-down)
  const activeYears = useMemo(
    () => results.years.filter(y => y.strategyActive),
    [results.years]
  );

  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  const handleExport = useCallback(async () => {
    const { exportToExcel } = await import('../utils/excelExport');
    await exportToExcel({
      inputs,
      results,
      settings: advancedSettings,
      taxRates,
    });
  }, [inputs, results, advancedSettings, taxRates]);

  // Expose handlers to parent via useEffect (not during render)
  useEffect(() => {
    if (onPrintRef) onPrintRef(handlePrint);
    if (onExportRef) onExportRef(handleExport);
  }, [handlePrint, handleExport, onPrintRef, onExportRef]);

  return (
    <>
      {/* Tax Benefits Chart — only active strategy years */}
      <Suspense fallback={<div className="chart-loading">Loading chart...</div>}>
        <TaxSavingsChart data={activeYears} startMonth={startMonth} />
      </Suspense>

      {/* Table — shows all years including wind-down */}
      <ResultsTable
        data={results.years}
        sizing={results.sizing}
        qfafEnabled={inputs.qfafEnabled}
        projectionYears={projectionYears}
      />

      {/* Portfolio Value Chart — only active strategy years */}
      <Suspense fallback={<div className="chart-loading">Loading chart...</div>}>
        <PortfolioValueChart
          data={activeYears}
          trackingError={currentStrategy?.trackingError}
          startMonth={startMonth}
        />
      </Suspense>

      {/* Actions */}
      <section className="actions">
        <button className="print-btn" onClick={handlePrint} title={`Print or save as PDF (${formatShortcut('P')})`}>
          Print / Save as PDF
        </button>
        <button
          className="export-btn"
          onClick={handleExport}
          title={`Export results to Excel (${formatShortcut('E')})`}
        >
          Export to Excel
        </button>
      </section>
    </>
  );
}
