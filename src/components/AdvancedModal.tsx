import { ReactNode } from 'react';

interface AdvancedModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
}

export function AdvancedModal({ isOpen, onClose, children }: AdvancedModalProps) {
  return (
    <>
      {/* Overlay - clicks close the panel */}
      <div
        className={`slideout-overlay ${isOpen ? 'open' : ''}`}
        onClick={onClose}
      />

      {/* Slide-out panel from right */}
      <div className={`slideout-panel ${isOpen ? 'open' : ''}`}>
        <div className="slideout-panel__header">
          <h2>Advanced Settings</h2>
          <button
            className="slideout-panel__close"
            onClick={onClose}
            aria-label="Close advanced settings"
          >
            ×
          </button>
        </div>
        <div className="slideout-panel__content">
          {children}
        </div>
      </div>
    </>
  );
}
