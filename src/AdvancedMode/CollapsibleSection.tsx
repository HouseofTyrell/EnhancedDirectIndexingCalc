import { memo, ReactNode } from 'react';

interface CollapsibleSectionProps {
  title: string;
  expanded: boolean;
  onToggle: () => void;
  children: ReactNode;
  hint?: string;
}

export const CollapsibleSection = memo(function CollapsibleSection({
  title,
  expanded,
  onToggle,
  children,
  hint,
}: CollapsibleSectionProps) {
  return (
    <div className={`collapsible-section ${expanded ? 'expanded' : ''}`}>
      <button type="button" className="section-toggle" onClick={onToggle} aria-expanded={expanded}>
        <span className="toggle-icon">{expanded ? '▼' : '▶'}</span>
        <span className="section-title">{title}</span>
        {hint && <span className="section-hint">{hint}</span>}
      </button>
      {expanded && <div className="section-content">{children}</div>}
    </div>
  );
});
