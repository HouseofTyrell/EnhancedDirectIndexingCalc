import { useReducer, useCallback, useMemo } from 'react';
import { FilingStatus } from '../types';
import {
  STRATEGIES,
  getStLossRateForYear,
  SECTION_461L_LIMITS,
  QFAF_ORDINARY_LOSS_RATE,
} from '../strategyData';
import { formatWithCommas, parseFormattedNumber, formatCurrency } from '../utils/formatters';
import './QfafTestByYear.css';

// Number of years to show in the table
const NUM_YEARS = 10;
const START_YEAR = 2026;

// Alpha rate constants (from QFAF Excel model — test-page-specific, no shared equivalent)
const QFAF_ALPHA_RATE = 0.0557; // 5.57% per year
const QUANTINNO_ALPHA_RATE = 0.0117; // 1.17% per year

// Historical QFAF performance data
const MONTHLY_RETURNS = [
  { month: 'Nov-24', netReturn: 0.0157 },
  { month: 'Dec-24', netReturn: 0.0002 },
  { month: 'Jan-25', netReturn: 0.0212 },
  { month: 'Feb-25', netReturn: 0.0120 },
  { month: 'Mar-25', netReturn: -0.0011 },
  { month: 'Apr-25', netReturn: 0.0153 },
  { month: 'May-25', netReturn: -0.0054 },
  { month: 'Jun-25', netReturn: -0.0104 },
  { month: 'Jul-25', netReturn: -0.0180 },
  { month: 'Aug-25', netReturn: -0.0055 },
  { month: 'Sep-25', netReturn: -0.0192 },
  { month: 'Oct-25', netReturn: -0.0195 },
];

const ANNUAL_RETURNS = [
  { year: '2020', netReturn: -0.0851 },
  { year: '2021', netReturn: 0.1705 },
  { year: '2022', netReturn: 0.1244 },
  { year: '2023', netReturn: 0.0433 },
  { year: '2024', netReturn: 0.1569 },
];

// Performance breakdown data (ST Capital Gain/Loss % | Ordinary Income/Loss %)
const MONTHLY_BREAKDOWN = [
  { month: 'Nov-24', stCapGain: 0.1201, ordinaryIncome: -0.1080 },
  { month: 'Dec-24', stCapGain: 0.1269, ordinaryIncome: -0.1250 },
  { month: 'Jan-25', stCapGain: 0.1256, ordinaryIncome: -0.1013 },
  { month: 'Feb-25', stCapGain: 0.1271, ordinaryIncome: -0.1133 },
  { month: 'Mar-25', stCapGain: 0.1267, ordinaryIncome: -0.1301 },
  { month: 'Apr-25', stCapGain: 0.1276, ordinaryIncome: -0.1102 },
  { month: 'May-25', stCapGain: 0.1243, ordinaryIncome: -0.1309 },
  { month: 'Jun-25', stCapGain: 0.1268, ordinaryIncome: -0.1393 },
  { month: 'Jul-25', stCapGain: 0.1231, ordinaryIncome: -0.1401 },
  { month: 'Aug-25', stCapGain: 0.1277, ordinaryIncome: -0.1339 },
  { month: 'Sep-25', stCapGain: 0.1313, ordinaryIncome: -0.1504 },
  { month: 'Oct-25', stCapGain: 0.1273, ordinaryIncome: -0.1477 },
];

const ANNUAL_BREAKDOWN = [
  { year: '2020', stCapGain: 1.5293, ordinaryIncome: -1.5788 },
  { year: '2021', stCapGain: 1.5130, ordinaryIncome: -1.3131 },
  { year: '2022', stCapGain: 1.4860, ordinaryIncome: -1.3470 },
  { year: '2023', stCapGain: 1.5076, ordinaryIncome: -1.4809 },
  { year: '2024', stCapGain: 1.4962, ordinaryIncome: -1.3535 },
];


// Fee rates (from QFAF Excel model — percentage of Deals Collateral)
const ADVISOR_MGMT_FEE_RATE = 0.0057; // ~0.57%
const QFAF_FINANCING_FEE_RATE = 0.00536; // ~0.54%

// Compute min, max, mean, median for an array of numbers
function computeStats(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  return { min, max, mean, median };
}

interface QfafTestByYearProps {
  filingStatus: FilingStatus;
}

// Get overlay and core strategies from strategy data
const OVERLAY_STRATEGIES = STRATEGIES.filter(s => s.type === 'overlay');
const CORE_STRATEGIES = STRATEGIES.filter(s => s.type === 'core');

