import { getModifierKey } from '../hooks/useKeyboardShortcuts';
import './KeyboardShortcutsHelp.css';

interface KeyboardShortcutsHelpProps {
  isOpen: boolean;
  onClose: () => void;
}

export function KeyboardShortcutsHelp({ isOpen, onClose }: KeyboardShortcutsHelpProps) {
  if (!isOpen) return null;

  const modifier = getModifierKey();

  const shortcuts = [
    {
      category: 'Actions',
      items: [
        { keys: [`${modifier}`, 'P'], description: 'Print or save as PDF' },
        { keys: [`${modifier}`, 'E'], description: 'Export results to Excel' },
        { keys: [`${modifier}`, 'B'], description: 'Pin/unpin current scenario' },
      ],
    },
    {
      category: 'Help & Navigation',
      items: [
        { keys: ['?'], description: 'Show this keyboard shortcuts help' },
        { keys: ['Esc'], description: 'Close modals and dialogs' },
      ],
    },
  ];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content keyboard-shortcuts-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Keyboard Shortcuts</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="modal-body">
          {shortcuts.map(section => (
            <div key={section.category} className="shortcuts-section">
              <h3>{section.category}</h3>
              <div className="shortcuts-list">
                {section.items.map((shortcut, idx) => (
                  <div key={idx} className="shortcut-item">
                    <div className="shortcut-keys">
                      {shortcut.keys.map((key, i) => (
                        <span key={i}>
                          <kbd className="key">{key}</kbd>
                          {i < shortcut.keys.length - 1 && <span className="key-separator">+</span>}
                        </span>
                      ))}
                    </div>
                    <div className="shortcut-description">{shortcut.description}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          <div className="shortcuts-footer">
            <p className="shortcuts-hint">
              Press <kbd className="key">?</kbd> anytime to show this help
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
