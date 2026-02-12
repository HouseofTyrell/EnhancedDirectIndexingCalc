import React from 'react';
import { formatCurrency, formatCurrencyAbbreviated } from '../utils/formatters';
import { useValueFlash } from '../hooks/useValueFlash';
import { useDelta } from '../hooks/useDelta';
import { DeltaBadge } from './DeltaBadge';
import './EdiStickyHeader.css';

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

interface EdiStickyHeaderProps {
  strategyName: string;
  collateral: number;
  totalTaxSavings: number;
  totalCarryforward: number;
  isExpanded: boolean;
  hasPinned: boolean;
  onPin: () => void;
  onUnpin: () => void;
  pinnedValues?: {
    collateral: number;
    totalTaxSavings: number;
    totalCarryforward: number;
  };
}

export const EdiStickyHeader = React.memo(function EdiStickyHeader({
  strategyName,
  collateral,
  totalTaxSavings,
  totalCarryforward,
  isExpanded,
  hasPinned,
  onPin,
  onUnpin,
  pinnedValues,
}: EdiStickyHeaderProps) {
  const collateralFlash = useValueFlash(collateral);
  const savingsFlash = useValueFlash(totalTaxSavings);
  const cfFlash = useValueFlash(totalCarryforward);

  const collateralDelta = useDelta(collateral);
  const savingsDelta = useDelta(totalTaxSavings);
  const cfDelta = useDelta(totalCarryforward);

  return (
    <div
      className={`sticky-header ${isExpanded ? 'sticky-header--expanded' : ''}`}
      role="banner"
      aria-label="EDI key metrics summary"
    >
      <div className="sticky-header__content">
        <div className="sticky-header__metric">
          <span className="sticky-header__label">Strategy</span>
          <span className="sticky-header__value">{strategyName}</span>
          {isExpanded && <span className="sticky-header__subtext">EDI-Only (no QFAF)</span>}
        </div>
        <div className="sticky-header__metric">
          <span className="sticky-header__label">Collateral</span>
          <span className="sticky-header__value" ref={collateralFlash}>
            {formatCurrency(collateral)}
            <DeltaBadge delta={collateralDelta} />
          </span>
          {pinnedValues && <PinnedDelta current={collateral} pinned={pinnedValues.collateral} />}
        </div>
        <div className="sticky-header__metric sticky-header__metric--highlight">
          <span className="sticky-header__label">Potential Tax Savings</span>
          <span className="sticky-header__value" ref={savingsFlash}>
            {formatCurrency(totalTaxSavings)}
            <DeltaBadge delta={savingsDelta} />
          </span>
          {isExpanded && <span className="sticky-header__subtext">CF shield + realized</span>}
          {pinnedValues && <PinnedDelta current={totalTaxSavings} pinned={pinnedValues.totalTaxSavings} />}
        </div>
        <div className="sticky-header__metric sticky-header__metric--primary">
          <span className="sticky-header__label">Carryforward</span>
          <span className="sticky-header__value" ref={cfFlash}>
            {formatCurrency(totalCarryforward)}
            <DeltaBadge delta={cfDelta} />
          </span>
          {isExpanded && <span className="sticky-header__subtext">ST + LT combined</span>}
          {pinnedValues && <PinnedDelta current={totalCarryforward} pinned={pinnedValues.totalCarryforward} />}
        </div>
        <button
          className={`sticky-header__pin-btn${hasPinned ? ' sticky-header__pin-btn--active' : ''}`}
          onClick={hasPinned ? onUnpin : onPin}
          aria-label={hasPinned ? 'Unpin scenario' : 'Pin current scenario'}
          title={hasPinned ? 'Unpin scenario' : 'Pin current scenario for comparison'}
        >
          <PinIcon active={hasPinned} />
          {isExpanded && <span>{hasPinned ? 'Pinned' : 'Pin'}</span>}
        </button>
        {hasPinned && (
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
      </div>
    </div>
  );
});
