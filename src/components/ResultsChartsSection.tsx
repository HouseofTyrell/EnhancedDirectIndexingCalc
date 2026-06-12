import { lazy, Suspense, useCallback, useEffect, useMemo, useRef } from 'react';
import { ResultsTable } from '../ResultsTable';
import { CalculatorInputs, AdvancedSettings, CalculationResult } from '../types';
import { Strategy } from '../strategyData';
import { formatShortcut } from '../hooks/useKeyboardShortcuts';
import { downloadInputsCsv, parseInputsFromCsv } from '../utils/csvScenario';

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
  /**
   * Apply a parsed CSV scenario back into Calculator state. When omitted, the
   * Import Scenario button is hidden.
   */
  onImportCsv?: (inputs: Partial<CalculatorInputs>, settings: Partial<AdvancedSettings>) => void;
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
  onImportCsv,
}: ResultsChartsSectionProps) {
  // Filter chart data to only show strategy-active years (no wind-down)
  const activeYears = useMemo(() => results.years.filter(y => y.strategyActive), [results.years]);

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

  const handleExportCsv = useCallback(() => {
    downloadInputsCsv(inputs, advancedSettings);
  }, [inputs, advancedSettings]);

  // Hidden file input for the Import Scenario button.
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const handleImportClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);
  const handleFileChosen = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      // Reset the input so the same file can be re-imported later.
      e.target.value = '';
      if (!file || !onImportCsv) return;
      try {
        const text = await file.text();
        const {
          inputs: parsedInputs,
          settings: parsedSettings,
          warnings,
        } = parseInputsFromCsv(text);
        onImportCsv(parsedInputs, parsedSettings);
        if (warnings.length > 0) {
          window.alert(`Scenario imported with warnings:\n\n${warnings.join('\n')}`);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        window.alert(`Could not import scenario: ${msg}`);
      }
    },
    [onImportCsv]
  );

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
        startMonth={startMonth}
        qfafDuration={inputs.qfafDuration}
        strategyId={inputs.splitAllocation?.enabled ? undefined : currentStrategy?.id}
        ltGainRate={inputs.splitAllocation?.enabled ? undefined : currentStrategy?.ltGainRate}
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
        <button
          className="print-btn"
          onClick={handlePrint}
          title={`Print or save as PDF (${formatShortcut('P')})`}
        >
          Print / Save as PDF
        </button>
        <button
          className="export-btn"
          onClick={handleExport}
          title={`Export results to Excel (${formatShortcut('E')})`}
        >
          Export to Excel
        </button>
        <button
          className="export-btn"
          onClick={handleExportCsv}
          title="Export inputs as CSV (re-loadable via Import Scenario)"
        >
          Export Scenario (CSV)
        </button>
        {onImportCsv && (
          <>
            <button
              className="export-btn"
              onClick={handleImportClick}
              title="Load inputs from a previously exported scenario CSV"
            >
              Import Scenario (CSV)
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              style={{ display: 'none' }}
              onChange={handleFileChosen}
            />
          </>
        )}
      </section>
    </>
  );
}
