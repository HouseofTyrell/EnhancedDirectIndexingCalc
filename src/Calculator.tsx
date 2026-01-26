import { useState, useMemo } from 'react';
import { calculate } from './calculations';
import { WealthChart } from './WealthChart';
import { ResultsTable } from './ResultsTable';
import { DEFAULTS, STATES } from './taxData';
import { CalculatorInputs } from './types';

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

  return (
    <div className="calculator">
      <header className="header">
        <h1>Tax Optimization Calculator</h1>
        <p className="subtitle">QFAF + Enhanced Direct Indexing Strategy</p>
      </header>

      {/* Input Form */}
      <section className="inputs-section">
        <h2>Client Profile</h2>
        <div className="input-grid">
          <div className="input-group">
            <label htmlFor="investment">Investment Amount</label>
            <div className="input-with-prefix">
              <span className="prefix">$</span>
              <input
                id="investment"
                type="number"
                value={inputs.investmentAmount}
                onChange={e => updateInput('investmentAmount', Number(e.target.value))}
                min={0}
                step={10000}
              />
            </div>
          </div>

          <div className="input-group">
            <label htmlFor="income">Annual Income</label>
            <div className="input-with-prefix">
              <span className="prefix">$</span>
              <input
                id="income"
                type="number"
                value={inputs.annualIncome}
                onChange={e => updateInput('annualIncome', Number(e.target.value))}
                min={0}
                step={10000}
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

          <div className="input-group full-width">
            <label htmlFor="allocation">
              Strategy Allocation: QFAF {Math.round((1 - inputs.ediAllocation) * 100)}% / EDI {Math.round(inputs.ediAllocation * 100)}%
            </label>
            <input
              id="allocation"
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={inputs.ediAllocation}
              onChange={e => updateInput('ediAllocation', Number(e.target.value))}
            />
            <div className="allocation-labels">
              <span>100% QFAF</span>
              <span>50/50</span>
              <span>100% EDI</span>
            </div>
          </div>
        </div>
      </section>

      {/* Advanced Settings */}
      <details className="advanced-section">
        <summary>Advanced Settings</summary>
        <div className="input-grid">
          <div className="input-group">
            <label htmlFor="qfafReturn">QFAF Expected Return (%)</label>
            <div className="input-with-suffix">
              <input
                id="qfafReturn"
                type="number"
                step={0.5}
                min={0}
                max={50}
                value={(inputs.qfafReturn * 100).toFixed(1)}
                onChange={e => updateInput('qfafReturn', Number(e.target.value) / 100)}
              />
              <span className="suffix">%</span>
            </div>
          </div>

          <div className="input-group">
            <label htmlFor="qfafStGain">QFAF ST Gain % of Return</label>
            <div className="input-with-suffix">
              <input
                id="qfafStGain"
                type="number"
                step={5}
                min={0}
                max={100}
                value={(inputs.qfafStGainPct * 100).toFixed(0)}
                onChange={e => updateInput('qfafStGainPct', Number(e.target.value) / 100)}
              />
              <span className="suffix">%</span>
            </div>
          </div>

          <div className="input-group">
            <label htmlFor="ediReturn">EDI Expected Return (%)</label>
            <div className="input-with-suffix">
              <input
                id="ediReturn"
                type="number"
                step={0.5}
                min={0}
                max={50}
                value={(inputs.ediReturn * 100).toFixed(1)}
                onChange={e => updateInput('ediReturn', Number(e.target.value) / 100)}
              />
              <span className="suffix">%</span>
            </div>
          </div>

          <div className="input-group">
            <label htmlFor="ediHarvest">EDI Year 1 Harvesting Rate (%)</label>
            <div className="input-with-suffix">
              <input
                id="ediHarvest"
                type="number"
                step={0.5}
                min={0}
                max={20}
                value={(inputs.ediHarvestingYear1 * 100).toFixed(1)}
                onChange={e => updateInput('ediHarvestingYear1', Number(e.target.value) / 100)}
              />
              <span className="suffix">%</span>
            </div>
          </div>

          <div className="input-group">
            <label htmlFor="stCarry">Existing ST Loss Carryforward</label>
            <div className="input-with-prefix">
              <span className="prefix">$</span>
              <input
                id="stCarry"
                type="number"
                value={inputs.existingStLossCarryforward}
                onChange={e => updateInput('existingStLossCarryforward', Number(e.target.value))}
                min={0}
                step={1000}
              />
            </div>
          </div>

          <div className="input-group">
            <label htmlFor="ltCarry">Existing LT Loss Carryforward</label>
            <div className="input-with-prefix">
              <span className="prefix">$</span>
              <input
                id="ltCarry"
                type="number"
                value={inputs.existingLtLossCarryforward}
                onChange={e => updateInput('existingLtLossCarryforward', Number(e.target.value))}
                min={0}
                step={1000}
              />
            </div>
          </div>
        </div>
      </details>

      {/* Results Summary */}
      <section className="results-section">
        <h2>10-Year Projection Results</h2>
        <div className="summary-cards">
          <div className="card primary">
            <h3>Total Tax Savings</h3>
            <p className="big-number">{formatCurrency(results.summary.totalTaxSavings)}</p>
            <p className="subtext">Over 10 years</p>
          </div>
          <div className="card">
            <h3>Final Portfolio Value</h3>
            <p className="big-number">{formatCurrency(results.summary.finalPortfolioValue)}</p>
            <p className="subtext">Year 10</p>
          </div>
          <div className="card">
            <h3>Annualized Tax Alpha</h3>
            <p className="big-number">{formatPercent(results.summary.effectiveTaxAlpha)}</p>
            <p className="subtext">Per year</p>
          </div>
        </div>

        {/* Chart */}
        <WealthChart data={results.years} />

        {/* Table */}
        <ResultsTable data={results.years} />
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
          Consult a qualified tax advisor before making investment decisions.
        </p>
      </footer>
    </div>
  );
}
