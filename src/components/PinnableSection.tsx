import { ReactNode } from 'react';

interface PinnableSectionProps {
  /** Unique ID for this pinnable element */
  id: string;
  /** Human-readable label shown in the floating panel header */
  label: string;
  /** Whether this element is currently pinned */
  isPinned: boolean;
  /** Toggle pin on/off */
  onTogglePin: () => void;
  children: ReactNode;
}

/**
 * Wraps any section with a small pin button in the top-right corner.
 * When pinned, the element also renders in the FloatingPinnedPanel.
 */
export function PinnableSection({
  id,
  label,
  isPinned,
  onTogglePin,
  children,
}: PinnableSectionProps) {
  return (
    <div className="pinnable-section" data-pinnable-id={id}>
      <button
        className={`pinnable-section__btn${isPinned ? ' pinnable-section__btn--active' : ''}`}
        onClick={onTogglePin}
        aria-label={isPinned ? `Unpin ${label}` : `Pin ${label} to floating panel`}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill={isPinned ? 'currentColor' : 'none'}
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="12" y1="17" x2="12" y2="22" />
          <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z" />
        </svg>
        <span className="pinnable-section__tooltip">{isPinned ? 'Pinned' : 'Pin'}</span>
      </button>
      {children}
    </div>
  );
}
