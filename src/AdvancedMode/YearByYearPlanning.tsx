import { YearOverride, LiquidityParams, DEFAULT_LIQUIDITY } from '../types';
import { InfoText } from '../InfoPopup';
import { formatWithCommas, parseFormattedNumber } from '../utils/formatters';

interface YearByYearPlanningProps {
  baseIncome: number;
  overrides: YearOverride[];
  onChange: (overrides: YearOverride[]) => void;
  onReset: () => void;
  liquidityParams?: LiquidityParams;
  onLiquidityChange?: (params: LiquidityParams) => void;
}

export function YearByYearPlanning({
  baseIncome,
  overrides,
  onChange,
  onReset,
  liquidityParams = DEFAULT_LIQUIDITY,
  onLiquidityChange,
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
              <th className="col-notes">Notes</th>
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
                    onChange={e => handleChange(override.year, 'note', e.target.value)}
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
        <button type="button" onClick={onReset} className="btn-secondary" disabled={!hasChanges}>
          Reset to Default
        </button>
        {hasChanges && (
          <span className="changes-indicator">Changes will be applied to projections</span>
        )}
      </div>

      {/* Liquidity Constraints */}
      <div className="liquidity-section">
        <h4>Liquidity Constraints</h4>
        <p className="section-description">
          QFAF investments typically have lock-up periods and early redemption penalties. Consider
          these constraints when planning withdrawals.
        </p>

        <div className="liquidity-grid">
          <div className="liquidity-item">
            <label>QFAF Lock-up Period</label>
            <div className="liquidity-input-group">
              <input
                type="number"
                min={0}
                max={10}
                value={liquidityParams.qfafLockupYears}
                onChange={e =>
                  onLiquidityChange?.({
                    ...liquidityParams,
                    qfafLockupYears: parseInt(e.target.value) || 0,
                  })
                }
              />
              <span className="input-suffix">years</span>
            </div>
            <span className="liquidity-hint">Capital locked for initial period</span>
          </div>

          <div className="liquidity-item">
            <label>Early Redemption Penalty</label>
            <div className="liquidity-input-group">
              <input
                type="number"
                min={0}
                max={20}
                step={0.5}
                value={(liquidityParams.qfafRedemptionPenalty * 100).toFixed(1)}
                onChange={e =>
                  onLiquidityChange?.({
                    ...liquidityParams,
                    qfafRedemptionPenalty: parseFloat(e.target.value) / 100 || 0,
                  })
                }
              />
              <span className="input-suffix">%</span>
            </div>
            <span className="liquidity-hint">Penalty for early withdrawal</span>
          </div>

          <div className="liquidity-item">
            <label>Emergency Fund Target</label>
            <div className="liquidity-input-group">
              <input
                type="number"
                min={0}
                max={24}
                value={liquidityParams.emergencyFundTarget}
                onChange={e =>
                  onLiquidityChange?.({
                    ...liquidityParams,
                    emergencyFundTarget: parseInt(e.target.value) || 0,
                  })
                }
              />
              <span className="input-suffix">months</span>
            </div>
            <span className="liquidity-hint">Recommended liquid reserves</span>
          </div>
        </div>

        <div className="liquidity-warning">
          <strong>Important:</strong> Years 1-{liquidityParams.qfafLockupYears} of QFAF investment
          are locked. Early redemption incurs a{' '}
          {(liquidityParams.qfafRedemptionPenalty * 100).toFixed(0)}% penalty. Maintain{' '}
          {liquidityParams.emergencyFundTarget} months of income in liquid assets.
        </div>
      </div>
    </div>
  );
}
