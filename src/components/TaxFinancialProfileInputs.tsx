import { CalculatorInputs, FilingStatus, FILING_STATUSES } from '../types';
import { STATES, getStateConformityWarning } from '../taxData';
import { formatWithCommas, parseFormattedNumber, parseStateRate } from '../utils/formatters';

interface TaxFinancialProfileInputsProps {
  inputs: CalculatorInputs;
  validationWarnings: Record<string, string>;
  onUpdateInput: <K extends keyof CalculatorInputs>(
    key: K,
    value: CalculatorInputs[K]
  ) => void;
}

export function TaxFinancialProfileInputs({
  inputs,
  validationWarnings,
  onUpdateInput,
}: TaxFinancialProfileInputsProps) {
  return (
    <div className="input-sub-card">
      <div className="input-sub-card__label">Tax &amp; Financial Profile</div>
      <div className="input-triple">
        <div className="input-group">
          <label htmlFor="filing">Filing Status</label>
          <select
            id="filing"
            value={inputs.filingStatus}
            onChange={e => onUpdateInput('filingStatus', e.target.value as FilingStatus)}
          >
            {FILING_STATUSES.map(status => (
              <option key={status.value} value={status.value}>
                {status.label}
              </option>
            ))}
          </select>
        </div>

        <div className="input-group">
          <label htmlFor="income">Annual Income</label>
          <div className={`input-with-prefix ${validationWarnings.income ? 'input-warning' : ''}`}>
            <span className="prefix">$</span>
            <input
              id="income"
              type="text"
              inputMode="numeric"
              value={formatWithCommas(inputs.annualIncome)}
              onChange={e => onUpdateInput('annualIncome', parseFormattedNumber(e.target.value))}
            />
          </div>
          {validationWarnings.income && (
            <span className="input-warning-text">{validationWarnings.income}</span>
          )}
        </div>

        <div className="input-group">
          <label htmlFor="state">
            State
            {getStateConformityWarning(inputs.stateCode) && (
              <span className="conformity-indicator" tabIndex={0} aria-label="State tax conformity note">
                <span className="conformity-indicator__icon">&#9888;</span>
                <span className="conformity-indicator__tooltip">
                  <strong>State Tax Conformity Note</strong>
                  {getStateConformityWarning(inputs.stateCode)}
                </span>
              </span>
            )}
          </label>
          <select
            id="state"
            value={inputs.stateCode}
            onChange={e => onUpdateInput('stateCode', e.target.value)}
          >
            {STATES.map(s => (
              <option key={s.code} value={s.code}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {inputs.stateCode === 'OTHER' && (
        <div className="input-group">
          <label htmlFor="stateRate">State Tax Rate (%)</label>
          <div className="input-with-suffix">
            <input
              id="stateRate"
              type="number"
              step={0.1}
              min={0}
              max={15}
              value={(inputs.stateRate * 100).toFixed(1)}
              onChange={e => onUpdateInput('stateRate', parseStateRate(e.target.value))}
            />
            <span className="suffix">%</span>
          </div>
        </div>
      )}
    </div>
  );
}
