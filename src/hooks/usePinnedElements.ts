import { useState, useEffect, useCallback } from 'react';
import { STORAGE_KEYS } from '../constants/storageKeys';

const STORAGE_KEY = STORAGE_KEYS.PINNED_ELEMENTS;

/**
 * Hook to manage which UI elements are pinned to the floating panel.
 * Persists to localStorage so pinned elements survive refresh.
 */
export function usePinnedElements() {
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed: unknown = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.every(v => typeof v === 'string')) {
          return new Set(parsed as string[]);
        }
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch (e) {
      console.warn('Failed to load pinned elements:', e);
    }
    return new Set<string>();
  });

  useEffect(() => {
    try {
      if (pinnedIds.size > 0) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify([...pinnedIds]));
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch (e) {
      console.warn('Failed to save pinned elements:', e);
    }
  }, [pinnedIds]);

  const togglePin = useCallback((id: string) => {
    setPinnedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const unpin = useCallback((id: string) => {
    setPinnedIds(prev => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const unpinAll = useCallback(() => {
    setPinnedIds(new Set());
  }, []);

  const isPinned = useCallback((id: string) => pinnedIds.has(id), [pinnedIds]);

  return {
    pinnedIds,
    hasPinned: pinnedIds.size > 0,
    togglePin,
    unpin,
    unpinAll,
    isPinned,
  };
}
