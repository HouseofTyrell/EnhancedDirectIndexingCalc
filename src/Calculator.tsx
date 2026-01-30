import { useState, useMemo, useCallback, lazy, Suspense } from 'react';
import { calculate, calculateWithOverrides, calculateWithSensitivity } from './calculations';

// Lazy load chart components to reduce initial bundle size (~400KB savings)
const TaxSavingsChart = lazy(() =>
  import('./WealthChart').then(m => ({ default: m.TaxSavingsChart }))
);
const PortfolioValueChart = lazy(() =>
  import('./WealthChart').then(m => ({ default: m.PortfolioValueChart }))
);
import { ResultsTable } from './ResultsTable';
import { DEFAULTS, STATES, getFederalStRate, getFederalLtRate, getStateRate } from './taxData';
import { STRATEGIES, getStrategy } from './strategyData';
import {
  CalculatorInputs,
  YearOverride,
  AdvancedSettings,
  DEFAULT_SETTINGS,
  SensitivityParams,
  DEFAULT_SENSITIVITY,
  FILING_STATUSES,
  FilingStatus,
} from './types';
import {
  InfoPopup,
  StrategyRatesFormula,
  ProjectionFormula,
} from './InfoPopup';
import { useAdvancedMode } from './hooks/useAdvancedMode';
import { useScrollHeader } from './hooks/useScrollHeader';
import { useQualifiedPurchaser } from './hooks/useQualifiedPurchaser';
import { StickyHeader } from './components/StickyHeader';
import { ResultsSummary } from './components/ResultsSummary';
import { TaxRatesDisplay } from './components/TaxRatesDisplay';
import { QualifiedPurchaserModal } from './components/QualifiedPurchaserModal';
import { SizingSummary } from './components/SizingSummary';
import { DisclaimerFooter } from './components/DisclaimerFooter';
import { OnboardingTour } from './components/OnboardingTour';
import { CollapsibleSection } from './AdvancedMode/CollapsibleSection';
import { YearByYearPlanning } from './AdvancedMode/YearByYearPlanning';
import { SensitivityAnalysis } from './AdvancedMode/SensitivityAnalysis';
import { ScenarioAnalysis } from './AdvancedMode/ScenarioAnalysis';
import { StrategyComparison } from './AdvancedMode/StrategyComparison';
import { SettingsPanel } from './AdvancedMode/SettingsPanel';
import { StrategyRateEditor } from './AdvancedMode/StrategyRateEditor';
import {
  formatWithCommas,
  parseFormattedNumber,
  formatPercent,
  parseStateRate,
} from './utils/formatters';

// Generate default year overrides for 10 years
const generateDefaultOverrides = (baseIncome: number): YearOverride[] => {
  return Array.from({ length: 10 }, (_, i) => ({
    year: i + 1,
    w2Income: baseIncome,
    cashInfusion: 0,
    note: '',
  }));
};

