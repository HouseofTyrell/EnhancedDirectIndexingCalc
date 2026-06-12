import { useMemo, useRef, useState } from 'react';
import {
  CalculatorInputs,
  AdvancedSettings,
  DEFAULT_SETTINGS,
  FILING_STATUSES,
  FilingStatus,
  YearOverride,
} from '../types';
import {
  DEFAULTS,
  STATES,
  getFederalStRate,
  getFederalLtRate,
  getFederalOrdinaryRate,
  getStateRate,
  getStateTaxProfile,
  getStateConformityWarning,
} from '../taxData';
import { STRATEGIES, getStrategy } from '../strategyData';
import {
  calculate,
  calculateWithOverrides,
  computeExitTaxAnalysis,
  computeEdiInsights,
  computeStepUpComparison,
  solveCollateralForTotal,
} from '../calculations';
import { getQuantifiedStateWarning } from '../utils/stateTaxWarnings';
import { downloadInputsCsv, parseInputsFromCsv } from '../utils/csvScenario';
import { exportToExcel } from '../utils/excelExport';
import { MeetingMode } from '../components/MeetingMode/MeetingMode';
import { formatCurrency, formatPercent, formatWithCommas, parseFormattedNumber } from '../utils/formatters';
import { ResultsTable } from '../ResultsTable';
import { TaxSavingsChart, PortfolioValueChart } from '../WealthChart';
import { DisclaimerFooter } from '../components/DisclaimerFooter';
import { QualifiedPurchaserModal } from '../components/QualifiedPurchaserModal';
import { useQualifiedPurchaser } from '../hooks/useQualifiedPurchaser';
import { InfoText } from '../InfoPopup';
import { POPUP_CONTENT } from '../popupContent';
import './workspace.css';

type ResultsView = 'overview' | 'table' | 'charts';
type FundingMode = 'collateral' | 'total';

/**
 * Workspace (Beta) — redesigned single-screen experience from the UI review.
 *
 * Design intent (vs. the classic 7,000px single-scroll page):
 * - Persistent input rail: every assumption editable while looking at results,
 *   no scroll round-trips between "change income" and "see the impact".
 * - Results-first hierarchy: headline metrics at the top, detail on demand
 *   via Overview / Year-by-Year / Charts sub-views.
 * - One surface per number: the metric strip is the only headline; deep
 *   detail lives in the (audit-complete) table reused from the classic view.
 * - Power features (split allocation, year-by-year planning, sensitivity,
 *   meeting mode) intentionally stay in the classic tab.
 */
