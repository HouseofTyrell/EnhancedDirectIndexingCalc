import { YearResult } from './types';

interface ResultsTableProps {
  data: YearResult[];
}

const formatCurrency = (value: number) => {
  return `$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
};

export function ResultsTable({ data }: ResultsTableProps) {
  // Calculate cumulative tax savings
  let cumulativeSavings = 0;

  return (
    <div className="table-container">
      <h3>Year-by-Year Breakdown</h3>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Year</th>
              <th>Portfolio Value</th>
              <th>ST Gains (QFAF)</th>
              <th>ST Losses (EDI)</th>
              <th>LT Gains (EDI)</th>
              <th>Federal Tax</th>
              <th>State Tax</th>
              <th>Tax Savings</th>
              <th>Cumulative Savings</th>
            </tr>
          </thead>
          <tbody>
            {data.map(year => {
              cumulativeSavings += year.taxSavings;
              return (
                <tr key={year.year}>
                  <td>{year.year}</td>
                  <td>{formatCurrency(year.totalValue)}</td>
                  <td className="positive">{formatCurrency(year.stGainsGenerated)}</td>
                  <td className="negative">({formatCurrency(year.stLossesHarvested)})</td>
                  <td>{formatCurrency(year.ltGainsRealized)}</td>
                  <td>{formatCurrency(year.federalTax)}</td>
                  <td>{formatCurrency(year.stateTax)}</td>
                  <td className="highlight">{formatCurrency(year.taxSavings)}</td>
                  <td className="highlight">{formatCurrency(cumulativeSavings)}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={7}><strong>Total 10-Year Tax Savings</strong></td>
              <td colSpan={2} className="highlight">
                <strong>{formatCurrency(cumulativeSavings)}</strong>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Loss Carryforward Summary */}
      {(data[data.length - 1].stLossCarryforward > 0 || data[data.length - 1].ltLossCarryforward > 0) && (
        <div className="carryforward-note">
          <p>
            <strong>Remaining Loss Carryforwards (Year 10):</strong><br />
            ST: {formatCurrency(data[data.length - 1].stLossCarryforward)} |
            LT: {formatCurrency(data[data.length - 1].ltLossCarryforward)}
          </p>
        </div>
      )}
    </div>
  );
}
