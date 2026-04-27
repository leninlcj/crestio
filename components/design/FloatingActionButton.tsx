import { useState } from 'react';
import { useRouter } from 'next/router';

type Action = {
  label: string;
  onSelect: () => void;
  shortcut?: string;
};

type Props = {
  actions?: Action[];
};

// Mobile-only FAB. Tap opens an action sheet with the same options as the
// Cmd+K palette quick actions.
export function FloatingActionButton({ actions }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const defaultActions: Action[] = actions ?? [
    {
      label: 'Log session',
      onSelect: () => router.push('/app/sessions/new?mode=quick'),
    },
    {
      label: 'Polish last session',
      onSelect: () => router.push('/app/sessions?tab=polish-queue'),
    },
    {
      label: 'Add student',
      onSelect: () => router.push('/app/students/new'),
    },
    {
      label: 'Create invoice',
      onSelect: () => router.push('/app/invoices/new'),
    },
  ];

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="md:hidden fixed bottom-20 right-4 z-30 w-14 h-14 rounded-full bg-forest text-white shadow-lift active:bg-forest-ink transition-colors duration-100 grid place-items-center"
        aria-label="Quick actions"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>

      {open && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-ink/40 animate-fade-in"
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Quick actions"
        >
          <div
            className="absolute bottom-0 left-0 right-0 bg-surface rounded-t-[12px] pb-safe shadow-lift"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="h-1 w-10 bg-rule rounded-full mx-auto my-3" />
            <div className="px-2 pb-3">
              {defaultActions.map((a) => (
                <button
                  key={a.label}
                  type="button"
                  onClick={() => { setOpen(false); a.onSelect(); }}
                  className="w-full text-left px-4 py-3 rounded-md text-sm text-ink hover:bg-ruleSoft/60 active:bg-ruleSoft flex items-center justify-between"
                >
                  <span>{a.label}</span>
                  {a.shortcut && <span className="text-xs text-ink-soft font-mono">{a.shortcut}</span>}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default FloatingActionButton;
