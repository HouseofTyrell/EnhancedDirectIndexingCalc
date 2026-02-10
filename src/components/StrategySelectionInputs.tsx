import { CalculatorInputs, AdvancedSettings, CalculationResults } from '../types';
import { STRATEGIES, Strategy } from '../strategyData';
import { StrategyRateEditor } from '../AdvancedMode/StrategyRateEditor';
import { formatWithCommas, parseFormattedNumber, formatPercent } from '../utils/formatters';
import { InfoPopup } from '../InfoPopup';

interface StrategySelectionInputsProps {
  inputs: CalculatorInputs;
  advancedSettings: AdvancedSettings;
  results: CalculationResults;
  currentStrategy?: Strategy;
  validationWarnings: Record<string, string>;
  isRateEditorOpen: boolean;
  onUpdateInput: <K extends keyof CalculatorInputs>(
    key: K,
    value: CalculatorInputs[K]
  ) => void;
  onUpdateSettings: (
    updater: (prev: AdvancedSettings) => AdvancedSettings
  ) => void;
  onSetRateEditorOpen: (open: boolean) => void;
  onRateVersionIncrement: () => void;
}

export function StrategySelectionInputs({
  inputs,
  advancedSettings,
  results,
  currentStrategy,
  validationWarnings,
  isRateEditorOpen,
  onUpdateInput,
  onUpdateSettings,
  onSetRateEditorOpen,
  onRateVersionIncrement,
}: StrategySelectionInputsProps) {
  return (
    <div className="input-sub-card" style={{ gridColumn: '1 / -1' }}>
      <div className="input-sub-card__label">Strategy Selection</div>
      <div className="input-pair">
        <div className="input-group">
          <label htmlFor="strategy">Collateral Strategy</label>
          <select
            id="strategy"
            value={inputs.strategyId}
            onChange={e => onUpdateInput('strategyId', e.target.value)}
          >
            <optgroup label="Core (Cash Funded)">
              {STRATEGIES.filter(s => s.type === 'core').map(s => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </optgroup>
            <optgroup label="Overlay (Appreciated Stock)">
              {STRATEGIES.filter(s => s.type === 'overlay').map(s => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </optgroup>
          </select>
          <span className="input-hint">
            {currentStrategy?.type === 'core'
              ? 'Cash invested in direct indexing'
              : 'Existing appreciated stock used as collateral'}
          </span>
        </div>

        <div className="input-group">
          <label htmlFor="collateral">Collateral Amount</label>
          <div className={`input-with-prefix ${validationWarnings.collateral ? 'input-warning' : ''}`}>
            <span className="prefix">$</span>
            <input
              id="collateral"
              type="text"
              inputMode="numeric"
              value={formatWithCommas(inputs.collateralAmount)}
              onChange={e =>
                onUpdateInput('collateralAmount', parseFormattedNumber(e.target.value))
              }
            />
          </div>
          {validationWarnings.collateral && (
            <span className="input-warning-text">{validationWarnings.collateral}</span>
          )}
        </div>
      </div>

      {/* Strategy Rate Info - shows Year 1 effective rates (includes custom overrides) */}
      {currentStrategy && results.years[0] && (
        <div className="strategy-rates-info">
          <div className="strategy-rate">
            <span className="rate-label">ST Loss Rate (Y1):</span>
            <span className="rate-value positive">
              {formatPercent(results.years[0].effectiveStLossRate)}
            </span>
          </div>
          <div className="strategy-rate">
            <span className="rate-label">LT Gain Rate:</span>
            <span className="rate-value negative">
              {formatPercent(currentStrategy.ltGainRate)}
            </span>
          </div>
          <div className="strategy-rate">
            <span className="rate-label">Net Capital Loss (Y1):</span>
            <span className="rate-value highlight">
              {formatPercent(results.years[0].effectiveStLossRate - currentStrategy.ltGainRate)}
            </span>
          </div>
          <button className="rate-editor-trigger" onClick={() => onSetRateEditorOpen(true)}>
            Edit Rates by Year
          </button>
        </div>
      )}

      {/* Strategy Rate Editor Modal */}
      <StrategyRateEditor
        isOpen={isRateEditorOpen}
        onClose={() => onSetRateEditorOpen(false)}
        onRatesChanged={onRateVersionIncrement}
      />

      {/* Toggle Row: QFAF + Portfolio Growth + Financing Fees */}
      <div className="input-group toggle-group toggle-row">
        <div className="toggle-row-item">
          <label className="toggle-label">
            <input
              type="checkbox"
              checked={inputs.qfafEnabled}
              onChange={e => onUpdateInput('qfafEnabled', e.target.checked)}
            />
            <span className="toggle-switch"></span>
            QFAF Overlay
          </label>
          <span className="input-hint">
            {inputs.qfafEnabled
              ? 'ST gains + ordinary losses'
              : 'Collateral-only'}
          </span>
        </div>

        <div className="toggle-row-item">
          {advancedSettings.growthEnabled ? (
            <>
              <label className="toggle-label toggle-label-slider">
                <input
                  type="checkbox"
                  checked={true}
                  onChange={() =>
                    onUpdateSettings(s => ({ ...s, growthEnabled: false }))
                  }
                />
                <span className="toggle-switch"></span>
                Growth: {(advancedSettings.defaultAnnualReturn * 100).toFixed(1)}%
              </label>
              <input
                id="annualReturnInline"
                type="range"
                className="inline-slider"
                min={-0.20}
                max={0.30}
                step={0.005}
                value={advancedSettings.defaultAnnualReturn}
                onChange={e => {
                  const val = parseFloat(e.target.value);
                  if (!isNaN(val)) {
                    onUpdateSettings(s => ({ ...s, defaultAnnualReturn: val }));
                  }
                }}
              />
            </>
          ) : (
            <>
              <label className="toggle-label">
                <input
                  type="checkbox"
                  checked={false}
                  onChange={() =>
                    onUpdateSettings(s => ({ ...s, growthEnabled: true }))
                  }
                />
                <span className="toggle-switch"></span>
                Portfolio Growth
              </label>
              <span className="input-hint">No growth (0%)</span>
            </>
          )}
        </div>

        <div className="toggle-row-item">
          <label className="toggle-label">
            <input
              type="checkbox"
              checked={advancedSettings.financingFeesEnabled}
              onChange={e =>
                onUpdateSettings(s => ({ ...s, financingFeesEnabled: e.target.checked }))
              }
            />
            <span className="toggle-switch"></span>
            Financing Fees
          </label>
          {advancedSettings.financingFeesEnabled ? (
            <div className="fee-inputs">
              {advancedSettings.financingMode === 'simple' ? (
                // Simple mode: single effective rate
                <div className="fee-input-group simple-financing">
                  <label htmlFor="simpleFinancing">Effective Rate</label>
                  <div className="input-with-suffix">
                    <input
                      id="simpleFinancing"
                      type="number"
                      step={0.25}
                      min={0}
                      max={10}
                      value={(advancedSettings.effectiveFinancingRate * 100).toFixed(2)}
                      onChange={e => {
                        const val = parseFloat(e.target.value) / 100;
                        if (!isNaN(val)) {
                          onUpdateSettings(s => ({ ...s, effectiveFinancingRate: val }));
                        }
                      }}
                    />
                    <span className="suffix">%</span>
                  </div>
                  <button
                    type="button"
                    className="mode-toggle-btn"
                    onClick={() =>
                      onUpdateSettings(s => ({ ...s, financingMode: 'breakdown' }))
                    }
                  >
                    Show Breakdown
                  </button>
                </div>
              ) : (
                // Breakdown mode: custodian + wealth management
                <div className="fee-input-group breakdown-financing">
                  <div className="fee-breakdown-row">
                    <label htmlFor="custodianFee">Custodian</label>
                    <div className="input-with-suffix">
                      <input
                        id="custodianFee"
                        type="number"
                        step={0.25}
                        min={0}
                        max={10}
                        value={(advancedSettings.custodianFeeRate * 100).toFixed(2)}
                        onChange={e => {
                          const val = parseFloat(e.target.value) / 100;
                          if (!isNaN(val)) {
                            onUpdateSettings(s => ({ ...s, custodianFeeRate: val }));
                          }
                        }}
                      />
                      <span className="suffix">%</span>
                    </div>
                  </div>
                  <div className="fee-breakdown-row">
                    <label htmlFor="wealthMgmtFee">Wealth Mgmt</label>
                    <div className="input-with-suffix">
                      <input
                        id="wealthMgmtFee"
                        type="number"
                        step={0.25}
                        min={0}
                        max={10}
                        value={(advancedSettings.wealthManagementFeeRate * 100).toFixed(2)}
                        onChange={e => {
                          const val = parseFloat(e.target.value) / 100;
                          if (!isNaN(val)) {
                            onUpdateSettings(s => ({ ...s, wealthManagementFeeRate: val }));
                          }
                        }}
                      />
                      <span className="suffix">%</span>
                    </div>
                  </div>
                  <div className="fee-total">
                    Total: {((advancedSettings.custodianFeeRate + advancedSettings.wealthManagementFeeRate) * 100).toFixed(2)}%
                  </div>
                  <button
                    type="button"
                    className="mode-toggle-btn"
                    onClick={() => {
                      const totalRate = advancedSettings.custodianFeeRate + advancedSettings.wealthManagementFeeRate;
                      onUpdateSettings(s => ({
                        ...s,
                        financingMode: 'simple',
                        effectiveFinancingRate: totalRate
                      }));
                    }}
                  >
                    Use Single Rate
                  </button>
                </div>
              )}
            </div>
          ) : (
            <span className="input-hint">No financing costs</span>
          )}
        </div>
      </div>

      {/* QFAF-specific inputs (only shown when QFAF is enabled) */}
      {inputs.qfafEnabled && (
        <>
          <div className="qfaf-inputs-section">
            <div className="qfaf-inputs-header">
              <h4>QFAF Configuration</h4>
              <InfoPopup title="QFAF Overlay Parameters">
                <p>
                  <strong>QFAF Multiplier:</strong> Controls the size of the QFAF overlay relative to the
                  collateral. Historical range: 1.31x to 1.58x (avg 1.42x).
                </p>
                <p>
                  <strong>Sizing Window:</strong> Number of days for QFAF sizing window. Default: 5 days
                  (matches current production behavior).
                </p>
              </InfoPopup>
            </div>

            <div className="input-pair">
              <div className="input-group">
                <label htmlFor="qfafMultiplier">QFAF Multiplier</label>
                <input
                  id="qfafMultiplier"
                  type="range"
                  min={1.0}
                  max={1.75}
                  step={0.01}
                  value={advancedSettings.qfafMultiplier}
                  onChange={e => {
                    const val = parseFloat(e.target.value);
                    if (!isNaN(val)) {
                      onUpdateSettings(s => ({ ...s, qfafMultiplier: val }));
                    }
                  }}
                />
                <div className="slider-labels">
                  <span>100%</span>
                  <span className="current-value">{(advancedSettings.qfafMultiplier * 100).toFixed(0)}%</span>
                  <span>175%</span>
                </div>
                <span className="input-hint">
                  Historical: min 131%, max 158%, avg 142% — QFAF MV as % of collateral
                </span>
              </div>

              <div className="input-group">
                <label htmlFor="qfafSizingWindow">Sizing Window (days)</label>
                <input
                  id="qfafSizingWindow"
                  type="range"
                  min={1}
                  max={10}
                  step={1}
                  value={advancedSettings.qfafSizingWindow}
                  onChange={e => {
                    const val = parseInt(e.target.value, 10);
                    if (!isNaN(val)) {
                      onUpdateSettings(s => ({ ...s, qfafSizingWindow: val }));
                    }
                  }}
                />
                <div className="slider-labels">
                  <span>1 day</span>
                  <span className="current-value">{advancedSettings.qfafSizingWindow} days</span>
                  <span>10 days</span>
                </div>
                <span className="input-hint">
                  Days used to size QFAF — Default: 5 days (matches current production)
                </span>
              </div>
            </div>

            <div className="input-group">
              <label htmlFor="ordinaryLossRate">Ordinary Loss Rate (%)</label>
              <input
                id="ordinaryLossRate"
                type="range"
                min={1.0}
                max={1.5}
                step={0.01}
                value={advancedSettings.ordinaryLossRate}
                onChange={e => {
                  const val = parseFloat(e.target.value);
                  if (!isNaN(val)) {
                    onUpdateSettings(s => ({ ...s, ordinaryLossRate: val }));
                  }
                }}
              />
              <div className="slider-labels">
                <span>100%</span>
                <span>125%</span>
                <span>150%</span>
              </div>
              <span className="input-hint">
                Historical: min 131%, max 158%, avg 142% — Ordinary losses generated as % of QFAF MV
              </span>
            </div>

            {/* QFAF Annual Return (separate from collateral growth rate) */}
            {advancedSettings.growthEnabled && (
              <div className="input-group">
                <label htmlFor="qfafAnnualReturn">
                  <InfoPopup title="QFAF Return Rate">
                    <p>
                      QFAF may have different return characteristics than index-tracking collateral due to:
                    </p>
                    <ul>
                      <li>Active management fees</li>
                      <li>Hedging costs for overlay exposure</li>
                      <li>Different asset allocation or strategy</li>
                    </ul>
                    <p>
                      <strong>Default:</strong> Use same rate as collateral ({(advancedSettings.defaultAnnualReturn * 100).toFixed(1)}%)
                    </p>
                    <p>
                      <strong>Override:</strong> Set a separate return assumption for QFAF growth modeling
                    </p>
                  </InfoPopup>
                  {' '}QFAF Return Rate (%)
                </label>
                <div className="qfaf-return-controls">
                  <label className="use-default-checkbox">
                    <input
                      type="checkbox"
                      checked={advancedSettings.qfafAnnualReturn === null}
                      onChange={e => {
                        if (e.target.checked) {
                          onUpdateSettings(s => ({ ...s, qfafAnnualReturn: null }));
                        } else {
                          onUpdateSettings(s => ({ ...s, qfafAnnualReturn: s.defaultAnnualReturn }));
                        }
                      }}
                    />
                    <span>Use collateral rate ({(advancedSettings.defaultAnnualReturn * 100).toFixed(1)}%)</span>
                  </label>
                  {advancedSettings.qfafAnnualReturn !== null && (
                    <>
                      <input
                        id="qfafAnnualReturn"
                        type="range"
                        className="inline-slider"
                        min={-0.20}
                        max={0.30}
                        step={0.005}
                        value={advancedSettings.qfafAnnualReturn}
                        onChange={e => {
                          const val = parseFloat(e.target.value);
                          if (!isNaN(val)) {
                            onUpdateSettings(s => ({ ...s, qfafAnnualReturn: val }));
                          }
                        }}
                      />
                      <div className="slider-labels">
                        <span>-20%</span>
                        <span className="current-value">{(advancedSettings.qfafAnnualReturn * 100).toFixed(1)}%</span>
                        <span>+30%</span>
                      </div>
                    </>
                  )}
                </div>
                <span className="input-hint">
                  {advancedSettings.qfafAnnualReturn === null
                    ? `QFAF growing at collateral rate (${(advancedSettings.defaultAnnualReturn * 100).toFixed(1)}%)`
                    : `QFAF growing at ${(advancedSettings.qfafAnnualReturn * 100).toFixed(1)}% vs collateral ${(advancedSettings.defaultAnnualReturn * 100).toFixed(1)}%`
                  }
                </span>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