// Compute historical ordinary loss rate stats from annual breakdown
const HIST_ORD_LOSS_RATES = ANNUAL_BREAKDOWN.map(r => Math.abs(r.ordinaryIncome));
const HIST_ORD_LOSS_MIN = Math.min(...HIST_ORD_LOSS_RATES);
const HIST_ORD_LOSS_MAX = Math.max(...HIST_ORD_LOSS_RATES);
const HIST_ORD_LOSS_AVG = HIST_ORD_LOSS_RATES.reduce((a, b) => a + b, 0) / HIST_ORD_LOSS_RATES.length;

// Assumptions state - editable inputs
interface Assumptions {
  initialQfafInvestment: number;
  initialDealsInvestment: number; // Overlay collateral
  overlayStrategyId: string; // e.g., 'overlay-45-45'
  coreStrategyId: string; // e.g., 'core-145-45'
  marginalTaxRate: number; // Combined federal + state
  qfafGenerationRate: number; // ST gains & ordinary losses as multiple of QFAF MV (e.g. 1.5 = 150%)
}

// Year-by-year computed results
interface YearResult {
  year: number;
  calendarYear: number;
  dealsCollateralValue: number;
  qfafSubscriptionSize: number;
  annualEstOrdinaryLosses: number;
  section461Limit: number;
  carryForwardPrior: number;
  carryForwardNext: number;
  writeOffAmount: number;
  taxSavings: number;
  advisorManagementFee: number;
  quantinnoFees: number;
  totalFees: number;
  netTaxBenefit: number;
  qfafAlpha: number;
  quantinnoAlpha: number;
  totalAlpha: number;
}

type State = {
  assumptions: Assumptions;
};

type Action =
  | { type: 'UPDATE_ASSUMPTION'; field: keyof Assumptions; value: number | string }
  | { type: 'RESET' };

// Defaults matching the Excel screenshot (validation-specific, not shared with main calculator)
const DEFAULT_ASSUMPTIONS: Assumptions = {
  initialQfafInvestment: 1000000,
  initialDealsInvestment: 4700000,
  overlayStrategyId: OVERLAY_STRATEGIES[1]?.id ?? 'overlay-45-45', // Overlay 45/45
  coreStrategyId: CORE_STRATEGIES[1]?.id ?? 'core-145-45', // Core 145/45
  marginalTaxRate: 0.541, // 54.1% combined federal + state
  qfafGenerationRate: QFAF_ORDINARY_LOSS_RATE, // Default: 1.5 (150%)
};

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'UPDATE_ASSUMPTION': {
      return {
        ...state,
        assumptions: {
          ...state.assumptions,
          [action.field]: action.value,
        },
      };
    }
    case 'RESET': {
      return { assumptions: { ...DEFAULT_ASSUMPTIONS } };
    }
    default:
      return state;
  }
}

