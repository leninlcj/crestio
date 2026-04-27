import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, ReactNode } from 'react';

// Single shared toast/banner system. Use the `useToast()` hook from anywhere
// in the tree:
//
//   const { show } = useToast();
//   show({ message: 'Saved.', tone: 'success' });
//
// Behavior (phase 3):
// - Stack of up to 3 visible at once. New toasts push older ones up.
// - Auto-dismiss after 4s by default. Hover pauses the timer.
// - Click anywhere on the toast to dismiss.
// - Errors are sticky — they require explicit dismissal.
// - Bottom-center on mobile, bottom-right on desktop.

type Tone = 'success' | 'info' | 'warning' | 'error';

type ToastOptions = {
  message: string;
  tone?: Tone;
  durationMs?: number;
  action?: {
    label: string;
    onClick: () => void;
  };
};

type ActiveToast = ToastOptions & { id: number };

type ToastApi = {
  show: (opts: ToastOptions) => void;
  dismiss: (id?: number) => void;
};

const Ctx = createContext<ToastApi | null>(null);
const MAX_VISIBLE = 3;
const DEFAULT_MS = 4000;

export function useToast(): ToastApi {
  const v = useContext(Ctx);
  if (!v) throw new Error('useToast must be used inside <ToastProvider>.');
  return v;
}

export function useOptionalToast(): ToastApi {
  const v = useContext(Ctx);
  return v ?? { show: () => {}, dismiss: () => {} };
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ActiveToast[]>([]);
  const idRef = useRef(0);

  const dismiss = useCallback((id?: number) => {
    setToasts((prev) => (id == null ? [] : prev.filter((t) => t.id !== id)));
  }, []);

  const show = useCallback((opts: ToastOptions) => {
    const id = ++idRef.current;
    const next: ActiveToast = { ...opts, id };
    setToasts((prev) => {
      const merged = [...prev, next];
      // Drop the oldest non-error when at the cap so newer messages always show.
      while (merged.length > MAX_VISIBLE) {
        const oldestIdx = merged.findIndex((t) => t.tone !== 'error');
        if (oldestIdx === -1) break;
        merged.splice(oldestIdx, 1);
      }
      return merged;
    });
  }, []);

  const api = useMemo<ToastApi>(() => ({ show, dismiss }), [show, dismiss]);

  return (
    <Ctx.Provider value={api}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={(id) => dismiss(id)} />
    </Ctx.Provider>
  );
}

function ToastViewport({
  toasts,
  onDismiss,
}: {
  toasts: ActiveToast[];
  onDismiss: (id: number) => void;
}) {
  return (
    <div
      aria-live="polite"
      aria-atomic="true"
      className="fixed bottom-3 inset-x-0 md:inset-x-auto md:right-4 z-[100] flex flex-col items-center md:items-end gap-2 px-4 md:px-0 pointer-events-none pb-safe"
    >
      {toasts.map((t) => (
        <ToastRow key={t.id} toast={t} onDismiss={() => onDismiss(t.id)} />
      ))}
    </div>
  );
}

function ToastRow({ toast, onDismiss }: { toast: ActiveToast; onDismiss: () => void }) {
  const [entered, setEntered] = useState(false);
  const [exiting, setExiting] = useState(false);
  const [paused, setPaused] = useState(false);
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;

  useEffect(() => {
    const r = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(r);
  }, []);

  // Auto-dismiss timer (errors are sticky).
  useEffect(() => {
    if (toast.tone === 'error') return;
    if (paused) return;
    const dur = toast.durationMs ?? DEFAULT_MS;
    const handle = window.setTimeout(() => {
      setExiting(true);
      window.setTimeout(() => dismissRef.current(), 150);
    }, dur);
    return () => window.clearTimeout(handle);
  }, [toast.tone, toast.durationMs, paused]);

  const tone = toast.tone ?? 'info';
  const palette: Record<Tone, string> = {
    success: 'bg-success-soft text-success-ink border-success/30',
    info: 'bg-surface text-ink border-rule shadow-lift',
    warning: 'bg-amber-soft text-amber-ink border-amber/40',
    error: 'bg-claret/10 text-claret border-claret/30',
  };

  const Icon = () => {
    if (tone === 'success') return <PathSvg d="M5 13l4 4L19 7"/>;
    if (tone === 'warning') return <PathSvg d="M12 9v4M12 17h.01M10.3 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.4 0z"/>;
    if (tone === 'error') return <PathSvg d="M12 9v4M12 17h.01M3 12a9 9 0 1 1 18 0a9 9 0 0 1-18 0z"/>;
    return <PathSvg d="M12 8v4M12 16h.01M3 12a9 9 0 1 1 18 0a9 9 0 0 1-18 0z"/>;
  };

  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onClick={() => { if (!toast.action) onDismiss(); }}
      className={[
        'pointer-events-auto w-full max-w-sm flex items-start gap-3 px-3 py-2.5 rounded border cursor-pointer',
        'transition-all duration-200 ease-out',
        palette[tone],
        entered && !exiting ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2',
      ].join(' ')}
    >
      <span className="shrink-0 mt-0.5">
        <Icon />
      </span>
      <div className="text-sm flex-1 leading-snug">{toast.message}</div>
      {toast.action && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); toast.action!.onClick(); onDismiss(); }}
          className="text-xs font-medium underline underline-offset-2 shrink-0"
        >
          {toast.action.label}
        </button>
      )}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onDismiss(); }}
        className="shrink-0 -mr-1 -mt-0.5 p-1 opacity-70 hover:opacity-100 transition-opacity duration-100"
        aria-label="Dismiss"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M6 6l12 12M6 18L18 6" />
        </svg>
      </button>
    </div>
  );
}

function PathSvg({ d }: { d: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

export default ToastProvider;
