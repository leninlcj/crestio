import { useEffect, useRef, useState } from 'react';

// Replaces the bare "+" icon in the top bar with a dropdown that lets the user
// jump straight to a specific create type via QuickCreate.
//
// Click the icon → menu opens.  Click a row → dispatches
// crestio:open-quick-create with { type } so QuickCreate selects that type.

type Choice = { type: string; label: string; shortcut?: string };

const CHOICES: Choice[] = [
  { type: 'session',         label: 'New session',         shortcut: 'N' },
  { type: 'student',         label: 'New student' },
  { type: 'household',       label: 'New household' },
  { type: 'parent',          label: 'New parent' },
  { type: 'invoice',         label: 'New invoice' },
  { type: 'lesson_plan',     label: 'New lesson plan' },
  { type: 'file',            label: 'New file (upload)' },
  { type: 'template',        label: 'New template' },
  { type: 'message_thread',  label: 'New message thread' },
];

export function NewItemMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false); }
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function pick(type: string) {
    setOpen(false);
    if (type === 'session') {
      window.dispatchEvent(new CustomEvent('crestio:open-inline-composer'));
    } else {
      window.dispatchEvent(new CustomEvent('crestio:open-quick-create', { detail: { type } }));
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Create new"
        aria-haspopup="menu"
        aria-expanded={open}
        title="⌘N: quick create"
        className="p-2 rounded hover:bg-ruleSoft transition-colors text-ink"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-1 w-56 bg-surface border border-rule rounded-md shadow-lift z-50 py-1 animate-fade-in"
        >
          {CHOICES.map((c) => (
            <button
              key={c.type}
              role="menuitem"
              type="button"
              onClick={() => pick(c.type)}
              className="w-full flex items-center justify-between px-3 py-1.5 text-sm text-ink hover:bg-ruleSoft text-left"
            >
              <span>{c.label}</span>
              {c.shortcut && (
                <kbd className="text-2xs font-mono text-ink-soft border border-rule rounded px-1.5 py-0.5">{c.shortcut}</kbd>
              )}
            </button>
          ))}
          <div className="border-t border-ruleSoft my-1" />
          <button
            role="menuitem"
            type="button"
            onClick={() => { setOpen(false); window.dispatchEvent(new CustomEvent('crestio:open-quick-create')); }}
            className="w-full flex items-center justify-between px-3 py-1.5 text-sm text-ink-muted hover:bg-ruleSoft text-left"
          >
            <span>Quick create…</span>
            <kbd className="text-2xs font-mono text-ink-soft border border-rule rounded px-1.5 py-0.5">⌘N</kbd>
          </button>
        </div>
      )}
    </div>
  );
}

export default NewItemMenu;