export function Calculator() {
  const [inputs, setInputs] = useState<CalculatorInputs>(DEFAULTS);
  const advancedMode = useAdvancedMode();
  const { isExpanded } = useScrollHeader('scroll-sentinel');
  const qualifiedPurchaser = useQualifiedPurchaser();

  // Advanced options inline toggle (always collapsed on page load)
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);

  // Year-by-Year Planning state
  const [yearOverrides, setYearOverrides] = useState<YearOverride[]>(() =>
    generateDefaultOverrides(DEFAULTS.annualIncome)
  );

  // Advanced Settings state
  const [advancedSettings, setAdvancedSettings] = useState<AdvancedSettings>(DEFAULT_SETTINGS);

  // Sensitivity Analysis state
  const [sensitivityParams, setSensitivityParams] =
    useState<SensitivityParams>(DEFAULT_SENSITIVITY);

  // Strategy Comparison state (default to current strategy + one other)
  const [comparisonStrategies, setComparisonStrategies] = useState<string[]>([
    STRATEGIES[1].id, // Core 145/45
    STRATEGIES[0].id, // Core 130/30
  ]);

  // Rate editor modal state
  const [isRateEditorOpen, setIsRateEditorOpen] = useState(false);

  // Rate version - increments when custom rates are saved to trigger recalculation
  const [rateVersion, setRateVersion] = useState(0);

  // Check if any year overrides differ from defaults
  const hasActiveOverrides = useMemo(
    () =>
      yearOverrides.some(
        o => o.w2Income !== inputs.annualIncome || o.cashInfusion !== 0
      ),
    [yearOverrides, inputs.annualIncome]
  );

  // Check if sensitivity params differ from defaults
  const hasActiveSensitivity = useMemo(
    () =>
      sensitivityParams.federalRateChange !== 0 ||
      sensitivityParams.stateRateChange !== 0 ||
      sensitivityParams.annualReturn !== DEFAULT_SENSITIVITY.annualReturn ||
      sensitivityParams.stLossRateVariance !== 0 ||
      sensitivityParams.ltGainRateVariance !== 0,
    [sensitivityParams]
  );

  const results = useMemo(() => {
    // Priority: Year overrides > Sensitivity > Base calculation
    // Note: Year overrides and sensitivity don't combine (would need a combined function)
    if (hasActiveOverrides) {
      return calculateWithOverrides(inputs, advancedSettings, yearOverrides);
    }
    if (hasActiveSensitivity) {
      return calculateWithSensitivity(inputs, advancedSettings, sensitivityParams);
    }
    return calculate(inputs, advancedSettings);
  }, [
    inputs,
    advancedSettings,
    rateVersion,
    hasActiveOverrides,
    yearOverrides,
    hasActiveSensitivity,
    sensitivityParams,
  ]);

  // Memoize tax rate calculations - only recalculates when dependencies change
  const taxRates = useMemo(() => {
    const federalStRate = getFederalStRate(inputs.annualIncome, inputs.filingStatus);
    const federalLtRate = getFederalLtRate(inputs.annualIncome, inputs.filingStatus);
    const stateRate =
      inputs.stateCode === 'OTHER' ? inputs.stateRate : getStateRate(inputs.stateCode);
    return {
      federalStRate,
      federalLtRate,
      stateRate,
      combinedStRate: federalStRate + stateRate,
      combinedLtRate: federalLtRate + stateRate,
      rateDifferential: federalStRate - federalLtRate,
    };
  }, [inputs.annualIncome, inputs.filingStatus, inputs.stateCode, inputs.stateRate]);

  const {
    federalStRate,
    federalLtRate,
    stateRate,
    combinedStRate,
    combinedLtRate,
    rateDifferential,
  } = taxRates;

  const updateInput = useCallback(
    <K extends keyof CalculatorInputs>(key: K, value: CalculatorInputs[K]) => {
      setInputs(prev => {
        const newInputs = { ...prev, [key]: value };
        // If income changes, update year overrides to use new base income
        if (key === 'annualIncome' && typeof value === 'number') {
          setYearOverrides(prevOverrides =>
            prevOverrides.map(override => ({
              ...override,
              w2Income: override.w2Income === prev.annualIncome ? value : override.w2Income,
            }))
          );
        }
        return newInputs;
      });
    },
    []
  );

  // Reset year overrides to defaults
  const resetYearOverrides = useCallback(() => {
    setYearOverrides(generateDefaultOverrides(inputs.annualIncome));
  }, [inputs.annualIncome]);

  // Reset advanced settings to defaults
  const resetAdvancedSettings = useCallback(() => {
    setAdvancedSettings(DEFAULT_SETTINGS);
  }, []);

  // Reset sensitivity params to defaults
  const resetSensitivityParams = useCallback(() => {
    setSensitivityParams(DEFAULT_SENSITIVITY);
  }, []);

  // Input validation (warn-only, does not block calculation)
  const validationWarnings = useMemo(() => {
    const warnings: Record<string, string> = {};
    if (inputs.collateralAmount > 0 && inputs.collateralAmount < 100_000) {
      warnings.collateral = 'Minimum recommended: $100,000';
    }
    if (inputs.collateralAmount > 100_000_000) {
      warnings.collateral = 'Unusually large — verify amount';
    }
    if (inputs.annualIncome > 100_000_000) {
      warnings.income = 'Unusually large — verify amount';
    }
    if (inputs.stateCode === 'OTHER' && inputs.stateRate > 0.15) {
      warnings.stateRate = 'Rate exceeds 15% — verify';
    }
    return warnings;
  }, [inputs.collateralAmount, inputs.annualIncome, inputs.stateCode, inputs.stateRate]);

  const currentStrategy = getStrategy(inputs.strategyId);

  // Compute collateral-only savings for incremental benefit comparison
  const collateralOnlyResults = useMemo(() => {
    const collateralOnlyInputs = { ...inputs, qfafEnabled: false };
    return calculate(collateralOnlyInputs, advancedSettings);
  }, [inputs, advancedSettings]);

  // Show QP acknowledgment modal if user hasn't acknowledged
  if (!qualifiedPurchaser.isAcknowledged) {
    return <QualifiedPurchaserModal onAcknowledge={qualifiedPurchaser.acknowledge} />;
  }

  return (
    <div className="calculator">
      <OnboardingTour />
      <StickyHeader
        strategyName={currentStrategy?.name ?? ''}
        collateral={inputs.collateralAmount}
        qfafValue={results.sizing.qfafValue}
        totalExposure={results.sizing.totalExposure}
        annualTaxSavings={results.years[0]?.taxSavings ?? 0}
        year2TaxSavings={
          inputs.qfafEnabled && results.years.length > 1 ? results.years[1]?.taxSavings : undefined
        }
        isExpanded={isExpanded}
        onOpenAdvanced={undefined}
      />

      <header className="header">
        <h1>Tax Optimization Calculator</h1>
        <p className="subtitle">QFAF + Collateral Strategy</p>
        <p className="header-description">
          Model tax-loss harvesting strategies with QFAF overlays and collateral optimization.
        </p>
      </header>

      {/* Scroll sentinel - triggers sticky header expansion when scrolled past */}
      <div id="scroll-sentinel" />

      {/* ========================================
          SECTION GROUP 1: INPUTS
          ======================================== */}
      <div className="section-group section-group--inputs">
        <div className="section-group__label">Inputs</div>

      {/* Input Form - Step 1: Your Situation */}
      <section className="inputs-section">
        <div className="section-number" data-step="1">
          Your Situation
        </div>
        <div className="section-header">
          <h2>Client Profile</h2>
          <InfoPopup title="Strategy Selection">
            <StrategyRatesFormula />
          </InfoPopup>
        </div>
        <p className="section-guidance">
          Tell us about your client's investment and tax profile. These inputs determine the
          strategy sizing and tax impact.
        </p>
        <div className="input-grid">
          {/* Sub-card: Strategy Selection */}
          <div className="input-sub-card" style={{ gridColumn: '1 / -1' }}>
          <div className="input-sub-card__label">Strategy Selection</div>
          <div className="input-pair">
            <div className="input-group">
              <label htmlFor="strategy">Collateral Strategy</label>
              <select
                id="strategy"
                value={inputs.strategyId}
                onChange={e => updateInput('strategyId', e.target.value)}
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
                    updateInput('collateralAmount', parseFormattedNumber(e.target.value))
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
              <button className="rate-editor-trigger" onClick={() => setIsRateEditorOpen(true)}>
                Edit Rates by Year
              </button>
            </div>
          )}

          {/* Strategy Rate Editor Modal */}
          <StrategyRateEditor
            isOpen={isRateEditorOpen}
            onClose={() => setIsRateEditorOpen(false)}
            onRatesChanged={() => setRateVersion(v => v + 1)}
          />

          {/* Toggle Row: QFAF + Portfolio Growth + Financing Fees */}
          <div className="input-group toggle-group toggle-row">
            <div className="toggle-row-item">
              <label className="toggle-label">
                <input
                  type="checkbox"
                  checked={inputs.qfafEnabled}
                  onChange={e => updateInput('qfafEnabled', e.target.checked)}
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
                        setAdvancedSettings(s => ({ ...s, growthEnabled: false }))
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
                        setAdvancedSettings(s => ({ ...s, defaultAnnualReturn: val }));
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
                        setAdvancedSettings(s => ({ ...s, growthEnabled: true }))
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
                    setAdvancedSettings(s => ({ ...s, financingFeesEnabled: e.target.checked }))
                  }
                />
                <span className="toggle-switch"></span>
                Financing Fees
              </label>
              <span className="input-hint">
                {advancedSettings.financingFeesEnabled
                  ? `${((currentStrategy?.financingCostRate ?? 0) * 100).toFixed(1)}% cost`
                  : 'No fees'}
              </span>
            </div>
          </div>

          {/* QFAF Sizing Window + Cushion (shown when QFAF enabled) */}
          {inputs.qfafEnabled && (
            <>
              <div className="input-group">
                <label htmlFor="sizingYears">
                  QFAF Sizing Window: {inputs.qfafSizingYears === 1 ? 'Year 1 only' : `Average of Years 1–${inputs.qfafSizingYears}`}
                </label>
                <input
                  id="sizingYears"
                  type="range"
                  min={1}
                  max={advancedSettings.projectionYears}
                  step={1}
                  value={inputs.qfafSizingYears}
                  onChange={e => updateInput('qfafSizingYears', parseInt(e.target.value, 10))}
                />
                <div className="allocation-labels">
                  <span>1 yr</span>
                  <span>{Math.ceil(advancedSettings.projectionYears / 2)} yrs</span>
                  <span>{advancedSettings.projectionYears} yrs</span>
                </div>
                <span className="input-hint">
                  Avg ST loss rate: {formatPercent(results.sizing.avgStLossRate)}
                  {inputs.qfafSizingYears === 1 ? ' (Year 1)' : ` (Yrs 1–${inputs.qfafSizingYears})`}
                </span>
              </div>

              <div className="input-group">
                <label htmlFor="sizingCushion">
                  QFAF Sizing Cushion: {(inputs.qfafSizingCushion * 100).toFixed(0)}%
                </label>
                <input
                  id="sizingCushion"
                  type="range"
                  min={0}
                  max={0.10}
                  step={0.01}
                  value={inputs.qfafSizingCushion}
                  onChange={e => updateInput('qfafSizingCushion', parseFloat(e.target.value))}
                />
                <div className="allocation-labels">
                  <span>0%</span>
                  <span>5%</span>
                  <span>10%</span>
                </div>
                <span className="input-hint">
                  Reduces QFAF size for conservative sizing
                </span>
              </div>

              <div className="input-group">
                <label htmlFor="generationRate">
                  QFAF Loss Generation Rate: {(advancedSettings.qfafMultiplier * 100).toFixed(0)}%
                </label>
                <input
                  id="generationRate"
                  type="range"
                  min={1.0}
                  max={1.5}
                  step={0.05}
                  value={advancedSettings.qfafMultiplier}
                  onChange={e => setAdvancedSettings(s => ({ ...s, qfafMultiplier: parseFloat(e.target.value) }))}
                />
                <div className="allocation-labels">
                  <span>100%</span>
                  <span>125%</span>
                  <span>150%</span>
                </div>
                <span className="input-hint">
                  Historical: min 131%, max 158%, avg 142% — Ordinary losses generated as % of QFAF MV
                </span>
              </div>
            </>
          )}

          </div>{/* end input-sub-card: Strategy Selection */}

          {/* Sub-card: Tax & Financial Profile */}
          <div className="input-sub-card" style={{ gridColumn: '1 / -1' }}>
          <div className="input-sub-card__label">Tax &amp; Financial Profile</div>
          <div className="input-pair">
            <div className="input-group">
              <label htmlFor="filing">Filing Status</label>
              <select
                id="filing"
                value={inputs.filingStatus}
                onChange={e => updateInput('filingStatus', e.target.value as FilingStatus)}
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
                  onChange={e => updateInput('annualIncome', parseFormattedNumber(e.target.value))}
                />
              </div>
              {validationWarnings.income && (
                <span className="input-warning-text">{validationWarnings.income}</span>
              )}
            </div>
          </div>

          <div className="input-group">
            <label htmlFor="state">State of Residence</label>
            <select
              id="state"
              value={inputs.stateCode}
              onChange={e => updateInput('stateCode', e.target.value)}
            >
              {STATES.map(s => (
                <option key={s.code} value={s.code}>
                  {s.name}
                </option>
              ))}
            </select>
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
                  onChange={e => updateInput('stateRate', parseStateRate(e.target.value))}
                />
                <span className="suffix">%</span>
              </div>
            </div>
          )}

          </div>{/* end input-sub-card: Tax & Financial Profile */}
        </div>

        {/* Advanced Options Toggle */}
        <div className="advanced-options-toggle">
          <button
            type="button"
            className={`advanced-options-btn ${showAdvancedOptions ? 'active' : ''}`}
            onClick={() => setShowAdvancedOptions(v => !v)}
          >
            <span className="toggle-icon">{showAdvancedOptions ? '▼' : '▶'}</span>
            Advanced Options
            {showAdvancedOptions && (
              <span className="advanced-options-hint">Carryforwards &amp; formula overrides</span>
            )}
          </button>
        </div>

        {/* Advanced Options Content (inline, no modal) */}
        {showAdvancedOptions && (
          <div className="advanced-options-content">
            {/* Existing Carryforwards */}
            <div className="advanced-options-section">
              <h3 className="advanced-options-section-title">Existing Carryforwards</h3>
              <div className="input-grid">
                <div className="input-group">
                  <label htmlFor="stCarry">Existing ST Loss Carryforward</label>
                  <div className="input-with-prefix">
                    <span className="prefix">$</span>
                    <input
                      id="stCarry"
                      type="text"
                      inputMode="numeric"
                      value={formatWithCommas(inputs.existingStLossCarryforward)}
                      onChange={e =>
                        updateInput('existingStLossCarryforward', parseFormattedNumber(e.target.value))
                      }
                    />
                  </div>
                </div>

                <div className="input-group">
                  <label htmlFor="ltCarry">Existing LT Loss Carryforward</label>
                  <div className="input-with-prefix">
                    <span className="prefix">$</span>
                    <input
                      id="ltCarry"
                      type="text"
                      inputMode="numeric"
                      value={formatWithCommas(inputs.existingLtLossCarryforward)}
                      onChange={e =>
                        updateInput('existingLtLossCarryforward', parseFormattedNumber(e.target.value))
                      }
                    />
                  </div>
                </div>

                <div className="input-group">
                  <label htmlFor="nolCarry">Existing NOL Carryforward</label>
                  <div className="input-with-prefix">
                    <span className="prefix">$</span>
                    <input
                      id="nolCarry"
                      type="text"
                      inputMode="numeric"
                      value={formatWithCommas(inputs.existingNolCarryforward)}
                      onChange={e =>
                        updateInput('existingNolCarryforward', parseFormattedNumber(e.target.value))
                      }
                    />
                  </div>
                  <span className="input-hint">Can offset 80% of future taxable income</span>
                </div>
              </div>
            </div>

            {/* Formula Constants */}
            <div className="advanced-options-section">
              <h3 className="advanced-options-section-title">Formula Constants</h3>
              <SettingsPanel
                settings={advancedSettings}
                onChange={setAdvancedSettings}
                onReset={resetAdvancedSettings}
              />
            </div>
          </div>
        )}

        {/* Reset to Defaults */}
        <div className="reset-defaults-row">
          <button
            type="button"
            className="reset-defaults-btn"
            onClick={() => {
              if (window.confirm('Reset all inputs to defaults? This cannot be undone.')) {
                setInputs(DEFAULTS);
                setYearOverrides(generateDefaultOverrides(DEFAULTS.annualIncome));
                setAdvancedSettings(DEFAULT_SETTINGS);
                setSensitivityParams(DEFAULT_SENSITIVITY);
                setComparisonStrategies([STRATEGIES[1].id, STRATEGIES[0].id]);
                setShowAdvancedOptions(false);
              }
            }}
          >
            Reset to Defaults
          </button>
        </div>
      </section>

      </div>{/* end section-group--inputs */}

      {/* ========================================
          SECTION GROUP 2: KEY ASSUMPTIONS
          ======================================== */}
      <div className="section-group section-group--assumptions">
        <div className="section-group__label">Key Assumptions</div>

      {/* Marginal Tax Rates - Step 2: Tax Rate Analysis */}
      <TaxRatesDisplay
        federalStRate={federalStRate}
        federalLtRate={federalLtRate}
        stateRate={stateRate}
        combinedStRate={combinedStRate}
        combinedLtRate={combinedLtRate}
        rateDifferential={rateDifferential}
      />

      {/* Strategy Sizing - Step 3: Optimized Strategy */}
      <SizingSummary
        results={results}
        filingStatus={inputs.filingStatus}
        qfafEnabled={inputs.qfafEnabled}
        combinedStRate={combinedStRate}
        combinedLtRate={combinedLtRate}
        rateDifferential={rateDifferential}
        qfafMultiplier={advancedSettings.qfafMultiplier}
      />

      </div>{/* end section-group--assumptions */}

      {/* ========================================
          SECTION GROUP 3: RESULTS
          ======================================== */}
      <div className="section-group section-group--results">
        <div className="section-group__label">Results</div>

      {/* Results Summary - headline metrics */}
      <ResultsSummary
        totalTaxSavings={results.summary.totalTaxSavings}
        finalPortfolioValue={results.summary.finalPortfolioValue}
        effectiveTaxAlpha={results.summary.effectiveTaxAlpha}
        totalNolGenerated={results.summary.totalNolGenerated}
        projectionYears={advancedSettings.projectionYears}
        collateralOnlyTaxSavings={collateralOnlyResults.summary.totalTaxSavings}
        collateralAmount={inputs.collateralAmount}
      />

      {/* Advanced Tools are now inline at the bottom of the page */}

      {/* Detailed Results - Step 4: Year-by-Year Breakdown */}
      <section className="results-section">
        <div className="section-number" data-step="4">
          Year-by-Year Breakdown
        </div>
        <div className="section-header">
          <h2>Estimated Detailed Projections</h2>
          <InfoPopup title="Projection Methodology">
            <ProjectionFormula qfafMultiplier={advancedSettings.qfafMultiplier} />
          </InfoPopup>
        </div>
        <p className="section-guidance">
          Estimated year-by-year breakdown showing how tax benefits compound over the{' '}
          {advancedSettings.projectionYears}-year projection period.
        </p>

        {/* Tax Benefits Chart */}
        <Suspense fallback={<div className="chart-loading">Loading chart...</div>}>
          <TaxSavingsChart data={results.years} />
        </Suspense>

        {/* Table */}
        <ResultsTable
          data={results.years}
          sizing={results.sizing}
          qfafEnabled={inputs.qfafEnabled}
          projectionYears={advancedSettings.projectionYears}
        />

        {/* Portfolio Value Chart */}
        <Suspense fallback={<div className="chart-loading">Loading chart...</div>}>
          <PortfolioValueChart
            data={results.years}
            trackingError={currentStrategy?.trackingError}
          />
        </Suspense>
      </section>

      {/* Actions */}
      <section className="actions">
        <button className="print-btn" onClick={() => window.print()}>
          Print / Save as PDF
        </button>
        <button
          className="export-btn"
          onClick={async () => {
            const { exportToExcel } = await import('./utils/excelExport');
            await exportToExcel({
              inputs,
              results,
              settings: advancedSettings,
              taxRates,
            });
          }}
        >
          Export to Excel
        </button>
      </section>

      </div>{/* end section-group--results */}

      {/* ========================================
          SECTION GROUP: ADVANCED TOOLS (collapsed)
          ======================================== */}
      <div className="section-group section-group--tools">
        <div className="section-group__label">Advanced Tools</div>

        <section className="advanced-tools-section">
          <div className="advanced-sections">
            <CollapsibleSection
              title="Year-by-Year Planning"
              expanded={advancedMode.state.sections.yearByYear}
              onToggle={() => advancedMode.toggleSection('yearByYear')}
              hint="Model income changes and cash infusions"
              icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>}
            >
              <YearByYearPlanning
                baseIncome={inputs.annualIncome}
                overrides={yearOverrides}
                onChange={setYearOverrides}
                onReset={resetYearOverrides}
              />
            </CollapsibleSection>

            <CollapsibleSection
              title="Sensitivity Analysis"
              expanded={advancedMode.state.sections.sensitivity}
              onToggle={() => advancedMode.toggleSection('sensitivity')}
              hint="Stress-test assumptions"
              icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg>}
            >
              <SensitivityAnalysis
                params={sensitivityParams}
                onChange={setSensitivityParams}
                onReset={resetSensitivityParams}
              />
            </CollapsibleSection>

            <CollapsibleSection
              title="Scenario Analysis"
              expanded={advancedMode.state.sections.scenarios}
              onToggle={() => advancedMode.toggleSection('scenarios')}
              hint="Bull/Base/Bear outcomes"
              icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>}
            >
              <ScenarioAnalysis inputs={inputs} settings={advancedSettings} />
            </CollapsibleSection>

            <CollapsibleSection
              title="Strategy Comparison"
              expanded={advancedMode.state.sections.comparison}
              onToggle={() => advancedMode.toggleSection('comparison')}
              hint="Compare 2-3 strategies"
              icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="3" x2="12" y2="21"/><polyline points="8 8 4 12 8 16"/><polyline points="16 8 20 12 16 16"/></svg>}
            >
              <StrategyComparison
                baseInputs={inputs}
                selectedStrategies={comparisonStrategies}
                onChange={setComparisonStrategies}
              />
            </CollapsibleSection>
          </div>
        </section>
      </div>{/* end section-group--tools */}

      {/* ========================================
          SECTION GROUP 4: METHODOLOGY / NOTES
          ======================================== */}
      <div className="section-group section-group--methodology">
        <div className="section-group__label">Methodology &amp; Notes</div>

      <DisclaimerFooter />

      </div>{/* end section-group--methodology */}
    </div>
  );
}
