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
              <th>Total Value</th>
              <th>ST Gains (QFAF)</th>
              <th>ST Losses (Collateral)</th>
              <th>Ordinary Loss (Usable)</th>
              <th>Excess → NOL</th>
              <th>LT Gains</th>
              <th>Tax Savings</th>
              <th>Cumulative NOL</th>
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
                  <td className="positive">{formatCurrency(year.usableOrdinaryLoss)}</td>
                  <td>{formatCurrency(year.excessToNol)}</td>
                  <td>{formatCurrency(year.ltGainsRealized)}</td>
                  <td className="highlight">{formatCurrency(year.taxSavings)}</td>
                  <td>{formatCurrency(year.nolCarryforward)}</td>
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

      {/* Carryforward Summary */}
      {(data[data.length - 1].stLossCarryforward > 0 ||
        data[data.length - 1].ltLossCarryforward > 0 ||
        data[data.length - 1].nolCarryforward > 0) && (
        <div className="carryforward-note">
          <p>
            <strong>Remaining Carryforwards (Year 10):</strong><br />
            ST: {formatCurrency(data[data.length - 1].stLossCarryforward)} |
            LT: {formatCurrency(data[data.length - 1].ltLossCarryforward)} |
            NOL: {formatCurrency(data[data.length - 1].nolCarryforward)}
          </p>
        </div>
      )}
    </div>
  );
}
