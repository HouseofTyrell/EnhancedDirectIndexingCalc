import { useReducer, useCallback, useMemo, useState } from 'react';
import { FilingStatus } from '../types';
import { STRATEGIES } from '../strategyData';
import { formatWithCommas, parseFormattedNumber, formatCurrency } from '../utils/formatters';
import {
  computeEdiProjection,
  getDefaultScenarios,
  computeScenarioResults,
  calculateUnwindAnalysis,
  calculateEstateComparison,
  type EdiYearResult,
  type EdiProjectionInput,
} from '../calculations/ediOnly';
import './EdiOnlyTab.css';

interface EdiOnlyTabProps {
  filingStatus: FilingStatus;
  combinedStRate: number;
  combinedLtRate: number;
  stateCode?: string;
}

interface EdiAssumptions {
  strategyId: string;
  collateralValue: number;
  annualReturn: number;
  washSaleRate: number;
  existingStCarryforward: number;
  existingLtCarryforward: number;
  projectionYears: number;
}

const DEFAULT_ASSUMPTIONS: EdiAssumptions = {
  strategyId: 'overlay-45-45',
  collateralValue: 10_000_000,
  annualReturn: 0.07,
  washSaleRate: 0,
  existingStCarryforward: 0,
  existingLtCarryforward: 0,
  projectionYears: 10,
};

type State = { assumptions: EdiAssumptions };
type Action =
  | { type: 'UPDATE'; field: keyof EdiAssumptions; value: number | string }
  | { type: 'RESET' };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'UPDATE':
      return { assumptions: { ...state.assumptions, [action.field]: action.value } };
    case 'RESET':
      return { assumptions: { ...DEFAULT_ASSUMPTIONS } };
    default:
      return state;
  }
}

// Row definitions for year-by-year table
interface RowDef {
  key: string;
  label: string;
  getValue: (r: EdiYearResult) => number;
  format: 'currency' | 'highlight' | 'positive' | 'negative' | 'ratio';
  rowClass?: string;
}

const ROW_DEFINITIONS: RowDef[] = [
  { key: 'collateral', label: 'Collateral Value', getValue: r => r.collateralValue, format: 'currency' },
  { key: 'stLosses', label: 'ST Losses Harvested', getValue: r => r.stLossesHarvested, format: 'negative' },
  { key: 'ltGains', label: 'LT Gains Realized', getValue: r => r.ltGainsRealized, format: 'currency' },
  { key: 'stUsed', label: 'ST Losses Offsetting LT Gains', getValue: r => r.stLossesUsedToOffsetLtGains, format: 'currency' },
  { key: 'excess', label: 'Excess ST Loss to CF', getValue: r => r.excessStLossAfterOffset, format: 'highlight', rowClass: 'row-highlight' },
  { key: 'deduction', label: '$3K Capital Loss Deduction', getValue: r => r.capitalLossDeduction, format: 'currency' },
  { key: 'taxSaved', label: 'Tax Saved (Deduction)', getValue: r => r.taxSavedByCapitalLossDeduction, format: 'positive', rowClass: 'row-positive' },
  { key: 'benefit', label: 'Net Annual Realized Benefit', getValue: r => r.annualRealizedBenefit, format: 'positive', rowClass: 'row-positive' },
  { key: 'cfEnding', label: 'Cumulative Carryforward', getValue: r => r.endingStCarryforward + r.endingLtCarryforward, format: 'highlight', rowClass: 'row-highlight' },
  { key: 'efficiency', label: 'Harvesting Efficiency (ST/LT)', getValue: r => r.harvestingEfficiency, format: 'ratio' },
];

function formatCellValue(format: RowDef['format'], value: number) {
  if (format === 'ratio') {
    if (!Number.isFinite(value)) return <span className="edi-cell-ratio">N/A</span>;
    return <span className="edi-cell-ratio">{value.toFixed(1)}x</span>;
  }
  const formatted = formatCurrency(value);
  switch (format) {
    case 'highlight': return <span className="edi-cell-highlight">{formatted}</span>;
    case 'positive': return <span className="edi-cell-positive">{formatted}</span>;
    case 'negative': return <span className="edi-cell-negative">{formatted}</span>;
    default: return formatted;
  }
}

