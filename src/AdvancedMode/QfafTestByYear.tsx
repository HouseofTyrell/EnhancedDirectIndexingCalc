import { useReducer, useCallback, useMemo, memo } from 'react';
import {
  QfafTestYearInput,
  QfafTestYearResult,
  QfafTestSummary,
  FilingStatus,
  SECTION_461_LIMITS_2026,
} from '../types';
import {
  computeQfafTestYears,
  computeQfafTestSummary,
  createDefaultQfafTestInputs,
  updateQfafTestInput,
  updateSection461LimitsForFilingStatus,
  isEditableField,
} from '../qfafTestCalculations';
import { formatWithCommas, parseFormattedNumber, formatCurrency } from '../utils/formatters';

// Number of years to show in the table
const NUM_YEARS = 10;

interface QfafTestByYearProps {
  filingStatus: FilingStatus;
}

// State machine for managing inputs and preventing race conditions
type State = {
  inputs: QfafTestYearInput[];
  pendingUpdate: { year: number; field: string; value: number } | null;
};

type Action =
  | { type: 'UPDATE_FIELD'; year: number; field: string; value: number }
  | { type: 'UPDATE_FILING_STATUS'; filingStatus: FilingStatus }
  | { type: 'RESET' };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'UPDATE_FIELD': {
      if (!isEditableField(action.field)) {
        return state;
      }
      const newInputs = updateQfafTestInput(
        state.inputs,
        action.year,
        action.field,
        action.value
      );
      return { ...state, inputs: newInputs, pendingUpdate: null };
    }
    case 'UPDATE_FILING_STATUS': {
      const newInputs = updateSection461LimitsForFilingStatus(state.inputs, action.filingStatus);
      return { ...state, inputs: newInputs };
    }
    case 'RESET': {
      return {
        inputs: createDefaultQfafTestInputs(NUM_YEARS),
        pendingUpdate: null,
      };
    }
    default:
      return state;
  }
}

// Memoized row component to prevent unnecessary re-renders
interface YearRowProps {
  result: QfafTestYearResult;
  onFieldChange: (year: number, field: string, value: number) => void;
}

const YearRow = memo(function YearRow({ result, onFieldChange }: YearRowProps) {
  const handleCurrencyChange = useCallback(
    (field: string, inputValue: string) => {
      const numericValue = parseFormattedNumber(inputValue);
      onFieldChange(result.year, field, numericValue);
    },
    [result.year, onFieldChange]
  );

  const handlePercentChange = useCallback(
    (field: string, inputValue: string) => {
      const parsed = parseFloat(inputValue);
      if (!Number.isFinite(parsed)) return;
      // Convert percentage to decimal (e.g., 45 → 0.45)
      const decimal = parsed / 100;
      onFieldChange(result.year, field, decimal);
    },
    [result.year, onFieldChange]
  );

  const handleRateChange = useCallback(
    (field: string, inputValue: string) => {
      const parsed = parseFloat(inputValue);
      if (!Number.isFinite(parsed)) return;
      onFieldChange(result.year, field, parsed);
    },
    [result.year, onFieldChange]
  );

  return (
    <tr>
      <td className="year-cell">{result.year}</td>
      {/* Editable: Cash Infusion */}
      <td>
        <div className="input-with-prefix compact">
          <span className="prefix">$</span>
          <input
            type="text"
            inputMode="numeric"
            value={formatWithCommas(result.cashInfusion)}
            onChange={e => handleCurrencyChange('cashInfusion', e.target.value)}
            className={result.cashInfusion > 0 ? 'modified' : ''}
          />
        </div>
      </td>
      {/* Editable: Marginal Tax Rate */}
      <td>
        <div className="input-with-suffix compact">
          <input
            type="number"
            min={0}
            max={60}
            step={0.1}
            value={(result.marginalTaxRate * 100).toFixed(1)}
            onChange={e => handlePercentChange('marginalTaxRate', e.target.value)}
            className="rate-input"
          />
          <span className="suffix">%</span>
        </div>
      </td>
      {/* Editable: Loss Rate */}
      <td>
        <div className="input-with-suffix compact">
          <input
            type="number"
            min={0}
            max={3}
            step={0.1}
            value={result.lossRate.toFixed(1)}
            onChange={e => handleRateChange('lossRate', e.target.value)}
            className="rate-input"
          />
          <span className="suffix">x</span>
        </div>
      </td>
      {/* Computed: Subscription Size */}
      <td className="computed">{formatCurrency(result.subscriptionSize)}</td>
      {/* Computed: Estimated Loss */}
      <td className="computed">{formatCurrency(result.estimatedOrdinaryLoss)}</td>
      {/* Computed: Allowed Loss (capped by §461(l)) */}
      <td className="computed highlight">{formatCurrency(result.allowedLoss)}</td>
      {/* Computed: Carryforward */}
      <td className="computed">{formatCurrency(result.carryForwardNext)}</td>
      {/* Computed: Tax Savings */}
      <td className="computed highlight positive">{formatCurrency(result.taxSavings)}</td>
      {/* Computed: Total Fees */}
      <td className="computed negative">{formatCurrency(result.totalFees)}</td>
      {/* Computed: Net Savings */}
      <td className={`computed ${result.netSavingsNoAlpha >= 0 ? 'positive' : 'negative'}`}>
        {formatCurrency(result.netSavingsNoAlpha)}
      </td>
    </tr>
  );
});

