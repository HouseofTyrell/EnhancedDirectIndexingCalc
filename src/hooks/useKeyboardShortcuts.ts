import { useEffect } from 'react';

export interface KeyboardShortcutHandlers {
  onPrint?: () => void;
  onExport?: () => void;
  onShowHelp?: () => void;
  onEscape?: () => void;
  onPin?: () => void;
}

/**
 * Hook to handle keyboard shortcuts
 * Detects platform (Mac vs Windows/Linux) for proper modifier key
 */
export function useKeyboardShortcuts(handlers: KeyboardShortcutHandlers) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Check for modifier key (Cmd on Mac, Ctrl on Windows/Linux)
      const modifierKey = e.metaKey || e.ctrlKey;

      // Handle Escape key (no modifier needed)
      if (e.key === 'Escape' && handlers.onEscape) {
        handlers.onEscape();
        return;
      }

      // Handle ? key for help (no modifier needed)
      if (e.key === '?' && handlers.onShowHelp) {
        e.preventDefault();
        handlers.onShowHelp();
        return;
      }

      // Handle shortcuts with modifier keys
      if (modifierKey) {
        switch (e.key.toLowerCase()) {
          case 'p':
            if (handlers.onPrint) {
              e.preventDefault(); // Prevent browser print dialog
              handlers.onPrint();
            }
            break;

          case 'e':
            if (handlers.onExport) {
              e.preventDefault();
              handlers.onExport();
            }
            break;

          case 'b':
            if (handlers.onPin) {
              e.preventDefault();
              handlers.onPin();
            }
            break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handlers]);
}

/**
 * Utility to get the correct modifier key name for the current platform
 */
export function getModifierKey(): string {
  return navigator.platform.includes('Mac') ? 'Cmd' : 'Ctrl';
}

/**
 * Utility to format keyboard shortcut for display
 */
export function formatShortcut(key: string, useModifier = true): string {
  if (!useModifier) return key;
  const modifier = getModifierKey();
  return `${modifier}+${key}`;
}
