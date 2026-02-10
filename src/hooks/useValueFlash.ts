import { useRef, useEffect, useCallback } from 'react';

/**
 * Hook that adds a brief CSS flash animation when a numeric value changes.
 * Returns a ref callback to attach to the element that should flash.
 *
 * The element will receive the `value-changed` CSS class briefly on change,
 * triggering the `value-flash` keyframe animation.
 */
export function useValueFlash(value: number | undefined) {
  const elRef = useRef<HTMLSpanElement | null>(null);
  const prevRef = useRef(value);

  useEffect(() => {
    if (prevRef.current !== value && elRef.current) {
      const el = elRef.current;
      el.classList.remove('value-changed');
      // Force reflow so re-adding the class restarts the animation
      void el.offsetWidth;
      el.classList.add('value-changed');
    }
    prevRef.current = value;
  }, [value]);

  const setRef = useCallback((node: HTMLSpanElement | null) => {
    elRef.current = node;
  }, []);

  return setRef;
}
