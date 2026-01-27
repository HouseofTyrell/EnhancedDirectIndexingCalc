import { useState, useEffect, useRef } from 'react';

/**
 * Hook to track scroll position and control sticky header expansion.
 * Uses IntersectionObserver for performance (no scroll listeners).
 *
 * @param sentinelId - ID of the sentinel element to observe (placed after inputs)
 * @returns { isExpanded } - true when user has scrolled past the sentinel
 */
export function useScrollHeader(sentinelId = 'scroll-sentinel') {
  const [isExpanded, setIsExpanded] = useState(false);
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    observerRef.current = new IntersectionObserver(
      ([entry]) => {
        // Expand when sentinel is NOT intersecting (scrolled past it)
        setIsExpanded(!entry.isIntersecting);
      },
      {
        threshold: 0,
        // Use rootMargin to trigger slightly before sentinel leaves viewport
        rootMargin: '-100px 0px 0px 0px',
      }
    );

    const sentinel = document.getElementById(sentinelId);
    if (sentinel) {
      observerRef.current.observe(sentinel);
    }

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [sentinelId]);

  return { isExpanded };
}
