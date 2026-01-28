import { useState } from 'react';
import { YearResult, CalculatedSizing } from './types';
import { InfoText } from './InfoPopup';
import { formatCurrency } from './utils/formatters';

type ViewMode = 'combined' | 'qfaf-only' | 'collateral-only';

interface ResultsTableProps {
  data: YearResult[];
  sizing: CalculatedSizing;
  qfafEnabled: boolean;
  projectionYears?: number;
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

export function ResultsTable({
  data,
  sizing,
  qfafEnabled,
  projectionYears = 10,
}: ResultsTableProps) {
  const [expandPortfolio, setExpandPortfolio] = useState(false);
  const [expandCapital, setExpandCapital] = useState(false);
  const [expandNOL, setExpandNOL] = useState(false);
  const [showAllDetails, setShowAllDetails] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('combined');

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

  // View mode helpers
  const showQfaf = viewMode === 'combined' || viewMode === 'qfaf-only';
  const showCollateral = viewMode === 'combined' || viewMode === 'collateral-only';

  // Calculate net capital for a year (what actually hits the return)
  const getNetCapital = (year: YearResult) => {
    // Net = ST Gains (QFAF) - ST Losses (collateral) + LT Gains (collateral)
    // With auto-sizing, ST gains ≈ ST losses, so net ≈ LT gains
    return year.stGainsGenerated - year.stLossesHarvested + year.ltGainsRealized;
  };

  // Column count for footer span
  const getColSpan = () => {
    let cols = 2; // Year, Portfolio (always shown)

    // Net Capital column - only in combined and collateral-only
    if (showCollateral) cols += 1;

    // Expanded Portfolio Details - only in combined mode
    if (expandPortfolio && qfafEnabled && viewMode === 'combined') cols += 2;

    // Expanded Capital Details - ST Losses, LT Gains (collateral)
    if (expandCapital && showCollateral) cols += 2;

    // QFAF ST Gains column
    if (viewMode === 'qfaf-only') cols += 1;
    if (expandCapital && viewMode === 'combined' && qfafEnabled) cols += 1;

    // QFAF columns - Ordinary Loss, NOL Activity
    if (showQfaf && qfafEnabled) {
      cols += 2;
      if (expandNOL) cols += 3; // NOL Used, NOL C/F, Max Offset
    }

    cols += 1; // Tax Savings column
    return cols;
  };

  return (
    <div className="table-container">
      <div className="table-header-row">
        <h3>Year-by-Year Breakdown</h3>
        <div className="table-controls">
          {qfafEnabled && (
            <div className="view-mode-selector">
              <button
                className={`view-mode-btn ${viewMode === 'combined' ? 'active' : ''}`}
                onClick={() => setViewMode('combined')}
              >
                Combined
              </button>
              <button
                className={`view-mode-btn ${viewMode === 'qfaf-only' ? 'active' : ''}`}
                onClick={() => setViewMode('qfaf-only')}
              >
                QFAF Only
              </button>
              <button
                className={`view-mode-btn ${viewMode === 'collateral-only' ? 'active' : ''}`}
                onClick={() => setViewMode('collateral-only')}
              >
                Collateral Only
              </button>
            </div>
          )}
          <button className="toggle-details-btn" onClick={handleToggleAll}>
            {showAllDetails ? 'Collapse All' : 'Expand All'}
          </button>
        </div>
      </div>

      <div className="table-scroll">
        <table className="year-breakdown-table year-breakdown-table--compact">
          <thead>
            <tr>
              <th className="col-year">Year</th>

              {/* Portfolio Value - show based on view mode */}
              {viewMode === 'combined' && qfafEnabled ? (
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
              ) : viewMode === 'qfaf-only' ? (
                <th className="col-portfolio qfaf-col">
                  <InfoText contentKey="col-qfaf-value">QFAF Value</InfoText>
                </th>
              ) : viewMode === 'collateral-only' ? (
                <th className="col-portfolio collateral-col">
                  <InfoText contentKey="col-collateral-value">Collateral Value</InfoText>
                </th>
              ) : (
                <th className="col-portfolio">
                  <InfoText contentKey="col-portfolio-value">Portfolio</InfoText>
                </th>
              )}

              {/* Expanded Portfolio Details - only in combined mode */}
              {expandPortfolio && qfafEnabled && viewMode === 'combined' && (
                <>
                  <th className="col-detail collateral-col">
                    <InfoText contentKey="col-collateral-value">Collateral</InfoText>
                  </th>
                  <th className="col-detail qfaf-col">
                    <InfoText contentKey="col-qfaf-value">QFAF</InfoText>
                  </th>
                </>
              )}

              {/* Capital Gains - Collapsible (show in combined and collateral-only) */}
              {showCollateral && (
                <th
                  className={`col-expandable col-net-capital ${viewMode === 'collateral-only' ? 'collateral-col' : ''}`}
                  onClick={() => setExpandCapital(!expandCapital)}
                >
                  <span className="expandable-header">
                    <span className="expand-icon">
                      {expandCapital ? <ChevronDown /> : <ChevronRight />}
                    </span>
                    <InfoText contentKey="col-net-capital">
                      {viewMode === 'collateral-only' ? 'Net Capital' : 'Cap Gains'}
                    </InfoText>
                  </span>
                </th>
              )}

              {/* Expanded Capital Details - Collateral items */}
              {expandCapital && showCollateral && (
                <>
                  <th className="col-detail collateral-col">
                    <InfoText contentKey="col-st-losses">ST Loss</InfoText>
                  </th>
                  <th className="col-detail collateral-col">
                    <InfoText contentKey="col-lt-gains">LT Gain</InfoText>
                  </th>
                </>
              )}

              {/* QFAF ST Gains - show in combined (expanded) and qfaf-only */}
              {viewMode === 'qfaf-only' && (
                <th className="col-detail qfaf-col">
                  <InfoText contentKey="col-st-gains">ST Gain</InfoText>
                </th>
              )}
              {expandCapital && viewMode === 'combined' && qfafEnabled && (
                <th className="col-detail qfaf-col">
                  <InfoText contentKey="col-st-gains">ST Gain</InfoText>
                </th>
              )}

              {/* QFAF columns - show in combined and qfaf-only */}
              {showQfaf && qfafEnabled && (
                <>
                  <th className={`col-ordinary-loss ${viewMode === 'qfaf-only' ? 'qfaf-col' : ''}`}>
                    <InfoText contentKey="col-usable-loss">Ord. Loss</InfoText>
                  </th>

                  {/* NOL - Collapsible */}
                  <th
                    className={`col-expandable col-nol-activity ${viewMode === 'qfaf-only' ? 'qfaf-col' : ''}`}
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
                      <th className="col-detail qfaf-col">
                        <InfoText contentKey="col-max-offset">Max Offset</InfoText>
                      </th>
                    </>
                  )}
                </>
              )}

