import { useState, useMemo, useCallback, useEffect } from 'react';
import { calculate, calculateWithOverrides, calculateWithSensitivity } from './calculations';
import { DEFAULTS, getFederalStRate, getFederalLtRate, getStateRate } from './taxData';
import { STRATEGIES, getStrategy, getLongLeverageRatio, getShortRatio } from './strategyData';
import {
  CalculatorInputs,
  YearOverride,
  AdvancedSettings,
  DEFAULT_SETTINGS,
  SensitivityParams,
  DEFAULT_SENSITIVITY,
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
import { AdvancedOptionsPanel } from './components/AdvancedOptionsPanel';
import { ResultsChartsSection } from './components/ResultsChartsSection';
import { TaxFinancialProfileInputs } from './components/TaxFinancialProfileInputs';
import { StrategySelectionInputs } from './components/StrategySelectionInputs';
import { KeyboardShortcutsHelp } from './components/KeyboardShortcutsHelp';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { usePinnedScenario } from './hooks/usePinnedScenario';
import { usePinnedElements } from './hooks/usePinnedElements';
import { ScenarioComparisonPanel } from './components/ScenarioComparisonPanel';
import { PinnableSection } from './components/PinnableSection';
import { FloatingPinnedPanel } from './components/FloatingPinnedPanel';
import { CollapsibleSection } from './AdvancedMode/CollapsibleSection';
import { YearByYearPlanning } from './AdvancedMode/YearByYearPlanning';
import { SensitivityAnalysis } from './AdvancedMode/SensitivityAnalysis';
import { ScenarioAnalysis } from './AdvancedMode/ScenarioAnalysis';
import { StrategyComparison } from './AdvancedMode/StrategyComparison';

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
  const pinnedScenario = usePinnedScenario();
  const pinnedElements = usePinnedElements();

  // Year-by-Year Planning state
  const [yearOverrides, setYearOverrides] = useState<YearOverride[]>(() =>
    generateDefaultOverrides(DEFAULTS.annualIncome)
  );

  // Advanced Settings state
  const [advancedSettings, setAdvancedSettings] = useState<AdvancedSettings>(DEFAULT_SETTINGS);

  // Auto-update simple financing rate when strategy changes (unless user is in detailed mode)
  useEffect(() => {
    if (advancedSettings.financingMode !== 'simple') return;
    const strategy = getStrategy(inputs.strategyId);
    if (!strategy) return;
    const longLeverage = getLongLeverageRatio(strategy);
    const shortRatio = getShortRatio(strategy);
    const calculatedRate =
      advancedSettings.brokerMarginRate * longLeverage +
      (advancedSettings.shortBorrowRate + advancedSettings.shortDividendRate) * shortRatio +
      advancedSettings.wealthManagementFeeRate;
    setAdvancedSettings(prev => ({ ...prev, simpleFinancingRate: calculatedRate }));
  }, [inputs.strategyId]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // Keyboard shortcuts help modal state
  const [showKeyboardHelp, setShowKeyboardHelp] = useState(false);

  // Handlers for keyboard shortcuts (will be set by ResultsChartsSection)
  const [printHandler, setPrintHandler] = useState<(() => void) | null>(null);
  const [exportHandler, setExportHandler] = useState<(() => void) | null>(null);

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

  // Pin/unpin scenario handlers
  const handlePinScenario = useCallback(() => {
    if (pinnedScenario.hasPinned) {
      pinnedScenario.unpin();
    } else {
      pinnedScenario.pin(inputs, advancedSettings, results);
    }
  }, [inputs, advancedSettings, results, pinnedScenario]);

  const handleRestorePinned = useCallback(() => {
    const state = pinnedScenario.getPinnedState();
    if (state && window.confirm('Restore pinned inputs? Current values will be replaced.')) {
      setInputs(state.inputs);
      setAdvancedSettings(state.advancedSettings);
      setYearOverrides(generateDefaultOverrides(state.inputs.annualIncome));
    }
  }, [pinnedScenario]);

  // Auto-pin comparison panel to floating panel when scenario is pinned
  useEffect(() => {
    if (pinnedScenario.hasPinned) {
      pinnedElements.pin('comparison');
    } else {
      pinnedElements.unpin('comparison');
    }
  }, [pinnedScenario.hasPinned]); // eslint-disable-line react-hooks/exhaustive-deps

  // Setup keyboard shortcuts (after all handlers are defined)
  useKeyboardShortcuts({
    onPrint: printHandler || undefined,
    onExport: exportHandler || undefined,
    onShowHelp: () => setShowKeyboardHelp(true),
    onEscape: () => setShowKeyboardHelp(false),
    onPin: handlePinScenario,
  });

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
        hasPinnedScenario={pinnedScenario.hasPinned}
        onPinScenario={() => pinnedScenario.pin(inputs, advancedSettings, results)}
        onUnpinScenario={pinnedScenario.unpin}
        pinnedValues={pinnedScenario.pinned ? {
          collateral: pinnedScenario.pinned.inputs.collateralAmount,
          qfafValue: pinnedScenario.pinned.results.sizing.qfafValue,
          annualTaxSavings: pinnedScenario.pinned.results.years[0]?.taxSavings ?? 0,
          year2TaxSavings: pinnedScenario.pinned.inputs.qfafEnabled && pinnedScenario.pinned.results.years.length > 1
            ? pinnedScenario.pinned.results.years[1]?.taxSavings
            : undefined,
        } : undefined}
      />

      <header className="header">
        <h1>Tax Optimization Calculator</h1>
        <p className="subtitle">QFAF + Collateral Strategy</p>
        <p className="header-description">
          Model tax-loss harvesting strategies with QFAF overlays and collateral optimization.
        </p>
        <div className="header-feedback-banner">
          This tool is in active development. Feedback and suggestions are welcome!{' '}
          <a href="mailto:suggestions@edicalc.com" className="header-feedback-link">
            suggestions@edicalc.com
          </a>
        </div>
      </header>

      {/* Scroll sentinel - triggers sticky header expansion when scrolled past */}
      <div id="scroll-sentinel" />

      {/* ========================================
          SECTION GROUP 1: INPUTS
          ======================================== */}
      <div className="section-group section-group--inputs">
        <div className="section-group__label">Inputs</div>

      {/* Input Form - Step 1: Your Situation */}
      <CollapsibleSection
        sectionKey="inputs"
        step="1"
        stepLabel="Your Situation"
        title="Client Profile"
        headerAction={
          <InfoPopup title="Strategy Selection">
            <StrategyRatesFormula />
          </InfoPopup>
        }
        guidance="Tell us about your client's investment and tax profile. These inputs determine the strategy sizing and tax impact."
        className="inputs-section"
      >
        <div className="input-grid">
          {/* Sub-card: Strategy Selection */}
          <PinnableSection id="strategy" label="Strategy Selection" isPinned={pinnedElements.isPinned('strategy')} onTogglePin={() => pinnedElements.togglePin('strategy')}>
          <StrategySelectionInputs
            inputs={inputs}
            advancedSettings={advancedSettings}
            results={results}
            currentStrategy={currentStrategy}
            validationWarnings={validationWarnings}
            isRateEditorOpen={isRateEditorOpen}
            onUpdateInput={updateInput}
            onUpdateSettings={setAdvancedSettings}
            onSetRateEditorOpen={setIsRateEditorOpen}
            onRateVersionIncrement={() => setRateVersion(v => v + 1)}
          />
          </PinnableSection>

          {/* Sub-card: Tax & Financial Profile */}
          <PinnableSection id="tax-profile" label="Tax & Financial Profile" isPinned={pinnedElements.isPinned('tax-profile')} onTogglePin={() => pinnedElements.togglePin('tax-profile')}>
          <TaxFinancialProfileInputs
            inputs={inputs}
            validationWarnings={validationWarnings}
            onUpdateInput={updateInput}
          />
          </PinnableSection>
        </div>

        {/* Advanced Options */}
        <AdvancedOptionsPanel
          inputs={inputs}
          advancedSettings={advancedSettings}
          onUpdateInput={updateInput}
          onUpdateSettings={setAdvancedSettings}
          onResetSettings={resetAdvancedSettings}
        />

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
              }
            }}
          >
            Reset to Defaults
          </button>
        </div>
      </CollapsibleSection>

      </div>{/* end section-group--inputs */}

      {/* ========================================
          SECTION GROUP 2: KEY ASSUMPTIONS
          ======================================== */}
      <div className="section-group section-group--assumptions">
        <div className="section-group__label">Key Assumptions</div>

      {/* Marginal Tax Rates - Step 2: Tax Rate Analysis */}
      <PinnableSection id="tax-rates" label="Tax Rates" isPinned={pinnedElements.isPinned('tax-rates')} onTogglePin={() => pinnedElements.togglePin('tax-rates')}>
      <TaxRatesDisplay
        federalStRate={federalStRate}
        federalLtRate={federalLtRate}
        stateRate={stateRate}
        combinedStRate={combinedStRate}
        combinedLtRate={combinedLtRate}
        rateDifferential={rateDifferential}
      />
      </PinnableSection>

      {/* Strategy Sizing - Step 3: Optimized Strategy */}
      <PinnableSection id="sizing" label="Strategy Sizing" isPinned={pinnedElements.isPinned('sizing')} onTogglePin={() => pinnedElements.togglePin('sizing')}>
      <SizingSummary
        results={results}
        filingStatus={inputs.filingStatus}
        qfafEnabled={inputs.qfafEnabled}
        combinedStRate={combinedStRate}
        combinedLtRate={combinedLtRate}
        rateDifferential={rateDifferential}
        qfafMultiplier={advancedSettings.qfafMultiplier}
      />
      </PinnableSection>

      </div>{/* end section-group--assumptions */}

      {/* ========================================
          SECTION GROUP 3: RESULTS
          ======================================== */}
      <div className="section-group section-group--results">
        <div className="section-group__label">Results</div>

      {/* Results Summary - headline metrics */}
      <PinnableSection id="results" label="Results Summary" isPinned={pinnedElements.isPinned('results')} onTogglePin={() => pinnedElements.togglePin('results')}>
      <ResultsSummary
        totalTaxSavings={results.summary.totalTaxSavings}
        finalPortfolioValue={results.summary.finalPortfolioValue}
        effectiveTaxAlpha={results.summary.effectiveTaxAlpha}
        totalNolGenerated={results.summary.totalNolGenerated}
        projectionYears={advancedSettings.projectionYears}
        collateralOnlyTaxSavings={collateralOnlyResults.summary.totalTaxSavings}
        collateralAmount={inputs.collateralAmount}
        stateCode={inputs.stateCode}
      />
      </PinnableSection>

      {/* Scenario comparison panel (shown when a scenario is pinned) */}
      {pinnedScenario.pinned && (
        <ScenarioComparisonPanel
          pinned={pinnedScenario.pinned}
          currentInputs={inputs}
          currentSettings={advancedSettings}
          currentResults={results}
          onUnpin={pinnedScenario.unpin}
          onRestore={handleRestorePinned}
          onReplacePin={() => pinnedScenario.replacePin(inputs, advancedSettings, results)}
        />
      )}

      {/* Detailed Results - Step 4: Year-by-Year Breakdown */}
      <PinnableSection id="charts" label="Charts & Table" isPinned={pinnedElements.isPinned('charts')} onTogglePin={() => pinnedElements.togglePin('charts')}>
      <CollapsibleSection
        sectionKey="yearByYear"
        step="4"
        stepLabel="Year-by-Year Breakdown"
        title="Estimated Detailed Projections"
        headerAction={
          <InfoPopup title="Projection Methodology">
            <ProjectionFormula qfafMultiplier={advancedSettings.qfafMultiplier} />
          </InfoPopup>
        }
        guidance={`Estimated year-by-year breakdown showing how tax benefits compound over the ${advancedSettings.projectionYears}-year projection period.`}
        className="results-section"
      >
        {/* Charts and Export Actions */}
        <ResultsChartsSection
          results={results}
          inputs={inputs}
          advancedSettings={advancedSettings}
          currentStrategy={currentStrategy}
          taxRates={taxRates}
          projectionYears={advancedSettings.projectionYears}
          onPrintRef={(handler) => setPrintHandler(() => handler)}
          onExportRef={(handler) => setExportHandler(() => handler)}
        />
      </CollapsibleSection>
      </PinnableSection>

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

      {/* Keyboard Shortcuts Help Modal */}
      <KeyboardShortcutsHelp
        isOpen={showKeyboardHelp}
        onClose={() => setShowKeyboardHelp(false)}
      />

      {/* Floating panel for pinned UI elements */}
      <FloatingPinnedPanel
        elements={[
          ...(pinnedElements.isPinned('strategy') ? [{
            id: 'strategy',
            label: 'Strategy Selection',
            content: (
              <StrategySelectionInputs
                inputs={inputs}
                advancedSettings={advancedSettings}
                results={results}
                currentStrategy={currentStrategy}
                validationWarnings={validationWarnings}
                isRateEditorOpen={false}
                onUpdateInput={updateInput}
                onUpdateSettings={setAdvancedSettings}
                onSetRateEditorOpen={setIsRateEditorOpen}
                onRateVersionIncrement={() => setRateVersion(v => v + 1)}
              />
            ),
          }] : []),
          ...(pinnedElements.isPinned('tax-profile') ? [{
            id: 'tax-profile',
            label: 'Tax & Financial Profile',
            content: (
              <TaxFinancialProfileInputs
                inputs={inputs}
                validationWarnings={validationWarnings}
                onUpdateInput={updateInput}
              />
            ),
          }] : []),
          ...(pinnedElements.isPinned('tax-rates') ? [{
            id: 'tax-rates',
            label: 'Tax Rates',
            content: (
              <TaxRatesDisplay
                federalStRate={federalStRate}
                federalLtRate={federalLtRate}
                stateRate={stateRate}
                combinedStRate={combinedStRate}
                combinedLtRate={combinedLtRate}
                rateDifferential={rateDifferential}
              />
            ),
          }] : []),
          ...(pinnedElements.isPinned('results') ? [{
            id: 'results',
            label: 'Results Summary',
            content: (
              <ResultsSummary
                totalTaxSavings={results.summary.totalTaxSavings}
                finalPortfolioValue={results.summary.finalPortfolioValue}
                effectiveTaxAlpha={results.summary.effectiveTaxAlpha}
                totalNolGenerated={results.summary.totalNolGenerated}
                projectionYears={advancedSettings.projectionYears}
                collateralOnlyTaxSavings={collateralOnlyResults.summary.totalTaxSavings}
                collateralAmount={inputs.collateralAmount}
                stateCode={inputs.stateCode}
              />
            ),
          }] : []),
          ...(pinnedElements.isPinned('comparison') && pinnedScenario.pinned ? [{
            id: 'comparison',
            label: 'Scenario Comparison',
            content: (
              <ScenarioComparisonPanel
                pinned={pinnedScenario.pinned}
                currentInputs={inputs}
                currentSettings={advancedSettings}
                currentResults={results}
                onUnpin={pinnedScenario.unpin}
                onRestore={handleRestorePinned}
                onReplacePin={() => pinnedScenario.replacePin(inputs, advancedSettings, results)}
              />
            ),
          }] : []),
          ...(pinnedElements.isPinned('sizing') ? [{
            id: 'sizing',
            label: 'Strategy Sizing',
            content: (
              <SizingSummary
                results={results}
                filingStatus={inputs.filingStatus}
                qfafEnabled={inputs.qfafEnabled}
                combinedStRate={combinedStRate}
                combinedLtRate={combinedLtRate}
                rateDifferential={rateDifferential}
                qfafMultiplier={advancedSettings.qfafMultiplier}
              />
            ),
          }] : []),
          ...(pinnedElements.isPinned('charts') ? [{
            id: 'charts',
            label: 'Charts & Table',
            content: (
              <ResultsChartsSection
                results={results}
                inputs={inputs}
                advancedSettings={advancedSettings}
                currentStrategy={currentStrategy}
                taxRates={taxRates}
                projectionYears={advancedSettings.projectionYears}
              />
            ),
          }] : []),
        ]}
        onUnpin={(id: string) => {
          pinnedElements.unpin(id);
          if (id === 'comparison') pinnedScenario.unpin();
        }}
        onUnpinAll={pinnedElements.unpinAll}
        layout={pinnedElements.panelLayout}
        onLayoutChange={pinnedElements.updatePanelLayout}
        onLayoutReset={pinnedElements.resetPanelLayout}
      />
    </div>
  );
}
