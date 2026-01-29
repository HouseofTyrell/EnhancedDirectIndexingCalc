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
  QFAF Ordinary Losses: $1,300,000 (capped at $512K for MFJ)
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
