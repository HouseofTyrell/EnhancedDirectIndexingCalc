import React from 'react';
import { formatCurrency, formatCurrencyAbbreviated } from '../utils/formatters';
import { useValueFlash } from '../hooks/useValueFlash';
import { useDelta } from '../hooks/useDelta';
import { DeltaBadge } from './DeltaBadge';

/**
 * Pin/thumbtack icon for the pin scenario button.
 * @internal
 */
function PinIcon({ active }: { active?: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill={active ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="12" y1="17" x2="12" y2="22" />
      <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z" />
    </svg>
  );
}

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
  /** Callback to reset all inputs to defaults */
  onReset?: () => void;
  /** Whether a scenario is currently pinned */
  hasPinnedScenario?: boolean;
  /** Callback to pin the current scenario */
  onPinScenario?: () => void;
  /** Callback to unpin the current scenario */
  onUnpinScenario?: () => void;
  /** Pinned scenario values for persistent delta display */
  pinnedValues?: {
    collateral: number;
    qfafValue: number;
    annualTaxSavings: number;
    year2TaxSavings?: number;
  };
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
/**
 * Persistent delta shown under a metric when a scenario is pinned.
 * Unlike DeltaBadge (transient 2.5s), this stays visible as long as the pin exists.
 */
function PinnedDelta({ current, pinned }: { current: number; pinned: number }) {
  const delta = current - pinned;
  if (Math.abs(delta) < 1) return null;
  const sign = delta > 0 ? '+' : '';
  const cls = delta > 0 ? 'pinned-delta--positive' : 'pinned-delta--negative';
  return (
    <span className={`sticky-header__pinned-delta ${cls}`}>
      vs pin: {sign}{formatCurrencyAbbreviated(delta)}
    </span>
  );
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
  onReset,
  hasPinnedScenario,
  onPinScenario,
  onUnpinScenario,
  pinnedValues,
}: StickyHeaderProps) {
  // Calculate leverage ratio
  const leverageRatio = collateral > 0 ? totalExposure / collateral : 0;

  // Flash animations for value changes
  const collateralFlash = useValueFlash(collateral);
  const qfafFlash = useValueFlash(qfafValue);
  const savingsFlash = useValueFlash(annualTaxSavings);
  const year2Flash = useValueFlash(year2TaxSavings);

  // Delta indicators
  const collateralDelta = useDelta(collateral);
  const qfafDelta = useDelta(qfafValue);
  const savingsDelta = useDelta(annualTaxSavings);
  const year2Delta = useDelta(year2TaxSavings ?? 0);

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
          <span className="sticky-header__value" aria-live="polite" ref={collateralFlash}>
            {formatCurrency(collateral)}
            <DeltaBadge delta={collateralDelta} />
          </span>
          {isExpanded && <span className="sticky-header__subtext">Starting investment</span>}
          {pinnedValues && <PinnedDelta current={collateral} pinned={pinnedValues.collateral} />}
        </div>
        <div className="sticky-header__metric">
          <span className="sticky-header__label">QFAF Value</span>
          <span className="sticky-header__value" aria-live="polite" ref={qfafFlash}>
            {formatCurrency(qfafValue)}
            <DeltaBadge delta={qfafDelta} />
          </span>
          {isExpanded && <span className="sticky-header__subtext">Auto-sized position</span>}
          {pinnedValues && <PinnedDelta current={qfafValue} pinned={pinnedValues.qfafValue} />}
        </div>
        <div className="sticky-header__metric sticky-header__metric--highlight">
          <span className="sticky-header__label">Year 1 Savings</span>
          <span className="sticky-header__value" aria-live="polite" ref={savingsFlash}>
            {formatCurrency(annualTaxSavings)}
            <DeltaBadge delta={savingsDelta} />
          </span>
          {isExpanded && <span className="sticky-header__subtext">First year benefit</span>}
          {pinnedValues && <PinnedDelta current={annualTaxSavings} pinned={pinnedValues.annualTaxSavings} />}
        </div>
        {year2TaxSavings !== undefined && year2TaxSavings > 0 && (
          <div className="sticky-header__metric sticky-header__metric--primary">
            <span className="sticky-header__label">Year 2+ Savings</span>
            <span className="sticky-header__value" aria-live="polite" ref={year2Flash}>
              {formatCurrency(year2TaxSavings)}
              <DeltaBadge delta={year2Delta} />
            </span>
            {isExpanded && <span className="sticky-header__subtext">Includes NOL usage</span>}
            {pinnedValues?.year2TaxSavings != null && (
              <PinnedDelta current={year2TaxSavings} pinned={pinnedValues.year2TaxSavings} />
            )}
          </div>
        )}
        {(onPinScenario || onUnpinScenario) && (
          <>
            <button
              className={`sticky-header__pin-btn${hasPinnedScenario ? ' sticky-header__pin-btn--active' : ''}`}
              onClick={hasPinnedScenario ? onUnpinScenario : onPinScenario}
              aria-label={hasPinnedScenario ? 'Unpin scenario' : 'Pin current scenario'}
              title={hasPinnedScenario ? 'Unpin scenario' : 'Pin current scenario for comparison'}
            >
              <PinIcon active={hasPinnedScenario} />
              {isExpanded && <span>{hasPinnedScenario ? 'Pinned' : 'Pin'}</span>}
            </button>
            {hasPinnedScenario && (
              <button
                className="sticky-header__compare-link"
                onClick={() => {
                  document.querySelector('.comparison-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }}
                title="Scroll to comparison panel"
              >
                {isExpanded ? 'View Comparison \u2193' : '\u2193'}
              </button>
            )}
          </>
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
        {onReset && (
          <button
            className="sticky-header__reset-btn"
            onClick={() => {
              if (window.confirm('Reset all inputs to defaults? This cannot be undone.')) {
                onReset();
              }
            }}
            aria-label="Reset to defaults"
            title="Reset all inputs to defaults"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
            </svg>
            {isExpanded && <span>Reset</span>}
          </button>
        )}
      </div>
    </div>
  );
});
