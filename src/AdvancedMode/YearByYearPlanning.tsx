import { memo } from 'react';
import { YearOverride, CashInfusionTaxType } from '../types';
import { InfoText } from '../InfoPopup';
import { formatWithCommas, parseFormattedNumber } from '../utils/formatters';
import './YearByYearPlanning.css';

/**
 * Props for the YearByYearPlanning component.
 * Models income changes, cash infusions, and liquidity constraints over the projection period.
 */
interface YearByYearPlanningProps {
  /** Default W-2 income used as the baseline for each year */
  baseIncome: number;
  /** Per-year override data including income, cash infusions, and notes */
  overrides: YearOverride[];
  /** Combined marginal tax rate (federal ST + state) for gross/net conversion display */
  combinedTaxRate: number;
  /** Callback fired when any year's override values are changed */
  onChange: (overrides: YearOverride[]) => void;
  /** Callback to reset all year overrides back to defaults */
  onReset: () => void;
}

export const YearByYearPlanning = memo(function YearByYearPlanning({
  baseIncome,
  overrides,
  combinedTaxRate,
  onChange,
  onReset,
}: YearByYearPlanningProps) {
  const handleChange = (year: number, field: keyof YearOverride, value: string | number) => {
    const newOverrides = overrides.map(override => {
      if (override.year === year) {
        return { ...override, [field]: value };
      }
      return override;
    });
    onChange(newOverrides);
  };

  const handleCurrencyChange = (
    year: number,
    field: 'w2Income' | 'cashInfusion',
    inputValue: string
  ) => {
    const numericValue = parseFormattedNumber(inputValue);
    handleChange(year, field, numericValue);
  };

  const handleTaxTypeChange = (year: number, taxType: CashInfusionTaxType) => {
    handleChange(year, 'cashInfusionTaxType', taxType);
  };

  // Check if any year has been modified from defaults
  const hasChanges = overrides.some(
    o => o.w2Income !== baseIncome || o.cashInfusion > 0 || o.note !== ''
  );

  return (
    <div className="year-by-year-planning">
      <p className="section-description">
        Model income changes and additional investments over time. Changes affect §461(l) limits and
        NOL usage calculations.
      </p>

      <div className="year-table-container">
        <table className="year-table">
          <thead>
            <tr>
              <th className="col-year">Yr</th>
              <th className="col-income">
                <InfoText contentKey="w2-income-override">W-2 Income</InfoText>
              </th>
              <th className="col-infusion">
                <InfoText contentKey="cash-infusion">Cash Infusion</InfoText>
              </th>
              <th className="col-tax-type">Type</th>
              <th className="col-infusion-detail">Investable</th>
              <th className="col-notes">Notes</th>
            </tr>
          </thead>
          <tbody>
            {overrides.map(override => {
              const hasInfusion = override.cashInfusion > 0;
              const taxType = override.cashInfusionTaxType ?? 'gross';
              const netAmount = taxType === 'gross'
                ? override.cashInfusion * (1 - combinedTaxRate)
                : override.cashInfusion;
              const grossAmount = taxType === 'net'
                ? override.cashInfusion / (1 - combinedTaxRate)
                : override.cashInfusion;

              return (
                <tr key={override.year}>
                  <td className="year-cell">{override.year}</td>
                  <td>
                    <div className="input-with-prefix compact">
                      <span className="prefix">$</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={formatWithCommas(override.w2Income)}
                        onChange={e =>
                          handleCurrencyChange(override.year, 'w2Income', e.target.value)
                        }
                        className={override.w2Income !== baseIncome ? 'modified' : ''}
                      />
                    </div>
                  </td>
                  <td>
                    <div className="input-with-prefix compact">
                      <span className="prefix">$</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={formatWithCommas(override.cashInfusion)}
                        onChange={e =>
                          handleCurrencyChange(override.year, 'cashInfusion', e.target.value)
                        }
                        className={override.cashInfusion > 0 ? 'modified' : ''}
                      />
                    </div>
                  </td>
                  <td>
                    {hasInfusion && (
                      <select
                        className="tax-type-select"
                        value={taxType}
                        onChange={e =>
                          handleTaxTypeChange(override.year, e.target.value as CashInfusionTaxType)
                        }
                      >
                        <option value="gross">Gross</option>
                        <option value="net">Net</option>
                      </select>
                    )}
                  </td>
                  <td className="infusion-detail-cell">
                    {hasInfusion && (
                      <div className="infusion-amounts">
                        {taxType === 'gross' ? (
                          <span className="infusion-net">
                            ${formatWithCommas(Math.round(netAmount))} net
                          </span>
                        ) : (
                          <span className="infusion-gross">
                            ${formatWithCommas(Math.round(grossAmount))} gross
                          </span>
                        )}
                      </div>
                    )}
                  </td>
                  <td>
                    <input
                      type="text"
                      value={override.note}
                      onChange={e => handleChange(override.year, 'note', e.target.value)}
                      maxLength={50}
                      placeholder="Optional note"
                      className="note-input"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="year-actions">
        <button type="button" onClick={onReset} className="btn-secondary" disabled={!hasChanges}>
          Reset to Default
        </button>
        {hasChanges && (
          <span className="changes-indicator">Changes will be applied to projections</span>
        )}
      </div>
    </div>
  );
});
