export function TaxRatesFormula() {
  return (
    <div className="formula-doc">
      <h4>Federal Ordinary/ST Rate</h4>
      <p>Based on 2026 tax brackets for your filing status:</p>
      <pre>
        {`Marginal Rate = Tax Bracket Rate + NIIT (if applicable)

2026 MFJ Brackets:
  • 10%: $0 - $24,800
  • 12%: $24,800 - $100,800
  • 22%: $100,800 - $211,400
  • 24%: $211,400 - $403,550
  • 32%: $403,550 - $512,450
  • 35%: $512,450 - $768,700
  • 37%: $768,700+

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
        {`2026 LT Rate based on income (MFJ):
  • 0% if income ≤ $96,700
  • 15% if income ≤ $610,350
  • 20% if income > $610,350
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
