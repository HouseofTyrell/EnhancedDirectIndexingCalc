import { useState } from 'react';
import { YearResult, CalculatedSizing } from './types';
import { InfoText } from './InfoPopup';
import { formatCurrency } from './utils/formatters';

interface ResultsTableProps {
  data: YearResult[];
  sizing: CalculatedSizing;
  qfafEnabled: boolean;
}

// Chevron icons for expand/collapse
const ChevronDown = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
    <path
      d="M2.5 4.5L6 8L9.5 4.5"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
  </svg>
);

const ChevronRight = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
    <path
      d="M4.5 2.5L8 6L4.5 9.5"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
  </svg>
);

export function ResultsTable({ data, sizing, qfafEnabled }: ResultsTableProps) {
  const [expandPortfolio, setExpandPortfolio] = useState(false);
  const [expandCapital, setExpandCapital] = useState(false);
  const [expandNOL, setExpandNOL] = useState(false);
  const [showAllDetails, setShowAllDetails] = useState(false);

  // Calculate cumulative tax savings
  let cumulativeSavings = 0;

  // Toggle all details
  const handleToggleAll = () => {
    const newState = !showAllDetails;
    setShowAllDetails(newState);
    setExpandPortfolio(newState);
    setExpandCapital(newState);
    setExpandNOL(newState);
  };

  // Calculate net capital for a year (what actually hits the return)
  const getNetCapital = (year: YearResult) => {
    // Net = ST Gains (QFAF) - ST Losses (collateral) + LT Gains (collateral)
    // With auto-sizing, ST gains ≈ ST losses, so net ≈ LT gains
    return year.stGainsGenerated - year.stLossesHarvested + year.ltGainsRealized;
  };

  // Column count for footer span
  const getColSpan = () => {
    let cols = 4; // Year, Portfolio, Net Capital, Tax Savings (base)
    if (expandPortfolio && qfafEnabled) cols += 2; // Collateral, QFAF
    if (expandCapital) cols += 3; // ST Losses, LT Gains, ST Gains
    if (qfafEnabled) {
      cols += 2; // Ordinary Loss, NOL Activity
      if (expandNOL) cols += 2; // NOL Used, NOL C/F
    }
    return cols;
  };

  return (
    <div className="table-container">
      <div className="table-header-row">
        <h3>Year-by-Year Breakdown</h3>
        <button className="toggle-details-btn" onClick={handleToggleAll}>
          {showAllDetails ? 'Collapse All' : 'Expand All'}
        </button>
      </div>

      <div className="table-scroll">
        <table className="year-breakdown-table year-breakdown-table--compact">
          <thead>
            <tr>
              <th className="col-year">Year</th>

              {/* Portfolio Value - Collapsible when QFAF enabled */}
              {qfafEnabled ? (
                <th
                  className="col-expandable col-portfolio"
                  onClick={() => setExpandPortfolio(!expandPortfolio)}
                >
                  <span className="expandable-header">
                    <span className="expand-icon">
                      {expandPortfolio ? <ChevronDown /> : <ChevronRight />}
                    </span>
                    <InfoText contentKey="col-portfolio-value">Portfolio</InfoText>
                  </span>
                </th>
              ) : (
                <th className="col-portfolio">
                  <InfoText contentKey="col-portfolio-value">Portfolio</InfoText>
                </th>
              )}

              {/* Expanded Portfolio Details */}
              {expandPortfolio && qfafEnabled && (
                <>
                  <th className="col-detail collateral-col">
                    <InfoText contentKey="col-collateral-value">Collateral</InfoText>
                  </th>
                  <th className="col-detail qfaf-col">
                    <InfoText contentKey="col-qfaf-value">QFAF</InfoText>
                  </th>
                </>
              )}

              {/* Capital Gains - Collapsible */}
              <th
                className="col-expandable col-net-capital"
                onClick={() => setExpandCapital(!expandCapital)}
              >
                <span className="expandable-header">
                  <span className="expand-icon">
                    {expandCapital ? <ChevronDown /> : <ChevronRight />}
                  </span>
                  <InfoText contentKey="col-net-capital">Cap Gains</InfoText>
                </span>
              </th>

              {/* Expanded Capital Details */}
              {expandCapital && (
                <>
                  <th className="col-detail collateral-col">
                    <InfoText contentKey="col-st-losses">ST Loss</InfoText>
                  </th>
                  <th className="col-detail collateral-col">
                    <InfoText contentKey="col-lt-gains">LT Gain</InfoText>
                  </th>
                  {qfafEnabled && (
                    <th className="col-detail qfaf-col">
                      <InfoText contentKey="col-st-gains">ST Gain</InfoText>
                    </th>
                  )}
                </>
              )}

              {/* QFAF columns */}
              {qfafEnabled && (
                <>
                  <th className="col-ordinary-loss">
                    <InfoText contentKey="col-usable-loss">Ord. Loss</InfoText>
                  </th>

                  {/* NOL - Collapsible */}
                  <th
                    className="col-expandable col-nol-activity"
                    onClick={() => setExpandNOL(!expandNOL)}
                  >
                    <span className="expandable-header">
                      <span className="expand-icon">
                        {expandNOL ? <ChevronDown /> : <ChevronRight />}
                      </span>
                      <InfoText contentKey="col-nol-activity">NOL</InfoText>
                    </span>
                  </th>

                  {/* Expanded NOL Details */}
                  {expandNOL && (
                    <>
                      <th className="col-detail qfaf-col">
                        <InfoText contentKey="col-nol-used">Used</InfoText>
                      </th>
                      <th className="col-detail qfaf-col">
                        <InfoText contentKey="col-nol-carryforward">Carryover</InfoText>
                      </th>
                    </>
                  )}
                </>
              )}

              <th className="col-savings">
                <InfoText contentKey="col-tax-savings">Savings</InfoText>
              </th>
            </tr>
          </thead>

          <tbody>
            {/* Starting values row */}
            <tr className="starting-row">
              <td>Start</td>
              <td>
                {formatCurrency(sizing.collateralValue + (qfafEnabled ? sizing.qfafValue : 0))}
              </td>
              {expandPortfolio && qfafEnabled && (
                <>
                  <td className="starting-note collateral-col">
                    {formatCurrency(sizing.collateralValue)}
                  </td>
                  <td className="starting-note qfaf-col">{formatCurrency(sizing.qfafValue)}</td>
                </>
              )}
              <td className="starting-note">—</td>
              {expandCapital && (
                <>
                  <td className="starting-note collateral-col">—</td>
                  <td className="starting-note collateral-col">—</td>
                  {qfafEnabled && <td className="starting-note qfaf-col">—</td>}
                </>
              )}
              {qfafEnabled && (
                <>
                  <td className="starting-note">—</td>
                  <td className="starting-note">—</td>
                  {expandNOL && (
                    <>
                      <td className="starting-note qfaf-col">—</td>
                      <td className="starting-note qfaf-col">—</td>
                    </>
                  )}
                </>
              )}
              <td className="starting-note">—</td>
            </tr>

            {data.map(year => {
              cumulativeSavings += year.taxSavings;
              const netCapital = getNetCapital(year);

              // NOL Activity summary: show net change or current balance
              const nolGenerated = year.excessToNol;
              const nolUsed = year.nolUsedThisYear;
              const nolNet = nolGenerated - nolUsed;

              return (
                <tr key={year.year}>
                  <td className="year-cell">{year.year}</td>
                  <td>{formatCurrency(year.totalValue)}</td>

                  {/* Expanded Portfolio Details */}
                  {expandPortfolio && qfafEnabled && (
                    <>
                      <td className="collateral-col">{formatCurrency(year.collateralValue)}</td>
                      <td className="qfaf-col">{formatCurrency(year.qfafValue)}</td>
                    </>
                  )}

                  {/* Net Capital (collapsed view) */}
                  <td className={netCapital >= 0 ? 'positive' : 'negative'}>
                    {netCapital >= 0
                      ? formatCurrency(netCapital)
                      : `(${formatCurrency(Math.abs(netCapital))})`}
                  </td>

                  {/* Expanded Capital Details */}
                  {expandCapital && (
                    <>
                      <td className="negative collateral-col">
                        ({formatCurrency(year.stLossesHarvested)})
                      </td>
                      <td className="collateral-col">{formatCurrency(year.ltGainsRealized)}</td>
                      {qfafEnabled && (
                        <td className="positive qfaf-col">
                          {formatCurrency(year.stGainsGenerated)}
                        </td>
                      )}
                    </>
                  )}

                  {/* QFAF columns */}
                  {qfafEnabled && (
                    <>
                      <td className="positive">{formatCurrency(year.usableOrdinaryLoss)}</td>

                      {/* NOL Activity (collapsed view) */}
                      <td className={nolNet > 0 ? 'nol-generated' : nolNet < 0 ? 'nol-used' : ''}>
                        {nolNet > 0
                          ? `+${formatCurrency(nolNet)}`
                          : nolNet < 0
                            ? `−${formatCurrency(Math.abs(nolNet))}`
                            : '—'}
                      </td>

                      {/* Expanded NOL Details */}
                      {expandNOL && (
                        <>
                          <td className="positive qfaf-col">
                            {formatCurrency(year.nolUsedThisYear)}
                          </td>
                          <td className="qfaf-col">{formatCurrency(year.nolCarryforward)}</td>
                        </>
                      )}
                    </>
                  )}

                  <td className="highlight">{formatCurrency(year.taxSavings)}</td>
                </tr>
              );
            })}
          </tbody>

          <tfoot>
            <tr>
              <td colSpan={getColSpan() - 1}>
                <strong>Total 10-Year Tax Savings</strong>
              </td>
              <td className="highlight">
                <strong>{formatCurrency(cumulativeSavings)}</strong>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Carryforward Summary */}
      <div className="carryforward-note">
        <p>
          <strong>Carryforward Summary (Year 10):</strong>
          <br />
          ST Capital Loss:{' '}
          {formatCurrency(data.length > 0 ? data[data.length - 1].stLossCarryforward : 0)} | LT
          Capital Loss:{' '}
          {formatCurrency(data.length > 0 ? data[data.length - 1].ltLossCarryforward : 0)}
          {qfafEnabled && (
            <>
              {' '}
              | NOL: {formatCurrency(data.length > 0 ? data[data.length - 1].nolCarryforward : 0)}
            </>
          )}
        </p>
        {qfafEnabled && (
          <p className="carryforward-explanation">
            <em>
              Note: NOL appears to accumulate because new excess ordinary losses are generated each
              year. Check the "NOL Used" column to see how much NOL offsets income annually (up to
              80% of taxable income).
            </em>
          </p>
        )}
      </div>
    </div>
  );
}