// Compute year-by-year results from assumptions
function computeYearResults(
  assumptions: Assumptions,
  filingStatus: FilingStatus,
  numYears: number
): YearResult[] {
  const results: YearResult[] = [];
  let carryForward = 0;

  // Get selected strategies
  const overlayStrategy = STRATEGIES.find(s => s.id === assumptions.overlayStrategyId);
  const coreStrategy = STRATEGIES.find(s => s.id === assumptions.coreStrategyId);

  if (!overlayStrategy || !coreStrategy) {
    return results;
  }

  // Get §461(l) limit for filing status
  const section461Limit = SECTION_461L_LIMITS[filingStatus] || SECTION_461L_LIMITS.single;

  // Base values for calculations
  const initialQfafBase = assumptions.initialQfafInvestment;
  const initialDealsBase = assumptions.initialDealsInvestment;

  for (let i = 0; i < numYears; i++) {
    const year = i + 1;
    const calendarYear = START_YEAR + i;

    // Get year-specific ST loss rates from strategy data
    const overlayStLossRate = getStLossRateForYear(overlayStrategy, year);
    const coreStLossRate = getStLossRateForYear(coreStrategy, year);

    // QFAF Subscription Size calculation:
    // Year 1: Initial QFAF × 1.049 (small growth factor)
    // Subsequent years: Decays as QFAF generates losses
    let qfafSubscriptionSize: number;
    if (i === 0) {
      qfafSubscriptionSize = initialQfafBase * 1.049;
    } else {
      // QFAF decreases over time as it generates losses
      // Using decay factor derived from Excel: ~0.9231 per year after Year 1
      const priorQfaf = results[i - 1].qfafSubscriptionSize;
      qfafSubscriptionSize = priorQfaf * 0.9231;
    }

    // Annual estimated ordinary losses = QFAF × generation rate
    const annualEstOrdinaryLosses = qfafSubscriptionSize * assumptions.qfafGenerationRate;

    // Deals Collateral Value calculation:
    // The collateral is sized so ST losses = QFAF ST gains (for tax efficiency)
    // Total ST losses needed = annualEstOrdinaryLosses (since QFAF ST gains = ordinary losses)
    // Overlay generates: initialDeals × overlayStLossRate
    // Core makes up the difference

    // ST losses from overlay portion (grows with Quantinno alpha)
    const overlayCollateral = initialDealsBase * Math.pow(1 + QUANTINNO_ALPHA_RATE, i);
    const overlayStLosses = overlayCollateral * overlayStLossRate;

    // Additional core collateral needed to match QFAF ST gains
    const stLossesNeeded = annualEstOrdinaryLosses; // ST gains = ordinary losses for QFAF
    const coreStLossesNeeded = Math.max(0, stLossesNeeded - overlayStLosses);
    const coreCollateral = coreStLossRate > 0 ? coreStLossesNeeded / coreStLossRate : 0;

    // Total Deals Collateral = Overlay + Core
    const dealsCollateralValue = overlayCollateral + coreCollateral;

    // §461(l) limitation and carryforward logic
    // New losses that can be written off this year (capped by §461(l))
    const newLossWriteOff = Math.min(annualEstOrdinaryLosses, section461Limit);

    // Total write-off = new loss write-off + all prior carryforward
    const writeOffAmount = newLossWriteOff + carryForward;

    // Carryforward to next year = new losses that exceed §461(l) limit
    const carryForwardNext = annualEstOrdinaryLosses - newLossWriteOff;

    // Tax savings = write-off × marginal tax rate
    const taxSavings = writeOffAmount * assumptions.marginalTaxRate;

    // Fees (based on Deals Collateral Value)
    const advisorManagementFee = dealsCollateralValue * ADVISOR_MGMT_FEE_RATE;
    const quantinnoFees = dealsCollateralValue * QFAF_FINANCING_FEE_RATE;
    const totalFees = advisorManagementFee + quantinnoFees;

    // Net tax benefit = tax savings - fees
    const netTaxBenefit = taxSavings - totalFees;

    // Alpha calculations
    const qfafAlpha = qfafSubscriptionSize * QFAF_ALPHA_RATE;
    const quantinnoAlpha = dealsCollateralValue * QUANTINNO_ALPHA_RATE;
    const totalAlpha = qfafAlpha + quantinnoAlpha;

    results.push({
      year,
      calendarYear,
      dealsCollateralValue,
      qfafSubscriptionSize,
      annualEstOrdinaryLosses,
      section461Limit,
      carryForwardPrior: carryForward,
      carryForwardNext,
      writeOffAmount,
      taxSavings,
      advisorManagementFee,
      quantinnoFees,
      totalFees,
      netTaxBenefit,
      qfafAlpha,
      quantinnoAlpha,
      totalAlpha,
    });

    // Update carryforward for next year
    carryForward = carryForwardNext;
  }

  return results;
}

// Row definitions for the summary table
interface RowDef {
  key: string;
  label: string;
  field: keyof YearResult;
  format: 'currency' | 'currency-highlight' | 'currency-positive' | 'currency-negative';
}