              <th className="col-savings">
                <InfoText contentKey="col-tax-savings">
                  {viewMode === 'qfaf-only' ? 'QFAF Benefit' : viewMode === 'collateral-only' ? 'Coll. Benefit' : 'Savings'}
                </InfoText>
              </th>
            </tr>
          </thead>

          <tbody>
            {/* Starting values row */}
            <tr className="starting-row">
              <td>Start</td>
              <td>
                {viewMode === 'qfaf-only'
                  ? formatCurrency(sizing.qfafValue)
                  : viewMode === 'collateral-only'
                    ? formatCurrency(sizing.collateralValue)
                    : formatCurrency(sizing.collateralValue + (qfafEnabled ? sizing.qfafValue : 0))}
              </td>
              {expandPortfolio && qfafEnabled && viewMode === 'combined' && (
                <>
                  <td className="starting-note collateral-col">
                    {formatCurrency(sizing.collateralValue)}
                  </td>
                  <td className="starting-note qfaf-col">{formatCurrency(sizing.qfafValue)}</td>
                </>
              )}
              {showCollateral && <td className="starting-note">—</td>}
              {expandCapital && showCollateral && (
                <>
                  <td className="starting-note collateral-col">—</td>
                  <td className="starting-note collateral-col">—</td>
                </>
              )}
              {viewMode === 'qfaf-only' && <td className="starting-note qfaf-col">—</td>}
              {expandCapital && viewMode === 'combined' && qfafEnabled && (
                <td className="starting-note qfaf-col">—</td>
              )}
              {showQfaf && qfafEnabled && (
                <>
                  <td className="starting-note">—</td>
                  <td className="starting-note">—</td>
                  {expandNOL && (
                    <>
                      <td className="starting-note qfaf-col">—</td>
                      <td className="starting-note qfaf-col">—</td>
                      <td className="starting-note qfaf-col">—</td>
                    </>
                  )}
                </>
              )}
              <td className="starting-note">—</td>
            </tr>

