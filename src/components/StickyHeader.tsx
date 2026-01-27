import React from 'react';
import { formatCurrency } from '../utils/formatters';

interface StickyHeaderProps {
  strategyName: string;
  collateral: number;
  qfafValue: number;
  totalExposure: number;
  annualTaxSavings: number;
  isExpanded: boolean;
}

export const StickyHeader = React.memo(function StickyHeader({
  strategyName,
  collateral,
  qfafValue,
  totalExposure,
  annualTaxSavings,
  isExpanded,
}: StickyHeaderProps) {
  // Calculate leverage ratio
  const leverageRatio = collateral > 0 ? totalExposure / collateral : 0;

  return (
    <div
      className={`sticky-header ${isExpanded ? 'sticky-header--expanded' : ''}`}
      role="banner"
      aria-label="Key metrics summary"
    >
      <div className="sticky-header__content">
        <div className="sticky-header__metric">
          <span className="sticky-header__label">Strategy</span>
          <span className="sticky-header__value" aria-live="polite">
            {strategyName}
          </span>
          {isExpanded && (
            <span className="sticky-header__subtext">{leverageRatio.toFixed(2)}x leverage</span>
          )}
        </div>
        <div className="sticky-header__metric">
          <span className="sticky-header__label">Collateral</span>
          <span className="sticky-header__value" aria-live="polite">
            {formatCurrency(collateral)}
          </span>
          {isExpanded && (
            <span className="sticky-header__subtext">Starting investment</span>
          )}
        </div>
        <div className="sticky-header__metric">
          <span className="sticky-header__label">QFAF Value</span>
          <span className="sticky-header__value" aria-live="polite">
            {formatCurrency(qfafValue)}
          </span>
          {isExpanded && (
            <span className="sticky-header__subtext">Auto-sized position</span>
          )}
        </div>
        <div className="sticky-header__metric sticky-header__metric--primary">
          <span className="sticky-header__label">Annual Tax Savings</span>
          <span className="sticky-header__value" aria-live="polite">
            {formatCurrency(annualTaxSavings)}
          </span>
          {isExpanded && (
            <span className="sticky-header__subtext">Year 1 estimated benefit</span>
          )}
        </div>
      </div>
    </div>
  );
});
