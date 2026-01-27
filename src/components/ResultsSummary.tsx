import React from 'react';
import { FieldInfoPopup } from '../InfoPopup';
import { formatCurrency, formatPercent } from '../utils/formatters';

interface ResultsSummaryProps {
  totalTaxSavings: number;
  finalPortfolioValue: number;
  effectiveTaxAlpha: number;
  totalNolGenerated: number;
}

export const ResultsSummary = React.memo(function ResultsSummary({
  totalTaxSavings,
  finalPortfolioValue,
  effectiveTaxAlpha,
  totalNolGenerated,
}: ResultsSummaryProps) {
  return (
    <section className="results-summary-section">
      <div className="section-number" data-step="1">Your Projected Benefit</div>
      <div className="section-header">
        <h2>10-Year Tax Savings</h2>
      </div>
      <p className="section-guidance">
        Based on inputs below. Adjust values to see updated projections.
      </p>
      <div className="summary-cards">
        <div className="card primary">
          <h3>
            Total Tax Savings
            <FieldInfoPopup contentKey="total-tax-savings" currentValue={formatCurrency(totalTaxSavings)} />
          </h3>
          <p className="big-number">{formatCurrency(totalTaxSavings)}</p>
          <p className="subtext">Over 10 years</p>
        </div>
        <div className="card">
          <h3>
            Final Portfolio Value
            <FieldInfoPopup contentKey="final-portfolio-value" currentValue={formatCurrency(finalPortfolioValue)} />
          </h3>
          <p className="big-number">{formatCurrency(finalPortfolioValue)}</p>
          <p className="subtext">Year 10</p>
        </div>
        <div className="card">
          <h3>
            Annualized Tax Alpha
            <FieldInfoPopup contentKey="effective-tax-alpha" currentValue={formatPercent(effectiveTaxAlpha)} />
          </h3>
          <p className="big-number">{formatPercent(effectiveTaxAlpha)}</p>
          <p className="subtext">Per year</p>
        </div>
        <div className="card">
          <h3>
            Total NOL Generated
            <FieldInfoPopup contentKey="total-nol-generated" currentValue={formatCurrency(totalNolGenerated)} />
          </h3>
          <p className="big-number">{formatCurrency(totalNolGenerated)}</p>
          <p className="subtext">Cumulative excess</p>
        </div>
      </div>
    </section>
  );
});