            {data.map(year => {
              // Get the appropriate benefit based on view mode
              const displayedBenefit =
                viewMode === 'qfaf-only'
                  ? year.qfafTaxBenefit
                  : viewMode === 'collateral-only'
                    ? year.collateralTaxBenefit
                    : year.taxSavings;

              cumulativeSavings += displayedBenefit;
              const netCapital = getNetCapital(year);

              // NOL Activity summary: show net change or current balance
              const nolGenerated = year.excessToNol;
              const nolUsed = year.nolUsedThisYear;
              const nolNet = nolGenerated - nolUsed;

              // Get portfolio value based on view mode
              const portfolioValue =
                viewMode === 'qfaf-only'
                  ? year.qfafValue
                  : viewMode === 'collateral-only'
                    ? year.collateralValue
                    : year.totalValue;

              return (
                <tr key={year.year}>
                  <td className="year-cell">{year.year}</td>
                  <td>{formatCurrency(portfolioValue)}</td>

                  {/* Expanded Portfolio Details - only in combined mode */}
                  {expandPortfolio && qfafEnabled && viewMode === 'combined' && (
                    <>
                      <td className="collateral-col">{formatCurrency(year.collateralValue)}</td>
                      <td className="qfaf-col">{formatCurrency(year.qfafValue)}</td>
                    </>
                  )}

                  {/* Net Capital - show in combined and collateral-only */}
                  {showCollateral && (
                    <td className={netCapital >= 0 ? 'positive' : 'negative'}>
                      {netCapital >= 0
                        ? formatCurrency(netCapital)
                        : `(${formatCurrency(Math.abs(netCapital))})`}
                    </td>
                  )}

                  {/* Expanded Capital Details - Collateral items */}
                  {expandCapital && showCollateral && (
                    <>
                      <td className="negative collateral-col">
                        ({formatCurrency(year.stLossesHarvested)})
                      </td>
                      <td className="collateral-col">{formatCurrency(year.ltGainsRealized)}</td>
                    </>
                  )}

                  {/* QFAF ST Gains - show in qfaf-only OR expanded in combined */}
                  {viewMode === 'qfaf-only' && (
                    <td className="positive qfaf-col">
                      {formatCurrency(year.stGainsGenerated)}
                    </td>
                  )}
                  {expandCapital && viewMode === 'combined' && qfafEnabled && (
                    <td className="positive qfaf-col">
                      {formatCurrency(year.stGainsGenerated)}
                    </td>
                  )}

                  {/* QFAF columns - show in combined and qfaf-only */}
                  {showQfaf && qfafEnabled && (
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
                          <td className="qfaf-col highlight">
                            {formatCurrency(year.maxIncomeOffsetCapacity)}
                          </td>
                        </>
                      )}
                    </>
                  )}

                  <td className={`highlight ${displayedBenefit < 0 ? 'negative' : ''}`}>
                    {displayedBenefit < 0
                      ? `(${formatCurrency(Math.abs(displayedBenefit))})`
                      : formatCurrency(displayedBenefit)}
                  </td>
                </tr>
              );
            })}
          </tbody>

          <tfoot>
            <tr>
              <td colSpan={getColSpan() - 1}>
                <strong>Total {projectionYears}-Year Tax Savings</strong>
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
          <strong>Carryforward Summary (Year {projectionYears}):</strong>
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
