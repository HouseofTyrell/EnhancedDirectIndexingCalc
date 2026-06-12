import { useReducer, useCallback, useMemo } from 'react';
import { FilingStatus } from '../types';
import { STRATEGIES, SECTION_461L_LIMITS } from '../strategyData';
import { formatWithCommas, parseFormattedNumber, formatCurrency } from '../utils/formatters';
import {
  computeYearResults,
  computeTotals,
  computeStats,
  QfafTestAssumptions,
  QfafTestYearRow,
  DEFAULT_ASSUMPTIONS,
  QFAF_ALPHA_RATE,
  QUANTINNO_ALPHA_RATE,
  NUM_YEARS,
} from '../qfafTestCalculations';
import {
  MONTHLY_RETURNS,
  ANNUAL_RETURNS,
  MONTHLY_BREAKDOWN,
  ANNUAL_BREAKDOWN,
  HIST_ORD_LOSS_MIN,
  HIST_ORD_LOSS_MAX,
  HIST_ORD_LOSS_AVG,
} from '../qfafTestData';
import './QfafTestByYear.css';

interface QfafTestByYearProps {
  filingStatus: FilingStatus;
}

// Strategy lists for dropdown selects
const OVERLAY_STRATEGIES = STRATEGIES.filter(s => s.type === 'overlay');
const CORE_STRATEGIES = STRATEGIES.filter(s => s.type === 'core');

type State = {
  assumptions: QfafTestAssumptions;
};

type Action =
  | { type: 'UPDATE_ASSUMPTION'; field: keyof QfafTestAssumptions; value: number | string }
  | { type: 'RESET' };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'UPDATE_ASSUMPTION':
      return {
        ...state,
        assumptions: {
          ...state.assumptions,
          [action.field]: action.value,
        },
      };
    case 'RESET':
      return { assumptions: { ...DEFAULT_ASSUMPTIONS } };
    default:
      return state;
  }
}

// Row definitions for the summary table
interface RowDef {
  key: string;
  label: string;
  field: keyof QfafTestYearRow;
  format: 'currency' | 'currency-highlight' | 'currency-positive' | 'currency-negative';
}

const ROW_DEFINITIONS: RowDef[] = [
  {
    key: 'dealsCollateralValue',
    label: 'Deals Collateral Value',
    field: 'dealsCollateralValue',
    format: 'currency',
  },
  {
    key: 'qfafSubscriptionSize',
    label: 'QFAF Subscription Size',
    field: 'qfafSubscriptionSize',
    format: 'currency',
  },
  {
    key: 'annualEstOrdinaryLosses',
    label: 'Annual Est. Ordinary Losses',
    field: 'annualEstOrdinaryLosses',
    format: 'currency',
  },
  {
    key: 'section461Limit',
    label: 'Annual limitation TCJA Section 461(l)',
    field: 'section461Limit',
    format: 'currency',
  },
  {
    key: 'carryForwardPrior',
    label: 'Carry Forward Prior Year',
    field: 'carryForwardPrior',
    format: 'currency',
  },
  {
    key: 'carryForwardNext',
    label: 'Carry Forward to Next Year',
    field: 'carryForwardNext',
    format: 'currency',
  },
  {
    key: 'writeOffAmount',
    label: 'Write Off Amount',
    field: 'writeOffAmount',
    format: 'currency-highlight',
  },
  { key: 'taxSavings', label: 'Tax Savings', field: 'taxSavings', format: 'currency-positive' },
  {
    key: 'advisorManagementFee',
    label: 'Advisor Management Fee (Quantinno Only)',
    field: 'advisorManagementFee',
    format: 'currency-negative',
  },
  {
    key: 'quantinnoFees',
    label: 'Quantinno/QFAF/Financing Fees',
    field: 'quantinnoFees',
    format: 'currency-negative',
  },
  { key: 'totalFees', label: 'Total', field: 'totalFees', format: 'currency-negative' },
  {
    key: 'netTaxBenefit',
    label: 'Net Tax Benefit',
    field: 'netTaxBenefit',
    format: 'currency-highlight',
  },
  {
    key: 'qfafAlpha',
    label: `Historical Strategy Alpha QFAF (${(QFAF_ALPHA_RATE * 100).toFixed(2)}%)`,
    field: 'qfafAlpha',
    format: 'currency-positive',
  },
  {
    key: 'quantinnoAlpha',
    label: `Historical Strategy Alpha Quantinno (${(QUANTINNO_ALPHA_RATE * 100).toFixed(2)}%)`,
    field: 'quantinnoAlpha',
    format: 'currency-positive',
  },
  { key: 'totalAlpha', label: 'Total', field: 'totalAlpha', format: 'currency-positive' },
];

