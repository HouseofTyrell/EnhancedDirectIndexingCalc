import { ReactNode, useState, useCallback, useRef, useEffect } from 'react';

interface AdvancedModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
}

const MIN_WIDTH = 380;
const MAX_WIDTH = 900;
const DEFAULT_WIDTH = 420;

export function AdvancedModal({ isOpen, onClose, children }: AdvancedModalProps) {
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [isResizing, setIsResizing] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = window.innerWidth - e.clientX;
      setWidth(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, newWidth)));
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'ew-resize';
    document.body.style.userSelect = 'none';

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing]);

  return (
    <>
      {/* Overlay - clicks close the panel */}
      <div
        className={`slideout-overlay ${isOpen ? 'open' : ''}`}
        onClick={onClose}
      />

      {/* Slide-out panel from right */}
      <div
        ref={panelRef}
        className={`slideout-panel ${isOpen ? 'open' : ''} ${isResizing ? 'resizing' : ''}`}
        style={{ width: `${width}px` }}
      >
        {/* Resize handle */}
        <div
          className="slideout-panel__resize-handle"
          onMouseDown={handleMouseDown}
          title="Drag to resize"
        />
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
