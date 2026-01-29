import { memo, useMemo } from 'react';
import { CalculatorInputs, AdvancedSettings, DEFAULT_SCENARIOS, ScenarioType } from '../types';
import { calculate } from '../calculations';
import { formatCurrency, formatPercent } from '../utils/formatters';

interface ScenarioAnalysisProps {
  inputs: CalculatorInputs;
  settings: AdvancedSettings;
}

interface ScenarioResult {
  type: ScenarioType;
  label: string;
  probability: number;
  returnRate: number;
  totalTaxSavings: number;
  finalPortfolioValue: number;
  effectiveTaxAlpha: number;
  totalNolGenerated: number;
}

export const ScenarioAnalysis = memo(function ScenarioAnalysis({ inputs, settings }: ScenarioAnalysisProps) {
  const scenarios = useMemo(() => {
    const results: ScenarioResult[] = [];

    for (const [type, params] of Object.entries(DEFAULT_SCENARIOS)) {
      // Run calculation with scenario-specific return rate
      const scenarioSettings: AdvancedSettings = {
        ...settings,
        defaultAnnualReturn: params.return,
      };

      const result = calculate(inputs, scenarioSettings);

      results.push({
        type: type as ScenarioType,
        label: params.label,
        probability: params.probability,
        returnRate: params.return,
        totalTaxSavings: result.summary.totalTaxSavings,
        finalPortfolioValue: result.summary.finalPortfolioValue,
        effectiveTaxAlpha: result.summary.effectiveTaxAlpha,
        totalNolGenerated: result.summary.totalNolGenerated,
      });
    }

    return results;
  }, [inputs, settings]);

  // Calculate expected (probability-weighted) values
  const expectedValues = useMemo(() => {
    return {
      taxSavings: scenarios.reduce((sum, s) => sum + s.totalTaxSavings * s.probability, 0),
      portfolioValue: scenarios.reduce((sum, s) => sum + s.finalPortfolioValue * s.probability, 0),
      taxAlpha: scenarios.reduce((sum, s) => sum + s.effectiveTaxAlpha * s.probability, 0),
    };
  }, [scenarios]);

  return (
    <div className="scenario-analysis">
      <p className="section-description">
        Compare strategy outcomes across different market conditions. Expected values are
        probability-weighted (25% bull, 50% base, 25% bear).
      </p>

      <div className="scenario-table-container">
        <table className="scenario-table">
          <thead>
            <tr>
              <th>Metric</th>
              {scenarios.map(s => (
                <th key={s.type} className={`scenario-${s.type}`}>
                  {s.label}
                  <span className="scenario-return">{formatPercent(s.returnRate)}/yr</span>
                </th>
              ))}
              <th className="scenario-expected">
                Expected
                <span className="scenario-return">Weighted</span>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>10-Year Tax Savings</td>
              {scenarios.map(s => (
                <td key={s.type} className={`scenario-${s.type}`}>
                  {formatCurrency(s.totalTaxSavings)}
                </td>
              ))}
              <td className="scenario-expected">{formatCurrency(expectedValues.taxSavings)}</td>
            </tr>
            <tr>
              <td>Final Portfolio Value</td>
              {scenarios.map(s => (
                <td key={s.type} className={`scenario-${s.type}`}>
                  {formatCurrency(s.finalPortfolioValue)}
                </td>
              ))}
              <td className="scenario-expected">{formatCurrency(expectedValues.portfolioValue)}</td>
            </tr>
            <tr>
              <td>Annualized Tax Alpha</td>
              {scenarios.map(s => (
                <td key={s.type} className={`scenario-${s.type}`}>
                  {formatPercent(s.effectiveTaxAlpha)}
                </td>
              ))}
              <td className="scenario-expected">{formatPercent(expectedValues.taxAlpha)}</td>
            </tr>
            <tr>
              <td>Total NOL Generated</td>
              {scenarios.map(s => (
                <td key={s.type} className={`scenario-${s.type}`}>
                  {formatCurrency(s.totalNolGenerated)}
                </td>
              ))}
              <td className="scenario-expected">—</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="scenario-notes">
        <p>
          <strong>Note:</strong> Bear markets may increase tax-loss harvesting opportunities while
          reducing portfolio growth. Bull markets grow the portfolio faster but may reduce relative
          tax alpha.
        </p>
      </div>
    </div>
  );
});
