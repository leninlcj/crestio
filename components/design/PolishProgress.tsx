import { useEffect, useState } from 'react';

// Three thin progress bars representing "Reading notes", "Refining",
// "Formatting". Each fills sequentially over the call duration, capped to 4s.
// If the API responds faster, bars complete in proportion. If slower, the
// last bar holds at 90% until the response lands.
type Props = {
  // Approximate target duration in ms — used to pace the visual fills.
  targetMs?: number;
  // Whether the underlying call is still in flight.
  busy: boolean;
  // True once the response has landed; bars will jump to 100%.
  done: boolean;
  className?: string;
};

const STEPS = ['Reading notes', 'Refining', 'Formatting'] as const;

export function PolishProgress({ targetMs = 4000, busy, done, className }: Props) {
  const [start, setStart] = useState<number | null>(null);
  const [, tick] = useState(0);

  useEffect(() => {
    if (busy && !start) setStart(Date.now());
    if (!busy) setStart(null);
  }, [busy, start]);

  useEffect(() => {
    if (!busy) return;
    const id = setInterval(() => tick((n) => n + 1), 60);
    return () => clearInterval(id);
  }, [busy]);

  function pctFor(idx: number): number {
    if (done) return 100;
    if (!busy || start == null) return 0;
    const elapsed = Date.now() - start;
    const perStep = targetMs / STEPS.length;
    const stepElapsed = elapsed - idx * perStep;
    if (stepElapsed <= 0) return 0;
    if (idx < STEPS.length - 1) {
      // Earlier bars complete fully when their slot ends.
      return Math.min(100, (stepElapsed / perStep) * 100);
    }
    // Last bar — soft-cap at 90% until done.
    const raw = Math.min(90, (stepElapsed / perStep) * 90);
    return Math.max(0, raw);
  }

  return (
    <div className={['space-y-2', className ?? ''].join(' ')}>
      {STEPS.map((label, idx) => {
        const pct = pctFor(idx);
        return (
          <div key={label} className="flex items-center gap-2">
            <span
              className={[
                'text-2xs uppercase tracking-widest font-medium w-24 shrink-0 transition-colors duration-200',
                pct >= 100 ? 'text-forest' : pct > 0 ? 'text-ink' : 'text-ink-soft',
              ].join(' ')}
            >
              {label}
            </span>
            <div className="flex-1 h-0.5 bg-ruleSoft overflow-hidden rounded">
              <div
                className="h-full bg-forest transition-[width] duration-200 ease-out"
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="text-2xs text-ink-soft num tabular w-8 text-right">
              {Math.round(pct)}%
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default PolishProgress;
