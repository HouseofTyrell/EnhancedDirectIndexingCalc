import React from 'react';
import { formatCurrency } from '../utils/formatters';

/**
 * Settings gear icon for the advanced settings button.
 * @internal
 */
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

/**
 * Props for the StickyHeader component.
 */
interface StickyHeaderProps {
  /** Name of the selected strategy (e.g., "Core 145/45") */
  strategyName: string;
  /** Collateral investment amount in dollars */
  collateral: number;
  /** Auto-sized QFAF position value in dollars */
  qfafValue: number;
  /** Total exposure (collateral + QFAF) in dollars */
  totalExposure: number;
  /** Year 1 tax savings in dollars */
  annualTaxSavings: number;
  /** Year 2+ tax savings (includes NOL usage), undefined if QFAF disabled */
  year2TaxSavings?: number;
  /** Whether the header is in expanded state (shows additional details) */
  isExpanded: boolean;
  /** Callback when advanced settings button is clicked */
  onOpenAdvanced?: () => void;
}

/**
 * Sticky header that displays key metrics as the user scrolls.
 * Expands to show additional details (leverage ratio, subtexts) when scrolled past the sentinel.
 *
 * @example
 * ```tsx
 * <StickyHeader
 *   strategyName="Core 145/45"
 *   collateral={1000000}
 *   qfafValue={86667}
 *   totalExposure={1086667}
 *   annualTaxSavings={45000}
 *   isExpanded={true}
 *   onOpenAdvanced={() => setModalOpen(true)}
 * />
 * ```
 */
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