export function WorkspaceTab() {
  const qualifiedPurchaser = useQualifiedPurchaser();
  const [inputs, setInputs] = useState<CalculatorInputs>(DEFAULTS);
  const [settings, setSettings] = useState<AdvancedSettings>(DEFAULT_SETTINGS);
  const [resultsView, setResultsView] = useState<ResultsView>('overview');
  // Funding mode: enter the collateral directly, or enter the client's TOTAL
  // available portfolio and let the tool solve collateral + QFAF = total
  // (no more guessing collateral sizes to hit a budget).
  const [fundingMode, setFundingMode] = useState<FundingMode>('collateral');
  const [totalAvailable, setTotalAvailable] = useState<number>(DEFAULTS.collateralAmount);
  const [isMeetingMode, setIsMeetingMode] = useState(false);
  const csvFileRef = useRef<HTMLInputElement>(null);
  // Per-year events (D-012 + income-override graduation): sparse overrides
  // keyed by year — income changes, cash infusions, and planned gain events.
  const [yearEvents, setYearEvents] = useState<Map<number, YearOverride>>(new Map());
  const [showEventsEditor, setShowEventsEditor] = useState(false);
  // Income schedule builder: start amount + annual growth → per-year w2Income
  // rows (which stay hand-editable afterward).
  const [schedStart, setSchedStart] = useState<number>(DEFAULTS.annualIncome);
  const [schedGrowth, setSchedGrowth] = useState<number>(3);

  const set = <K extends keyof CalculatorInputs>(key: K, value: CalculatorInputs[K]) =>
    setInputs(prev => ({ ...prev, [key]: value }));
  const setSetting = <K extends keyof AdvancedSettings>(key: K, value: AdvancedSettings[K]) =>
    setSettings(prev => ({ ...prev, [key]: value }));

  // In total-budget mode, solve for the collateral that makes
  // collateral + auto-sized QFAF equal the available portfolio.
  const effectiveInputs = useMemo<CalculatorInputs>(() => {
    if (fundingMode !== 'total') return inputs;
    const solved = solveCollateralForTotal(
      totalAvailable,
      inputs,
      settings.qfafMultiplier,
      settings.washSaleDisallowanceRate
    );
    return { ...inputs, collateralAmount: solved };
  }, [fundingMode, totalAvailable, inputs, settings.qfafMultiplier, settings.washSaleDisallowanceRate]);

  const projYears = settings.projectionYears ?? 10;
  const activeOverrides = useMemo(() => {
    const list: YearOverride[] = [];
    yearEvents.forEach(o => {
      const differs =
        o.w2Income !== effectiveInputs.annualIncome ||
        o.cashInfusion !== 0 ||
        (o.gainEvent !== undefined && o.gainEvent.amount > 0);
      if (differs) list.push(o);
    });
    return list;
  }, [yearEvents, effectiveInputs.annualIncome]);

  const results = useMemo(
    () =>
      activeOverrides.length > 0
        ? calculateWithOverrides(effectiveInputs, settings, activeOverrides)
        : calculate(effectiveInputs, settings),
    [effectiveInputs, settings, activeOverrides]
  );
  // Standard-DI comparison: in total-budget mode a DI-only client would put
  // the WHOLE budget into direct indexing, so compare against that.
  const collateralOnly = useMemo(
    () =>
      calculate(
        {
          ...effectiveInputs,
          qfafEnabled: false,
          collateralAmount: fundingMode === 'total' ? totalAvailable : effectiveInputs.collateralAmount,
        },
        settings
      ),
    [effectiveInputs, fundingMode, totalAvailable, settings]
  );

  const rates = useMemo(() => {
    const stateRate =
      inputs.stateCode === 'OTHER' ? inputs.stateRate : getStateRate(inputs.stateCode);
    const profile = getStateTaxProfile(inputs.stateCode, stateRate, inputs.nycResident);
    const fedSt = getFederalStRate(inputs.annualIncome, inputs.filingStatus);
    const fedLt = getFederalLtRate(inputs.annualIncome, inputs.filingStatus);
    const fedOrd = getFederalOrdinaryRate(inputs.annualIncome, inputs.filingStatus);
    return {
      profile,
      combinedLt: fedLt + profile.ltRate,
      combinedOrdinary:
        fedOrd + (profile.allowsLossOffsetAgainstIncome ? profile.ordinaryRate : 0),
      // Full shape for Meeting Mode and Excel export (matches the classic memo)
      full: {
        federalStRate: fedSt,
        federalLtRate: fedLt,
        stateRate,
        combinedStRate: fedSt + profile.stRate,
        combinedLtRate: fedLt + profile.ltRate,
        combinedOrdinaryRate:
          fedOrd + (profile.allowsLossOffsetAgainstIncome ? profile.ordinaryRate : 0),
        rateDifferential: fedSt - fedLt,
      },
    };
  }, [inputs.annualIncome, inputs.filingStatus, inputs.stateCode, inputs.stateRate, inputs.nycResident]);

  const exit = useMemo(
    () =>
      computeExitTaxAnalysis(
        results,
        rates.combinedLt,
        settings.growthEnabled ? settings.defaultAnnualReturn : 0,
        rates.profile.ltcgExcise,
        effectiveInputs.collateralCostBasis
      ),
    [results, rates, settings.growthEnabled, settings.defaultAnnualReturn, effectiveInputs.collateralCostBasis]
  );

  // EDI-only mode (D-014/D-015): with QFAF off, the product is the loss
  // reserve — contingent CF shelter — not NOL-driven realized savings.
  const ediMode = !effectiveInputs.qfafEnabled;
  const insights = useMemo(() => computeEdiInsights(results), [results]);
  // Estate / step-up co-metric (D-018), both modes.
  const stepUp = useMemo(() => computeStepUpComparison(results, exit), [results, exit]);

  const stateNote = useMemo(
    () => getQuantifiedStateWarning(inputs.stateCode, rates.profile.ordinaryRate, results.years),
    [inputs.stateCode, rates.profile.ordinaryRate, results.years]
  );
  const conformityNote = getStateConformityWarning(inputs.stateCode);

  if (!qualifiedPurchaser.isAcknowledged) {
    return <QualifiedPurchaserModal onAcknowledge={qualifiedPurchaser.acknowledge} />;
  }

  if (isMeetingMode) {
    return (
      <MeetingMode
        inputs={effectiveInputs}
        results={results}
        collateralOnlyResults={collateralOnly}
        taxRates={rates.full}
        advancedSettings={settings}
        currentStrategy={getStrategy(effectiveInputs.strategyId)}
        onExitMeetingMode={() => setIsMeetingMode(false)}
        onPinScenario={() => {}}
        canPin={false}
        onUpdateInput={set}
        onUpdateSettings={setSettings}
      />
    );
  }

  const applyCsvFile = async (file: File) => {
    try {
      const text = await file.text();
      const parsed = parseInputsFromCsv(text);
      if (parsed.inputs && Object.keys(parsed.inputs).length > 0) {
        setInputs(prev => ({ ...prev, ...parsed.inputs }));
        // CSV carries an explicit collateral amount, so leave total-budget mode
        setFundingMode('collateral');
      }
      if (parsed.settings && Object.keys(parsed.settings).length > 0) {
        setSettings(prev => ({ ...prev, ...parsed.settings }));
      }
    } catch (err) {
      window.alert(`Could not import scenario: ${err instanceof Error ? err.message : err}`);
    }
  };

  const setEvent = (year: number, patch: Partial<YearOverride>) => {
    setYearEvents(prev => {
      const next = new Map(prev);
      const existing = next.get(year) ?? {
        year,
        w2Income: effectiveInputs.annualIncome,
        cashInfusion: 0,
        cashInfusionTaxType: 'gross' as const,
        note: '',
      };
      next.set(year, { ...existing, ...patch });
      return next;
    });
  };

  const applyIncomeSchedule = () => {
    setYearEvents(prev => {
      const next = new Map(prev);
      for (let yr = 1; yr <= projYears; yr++) {
        const income = Math.round(schedStart * Math.pow(1 + schedGrowth / 100, yr - 1));
        const existing = next.get(yr) ?? {
          year: yr,
          w2Income: effectiveInputs.annualIncome,
          cashInfusion: 0,
          cashInfusionTaxType: 'gross' as const,
          note: '',
        };
        next.set(yr, { ...existing, w2Income: income });
      }
      return next;
    });
  };

  const resetIncomeSchedule = () => {
    // Restore every row's income to the base input; infusions/gain events stay.
    setYearEvents(prev => {
      const next = new Map(prev);
      next.forEach((o, yr) => next.set(yr, { ...o, w2Income: effectiveInputs.annualIncome }));
      return next;
    });
  };

  // Scenario presets (D-014 folded default): one-click starting points that
  // fill the per-year events rows via the same setEvent machinery — every
  // value stays hand-editable afterward.
  const applyPreset = (preset: 'business-sale' | 'rsu-vesting' | 'concentrated-stock') => {
    const collateral = results.sizing.collateralValue;
    if (preset === 'business-sale') {
      // Business exit: a large LT gain (2× collateral) once the reserve has
      // had a couple of years to build.
      const yr = Math.min(3, projYears);
      setEvent(yr, { gainEvent: { amount: Math.round(collateral * 2), character: 'lt' } });
    } else if (preset === 'rsu-vesting') {
      // RSU vesting is ordinary income, not a capital gain — model it as a
      // W-2 income bump (+50%) across the vesting years.
      const bumped = Math.round(effectiveInputs.annualIncome * 1.5);
      for (let yr = 1; yr <= Math.min(4, projYears); yr++) {
        setEvent(yr, { w2Income: bumped });
      }
    } else {
      // Diversify a concentrated position: LT gain of 50% of collateral early.
      const yr = Math.min(2, projYears);
      setEvent(yr, { gainEvent: { amount: Math.round(collateral * 0.5), character: 'lt' } });
    }
    setShowEventsEditor(true);
  };

  const eventYears = results.years.filter(y => y.gainEventAmount > 0);

  const { summary } = results;
  // §461(l)/NOL surfaces are QFAF-shaped: hide them whenever the projection
  // generated no NOL (covers EDI-only mode without hardcoding on qfafEnabled).
  const hasNol = summary.totalNolGenerated >= 1;
  // Peak income required across the projection (the year that needs the most
  // income to fully use the §461(l) deduction + prior NOL) — the advisor's
  // planning target, surfaced from the buried table column.
  const peakIncomeReq = results.years.reduce(
    (best, y) =>
      y.incomeRequiredForFullUtilization > best.amount
        ? { amount: y.incomeRequiredForFullUtilization, year: y.year }
        : best,
    { amount: 0, year: 1 }
  );
  const incomeReqYears = results.years.filter(y => y.incomeRequiredForFullUtilization > 0.5);
  const year1 = results.years[0]?.taxSavings ?? 0;
  const year2 = results.years[1]?.taxSavings ?? 0;
  const projectionYears = settings.projectionYears ?? 10;
  const currentStrategy = getStrategy(inputs.strategyId);
  // The engine extends past the standard horizon when NOL remains unused
  // (mirrors core.ts: QFAF duration + partial-year start + 2 wind-down years).
  const baseHorizonYears = Math.max(
    projectionYears,
    effectiveInputs.qfafEnabled
      ? effectiveInputs.qfafDuration + (effectiveInputs.startMonth > 1 ? 1 : 0) + 2
      : 0
  );
  const nolExtensionYears = Math.max(0, results.years.length - baseHorizonYears);

  return (
    <div className="ws">
      {/* ───────────────── Input rail ───────────────── */}
      <aside className="ws-rail">
        <div className="ws-rail-group">
          <h4>Client</h4>
          <label className="ws-field">
            <span>Filing status</span>
            <select
              value={inputs.filingStatus}
              onChange={e => set('filingStatus', e.target.value as FilingStatus)}
            >
              {FILING_STATUSES.map(f => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>
          </label>
          <label className="ws-field">
            <span>State</span>
            <select value={inputs.stateCode} onChange={e => set('stateCode', e.target.value)}>
              {STATES.map(s => (
                <option key={s.code} value={s.code}>{s.name}</option>
              ))}
            </select>
          </label>
          {inputs.stateCode === 'NY' && (
            <label className="ws-toggle">
              <input
                type="checkbox"
                checked={inputs.nycResident === true}
                onChange={e => set('nycResident', e.target.checked)}
              />
              <span>NYC resident (+3.876% local)</span>
            </label>
          )}
          <label className="ws-field">
            <span>Annual income</span>
            <input
              inputMode="numeric"
              value={formatWithCommas(inputs.annualIncome)}
              onChange={e => set('annualIncome', parseFormattedNumber(e.target.value))}
            />
          </label>
        </div>

        <div className="ws-rail-group">
          <h4>Strategy</h4>
          <label className="ws-field">
            <span>Collateral strategy</span>
            <select value={inputs.strategyId} onChange={e => set('strategyId', e.target.value)}>
              {STRATEGIES.map(s => (
                <option key={s.id} value={s.id}>{s.name} — {s.label}</option>
              ))}
            </select>
          </label>
          <div className="ws-field">
            <span>Fund by</span>
            <div className="ws-segment">
              <button
                type="button"
                className={fundingMode === 'collateral' ? 'active' : ''}
                onClick={() => setFundingMode('collateral')}
              >
                Collateral
              </button>
              <button
                type="button"
                className={fundingMode === 'total' ? 'active' : ''}
                onClick={() => {
                  // Seed the budget from the current total so the switch is seamless
                  setTotalAvailable(Math.round(results.sizing.totalExposure));
                  setFundingMode('total');
                }}
              >
                Total portfolio
              </button>
            </div>
          </div>
          {fundingMode === 'collateral' ? (
            <label className="ws-field">
              <span>Collateral amount</span>
              <input
                inputMode="numeric"
                value={formatWithCommas(inputs.collateralAmount)}
                onChange={e => set('collateralAmount', parseFormattedNumber(e.target.value))}
              />
            </label>
          ) : (
            <>
              <label className="ws-field">
                <span>Total available portfolio</span>
                <input
                  inputMode="numeric"
                  value={formatWithCommas(totalAvailable)}
                  onChange={e => setTotalAvailable(parseFormattedNumber(e.target.value))}
                />
              </label>
              <p className="ws-derived">
                → Collateral {formatCurrency(results.sizing.collateralValue)}
                {inputs.qfafEnabled && (
                  <> + QFAF {formatCurrency(results.sizing.qfafValue)}</>
                )}{' '}
                = {formatCurrency(results.sizing.totalExposure)}
              </p>
            </>
          )}
          <label className="ws-field">
            <span>Cost basis of collateral (optional)</span>
            <input
              inputMode="numeric"
              placeholder="= collateral value"
              value={
                inputs.collateralCostBasis !== undefined
                  ? formatWithCommas(inputs.collateralCostBasis)
                  : ''
              }
              onChange={e => {
                const raw = e.target.value.trim();
                set(
                  'collateralCostBasis',
                  raw === '' ? undefined : parseFormattedNumber(raw)
                );
              }}
            />
          </label>
          <label className="ws-field">
            <span>Start month</span>
            <select
              value={inputs.startMonth}
              onChange={e => set('startMonth', Number(e.target.value))}
            >
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i + 1} value={i + 1}>
                  {new Date(2026, i, 1).toLocaleString('en-US', { month: 'long' })}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="ws-rail-group">
          <h4>Carryforwards</h4>
          <label className="ws-field">
            <span>Existing ST loss c/f</span>
            <input
              inputMode="numeric"
              value={formatWithCommas(inputs.existingStLossCarryforward)}
              onChange={e => set('existingStLossCarryforward', parseFormattedNumber(e.target.value))}
            />
          </label>
          <label className="ws-field">
            <span>Existing LT loss c/f</span>
            <input
              inputMode="numeric"
              value={formatWithCommas(inputs.existingLtLossCarryforward)}
              onChange={e => set('existingLtLossCarryforward', parseFormattedNumber(e.target.value))}
            />
          </label>
          <label className="ws-field">
            <span>Existing NOL c/f</span>
            <input
              inputMode="numeric"
              value={formatWithCommas(inputs.existingNolCarryforward)}
              onChange={e => set('existingNolCarryforward', parseFormattedNumber(e.target.value))}
            />
          </label>
        </div>

        <div className="ws-rail-group">
          <h4>QFAF overlay</h4>
          <label className="ws-toggle">
            <input
              type="checkbox"
              checked={inputs.qfafEnabled}
              onChange={e => set('qfafEnabled', e.target.checked)}
            />
            <span>Enable QFAF</span>
          </label>
          {inputs.qfafEnabled && (
            <>
              <label className="ws-field">
                <span>Duration: {inputs.qfafDuration} yrs</span>
                <input
                  type="range" min={1} max={10}
                  value={inputs.qfafDuration}
                  onChange={e => set('qfafDuration', Number(e.target.value))}
                />
              </label>
              <label className="ws-field">
                <span>Sizing</span>
                <select
                  value={inputs.qfafSizingMode}
                  onChange={e => set('qfafSizingMode', e.target.value as 'fixed' | 'dynamic')}
                >
                  <option value="dynamic">Dynamic (resized yearly)</option>
                  <option value="fixed">Fixed at inception</option>
                </select>
              </label>
              <label className="ws-toggle">
                <input
                  type="checkbox"
                  checked={inputs.redeployQfafProceeds === true}
                  onChange={e => set('redeployQfafProceeds', e.target.checked)}
                />
                <span>Redeploy redemptions into core</span>
              </label>
            </>
          )}
        </div>

        <div className="ws-rail-group">
          <h4>Model</h4>
          <label className="ws-toggle">
            <input
              type="checkbox"
              checked={settings.growthEnabled}
              onChange={e => setSetting('growthEnabled', e.target.checked)}
            />
            <span>Portfolio growth ({formatPercent(settings.defaultAnnualReturn, 0)})</span>
          </label>
          <label className="ws-toggle">
            <input
              type="checkbox"
              checked={inputs.ltGainsEnabled !== false}
              onChange={e => set('ltGainsEnabled', e.target.checked)}
            />
            <span>Realize LT gains</span>
          </label>
          <label className="ws-toggle">
            <input
              type="checkbox"
              checked={settings.financingFeesEnabled}
              onChange={e => setSetting('financingFeesEnabled', e.target.checked)}
            />
            <span>Financing costs &amp; fees</span>
          </label>
          <label className="ws-toggle">
            <input
              type="checkbox"
              checked={settings.presentValueEnabled}
              onChange={e => setSetting('presentValueEnabled', e.target.checked)}
            />
            <span>Show present value ({formatPercent(settings.discountRate, 0)})</span>
          </label>
          <label className="ws-field">
            <span>Wash-sale disallowance: {formatPercent(settings.washSaleDisallowanceRate, 0)}</span>
            <input
              type="range" min={0} max={15} step={1}
              value={Math.round(settings.washSaleDisallowanceRate * 100)}
              onChange={e => setSetting('washSaleDisallowanceRate', Number(e.target.value) / 100)}
            />
          </label>
        </div>

        <div className="ws-rail-group">
          <h4>Per-Year Events</h4>
          <button
            className="ws-action-btn"
            onClick={() => setShowEventsEditor(v => !v)}
          >
            {showEventsEditor ? 'Hide' : 'Edit'} income &amp; events
            {activeOverrides.length > 0 && ` (${activeOverrides.length} active)`}
          </button>
          <p className="ws-rail-note" style={{ padding: 0, marginTop: 6 }}>
            Model variable RSU/bonus years, cash infusions, and planned sale
            events (business exit, IPO lockup). One-click scenario presets
            inside.
          </p>
        </div>

        <div className="ws-rail-group">
          <h4>Actions</h4>
          <button className="ws-action-btn ws-action-btn--primary" onClick={() => setIsMeetingMode(true)}>
            Open Meeting Mode
          </button>
          <button
            className="ws-action-btn"
            onClick={() =>
              exportToExcel({
                inputs: effectiveInputs,
                results,
                settings,
                taxRates: rates.full,
              })
            }
          >
            Export to Excel
          </button>
          <button
            className="ws-action-btn"
            onClick={() => downloadInputsCsv(effectiveInputs, settings)}
          >
            Export Scenario (CSV)
          </button>
          <button className="ws-action-btn" onClick={() => csvFileRef.current?.click()}>
            Import Scenario (CSV)
          </button>
          <input
            ref={csvFileRef}
            type="file"
            accept=".csv,text/csv"
            style={{ display: 'none' }}
            onChange={e => {
              const f = e.target.files?.[0];
              if (f) applyCsvFile(f);
              e.target.value = '';
            }}
          />
        </div>

        <p className="ws-rail-note">
          Split allocation and sensitivity analysis live in the{' '}
          <strong>Classic Calculator</strong> tab.
        </p>
      </aside>

      {/* ───────────────── Results pane ───────────────── */}
      <section className="ws-main">
        <div className="ws-metrics">
          <div className="ws-metric ws-metric--primary">
            <span className="ws-metric-label">
              <InfoText contentKey="total-tax-savings" currentValue={formatCurrency(summary.totalTaxSavings)}>
                Est. Tax Savings
              </InfoText>
            </span>
            <span className="ws-metric-value">{formatCurrency(summary.totalTaxSavings)}</span>
            <span className="ws-metric-sub">
              {results.years.length} yrs
              {nolExtensionYears > 0 && ' (extended to use NOL)'}
              {!settings.financingFeesEnabled && ' · before costs & fees'}
              {settings.presentValueEnabled &&
                ` · PV ${formatCurrency(summary.totalTaxSavingsPV)}`}
            </span>
          </div>
          {ediMode ? (
            // EDI-only co-headline (D-015): the loss reserve IS the product —
            // contingent shelter value, never folded into realized savings.
            <div className="ws-metric ws-metric--primary">
              <span className="ws-metric-label">
                <InfoText
                  contentKey="loss-reserve-built"
                  currentValue={formatCurrency(summary.lossReserveShelterValue)}
                >
                  Loss Reserve Built
                </InfoText>
              </span>
              <span className="ws-metric-value">
                {formatCurrency(summary.lossReserveShelterValue)}
              </span>
              <span className="ws-metric-sub">
                from {formatCurrency(summary.finalStCarryforward + summary.finalLtCarryforward)} of
                loss carryforwards · contingent on future gains
              </span>
            </div>
          ) : (
            <div className="ws-metric">
              <span className="ws-metric-label">
                <InfoText
                  contentKey="col-income-required"
                  currentValue={formatCurrency(peakIncomeReq.amount)}
                >
                  Income to Fully Utilize
                </InfoText>
              </span>
              <span className="ws-metric-value">{formatCurrency(peakIncomeReq.amount)}</span>
              <span className="ws-metric-sub">peak need, year {peakIncomeReq.year} — per-year below</span>
            </div>
          )}
          <div className="ws-metric">
            <span className="ws-metric-label">Year 1 / Year 2+</span>
            <span className="ws-metric-value">
              {formatCurrency(year1)} <em>/</em> {formatCurrency(year2)}
            </span>
            <span className="ws-metric-sub">annual savings</span>
          </div>
          <div className="ws-metric">
            <span className="ws-metric-label">
              <InfoText contentKey="net-benefit-after-liquidation" currentValue={formatCurrency(exit.netBenefitAfterLiquidation)}>
                Net If Liquidated
              </InfoText>
            </span>
            <span className="ws-metric-value">{formatCurrency(exit.netBenefitAfterLiquidation)}</span>
            <span className="ws-metric-sub">after deferred tax</span>
          </div>
        </div>

        {showEventsEditor && (
          <div className="ws-events-editor">
            <div className="ws-presets">
              <span className="ws-presets-label">Scenario presets</span>
              <button type="button" className="ws-preset-btn" onClick={() => applyPreset('business-sale')}>
                Business sale
              </button>
              <button type="button" className="ws-preset-btn" onClick={() => applyPreset('rsu-vesting')}>
                RSU vesting
              </button>
              <button type="button" className="ws-preset-btn" onClick={() => applyPreset('concentrated-stock')}>
                Diversify concentrated stock
              </button>
              <span className="ws-presets-note">
                starting points — each fills the rows below; edit amounts and years to fit the client
              </span>
            </div>
            <div className="ws-sched">
              <span className="ws-sched-label">Income schedule</span>
              <label className="ws-sched-field">
                <span>Start income</span>
                <input
                  inputMode="numeric"
                  value={formatWithCommas(schedStart)}
                  onChange={e => setSchedStart(parseFormattedNumber(e.target.value))}
                />
              </label>
              <label className="ws-sched-field">
                <span>Growth %/yr</span>
                <input
                  type="number"
                  step={0.5}
                  value={schedGrowth}
                  onChange={e => setSchedGrowth(Number(e.target.value))}
                />
              </label>
              <button type="button" className="ws-sched-btn" onClick={applyIncomeSchedule}>
                Apply schedule
              </button>
              <button type="button" className="ws-sched-btn ws-sched-btn--ghost" onClick={resetIncomeSchedule}>
                Reset incomes
              </button>
            </div>
            <p className="ws-rail-note" style={{ padding: 0, margin: '0 0 10px' }}>
              Fills the income column for years 1–{projYears} (start ×{' '}
              {schedGrowth >= 0 ? 'growth' : 'decline'} compounding). Rows stay editable —
              adjust individual years after applying (e.g., drop to retirement income).
            </p>
            <div className="ws-events-head">
              <span>Year</span>
              <span>W-2 / ordinary income</span>
              <span>Cash infusion</span>
              <span>Gain event</span>
              <span>Type</span>
            </div>
            {Array.from({ length: projYears }, (_, i) => i + 1).map(yr => {
              const o = yearEvents.get(yr);
              return (
                <div className="ws-events-row" key={yr}>
                  <span className="ws-events-yr">Yr {yr}</span>
                  <input
                    inputMode="numeric"
                    value={formatWithCommas(o?.w2Income ?? effectiveInputs.annualIncome)}
                    onChange={e => setEvent(yr, { w2Income: parseFormattedNumber(e.target.value) })}
                  />
                  <input
                    inputMode="numeric"
                    value={formatWithCommas(o?.cashInfusion ?? 0)}
                    onChange={e => setEvent(yr, { cashInfusion: parseFormattedNumber(e.target.value) })}
                  />
                  <input
                    inputMode="numeric"
                    placeholder="0"
                    value={o?.gainEvent?.amount ? formatWithCommas(o.gainEvent.amount) : ''}
                    onChange={e => {
                      const amount = parseFormattedNumber(e.target.value);
                      setEvent(yr, {
                        gainEvent: amount > 0
                          ? { amount, character: o?.gainEvent?.character ?? 'lt' }
                          : undefined,
                      });
                    }}
                  />
                  <select
                    value={o?.gainEvent?.character ?? 'lt'}
                    onChange={e =>
                      setEvent(yr, {
                        gainEvent: o?.gainEvent
                          ? { ...o.gainEvent, character: e.target.value as 'st' | 'lt' }
                          : undefined,
                      })
                    }
                  >
                    <option value="lt">LT</option>
                    <option value="st">ST</option>
                  </select>
                </div>
              );
            })}
            <p className="ws-rail-note" style={{ marginTop: 8 }}>
              Gain events flow through the real netting: carryforwards shelter them
              (after the strategy's own gains), they absorb the §461(l) deduction,
              and they widen the NOL base. Event tax is reported separately — it is
              never charged against the strategy's savings.
            </p>
          </div>
        )}

        {eventYears.length > 0 && (
          <div className="ws-note">
            {eventYears.map(y => (
              <div key={y.year}>
                <strong>Year {y.year} gain event:</strong> {formatCurrency(y.gainEventAmount)} —{' '}
                carryforwards shelter {formatCurrency(y.gainEventCfShelter)}, leaving{' '}
                {formatCurrency(y.gainEventTax)} of tax due
                {y.gainEventTaxWithoutStrategy - y.gainEventTax > 0.5 && (
                  <> ({formatCurrency(y.gainEventTaxWithoutStrategy - y.gainEventTax)} less than
                  without the program)</>
                )}
                . Any NOL absorbed by the event shows in that year's savings and the
                income-utilization chips.
              </div>
            ))}
          </div>
        )}

        <div className="ws-subnav">
          {(['overview', 'table', 'charts'] as ResultsView[]).map(v => (
            <button
              key={v}
              className={`ws-subnav-btn ${resultsView === v ? 'active' : ''}`}
              onClick={() => setResultsView(v)}
            >
              {v === 'overview' ? 'Overview' : v === 'table' ? 'Year-by-Year' : 'Charts'}
            </button>
          ))}
        </div>

        {resultsView === 'overview' && (
          <div className="ws-overview">
            <div className="ws-cards">
              <div className="ws-card">
                <span className="ws-card-label">
                  <InfoText contentKey="embedded-gain-at-horizon" currentValue={formatCurrency(exit.embeddedGain)}>
                    Embedded Gain (Yr {projectionYears})
                  </InfoText>
                </span>
                <span className="ws-card-value">{formatCurrency(exit.embeddedGain)}</span>
                <span className="ws-card-sub">
                  incl. {formatCurrency(exit.cumulativeBasisReduction)} basis reduction
                  {exit.preExistingGain > 0 && (
                    <> + {formatCurrency(exit.preExistingGain)} pre-existing gain</>
                  )}
                </span>
              </div>
              <div className="ws-card">
                <span className="ws-card-label">
                  <InfoText contentKey="incremental-deferred-tax" currentValue={formatCurrency(exit.incrementalDeferredTax)}>
                    Deferred Tax If Liquidated
                  </InfoText>
                </span>
                <span className="ws-card-value">{formatCurrency(exit.incrementalDeferredTax)}</span>
                <span className="ws-card-sub">
                  {exit.incrementalDeferredTax < 0
                    ? `negative: exits ${formatCurrency(Math.abs(exit.incrementalDeferredTax))} cheaper than passive — loss-reserve advantage`
                    : `after ${formatCurrency(exit.cfShelterUsed)} carryforward shelter`}
                </span>
              </div>
              <div className="ws-card">
                <span className="ws-card-label">
                  <InfoText contentKey="net-if-held-to-step-up" currentValue={formatCurrency(stepUp.netIfHeldToStepUp)}>
                    Net If Held to Step-Up
                  </InfoText>
                </span>
                <span className="ws-card-value">{formatCurrency(stepUp.netIfHeldToStepUp)}</span>
                <span className="ws-card-sub">
                  vs {formatCurrency(stepUp.netIfLiquidated)} if liquidated · mortality-contingent
                </span>
              </div>
              {hasNol && (
                <div className="ws-card">
                  <span className="ws-card-label">
                    <InfoText contentKey="total-nol-generated" currentValue={formatCurrency(summary.totalNolGenerated)}>
                      NOL Generated
                    </InfoText>
                  </span>
                  <span className="ws-card-value">{formatCurrency(summary.totalNolGenerated)}</span>
                  <span className="ws-card-sub">offsets future income (80%/yr)</span>
                </div>
              )}
              <div className="ws-card">
                <span className="ws-card-label">Final Total Wealth</span>
                <span className="ws-card-value">{formatCurrency(summary.finalTotalWealth)}</span>
                <span className="ws-card-sub">
                  portfolio + {formatCurrency(summary.totalQfafCashReturned)} cash returned
                </span>
              </div>
            </div>

            {ediMode && (
              <>
                <span className="ws-cards-title">EDI Economics</span>
                <div className="ws-cards">
                  <div className="ws-card">
                    <span className="ws-card-label">
                      <InfoText
                        contentKey="protection-ratio"
                        currentValue={
                          insights.protectionRatio !== null
                            ? `${insights.protectionRatio.toFixed(1)}×`
                            : '—'
                        }
                      >
                        Protection Ratio
                      </InfoText>
                    </span>
                    <span className="ws-card-value">
                      {insights.protectionRatio !== null
                        ? `${insights.protectionRatio.toFixed(1)}×`
                        : '—'}
                    </span>
                    <span className="ws-card-sub">
                      {insights.protectionRatio !== null
                        ? 'shelter value ÷ cumulative financing cost'
                        : 'financing costs disabled'}
                    </span>
                  </div>
                  <div className="ws-card">
                    <span className="ws-card-label">
                      <InfoText
                        contentKey="break-even-gain-event"
                        currentValue={formatCurrency(insights.breakEvenGainEvent)}
                      >
                        Break-Even Gain Event
                      </InfoText>
                    </span>
                    <span className="ws-card-value">{formatCurrency(insights.breakEvenGainEvent)}</span>
                    <span className="ws-card-sub">a gain this size would be fully sheltered</span>
                  </div>
                  <div className="ws-card">
                    <span className="ws-card-label">
                      <InfoText
                        contentKey="cumulative-financing-cost"
                        currentValue={formatCurrency(insights.cumulativeFinancingCost)}
                      >
                        Cumulative Financing Cost
                      </InfoText>
                    </span>
                    <span className="ws-card-value">{formatCurrency(insights.cumulativeFinancingCost)}</span>
                    <span className="ws-card-sub">
                      {settings.financingFeesEnabled
                        ? `over ${results.years.length} years`
                        : 'financing costs & fees disabled'}
                    </span>
                  </div>
                </div>
              </>
            )}

            {hasNol && incomeReqYears.length > 0 && (
              <div className="ws-income-req">
                <span className="ws-income-req-label">
                  <InfoText contentKey="col-income-required">
                    Income needed per year to fully utilize §461(l) + NOL
                  </InfoText>
                </span>
                <div className="ws-income-req-chips">
                  {incomeReqYears.map(y => (
                    <span
                      key={y.year}
                      className={`ws-income-chip ${y.year === peakIncomeReq.year ? 'ws-income-chip--peak' : ''}`}
                    >
                      Yr {y.year}: {formatCurrency(y.incomeRequiredForFullUtilization)}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {ediMode ? (
              <p className="ws-narrative">
                <strong>What this means:</strong> on a {formatCurrency(results.sizing.collateralValue)}{' '}
                portfolio with {currentStrategy?.name ?? 'the selected strategy'}, the program's main
                output is a loss reserve: an estimated{' '}
                {formatCurrency(summary.finalStCarryforward + summary.finalLtCarryforward)} of loss
                carryforwards by year {results.years.length}, worth{' '}
                {formatCurrency(summary.lossReserveShelterValue)} of shelter against future capital
                gains — contingent on those gains being realized (a business sale, concentrated-stock
                exit, RSU diversification). Realized savings along the way are an estimated{' '}
                {formatCurrency(summary.totalTaxSavings)} (the $3,000/yr deduction plus any gain
                events the reserve shelters — model one with the presets above).{' '}
                {exit.incrementalDeferredTax < 0 ? (
                  <>
                    And the reserve already covers the exit: full liquidation in year{' '}
                    {projectionYears} would cost{' '}
                    {formatCurrency(Math.abs(exit.incrementalDeferredTax))} <em>less</em> than the
                    passive baseline, for a net benefit of{' '}
                    {formatCurrency(exit.netBenefitAfterLiquidation)}.
                  </>
                ) : (
                  <>
                    Full liquidation in year {projectionYears} would surrender{' '}
                    {formatCurrency(exit.incrementalDeferredTax)} of deferred tax, leaving{' '}
                    {formatCurrency(exit.netBenefitAfterLiquidation)}; holding through death (basis
                    step-up) or donating can make the deferral permanent.
                  </>
                )}
              </p>
            ) : (
              <p className="ws-narrative">
                <strong>What this means:</strong> on a {formatCurrency(results.sizing.collateralValue)}{' '}
                portfolio with {currentStrategy?.name ?? 'the selected strategy'}, the program is
                estimated to save {formatCurrency(summary.totalTaxSavings)} over {results.years.length} years
                at a combined ordinary rate of {formatPercent(rates.combinedOrdinary)}.{' '}
                {exit.incrementalDeferredTax < 0 ? (
                  <>
                    The exit math runs in the strategy's favor: liquidating in year {projectionYears}{' '}
                    would cost {formatCurrency(Math.abs(exit.incrementalDeferredTax))} <em>less</em>{' '}
                    than the passive baseline — the loss reserve more than covers the strategy's
                    embedded gain — for a net benefit of{' '}
                    {formatCurrency(exit.netBenefitAfterLiquidation)}.
                  </>
                ) : (
                  <>
                    A portion is timing: full liquidation in year {projectionYears} would surrender{' '}
                    {formatCurrency(exit.incrementalDeferredTax)} of that, leaving{' '}
                    {formatCurrency(exit.netBenefitAfterLiquidation)}; holding through death (basis
                    step-up) or donating can make the deferral permanent.
                  </>
                )}
              </p>
            )}

            <div className="ws-note ws-note--muted">
              <strong>Step-up framing:</strong> "Net If Held to Step-Up" is mortality-contingent and
              assumes basis step-up under current law (IRC §1014). Unused loss carryforwards are
              lost at death (§1212) — their{' '}
              {formatCurrency(stepUp.continueAndDie.carryforwardValueLost)} contingent shelter value
              is NOT counted in either figure.
              {stepUp.recommendation === 'partial_unwind' && (
                <>
                  {' '}With carryforwards covering only part of the embedded gain, the modeled
                  optimum is a partial unwind of ~{Math.round(stepUp.optimalUnwindPct * 100)}%
                  during life (sheltered by the reserve), holding the rest for step-up.
                </>
              )}
              {stepUp.recommendation === 'unwind' && (
                <>
                  {' '}Here the carryforward exceeds the embedded gain, so a full unwind during
                  life is tax-free — excess reserve would otherwise be lost at death.
                </>
              )}
            </div>

            {nolExtensionYears > 0 && (
              <div className="ws-note ws-note--muted">
                <strong>Projection extended to year {results.years.length}:</strong> NOL
                carryforward remained at the end of the standard {baseHorizonYears}-year
                horizon, so the model keeps running wind-down years until it is fully used.
                Extension years assume income continues at the final scheduled year's level
                (your last income-schedule row, if set).
              </div>
            )}
            {currentStrategy?.type === 'overlay' &&
              effectiveInputs.collateralCostBasis === undefined && (
                <div className="ws-note">
                  ⚠️ <strong>Appreciated-stock collateral:</strong> the liquidation analysis
                  assumes basis equals today's value. If this collateral carries unrealized
                  gain, enter its <strong>cost basis</strong> in the Strategy panel so the
                  embedded gain and deferred tax reflect the client's true exit picture.
                </div>
              )}
            {conformityNote && (
              <div className="ws-note">⚠️ <strong>State conformity:</strong> {conformityNote}</div>
            )}
            {stateNote && (
              <div className="ws-note">⚠️ <strong>State treatment:</strong> {stateNote}</div>
            )}
            <div className="ws-note ws-note--muted">
              <strong>Rates assumed:</strong> Fed ordinary {formatPercent(getFederalOrdinaryRate(inputs.annualIncome, inputs.filingStatus))} ·
              Fed ST {formatPercent(rates.full.federalStRate)} (incl. NIIT) ·
              Fed LT {formatPercent(rates.full.federalLtRate)} (incl. NIIT) ·
              State {formatPercent(rates.profile.ordinaryRate)}
              {rates.profile.stRate !== rates.profile.ordinaryRate && (
                <> (ST {formatPercent(rates.profile.stRate)})</>
              )} →
              combined ordinary {formatPercent(rates.combinedOrdinary)} / LT {formatPercent(rates.combinedLt)}.
              Wash-sale disallowance {formatPercent(settings.washSaleDisallowanceRate)}.
            </div>
            {!ediMode && (
              <details className="ws-note ws-note--muted ws-details">
                <summary>
                  <strong>How the QFAF's tax treatment works</strong> (draft — pending counsel review)
                </summary>
                <p>{POPUP_CONTENT['qfaf-treatment'].definition}</p>
              </details>
            )}
            <div className="ws-note ws-note--muted">
              Estimates only — not investment, tax, or legal advice. See full disclosures below.
            </div>
          </div>
        )}

        {resultsView === 'table' && (
          <ResultsTable
            data={results.years}
            sizing={results.sizing}
            qfafEnabled={effectiveInputs.qfafEnabled}
            projectionYears={projectionYears}
            startMonth={effectiveInputs.startMonth}
            qfafDuration={effectiveInputs.qfafDuration}
            strategyId={effectiveInputs.strategyId}
            ltGainRate={currentStrategy?.ltGainRate}
          />
        )}

        {resultsView === 'charts' && (
          <div className="ws-charts">
            <TaxSavingsChart data={results.years} startMonth={effectiveInputs.startMonth} />
            <PortfolioValueChart
              data={results.years}
              trackingError={currentStrategy?.trackingError}
              startMonth={effectiveInputs.startMonth}
            />
          </div>
        )}

        <DisclaimerFooter />
      </section>
    </div>
  );
}
