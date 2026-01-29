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
          <tr>
            <td>Core 130/30</td>
            <td>130%/30%</td>
            <td>-10%</td>
            <td>+2.4%</td>
          </tr>
          <tr>
            <td>Core 145/45</td>
            <td>145%/45%</td>
            <td>-13%</td>
            <td>+2.9%</td>
          </tr>
          <tr>
            <td>Core 175/75</td>
            <td>175%/75%</td>
            <td>-19%</td>
            <td>+3.8%</td>
          </tr>
          <tr>
            <td>Core 225/125</td>
            <td>225%/125%</td>
            <td>-29%</td>
            <td>+5.3%</td>
          </tr>
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
          <tr>
            <td>Overlay 30/30</td>
            <td>30%/30%</td>
            <td>-6%</td>
            <td>+0.9%</td>
          </tr>
          <tr>
            <td>Overlay 45/45</td>
            <td>45%/45%</td>
            <td>-9%</td>
            <td>+1.4%</td>
          </tr>
          <tr>
            <td>Overlay 75/75</td>
            <td>75%/75%</td>
            <td>-15%</td>
            <td>+2.3%</td>
          </tr>
          <tr>
            <td>Overlay 125/125</td>
            <td>125%/125%</td>
            <td>-25%</td>
            <td>+3.8%</td>
          </tr>
        </tbody>
      </table>

      <h4>ST Loss Sources</h4>
      <p>ST losses come from two sources:</p>
      <ol>
        <li>
          <strong>Short leg closures</strong> - Closing short positions at gains
        </li>
        <li>
          <strong>Tax-loss harvesting</strong> - Selling long positions at losses
        </li>
      </ol>
    </div>
  );
}
