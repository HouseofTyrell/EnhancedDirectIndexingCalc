import { useState, useMemo } from 'react';
import { calculate } from './calculations';
import { TaxSavingsChart, PortfolioValueChart } from './WealthChart';
import { ResultsTable } from './ResultsTable';
import { DEFAULTS, STATES, getFederalStRate, getFederalLtRate, getStateRate } from './taxData';
import { STRATEGIES, getStrategy } from './strategyData';
import { CalculatorInputs } from './types';
import {
  InfoPopup,
  FieldInfoPopup,
  TaxRatesFormula,
  QfafSizingFormula,
  StrategyRatesFormula,
  ProjectionFormula,
} from './InfoPopup';

// Format number with commas for display
const formatWithCommas = (value: number) => {
  return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
};

// Parse comma-formatted string back to number
const parseFormattedNumber = (value: string) => {
  const parsed = Number(value.replace(/,/g, ''));
  return isNaN(parsed) ? 0 : parsed;
};

export function Calculator() {
  const [inputs, setInputs] = useState<CalculatorInputs>(DEFAULTS);

  const results = useMemo(() => calculate(inputs), [inputs]);

  const updateInput = <K extends keyof CalculatorInputs>(
    key: K,
    value: CalculatorInputs[K]
  ) => {
    setInputs(prev => ({ ...prev, [key]: value }));
  };

  const formatCurrency = (value: number) => {
    return `$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  };

  const formatPercent = (value: number) => {
    return `${(value * 100).toFixed(2)}%`;
  };

  const currentStrategy = getStrategy(inputs.strategyId);

  // Calculate marginal tax rates
  const federalStRate = getFederalStRate(inputs.annualIncome, inputs.filingStatus);
  const federalLtRate = getFederalLtRate(inputs.annualIncome, inputs.filingStatus);
  const stateRate = inputs.stateCode === 'OTHER' ? inputs.stateRate : getStateRate(inputs.stateCode);
  const combinedStRate = federalStRate + stateRate;
  const combinedLtRate = federalLtRate + stateRate;
  const rateDifferential = combinedStRate - combinedLtRate;

  return (
    <div className="calculator">
      <header className="header">
        <h1>Tax Optimization Calculator</h1>
        <p className="subtitle">QFAF + Collateral Strategy</p>
      </header>

      {/* Input Form */}
      <section className="inputs-section">
        <div className="section-header">
          <h2>Client Profile</h2>
          <InfoPopup title="Strategy Selection">
            <StrategyRatesFormula />
          </InfoPopup>
        </div>
        <div className="input-grid">
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
                    {s.name} - {s.label} (-{(s.stLossRate * 100).toFixed(0)}% ST / +{(s.ltGainRate * 100).toFixed(1)}% LT)
                  </option>
                ))}
              </optgroup>
              <optgroup label="Overlay (Appreciated Stock)">
                {STRATEGIES.filter(s => s.type === 'overlay').map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name} - {s.label} (-{(s.stLossRate * 100).toFixed(0)}% ST / +{(s.ltGainRate * 100).toFixed(1)}% LT)
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
            <div className="input-with-prefix">
              <span className="prefix">$</span>
              <input
                id="collateral"
                type="text"
                inputMode="numeric"
                value={formatWithCommas(inputs.collateralAmount)}
                onChange={e => updateInput('collateralAmount', parseFormattedNumber(e.target.value))}
              />
            </div>
          </div>

          <div className="input-group">
            <label htmlFor="income">Annual Income</label>
            <div className="input-with-prefix">
              <span className="prefix">$</span>
              <input
                id="income"
                type="text"
                inputMode="numeric"
                value={formatWithCommas(inputs.annualIncome)}
                onChange={e => updateInput('annualIncome', parseFormattedNumber(e.target.value))}
              />
            </div>
          </div>

          <div className="input-group">
            <label htmlFor="filing">Filing Status</label>
            <select
              id="filing"
              value={inputs.filingStatus}
              onChange={e => updateInput('filingStatus', e.target.value as CalculatorInputs['filingStatus'])}
            >
              <option value="single">Single</option>
              <option value="mfj">Married Filing Jointly</option>
              <option value="mfs">Married Filing Separately</option>
              <option value="hoh">Head of Household</option>
            </select>
          </div>

          <div className="input-group">
            <label htmlFor="state">State of Residence</label>
            <select
              id="state"
              value={inputs.stateCode}
              onChange={e => updateInput('stateCode', e.target.value)}
            >
              {STATES.map(s => (
                <option key={s.code} value={s.code}>{s.name}</option>
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
                  onChange={e => updateInput('stateRate', Number(e.target.value) / 100)}
                />
                <span className="suffix">%</span>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Marginal Tax Rates */}
      <section className="tax-rates-section">
        <div className="section-header">
          <h2>Marginal Tax Rates</h2>
          <InfoPopup title="Tax Rate Calculations">
            <TaxRatesFormula />
          </InfoPopup>
        </div>
        <div className="tax-rates-grid">
          <div className="tax-rate-item">
            <span className="rate-label">
              Federal Ordinary/ST
              <FieldInfoPopup contentKey="federal-st-rate" currentValue={`${(federalStRate * 100).toFixed(1)}%`} />
            </span>
            <span className="rate-value">{(federalStRate * 100).toFixed(1)}%</span>
          </div>
          <div className="tax-rate-item">
            <span className="rate-label">
              Federal LT Cap Gains
              <FieldInfoPopup contentKey="federal-lt-rate" currentValue={`${(federalLtRate * 100).toFixed(1)}%`} />
            </span>
            <span className="rate-value">{(federalLtRate * 100).toFixed(1)}%</span>
          </div>
          <div className="tax-rate-item">
            <span className="rate-label">
              State
              <FieldInfoPopup contentKey="state-rate" currentValue={`${(stateRate * 100).toFixed(1)}%`} />
            </span>
            <span className="rate-value">{(stateRate * 100).toFixed(1)}%</span>
          </div>
          <div className="tax-rate-item highlight">
            <span className="rate-label">
              Combined Ordinary
              <FieldInfoPopup contentKey="combined-st-rate" currentValue={`${(combinedStRate * 100).toFixed(1)}%`} />
            </span>
            <span className="rate-value">{(combinedStRate * 100).toFixed(1)}%</span>
          </div>
          <div className="tax-rate-item highlight">
            <span className="rate-label">
              Combined LT
              <FieldInfoPopup contentKey="combined-lt-rate" currentValue={`${(combinedLtRate * 100).toFixed(1)}%`} />
            </span>
            <span className="rate-value">{(combinedLtRate * 100).toFixed(1)}%</span>
          </div>
          <div className="tax-rate-item accent">
            <span className="rate-label">
              ST→LT Benefit
              <FieldInfoPopup contentKey="st-lt-benefit" currentValue={`${(rateDifferential * 100).toFixed(1)}%`} />
            </span>
            <span className="rate-value">{(rateDifferential * 100).toFixed(1)}%</span>
          </div>
        </div>
      </section>

      {/* Strategy Sizing */}
      <section className="sizing-section">
        <div className="section-header">
          <h2>Strategy Sizing</h2>
          <InfoPopup title="QFAF Auto-Sizing">
            <QfafSizingFormula />
          </InfoPopup>
        </div>
        <div className="sizing-cards">
          <div className="sizing-card">
            <span className="sizing-label">
              Collateral
              <FieldInfoPopup contentKey="collateral-value" currentValue={formatCurrency(results.sizing.collateralValue)} />
            </span>
            <span className="sizing-value">{formatCurrency(results.sizing.collateralValue)}</span>
            <span className="sizing-sublabel">{results.sizing.strategyName}</span>
          </div>
          <div className="sizing-card">
            <span className="sizing-label">
              Auto-Sized QFAF
              <FieldInfoPopup contentKey="auto-sized-qfaf" currentValue={formatCurrency(results.sizing.qfafValue)} />
            </span>
            <span className="sizing-value">{formatCurrency(results.sizing.qfafValue)}</span>
            <span className="sizing-sublabel">{formatPercent(results.sizing.qfafRatio)} of collateral</span>
          </div>
          <div className="sizing-card highlight">
            <span className="sizing-label">
              Total Exposure
              <FieldInfoPopup contentKey="total-exposure" currentValue={formatCurrency(results.sizing.totalExposure)} />
            </span>
            <span className="sizing-value">{formatCurrency(results.sizing.totalExposure)}</span>
          </div>
          <div className="sizing-card">
            <span className="sizing-label">
              §461(l) Limit
              <FieldInfoPopup contentKey="section-461-limit" currentValue={formatCurrency(results.sizing.section461Limit)} />
            </span>
            <span className="sizing-value">{formatCurrency(results.sizing.section461Limit)}</span>
            <span className="sizing-sublabel">{inputs.filingStatus === 'mfj' ? 'MFJ' : 'Single/Other'}</span>
          </div>
        </div>

        <div className="offset-status">
          <div className="offset-row">
            <span>
              Year 1 ST Losses (Collateral)
              <FieldInfoPopup contentKey="year1-st-losses" currentValue={formatCurrency(results.sizing.year1StLosses)} />
            </span>
            <span className="positive">{formatCurrency(results.sizing.year1StLosses)}</span>
          </div>
          <div className="offset-row">
            <span>
              Year 1 ST Gains (QFAF)
              <FieldInfoPopup contentKey="year1-st-gains" currentValue={formatCurrency(results.sizing.year1StGains)} />
            </span>
            <span className="negative">({formatCurrency(results.sizing.year1StGains)})</span>
          </div>
          <div className="offset-row result success">
            <span>
              Net ST Position
              <FieldInfoPopup contentKey="net-st-position" currentValue="$0 (Fully Matched)" />
            </span>
            <span>Fully Matched</span>
          </div>
          <div className="offset-row">
            <span>
              Year 1 Ordinary Loss (QFAF)
              <FieldInfoPopup contentKey="year1-ordinary-losses" currentValue={formatCurrency(results.sizing.year1OrdinaryLosses)} />
            </span>
            <span className="positive">{formatCurrency(results.sizing.year1OrdinaryLosses)}</span>
          </div>
          <div className="offset-row">
            <span>
              Usable Ordinary Loss
              <FieldInfoPopup contentKey="usable-ordinary-loss" currentValue={formatCurrency(results.sizing.year1UsableOrdinaryLoss)} />
            </span>
            <span className="positive">{formatCurrency(results.sizing.year1UsableOrdinaryLoss)}</span>
          </div>
          {results.sizing.year1ExcessToNol > 0 && (
            <div className="offset-row">
              <span>
                Excess → NOL Carryforward
                <FieldInfoPopup contentKey="excess-to-nol" currentValue={formatCurrency(results.sizing.year1ExcessToNol)} />
              </span>
              <span>{formatCurrency(results.sizing.year1ExcessToNol)}</span>
            </div>
          )}
        </div>
      </section>

      {/* Advanced Settings */}
      <details className="advanced-section">
        <summary>Advanced Settings</summary>
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
                onChange={e => updateInput('existingStLossCarryforward', parseFormattedNumber(e.target.value))}
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
                onChange={e => updateInput('existingLtLossCarryforward', parseFormattedNumber(e.target.value))}
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
                onChange={e => updateInput('existingNolCarryforward', parseFormattedNumber(e.target.value))}
              />
            </div>
            <span className="input-hint">Can offset 80% of future taxable income</span>
          </div>
        </div>
      </details>

      {/* Results Summary */}
      <section className="results-section">
        <div className="section-header">
          <h2>10-Year Projection Results</h2>
          <InfoPopup title="Projection Methodology">
            <ProjectionFormula />
          </InfoPopup>
        </div>
        <div className="summary-cards">
          <div className="card primary">
            <h3>
              Total Tax Savings
              <FieldInfoPopup contentKey="total-tax-savings" currentValue={formatCurrency(results.summary.totalTaxSavings)} />
            </h3>
            <p className="big-number">{formatCurrency(results.summary.totalTaxSavings)}</p>
            <p className="subtext">Over 10 years</p>
          </div>
          <div className="card">
            <h3>
              Final Portfolio Value
              <FieldInfoPopup contentKey="final-portfolio-value" currentValue={formatCurrency(results.summary.finalPortfolioValue)} />
            </h3>
            <p className="big-number">{formatCurrency(results.summary.finalPortfolioValue)}</p>
            <p className="subtext">Year 10</p>
          </div>
          <div className="card">
            <h3>
              Annualized Tax Alpha
              <FieldInfoPopup contentKey="effective-tax-alpha" currentValue={formatPercent(results.summary.effectiveTaxAlpha)} />
            </h3>
            <p className="big-number">{formatPercent(results.summary.effectiveTaxAlpha)}</p>
            <p className="subtext">Per year</p>
          </div>
          <div className="card">
            <h3>
              Total NOL Generated
              <FieldInfoPopup contentKey="total-nol-generated" currentValue={formatCurrency(results.summary.totalNolGenerated)} />
            </h3>
            <p className="big-number">{formatCurrency(results.summary.totalNolGenerated)}</p>
            <p className="subtext">Cumulative excess</p>
          </div>
        </div>

        {/* Tax Benefits Chart */}
        <TaxSavingsChart data={results.years} />

        {/* Table */}
        <ResultsTable data={results.years} />

        {/* Portfolio Value Chart */}
        <PortfolioValueChart data={results.years} />
      </section>

      {/* Actions */}
      <section className="actions">
        <button className="print-btn" onClick={() => window.print()}>
          Print / Save as PDF
        </button>
      </section>

      {/* Disclaimer */}
      <footer className="disclaimer">
        <p>
          <strong>Disclaimer:</strong> This calculator provides estimates for illustrative purposes only.
          Actual tax outcomes depend on individual circumstances, tax law changes, and market conditions.
          The projections assume consistent returns and do not account for market volatility.
          Section 461(l) limits and NOL rules may change with future tax legislation.
          Consult a qualified tax advisor before making investment decisions.
        </p>
      </footer>
    </div>
  );
}
