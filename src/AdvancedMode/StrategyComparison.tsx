import { memo, useMemo } from 'react';
import { STRATEGIES, getStrategy } from '../strategyData';
import { calculate } from '../calculations';
import { CalculatorInputs, ComparisonResult } from '../types';
import { InfoText } from '../InfoPopup';
import { formatCurrency, formatPercent } from '../utils/formatters';

interface StrategyComparisonProps {
  baseInputs: CalculatorInputs;
  selectedStrategies: string[];
  onChange: (strategies: string[]) => void;
}

export const StrategyComparison = memo(function StrategyComparison({
  baseInputs,
  selectedStrategies,
  onChange,
}: StrategyComparisonProps) {
  // Calculate results for each selected strategy
  const comparisonResults = useMemo((): ComparisonResult[] => {
    return selectedStrategies
      .map(strategyId => {
        const strategy = getStrategy(strategyId);
        if (!strategy) {
          return null;
        }

        // Calculate with this strategy
        const inputs = { ...baseInputs, strategyId };
        const results = calculate(inputs);

        return {
          strategyId,
          strategyName: strategy.name,
          strategyType: strategy.type,
          qfafRequired: results.sizing.qfafValue,
          totalExposure: results.sizing.totalExposure,
          year1TaxSavings: results.years[0]?.taxSavings || 0,
          tenYearTaxSavings: results.summary.totalTaxSavings,
          taxAlpha: results.summary.effectiveTaxAlpha,
          trackingErrorDisplay: strategy.trackingErrorDisplay,
        };
      })
      .filter((r): r is ComparisonResult => r !== null);
  }, [baseInputs, selectedStrategies]);

  // Find the best strategy for each metric
  const getBest = (metric: keyof ComparisonResult): string | null => {
    if (comparisonResults.length === 0) return null;

    let best = comparisonResults[0];
    for (const result of comparisonResults) {
      const currentValue = result[metric];
      const bestValue = best[metric];

      if (typeof currentValue === 'number' && typeof bestValue === 'number') {
        // For taxAlpha and tax savings, higher is better
        // For qfafRequired and totalExposure, lower is better (more efficient)
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
      // Remove if already selected (min 1)
      if (selectedStrategies.length > 1) {
        onChange(selectedStrategies.filter(id => id !== strategyId));
      }
    } else {
      // Add if not selected (max 3)
      if (selectedStrategies.length < 3) {
        onChange([...selectedStrategies, strategyId]);
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
                  <th key={result.strategyId}>
                    <div className="strategy-name">{result.strategyName}</div>
                    <div className="strategy-type">{result.strategyType}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className={getBest('qfafRequired') ? 'has-winner' : ''}>
                <td>
                  <InfoText contentKey="comp-qfaf-required">
                    QFAF Required
                  </InfoText>
                </td>
                {comparisonResults.map(result => (
                  <td
                    key={result.strategyId}
                    className={getBest('qfafRequired') === result.strategyId ? 'winner' : ''}
                  >
                    {formatCurrency(result.qfafRequired)}
                  </td>
                ))}
              </tr>

              <tr>
                <td>
                  <InfoText contentKey="total-exposure">
                    Total Exposure
                  </InfoText>
                </td>
                {comparisonResults.map(result => (
                  <td
                    key={result.strategyId}
                    className={getBest('totalExposure') === result.strategyId ? 'winner' : ''}
                  >
                    {formatCurrency(result.totalExposure)}
                  </td>
                ))}
              </tr>

              <tr>
                <td>
                  <InfoText contentKey="col-tax-savings">
                    Year 1 Tax Savings
                  </InfoText>
                </td>
                {comparisonResults.map(result => (
                  <td
                    key={result.strategyId}
                    className={getBest('year1TaxSavings') === result.strategyId ? 'winner' : ''}
                  >
                    {formatCurrency(result.year1TaxSavings)}
                  </td>
                ))}
              </tr>

              <tr>
                <td>
                  <InfoText contentKey="total-tax-savings">
                    10-Year Tax Savings
                  </InfoText>
                </td>
                {comparisonResults.map(result => (
                  <td
                    key={result.strategyId}
                    className={getBest('tenYearTaxSavings') === result.strategyId ? 'winner' : ''}
                  >
                    {formatCurrency(result.tenYearTaxSavings)}
                  </td>
                ))}
              </tr>

              <tr>
                <td>
                  <InfoText contentKey="effective-tax-alpha">
                    Tax Alpha
                  </InfoText>
                </td>
                {comparisonResults.map(result => (
                  <td
                    key={result.strategyId}
                    className={getBest('taxAlpha') === result.strategyId ? 'winner' : ''}
                  >
                    {formatPercent(result.taxAlpha)}
                  </td>
                ))}
              </tr>

              <tr>
                <td>
                  <InfoText contentKey="comp-tracking-error">
                    Tracking Error
                  </InfoText>
                </td>
                {comparisonResults.map(result => (
                  <td key={result.strategyId}>{result.trackingErrorDisplay}</td>
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
            {getStrategy(getBest('tenYearTaxSavings') || '')?.name || 'N/A'}
          </p>
          <p>
            <strong>Most Capital Efficient:</strong>{' '}
            {getStrategy(getBest('qfafRequired') || '')?.name || 'N/A'} (lowest QFAF required)
          </p>
        </div>
      )}
    </div>
  );
});
