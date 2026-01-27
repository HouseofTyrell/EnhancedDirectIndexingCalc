import React from 'react';
import { InfoPopup, FieldInfoPopup, TaxRatesFormula } from '../InfoPopup';

interface TaxRatesDisplayProps {
  federalStRate: number;
  federalLtRate: number;
  stateRate: number;
  combinedStRate: number;
  combinedLtRate: number;
  rateDifferential: number;
}

/**
 * Displays the calculated marginal tax rates based on client profile.
 * Shows federal, state, and combined rates with ST→LT benefit analysis.
 */
export const TaxRatesDisplay = React.memo(function TaxRatesDisplay({
  federalStRate,
  federalLtRate,
  stateRate,
  combinedStRate,
  combinedLtRate,
  rateDifferential,
}: TaxRatesDisplayProps) {
  const formatRate = (rate: number) => `${(rate * 100).toFixed(1)}%`;

  return (
    <section className="tax-rates-section">
      <div className="section-number" data-step="3">
        Tax Rate Analysis
      </div>
      <div className="section-header">
        <h2>Marginal Tax Rates</h2>
        <InfoPopup title="Tax Rate Calculations">
          <TaxRatesFormula />
        </InfoPopup>
      </div>
      <p className="section-guidance">
        These marginal rates determine the value of each tax event. Higher ST→LT benefit means more
        savings from the strategy.
      </p>
      <div className="tax-rates-grid">
        <div className="tax-rate-item">
          <span className="rate-label">
            Federal Ordinary/ST
            <FieldInfoPopup contentKey="federal-st-rate" currentValue={formatRate(federalStRate)} />
          </span>
          <span className="rate-value">{formatRate(federalStRate)}</span>
        </div>
        <div className="tax-rate-item">
          <span className="rate-label">
            Federal LT Cap Gains
            <FieldInfoPopup contentKey="federal-lt-rate" currentValue={formatRate(federalLtRate)} />
          </span>
          <span className="rate-value">{formatRate(federalLtRate)}</span>
        </div>
        <div className="tax-rate-item">
          <span className="rate-label">
            State
            <FieldInfoPopup contentKey="state-rate" currentValue={formatRate(stateRate)} />
          </span>
          <span className="rate-value">{formatRate(stateRate)}</span>
        </div>
        <div className="tax-rate-item highlight">
          <span className="rate-label">
            Combined Ordinary
            <FieldInfoPopup
              contentKey="combined-st-rate"
              currentValue={formatRate(combinedStRate)}
            />
          </span>
          <span className="rate-value">{formatRate(combinedStRate)}</span>
        </div>
        <div className="tax-rate-item highlight">
          <span className="rate-label">
            Combined LT
            <FieldInfoPopup
              contentKey="combined-lt-rate"
              currentValue={formatRate(combinedLtRate)}
            />
          </span>
          <span className="rate-value">{formatRate(combinedLtRate)}</span>
        </div>
        <div className="tax-rate-item accent">
          <span className="rate-label">
            ST→LT Benefit
            <FieldInfoPopup
              contentKey="st-lt-benefit"
              currentValue={formatRate(rateDifferential)}
            />
          </span>
          <span className="rate-value">{formatRate(rateDifferential)}</span>
        </div>
      </div>
    </section>
  );
});
