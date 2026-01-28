import { useReducer, useCallback, useMemo } from 'react';
import { FilingStatus } from '../types';
import { STRATEGIES, getStLossRateForYear, SECTION_461L_LIMITS } from '../strategyData';
import { formatWithCommas, parseFormattedNumber, formatCurrency } from '../utils/formatters';
import './QfafTestByYear.css';

// Number of years to show in the table
const NUM_YEARS = 10;
const START_YEAR = 2026;

// Alpha rate constants
const QFAF_ALPHA_RATE = 0.0557; // 5.57%
const QUANTINNO_ALPHA_RATE = 0.0117; // 1.17%

// Fee rates (derived from Excel - percentage of Deals Collateral)
const ADVISOR_MGMT_FEE_RATE = 0.0057; // ~0.57%
const QFAF_FINANCING_FEE_RATE = 0.00536; // ~0.54%

// Loss rate multiplier (QFAF generates 150% ordinary losses)
const QFAF_LOSS_RATE = 1.5;

interface QfafTestByYearProps {
  filingStatus: FilingStatus;
}

// Get overlay and core strategies from strategy data
const OVERLAY_STRATEGIES = STRATEGIES.filter(s => s.type === 'overlay');
const CORE_STRATEGIES = STRATEGIES.filter(s => s.type === 'core');

// Assumptions state - editable inputs
interface Assumptions {
  initialQfafInvestment: number;
  initialDealsInvestment: number; // Overlay collateral
  overlayStrategyId: string; // e.g., 'overlay-45-45'
  coreStrategyId: string; // e.g., 'core-145-45'
  marginalTaxRate: number; // Combined federal + state
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

// Defaults matching the Excel screenshot
const DEFAULT_ASSUMPTIONS: Assumptions = {
  initialQfafInvestment: 1000000,
  initialDealsInvestment: 4700000,
  overlayStrategyId: 'overlay-45-45',
  coreStrategyId: 'core-145-45',
  marginalTaxRate: 0.541, // 54.1%
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

    // Annual estimated ordinary losses = QFAF × 150%
    const annualEstOrdinaryLosses = qfafSubscriptionSize * QFAF_LOSS_RATE;

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
            <strong>Ordinary Losses:</strong> QFAF generates {(QFAF_LOSS_RATE * 100).toFixed(0)}% of subscription as ordinary losses.
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