const ROW_DEFINITIONS: RowDef[] = [
  { key: 'dealsCollateralValue', label: 'Deals Collateral Value', field: 'dealsCollateralValue', format: 'currency' },
  { key: 'qfafSubscriptionSize', label: 'QFAF Subscription Size', field: 'qfafSubscriptionSize', format: 'currency' },
  { key: 'annualEstOrdinaryLosses', label: 'Annual Est. Ordinary Losses', field: 'annualEstOrdinaryLosses', format: 'currency' },
  { key: 'section461Limit', label: 'Annual limitation TCJA Section 461(l)', field: 'section461Limit', format: 'currency' },
  { key: 'carryForwardPrior', label: 'Carry Forward Prior Year', field: 'carryForwardPrior', format: 'currency' },
  { key: 'carryForwardNext', label: 'Carry Forward to Next Year', field: 'carryForwardNext', format: 'currency' },
  { key: 'writeOffAmount', label: 'Write Off Amount', field: 'writeOffAmount', format: 'currency-highlight' },
  { key: 'taxSavings', label: 'Tax Savings', field: 'taxSavings', format: 'currency-positive' },
  { key: 'advisorManagementFee', label: 'Advisor Management Fee (Quantinno Only)', field: 'advisorManagementFee', format: 'currency-negative' },
  { key: 'quantinnoFees', label: 'Quantinno/QFAF/Financing Fees', field: 'quantinnoFees', format: 'currency-negative' },
  { key: 'totalFees', label: 'Total', field: 'totalFees', format: 'currency-negative' },
  { key: 'netTaxBenefit', label: 'Net Tax Benefit', field: 'netTaxBenefit', format: 'currency-highlight' },
  { key: 'qfafAlpha', label: `Historical Strategy Alpha QFAF (${(QFAF_ALPHA_RATE * 100).toFixed(2)}%)`, field: 'qfafAlpha', format: 'currency-positive' },
  { key: 'quantinnoAlpha', label: `Historical Strategy Alpha Quantinno (${(QUANTINNO_ALPHA_RATE * 100).toFixed(2)}%)`, field: 'quantinnoAlpha', format: 'currency-positive' },
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

  // Assumption change handler
  const handleAssumptionChange = useCallback((field: keyof Assumptions, value: number | string) => {
    dispatch({ type: 'UPDATE_ASSUMPTION', field, value });
  }, []);

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

  // Compute totals
  const totals = useMemo(() => {
    const sum = (field: keyof YearResult) =>
      results.reduce((acc, r) => acc + (r[field] as number), 0);

    return {
      dealsCollateralValue: results[results.length - 1]?.dealsCollateralValue || 0,
      qfafSubscriptionSize: sum('qfafSubscriptionSize'),
      annualEstOrdinaryLosses: sum('annualEstOrdinaryLosses'),
      section461Limit: section461Limit,
      carryForwardPrior: 0,
      carryForwardNext: results[results.length - 1]?.carryForwardNext || 0,
      writeOffAmount: sum('writeOffAmount'),
      taxSavings: sum('taxSavings'),
      advisorManagementFee: sum('advisorManagementFee'),
      quantinnoFees: sum('quantinnoFees'),
      totalFees: sum('totalFees'),
      netTaxBenefit: sum('netTaxBenefit'),
      qfafAlpha: sum('qfafAlpha'),
      quantinnoAlpha: sum('quantinnoAlpha'),
      totalAlpha: sum('totalAlpha'),
    };
  }, [results, section461Limit]);

  // Get strategy display name
  const getStrategyLabel = (strategyId: string) => {
    const strategy = STRATEGIES.find(s => s.id === strategyId);
    return strategy ? strategy.name.split(' ')[1] : strategyId; // e.g., "145/45"
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
                  handleAssumptionChange('initialQfafInvestment', parseFormattedNumber(e.target.value));
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
                  handleAssumptionChange('initialDealsInvestment', parseFormattedNumber(e.target.value));
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
                onChange={e => handleAssumptionChange('qfafGenerationRate', parseFloat(e.target.value))}
              />
              <div className="slider-labels">
                <span>100%</span>
                <span className="slider-hist-ref">
                  Hist: min {(HIST_ORD_LOSS_MIN * 100).toFixed(0)}%, max {(HIST_ORD_LOSS_MAX * 100).toFixed(0)}%, avg {(HIST_ORD_LOSS_AVG * 100).toFixed(0)}%
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
            Filing Status: {filingStatus.toUpperCase()} | §461(l) Limit: {formatCurrency(section461Limit)}
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
                  <th key={r.year} className="col-year">{r.calendarYear}</th>
                ))}
                <th className="col-total">Total</th>
              </tr>
            </thead>
            <tbody>
              {ROW_DEFINITIONS.map((rowDef) => (
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
                      <td className="hist-negative">{(breakdown.ordinaryIncome * 100).toFixed(2)}%</td>
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
                      <td className="hist-label hist-stat-label">{stat.charAt(0).toUpperCase() + stat.slice(1)}</td>
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
                      <td className="hist-negative">{(breakdown.ordinaryIncome * 100).toFixed(2)}%</td>
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
                      <td className="hist-label hist-stat-label">{stat.charAt(0).toUpperCase() + stat.slice(1)}</td>
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
            <strong>QFAF Subscription:</strong> Sized based on initial investment with Year 1 adjustment factor (1.049×), then decays ~7.7% annually.
          </li>
          <li>
            <strong>Deals Collateral:</strong> Calculated so total ST losses = QFAF ST gains. Combines Overlay (growing at {(QUANTINNO_ALPHA_RATE * 100).toFixed(2)}%) + Core collateral.
          </li>
          <li>
            <strong>Ordinary Losses:</strong> QFAF generates {(state.assumptions.qfafGenerationRate * 100).toFixed(0)}% of subscription as ordinary losses.
          </li>
          <li>
            <strong>§461(l) Limit:</strong> {formatCurrency(section461Limit)} for {filingStatus.toUpperCase()} filers. Excess carries forward as NOL.
          </li>
          <li>
            <strong>Carryforward Usage:</strong> Prior year carryforward is fully used in addition to the annual §461(l) limit.
          </li>
        </ul>
      </div>
    </div>
  );
}
