import { memo, ReactNode } from 'react';

/**
 * Props for the CollapsibleSection component.
 * A togglable section with a header button that expands/collapses its children.
 */
interface CollapsibleSectionProps {
  /** Section heading text displayed in the toggle button */
  title: string;
  /** Whether the section content is currently visible */
  expanded: boolean;
  /** Callback fired when the toggle button is clicked */
  onToggle: () => void;
  /** Content rendered inside the section when expanded */
  children: ReactNode;
  /** Optional hint text displayed next to the title in the toggle button */
  hint?: string;
  /** Optional SVG icon rendered before the title */
  icon?: ReactNode;
}

export const CollapsibleSection = memo(function CollapsibleSection({
  title,
  expanded,
  onToggle,
  children,
  hint,
  icon,
}: CollapsibleSectionProps) {
  return (
    <div className={`collapsible-section ${expanded ? 'expanded' : ''}`}>
      <button type="button" className="section-toggle" onClick={onToggle} aria-expanded={expanded}>
        <span className="toggle-icon">{expanded ? '▼' : '▶'}</span>
        {icon && <span className="section-icon">{icon}</span>}
        <span className="section-title">{title}</span>
        {hint && <span className="section-hint">{hint}</span>}
      </button>
      {expanded && <div className="section-content">{children}</div>}
    </div>
  );
});
