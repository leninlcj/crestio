import { useEffect, useState } from 'react';

type Props = {
  label: string;
  holdMs: number;
  startedAt: number;
  state: 'pending' | 'committed' | 'undone';
  onUndo: () => void;
  onDismiss: () => void;
  undoLabel?: string;
};

// Universal undo toast. Sits at the bottom of the viewport with a draining
// progress ring. Five-second window by default; user can click Undo at any
// point during the hold. After commit (state changes to committed), the
// toast slides out gracefully.
export function UndoToast({
  label, holdMs, startedAt, state, onUndo, onDismiss, undoLabel = 'Undo',
}: Props) {
  const [, forceTick] = useState(0);
  useEffect(() => {
    if (state !== 'pending') return;
    const id = setInterval(() => forceTick((n) => n + 1), 50);
    return () => clearInterval(id);
  }, [state]);

  const elapsed = Math.max(0, Math.min(holdMs, Date.now() - startedAt));
  const remainingMs = Math.max(0, holdMs - elapsed);
  const remainingSec = Math.ceil(remainingMs / 1000);
  const pct = state === 'pending' ? Math.max(0, 1 - elapsed / holdMs) : 0;

  // SVG ring math.
  const SIZE = 16;
  const STROKE = 2;
  const R = (SIZE - STROKE) / 2;
  const C = 2 * Math.PI * R;
  const dashOffset = C * (1 - pct);

  const exiting = state !== 'pending';
  const exitingClass = exiting ? 'opacity-0 translate-y-2' : 'opacity-100 translate-y-0';

  return (
    <div
      role="status"
      className={[
        'pointer-events-auto flex items-center gap-3 px-3 py-2 bg-ink text-cream rounded-full shadow-lift text-xs',
        'transition-all duration-200 ease-out',
        exitingClass,
      ].join(' ')}
      style={{ minWidth: 240, maxWidth: 'min(560px, 92vw)' }}
    >
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden="true" className="shrink-0">
        <circle
          cx={SIZE / 2} cy={SIZE / 2} r={R}
          fill="none" stroke="currentColor" strokeOpacity={0.25} strokeWidth={STROKE}
        />
        <circle
          cx={SIZE / 2} cy={SIZE / 2} r={R}
          fill="none" stroke="currentColor" strokeWidth={STROKE}
          strokeDasharray={C} strokeDashoffset={dashOffset}
          strokeLinecap="round"
          transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
          style={{ transition: 'stroke-dashoffset 60ms linear' }}
        />
      </svg>
      <span className="flex-1 truncate">
        {label}
        {state === 'pending' && remainingSec > 0 && (
          <span className="ml-1.5 text-cream/60 num tabular">{remainingSec}s</span>
        )}
      </span>
      {state === 'pending' && (
        <button
          type="button"
          onClick={onUndo}
          className="text-xs font-medium underline underline-offset-2 hover:text-cream/90 transition-colors duration-100 shrink-0"
        >
          {undoLabel}
        </button>
      )}
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="opacity-50 hover:opacity-100 transition-opacity duration-100 shrink-0"
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <path d="M6 6l12 12M6 18L18 6" />
        </svg>
      </button>
    </div>
  );
}

export default UndoToast;
