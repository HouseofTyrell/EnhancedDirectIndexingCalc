import { YearResult } from './types';
import { FieldInfoPopup } from './InfoPopup';

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
              <th>Year <FieldInfoPopup contentKey="col-year" /></th>
              <th>Total Value <FieldInfoPopup contentKey="col-total-value" /></th>
              <th>ST Gains (QFAF) <FieldInfoPopup contentKey="col-st-gains" /></th>
              <th>ST Losses (Collateral) <FieldInfoPopup contentKey="col-st-losses" /></th>
              <th>Ordinary Loss (Usable) <FieldInfoPopup contentKey="col-usable-loss" /></th>
              <th>Excess → NOL <FieldInfoPopup contentKey="col-excess-nol" /></th>
              <th>LT Gains <FieldInfoPopup contentKey="col-lt-gains" /></th>
              <th>Tax Savings <FieldInfoPopup contentKey="col-tax-savings" /></th>
              <th>Cumulative NOL <FieldInfoPopup contentKey="col-nol-carryforward" /></th>
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
