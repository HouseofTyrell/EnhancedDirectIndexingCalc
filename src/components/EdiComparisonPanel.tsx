import { useState } from 'react';
import type {
  EdiPinnedScenario,
  EdiPinnedAssumptions,
  EdiPinnedTaxRates,
  EdiPinnedResults,
  ComparisonMetric,
  InputChange,
} from '../types';
import { getStrategy } from '../strategyData';
import { formatCurrency, formatPercent, formatCurrencyAbbreviated } from '../utils/formatters';
import './EdiComparisonPanel.css';

interface EdiComparisonPanelProps {
  pinned: EdiPinnedScenario;
  currentAssumptions: EdiPinnedAssumptions;
  currentTaxRates: EdiPinnedTaxRates;
  currentResults: EdiPinnedResults;
  onUnpin: () => void;
  onReplacePin: () => void;
}

function detectEdiChanges(
  pinned: EdiPinnedAssumptions,
  current: EdiPinnedAssumptions,
  pinnedTax: EdiPinnedTaxRates,
  currentTax: EdiPinnedTaxRates
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

  if (pinned.collateralValue !== current.collateralValue) {
    changes.push({
      label: 'Collateral',
      pinnedDisplay: formatCurrency(pinned.collateralValue),
      currentDisplay: formatCurrency(current.collateralValue),
    });
  }

  if (pinned.annualReturn !== current.annualReturn) {
    changes.push({
      label: 'Annual Return',
      pinnedDisplay: formatPercent(pinned.annualReturn),
      currentDisplay: formatPercent(current.annualReturn),
    });
  }

  if (pinned.washSaleRate !== current.washSaleRate) {
    changes.push({
      label: 'Wash Sale',
      pinnedDisplay: formatPercent(pinned.washSaleRate, 0),
      currentDisplay: formatPercent(current.washSaleRate, 0),
    });
  }

  if (pinned.existingStCarryforward !== current.existingStCarryforward) {
    changes.push({
      label: 'ST Carryforward',
      pinnedDisplay: formatCurrency(pinned.existingStCarryforward),
      currentDisplay: formatCurrency(current.existingStCarryforward),
    });
  }

  if (pinned.existingLtCarryforward !== current.existingLtCarryforward) {
    changes.push({
      label: 'LT Carryforward',
      pinnedDisplay: formatCurrency(pinned.existingLtCarryforward),
      currentDisplay: formatCurrency(current.existingLtCarryforward),
    });
  }

  if (pinned.projectionYears !== current.projectionYears) {
    changes.push({
      label: 'Years',
      pinnedDisplay: `${pinned.projectionYears}`,
      currentDisplay: `${current.projectionYears}`,
    });
  }

  if (pinnedTax.stateCode !== currentTax.stateCode) {
    changes.push({
      label: 'State',
      pinnedDisplay: pinnedTax.stateCode,
      currentDisplay: currentTax.stateCode,
    });
  }

  if (pinnedTax.filingStatus !== currentTax.filingStatus) {
    changes.push({
      label: 'Filing Status',
      pinnedDisplay: pinnedTax.filingStatus,
      currentDisplay: currentTax.filingStatus,
    });
  }

  if (pinnedTax.combinedStRate !== currentTax.combinedStRate) {
    changes.push({
      label: 'ST Rate',
      pinnedDisplay: formatPercent(pinnedTax.combinedStRate),
      currentDisplay: formatPercent(currentTax.combinedStRate),
    });
  }

  if (pinnedTax.combinedLtRate !== currentTax.combinedLtRate) {
    changes.push({
      label: 'LT Rate',
      pinnedDisplay: formatPercent(pinnedTax.combinedLtRate),
      currentDisplay: formatPercent(currentTax.combinedLtRate),
    });
  }

  return changes;
}

function buildEdiMetrics(
  pinned: EdiPinnedResults,
  current: EdiPinnedResults
): ComparisonMetric[] {
  const metrics: { label: string; pv: number; cv: number; format: 'currency' | 'percent'; higherIsBetter: boolean }[] = [
    { label: 'Potential Tax Savings', pv: pinned.totalTaxSavings, cv: current.totalTaxSavings, format: 'currency', higherIsBetter: true },
    { label: 'Carryforward Built', pv: pinned.totalCarryforwardBuilt, cv: current.totalCarryforwardBuilt, format: 'currency', higherIsBetter: true },
    { label: 'Final ST Carryforward', pv: pinned.finalStCarryforward, cv: current.finalStCarryforward, format: 'currency', higherIsBetter: true },
    { label: 'Final LT Carryforward', pv: pinned.finalLtCarryforward, cv: current.finalLtCarryforward, format: 'currency', higherIsBetter: true },
    { label: 'Embedded Gain %', pv: pinned.finalEmbeddedGainPct, cv: current.finalEmbeddedGainPct, format: 'percent', higherIsBetter: false },
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
  if (!metric.higherIsBetter) {
    return metric.delta < 0 ? 'comparison-delta--positive' : 'comparison-delta--negative';
  }
  return metric.delta > 0 ? 'comparison-delta--positive' : 'comparison-delta--negative';
}

export function EdiComparisonPanel({
  pinned,
  currentAssumptions,
  currentTaxRates,
  currentResults,
  onUnpin,
  onReplacePin,
}: EdiComparisonPanelProps) {
  const [collapsed, setCollapsed] = useState(false);

  const inputChanges = detectEdiChanges(
    pinned.assumptions,
    currentAssumptions,
    pinned.taxRates,
    currentTaxRates
  );
  const metrics = buildEdiMetrics(pinned.results, currentResults);

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
              <span className="comparison-changes__label">Changed:</span>
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
