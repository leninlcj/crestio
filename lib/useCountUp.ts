import { useEffect, useRef, useState } from 'react';

// Counts from previous to next over `duration` ms with cubic ease-out.
// Returns the live integer for plain count rendering. Used on stat cards
// so values feel "earned" rather than snapping in.
//
// Respects prefers-reduced-motion: returns the final value immediately when
// the user has reduced motion enabled.
export function useCountUp(target: number, duration = 400): number {
  const [value, setValue] = useState(target);
  const prevRef = useRef(target);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (prevRef.current === target) return;

    const reduced = typeof window !== 'undefined'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced || duration <= 0) {
      prevRef.current = target;
      setValue(target);
      return;
    }

    const start = performance.now();
    const from = prevRef.current;
    const delta = target - from;

    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
      const current = from + delta * eased;
      setValue(Number.isInteger(target) ? Math.round(current) : current);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        prevRef.current = target;
      }
    };
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [target, duration]);

  return value;
}

export default useCountUp;
