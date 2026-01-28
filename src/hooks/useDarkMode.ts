import { useState, useEffect, useCallback } from 'react';

type Theme = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'theme-preference';

/**
 * Hook for managing dark mode with localStorage persistence
 * Supports explicit light/dark modes and system preference
 */
export function useDarkMode() {
  // Initialize from localStorage or default to 'system'
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof window === 'undefined') return 'system';
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark' || stored === 'system') {
      return stored;
    }
    return 'system';
  });

  // Get the resolved theme (what's actually displayed)
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window === 'undefined') return 'light';
    if (theme === 'system') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return theme;
  });

  // Apply theme to document
  useEffect(() => {
    const root = document.documentElement;

    if (theme === 'system') {
      // Remove data-theme to let CSS media queries handle it
      root.removeAttribute('data-theme');
      // Update resolved theme based on system preference
      const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      setResolvedTheme(isDark ? 'dark' : 'light');
    } else {
      root.setAttribute('data-theme', theme);
      setResolvedTheme(theme);
    }

    // Store preference
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  // Listen for system preference changes
  useEffect(() => {
    if (theme !== 'system') return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const handleChange = (e: MediaQueryListEvent) => {
      setResolvedTheme(e.matches ? 'dark' : 'light');
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [theme]);

  // Toggle between light and dark (ignoring system)
  const toggle = useCallback(() => {
    setThemeState(prev => {
      if (prev === 'system') {
        // If system, toggle based on current resolved theme
        return resolvedTheme === 'dark' ? 'light' : 'dark';
      }
      return prev === 'dark' ? 'light' : 'dark';
    });
  }, [resolvedTheme]);

  // Set a specific theme
  const setTheme = useCallback((newTheme: Theme) => {
    setThemeState(newTheme);
  }, []);

  return {
    theme,           // The stored preference ('light', 'dark', or 'system')
    resolvedTheme,   // The actual theme being displayed ('light' or 'dark')
    isDark: resolvedTheme === 'dark',
    toggle,          // Toggle between light and dark
    setTheme,        // Set a specific theme
  };
}
