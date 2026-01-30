interface ProjectionFormulaProps {
  qfafMultiplier?: number;
}

export function ProjectionFormula({ qfafMultiplier = 1.5 }: ProjectionFormulaProps) {
  const pct = (qfafMultiplier * 100).toFixed(0);
  return (
    <div className="formula-doc">
      <h4>10-Year Projection Assumptions</h4>
      <pre>
        {`Portfolio Growth: 7% annual return (conservative)

Each Year:
  QFAF Value(n+1) = QFAF Value(n) × 1.07
  Collateral Value(n+1) = Collateral Value(n) × 1.07

Tax Events (annual, based on year-start values):
  QFAF ST Gains = QFAF Value × ${pct}%
  QFAF Ordinary Losses = QFAF Value × ${pct}%
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
