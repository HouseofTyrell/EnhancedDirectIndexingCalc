export function QfafSizingFormula() {
  return (
    <div className="formula-doc">
      <h4>QFAF Auto-Sizing Formula</h4>
      <p>QFAF is sized so its ST gains match the collateral's average ST losses over the sizing window:</p>
      <pre>
        {`QFAF Value = (Collateral × Avg ST Loss Rate) / 150%

Where:
  • Collateral = Your investment amount
  • Avg ST Loss Rate = Average of strategy's ST loss
    rates over the sizing window (Years 1–N)
  • 150% = QFAF's ST gain rate (fixed)
  • Sizing Window = Adjustable from 1 yr to last yr
    (default: all projection years)

Example ($10M Core 145/45, Yrs 1–10 avg):
  Avg ST Loss Rate ≈ 9.7%
  Avg ST Losses = $10M × 9.7% = $970K
  QFAF Value = $970K / 1.50 = $646,667

Year 1 only ($10M Core 145/45):
  ST Losses = $10M × 28.5% = $2.85M
  QFAF Value = $2.85M / 1.50 = $1.9M`}
      </pre>

      <h4>Why This Sizing?</h4>
      <p>
        QFAF generates short-term gains that would be taxed at ordinary rates (~40.8%). By matching
        these with collateral ST losses, you convert them to long-term treatment (~23.8%), saving
        ~17% in taxes.
      </p>
    </div>
  );
}