// Summary row component
interface SummaryRowProps {
  summary: QfafTestSummary;
}

function SummaryRow({ summary }: SummaryRowProps) {
  return (
    <tr className="summary-row">
      <td className="year-cell">Total</td>
      <td className="summary-value">{formatCurrency(summary.totalCashInfusion)}</td>
      <td className="summary-value">-</td>
      <td className="summary-value">-</td>
      <td className="summary-value">{formatCurrency(summary.totalSubscriptionSize)}</td>
      <td className="summary-value">{formatCurrency(summary.totalEstimatedOrdinaryLoss)}</td>
      <td className="summary-value highlight">{formatCurrency(summary.totalAllowedLoss)}</td>
      <td className="summary-value">{formatCurrency(summary.finalCarryForward)}</td>
      <td className="summary-value highlight positive">{formatCurrency(summary.totalTaxSavings)}</td>
      <td className="summary-value negative">{formatCurrency(summary.totalFees)}</td>
      <td className={`summary-value ${summary.totalNetSavingsNoAlpha >= 0 ? 'positive' : 'negative'}`}>
        {formatCurrency(summary.totalNetSavingsNoAlpha)}
      </td>
    </tr>
  );
}

export function QfafTestByYear({ filingStatus }: QfafTestByYearProps) {
  const [state, dispatch] = useReducer(reducer, null, () => ({
    inputs: createDefaultQfafTestInputs(NUM_YEARS, filingStatus),
    pendingUpdate: null,
  }));

  // Compute results from inputs (memoized)
  const results = useMemo(() => computeQfafTestYears(state.inputs), [state.inputs]);
  const summary = useMemo(() => computeQfafTestSummary(results), [results]);

  // Debounced field change handler
  const handleFieldChange = useCallback((year: number, field: string, value: number) => {
    dispatch({ type: 'UPDATE_FIELD', year, field, value });
  }, []);

  // Reset handler
  const handleReset = useCallback(() => {
    dispatch({ type: 'RESET' });
  }, []);

  // Check if any changes have been made
  const hasChanges = state.inputs.some(input => input.cashInfusion > 0);

  // Get the current §461(l) limit for display
  const section461Limit = SECTION_461_LIMITS_2026[filingStatus];

  return (
    <div className="qfaf-test-by-year">
      <p className="section-description">
        Model QFAF economics year-by-year. Enter annual cash infusions to see estimated
        tax savings, §461(l) limitations, and carryforward projections.
      </p>

      <div className="qfaf-info-bar">
        <span className="info-item">
          <strong>Filing Status:</strong> {filingStatus.toUpperCase()}
        </span>
        <span className="info-item">
          <strong>§461(l) Limit:</strong> {formatCurrency(section461Limit)}/year
        </span>
      </div>

      <div className="year-table-container qfaf-table-container">
        <table className="year-table qfaf-table">
          <thead>
            <tr>
              <th className="col-year">Yr</th>
              <th className="col-infusion">Cash Infusion</th>
              <th className="col-rate">Tax Rate</th>
              <th className="col-rate">Loss Rate</th>
              <th className="col-computed">Subscription</th>
              <th className="col-computed">Est. Loss</th>
              <th className="col-computed highlight">Allowed</th>
              <th className="col-computed">Carryforward</th>
              <th className="col-computed highlight">Tax Savings</th>
              <th className="col-computed">Fees</th>
              <th className="col-computed">Net Savings</th>
            </tr>
          </thead>
          <tbody>
            {results.map(result => (
              <YearRow
                key={result.year}
                result={result}
                onFieldChange={handleFieldChange}
              />
            ))}
            <SummaryRow summary={summary} />
          </tbody>
        </table>
      </div>

      <div className="year-actions">
        <button type="button" onClick={handleReset} className="btn-secondary" disabled={!hasChanges}>
          Reset to Default
        </button>
        {hasChanges && (
          <span className="changes-indicator">
            Projections updated based on your inputs
          </span>
        )}
      </div>

      <div className="qfaf-notes">
        <h4>Notes</h4>
        <ul>
          <li>
            <strong>Loss Rate:</strong> Multiplier for ordinary loss generation (1.5x = 150% of subscription)
          </li>
          <li>
            <strong>Allowed Loss:</strong> Capped by §461(l) excess business loss limitation
          </li>
          <li>
            <strong>Carryforward:</strong> Excess losses above §461(l) limit carry to future years as NOL
          </li>
          <li>
            <strong>Net Savings:</strong> Tax savings minus management and QFAF fees (excludes alpha)
          </li>
        </ul>
      </div>
    </div>
  );
}
