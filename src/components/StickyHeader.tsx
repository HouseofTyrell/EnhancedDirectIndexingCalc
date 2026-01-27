import React from 'react';
import { formatCurrency } from '../utils/formatters';

// Settings gear icon
function SettingsIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

interface StickyHeaderProps {
  strategyName: string;
  collateral: number;
  qfafValue: number;
  totalExposure: number;
  annualTaxSavings: number;
  year2TaxSavings?: number;
  isExpanded: boolean;
  onOpenAdvanced?: () => void;
}

export const StickyHeader = React.memo(function StickyHeader({
  strategyName,
  collateral,
  qfafValue,
  totalExposure,
  annualTaxSavings,
  year2TaxSavings,
  isExpanded,
  onOpenAdvanced,
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
          {isExpanded && <span className="sticky-header__subtext">Starting investment</span>}
        </div>
        <div className="sticky-header__metric">
          <span className="sticky-header__label">QFAF Value</span>
          <span className="sticky-header__value" aria-live="polite">
            {formatCurrency(qfafValue)}
          </span>
          {isExpanded && <span className="sticky-header__subtext">Auto-sized position</span>}
        </div>
        <div className="sticky-header__metric sticky-header__metric--highlight">
          <span className="sticky-header__label">Year 1 Savings</span>
          <span className="sticky-header__value" aria-live="polite">
            {formatCurrency(annualTaxSavings)}
          </span>
          {isExpanded && <span className="sticky-header__subtext">First year benefit</span>}
        </div>
        {year2TaxSavings !== undefined && year2TaxSavings > 0 && (
          <div className="sticky-header__metric sticky-header__metric--primary">
            <span className="sticky-header__label">Year 2+ Savings</span>
            <span className="sticky-header__value" aria-live="polite">
              {formatCurrency(year2TaxSavings)}
            </span>
            {isExpanded && <span className="sticky-header__subtext">Includes NOL usage</span>}
          </div>
        )}
        {onOpenAdvanced && (
          <button
            className="sticky-header__advanced-btn"
            onClick={onOpenAdvanced}
            aria-label="Open advanced settings"
            title="Advanced Settings"
          >
            <SettingsIcon />
            {isExpanded && <span>Advanced</span>}
          </button>
        )}
      </div>
    </div>
  );
});
