import { useState } from 'react';
import {
  PinnedScenario,
  CalculatorInputs,
  AdvancedSettings,
  CalculationResult,
} from '../types';
import { getStrategy } from '../strategyData';
import { formatCurrency, formatPercent, formatCurrencyAbbreviated } from '../utils/formatters';
import './ScenarioComparisonPanel.css';

// ============================================
// MULTI-SCENARIO COMPARISON PANEL
// ============================================

interface ScenarioComparisonPanelProps {
  scenarios: PinnedScenario[];
  currentInputs: CalculatorInputs;
  currentSettings: AdvancedSettings;
  currentResults: CalculationResult;
  canPin: boolean;
  onPin: () => void;
  onUnpin: (id: string) => void;
  onUnpinAll: () => void;
}

// ============================================
// LEGACY SINGLE-SCENARIO PROPS (backward compat)
// ============================================

interface LegacyScenarioComparisonPanelProps {
  pinned: PinnedScenario;
  currentInputs: CalculatorInputs;
  currentSettings: AdvancedSettings;
  currentResults: CalculationResult;
  onUnpin: () => void;
  onRestore: () => void;
  onReplacePin: () => void;
}

// ============================================
// METRIC DEFINITIONS
// ============================================

interface MetricDef {
  label: string;
  getValue: (results: CalculationResult) => number;
  format: 'currency' | 'percent';
  higherIsBetter: boolean;
}

const METRIC_DEFS: MetricDef[] = [
  { label: 'Total Tax Savings', getValue: r => r.summary.totalTaxSavings, format: 'currency', higherIsBetter: true },
  { label: 'Year 1 Savings', getValue: r => r.years[0]?.taxSavings ?? 0, format: 'currency', higherIsBetter: true },
  { label: 'Year 2 Savings', getValue: r => r.years[1]?.taxSavings ?? 0, format: 'currency', higherIsBetter: true },
  { label: 'Tax Alpha', getValue: r => r.summary.effectiveTaxAlpha, format: 'percent', higherIsBetter: true },
  { label: 'QFAF Value', getValue: r => r.sizing.qfafValue, format: 'currency', higherIsBetter: false },
  { label: 'Total Exposure', getValue: r => r.sizing.totalExposure, format: 'currency', higherIsBetter: false },
  { label: 'Final Portfolio', getValue: r => r.summary.finalPortfolioValue, format: 'currency', higherIsBetter: true },
  { label: 'Total NOL', getValue: r => r.summary.totalNolGenerated, format: 'currency', higherIsBetter: true },
];

// ============================================
// SCENARIO SUMMARY (key config for column header)
// ============================================

interface ScenarioSummary {
  strategy: string;
  sizingMode: string;
  collateral: string;
  duration: string;
  qfafEnabled: boolean;
}

function getScenarioSummary(inputs: CalculatorInputs): ScenarioSummary {
  const strategy = getStrategy(inputs.strategyId);
  return {
    strategy: strategy?.name ?? inputs.strategyId,
    sizingMode: inputs.qfafSizingMode === 'dynamic' ? 'Dynamic' : 'Fixed',
    collateral: formatCurrencyAbbreviated(inputs.collateralAmount),
    duration: `${inputs.qfafDuration}yr`,
    qfafEnabled: inputs.qfafEnabled,
  };
}

// ============================================
// HELPERS
// ============================================

function formatMetricValue(value: number, format: 'currency' | 'percent'): string {
  if (format === 'percent') return formatPercent(value);
  return formatCurrencyAbbreviated(value);
}

function getBestIndex(values: number[], higherIsBetter: boolean): number {
  if (values.length === 0) return -1;
  let bestIdx = 0;
  for (let i = 1; i < values.length; i++) {
    if (higherIsBetter ? values[i] > values[bestIdx] : values[i] < values[bestIdx]) {
      bestIdx = i;
    }
  }
  return bestIdx;
}

// ============================================
// DETECT KEY DIFFERENCES ACROSS SCENARIOS
// ============================================

function detectKeyDifferences(scenarios: PinnedScenario[]): string[] {
  if (scenarios.length < 2) return [];
  const diffs: string[] = [];

  const strategies = new Set(scenarios.map(s => s.inputs.strategyId));
  if (strategies.size > 1) diffs.push('Strategy');

  const modes = new Set(scenarios.map(s => s.inputs.qfafSizingMode));
  if (modes.size > 1) diffs.push('Sizing Mode');

  const durations = new Set(scenarios.map(s => s.inputs.qfafDuration));
  if (durations.size > 1) diffs.push('Duration');

  const collaterals = new Set(scenarios.map(s => s.inputs.collateralAmount));
  if (collaterals.size > 1) diffs.push('Collateral');

  const qfafStates = new Set(scenarios.map(s => s.inputs.qfafEnabled));
  if (qfafStates.size > 1) diffs.push('QFAF');

  const states = new Set(scenarios.map(s => s.inputs.stateCode));
  if (states.size > 1) diffs.push('State');

  const incomes = new Set(scenarios.map(s => s.inputs.annualIncome));
  if (incomes.size > 1) diffs.push('Income');

  const ltGains = new Set(scenarios.map(s => s.inputs.ltGainsEnabled));
  if (ltGains.size > 1) diffs.push('LT Gains');

  return diffs;
}

// ============================================
// MAIN COMPONENT
// ============================================

