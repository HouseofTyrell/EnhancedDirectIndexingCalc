import { useState } from 'react';
import {
  CalculatorInputs,
  AdvancedSettings,
  CalculationResult,
  PinnedScenario,
  ComparisonMetric,
  InputChange,
  FILING_STATUSES,
} from '../types';
import { getStrategy } from '../strategyData';
import { formatCurrency, formatPercent, formatCurrencyAbbreviated } from '../utils/formatters';
import './ScenarioComparisonPanel.css';

interface ScenarioComparisonPanelProps {
  pinned: PinnedScenario;
  currentInputs: CalculatorInputs;
  currentSettings: AdvancedSettings;
  currentResults: CalculationResult;
  onUnpin: () => void;
  onRestore: () => void;
  onReplacePin: () => void;
}

function getFilingStatusLabel(value: string): string {
  return FILING_STATUSES.find(fs => fs.value === value)?.label ?? value;
}

function detectInputChanges(
  pinned: CalculatorInputs,
  current: CalculatorInputs,
  pinnedSettings: AdvancedSettings,
  currentSettings: AdvancedSettings
): InputChange[] {
  const changes: InputChange[] = [];

  if (pinned.strategyId !== current.strategyId) {
    const pinnedStrategy = getStrategy(pinned.strategyId);
    const currentStrategy = getStrategy(current.strategyId);
    changes.push({
      label: 'Strategy',
      pinnedDisplay: pinnedStrategy?.name ?? pinned.strategyId,
      currentDisplay: currentStrategy?.name ?? current.strategyId,
    });
  }

  if (pinned.annualIncome !== current.annualIncome) {
    changes.push({
      label: 'Income',
      pinnedDisplay: formatCurrency(pinned.annualIncome),
      currentDisplay: formatCurrency(current.annualIncome),
    });
  }

  if (pinned.collateralAmount !== current.collateralAmount) {
    changes.push({
      label: 'Collateral',
      pinnedDisplay: formatCurrency(pinned.collateralAmount),
      currentDisplay: formatCurrency(current.collateralAmount),
    });
  }

  if (pinned.stateCode !== current.stateCode) {
    changes.push({
      label: 'State',
      pinnedDisplay: pinned.stateCode,
      currentDisplay: current.stateCode,
    });
  }

  if (pinned.filingStatus !== current.filingStatus) {
    changes.push({
      label: 'Filing Status',
      pinnedDisplay: getFilingStatusLabel(pinned.filingStatus),
      currentDisplay: getFilingStatusLabel(current.filingStatus),
    });
  }

  if (pinned.qfafEnabled !== current.qfafEnabled) {
    changes.push({
      label: 'QFAF',
      pinnedDisplay: pinned.qfafEnabled ? 'Enabled' : 'Disabled',
      currentDisplay: current.qfafEnabled ? 'Enabled' : 'Disabled',
    });
  }

  if (pinnedSettings.projectionYears !== currentSettings.projectionYears) {
    changes.push({
      label: 'Years',
      pinnedDisplay: `${pinnedSettings.projectionYears}`,
      currentDisplay: `${currentSettings.projectionYears}`,
    });
  }

  if (pinnedSettings.washSaleDisallowanceRate !== currentSettings.washSaleDisallowanceRate) {
    changes.push({
      label: 'Wash Sale',
      pinnedDisplay: formatPercent(pinnedSettings.washSaleDisallowanceRate, 0),
      currentDisplay: formatPercent(currentSettings.washSaleDisallowanceRate, 0),
    });
  }

  return changes;
}

function buildMetrics(
  pinned: CalculationResult,
  current: CalculationResult
): ComparisonMetric[] {
  const metrics: { label: string; pv: number; cv: number; format: 'currency' | 'percent'; higherIsBetter: boolean }[] = [
    { label: 'Total Tax Savings', pv: pinned.summary.totalTaxSavings, cv: current.summary.totalTaxSavings, format: 'currency', higherIsBetter: true },
    { label: 'Year 1 Tax Savings', pv: pinned.years[0]?.taxSavings ?? 0, cv: current.years[0]?.taxSavings ?? 0, format: 'currency', higherIsBetter: true },
    { label: 'Year 2 Tax Savings', pv: pinned.years[1]?.taxSavings ?? 0, cv: current.years[1]?.taxSavings ?? 0, format: 'currency', higherIsBetter: true },
    { label: 'Annualized Tax Alpha', pv: pinned.summary.effectiveTaxAlpha, cv: current.summary.effectiveTaxAlpha, format: 'percent', higherIsBetter: true },
    { label: 'QFAF Value', pv: pinned.sizing.qfafValue, cv: current.sizing.qfafValue, format: 'currency', higherIsBetter: false },
    { label: 'Total Exposure', pv: pinned.sizing.totalExposure, cv: current.sizing.totalExposure, format: 'currency', higherIsBetter: false },
    { label: 'Final Portfolio Value', pv: pinned.summary.finalPortfolioValue, cv: current.summary.finalPortfolioValue, format: 'currency', higherIsBetter: true },
    { label: 'Total NOL Generated', pv: pinned.summary.totalNolGenerated, cv: current.summary.totalNolGenerated, format: 'currency', higherIsBetter: true },
  ];

  return metrics.map(m => {
    const delta = m.cv - m.pv;
    const deltaPercent = m.pv !== 0 ? delta / Math.abs(m.pv) : 0;
    return {
      label: m.label,
      pinnedValue: m.pv,
      currentValue: m.cv,
      delta,
      deltaPercent,
      format: m.format,
      higherIsBetter: m.higherIsBetter,
    };
  });
}

