import { useCallback, useRef, useState } from 'react';
import { toggleBrandRevealed } from '../branding';

/** Rapid clicks required (within WINDOW_MS of each other) to flip the toggle. */
const REQUIRED_CLICKS = 5;
const WINDOW_MS = 1500;
const FLASH_MS = 1800;

/**
 * Hidden reveal toggle: N rapid clicks on the bound element flip real-name
 * branding on/off. Deliberately undiscoverable — no cursor, tooltip, or ARIA
 * affordance — so public users never trip it. Returns an `onClick` to spread
 * onto the target element plus a transient `flash` (true = revealed, false =
 * anonymized, null = idle) for brief confirmation feedback.
 */
export function useSecretReveal() {
  const count = useRef(0);
  const last = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [flash, setFlash] = useState<boolean | null>(null);

  const onClick = useCallback(() => {
    const now = Date.now();
    if (now - last.current > WINDOW_MS) {
      count.current = 0;
    }
    last.current = now;
    count.current += 1;

    if (count.current >= REQUIRED_CLICKS) {
      count.current = 0;
      const revealed = toggleBrandRevealed();
      setFlash(revealed);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setFlash(null), FLASH_MS);
    }
  }, []);

  return { onClick, flash };
}
