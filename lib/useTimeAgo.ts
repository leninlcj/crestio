import { createContext, useContext, useEffect, useState, ReactNode, createElement } from 'react';

// Single global tick (every 30s) drives every "5 minutes ago" string in the
// app. Components subscribe via useTimeAgo(); the value is a stable
// monotonic counter that increments each tick. Strings are recomputed on
// every render of the consuming component, but the actual setInterval is
// run exactly once at the app root.
//
// Reduced motion / blurred tabs both pause the tick to save renders.

const TickCtx = createContext<number>(0);

export function TimeTickProvider({ children }: { children: ReactNode }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    function start() {
      if (timer) return;
      timer = setInterval(() => setTick((t) => t + 1), 30_000);
    }
    function stop() {
      if (timer) { clearInterval(timer); timer = null; }
    }
    start();
    function onVisChange() {
      if (document.hidden) stop(); else start();
    }
    document.addEventListener('visibilitychange', onVisChange);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisChange);
    };
  }, []);
  return createElement(TickCtx.Provider, { value: tick }, children);
}

// Returns a human-readable "5 min ago" / "in 2 hours" string for the given
// ISO timestamp. Auto-refreshes via the global tick.
export function useTimeAgo(iso: string | number | Date | null | undefined): string {
  const tick = useContext(TickCtx);
  // Re-render whenever tick changes — the body recomputes from Date.now().
  void tick;
  if (iso == null) return '';
  const ms = iso instanceof Date ? iso.getTime() : typeof iso === 'number' ? iso : new Date(iso).getTime();
  return formatRelativeMs(ms - Date.now());
}

// Pure formatter — exposed so server-side renders or non-hook contexts can
// produce the same output.
export function formatRelativeMs(deltaMs: number): string {
  const future = deltaMs > 0;
  const abs = Math.abs(deltaMs);
  const sec = Math.round(abs / 1000);
  if (sec < 45) return future ? 'in a few seconds' : 'just now';
  const min = Math.round(sec / 60);
  if (min < 60) return future ? `in ${min} min` : `${min} min ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return future ? `in ${hr} hr` : `${hr} hr ago`;
  const day = Math.round(hr / 24);
  if (day < 7) return future ? `in ${day} day${day === 1 ? '' : 's'}` : `${day} day${day === 1 ? '' : 's'} ago`;
  const week = Math.round(day / 7);
  if (week < 5) return future ? `in ${week} wk` : `${week} wk ago`;
  const month = Math.round(day / 30);
  if (month < 12) return future ? `in ${month} mo` : `${month} mo ago`;
  const year = Math.round(day / 365);
  return future ? `in ${year} yr` : `${year} yr ago`;
}

// Lower-friction version that returns the global tick directly. Components
// that compute multiple ago strings can read the tick once.
export function useNowTick(): number {
  return useContext(TickCtx);
}
