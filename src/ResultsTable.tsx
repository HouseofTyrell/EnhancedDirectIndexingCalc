import { useState, Fragment } from 'react';
import { YearResult, CalculatedSizing } from './types';
import { InfoText } from './InfoPopup';
import { formatCurrency, formatPercent } from './utils/formatters';
import {
  buildLossBreakdown,
  describeSegments,
  BreakdownGranularity,
} from './calculations/lossBreakdown';
import { getEffectiveStLossRate } from './calculations/helpers';

type ViewMode = 'combined' | 'qfaf-only' | 'collateral-only';

interface ResultsTableProps {
  data: YearResult[];
  sizing: CalculatedSizing;
  qfafEnabled: boolean;
  projectionYears?: number;
  /** Start month (1=January). Year 1 row gets a partial-year badge when > 1. */
  startMonth?: number;
  /** QFAF duration in years; used to bound the loss breakdown. */
  qfafDuration?: number;
  /**
   * Single-strategy id + ltGainRate for the rate-aware sub-period breakdown.
   * When omitted (e.g. split allocation), the breakdown falls back to a
   * uniform per-month split.
   */
  strategyId?: string;
  ltGainRate?: number;
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
  startMonth = 1,
  qfafDuration = 10,
  strategyId,
  ltGainRate,
}: ResultsTableProps) {
  const partialFirstYearMonths = startMonth > 1 ? 13 - startMonth : null;
  const [expandPortfolio, setExpandPortfolio] = useState(false);
  const [expandCapital, setExpandCapital] = useState(false);
  const [expandOrdLoss, setExpandOrdLoss] = useState(false);
  const [expandCf, setExpandCf] = useState(false);
  const [expandSavings, setExpandSavings] = useState(false);
  const [showAllDetails, setShowAllDetails] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('combined');
  const [breakdownGranularity, setBreakdownGranularity] =
    useState<BreakdownGranularity>('quarterly');
  const [expandedBreakdownYears, setExpandedBreakdownYears] = useState<Set<number>>(
    () => new Set()
  );

  const toggleBreakdownYear = (year: number) => {
    setExpandedBreakdownYears(prev => {
      const next = new Set(prev);
      if (next.has(year)) {
        next.delete(year);
      } else {
        next.add(year);
      }
      return next;
    });
  };

  // Rate-aware breakdown only works for single-strategy mode where we know
  // the deployment-year rate schedule. Split allocation falls through to a
  // uniform per-active-month split.
  const rateForDeploymentYear =
    strategyId && ltGainRate !== undefined
      ? (dy: number) => getEffectiveStLossRate(strategyId, ltGainRate, dy)
      : undefined;

  // Calculate cumulative tax savings (inline, updated per rendered row)
  let cumulativeSavings = 0;

  // Total savings across ALL years (including filtered-out wind-down rows)
  const totalSavingsAllYears = data.reduce((sum, y) => {
    const benefit =
      viewMode === 'qfaf-only'
        ? y.qfafTaxBenefit
        : viewMode === 'collateral-only'
          ? y.collateralTaxBenefit
          : y.taxSavings;
    return sum + benefit;
  }, 0);

  // Toggle all details
  const handleToggleAll = () => {
    const newState = !showAllDetails;
    setShowAllDetails(newState);
    setExpandPortfolio(newState);
    setExpandCapital(newState);
    setExpandOrdLoss(newState);
    setExpandCf(newState);
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

    // Expanded Portfolio Details - Collateral, QFAF, Cash Returned (combined mode)
    if (expandPortfolio && qfafEnabled && viewMode === 'combined') cols += 3;

    // Expanded Capital Details - ST Losses, LT Gains, Harvest Rate (collateral)
    if (expandCapital && showCollateral) cols += 3;

    // QFAF ST Gains column
    if (viewMode === 'qfaf-only') cols += 1;
    if (expandCapital && viewMode === 'combined' && qfafEnabled) cols += 1;

    // QFAF columns - Total Losses Realized (expandable)
    if (showQfaf && qfafEnabled) {
      cols += 1; // Total Losses headline
      if (expandOrdLoss) cols += 5; // Ord. Loss, Gross, → NOL, NOL Applied, NOL Carryover
    }

    // Capital loss carryforward group (always shown)
    cols += 1; // Cap. CF headline
    if (expandCf) cols += 3; // ST CF, LT CF, $3K Used

    cols += 1; // Tax Savings column
    cols += 1; // Cumulative column
    if (expandSavings) cols += 5; // Ord Ded., NOL Ben., $3K Ben., LT Cost, ST Cost
    return cols;
  };

  // Savings breakdown columns count for starting row
  const savingsDetailCols = expandSavings ? 5 : 0;

  // Filter out quiet wind-down rows where only the routine $3K capital loss deduction is running.
  // Keep wind-down rows that have meaningful activity: NOL usage, ordinary loss benefits, or
  // significant tax savings beyond the ~$1.5K/yr capital loss deduction.
  const filteredData = data.filter(y => {
    if (y.strategyActive) return true;
    // Keep wind-down rows with NOL usage or ordinary loss benefits (significant events)
    return (
      y.nolUsedThisYear > 0.01 ||
      y.ordinaryLossBenefit > 0.01 ||
      y.nolUsageBenefit > 0.01
    );
  });

  // Determine if this is the first wind-down row for divider
  const firstWindDownIndex = filteredData.findIndex(y => !y.strategyActive);

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
                title="Quantinno Fundamental Arbitrage Fund — generates ordinary losses and short-term gains"
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
                  <th className="col-detail qfaf-col">
                    <InfoText contentKey="col-cash-returned">Cash Out</InfoText>
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
                  <th className="col-detail collateral-col">
                    <InfoText contentKey="col-eff-rate">Harvest %</InfoText>
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

              {/* Capital loss carryforward balances - Collapsible */}
              <th
                className="col-expandable col-capital-cf"
                onClick={() => setExpandCf(!expandCf)}
              >
                <span className="expandable-header">
                  <span className="expand-icon">
                    {expandCf ? <ChevronDown /> : <ChevronRight />}
                  </span>
                  <InfoText contentKey="col-capital-cf">Cap. CF</InfoText>
                </span>
              </th>

              {/* Expanded Carryforward Details */}
              {expandCf && (
                <>
                  <th className="col-detail">
                    <InfoText contentKey="col-st-carryforward">ST CF</InfoText>
                  </th>
                  <th className="col-detail">
                    <InfoText contentKey="col-lt-carryforward">LT CF</InfoText>
                  </th>
                  <th className="col-detail">
                    <InfoText contentKey="col-cap-loss-income">$3K Used</InfoText>
                  </th>
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

              {/* Expanded Savings Breakdown — components sum exactly to Savings */}
              {expandSavings && (
                <>
                  <th className="col-detail benefit-col">
                    <InfoText contentKey="col-ord-loss-benefit">Ord. Ded.</InfoText>
                  </th>
                  <th className="col-detail benefit-col">
                    <InfoText contentKey="col-nol-benefit">NOL Ben.</InfoText>
                  </th>
                  <th className="col-detail benefit-col">
                    <InfoText contentKey="col-capital-loss-benefit">$3K Ben.</InfoText>
                  </th>
                  <th className="col-detail cost-col">
                    <InfoText contentKey="col-lt-gain-cost">LT Cost</InfoText>
                  </th>
                  <th className="col-detail cost-col">
                    <InfoText contentKey="col-st-leak-cost">ST Cost</InfoText>
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
                  <td className="starting-note qfaf-col">—</td>
                </>
              )}
              {showCollateral && <td className="starting-note">—</td>}
              {expandCapital && showCollateral && (
                <>
                  <td className="starting-note collateral-col">—</td>
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
              {expandCf && (
                <>
                  <td className="starting-note">—</td>
                  <td className="starting-note">—</td>
                  <td className="starting-note">—</td>
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

            {filteredData.map((year, index) => {
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
                      {!isWindDown && (
                        <button
                          type="button"
                          className="breakdown-toggle"
                          onClick={() => toggleBreakdownYear(year.year)}
                          aria-expanded={expandedBreakdownYears.has(year.year)}
                          title={
                            expandedBreakdownYears.has(year.year)
                              ? 'Hide month/quarter breakdown'
                              : 'Show month/quarter breakdown'
                          }
                        >
                          <span className="expand-icon">
                            {expandedBreakdownYears.has(year.year) ? (
                              <ChevronDown />
                            ) : (
                              <ChevronRight />
                            )}
                          </span>
                        </button>
                      )}
                      {year.year}
                      {year.year === 1 && partialFirstYearMonths !== null && (
                        <span
                          className="partial-year-badge partial-year-badge--compact"
                          title={`Year 1 pro-rated to ${partialFirstYearMonths} months`}
                        >
                          {partialFirstYearMonths} mo
                        </span>
                      )}
                      {isWindDown && <span className="wind-down-badge" title="Wind-down: strategy ended, carryforward usage only">W/D</span>}
                    </td>
                    <td>{formatCurrency(portfolioValue)}</td>

                    {/* Expanded Portfolio Details - only in combined mode */}
                    {expandPortfolio && qfafEnabled && viewMode === 'combined' && (
                      <>
                        <td className="collateral-col">{formatCurrency(year.collateralValue)}</td>
                        <td className="qfaf-col">{formatCurrency(year.qfafValue)}</td>
                        <td className="qfaf-col">
                          {year.qfafCashReturned > 0.01
                            ? formatCurrency(year.qfafCashReturned)
                            : '—'}
                        </td>
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
                        <td className="collateral-col">
                          {isWindDown ? '—' : formatPercent(year.effectiveStLossRate)}
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

                    {/* Capital loss carryforward balances (real data through wind-down) */}
                    <td>
                      {formatCurrency(year.stLossCarryforward + year.ltLossCarryforward)}
                    </td>

                    {/* Expanded Carryforward Details */}
                    {expandCf && (
                      <>
                        <td>{formatCurrency(year.stLossCarryforward)}</td>
                        <td>{formatCurrency(year.ltLossCarryforward)}</td>
                        <td className="positive">
                          {year.capitalLossUsedAgainstIncome > 0
                            ? formatCurrency(year.capitalLossUsedAgainstIncome)
                            : '—'}
                        </td>
                      </>
                    )}

                    {/* Tax Savings (collapsed: net number) */}
                    <td className={`highlight ${displayedBenefit < 0 ? 'negative' : ''}`}>
                      {displayedBenefit < 0
                        ? `(${formatCurrency(Math.abs(displayedBenefit))})`
                        : formatCurrency(displayedBenefit)}
                    </td>

                    {/* Expanded Savings Breakdown — sums exactly to Savings */}
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
                        {/* $3K Capital Loss Deduction Benefit */}
                        <td className="positive benefit-col">
                          {year.capitalLossBenefit > 0
                            ? formatCurrency(year.capitalLossBenefit)
                            : '—'}
                        </td>
                        {/* LT Gain Cost */}
                        <td className="negative cost-col">
                          {year.ltGainCost > 0
                            ? `(${formatCurrency(year.ltGainCost)})`
                            : '—'}
                        </td>
                        {/* Net ST Gain Cost (leakage) */}
                        <td className="negative cost-col">
                          {year.remainingStGainCost > 0
                            ? `(${formatCurrency(year.remainingStGainCost)})`
                            : '—'}
                        </td>
                      </>
                    )}

                    {/* Cumulative Savings */}
                    <td className="highlight cumulative-cell">
                      {formatCurrency(cumulativeSavings)}
                    </td>
                  </tr>
                  {expandedBreakdownYears.has(year.year) && !isWindDown && (
                    <tr className="breakdown-sub-row">
                      <td colSpan={getColSpan()}>
                        <div className="loss-breakdown">
                          <div className="loss-breakdown-controls">
                            <span className="loss-breakdown-title">
                              Year {year.year} loss generation
                            </span>
                            <div className="loss-breakdown-granularity">
                              <button
                                type="button"
                                className={`view-mode-btn ${breakdownGranularity === 'quarterly' ? 'active' : ''}`}
                                onClick={() => setBreakdownGranularity('quarterly')}
                              >
                                Quarterly
                              </button>
                              <button
                                type="button"
                                className={`view-mode-btn ${breakdownGranularity === 'monthly' ? 'active' : ''}`}
                                onClick={() => setBreakdownGranularity('monthly')}
                              >
                                Monthly
                              </button>
                            </div>
                          </div>
                          <table className="loss-breakdown-table">
                            <thead>
                              <tr>
                                <th>Period</th>
                                <th>Deployment Year</th>
                                <th className="num">ST Losses (Collateral)</th>
                                {qfafEnabled && (
                                  <th className="num">Ord. Losses (QFAF)</th>
                                )}
                              </tr>
                            </thead>
                            <tbody>
                              {buildLossBreakdown({
                                year,
                                yearIndex: year.year,
                                startMonth,
                                qfafDuration,
                                granularity: breakdownGranularity,
                                rateForDeploymentYear,
                              }).map(p => (
                                <tr
                                  key={p.label}
                                  className={p.active ? '' : 'loss-breakdown-inactive'}
                                >
                                  <td>{p.label}</td>
                                  <td>{describeSegments(p.segments)}</td>
                                  <td className="num negative">
                                    {p.active
                                      ? `(${formatCurrency(p.stLosses)})`
                                      : '—'}
                                  </td>
                                  {qfafEnabled && (
                                    <td className="num negative">
                                      {p.active
                                        ? `(${formatCurrency(p.ordinaryLosses)})`
                                        : '—'}
                                    </td>
                                  )}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          {!rateForDeploymentYear && (
                            <p className="loss-breakdown-note">
                              Split allocation: losses spread uniformly across active
                              months (deployment-year rates aren't a single curve).
                            </p>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>

          <tfoot>
            <tr>
              <td colSpan={getColSpan() - 1}>
                <strong>Total {data.length}-Year Projection</strong>
              </td>
              <td className="highlight">
                <strong>{formatCurrency(totalSavingsAllYears)}</strong>
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
              Expand "Total Losses" for usable ordinary loss, gross losses, §461(l) cap overflow to NOL,
              and NOL usage; "Cap. CF" for ST/LT carryforward balances and the $3K deduction; and
              "Savings" for the full benefit/cost components, which sum exactly to the Savings column
              (Ord. Ded. + NOL Ben. + $3K Ben. − LT Cost − ST Cost). Rows marked "W/D" are
              post-strategy wind-down years where only carryforward usage continues.
            </em>
          </p>
        )}
      </div>
    </div>
  );
}
