import { useState } from 'react';

interface InfoPopupProps {
  title: string;
  children: React.ReactNode;
}

export function InfoPopup({ title, children }: InfoPopupProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className="info-button"
        onClick={() => setIsOpen(true)}
        aria-label={`Info about ${title}`}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 0a8 8 0 1 0 0 16A8 8 0 0 0 8 0zm1 12H7V7h2v5zm0-6H7V4h2v2z"/>
        </svg>
      </button>

      {isOpen && (
        <div className="popup-overlay" onClick={() => setIsOpen(false)}>
          <div className="popup-content" onClick={e => e.stopPropagation()}>
            <div className="popup-header">
              <h3>{title}</h3>
              <button
                type="button"
                className="popup-close"
                onClick={() => setIsOpen(false)}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="popup-body">
              {children}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// Pre-built formula documentation components
export function TaxRatesFormula() {
  return (
    <div className="formula-doc">
      <h4>Federal Ordinary/ST Rate</h4>
      <p>Based on 2025 tax brackets for your filing status:</p>
      <pre>
{`Marginal Rate = Tax Bracket Rate + NIIT (if applicable)

NIIT (Net Investment Income Tax):
  • 3.8% on investment income
  • Applies if AGI > $250K (MFJ) or $200K (Single)

Example ($3M MFJ):
  Federal Bracket: 37%
  + NIIT: 3.8%
  = 40.8% Federal Ordinary Rate`}
      </pre>

      <h4>Federal LT Capital Gains Rate</h4>
      <pre>
{`LT Rate based on income:
  • 0% if income ≤ $89,250 (MFJ)
  • 15% if income ≤ $583,750 (MFJ)
  • 20% if income > $583,750 (MFJ)
  + NIIT 3.8% if applicable

Example ($3M MFJ):
  LT Rate: 20%
  + NIIT: 3.8%
  = 23.8% Federal LT Rate`}
      </pre>

      <h4>ST→LT Benefit</h4>
      <pre>
{`Benefit = Combined Ordinary Rate - Combined LT Rate

This is the tax savings per dollar when converting
short-term gains to long-term gains.

Example:
  54.1% (Ordinary) - 37.1% (LT) = 17.0% benefit`}
      </pre>
    </div>
  );
}

export function QfafSizingFormula() {
  return (
    <div className="formula-doc">
      <h4>QFAF Auto-Sizing Formula</h4>
      <p>QFAF is sized so its ST gains exactly match the collateral's ST losses:</p>
      <pre>
{`QFAF Value = (Collateral × ST Loss Rate) / 150%

Where:
  • Collateral = Your investment amount
  • ST Loss Rate = Strategy's annual ST loss rate
  • 150% = QFAF's ST gain rate (fixed)

Example ($10M Core 145/45):
  Collateral ST Losses = $10M × 13% = $1.3M
  QFAF Value = $1.3M / 1.50 = $866,667

Verification:
  QFAF ST Gains = $866,667 × 150% = $1.3M ✓`}
      </pre>

      <h4>Why This Sizing?</h4>
      <p>
        QFAF generates short-term gains that would be taxed at ordinary rates (~40.8%).
        By matching these with collateral ST losses, you convert them to long-term
        treatment (~23.8%), saving ~17% in taxes.
      </p>
    </div>
  );
}

export function Section461lFormula() {
  return (
    <div className="formula-doc">
      <h4>Section 461(l) Excess Business Loss Limitation</h4>
      <p>Limits how much ordinary loss can offset W-2/ordinary income each year:</p>
      <pre>
{`2026 Limits:
  • MFJ: $512,000
  • Single/MFS/HOH: $256,000

Usable Ordinary Loss = min(QFAF Ordinary Losses, §461(l) Limit)
Excess to NOL = QFAF Ordinary Losses - Usable Ordinary Loss`}
      </pre>

      <h4>Example ($10M Core 145/45, MFJ)</h4>
      <pre>
{`QFAF Ordinary Losses = $866,667 × 150% = $1,300,000
§461(l) Limit (MFJ) = $512,000

Usable This Year = $512,000
Excess → NOL = $1,300,000 - $512,000 = $788,000`}
      </pre>

      <h4>NOL Carryforward</h4>
      <p>
        Excess ordinary losses become Net Operating Loss (NOL) carryforward.
        NOL can offset up to <strong>80% of taxable income</strong> in future years,
        carried forward indefinitely.
      </p>
    </div>
  );
}

export function TaxAlphaFormula() {
  return (
    <div className="formula-doc">
      <h4>Annual Tax Alpha Calculation</h4>
      <p>Tax alpha comes from three components:</p>
      <pre>
{`Tax Alpha = ST→LT Conversion Benefit
          + Ordinary Loss Benefit
          - LT Gain Cost

Where:
  ST→LT Conversion = Matched ST Amount × (ST Rate - LT Rate)
  Ordinary Loss Benefit = Usable Ordinary Loss × Ordinary Rate
  LT Gain Cost = Collateral LT Gains × LT Rate`}
      </pre>

      <h4>Example ($10M Core 145/45, MFJ, CA)</h4>
      <pre>
{`Annual Tax Events:
  QFAF ST Gains: $1,300,000 (matched by collateral)
  QFAF Ordinary Losses: $1,300,000 (capped at $512K)
  Collateral ST Losses: $1,300,000
  Collateral LT Gains: $290,000

Tax Alpha Components:
  ST→LT Conversion: $1.3M × 17% = +$221,000
  Ordinary Loss: $512K × 40.8% = +$208,896
  LT Gain Cost: $290K × 23.8% = -$69,020
  ─────────────────────────────────────────
  Net Tax Alpha: $360,876/year

As % of Total: $360,876 / $10,866,667 = 3.32%`}
      </pre>
    </div>
  );
}

export function StrategyRatesFormula() {
  return (
    <div className="formula-doc">
      <h4>Quantinno Beta 1 Strategy Rates</h4>
      <p>Each strategy has fixed annual ST loss and LT gain rates:</p>

      <h5>Core Strategies (Cash Funded)</h5>
      <table className="formula-table">
        <thead>
          <tr>
            <th>Strategy</th>
            <th>Long/Short</th>
            <th>ST Loss</th>
            <th>LT Gain</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>Core 130/30</td><td>130%/30%</td><td>-10%</td><td>+2.4%</td></tr>
          <tr><td>Core 145/45</td><td>145%/45%</td><td>-13%</td><td>+2.9%</td></tr>
          <tr><td>Core 175/75</td><td>175%/75%</td><td>-19%</td><td>+3.8%</td></tr>
          <tr><td>Core 225/125</td><td>225%/125%</td><td>-29%</td><td>+5.3%</td></tr>
        </tbody>
      </table>

      <h5>Overlay Strategies (Appreciated Stock)</h5>
      <table className="formula-table">
        <thead>
          <tr>
            <th>Strategy</th>
            <th>Long/Short</th>
            <th>ST Loss</th>
            <th>LT Gain</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>Overlay 30/30</td><td>30%/30%</td><td>-6%</td><td>+0.9%</td></tr>
          <tr><td>Overlay 45/45</td><td>45%/45%</td><td>-9%</td><td>+1.4%</td></tr>
          <tr><td>Overlay 75/75</td><td>75%/75%</td><td>-15%</td><td>+2.3%</td></tr>
          <tr><td>Overlay 125/125</td><td>125%/125%</td><td>-25%</td><td>+3.8%</td></tr>
        </tbody>
      </table>

      <h4>ST Loss Sources</h4>
      <p>ST losses come from two sources:</p>
      <ol>
        <li><strong>Short leg closures</strong> - Closing short positions at gains</li>
        <li><strong>Tax-loss harvesting</strong> - Selling long positions at losses</li>
      </ol>
    </div>
  );
}

export function QfafMechanicsFormula() {
  return (
    <div className="formula-doc">
      <h4>QFAF Mechanics</h4>
      <p>QFAF is a K-1 partnership hedge fund with fixed 250/250 leverage:</p>
      <pre>
{`QFAF Annual Tax Events (per $1 invested):
  • ST Capital Gains: 150% of market value
  • Ordinary Losses: 150% of market value

These are generated through swap contracts that produce:
  • Short-term gains (taxed at ordinary rates if unmatched)
  • Ordinary losses (can offset W-2 income)`}
      </pre>

      <h4>Why Match ST Gains?</h4>
      <pre>
{`Without matching:
  $1.3M ST gains × 40.8% = $530,400 tax

With collateral ST loss matching:
  $1.3M ST gains - $1.3M ST losses = $0 net ST
  Instead: $1.3M realized as LT gains
  $1.3M × 23.8% = $309,400 tax

Tax Savings: $530,400 - $309,400 = $221,000`}
      </pre>
    </div>
  );
}

export function ProjectionFormula() {
  return (
    <div className="formula-doc">
      <h4>10-Year Projection Assumptions</h4>
      <pre>
{`Portfolio Growth: 7% annual return (conservative)

Each Year:
  QFAF Value(n+1) = QFAF Value(n) × 1.07
  Collateral Value(n+1) = Collateral Value(n) × 1.07

Tax Events (annual, based on year-start values):
  QFAF ST Gains = QFAF Value × 150%
  QFAF Ordinary Losses = QFAF Value × 150%
  Collateral ST Losses = Collateral Value × ST Loss Rate
  Collateral LT Gains = Collateral Value × LT Gain Rate`}
      </pre>

      <h4>Tax Savings Calculation</h4>
      <pre>
{`Baseline Tax = LT Gains × Combined LT Rate
  (assumes passive investment taxed at LT rates)

Actual Tax = Federal Tax + State Tax
  (after applying strategy benefits)

Tax Savings = Baseline Tax - Actual Tax`}
      </pre>

      <h4>Effective Tax Alpha</h4>
      <pre>
{`Effective Tax Alpha = Total Tax Savings / Total Exposure / 10 years

This gives the annualized tax benefit as a percentage
of your total investment.`}
      </pre>
    </div>
  );
}
