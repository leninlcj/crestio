import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, ReactNode } from 'react';

// Single shared toast/banner system. Use the `useToast()` hook from anywhere
// in the tree:
//
//   const { show } = useToast();
//   show({ message: 'Saved.', tone: 'success' });
//
// Toasts auto-dismiss after 6s by default (configurable up to 12s for
// high-importance messages). Manual close is always available.

type Tone = 'success' | 'info' | 'warning' | 'error';

type ToastOptions = {
  message: string;
  tone?: Tone;
  durationMs?: number; // default 6000
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

export function useToast(): ToastApi {
  const v = useContext(Ctx);
  if (!v) throw new Error('useToast must be used inside <ToastProvider>.');
  return v;
}

// Optional: lets call sites that don't have a provider above them (legacy)
// still call show() without crashing — they'll just no-op.
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
    setToasts((prev) => [...prev, next]);
    const dur = Math.min(Math.max(opts.durationMs ?? 6000, 3000), 12000);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, dur);
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
      className="fixed top-3 inset-x-0 z-[100] flex flex-col items-center gap-2 px-4 pointer-events-none pt-safe"
    >
      {toasts.map((t) => (
        <ToastRow key={t.id} toast={t} onDismiss={() => onDismiss(t.id)} />
      ))}
    </div>
  );
}

function ToastRow({ toast, onDismiss }: { toast: ActiveToast; onDismiss: () => void }) {
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    const r = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(r);
  }, []);

  const tone = toast.tone ?? 'info';
  const palette: Record<Tone, string> = {
    success: 'bg-forest text-cream border-forest-ink',
    info: 'bg-surface text-ink border-rule shadow-lift',
    warning: 'bg-amber-soft text-amber-ink border-amber/40',
    error: 'bg-claret/10 text-claret border-claret/30',
  };

  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={[
        'pointer-events-auto w-full max-w-md flex items-start gap-3 px-4 py-3 rounded border transition-all duration-200 ease-out',
        palette[tone],
        entered ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-1',
      ].join(' ')}
    >
      <div className="text-sm flex-1 leading-relaxed">{toast.message}</div>
      {toast.action && (
        <button
          type="button"
          onClick={() => { toast.action!.onClick(); onDismiss(); }}
          className="text-xs underline underline-offset-2 shrink-0"
        >
          {toast.action.label}
        </button>
      )}
      <button
        type="button"
        onClick={onDismiss}
        className="shrink-0 -mr-1 -mt-0.5 p-1 opacity-70 hover:opacity-100 transition-opacity duration-200"
        aria-label="Dismiss"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M6 6l12 12M6 18L18 6" />
        </svg>
      </button>
    </div>
  );
}

export default ToastProvider;
