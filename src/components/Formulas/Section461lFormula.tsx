export function Section461lFormula() {
  return (
    <div className="formula-doc">
      <h4>Section 461(l) Excess Business Loss Limitation</h4>
      <p>Limits how much ordinary loss can offset W-2/ordinary income each year:</p>
      <pre>
        {`2026 Limits (per Rev. Proc. 2025-32):
  • MFJ: $512,000
  • Single/MFS/HOH: $256,000

Usable Ordinary Loss = min(QFAF Ordinary Losses, §461(l) Limit, Taxable Income)
Excess to NOL = QFAF Ordinary Losses - Usable Ordinary Loss`}
      </pre>

      <h4>Example ($10M Core 145/45, MFJ)</h4>
      <pre>
        {`QFAF Ordinary Losses = $866,667 × 150% = $1,300,000
§461(l) Limit (MFJ) = $512,000

Usable This Year = min($1,300,000, $512,000, Taxable Income)
Excess → NOL = Ordinary Losses - Usable Amount`}
      </pre>

      <h4>NOL Carryforward</h4>
      <p>
        Excess ordinary losses become Net Operating Loss (NOL) carryforward. NOL can offset up to{' '}
        <strong>80% of taxable income</strong> in future years, carried forward indefinitely.
      </p>
    </div>
  );
}