export function ScenarioComparisonPanel(props: ScenarioComparisonPanelProps | LegacyScenarioComparisonPanelProps) {
  // Handle legacy single-scenario props
  if ('pinned' in props) {
    return <LegacyPanel {...props} />;
  }
  return <MultiScenarioPanel {...props} />;
}

function MultiScenarioPanel({
  scenarios,
  currentInputs,
  currentSettings,
  currentResults,
  canPin,
  onPin,
  onUnpin,
  onUnpinAll,
}: ScenarioComparisonPanelProps) {
  const [collapsed, setCollapsed] = useState(false);

  const keyDiffs = detectKeyDifferences(scenarios);
  const scenarioCount = scenarios.length;

  return (
    <div className="comparison-panel">
      <div className="comparison-panel__header">
        <div className="comparison-panel__title">
          <span className="comparison-panel__pin-icon">&#128204;</span>
          <span>
            Scenario Comparison <strong>({scenarioCount}/4)</strong>
          </span>
          {keyDiffs.length > 0 && (
            <span className="comparison-panel__diffs">
              Varying: {keyDiffs.join(', ')}
            </span>
          )}
        </div>
        <div className="comparison-panel__actions">
          {canPin && (
            <button className="comparison-btn comparison-btn--repin" onClick={onPin} title="Pin current state as a new scenario">
              + Pin Current
            </button>
          )}
          <button className="comparison-btn comparison-btn--clear" onClick={onUnpinAll} title="Remove all pinned scenarios">
            Clear All
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
          <div className="comparison-table-wrapper">
            <table className="comparison-table comparison-table--multi">
              <thead>
                <tr>
                  <th className="comparison-table__corner">Metric</th>
                  {scenarios.map((s, i) => {
                    const summary = getScenarioSummary(s.inputs);
                    return (
                      <th key={s.id} className="comparison-table__scenario-header">
                        <div className="scenario-header">
                          <div className="scenario-header__number">{i + 1}</div>
                          <div className="scenario-header__details">
                            <div className="scenario-header__strategy">{summary.strategy}</div>
                            <div className="scenario-header__config">
                              {summary.qfafEnabled && (
                                <span className={`scenario-tag scenario-tag--${summary.sizingMode.toLowerCase()}`}>
                                  {summary.sizingMode}
                                </span>
                              )}
                              {!summary.qfafEnabled && (
                                <span className="scenario-tag scenario-tag--no-qfaf">No QFAF</span>
                              )}
                              <span className="scenario-header__meta">{summary.collateral}</span>
                              {summary.qfafEnabled && (
                                <span className="scenario-header__meta">{summary.duration}</span>
                              )}
                            </div>
                          </div>
                          <button
                            className="scenario-header__remove"
                            onClick={() => onUnpin(s.id)}
                            title="Remove this scenario"
                            aria-label={`Remove scenario ${i + 1}`}
                          >
                            &times;
                          </button>
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {METRIC_DEFS.map(metric => {
                  const values = scenarios.map(s => metric.getValue(s.results));
                  const bestIdx = metric.higherIsBetter ? getBestIndex(values, true) : -1;

                  return (
                    <tr key={metric.label}>
                      <td className="comparison-table__label">{metric.label}</td>
                      {values.map((val, i) => (
                        <td
                          key={scenarios[i].id}
                          className={`comparison-table__value${i === bestIdx ? ' comparison-table__value--best' : ''}`}
                        >
                          {formatMetricValue(val, metric.format)}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================
// LEGACY SINGLE-SCENARIO PANEL (backward compat)
// ============================================

function LegacyPanel({
  pinned,
  currentInputs,
  currentSettings,
  currentResults,
  onUnpin,
  onRestore,
  onReplacePin,
}: LegacyScenarioComparisonPanelProps) {
  const [collapsed, setCollapsed] = useState(false);

  const metrics = METRIC_DEFS.map(m => {
    const pv = m.getValue(pinned.results);
    const cv = m.getValue(currentResults);
    const delta = cv - pv;
    const deltaPercent = pv !== 0 ? delta / Math.abs(pv) : 0;
    return { ...m, pinnedValue: pv, currentValue: cv, delta, deltaPercent };
  });

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
              {metrics.map(metric => {
                const deltaClass = metric.delta === 0 ? '' :
                  !metric.higherIsBetter ? 'comparison-delta--neutral' :
                  metric.delta > 0 ? 'comparison-delta--positive' : 'comparison-delta--negative';
                const sign = metric.delta > 0 ? '+' : metric.delta < 0 ? '-' : '';
                let deltaStr = '—';
                if (metric.delta !== 0) {
                  if (metric.format === 'percent') {
                    deltaStr = `${sign}${Math.abs(metric.delta * 100).toFixed(2)}pp`;
                  } else {
                    const pctStr = metric.pinnedValue !== 0
                      ? ` (${sign}${Math.abs(metric.deltaPercent * 100).toFixed(0)}%)`
                      : '';
                    deltaStr = `${sign}${formatCurrencyAbbreviated(Math.abs(metric.delta))}${pctStr}`;
                  }
                }

                return (
                  <tr key={metric.label}>
                    <td className="comparison-table__label">{metric.label}</td>
                    <td className="comparison-table__value">{formatMetricValue(metric.pinnedValue, metric.format)}</td>
                    <td className="comparison-table__value">{formatMetricValue(metric.currentValue, metric.format)}</td>
                    <td className={`comparison-table__delta ${deltaClass}`}>{deltaStr}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