export function QfafTestByYear({ filingStatus }: QfafTestByYearProps) {
  const [state, dispatch] = useReducer(reducer, null, () => ({
    assumptions: { ...DEFAULT_ASSUMPTIONS },
  }));

  // Compute results from assumptions (memoized)
  const results = useMemo(
    () => computeYearResults(state.assumptions, filingStatus, NUM_YEARS),
    [state.assumptions, filingStatus]
  );

  // Get §461(l) limit for display
  const section461Limit = SECTION_461L_LIMITS[filingStatus] || SECTION_461L_LIMITS.single;

  // Compute totals (memoized)
  const totals = useMemo(() => computeTotals(results), [results]);

  // Assumption change handler
  const handleAssumptionChange = useCallback(
    (field: keyof QfafTestAssumptions, value: number | string) => {
      dispatch({ type: 'UPDATE_ASSUMPTION', field, value });
    },
    []
  );

  // Reset handler
  const handleReset = useCallback(() => {
    dispatch({ type: 'RESET' });
  }, []);

  // Format cell value based on row definition
  const formatCellValue = (rowDef: RowDef, value: number) => {
    const formatted = formatCurrency(value);
    switch (rowDef.format) {
      case 'currency-highlight':
        return <span className="cell-highlight">{formatted}</span>;
      case 'currency-positive':
        return <span className="cell-positive">{formatted}</span>;
      case 'currency-negative':
        return <span className="cell-negative">{formatted}</span>;
      default:
        return formatted;
    }
  };

  // Get strategy display name
  const getStrategyLabel = (strategyId: string) => {
    const strategy = STRATEGIES.find(s => s.id === strategyId);
    return strategy ? strategy.name.split(' ')[1] : strategyId;
  };

  return (
    <div className="qfaf-test-excel">
      {/* Assumptions Section */}
      <div className="assumptions-section">
        <h3>Assumptions: Adjust the cells in orange</h3>
        <div className="assumptions-grid">
          <div className="assumption-row">
            <label>Initial QFAF Investment</label>
            <div className="input-with-prefix editable-cell">
              <span className="prefix">$</span>
              <input
                type="text"
                inputMode="numeric"
                value={formatWithCommas(state.assumptions.initialQfafInvestment)}
                onChange={e => {
                  handleAssumptionChange(
                    'initialQfafInvestment',
                    parseFormattedNumber(e.target.value)
                  );
                }}
              />
            </div>
          </div>

          <div className="assumption-row">
            <label>Initial Deals Investment (Overlay)</label>
            <div className="input-with-prefix editable-cell">
              <span className="prefix">$</span>
              <input
                type="text"
                inputMode="numeric"
                value={formatWithCommas(state.assumptions.initialDealsInvestment)}
                onChange={e => {
                  handleAssumptionChange(
                    'initialDealsInvestment',
                    parseFormattedNumber(e.target.value)
                  );
                }}
              />
            </div>
          </div>

          <div className="assumption-row">
            <label>Initial Leverage (Overlay)</label>
            <div className="editable-cell select-cell">
              <select
                value={state.assumptions.overlayStrategyId}
                onChange={e => handleAssumptionChange('overlayStrategyId', e.target.value)}
              >
                {OVERLAY_STRATEGIES.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name.split(' ')[1]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="assumption-row">
            <label>New Cash Leverage (Core)</label>
            <div className="editable-cell select-cell">
              <select
                value={state.assumptions.coreStrategyId}
                onChange={e => handleAssumptionChange('coreStrategyId', e.target.value)}
              >
                {CORE_STRATEGIES.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name.split(' ')[1]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="assumption-row">
            <label>Marginal Tax Rate</label>
            <div className="input-with-suffix editable-cell">
              <input
                type="number"
                min={0}
                max={65}
                step={0.1}
                value={(state.assumptions.marginalTaxRate * 100).toFixed(2)}
                onChange={e => {
                  const parsed = parseFloat(e.target.value);
                  if (Number.isFinite(parsed)) {
                    handleAssumptionChange('marginalTaxRate', parsed / 100);
                  }
                }}
              />
              <span className="suffix">%</span>
            </div>
          </div>

          <div className="assumption-row assumption-row-wide">
            <label>
              QFAF Generation Rate: {(state.assumptions.qfafGenerationRate * 100).toFixed(0)}%
            </label>
            <div className="generation-rate-slider">
              <input
                type="range"
                min={1.0}
                max={1.5}
                step={0.05}
                value={state.assumptions.qfafGenerationRate}
                onChange={e =>
                  handleAssumptionChange('qfafGenerationRate', parseFloat(e.target.value))
                }
              />
              <div className="slider-labels">
                <span>100%</span>
                <span className="slider-hist-ref">
                  Hist: min {(HIST_ORD_LOSS_MIN * 100).toFixed(0)}%, max{' '}
                  {(HIST_ORD_LOSS_MAX * 100).toFixed(0)}%, avg{' '}
                  {(HIST_ORD_LOSS_AVG * 100).toFixed(0)}%
                </span>
                <span>150%</span>
              </div>
            </div>
          </div>
        </div>

        <div className="assumptions-footer">
          <button type="button" onClick={handleReset} className="btn-reset">
            Reset to Defaults
          </button>
          <span className="filing-status-note">
            Filing Status: {filingStatus.toUpperCase()} | §461(l) Limit:{' '}
            {formatCurrency(section461Limit)}
          </span>
        </div>
      </div>

      {/* Summary Table */}
      <div className="summary-section">
        <h3>Summary</h3>
        <div className="summary-table-container">
          <table className="summary-table">
            <thead>
              <tr>
                <th className="col-label"></th>
                {results.map(r => (
                  <th key={r.year} className="col-year">
                    {r.calendarYear}
                  </th>
                ))}
                <th className="col-total">Total</th>
              </tr>
            </thead>
            <tbody>
              {ROW_DEFINITIONS.map(rowDef => (
                <tr key={rowDef.key} className={`row-${rowDef.format}`}>
                  <td className="row-label">
                    {rowDef.key === 'dealsCollateralValue'
                      ? `Deals Collateral Value (${getStrategyLabel(state.assumptions.coreStrategyId)})`
                      : rowDef.label}
                  </td>
                  {results.map(result => (
                    <td key={result.year} className="cell-value">
                      {formatCellValue(rowDef, result[rowDef.field] as number)}
                    </td>
                  ))}
                  <td className="cell-total">
                    {rowDef.key === 'carryForwardPrior' || rowDef.key === 'section461Limit'
                      ? '-'
                      : formatCellValue(rowDef, totals[rowDef.field as keyof typeof totals])}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Historical Performance Section */}
      <div className="historical-performance-section">
        <h3>Historical QFAF Performance</h3>

        <div className="historical-tables-grid">
          {/* Annual Returns + Breakdown */}
          <div className="historical-table-block">
            <h4>Annual Returns</h4>
            <table className="historical-table">
              <thead>
                <tr>
                  <th>Year</th>
                  <th>Net Return</th>
                  <th>% ST Cap Gain/Loss</th>
                  <th>% Ordinary Inc/Loss</th>
                </tr>
              </thead>
              <tbody>
                {ANNUAL_RETURNS.map((row, i) => {
                  const breakdown = ANNUAL_BREAKDOWN[i];
                  return (
                    <tr key={row.year}>
                      <td className="hist-label">{row.year}</td>
                      <td className={row.netReturn >= 0 ? 'hist-positive' : 'hist-negative'}>
                        {(row.netReturn * 100).toFixed(2)}%
                      </td>
                      <td className="hist-positive">{(breakdown.stCapGain * 100).toFixed(2)}%</td>
                      <td className="hist-negative">
                        {(breakdown.ordinaryIncome * 100).toFixed(2)}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                {(() => {
                  const netStats = computeStats(ANNUAL_RETURNS.map(r => r.netReturn));
                  const stStats = computeStats(ANNUAL_BREAKDOWN.map(r => r.stCapGain));
                  const ordStats = computeStats(ANNUAL_BREAKDOWN.map(r => r.ordinaryIncome));
                  return (['min', 'max', 'mean', 'median'] as const).map(stat => (
                    <tr key={stat} className="hist-stat-row">
                      <td className="hist-label hist-stat-label">
                        {stat.charAt(0).toUpperCase() + stat.slice(1)}
                      </td>
                      <td className={netStats[stat] >= 0 ? 'hist-positive' : 'hist-negative'}>
                        {(netStats[stat] * 100).toFixed(2)}%
                      </td>
                      <td className="hist-positive">{(stStats[stat] * 100).toFixed(2)}%</td>
                      <td className="hist-negative">{(ordStats[stat] * 100).toFixed(2)}%</td>
                    </tr>
                  ));
                })()}
              </tfoot>
            </table>
          </div>

          {/* Monthly Returns + Breakdown */}
          <div className="historical-table-block">
            <h4>Monthly Returns (Nov-24 to Oct-25)</h4>
            <table className="historical-table">
              <thead>
                <tr>
                  <th>Month</th>
                  <th>Net Return</th>
                  <th>% ST Cap Gain/Loss</th>
                  <th>% Ordinary Inc/Loss</th>
                </tr>
              </thead>
              <tbody>
                {MONTHLY_RETURNS.map((row, i) => {
                  const breakdown = MONTHLY_BREAKDOWN[i];
                  return (
                    <tr key={row.month}>
                      <td className="hist-label">{row.month}</td>
                      <td className={row.netReturn >= 0 ? 'hist-positive' : 'hist-negative'}>
                        {(row.netReturn * 100).toFixed(2)}%
                      </td>
                      <td className="hist-positive">{(breakdown.stCapGain * 100).toFixed(2)}%</td>
                      <td className="hist-negative">
                        {(breakdown.ordinaryIncome * 100).toFixed(2)}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                {(() => {
                  const netStats = computeStats(MONTHLY_RETURNS.map(r => r.netReturn));
                  const stStats = computeStats(MONTHLY_BREAKDOWN.map(r => r.stCapGain));
                  const ordStats = computeStats(MONTHLY_BREAKDOWN.map(r => r.ordinaryIncome));
                  return (['min', 'max', 'mean', 'median'] as const).map(stat => (
                    <tr key={stat} className="hist-stat-row">
                      <td className="hist-label hist-stat-label">
                        {stat.charAt(0).toUpperCase() + stat.slice(1)}
                      </td>
                      <td className={netStats[stat] >= 0 ? 'hist-positive' : 'hist-negative'}>
                        {(netStats[stat] * 100).toFixed(2)}%
                      </td>
                      <td className="hist-positive">{(stStats[stat] * 100).toFixed(2)}%</td>
                      <td className="hist-negative">{(ordStats[stat] * 100).toFixed(2)}%</td>
                    </tr>
                  ));
                })()}
              </tfoot>
            </table>
          </div>
        </div>
      </div>

      {/* Notes */}
      <div className="qfaf-notes">
        <h4>Calculation Notes</h4>
        <ul>
          <li>
            <strong>QFAF Subscription:</strong> Sized based on initial investment with Year 1
            adjustment factor (1.049×), then decays ~7.7% annually.
          </li>
          <li>
            <strong>Deals Collateral:</strong> Calculated so total ST losses = QFAF ST gains.
            Combines Overlay (growing at {(QUANTINNO_ALPHA_RATE * 100).toFixed(2)}%) + Core
            collateral.
          </li>
          <li>
            <strong>Ordinary Losses:</strong> QFAF generates{' '}
            {(state.assumptions.qfafGenerationRate * 100).toFixed(0)}% of subscription as ordinary
            losses.
          </li>
          <li>
            <strong>§461(l) Limit:</strong> {formatCurrency(section461Limit)} for{' '}
            {filingStatus.toUpperCase()} filers. Excess carries forward as NOL.
          </li>
          <li>
            <strong>Carryforward Usage:</strong> Prior year carryforward is fully used in addition
            to the annual §461(l) limit.
          </li>
        </ul>
      </div>
    </div>
  );
}
