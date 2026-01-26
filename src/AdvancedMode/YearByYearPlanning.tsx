import { YearOverride } from '../types';
import { FieldInfoPopup } from '../InfoPopup';

interface YearByYearPlanningProps {
  baseIncome: number;
  overrides: YearOverride[];
  onChange: (overrides: YearOverride[]) => void;
  onReset: () => void;
}

// Format number with commas for display
const formatWithCommas = (value: number) => {
  return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
};

// Parse comma-formatted string back to number
const parseFormattedNumber = (value: string) => {
  const parsed = Number(value.replace(/,/g, ''));
  return isNaN(parsed) ? 0 : parsed;
};

export function YearByYearPlanning({
  baseIncome,
  overrides,
  onChange,
  onReset,
}: YearByYearPlanningProps) {
  const handleChange = (
    year: number,
    field: keyof YearOverride,
    value: string | number
  ) => {
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

  // Check if any year has been modified from defaults
  const hasChanges = overrides.some(
    o => o.w2Income !== baseIncome || o.cashInfusion > 0 || o.note !== ''
  );

  return (
    <div className="year-by-year-planning">
      <p className="section-description">
        Model income changes and additional investments over time.
        Changes affect §461(l) limits and NOL usage calculations.
      </p>

      <div className="year-table-container">
        <table className="year-table">
          <thead>
            <tr>
              <th>Year</th>
              <th>
                W-2 Income
                <FieldInfoPopup contentKey="w2-income-override" />
              </th>
              <th>
                Cash Infusion
                <FieldInfoPopup contentKey="cash-infusion" />
              </th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {overrides.map(override => (
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
                  <input
                    type="text"
                    value={override.note}
                    onChange={e =>
                      handleChange(override.year, 'note', e.target.value)
                    }
                    maxLength={50}
                    placeholder="Optional note"
                    className="note-input"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="year-actions">
        <button
          type="button"
          onClick={onReset}
          className="btn-secondary"
          disabled={!hasChanges}
        >
          Reset to Default
        </button>
        {hasChanges && (
          <span className="changes-indicator">
            Changes will be applied to projections
          </span>
        )}
      </div>
    </div>
  );
}
