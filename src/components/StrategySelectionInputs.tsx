import { CalculatorInputs, AdvancedSettings, CalculationResult, SplitAllocation } from '../types';
import { STRATEGIES, Strategy, getStrategy, getLongLeverageRatio, getShortRatio } from '../strategyData';
import { StrategyRateEditor } from '../AdvancedMode/StrategyRateEditor';
import { formatCurrency, formatWithCommas, parseFormattedNumber, formatPercent } from '../utils/formatters';
import { InfoPopup } from '../InfoPopup';

const DEFAULT_SPLIT: SplitAllocation = {
  enabled: false,
  coreStrategyId: 'core-145-45',
  coreAmount: 3000000,
  overlayStrategyId: 'overlay-45-45',
  overlayAmount: 7000000,
};

function getSplit(inputs: CalculatorInputs): SplitAllocation {
  return inputs.splitAllocation ?? DEFAULT_SPLIT;
}

interface StrategySelectionInputsProps {
  inputs: CalculatorInputs;
  advancedSettings: AdvancedSettings;
  results: CalculationResult;
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
  const split = getSplit(inputs);
  const isSplitEnabled = inputs.splitAllocation?.enabled === true;

  const updateSplit = (patch: Partial<SplitAllocation>) => {
    onUpdateInput('splitAllocation', { ...split, ...patch });
  };

  const splitTotal = split.coreAmount + split.overlayAmount;

