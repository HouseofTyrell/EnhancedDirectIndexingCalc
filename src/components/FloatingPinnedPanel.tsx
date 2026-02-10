import { ReactNode, useState } from 'react';

interface PinnedElement {
  id: string;
  label: string;
  content: ReactNode;
}

interface FloatingPinnedPanelProps {
  elements: PinnedElement[];
  onUnpin: (id: string) => void;
  onUnpinAll: () => void;
}

/**
 * Fixed-position floating panel at bottom-right that shows pinned UI elements.
 * Allows users to keep charts/results visible while editing inputs.
 */
export function FloatingPinnedPanel({ elements, onUnpin, onUnpinAll }: FloatingPinnedPanelProps) {
  const [collapsed, setCollapsed] = useState(false);

  if (elements.length === 0) return null;

  return (
    <div className={`floating-panel${collapsed ? ' floating-panel--collapsed' : ''}`}>
      <div className="floating-panel__header">
        <button
          className="floating-panel__toggle"
          onClick={() => setCollapsed(c => !c)}
          aria-label={collapsed ? 'Expand pinned panel' : 'Collapse pinned panel'}
        >
          {collapsed ? '\u25B2' : '\u25BC'}
        </button>
        <span className="floating-panel__title">
          Pinned ({elements.length})
        </span>
        <button
          className="floating-panel__close-all"
          onClick={onUnpinAll}
          title="Unpin all"
        >
          Clear all
        </button>
      </div>

      {!collapsed && (
        <div className="floating-panel__body">
          {elements.map(el => (
            <div key={el.id} className="floating-panel__item">
              <div className="floating-panel__item-header">
                <span className="floating-panel__item-label">{el.label}</span>
                <button
                  className="floating-panel__item-close"
                  onClick={() => onUnpin(el.id)}
                  aria-label={`Unpin ${el.label}`}
                  title="Unpin"
                >
                  &times;
                </button>
              </div>
              <div className="floating-panel__item-content">
                {el.content}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
