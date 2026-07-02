import { brandText, useBrandRevealed } from '../../branding';

export function TaxAlphaFormula() {
  useBrandRevealed();
  return (
    <div className="formula-doc">
      <h4>Annual Tax Alpha Calculation</h4>
      <p>Tax alpha comes from two components:</p>
      <pre>
        {brandText(`Tax Alpha = Ordinary Loss Benefit
          - LT Gain Cost

Where:
  Ordinary Loss Benefit = Usable Ordinary Loss × Ordinary Rate
  LT Gain Cost = Collateral LT Gains × LT Rate

Note: QFAF short-term gains are offset by collateral
short-term losses (by design), so they wash to zero.`)}
      </pre>

      <h4>Example ($10M Core 145/45, MFJ, CA)</h4>
      <pre>
        {brandText(`Annual Tax Events:
  QFAF ST Gains: $1,300,000 (offset by collateral ST losses)
  QFAF Ordinary Losses: $1,300,000 (capped at $512K for MFJ)
  Collateral ST Losses: $1,300,000 (offsets QFAF ST gains)
  Collateral LT Gains: $290,000

Tax Alpha Components:
  Ordinary Loss: $512K × 40.8% = +$208,896
  LT Gain Cost: $290K × 23.8% = -$69,020
  ─────────────────────────────────────────
  Net Tax Alpha: $139,876/year

As % of Total: $139,876 / $10,866,667 = 1.29%`)}
      </pre>
    </div>
  );
}