function formatMetricValue(value: number, format: 'currency' | 'percent'): string {
  if (format === 'percent') return formatPercent(value);
  return formatCurrencyAbbreviated(value);
}

function formatDelta(metric: ComparisonMetric): string {
  const sign = metric.delta > 0 ? '+' : metric.delta < 0 ? '-' : '';
  const pctSign = metric.deltaPercent > 0 ? '+' : metric.deltaPercent < 0 ? '-' : '';
  if (metric.format === 'percent') {
    return `${sign}${Math.abs(metric.delta * 100).toFixed(2)}pp`;
  }
  const absDelta = Math.abs(metric.delta);
  const pctStr = metric.pinnedValue !== 0
    ? ` (${pctSign}${Math.abs(metric.deltaPercent * 100).toFixed(0)}%)`
    : '';
  return `${sign}${formatCurrencyAbbreviated(absDelta)}${pctStr}`;
}

function getDeltaClass(metric: ComparisonMetric): string {
  if (metric.delta === 0) return '';
  if (!metric.higherIsBetter) return 'comparison-delta--neutral';
  return metric.delta > 0 ? 'comparison-delta--positive' : 'comparison-delta--negative';
}

export function ScenarioComparisonPanel({
  pinned,
  currentInputs,
  currentSettings,
  currentResults,
  onUnpin,
  onRestore,
  onReplacePin,
}: ScenarioComparisonPanelProps) {
  const [collapsed, setCollapsed] = useState(false);

  const inputChanges = detectInputChanges(
    pinned.inputs,
    currentInputs,
    pinned.advancedSettings,
    currentSettings
  );
  const metrics = buildMetrics(pinned.results, currentResults);

  const pinnedAge = Date.now() - pinned.pinnedAt;
  const pinnedAgo = pinnedAge < 60_000
    ? 'just now'
    : pinnedAge < 3_600_000
      ? `${Math.floor(pinnedAge / 60_000)}m ago`
      : `${Math.floor(pinnedAge / 3_600_000)}h ago`;

  return (
    <div className="comparison-panel">
      <div className="comparison-panel__header">
        <div className="comparison-panel__title">
          <span className="comparison-panel__pin-icon">&#128204;</span>
          <span>
            Comparing with: <strong>{pinned.label}</strong>
          </span>
          <span className="comparison-panel__age">{pinnedAgo}</span>
        </div>
        <div className="comparison-panel__actions">
          <button className="comparison-btn comparison-btn--restore" onClick={onRestore} title="Restore pinned inputs">
            Restore
          </button>
          <button className="comparison-btn comparison-btn--repin" onClick={onReplacePin} title="Replace pin with current state">
            Re-pin
          </button>
          <button className="comparison-btn comparison-btn--clear" onClick={onUnpin} title="Remove pin">
            Clear
          </button>
          <button
            className="comparison-btn comparison-btn--toggle"
            onClick={() => setCollapsed(c => !c)}
            aria-label={collapsed ? 'Expand comparison' : 'Collapse comparison'}
          >
            {collapsed ? '\u25BC' : '\u25B2'}
          </button>
        </div>
      </div>

      {!collapsed && (
        <div className="comparison-panel__body">
          {inputChanges.length > 0 && (
            <div className="comparison-changes">
              <span className="comparison-changes__label">Changed Inputs:</span>
              <div className="comparison-changes__pills">
                {inputChanges.map(change => (
                  <span key={change.label} className="comparison-pill">
                    <span className="comparison-pill__label">{change.label}:</span>
                    <span className="comparison-pill__old">{change.pinnedDisplay}</span>
                    <span className="comparison-pill__arrow">&rarr;</span>
                    <span className="comparison-pill__new">{change.currentDisplay}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          <table className="comparison-table">
            <thead>
              <tr>
                <th>Metric</th>
                <th>Pinned</th>
                <th>Current</th>
                <th>Difference</th>
              </tr>
            </thead>
            <tbody>
              {metrics.map(metric => (
                <tr key={metric.label}>
                  <td className="comparison-table__label">{metric.label}</td>
                  <td className="comparison-table__value">{formatMetricValue(metric.pinnedValue, metric.format)}</td>
                  <td className="comparison-table__value">{formatMetricValue(metric.currentValue, metric.format)}</td>
                  <td className={`comparison-table__delta ${getDeltaClass(metric)}`}>
                    {metric.delta !== 0 ? formatDelta(metric) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
