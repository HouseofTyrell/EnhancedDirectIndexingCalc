import { YearResult, CalculatedSizing } from './types';
import { FieldInfoPopup } from './InfoPopup';
import { formatCurrency, formatPercent } from './utils/formatters';

interface ResultsTableProps {
  data: YearResult[];
  sizing: CalculatedSizing;
}

export function ResultsTable({ data, sizing }: ResultsTableProps) {
  // Calculate cumulative tax savings
  let cumulativeSavings = 0;

  // Starting values
  const startingTotal = sizing.collateralValue + sizing.qfafValue;

  return (
    <div className="table-container">
      <h3>Year-by-Year Breakdown</h3>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Year <FieldInfoPopup contentKey="col-year" /></th>
              <th>ST Rate <FieldInfoPopup contentKey="col-eff-rate" /></th>
              <th>Total Value <FieldInfoPopup contentKey="col-total-value" /></th>
              <th>ST Gains (QFAF) <FieldInfoPopup contentKey="col-st-gains" /></th>
              <th>ST Losses (Collateral) <FieldInfoPopup contentKey="col-st-losses" /></th>
              <th>Ordinary Loss (Usable) <FieldInfoPopup contentKey="col-usable-loss" /></th>
              <th>Excess → NOL <FieldInfoPopup contentKey="col-excess-nol" /></th>
              <th>LT Gains <FieldInfoPopup contentKey="col-lt-gains" /></th>
              <th>Cap Loss vs Income <FieldInfoPopup contentKey="col-cap-loss-income" /></th>
              <th>NOL Used <FieldInfoPopup contentKey="col-nol-used" /></th>
              <th>Tax Savings <FieldInfoPopup contentKey="col-tax-savings" /></th>
              <th>ST Loss C/F <FieldInfoPopup contentKey="col-st-carryforward" /></th>
              <th>Cumulative NOL <FieldInfoPopup contentKey="col-nol-carryforward" /></th>
            </tr>
          </thead>
          <tbody>
            {/* Starting values row */}
            <tr className="starting-row">
              <td>Start</td>
              <td className="rate-cell">—</td>
              <td>{formatCurrency(startingTotal)}</td>
              <td colSpan={10} className="starting-note">
                Collateral: {formatCurrency(sizing.collateralValue)} | QFAF: {formatCurrency(sizing.qfafValue)}
              </td>
            </tr>
            {data.map(year => {
              cumulativeSavings += year.taxSavings;
              return (
                <tr key={year.year}>
                  <td>{year.year}</td>
                  <td className="rate-cell">{formatPercent(year.effectiveStLossRate)}</td>
                  <td>{formatCurrency(year.totalValue)}</td>
                  <td className="positive">{formatCurrency(year.stGainsGenerated)}</td>
                  <td className="negative">({formatCurrency(year.stLossesHarvested)})</td>
                  <td className="positive">{formatCurrency(year.usableOrdinaryLoss)}</td>
                  <td>{formatCurrency(year.excessToNol)}</td>
                  <td>{formatCurrency(year.ltGainsRealized)}</td>
                  <td className="positive">{formatCurrency(year.capitalLossUsedAgainstIncome)}</td>
                  <td className="positive">{formatCurrency(year.nolUsedThisYear)}</td>
                  <td className="highlight">{formatCurrency(year.taxSavings)}</td>
                  <td>{formatCurrency(year.stLossCarryforward)}</td>
                  <td>{formatCurrency(year.nolCarryforward)}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={11}><strong>Total 10-Year Tax Savings</strong></td>
              <td colSpan={2} className="highlight">
                <strong>{formatCurrency(cumulativeSavings)}</strong>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Carryforward Summary */}
      <div className="carryforward-note">
        <p>
          <strong>Carryforward Summary (Year 10):</strong><br />
          ST Capital Loss: {formatCurrency(data.length > 0 ? data[data.length - 1].stLossCarryforward : 0)} |
          LT Capital Loss: {formatCurrency(data.length > 0 ? data[data.length - 1].ltLossCarryforward : 0)} |
          NOL: {formatCurrency(data.length > 0 ? data[data.length - 1].nolCarryforward : 0)}
        </p>
        <p className="carryforward-explanation">
          <em>Note: NOL appears to accumulate because new excess ordinary losses are generated each year.
          Check the "NOL Used" column to see how much NOL offsets income annually (up to 80% of taxable income).
          The "Cap Loss vs Income" column shows the $3,000/yr deduction from ST/LT capital loss carryforwards (not NOL).</em>
        </p>
      </div>
    </div>
  );
}
