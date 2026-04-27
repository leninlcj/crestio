import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { SHORTCUTS, KeyBinding } from '../../lib/keyboard';

// Press `?` anywhere to open. Press Esc or click the backdrop to close.
// Mounts a single instance from _app.tsx; nothing else needs to know.
export function KeyboardShortcutsOverlay() {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const editable =
        target && (
          target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable
        );
      if (!open && !editable && e.key === '?') {
        e.preventDefault();
        setOpen(true);
        return;
      }
      if (open && e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
      }
    }
    window.addEventListener('keydown', onKey);
    const onOpen = () => setOpen(true);
    window.addEventListener('crestio:open-shortcuts', onOpen as EventListener);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('crestio:open-shortcuts', onOpen as EventListener);
    };
  }, [open]);

  if (!mounted || !open) return null;

  const groups = groupBy(SHORTCUTS, (s) => s.group);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
      className="fixed inset-0 z-[80] bg-ink/40 flex items-center justify-center p-4 animate-fade-in"
      onClick={() => setOpen(false)}
    >
      <div
        className="relative bg-surface border border-rule rounded-lg shadow-lift w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between px-5 py-3 border-b border-rule">
          <div>
            <h2 className="font-display text-lg tracking-tighter text-ink">Keyboard shortcuts</h2>
            <p className="text-xs text-ink-muted mt-0.5">Press <KeyHint hint="?" /> anywhere to open. Esc to close.</p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="btn-ghost text-xs"
            aria-label="Close"
          >
            ×
          </button>
        </header>
        <div className="overflow-y-auto px-5 py-4 grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
          {Object.entries(groups).map(([group, items]) => (
            <section key={group}>
              <h3 className="text-2xs uppercase tracking-widest text-ink-soft font-medium mb-2">
                {group}
              </h3>
              <ul className="space-y-1.5">
                {items.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-3">
                    <span className="text-xs text-ink truncate">{s.label}</span>
                    <KeyHint hint={s.hint} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function KeyHint({ hint }: { hint: string }) {
  const tokens = hint.split(/\s+/);
  return (
    <span className="inline-flex items-center gap-1 shrink-0">
      {tokens.map((t, i) => (
        <kbd
          key={i}
          className="font-mono text-2xs px-1.5 py-0.5 border border-rule rounded bg-surface text-ink-muted"
        >
          {t}
        </kbd>
      ))}
    </span>
  );
}

function groupBy<T, K extends string>(arr: T[], key: (t: T) => K): Record<K, T[]> {
  return arr.reduce((acc, x) => {
    const k = key(x);
    (acc[k] ||= []).push(x);
    return acc;
  }, {} as Record<K, T[]>);
}

export default KeyboardShortcutsOverlay;
