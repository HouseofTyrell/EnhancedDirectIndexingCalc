import { useMemo, useState } from 'react';
import {
  CalculatorInputs,
  AdvancedSettings,
  DEFAULT_SETTINGS,
  FILING_STATUSES,
  FilingStatus,
} from '../types';
import {
  DEFAULTS,
  STATES,
  getFederalLtRate,
  getFederalOrdinaryRate,
  getStateRate,
  getStateTaxProfile,
  getStateConformityWarning,
} from '../taxData';
import { STRATEGIES, getStrategy } from '../strategyData';
import { calculate, computeExitTaxAnalysis, solveCollateralForTotal } from '../calculations';
import { getQuantifiedStateWarning } from '../utils/stateTaxWarnings';
import { formatCurrency, formatPercent, formatWithCommas, parseFormattedNumber } from '../utils/formatters';
import { ResultsTable } from '../ResultsTable';
import { WealthChart, TaxSavingsChart } from '../WealthChart';
import { DisclaimerFooter } from '../components/DisclaimerFooter';
import { QualifiedPurchaserModal } from '../components/QualifiedPurchaserModal';
import { useQualifiedPurchaser } from '../hooks/useQualifiedPurchaser';
import { InfoText } from '../InfoPopup';
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

  const results = useMemo(() => calculate(effectiveInputs, settings), [effectiveInputs, settings]);
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
    const profile = getStateTaxProfile(inputs.stateCode, stateRate);
    const fedOrd = getFederalOrdinaryRate(inputs.annualIncome, inputs.filingStatus);
    return {
      profile,
      combinedLt: getFederalLtRate(inputs.annualIncome, inputs.filingStatus) + profile.ltRate,
      combinedOrdinary:
        fedOrd + (profile.allowsLossOffsetAgainstIncome ? profile.ordinaryRate : 0),
    };
  }, [inputs.annualIncome, inputs.filingStatus, inputs.stateCode, inputs.stateRate]);

  const exit = useMemo(
    () =>
      computeExitTaxAnalysis(
        results,
        rates.combinedLt,
        settings.growthEnabled ? settings.defaultAnnualReturn : 0,
        rates.profile.ltcgExcise
      ),
    [results, rates, settings.growthEnabled, settings.defaultAnnualReturn]
  );

  const stateNote = useMemo(
    () => getQuantifiedStateWarning(inputs.stateCode, rates.profile.ordinaryRate, results.years),
    [inputs.stateCode, rates.profile.ordinaryRate, results.years]
  );
  const conformityNote = getStateConformityWarning(inputs.stateCode);

  if (!qualifiedPurchaser.isAcknowledged) {
    return <QualifiedPurchaserModal onAcknowledge={qualifiedPurchaser.acknowledge} />;
  }

  const { summary } = results;
  const incremental = summary.totalTaxSavings - collateralOnly.summary.totalTaxSavings;
  const year1 = results.years[0]?.taxSavings ?? 0;
  const year2 = results.years[1]?.taxSavings ?? 0;
  const projectionYears = settings.projectionYears ?? 10;
  const currentStrategy = getStrategy(inputs.strategyId);

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
        </div>

        <p className="ws-rail-note">
          Split allocation, year-by-year planning, sensitivity, and Meeting Mode
          live in the <strong>Tax Calculator</strong> tab.
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
              {projectionYears} yrs
              {!settings.financingFeesEnabled && ' · before costs & fees'}
              {settings.presentValueEnabled &&
                ` · PV ${formatCurrency(summary.totalTaxSavingsPV)}`}
            </span>
          </div>
          <div className="ws-metric">
            <span className="ws-metric-label">
              <InfoText contentKey="incremental-benefit" currentValue={formatCurrency(incremental)}>
                vs. Standard DI
              </InfoText>
            </span>
            <span className="ws-metric-value">{formatCurrency(incremental)}</span>
            <span className="ws-metric-sub">incremental</span>
          </div>
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
                  after {formatCurrency(exit.cfShelterUsed)} carryforward shelter
                </span>
              </div>
              <div className="ws-card">
                <span className="ws-card-label">
                  <InfoText contentKey="total-nol-generated" currentValue={formatCurrency(summary.totalNolGenerated)}>
                    NOL Generated
                  </InfoText>
                </span>
                <span className="ws-card-value">{formatCurrency(summary.totalNolGenerated)}</span>
                <span className="ws-card-sub">offsets future income (80%/yr)</span>
              </div>
              <div className="ws-card">
                <span className="ws-card-label">Final Total Wealth</span>
                <span className="ws-card-value">{formatCurrency(summary.finalTotalWealth)}</span>
                <span className="ws-card-sub">
                  portfolio + {formatCurrency(summary.totalQfafCashReturned)} cash returned
                </span>
              </div>
            </div>

            <p className="ws-narrative">
              <strong>What this means:</strong> on a {formatCurrency(results.sizing.collateralValue)}{' '}
              portfolio with {currentStrategy?.name ?? 'the selected strategy'}, the program is
              estimated to save {formatCurrency(summary.totalTaxSavings)} over {projectionYears} years
              at a combined ordinary rate of {formatPercent(rates.combinedOrdinary)}. A portion is
              timing: full liquidation in year {projectionYears} would surrender{' '}
              {formatCurrency(exit.incrementalDeferredTax)} of that, leaving{' '}
              {formatCurrency(exit.netBenefitAfterLiquidation)}; holding through death (basis step-up)
              or donating can make the deferral permanent.
            </p>

            {conformityNote && (
              <div className="ws-note">⚠️ <strong>State conformity:</strong> {conformityNote}</div>
            )}
            {stateNote && (
              <div className="ws-note">⚠️ <strong>State treatment:</strong> {stateNote}</div>
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
            <TaxSavingsChart data={results.years} startMonth={inputs.startMonth} />
            <WealthChart data={results.years} startMonth={inputs.startMonth} />
          </div>
        )}

        <DisclaimerFooter />
      </section>
    </div>
  );
}
