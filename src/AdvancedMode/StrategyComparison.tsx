import { memo, useMemo, useState } from 'react';
import { STRATEGIES, getStrategy } from '../strategyData';
import { calculate } from '../calculations';
import { CalculatorInputs, ComparisonResult } from '../types';
import { InfoText } from '../InfoPopup';
import { formatCurrency, formatPercent } from '../utils/formatters';
import './StrategyComparison.css';

type SizingMode = 'fixed' | 'dynamic';

interface StrategyComparisonProps {
  baseInputs: CalculatorInputs;
  selectedStrategies: string[];
  onChange: (strategies: string[]) => void;
  projectionYears?: number;
}

// Extended comparison result with sizing mode info
interface ComparisonResultWithSizing extends ComparisonResult {
  sizingMode: SizingMode;
  displayKey: string; // unique key: "strategyId:sizingMode"
}

export const StrategyComparison = memo(function StrategyComparison({
  baseInputs,
  selectedStrategies,
  onChange,
  projectionYears,
}: StrategyComparisonProps) {
  const years = projectionYears ?? 10;

  // Per-strategy sizing modes (defaults to the base input's sizing mode)
  const [sizingModes, setSizingModes] = useState<Record<string, SizingMode>>(() => {
    const modes: Record<string, SizingMode> = {};
    for (const id of selectedStrategies) {
      modes[id] = baseInputs.qfafSizingMode;
    }
    return modes;
  });

  const getSizingMode = (strategyId: string): SizingMode =>
    sizingModes[strategyId] ?? baseInputs.qfafSizingMode;

  const toggleSizingMode = (strategyId: string) => {
    setSizingModes(prev => ({
      ...prev,
      [strategyId]: prev[strategyId] === 'dynamic' ? 'fixed' : 'dynamic',
    }));
  };

  // Calculate results for each selected strategy using its per-strategy sizing mode
  const comparisonResults = useMemo((): ComparisonResultWithSizing[] => {
    return selectedStrategies
      .map(strategyId => {
        const strategy = getStrategy(strategyId);
        if (!strategy) {
          return null;
        }

        const mode = getSizingMode(strategyId);
        const inputs = { ...baseInputs, strategyId, qfafSizingMode: mode };
        const results = calculate(inputs);

        return {
          strategyId,
          displayKey: `${strategyId}:${mode}`,
          strategyName: strategy.name,
          strategyType: strategy.type,
          sizingMode: mode,
          qfafRequired: results.sizing.qfafValue,
          totalExposure: results.sizing.totalExposure,
          year1TaxSavings: results.years[0]?.taxSavings || 0,
          tenYearTaxSavings: results.summary.totalTaxSavings,
          taxAlpha: results.summary.effectiveTaxAlpha,
          trackingErrorDisplay: strategy.trackingErrorDisplay,
        };
      })
      .filter((r): r is ComparisonResultWithSizing => r !== null);
  }, [baseInputs, selectedStrategies, sizingModes]); // eslint-disable-line react-hooks/exhaustive-deps

  // Find the best strategy for each metric
  const getBest = (metric: keyof ComparisonResult): string | null => {
    if (comparisonResults.length === 0) return null;

    let best = comparisonResults[0];
    for (const result of comparisonResults) {
      const currentValue = result[metric];
      const bestValue = best[metric];

      if (typeof currentValue === 'number' && typeof bestValue === 'number') {
        if (metric === 'qfafRequired' || metric === 'totalExposure') {
          if (currentValue < bestValue) best = result;
        } else {
          if (currentValue > bestValue) best = result;
        }
      }
    }
    return best.strategyId;
  };

  // Toggle strategy selection
  const toggleStrategy = (strategyId: string) => {
    if (selectedStrategies.includes(strategyId)) {
      if (selectedStrategies.length > 1) {
        onChange(selectedStrategies.filter(id => id !== strategyId));
        // Clean up sizing mode
        setSizingModes(prev => {
          const next = { ...prev };
          delete next[strategyId];
          return next;
        });
      }
    } else {
      if (selectedStrategies.length < 3) {
        onChange([...selectedStrategies, strategyId]);
        setSizingModes(prev => ({
          ...prev,
          [strategyId]: baseInputs.qfafSizingMode,
        }));
      }
    }
  };

  // Get available strategies grouped by type
  const coreStrategies = STRATEGIES.filter(s => s.type === 'core');
  const overlayStrategies = STRATEGIES.filter(s => s.type === 'overlay');

  return (
    <div className="strategy-comparison">
      <p className="section-description">
        Compare different strategies side-by-side to find the best fit for your situation. Select
        2-3 strategies below.
        {baseInputs.qfafEnabled &&
          ' Each strategy can use Fixed or Dynamic QFAF sizing independently.'}
      </p>

      {/* Strategy Selector */}
      <div className="strategy-selector">
        <div className="strategy-group">
          <h4>Core Strategies (Cash Funded)</h4>
          <div className="strategy-chips">
            {coreStrategies.map(strategy => (
              <button
                key={strategy.id}
                type="button"
                className={`strategy-chip ${selectedStrategies.includes(strategy.id) ? 'selected' : ''}`}
                onClick={() => toggleStrategy(strategy.id)}
                disabled={
                  !selectedStrategies.includes(strategy.id) && selectedStrategies.length >= 3
                }
              >
                {strategy.name}
              </button>
            ))}
          </div>
        </div>

        <div className="strategy-group">
          <h4>Overlay Strategies (Appreciated Stock)</h4>
          <div className="strategy-chips">
            {overlayStrategies.map(strategy => (
              <button
                key={strategy.id}
                type="button"
                className={`strategy-chip ${selectedStrategies.includes(strategy.id) ? 'selected' : ''}`}
                onClick={() => toggleStrategy(strategy.id)}
                disabled={
                  !selectedStrategies.includes(strategy.id) && selectedStrategies.length >= 3
                }
              >
                {strategy.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Comparison Table */}
      {comparisonResults.length > 0 && (
        <div className="comparison-table-container">
          <table className="comparison-table">
            <thead>
              <tr>
                <th>Metric</th>
                {comparisonResults.map(result => (
                  <th key={result.displayKey}>
                    <div className="strategy-name">{result.strategyName}</div>
                    <div className="strategy-type">{result.strategyType}</div>
                    {baseInputs.qfafEnabled && (
                      <div className="strategy-sizing-toggle">
                        <button
                          type="button"
                          className={`sizing-toggle-btn ${result.sizingMode === 'fixed' ? 'active' : ''}`}
                          onClick={() => toggleSizingMode(result.strategyId)}
                        >
                          Fixed
                        </button>
                        <button
                          type="button"
                          className={`sizing-toggle-btn ${result.sizingMode === 'dynamic' ? 'active' : ''}`}
                          onClick={() => toggleSizingMode(result.strategyId)}
                        >
                          Dynamic
                        </button>
                      </div>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className={getBest('qfafRequired') ? 'has-winner' : ''}>
                <td>
                  <InfoText contentKey="comp-qfaf-required">QFAF Required</InfoText>
                </td>
                {comparisonResults.map(result => (
                  <td
                    key={result.displayKey}
                    className={getBest('qfafRequired') === result.strategyId ? 'winner' : ''}
                  >
                    {formatCurrency(result.qfafRequired)}
                  </td>
                ))}
              </tr>

              <tr>
                <td>
                  <InfoText contentKey="total-exposure">Total Exposure</InfoText>
                </td>
                {comparisonResults.map(result => (
                  <td
                    key={result.displayKey}
                    className={getBest('totalExposure') === result.strategyId ? 'winner' : ''}
                  >
                    {formatCurrency(result.totalExposure)}
                  </td>
                ))}
              </tr>

              <tr>
                <td>
                  <InfoText contentKey="col-tax-savings">Year 1 Tax Savings</InfoText>
                </td>
                {comparisonResults.map(result => (
                  <td
                    key={result.displayKey}
                    className={getBest('year1TaxSavings') === result.strategyId ? 'winner' : ''}
                  >
                    {formatCurrency(result.year1TaxSavings)}
                  </td>
                ))}
              </tr>

              <tr>
                <td>
                  <InfoText contentKey="total-tax-savings">{years}-Year Tax Savings</InfoText>
                </td>
                {comparisonResults.map(result => (
                  <td
                    key={result.displayKey}
                    className={getBest('tenYearTaxSavings') === result.strategyId ? 'winner' : ''}
                  >
                    {formatCurrency(result.tenYearTaxSavings)}
                  </td>
                ))}
              </tr>

              <tr>
                <td>
                  <InfoText contentKey="effective-tax-alpha">Tax Alpha</InfoText>
                </td>
                {comparisonResults.map(result => (
                  <td
                    key={result.displayKey}
                    className={getBest('taxAlpha') === result.strategyId ? 'winner' : ''}
                  >
                    {formatPercent(result.taxAlpha)}
                  </td>
                ))}
              </tr>

              <tr>
                <td>
                  <InfoText contentKey="comp-tracking-error">Tracking Error</InfoText>
                </td>
                {comparisonResults.map(result => (
                  <td key={result.displayKey}>{result.trackingErrorDisplay}</td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {comparisonResults.length >= 2 && (
        <div className="comparison-summary">
          <p>
            <strong>Best for Tax Savings:</strong>{' '}
            {(() => {
              const bestId = getBest('tenYearTaxSavings');
              const best = comparisonResults.find(r => r.strategyId === bestId);
              if (!best) return 'N/A';
              return `${best.strategyName} (${best.sizingMode})`;
            })()}
          </p>
          <p>
            <strong>Most Capital Efficient:</strong>{' '}
            {(() => {
              const bestId = getBest('qfafRequired');
              const best = comparisonResults.find(r => r.strategyId === bestId);
              if (!best) return 'N/A';
              return `${best.strategyName} (${best.sizingMode})`;
            })()}{' '}
            (lowest QFAF required)
          </p>
        </div>
      )}
    </div>
  );
});