  return (
    <div className="input-sub-card">
      <div className="input-sub-card__label">Strategy Selection</div>

      <div className="input-group toggle-group">
        <label className="toggle-label">
          <input
            type="checkbox"
            checked={isSplitEnabled}
            onChange={e => updateSplit({ enabled: e.target.checked })}
          />
          <span className="toggle-switch"></span>
          Split allocation (Core + Overlay)
        </label>
        <span className="input-hint">
          {isSplitEnabled
            ? 'Cash funds a Core leg; appreciated stock funds an Overlay leg. QFAF auto-sizes against the combined ST losses.'
            : 'Single strategy: all collateral runs one Core or Overlay strategy.'}
        </span>
      </div>

      {isSplitEnabled ? (
        <>
          <div className="input-pair">
            <div className="input-group">
              <label htmlFor="core-strategy">Core Strategy (cash)</label>
              <select
                id="core-strategy"
                value={split.coreStrategyId}
                onChange={e => updateSplit({ coreStrategyId: e.target.value })}
              >
                {STRATEGIES.filter(s => s.type === 'core').map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <span className="input-hint">Cash invested in direct indexing</span>
            </div>
            <div className="input-group">
              <label htmlFor="core-amount">Core Allocation</label>
              <div className="input-with-prefix">
                <span className="prefix">$</span>
                <input
                  id="core-amount"
                  type="text"
                  inputMode="numeric"
                  value={formatWithCommas(split.coreAmount)}
                  onChange={e => updateSplit({ coreAmount: parseFormattedNumber(e.target.value) })}
                />
              </div>
            </div>
          </div>

          <div className="input-pair">
            <div className="input-group">
              <label htmlFor="overlay-strategy">Overlay Strategy (appreciated stock)</label>
              <select
                id="overlay-strategy"
                value={split.overlayStrategyId}
                onChange={e => updateSplit({ overlayStrategyId: e.target.value })}
              >
                {STRATEGIES.filter(s => s.type === 'overlay').map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <span className="input-hint">Existing appreciated stock used as collateral</span>
            </div>
            <div className="input-group">
              <label htmlFor="overlay-amount">Overlay Allocation</label>
              <div className="input-with-prefix">
                <span className="prefix">$</span>
                <input
                  id="overlay-amount"
                  type="text"
                  inputMode="numeric"
                  value={formatWithCommas(split.overlayAmount)}
                  onChange={e => updateSplit({ overlayAmount: parseFormattedNumber(e.target.value) })}
                />
              </div>
            </div>
          </div>

          <div className="input-hint" style={{ marginTop: '0.25rem' }}>
            Total collateral: <strong>{formatCurrency(splitTotal)}</strong>
            {splitTotal > 0 && (
              <>
                {' '}({formatPercent(split.coreAmount / splitTotal)} Core /{' '}
                {formatPercent(split.overlayAmount / splitTotal)} Overlay)
              </>
            )}
          </div>
        </>
      ) : (
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
      )}

      <div className="input-pair">
        <div className="input-group">
          <label htmlFor="startMonth">Start Month</label>
          <select
            id="startMonth"
            value={inputs.startMonth}
            onChange={e => onUpdateInput('startMonth', parseInt(e.target.value, 10))}
          >
            {[
              { value: 1, label: 'January', months: 12 },
              { value: 2, label: 'February', months: 11 },
              { value: 3, label: 'March', months: 10 },
              { value: 4, label: 'April', months: 9 },
              { value: 5, label: 'May', months: 8 },
              { value: 6, label: 'June', months: 7 },
              { value: 7, label: 'July', months: 6 },
              { value: 8, label: 'August', months: 5 },
              { value: 9, label: 'September', months: 4 },
              { value: 10, label: 'October', months: 3 },
              { value: 11, label: 'November', months: 2 },
              { value: 12, label: 'December', months: 1 },
            ].map(m => (
              <option key={m.value} value={m.value}>
                {m.label} ({m.months} {m.months === 1 ? 'month' : 'months'})
              </option>
            ))}
          </select>
          <span className="input-hint">
            {inputs.startMonth === 1
              ? 'Full calendar year'
              : `Year 1 pro-rated to ${13 - inputs.startMonth} months`}
          </span>
        </div>
        <div className="input-group" />
      </div>

      {/* Strategy Rate Info - shows Year 1 effective rates (includes custom overrides) */}
      {!isSplitEnabled && currentStrategy && results.years[0] && (
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
              {formatPercent(inputs.ltGainsEnabled ? currentStrategy.ltGainRate : 0)}
            </span>
          </div>
          <div className="strategy-rate">
            <span className="rate-label">Net Capital Loss (Y1):</span>
            <span className="rate-value highlight">
              {formatPercent(results.years[0].effectiveStLossRate - (inputs.ltGainsEnabled ? currentStrategy.ltGainRate : 0))}
            </span>
          </div>
          <button className="rate-editor-trigger" onClick={() => onSetRateEditorOpen(true)}>
            Edit Rates by Year
          </button>
        </div>
      )}
      {isSplitEnabled && results.years[0] && (() => {
        const coreStrat = getStrategy(split.coreStrategyId);
        const overlayStrat = getStrategy(split.overlayStrategyId);
        const blendedLt = splitTotal > 0 && coreStrat && overlayStrat
          ? (split.coreAmount * coreStrat.ltGainRate + split.overlayAmount * overlayStrat.ltGainRate) / splitTotal
          : 0;
        const blendedSt = results.years[0].effectiveStLossRate;
        return (
          <div className="strategy-rates-info">
            <div className="strategy-rate">
              <span className="rate-label">Blended ST Loss Rate (Y1):</span>
              <span className="rate-value positive">{formatPercent(blendedSt)}</span>
            </div>
            <div className="strategy-rate">
              <span className="rate-label">Blended LT Gain Rate:</span>
              <span className="rate-value negative">
                {formatPercent(inputs.ltGainsEnabled ? blendedLt : 0)}
              </span>
            </div>
            <div className="strategy-rate">
              <span className="rate-label">Net Capital Loss (Y1):</span>
              <span className="rate-value highlight">
                {formatPercent(blendedSt - (inputs.ltGainsEnabled ? blendedLt : 0))}
              </span>
            </div>
          </div>
        );
      })()}

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
              checked={!inputs.ltGainsEnabled}
              onChange={e => onUpdateInput('ltGainsEnabled', !e.target.checked)}
            />
            <span className="toggle-switch"></span>
            Net Out LT Gains
          </label>
          <span className="input-hint">
            {inputs.ltGainsEnabled
              ? 'LT gains included in projections'
              : 'LT gains netted out'}
          </span>
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
                // Simple mode: two components — wealth mgmt fee + manager fees
                <div className="fee-input-group simple-financing">
                  <div className="fee-input-group">
                    <label htmlFor="simpleWealthMgmt">Wealth Management Fee</label>
                    <div className="input-with-suffix">
                      <input
                        id="simpleWealthMgmt"
                        type="number"
                        step={0.05}
                        min={0}
                        max={3}
                        value={(advancedSettings.simpleWealthMgmtFee * 100).toFixed(2)}
                        onChange={e => {
                          const val = parseFloat(e.target.value) / 100;
                          if (!isNaN(val)) {
                            onUpdateSettings(s => ({ ...s, simpleWealthMgmtFee: val }));
                          }
                        }}
                      />
                      <span className="suffix">%</span>
                    </div>
                    <span className="input-hint">Applied to 100% of portfolio (no leverage multiplier)</span>
                  </div>
                  <div className="fee-input-group">
                    <label htmlFor="simpleManagerFee">Manager Fees</label>
                    {(() => {
                      const strategy = getStrategy(inputs.strategyId);
                      const leveragePct = strategy ? getShortRatio(strategy) : 0;
                      const managerFee = advancedSettings.simpleManagerFeeBase * leveragePct + advancedSettings.simpleManagerFeeFixed;
                      return (
                        <>
                          <div className="input-with-suffix">
                            <input
                              id="simpleManagerFee"
                              type="number"
                              disabled
                              value={(managerFee * 100).toFixed(2)}
                            />
                            <span className="suffix">%</span>
                          </div>
                          <span className="input-hint">
                            {strategy ? `${(advancedSettings.simpleManagerFeeBase * 100).toFixed(0)}bp × ${(leveragePct * 100).toFixed(0)}% leverage + ${(advancedSettings.simpleManagerFeeFixed * 10000).toFixed(1)}bp = ${(managerFee * 10000).toFixed(1)}bp` : '—'}
                          </span>
                        </>
                      );
                    })()}
                  </div>
                  {(() => {
                    const strategy = getStrategy(inputs.strategyId);
                    if (!strategy) return null;
                    const leveragePct = getShortRatio(strategy);
                    const managerFee = advancedSettings.simpleManagerFeeBase * leveragePct + advancedSettings.simpleManagerFeeFixed;
                    const totalEffective = advancedSettings.simpleWealthMgmtFee + managerFee;
                    const showDollars = inputs.collateralAmount > 0;
                    return (
                      <div className="financing-summary">
                        <strong>Total Effective Cost for {strategy.name}:</strong>
                        <div className="financing-breakdown">
                          <div>Wealth management: {(advancedSettings.simpleWealthMgmtFee * 100).toFixed(2)}%{showDollars && <span className="cost-dollars"> (${((advancedSettings.simpleWealthMgmtFee * inputs.collateralAmount) / 1000).toFixed(0)}K/year)</span>}</div>
                          <div>Manager fees: {(managerFee * 100).toFixed(2)}%{showDollars && <span className="cost-dollars"> (${((managerFee * inputs.collateralAmount) / 1000).toFixed(0)}K/year)</span>}</div>
                          <div className="financing-total">
                            <strong>Total: {(totalEffective * 100).toFixed(2)}% of portfolio</strong>
                            {showDollars && <strong className="cost-dollars"> (${((totalEffective * inputs.collateralAmount) / 1000).toFixed(0)}K/year)</strong>}
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                  <button
                    type="button"
                    className="customize-btn"
                    onClick={() => onUpdateSettings(s => ({ ...s, financingMode: 'detailed' }))}
                  >
                    Customize components →
                  </button>
                </div>
              ) : (
                // Detailed mode: component breakdown
                <>
                  <div className="financing-detailed-header">
                    <h4>Component Breakdown</h4>
                    <button
                      type="button"
                      className="simplify-btn"
                      onClick={() => onUpdateSettings(s => ({ ...s, financingMode: 'simple' }))}
                    >
                      ← Use simple mode
                    </button>
                  </div>
                  {(() => {
                    const strategy = getStrategy(inputs.strategyId);
                    const longLeverage = strategy ? getLongLeverageRatio(strategy) : 0;
                    const shortRatio = strategy ? getShortRatio(strategy) : 0;
                    const marginCost = advancedSettings.brokerMarginRate * longLeverage;
                    const borrowCost = advancedSettings.shortBorrowRate * shortRatio;
                    const dividendCost = advancedSettings.shortDividendRate * shortRatio;
                    return (
                      <>
                        <div className="fee-input-group">
                          <label htmlFor="brokerMargin">
                            Broker Margin Rate
                            {strategy && <span className="effective-cost"> → {(marginCost * 100).toFixed(2)}% of portfolio</span>}
                          </label>
                          <div className="input-with-suffix">
                            <input id="brokerMargin" type="number" step={0.25} min={0} max={20}
                              value={(advancedSettings.brokerMarginRate * 100).toFixed(2)}
                              onChange={e => { const val = parseFloat(e.target.value) / 100; if (!isNaN(val)) onUpdateSettings(s => ({ ...s, brokerMarginRate: val })); }}
                            />
                            <span className="suffix">%</span>
                          </div>
                          <span className="input-hint">
                            Applied to {strategy ? `${(longLeverage * 100).toFixed(0)}%` : '—'} long leverage
                            {strategy && ` (${(advancedSettings.brokerMarginRate * 100).toFixed(2)}% × ${(longLeverage * 100).toFixed(0)}% = ${(marginCost * 100).toFixed(2)}%)`}
                          </span>
                        </div>
                        <div className="fee-input-group">
                          <label htmlFor="shortBorrow">
                            Short Borrow Fee
                            {strategy && <span className="effective-cost"> → {(borrowCost * 100).toFixed(2)}% of portfolio</span>}
                          </label>
                          <div className="input-with-suffix">
                            <input id="shortBorrow" type="number" step={0.1} min={0} max={10}
                              value={(advancedSettings.shortBorrowRate * 100).toFixed(2)}
                              onChange={e => { const val = parseFloat(e.target.value) / 100; if (!isNaN(val)) onUpdateSettings(s => ({ ...s, shortBorrowRate: val })); }}
                            />
                            <span className="suffix">%</span>
                          </div>
                          <span className="input-hint">
                            Applied to {strategy ? `${(shortRatio * 100).toFixed(0)}%` : '—'} short positions
                            {strategy && ` (${(advancedSettings.shortBorrowRate * 100).toFixed(2)}% × ${(shortRatio * 100).toFixed(0)}% = ${(borrowCost * 100).toFixed(2)}%)`}
                          </span>
                        </div>
                        <div className="fee-input-group">
                          <label htmlFor="shortDividend">
                            Short Dividend Cost
                            {strategy && <span className="effective-cost"> → {(dividendCost * 100).toFixed(2)}% of portfolio</span>}
                          </label>
                          <div className="input-with-suffix">
                            <input id="shortDividend" type="number" step={0.1} min={0} max={5}
                              value={(advancedSettings.shortDividendRate * 100).toFixed(2)}
                              onChange={e => { const val = parseFloat(e.target.value) / 100; if (!isNaN(val)) onUpdateSettings(s => ({ ...s, shortDividendRate: val })); }}
                            />
                            <span className="suffix">%</span>
                          </div>
                          <span className="input-hint">
                            Applied to {strategy ? `${(shortRatio * 100).toFixed(0)}%` : '—'} short positions
                            {strategy && ` (${(advancedSettings.shortDividendRate * 100).toFixed(2)}% × ${(shortRatio * 100).toFixed(0)}% = ${(dividendCost * 100).toFixed(2)}%)`}
                          </span>
                        </div>
                        <div className="fee-input-group">
                          <label htmlFor="wealthMgmtFee">
                            Wealth Management Fee
                            {strategy && <span className="effective-cost"> → {(advancedSettings.wealthManagementFeeRate * 100).toFixed(2)}% of portfolio</span>}
                          </label>
                          <div className="input-with-suffix">
                            <input id="wealthMgmtFee" type="number" step={0.05} min={0} max={3}
                              value={(advancedSettings.wealthManagementFeeRate * 100).toFixed(2)}
                              onChange={e => { const val = parseFloat(e.target.value) / 100; if (!isNaN(val)) onUpdateSettings(s => ({ ...s, wealthManagementFeeRate: val })); }}
                            />
                            <span className="suffix">%</span>
                          </div>
                          <span className="input-hint">Applied to 100% of portfolio (no leverage multiplier)</span>
                        </div>
                      </>
                    );
                  })()}
                  {(() => {
                    const strategy = getStrategy(inputs.strategyId);
                    if (!strategy) return null;
                    const longLeverage = getLongLeverageRatio(strategy);
                    const shortRatio = getShortRatio(strategy);
                    const marginCost = advancedSettings.brokerMarginRate * longLeverage;
                    const borrowCost = advancedSettings.shortBorrowRate * shortRatio;
                    const dividendCost = advancedSettings.shortDividendRate * shortRatio;
                    const totalEffective = marginCost + borrowCost + dividendCost + advancedSettings.wealthManagementFeeRate;
                    const showDollars = inputs.collateralAmount > 0;
                    return (
                      <div className="financing-summary">
                        <strong>Total Effective Cost for {strategy.name}:</strong>
                        <div className="financing-breakdown">
                          <div>Margin interest: {(marginCost * 100).toFixed(2)}%{showDollars && <span className="cost-dollars"> (${((marginCost * inputs.collateralAmount) / 1000).toFixed(0)}K/year)</span>}</div>
                          <div>Stock borrow: {(borrowCost * 100).toFixed(2)}%{showDollars && <span className="cost-dollars"> (${((borrowCost * inputs.collateralAmount) / 1000).toFixed(0)}K/year)</span>}</div>
                          <div>Short dividends: {(dividendCost * 100).toFixed(2)}%{showDollars && <span className="cost-dollars"> (${((dividendCost * inputs.collateralAmount) / 1000).toFixed(0)}K/year)</span>}</div>
                          <div>Advisory fee: {(advancedSettings.wealthManagementFeeRate * 100).toFixed(2)}%{showDollars && <span className="cost-dollars"> (${((advancedSettings.wealthManagementFeeRate * inputs.collateralAmount) / 1000).toFixed(0)}K/year)</span>}</div>
                          <div className="financing-total">
                            <strong>Total: {(totalEffective * 100).toFixed(2)}% of portfolio</strong>
                            {showDollars && <strong className="cost-dollars"> (${((totalEffective * inputs.collateralAmount) / 1000).toFixed(0)}K/year)</strong>}
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </>
              )}
            </div>
          ) : (
            <span className="input-hint">No fees</span>
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
                  <strong>Sizing Mode:</strong> Dynamic (default) resizes QFAF each year to match
                  decaying EDI losses — minimizes ST gain leakage. Fixed holds QFAF constant
                  through the full duration.
                </p>
                <p>
                  <strong>QFAF Multiplier:</strong> Controls the size of the QFAF overlay relative to the
                  collateral. Historical range: 1.31x to 1.58x (avg 1.42x).
                </p>
                <p>
                  <strong>Sizing Window:</strong> Number of years averaged for QFAF sizing. Default: 5 years
                  (conservative multi-year average). Capped by Duration.
                </p>
                <p>
                  <strong>Duration:</strong> Years QFAF runs before breakeven unwind. Default: 5 years.
                  Reducing duration auto-caps the sizing window.
                </p>
                <p>
                  <strong>Sizing Cushion:</strong> Reduces auto-sized QFAF for conservative sizing.
                  Default: 0% (no cushion). Range: 0-10%.
                </p>
              </InfoPopup>
            </div>

            <div className="qfaf-sizing-mode-toggle">
              <label className="qfaf-sizing-mode-label">Sizing Mode</label>
              <div className="btn-group btn-group--compact" role="radiogroup" aria-label="QFAF sizing mode">
                <button
                  type="button"
                  role="radio"
                  aria-checked={inputs.qfafSizingMode === 'dynamic'}
                  className={`btn-group__btn${inputs.qfafSizingMode === 'dynamic' ? ' btn-group__btn--active' : ''}`}
                  onClick={() => onUpdateInput('qfafSizingMode', 'dynamic')}
                >
                  Dynamic
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={inputs.qfafSizingMode === 'fixed'}
                  className={`btn-group__btn${inputs.qfafSizingMode === 'fixed' ? ' btn-group__btn--active' : ''}`}
                  onClick={() => onUpdateInput('qfafSizingMode', 'fixed')}
                >
                  Fixed
                </button>
              </div>
              <span className="input-hint">
                {inputs.qfafSizingMode === 'dynamic'
                  ? 'QFAF resizes each year to match decaying EDI losses — reduces ST gain leakage'
                  : 'QFAF sized once at inception, held constant through duration'}
              </span>
            </div>

            <div className="input-pair">
              <div className="input-group">
                <label htmlFor="qfafMultiplier">QFAF Multiplier</label>
                <input
                  id="qfafMultiplier"
                  type="range"
                  min={1.25}
                  max={1.75}
                  step={0.01}
                  value={advancedSettings.qfafMultiplier}
                  aria-valuetext={`${(advancedSettings.qfafMultiplier * 100).toFixed(0)} percent`}
                  onChange={e => {
                    const val = parseFloat(e.target.value);
                    if (!isNaN(val)) {
                      onUpdateSettings(s => ({ ...s, qfafMultiplier: val }));
                    }
                  }}
                />
                <div className="slider-labels">
                  <span>125%</span>
                  <span className="current-value">{(advancedSettings.qfafMultiplier * 100).toFixed(0)}%</span>
                  <span>175%</span>
                </div>
                <span className="input-hint">
                  Historical: min 131%, max 158%, avg 142% — QFAF MV as % of collateral
                </span>
              </div>

              <div className="input-group">
                <label htmlFor="qfafSizingYears">Sizing Window (years)</label>
                {inputs.qfafDuration <= 1 ? (
                  <span className="static-value">1 year (determined by duration)</span>
                ) : (
                  <>
                    <input
                      id="qfafSizingYears"
                      type="range"
                      min={1}
                      max={inputs.qfafDuration}
                      step={1}
                      value={inputs.qfafSizingYears}
                      aria-valuetext={`${inputs.qfafSizingYears} ${inputs.qfafSizingYears === 1 ? 'year' : 'years'}`}
                      onChange={e => {
                        const val = parseInt(e.target.value, 10);
                        if (!isNaN(val)) {
                          onUpdateInput('qfafSizingYears', val);
                        }
                      }}
                    />
                    <div className="slider-labels">
                      <span>1 year</span>
                      <span className="current-value">{inputs.qfafSizingYears} {inputs.qfafSizingYears === 1 ? 'year' : 'years'}</span>
                      <span>{inputs.qfafDuration} {inputs.qfafDuration === 1 ? 'year' : 'years'}</span>
                    </div>
                  </>
                )}
                <span className="input-hint">
                  Years averaged for QFAF sizing — Default: 5 (capped by duration)
                </span>
              </div>
            </div>

            <div className="input-pair">
              <div className="input-group">
                <label htmlFor="qfafDuration">QFAF Duration</label>
                <input
                  id="qfafDuration"
                  type="range"
                  min={1}
                  max={10}
                  step={1}
                  value={inputs.qfafDuration}
                  aria-valuetext={`${inputs.qfafDuration} ${inputs.qfafDuration === 1 ? 'year' : 'years'}`}
                  onChange={e => {
                    const val = parseInt(e.target.value, 10);
                    if (!isNaN(val)) {
                      onUpdateInput('qfafDuration', val);
                      // Auto-cap sizing window if it exceeds new duration
                      if (inputs.qfafSizingYears > val) {
                        onUpdateInput('qfafSizingYears', val);
                      }
                    }
                  }}
                />
                <div className="slider-labels">
                  <span>1 year</span>
                  <span className="current-value">{inputs.qfafDuration} {inputs.qfafDuration === 1 ? 'year' : 'years'}</span>
                  <span>10 years</span>
                </div>
                <span className="input-hint">
                  Years QFAF runs before breakeven unwind — default: 5
                </span>
              </div>

              <div className="input-group">
                <label htmlFor="qfafSizingCushion">Sizing Cushion</label>
                <input
                  id="qfafSizingCushion"
                  type="range"
                  min={0}
                  max={0.10}
                  step={0.01}
                  value={inputs.qfafSizingCushion}
                  aria-valuetext={`${(inputs.qfafSizingCushion * 100).toFixed(0)} percent`}
                  onChange={e => {
                    const val = parseFloat(e.target.value);
                    if (!isNaN(val)) {
                      onUpdateInput('qfafSizingCushion', val);
                    }
                  }}
                />
                <div className="slider-labels">
                  <span>0%</span>
                  <span className="current-value">{(inputs.qfafSizingCushion * 100).toFixed(0)}%</span>
                  <span>10%</span>
                </div>
                <span className="input-hint">
                  Reduces auto-sized QFAF for conservative sizing
                </span>
              </div>
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
