import { ReactNode, useEffect } from 'react';

type Item = {
  id: string;
  label: string;
  sublabel?: string;
  warning?: string;
};

type Props = {
  open: boolean;
  title: string;
  summary: string;
  items: Item[];
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
  destructive?: boolean;
  children?: ReactNode;
};

// Bottom drawer used to confirm bulk operations. Slides up from the bottom of
// the viewport, lists every affected item, surfaces per-item warnings, and
// offers a single confirm button. Esc closes, Enter confirms.
export function ConfirmDrawer({
  open, title, summary, items,
  confirmLabel, cancelLabel = 'Cancel',
  onConfirm, onCancel, busy, destructive, children,
}: Props) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
      if (e.key === 'Enter' && !busy) { e.preventDefault(); onConfirm(); }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, busy, onCancel, onConfirm]);

  if (!open) return null;

  const skipCount = items.filter((i) => i.warning).length;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-[80] bg-ink/30 animate-fade-in flex items-end"
      onClick={onCancel}
    >
      <div
        className="w-full bg-surface border-t border-rule rounded-t-xl shadow-lift animate-slide-up pb-safe max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
        style={{ minHeight: 200 }}
      >
        <header className="px-5 py-4 border-b border-rule flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-[16px] font-display font-semibold tracking-tightest text-ink">{title}</h2>
            <p className="text-sm text-ink-muted mt-0.5">{summary}</p>
            {skipCount > 0 && (
              <p className="text-xs text-amber-ink mt-1">
                {skipCount} {skipCount === 1 ? 'item' : 'items'} will be skipped — see warnings below.
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Close"
            className="text-ink-soft hover:text-ink p-1 -mr-1 -mt-1"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M6 6l12 12M6 18L18 6" />
            </svg>
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-3">
          {children}
          <ul className="divide-y divide-ruleSoft">
            {items.map((it) => (
              <li key={it.id} className="py-1.5 flex items-center gap-3" style={{ minHeight: 28 }}>
                <span className="flex-1 min-w-0 truncate text-sm text-ink">{it.label}</span>
                {it.sublabel && (
                  <span className="text-xs text-ink-muted shrink-0">{it.sublabel}</span>
                )}
                {it.warning && (
                  <span className="text-2xs text-amber-ink shrink-0 flex items-center gap-1">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 9v4M12 17h.01M10.3 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.4 0z"/>
                    </svg>
                    {it.warning}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>

        <footer className="px-5 py-3 border-t border-rule flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="btn-ghost text-sm"
            style={{ height: 36, minHeight: 36 }}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy || items.length === 0}
            className={destructive ? 'btn-danger text-sm bg-claret text-cream hover:bg-claret hover:opacity-90' : 'btn-primary text-sm'}
            style={{ height: 36, minHeight: 36 }}
          >
            {busy ? 'Working…' : (confirmLabel ?? `Confirm (${items.length} ${items.length === 1 ? 'item' : 'items'})`)}
          </button>
        </footer>
      </div>
    </div>
  );
}

export default ConfirmDrawer;
