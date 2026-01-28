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
}

/**
 * Displays the key results summary cards showing projected benefits.
 * This is the first section users see, providing high-level benefits.
 *
 * Cards displayed:
 * - Total Tax Savings (cumulative over projection period)
 * - Final Portfolio Value (end of projection)
 * - Annualized Tax Alpha (percentage)
 * - Total NOL Generated (from excess ordinary losses)
 */
export const ResultsSummary = React.memo(function ResultsSummary({
  totalTaxSavings,
  finalPortfolioValue,
  effectiveTaxAlpha,
  totalNolGenerated,
  projectionYears = 10,
}: ResultsSummaryProps) {
  return (
    <section className="results-summary-section">
      <div className="section-number" data-step="1">
        Your Projected Benefit
      </div>
      <div className="section-header">
        <h2>{projectionYears}-Year Tax Savings</h2>
      </div>
      <p className="section-guidance">
        Based on inputs below. Adjust values to see updated projections.
      </p>
      <div className="summary-cards">
        <div className="card primary">
          <h3>
            <InfoText contentKey="total-tax-savings" currentValue={formatCurrency(totalTaxSavings)}>
              Total Tax Savings
            </InfoText>
          </h3>
          <p className="big-number">{formatCurrency(totalTaxSavings)}</p>
          <p className="subtext">Over {projectionYears} years</p>
        </div>
        <div className="card">
          <h3>
            <InfoText contentKey="final-portfolio-value" currentValue={formatCurrency(finalPortfolioValue)}>
              Final Portfolio Value
            </InfoText>
          </h3>
          <p className="big-number">{formatCurrency(finalPortfolioValue)}</p>
          <p className="subtext">Year {projectionYears}</p>
        </div>
        <div className="card">
          <h3>
            <InfoText contentKey="effective-tax-alpha" currentValue={formatPercent(effectiveTaxAlpha)}>
              Annualized Tax Alpha
            </InfoText>
          </h3>
          <p className="big-number">{formatPercent(effectiveTaxAlpha)}</p>
          <p className="subtext">Per year</p>
        </div>
        <div className="card">
          <h3>
            <InfoText contentKey="total-nol-generated" currentValue={formatCurrency(totalNolGenerated)}>
              Total NOL Generated
            </InfoText>
          </h3>
          <p className="big-number">{formatCurrency(totalNolGenerated)}</p>
          <p className="subtext">Cumulative excess</p>
        </div>
      </div>
    </section>
  );
});
