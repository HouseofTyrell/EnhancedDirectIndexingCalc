import { memo, ReactNode, useState, useId, useCallback } from 'react';

const STORAGE_KEY = 'collapsedSections';

function getPersistedState(): Record<string, boolean> {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
}

function persistState(key: string, isOpen: boolean) {
  try {
    const state = getPersistedState();
    state[key] = isOpen;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage errors
  }
}

/**
 * Props for the CollapsibleSection component.
 *
 * Supports two modes:
 * 1. **Self-managed** (provide `sectionKey`): manages own open/closed state with localStorage persistence.
 *    Used for main calculator sections (inputs, tax rates, sizing, results).
 * 2. **Externally controlled** (provide `expanded` + `onToggle`): parent controls state.
 *    Used for advanced tools sections where state lives in useAdvancedMode hook.
 */
interface CollapsibleSectionProps {
  /** Section heading text */
  title: string;
  /** Content rendered inside the section */
  children: ReactNode;

  // --- Self-managed mode (main sections) ---
  /** Unique key for localStorage persistence. Enables self-managed mode. */
  sectionKey?: string;
  /** Section number badge step value (e.g., "2") */
  step?: string;
  /** Section number badge label (e.g., "Tax Rate Analysis") */
  stepLabel?: string;
  /** Optional element next to the h2 (e.g., InfoPopup) */
  headerAction?: ReactNode;
  /** Optional guidance paragraph below the header */
  guidance?: string;
  /** CSS class for the wrapping section element */
  className?: string;

  // --- Externally controlled mode (advanced tools) ---
  /** Whether the section is expanded (external control) */
  expanded?: boolean;
  /** Toggle callback (external control) */
  onToggle?: () => void;
  /** Optional hint text next to the title */
  hint?: string;
  /** Optional SVG icon before the title */
  icon?: ReactNode;
}

const Chevron = memo(function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      className={`section-toggle-btn__chevron ${open ? 'section-toggle-btn__chevron--open' : ''}`}
      width="18"
      height="18"
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M6 8l4 4 4-4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
});

export const CollapsibleSection = memo(function CollapsibleSection(props: CollapsibleSectionProps) {
  const { title, children, sectionKey } = props;

  // Self-managed mode (main sections with localStorage)
  if (sectionKey) {
    return <SelfManagedSection {...props} sectionKey={sectionKey} />;
  }

  // Externally controlled mode (advanced tools)
  const { expanded = false, onToggle, hint, icon } = props;
  return (
    <div className={`collapsible-section ${expanded ? 'expanded' : ''}`}>
      <button type="button" className="section-toggle" onClick={onToggle} aria-expanded={expanded}>
        <Chevron open={expanded} />
        {icon && <span className="section-icon">{icon}</span>}
        <span className="section-title">{title}</span>
        {hint && <span className="section-hint">{hint}</span>}
      </button>
      <div className={`section-collapsible ${expanded ? 'section-collapsible--open' : ''}`}>
        <div className="section-collapsible__inner">
          <div className="section-content">{children}</div>
        </div>
      </div>
    </div>
  );
});

/** Internal component for self-managed sections */
const SelfManagedSection = memo(function SelfManagedSection({
  sectionKey,
  step,
  stepLabel,
  title,
  headerAction,
  guidance,
  className,
  children,
}: CollapsibleSectionProps & { sectionKey: string }) {
  const [isOpen, setIsOpen] = useState(() => {
    const persisted = getPersistedState();
    return persisted[sectionKey] !== false; // default open
  });

  const contentId = useId();

  const toggle = useCallback(() => {
    setIsOpen(prev => {
      const next = !prev;
      persistState(sectionKey, next);
      return next;
    });
  }, [sectionKey]);

  return (
    <section className={`${className ?? ''} ${!isOpen ? 'section--collapsed' : ''}`}>
      {step && stepLabel && (
        <div className="section-number" data-step={step}>
          {stepLabel}
        </div>
      )}
      <div className="section-header">
        <h2>{title}</h2>
        {headerAction}
        <button
          className="section-toggle-btn"
          onClick={toggle}
          aria-expanded={isOpen}
          aria-controls={contentId}
          aria-label={isOpen ? `Collapse ${title}` : `Expand ${title}`}
          type="button"
        >
          <Chevron open={isOpen} />
        </button>
      </div>

      <div
        id={contentId}
        className={`section-collapsible ${isOpen ? 'section-collapsible--open' : ''}`}
      >
        <div className="section-collapsible__inner">
          {guidance && <p className="section-guidance">{guidance}</p>}
          {children}
        </div>
      </div>
    </section>
  );
});
