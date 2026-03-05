import React from 'react';
import { InfoPopup, InfoText, TaxRatesFormula } from '../InfoPopup';
import { CollapsibleSection } from './CollapsibleSection';
import { useValueFlash } from '../hooks/useValueFlash';

/**
 * Props for the TaxRatesDisplay component.
 * All rates are decimal values (e.g., 0.37 for 37%).
 */
interface TaxRatesDisplayProps {
  /** Federal marginal rate for ordinary income and short-term gains */
  federalStRate: number;
  /** Federal marginal rate for long-term capital gains */
  federalLtRate: number;
  /** State income tax rate */
  stateRate: number;
  /** Combined federal + state rate for ordinary income */
  combinedStRate: number;
  /** Combined federal + state rate for long-term gains */
  combinedLtRate: number;
  /** Difference between ST and LT rates (the tax arbitrage benefit) */
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

  // Flash on rate changes
  const fedStFlash = useValueFlash(federalStRate);
  const fedLtFlash = useValueFlash(federalLtRate);
  const stateFlash = useValueFlash(stateRate);
  const combStFlash = useValueFlash(combinedStRate);
  const combLtFlash = useValueFlash(combinedLtRate);
  const diffFlash = useValueFlash(rateDifferential);

  return (
    <CollapsibleSection
      sectionKey="taxRates"
      step="2"
      stepLabel="Tax Rate Analysis"
      title="Marginal Tax Rates"
      headerAction={
        <InfoPopup title="Tax Rate Calculations">
          <TaxRatesFormula />
        </InfoPopup>
      }
      guidance="These marginal rates determine the value of each tax event. A larger rate differential means more savings from rate arbitrage."
      className="tax-rates-section"
    >
      <div className="tax-rates-rows">
        <div className="tax-rates-row">
          <span className="tax-rates-row__heading">Component Rates</span>
          <div className="tax-rates-row__items">
            <div className="tax-rate-item">
              <span className="rate-label">
                <InfoText contentKey="federal-st-rate" currentValue={formatRate(federalStRate)}>
                  Federal Ordinary / ST
                </InfoText>
              </span>
              <span className="rate-value" ref={fedStFlash}>{formatRate(federalStRate)}</span>
            </div>
            <div className="tax-rate-item">
              <span className="rate-label">
                <InfoText contentKey="federal-lt-rate" currentValue={formatRate(federalLtRate)}>
                  Federal LT Cap Gains
                </InfoText>
              </span>
              <span className="rate-value" ref={fedLtFlash}>{formatRate(federalLtRate)}</span>
            </div>
            <div className="tax-rate-item">
              <span className="rate-label">
                <InfoText contentKey="state-rate" currentValue={formatRate(stateRate)}>
                  State
                </InfoText>
              </span>
              <span className="rate-value" ref={stateFlash}>{formatRate(stateRate)}</span>
            </div>
          </div>
        </div>
        <div className="tax-rates-row">
          <span className="tax-rates-row__heading">Combined &amp; Benefit</span>
          <div className="tax-rates-row__items">
            <div className="tax-rate-item highlight">
              <span className="rate-label">
                <InfoText contentKey="combined-st-rate" currentValue={formatRate(combinedStRate)}>
                  Combined Ordinary
                </InfoText>
              </span>
              <span className="rate-value" ref={combStFlash}>{formatRate(combinedStRate)}</span>
            </div>
            <div className="tax-rate-item highlight">
              <span className="rate-label">
                <InfoText contentKey="combined-lt-rate" currentValue={formatRate(combinedLtRate)}>
                  Combined LT
                </InfoText>
              </span>
              <span className="rate-value" ref={combLtFlash}>{formatRate(combinedLtRate)}</span>
            </div>
            <div className="tax-rate-item accent">
              <span className="rate-label">
                <InfoText contentKey="st-lt-benefit" currentValue={formatRate(rateDifferential)}>
                  ST → LT Benefit
                </InfoText>
              </span>
              <span className="rate-value" ref={diffFlash}>{formatRate(rateDifferential)}</span>
            </div>
          </div>
        </div>
      </div>
    </CollapsibleSection>
  );
});
