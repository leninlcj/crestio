import { ReactNode, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { createPortal } from 'react-dom';

type Props = {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  /** Top-right "Open full page" link — falls back to the legacy detail route. */
  fullPageHref?: string;
  /** Right-side action slot (buttons, status etc.). */
  headerActions?: ReactNode;
  children: ReactNode;
  /** Default 480px on desktop; mobile becomes a full-screen sheet. */
  width?: number;
};

// Slide-in detail pane. Right-side on desktop, bottom-up sheet on mobile.
// Click outside or Esc closes (the parent owns the URL state).
export function DetailPane({
  open,
  onClose,
  title,
  fullPageHref,
  headerActions,
  children,
  width = 480,
}: Props) {
  const [mounted, setMounted] = useState(false);
  const [entered, setEntered] = useState(false);
  const overlayRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!open) { setEntered(false); return; }
    const r = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(r);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    }
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [open, onClose]);

  // Lock background scroll when open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  if (!mounted || !open) return null;

  return createPortal(
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[55] flex justify-end"
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => {
        if (e.target === overlayRef.current) onClose();
      }}
    >
      <div
        className="absolute inset-0 bg-ink/30 transition-opacity duration-150"
        style={{ opacity: entered ? 1 : 0 }}
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        className="relative bg-surface border-l border-rule shadow-lift h-full max-h-screen flex flex-col w-full md:w-[var(--pane-w)] transition-transform duration-150 ease-out"
        style={{
          ['--pane-w' as any]: `${width}px`,
          transform: entered ? 'translateX(0)' : 'translateX(8%)',
          opacity: entered ? 1 : 0,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="shrink-0 px-4 md:px-5 h-14 border-b border-rule flex items-center gap-3">
          <div className="flex-1 min-w-0 text-sm font-medium text-ink truncate">
            {title}
          </div>
          {headerActions && <div className="shrink-0 flex items-center gap-1">{headerActions}</div>}
          <PaneMenu fullPageHref={fullPageHref} />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 h-8 w-8 grid place-items-center text-ink-muted hover:text-ink hover:bg-ruleSoft rounded transition-colors duration-100"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M6 6l12 12M6 18L18 6"/>
            </svg>
          </button>
        </header>
        <div className="flex-1 min-h-0 overflow-y-auto">
          {children}
        </div>
      </aside>
    </div>,
    document.body,
  );
}

function PaneMenu({ fullPageHref }: { fullPageHref?: string }) {
  const [open, setOpen] = useState(false);
  function copyLink() {
    navigator.clipboard.writeText(window.location.href);
    setOpen(false);
  }
  function print() {
    document.body.dataset.printingPane = 'true';
    setOpen(false);
    window.requestAnimationFrame(() => {
      window.print();
      window.setTimeout(() => { delete document.body.dataset.printingPane; }, 500);
    });
  }
  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="More"
        className="h-8 w-8 grid place-items-center text-ink-muted hover:text-ink hover:bg-ruleSoft rounded transition-colors duration-100"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>
        </svg>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden="true" />
          <div
            role="menu"
            className="absolute right-0 top-full mt-1 z-50 bg-surface border border-rule rounded shadow-lift py-1 min-w-[160px] text-sm"
          >
            <button type="button" onClick={copyLink} className="w-full text-left px-3 py-1.5 hover:bg-ruleSoft">Copy link</button>
            {fullPageHref && (
              <Link href={fullPageHref} className="block px-3 py-1.5 hover:bg-ruleSoft" onClick={() => setOpen(false)}>
                Open full page
              </Link>
            )}
            <button type="button" onClick={print} className="w-full text-left px-3 py-1.5 hover:bg-ruleSoft">Print</button>
          </div>
        </>
      )}
    </div>
  );
}

// Hook that mirrors a `?detail=type:id` URL param into local state for a list.
// Caller decides what type is allowed; this just round-trips the string.
export function useDetailParam(): {
  value: string | null;
  open: (id: string) => void;
  close: () => void;
} {
  const [value, setValue] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return new URLSearchParams(window.location.search).get('detail');
  });

  useEffect(() => {
    function sync() {
      setValue(new URLSearchParams(window.location.search).get('detail'));
    }
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, []);

  const open = (id: string) => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    url.searchParams.set('detail', id);
    window.history.pushState({}, '', url.toString());
    setValue(id);
  };
  const close = () => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    url.searchParams.delete('detail');
    window.history.pushState({}, '', url.toString());
    setValue(null);
  };

  return { value, open, close };
}

export default DetailPane;
