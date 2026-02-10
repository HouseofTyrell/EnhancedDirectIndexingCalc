import { useRef, useState, useEffect } from 'react';

/**
 * Hook that tracks the delta (change) between the current and previous value.
 * Returns the delta for a brief period (2.5s) after each change, then null.
 *
 * Useful for showing temporary "+$12,450" or "-2.3%" badges when values update.
 */
export function useDelta(value: number): number | null {
  const prevRef = useRef(value);
  const [delta, setDelta] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (prevRef.current !== value) {
      const d = value - prevRef.current;
      prevRef.current = value;

      // Only show meaningful deltas (avoid floating point noise)
      if (Math.abs(d) > 0.001) {
        setDelta(d);
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => setDelta(null), 2500);
      }
    }
  }, [value]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return delta;
}
