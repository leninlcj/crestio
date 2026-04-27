import { useEffect, useState } from 'react';

// A subtle horizontal "now" line for use inside a timeline list.
// The parent positions this between rows whose `scheduled_at` straddles
// the current minute. We update once per minute.
export function useNowMinute(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

export function NowLine({ label = 'Now' }: { label?: string }) {
  return (
    <div className="relative my-1 flex items-center gap-2 px-3" aria-hidden="true">
      <span className="text-2xs uppercase tracking-widest text-forest/80 font-medium tabular w-16 shrink-0">
        {label}
      </span>
      <span className="flex-1 h-px bg-forest/70" />
      <span className="w-1.5 h-1.5 rounded-full bg-forest" />
    </div>
  );
}

export default NowLine;
