interface QfafMechanicsFormulaProps {
  qfafMultiplier?: number;
}

export function QfafMechanicsFormula({ qfafMultiplier = 1.5 }: QfafMechanicsFormulaProps) {
  const pct = (qfafMultiplier * 100).toFixed(0);
  return (
    <div className="formula-doc">
      <h4>QFAF Mechanics</h4>
      <p>QFAF is a K-1 partnership hedge fund with fixed 250/250 leverage:</p>
      <pre>
        {`QFAF Annual Tax Events (per $1 invested):
  • ST Capital Gains: ${pct}% of market value
  • Ordinary Losses: ${pct}% of market value

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
