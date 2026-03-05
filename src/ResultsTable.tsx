import { useState, Fragment } from 'react';
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
}: ResultsTableProps) {
  const [expandPortfolio, setExpandPortfolio] = useState(false);
  const [expandCapital, setExpandCapital] = useState(false);
  const [expandOrdLoss, setExpandOrdLoss] = useState(false);
  const [expandSavings, setExpandSavings] = useState(false);
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
    setExpandOrdLoss(newState);
    setExpandSavings(newState);
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

    // QFAF columns - Total Losses Realized (expandable)
    if (showQfaf && qfafEnabled) {
      cols += 1; // Total Losses headline
      if (expandOrdLoss) cols += 5; // Ord. Loss, Gross, → NOL, NOL Applied, NOL Carryover
    }

    cols += 1; // Tax Savings column
    cols += 1; // Cumulative column
    if (expandSavings) cols += 3; // Ord Ded., NOL Ben., LT Cost
    return cols;
  };

  // Savings breakdown columns count for starting row
  const savingsDetailCols = expandSavings ? 3 : 0;

  // Determine if this is the first wind-down row for divider
  const firstWindDownIndex = data.findIndex(y => !y.strategyActive);

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
                title="Qualified Financial Asset Fund — generates ordinary losses and short-term gains"
              >
                QFAF Only
              </button>
              <button
                className={`view-mode-btn ${viewMode === 'collateral-only' ? 'active' : ''}`}
                onClick={() => setViewMode('collateral-only')}
                title="Direct indexing collateral only (excludes QFAF ordinary loss benefits)"
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

              {/* Net Capital - Collapsible (show in combined and collateral-only) */}
              {showCollateral && (
                <th
                  className={`col-expandable col-net-capital ${viewMode === 'collateral-only' ? 'collateral-col' : ''}`}
                  onClick={() => setExpandCapital(!expandCapital)}
                >
                  <span className="expandable-header">
                    <span className="expand-icon">
                      {expandCapital ? <ChevronDown /> : <ChevronRight />}
                    </span>
                    <InfoText contentKey="col-net-capital">Net Cap GL</InfoText>
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
                  {/* Total Losses Realized - expandable to show Ord. Loss, Gross, → NOL, NOL Applied, NOL Carryover */}
                  <th
                    className={`col-expandable col-ordinary-loss ${viewMode === 'qfaf-only' ? 'qfaf-col' : ''}`}
                    onClick={() => setExpandOrdLoss(!expandOrdLoss)}
                  >
                    <span className="expandable-header">
                      <span className="expand-icon">
                        {expandOrdLoss ? <ChevronDown /> : <ChevronRight />}
                      </span>
                      <InfoText contentKey="col-max-offset">Total Losses</InfoText>
                    </span>
                  </th>

                  {/* Expanded Loss & NOL Details */}
                  {expandOrdLoss && (
                    <>
                      <th className="col-detail qfaf-col">
                        <InfoText contentKey="col-usable-loss">Ord. Loss</InfoText>
                      </th>
                      <th className="col-detail qfaf-col">
                        <InfoText contentKey="col-ordinary-loss">Gross</InfoText>
                      </th>
                      <th className="col-detail qfaf-col">
                        <InfoText contentKey="col-excess-nol">→ NOL</InfoText>
                      </th>
                      <th className="col-detail qfaf-col">
                        <InfoText contentKey="col-nol-used">NOL Applied</InfoText>
                      </th>
                      <th className="col-detail qfaf-col">
                        <InfoText contentKey="col-nol-carryforward">NOL Carryover</InfoText>
                      </th>
                    </>
                  )}
                </>
              )}

              {/* Tax Savings - Collapsible to show benefit breakdown */}
              <th
                className="col-expandable col-savings"
                onClick={() => setExpandSavings(!expandSavings)}
              >
                <span className="expandable-header">
                  <span className="expand-icon">
                    {expandSavings ? <ChevronDown /> : <ChevronRight />}
                  </span>
                  <InfoText contentKey="col-tax-savings">
                    {viewMode === 'qfaf-only' ? 'QFAF Benefit' : viewMode === 'collateral-only' ? 'Coll. Benefit' : 'Savings'}
                  </InfoText>
                </span>
              </th>

              {/* Expanded Savings Breakdown */}
              {expandSavings && (
                <>
                  <th className="col-detail benefit-col">
                    <InfoText contentKey="col-ord-loss-benefit">Ord. Ded.</InfoText>
                  </th>
                  <th className="col-detail benefit-col">
                    <InfoText contentKey="col-nol-benefit">NOL Ben.</InfoText>
                  </th>
                  <th className="col-detail cost-col">
                    <InfoText contentKey="col-lt-gain-cost">LT Cost</InfoText>
                  </th>
                </>
              )}

              {/* Cumulative Savings - always visible */}
              <th className="col-cumulative">
                <InfoText contentKey="col-cumulative-savings">Cumul.</InfoText>
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
                  {expandOrdLoss && (
                    <>
                      <td className="starting-note qfaf-col">—</td>
                      <td className="starting-note qfaf-col">—</td>
                      <td className="starting-note qfaf-col">—</td>
                      <td className="starting-note qfaf-col">—</td>
                      <td className="starting-note qfaf-col">—</td>
                    </>
                  )}
                </>
              )}
              <td className="starting-note">—</td>
              {expandSavings && (
                <>
                  {Array.from({ length: savingsDetailCols }).map((_, i) => (
                    <td key={i} className="starting-note">—</td>
                  ))}
                </>
              )}
              <td className="starting-note">—</td>
            </tr>

            {data.map((year, index) => {
              // Get the appropriate benefit based on view mode
              const displayedBenefit =
                viewMode === 'qfaf-only'
                  ? year.qfafTaxBenefit
                  : viewMode === 'collateral-only'
                    ? year.collateralTaxBenefit
                    : year.taxSavings;

              cumulativeSavings += displayedBenefit;
              const netCapital = getNetCapital(year);

              // Get portfolio value based on view mode
              const portfolioValue =
                viewMode === 'qfaf-only'
                  ? year.qfafValue
                  : viewMode === 'collateral-only'
                    ? year.collateralValue
                    : year.totalValue;

              // Post-strategy wind-down: dim rows where strategy is no longer active
              const isWindDown = !year.strategyActive;
              const isFirstWindDown = index === firstWindDownIndex;

              return (
                <Fragment key={year.year}>
                  {/* Wind-down divider row */}
                  {isFirstWindDown && (
                    <tr className="wind-down-divider-row">
                      <td colSpan={getColSpan()}>
                        <span className="wind-down-divider-text">Strategy Ended — Wind-Down (Carryforward Usage Only)</span>
                      </td>
                    </tr>
                  )}
                  <tr className={isWindDown ? 'wind-down-row' : ''}>
                    <td className="year-cell">
                      {year.year}
                      {isWindDown && <span className="wind-down-badge" title="Wind-down: strategy ended, carryforward usage only">W/D</span>}
                    </td>
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
                        {isWindDown
                          ? '—'
                          : netCapital >= 0
                            ? formatCurrency(netCapital)
                            : `(${formatCurrency(Math.abs(netCapital))})`}
                      </td>
                    )}

                    {/* Expanded Capital Details - Collateral items */}
                    {expandCapital && showCollateral && (
                      <>
                        <td className="negative collateral-col">
                          {isWindDown ? '—' : `(${formatCurrency(year.stLossesHarvested)})`}
                        </td>
                        <td className="collateral-col">
                          {isWindDown ? '—' : formatCurrency(year.ltGainsRealized)}
                        </td>
                      </>
                    )}

                    {/* QFAF ST Gains - show in qfaf-only OR expanded in combined */}
                    {viewMode === 'qfaf-only' && (
                      <td className="positive qfaf-col">
                        {isWindDown ? '—' : formatCurrency(year.stGainsGenerated)}
                      </td>
                    )}
                    {expandCapital && viewMode === 'combined' && qfafEnabled && (
                      <td className="positive qfaf-col">
                        {isWindDown ? '—' : formatCurrency(year.stGainsGenerated)}
                      </td>
                    )}

                    {/* QFAF columns - show in combined and qfaf-only */}
                    {showQfaf && qfafEnabled && (
                      <>
                        {/* Total Losses Realized (headline: max income offset capacity) */}
                        <td className={`${isWindDown ? 'wind-down-shelter' : ''}`}>
                          {isWindDown && year.maxIncomeOffsetCapacity > 0
                            ? <span title="Available capacity from carryforwards (no new losses generated)">{formatCurrency(year.maxIncomeOffsetCapacity)}*</span>
                            : formatCurrency(year.maxIncomeOffsetCapacity)}
                        </td>

                        {/* Expanded Loss & NOL Details */}
                        {expandOrdLoss && (
                          <>
                            {/* Usable Ordinary Loss (capped by §461(l)) */}
                            <td className="negative qfaf-col">
                              {isWindDown ? '—' : `(${formatCurrency(year.usableOrdinaryLoss)})`}
                            </td>
                            {/* Gross Ordinary Loss (before §461(l) cap) */}
                            <td className="negative qfaf-col">
                              {isWindDown ? '—' : `(${formatCurrency(year.ordinaryLossesGenerated)})`}
                            </td>
                            {/* Excess → NOL */}
                            <td className={year.excessToNol > 0 ? 'nol-generated qfaf-col' : 'qfaf-col'}>
                              {isWindDown
                                ? '—'
                                : year.excessToNol > 0
                                  ? formatCurrency(year.excessToNol)
                                  : '—'}
                            </td>
                            {/* NOL Applied */}
                            <td className={year.nolUsedThisYear > 0 ? 'positive qfaf-col' : 'qfaf-col'}>
                              {year.nolUsedThisYear > 0 ? formatCurrency(year.nolUsedThisYear) : '—'}
                            </td>
                            {/* NOL Carryover */}
                            <td className="qfaf-col">{formatCurrency(year.nolCarryforward)}</td>
                          </>
                        )}
                      </>
                    )}

                    {/* Tax Savings (collapsed: net number) */}
                    <td className={`highlight ${displayedBenefit < 0 ? 'negative' : ''}`}>
                      {displayedBenefit < 0
                        ? `(${formatCurrency(Math.abs(displayedBenefit))})`
                        : formatCurrency(displayedBenefit)}
                    </td>

                    {/* Expanded Savings Breakdown */}
                    {expandSavings && (
                      <>
                        {/* Ordinary Deduction Benefit */}
                        <td className="positive benefit-col">
                          {year.ordinaryLossBenefit > 0
                            ? formatCurrency(year.ordinaryLossBenefit)
                            : '—'}
                        </td>
                        {/* NOL Usage Benefit */}
                        <td className="positive benefit-col">
                          {year.nolUsageBenefit > 0
                            ? formatCurrency(year.nolUsageBenefit)
                            : '—'}
                        </td>
                        {/* LT Gain Cost */}
                        <td className="negative cost-col">
                          {year.ltGainCost > 0
                            ? `(${formatCurrency(year.ltGainCost)})`
                            : '—'}
                        </td>
                      </>
                    )}

                    {/* Cumulative Savings */}
                    <td className="highlight cumulative-cell">
                      {formatCurrency(cumulativeSavings)}
                    </td>
                  </tr>
                </Fragment>
              );
            })}
          </tbody>

          <tfoot>
            <tr>
              <td colSpan={getColSpan() - 1}>
                <strong>Total {data.length}-Year Tax Savings</strong>
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
          <strong>Carryforward Summary (Year {data.length}):</strong>
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
              Expand "Total Losses" to see usable ordinary loss, gross losses, §461(l) cap overflow to NOL,
              and NOL usage details. Rows marked "W/D" are post-strategy wind-down years
              where only carryforward usage continues.
            </em>
          </p>
        )}
      </div>
    </div>
  );
}
