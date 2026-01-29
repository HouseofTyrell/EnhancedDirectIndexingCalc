export function DisclaimerFooter() {
  return (
    <footer className="disclaimer">
      <div className="disclaimer-header">
        <strong>Important Disclosures</strong>
      </div>

      <div className="disclaimer-grid">
        <div className="disclaimer-section">
          <h4>Projection Limitations</h4>
          <ul>
            <li>Projections assume constant annual returns; actual markets are volatile</li>
            <li>
              Tax-loss harvesting effectiveness decays over time as easy losses are exhausted
            </li>
            <li>Wash sale disallowance (5-15% of losses) reduces actual tax benefits</li>
            <li>Financing costs for leveraged positions reduce net returns</li>
          </ul>
        </div>

        <div className="disclaimer-section">
          <h4>Tax &amp; Regulatory Risks</h4>
          <ul>
            <li>Section 461(l) limits are inflation-adjusted annually and may change</li>
            <li>NOL rules (80% offset limit) could be modified by future legislation</li>
            <li>State tax treatment varies; some states do not conform to federal rules</li>
            <li>QFAF tax treatment depends on ongoing IRS guidance</li>
          </ul>
        </div>

        <div className="disclaimer-section">
          <h4>Investment Risks</h4>
          <ul>
            <li>Leveraged strategies amplify both gains and losses</li>
            <li>Margin calls may force liquidation at unfavorable times</li>
            <li>Tracking error means returns may deviate significantly from benchmarks</li>
            <li>Lock-up periods may restrict access to capital</li>
          </ul>
        </div>

        <div className="disclaimer-section">
          <h4>Suitability</h4>
          <ul>
            <li>QFAF strategies are designed for Qualified Purchasers ($5M+ investments)</li>
            <li>Not suitable for investors who cannot tolerate significant volatility</li>
            <li>This calculator is for educational purposes only</li>
            <li>Consult qualified tax, legal, and investment advisors before investing</li>
          </ul>
        </div>
      </div>

      <p className="disclaimer-footer">
        This calculator provides estimates for illustrative purposes only and does not constitute
        investment, tax, or legal advice. Past performance does not guarantee future results.
      </p>
    </footer>
  );
}
