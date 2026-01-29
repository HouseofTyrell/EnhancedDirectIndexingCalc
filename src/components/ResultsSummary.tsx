import React from 'react';
import { InfoText } from '../InfoPopup';
import { formatCurrency, formatPercent } from '../utils/formatters';

/**
 * Props for the ResultsSummary component.
 */
interface ResultsSummaryProps {
  /** Cumulative tax savings over the projection period */
  totalTaxSavings: number;
  /** Portfolio value at the end of the projection period */
  finalPortfolioValue: number;
  /** Annualized tax alpha (tax savings as % of portfolio per year) */
  effectiveTaxAlpha: number;
  /** Total NOL generated from Section 461(l) excess losses */
  totalNolGenerated: number;
  /** Number of years in the projection (default: 10) */
  projectionYears?: number;
  /** Collateral-only tax savings for incremental benefit comparison */
  collateralOnlyTaxSavings?: number;
  /** Total collateral amount for context */
  collateralAmount?: number;
}

/**
 * Displays the key results summary cards showing projected benefits.
 * Provides headline metrics, interpretation text, and disclosure notes.
 *
 * Cards displayed:
 * - Estimated Tax Savings (cumulative over projection period)
 * - Incremental Benefit vs Standard Direct Indexing
 * - Annualized Estimated Tax Alpha (percentage)
 * - Total NOL Generated (from excess ordinary losses)
 */
export const ResultsSummary = React.memo(function ResultsSummary({
  totalTaxSavings,
  finalPortfolioValue,
  effectiveTaxAlpha,
  totalNolGenerated,
  projectionYears = 10,
  collateralOnlyTaxSavings = 0,
  collateralAmount = 0,
}: ResultsSummaryProps) {
  const incrementalBenefit = totalTaxSavings - collateralOnlyTaxSavings;
  const avgAnnualSavings = totalTaxSavings / projectionYears;

  return (
    <section className="results-summary-section">
      <div className="section-number" data-step="1">
        Estimated Results
      </div>
      <div className="section-header">
        <h2>Estimated {projectionYears}-Year Tax Savings</h2>
      </div>
      <p className="section-guidance">
        Based on the inputs and assumptions below. Adjust values to see updated projections.
      </p>

      {/* Headline metrics - visually prominent */}
      <div className="headline-metrics">
        <div className="headline-metric primary">
          <h3>
            <InfoText contentKey="total-tax-savings" currentValue={formatCurrency(totalTaxSavings)}>
              Estimated Tax Savings
            </InfoText>
          </h3>
          <p className="headline-number">{formatCurrency(totalTaxSavings)}</p>
          <p className="subtext">Over {projectionYears} years</p>
        </div>
        <div className="headline-metric">
          <h3>
            <InfoText contentKey="incremental-benefit" currentValue={formatCurrency(incrementalBenefit)}>
              Est. Incremental Benefit
            </InfoText>
          </h3>
          <p className="headline-number">{formatCurrency(incrementalBenefit)}</p>
          <p className="subtext">vs. standard direct indexing</p>
        </div>
        <div className="headline-metric">
          <h3>
            <InfoText contentKey="effective-tax-alpha" currentValue={formatPercent(effectiveTaxAlpha)}>
              Est. Annualized Tax Alpha
            </InfoText>
          </h3>
          <p className="headline-number">{formatPercent(effectiveTaxAlpha)}</p>
          <p className="subtext">Per year</p>
        </div>
      </div>

      {/* Supporting detail cards */}
      <div className="summary-cards">
        <div className="card">
          <h3>
            <InfoText contentKey="final-portfolio-value" currentValue={formatCurrency(finalPortfolioValue)}>
              Est. Final Portfolio Value
            </InfoText>
          </h3>
          <p className="big-number">{formatCurrency(finalPortfolioValue)}</p>
          <p className="subtext">Year {projectionYears}</p>
        </div>
        <div className="card">
          <h3>
            <InfoText contentKey="total-nol-generated" currentValue={formatCurrency(totalNolGenerated)}>
              Est. Total NOL Generated
            </InfoText>
          </h3>
          <p className="big-number">{formatCurrency(totalNolGenerated)}</p>
          <p className="subtext">Cumulative excess</p>
        </div>
        <div className="card">
          <h3>Est. Avg. Annual Savings</h3>
          <p className="big-number">{formatCurrency(avgAnnualSavings)}</p>
          <p className="subtext">Per year avg.</p>
        </div>
      </div>

      {/* Interpretation text */}
      <div className="interpretation-text">
        <strong>What this means:</strong>{' '}
        {collateralAmount > 0 ? (
          <>
            Based on a {formatCurrency(collateralAmount)} portfolio, this strategy is estimated to
            generate approximately {formatCurrency(totalTaxSavings)} in cumulative tax savings
            over {projectionYears} years, or roughly {formatCurrency(avgAnnualSavings)} per year.
            {incrementalBenefit > 0 && (
              <> The enhanced strategy adds an estimated {formatCurrency(incrementalBenefit)} beyond
              what standard direct indexing alone would achieve.</>
            )}
          </>
        ) : (
          <>
            Enter a collateral amount and income details above to see estimated tax savings projections.
          </>
        )}
      </div>

      {/* Exclusion disclosure */}
      <div className="results-disclosure">
        <strong>Note:</strong> Estimates do not reflect advisory fees, financing costs, tracking error
        impacts, transaction costs, or behavioral effects. Actual results will vary. See full
        disclosures below.
      </div>
    </section>
  );
});