export function EdiOnlyTab({ filingStatus, combinedStRate, combinedLtRate, stateCode }: EdiOnlyTabProps) {
  const [state, dispatch] = useReducer(reducer, null, () => ({
    assumptions: { ...DEFAULT_ASSUMPTIONS },
  }));
  const [unwindYear, setUnwindYear] = useState(5);

  const handleChange = useCallback((field: keyof EdiAssumptions, value: number | string) => {
    dispatch({ type: 'UPDATE', field, value });
  }, []);

  const handleReset = useCallback(() => {
    dispatch({ type: 'RESET' });
  }, []);

  // Compute projection
  const projectionInput: EdiProjectionInput = useMemo(() => ({
    ...state.assumptions,
    combinedStRate,
    combinedLtRate,
    filingStatus,
  }), [state.assumptions, combinedStRate, combinedLtRate, filingStatus]);

  const projection = useMemo(
    () => computeEdiProjection(projectionInput),
    [projectionInput]
  );

  // Compute scenarios
  const scenarios = useMemo(
    () => getDefaultScenarios(state.assumptions.collateralValue),
    [state.assumptions.collateralValue]
  );

  const scenarioResults = useMemo(
    () => scenarios.map(s => computeScenarioResults(s, projection, combinedStRate, combinedLtRate)),
    [scenarios, projection, combinedStRate, combinedLtRate]
  );

  // Compute unwind analysis for each year
  const unwindByYear = useMemo(() => {
    return Array.from({ length: state.assumptions.projectionYears }, (_, i) =>
      calculateUnwindAnalysis({
        unwindYear: i + 1,
        projection,
        strategyId: state.assumptions.strategyId,
        annualReturn: state.assumptions.annualReturn,
        combinedLtRate,
      })
    );
  }, [projection, state.assumptions, combinedLtRate]);

  const selectedUnwind = unwindByYear[unwindYear - 1];

  // Find break-even year
  const breakEvenYear = useMemo(() => {
    return unwindByYear.findIndex(u => u.availableCarryforward >= u.embeddedGainEstimate) + 1;
  }, [unwindByYear]);

  // Estate comparison at selected unwind year
  const estateResult = useMemo(() => {
    if (!selectedUnwind) return null;
    return calculateEstateComparison({
      portfolioValue: selectedUnwind.portfolioValueAtUnwind,
      embeddedGainPct: selectedUnwind.embeddedGainPct,
      availableStCarryforward: projection.years[unwindYear - 1]?.endingStCarryforward ?? 0,
      availableLtCarryforward: projection.years[unwindYear - 1]?.endingLtCarryforward ?? 0,
      combinedLtRate,
    });
  }, [selectedUnwind, projection, unwindYear, combinedLtRate]);

  const strategy = STRATEGIES.find(s => s.id === state.assumptions.strategyId);

  return (
    <div className="edi-only-tab">
      {/* PA State Warning */}
      {stateCode === 'PA' && (
        <div className="state-warning-banner">
          <strong>Pennsylvania Note:</strong> PA does not conform to federal capital loss
          carryforward rules. Accumulated carryforwards provide no PA state tax benefit.
          The federal benefit calculations shown here do not include PA state savings.
        </div>
      )}

      {/* Summary Cards */}
      <div className="edi-summary-cards">
        <div className="edi-summary-card">
          <div className="card-label">Final Carryforward (Year {state.assumptions.projectionYears})</div>
          <div className="card-value highlight">{formatCurrency(projection.summary.finalCarryforward)}</div>
          <div className="card-detail">Tax shield: {formatCurrency(projection.summary.carryforwardTaxShield)}</div>
        </div>
        <div className="edi-summary-card">
          <div className="card-label">Total Realized Benefit</div>
          <div className="card-value positive">{formatCurrency(projection.summary.totalRealizedBenefit)}</div>
          <div className="card-detail">From $3K annual deductions</div>
        </div>
        <div className="edi-summary-card">
          <div className="card-label">Total ST Losses Harvested</div>
          <div className="card-value">{formatCurrency(projection.summary.totalStLossesHarvested)}</div>
          <div className="card-detail">Efficiency: {projection.summary.cumulativeHarvestingEfficiency.toFixed(1)}x</div>
        </div>
        <div className="edi-summary-card">
          <div className="card-label">Break-Even Year</div>
          <div className="card-value positive">
            {breakEvenYear > 0 ? `Year ${breakEvenYear}` : 'Not reached'}
          </div>
          <div className="card-detail">CF exceeds embedded gains</div>
        </div>
      </div>

      {/* Assumptions */}
      <div className="edi-assumptions-section">
        <h3>Assumptions</h3>
        <div className="edi-assumptions-grid">
          <div className="edi-assumption-row">
            <label>Collateral Value</label>
            <div className="input-with-prefix editable-cell">
              <span className="prefix">$</span>
              <input
                type="text"
                inputMode="numeric"
                value={formatWithCommas(state.assumptions.collateralValue)}
                onChange={e => handleChange('collateralValue', parseFormattedNumber(e.target.value))}
              />
            </div>
          </div>
          <div className="edi-assumption-row">
            <label>Strategy</label>
            <div className="editable-cell select-cell">
              <select
                value={state.assumptions.strategyId}
                onChange={e => handleChange('strategyId', e.target.value)}
              >
                {STRATEGIES.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="edi-assumption-row">
            <label>Annual Portfolio Return</label>
            <div className="input-with-suffix editable-cell">
              <input
                type="number"
                min={0}
                max={30}
                step={0.5}
                value={(state.assumptions.annualReturn * 100).toFixed(1)}
                onChange={e => {
                  const v = parseFloat(e.target.value);
                  if (Number.isFinite(v)) handleChange('annualReturn', v / 100);
                }}
              />
              <span className="suffix">%</span>
            </div>
          </div>
          <div className="edi-assumption-row">
            <label>Wash Sale Rate</label>
            <div className="input-with-suffix editable-cell">
              <input
                type="number"
                min={0}
                max={100}
                step={1}
                value={(state.assumptions.washSaleRate * 100).toFixed(0)}
                onChange={e => {
                  const v = parseFloat(e.target.value);
                  if (Number.isFinite(v)) handleChange('washSaleRate', v / 100);
                }}
              />
              <span className="suffix">%</span>
            </div>
          </div>
          <div className="edi-assumption-row">
            <label>Existing ST Carryforward</label>
            <div className="input-with-prefix editable-cell">
              <span className="prefix">$</span>
              <input
                type="text"
                inputMode="numeric"
                value={formatWithCommas(state.assumptions.existingStCarryforward)}
                onChange={e => handleChange('existingStCarryforward', parseFormattedNumber(e.target.value))}
              />
            </div>
          </div>
          <div className="edi-assumption-row">
            <label>Projection Years</label>
            <div className="editable-cell select-cell">
              <select
                value={state.assumptions.projectionYears}
                onChange={e => handleChange('projectionYears', parseInt(e.target.value, 10))}
              >
                {[5, 7, 10].map(n => (
                  <option key={n} value={n}>{n} years</option>
                ))}
              </select>
            </div>
          </div>
        </div>
        <div className="edi-assumptions-footer">
          <button type="button" onClick={handleReset} className="btn-reset">Reset to Defaults</button>
          <span className="filing-status-note">
            Strategy: {strategy?.name ?? '—'} | Combined ST Rate: {(combinedStRate * 100).toFixed(1)}% | LT Rate: {(combinedLtRate * 100).toFixed(1)}%
          </span>
        </div>
      </div>

      {/* Year-by-Year Table */}
      <div className="edi-summary-section">
        <h3>Year-by-Year Carryforward Accumulation</h3>
        <div className="edi-table-container">
          <table className="edi-table">
            <thead>
              <tr>
                <th className="col-label"></th>
                {projection.years.map(r => (
                  <th key={r.year} className="col-year">Year {r.year}</th>
                ))}
                <th className="col-total">Total</th>
              </tr>
            </thead>
            <tbody>
              {ROW_DEFINITIONS.map(rowDef => (
                <tr key={rowDef.key} className={rowDef.rowClass ?? ''}>
                  <td className="row-label">{rowDef.label}</td>
                  {projection.years.map(year => (
                    <td key={year.year} className="cell-value">
                      {formatCellValue(rowDef.format, rowDef.getValue(year))}
                    </td>
                  ))}
                  <td className="cell-total">
                    {rowDef.key === 'cfEnding' || rowDef.key === 'collateral' || rowDef.key === 'efficiency'
                      ? '—'
                      : formatCellValue(rowDef.format, projection.years.reduce((s, y) => s + rowDef.getValue(y), 0))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Realization Scenarios */}
      <div className="edi-scenarios-section">
        <h3>Realization Scenarios — What Your Carryforward Is Worth</h3>
        <div className="edi-scenario-cards">
          {scenarioResults.map((result, i) => (
            <div key={i} className="edi-scenario-card">
              <h4>{result.scenario.label}</h4>
              <p className="scenario-description">
                {result.scenario.description}
                {result.scenario.isMultiYear
                  ? ` (${formatCurrency(result.scenario.annualGainAmount!)}/yr for ${result.scenario.durationYears} years starting Year ${result.scenario.yearOfEvent})`
                  : ` — ${formatCurrency(result.scenario.gainAmount)} at Year ${result.scenario.yearOfEvent}`}
              </p>
              <div className="scenario-metrics">
                <div className="scenario-metric">
                  <span className="metric-label">Tax Without CF</span>
                  <span className="metric-value">{formatCurrency(result.taxWithoutCarryforward)}</span>
                </div>
                <div className="scenario-metric">
                  <span className="metric-label">CF Used</span>
                  <span className="metric-value">{formatCurrency(result.carryforwardUsed)}</span>
                </div>
                <div className="scenario-metric">
                  <span className="metric-label">Tax With CF</span>
                  <span className="metric-value">{formatCurrency(result.taxWithCarryforward)}</span>
                </div>
                <hr className="scenario-metric-divider" />
                <div className="scenario-metric">
                  <span className="metric-label">Tax Saved</span>
                  <span className="metric-value saved">{formatCurrency(result.taxSaved)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Unwind Analysis */}
      <div className="edi-unwind-section">
        <h3>Strategy Unwind Analysis</h3>
        <div className="unwind-slider-row">
          <label>Unwind Year:</label>
          <input
            type="range"
            min={1}
            max={state.assumptions.projectionYears}
            value={unwindYear}
            onChange={e => setUnwindYear(parseInt(e.target.value, 10))}
          />
          <span className="unwind-year-display">Year {unwindYear}</span>
        </div>

        {selectedUnwind && (
          <div className="edi-summary-cards">
            <div className="edi-summary-card">
              <div className="card-label">Portfolio Value</div>
              <div className="card-value">{formatCurrency(selectedUnwind.portfolioValueAtUnwind)}</div>
            </div>
            <div className="edi-summary-card">
              <div className="card-label">Embedded Gain</div>
              <div className="card-value">{formatCurrency(selectedUnwind.embeddedGainEstimate)}</div>
              <div className="card-detail">{(selectedUnwind.embeddedGainPct * 100).toFixed(1)}% of portfolio</div>
            </div>
            <div className="edi-summary-card">
              <div className="card-label">CF Available</div>
              <div className="card-value highlight">{formatCurrency(selectedUnwind.availableCarryforward)}</div>
            </div>
            <div className="edi-summary-card">
              <div className="card-label">Net Unwind Tax</div>
              <div className="card-value positive">{formatCurrency(selectedUnwind.netUnwindTax)}</div>
              <div className="card-detail">Saved: {formatCurrency(selectedUnwind.taxSavedByCf)}</div>
            </div>
          </div>
        )}

        {/* Year-by-year unwind comparison */}
        <table className="unwind-comparison-table">
          <thead>
            <tr>
              <th>Year</th>
              <th>Portfolio Value</th>
              <th>Embedded Gain</th>
              <th>CF Available</th>
              <th>Gross Unwind Tax</th>
              <th>Net Unwind Tax</th>
              <th>Tax Saved by CF</th>
            </tr>
          </thead>
          <tbody>
            {unwindByYear.map(u => (
              <tr
                key={u.unwindYear}
                className={breakEvenYear > 0 && u.unwindYear === breakEvenYear ? 'break-even-row' : ''}
              >
                <td>{u.unwindYear}</td>
                <td>{formatCurrency(u.portfolioValueAtUnwind)}</td>
                <td>{formatCurrency(u.embeddedGainEstimate)}</td>
                <td>{formatCurrency(u.availableCarryforward)}</td>
                <td>{formatCurrency(u.grossUnwindTax)}</td>
                <td>{formatCurrency(u.netUnwindTax)}</td>
                <td>{formatCurrency(u.taxSavedByCf)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {breakEvenYear > 0 && (
          <div className="estate-explanation">
            After Year {breakEvenYear}, unwinding is effectively tax-free because carryforward exceeds embedded gains.
          </div>
        )}
      </div>

      {/* Estate Comparison */}
      {estateResult && (
        <div className="edi-estate-section">
          <h3>Estate Planning Comparison (Year {unwindYear})</h3>
          <div className="estate-comparison-grid">
            <div className={`estate-option ${estateResult.recommendation === 'continue' ? 'recommended' : ''}`}>
              <h4>Continue + Die</h4>
              <div className="estate-metric">
                <span className="estate-label">Step-up value</span>
                <span className="estate-value">{formatCurrency(estateResult.continueAndDie.stepUpValue)}</span>
              </div>
              <div className="estate-metric">
                <span className="estate-label">CF lost at death</span>
                <span className="estate-value">{formatCurrency(estateResult.continueAndDie.carryforwardValueLost)}</span>
              </div>
              <div className="estate-metric">
                <span className="estate-label">Net benefit</span>
                <span className="estate-value">{formatCurrency(estateResult.continueAndDie.netBenefit)}</span>
              </div>
            </div>

            <div className={`estate-option ${estateResult.recommendation === 'unwind' ? 'recommended' : ''}`}>
              <h4>Full Unwind</h4>
              <div className="estate-metric">
                <span className="estate-label">Embedded gains</span>
                <span className="estate-value">{formatCurrency(estateResult.unwindBeforeDeath.embeddedGains)}</span>
              </div>
              <div className="estate-metric">
                <span className="estate-label">CF used</span>
                <span className="estate-value">{formatCurrency(estateResult.unwindBeforeDeath.carryforwardUsed)}</span>
              </div>
              <div className="estate-metric">
                <span className="estate-label">Tax paid</span>
                <span className="estate-value">{formatCurrency(estateResult.unwindBeforeDeath.taxPaid)}</span>
              </div>
            </div>

            <div className={`estate-option ${estateResult.recommendation === 'partial_unwind' ? 'recommended' : ''}`}>
              <h4>Partial Unwind</h4>
              <div className="estate-metric">
                <span className="estate-label">Optimal unwind</span>
                <span className="estate-value">{(estateResult.optimalUnwindPct * 100).toFixed(0)}%</span>
              </div>
              <div className="estate-metric">
                <span className="estate-label">Unwind tax-free</span>
                <span className="estate-value">{formatCurrency(estateResult.unwindBeforeDeath.carryforwardUsed)}</span>
              </div>
              <div className="estate-metric">
                <span className="estate-label">Keep for step-up</span>
                <span className="estate-value">{(100 - estateResult.optimalUnwindPct * 100).toFixed(0)}%</span>
              </div>
            </div>
          </div>

          <div className="estate-explanation">{estateResult.explanation}</div>
          <p className="estate-disclaimer">
            Carryforwards are lost at death (IRC Section 1212(b)). Positions receive step-up in basis (IRC Section 1014).
            Consult estate planning attorney before making decisions.
          </p>
        </div>
      )}

      {/* Notes */}
      <div className="edi-notes">
        <h4>Calculation Notes</h4>
        <ul>
          <li>
            <strong>ST Losses Shelter LT Gains:</strong> Under IRC netting rules, short-term losses offset long-term gains before contributing to carryforward.
          </li>
          <li>
            <strong>$3K Deduction:</strong> Only excess capital losses (after netting) can offset ordinary income, limited to $3K/year ($1.5K for MFS).
          </li>
          <li>
            <strong>No Annual Limit on CF vs Gains:</strong> A $5M carryforward can shelter $5M in realized gains in a single year.
          </li>
          <li>
            <strong>Carryforwards Retain Character:</strong> ST stays ST, LT stays LT. Same-character offsets first, then cross-applies.
          </li>
          <li>
            <strong>Embedded Gain:</strong> Grows from market appreciation plus basis reduction from harvesting. Estimated using strategy loss rates.
          </li>
        </ul>
      </div>
    </div>
  );
}
