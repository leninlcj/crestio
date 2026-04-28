import { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import { useRouter } from 'next/router';

// DetailPaneStack — stack of slide-over panes (max 4) with URL sync.
//
// Usage:
//   <DetailPaneStackProvider>
//     <App />
//     <DetailPaneStackOverlay />
//   </DetailPaneStackProvider>
//
//   const stack = useDetailStack();
//   stack.push('student', 'abc-…');
//
// Panes are 480px wide each, offset 32px per layer.  Esc / ⌘[ pops the
// top pane; ⌘] re-pushes the most-recently-popped (redo).  Click outside
// the topmost pane closes the whole stack.

export type PaneType = 'student' | 'session' | 'parent' | 'tutor' | 'invoice' | 'file' | 'lesson_plan' | 'household';

export type Pane = { type: PaneType; id: string };

const QUERY_KEY = 'pane';

// Registry: each pane type renders a different component.  We export
// `registerPaneRenderer` so the per-entity panes can register themselves
// without circular imports.
type Renderer = (pane: Pane, helpers: PaneHelpers) => ReactNode;

const renderers: Partial<Record<PaneType, Renderer>> = {};

export function registerPaneRenderer(type: PaneType, render: Renderer) {
  renderers[type] = render;
}

export type PaneHelpers = {
  push: (type: PaneType, id: string) => void;
  pop: () => void;
  close: () => void;
  index: number;
  isTop: boolean;
};

type StackApi = {
  panes: Pane[];
  push: (type: PaneType, id: string) => void;
  pop: () => void;
  close: () => void;
  forward: () => void;
  canForward: boolean;
};

const Ctx = createContext<StackApi | null>(null);

export function DetailPaneStackProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [panes, setPanes] = useState<Pane[]>([]);
  const [forwardStack, setForwardStack] = useState<Pane[]>([]);

  // Sync from URL on mount + on route change.
  useEffect(() => {
    const raw = router.query[QUERY_KEY];
    const str = typeof raw === 'string' ? raw : '';
    const parsed = parseQuery(str);
    setPanes(parsed);
  }, [router.query[QUERY_KEY]]); // eslint-disable-line react-hooks/exhaustive-deps

  function writeUrl(next: Pane[]) {
    const url = new URL(window.location.href);
    if (next.length === 0) url.searchParams.delete(QUERY_KEY);
    else url.searchParams.set(QUERY_KEY, encodeQuery(next));
    void router.replace(url.pathname + url.search, undefined, { shallow: true });
  }

  const push = useCallback((type: PaneType, id: string) => {
    setPanes((prev) => {
      // Don't push if already top of stack.
      const top = prev[prev.length - 1];
      if (top && top.type === type && top.id === id) return prev;
      const next = [...prev, { type, id }].slice(-4);
      writeUrl(next);
      return next;
    });
    setForwardStack([]);
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [router]);

  const pop = useCallback(() => {
    setPanes((prev) => {
      const next = prev.slice(0, -1);
      const popped = prev[prev.length - 1];
      if (popped) setForwardStack((f) => [...f, popped]);
      writeUrl(next);
      return next;
    });
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [router]);

  const close = useCallback(() => {
    setPanes([]);
    setForwardStack([]);
    writeUrl([]);
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [router]);

  const forward = useCallback(() => {
    setForwardStack((f) => {
      if (f.length === 0) return f;
      const top = f[f.length - 1]!;
      const remaining = f.slice(0, -1);
      setPanes((prev) => {
        const next = [...prev, top].slice(-4);
        writeUrl(next);
        return next;
      });
      return remaining;
    });
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [router]);

  const api: StackApi = useMemo(
    () => ({ panes, push, pop, close, forward, canForward: forwardStack.length > 0 }),
    [panes, push, pop, close, forward, forwardStack.length],
  );

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useDetailStack(): StackApi {
  const v = useContext(Ctx);
  if (!v) throw new Error('useDetailStack must be inside <DetailPaneStackProvider>');
  return v;
}

export function useOptionalDetailStack(): StackApi | null {
  return useContext(Ctx);
}

// ----------------------------------------------------------------------
// Overlay — renders the actual stack of panes
// ----------------------------------------------------------------------

export function DetailPaneStackOverlay() {
  const stack = useOptionalDetailStack();

  // Keys: Esc / ⌘[ pop, ⌘] forward.
  useEffect(() => {
    if (!stack) return;
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const inEditable = !!target && (
        /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable
      );
      if (e.key === 'Escape' && stack!.panes.length > 0 && !inEditable) {
        e.preventDefault();
        stack!.pop();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === '[' && stack!.panes.length > 0) {
        e.preventDefault();
        stack!.pop();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === ']' && stack!.canForward) {
        e.preventDefault();
        stack!.forward();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [stack]);

  if (!stack || stack.panes.length === 0) return null;

  return (
    <div
      className="fixed inset-0 z-[60] bg-ink/30 animate-fade-in"
      onClick={() => stack.close()}
      aria-hidden="false"
      role="dialog"
      aria-modal="true"
    >
      {stack.panes.map((pane, i) => {
        const offset = (stack.panes.length - 1 - i) * 32;
        const isTop = i === stack.panes.length - 1;
        const renderer = renderers[pane.type];
        return (
          <aside
            key={`${pane.type}-${pane.id}-${i}`}
            className="absolute right-0 top-0 bottom-0 bg-surface border-l border-rule shadow-lift overflow-hidden flex flex-col animate-slide-left"
            style={{ width: 480, transform: `translateX(${-offset}px)`, zIndex: 60 + i }}
            onClick={(e) => e.stopPropagation()}
          >
            <PaneHeader paneType={pane.type} index={i} stack={stack} />
            <div className="flex-1 overflow-y-auto">
              {renderer ? renderer(pane, {
                push: stack.push,
                pop: stack.pop,
                close: stack.close,
                index: i,
                isTop,
              }) : (
                <div className="p-6 text-sm text-ink-muted">No renderer for {pane.type}.</div>
              )}
            </div>
          </aside>
        );
      })}
    </div>
  );
}

function PaneHeader({ paneType, index, stack }: { paneType: PaneType; index: number; stack: StackApi }) {
  const crumbs = stack.panes.slice(0, index + 1);
  return (
    <header className="px-5 py-3 border-b border-rule flex items-center gap-2">
      {crumbs.length > 1 && (
        <nav aria-label="Pane breadcrumb" className="flex items-center gap-1.5 text-2xs text-ink-soft truncate min-w-0">
          {crumbs.map((c, i) => {
            const isLast = i === crumbs.length - 1;
            return (
              <span key={`${c.type}-${c.id}-${i}`} className="flex items-center gap-1.5 truncate">
                {i > 0 && <span className="text-ink-soft">›</span>}
                {isLast ? (
                  <span className="text-ink truncate capitalize">{c.type.replace('_', ' ')}</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      const popsNeeded = stack.panes.length - i - 1;
                      for (let p = 0; p < popsNeeded; p++) stack.pop();
                    }}
                    className="hover:text-ink underline-offset-2 hover:underline truncate capitalize"
                  >
                    {c.type.replace('_', ' ')}
                  </button>
                )}
              </span>
            );
          })}
        </nav>
      )}
      <div className="ml-auto flex items-center gap-1">
        <button type="button" onClick={() => stack.pop()} aria-label="Back" title="Back (⌘[)" className="text-2xs text-ink-soft hover:text-ink p-1">
          ←
        </button>
        <button type="button" onClick={() => stack.close()} aria-label="Close" title="Close" className="text-2xs text-ink-soft hover:text-ink p-1">
          ✕
        </button>
      </div>
    </header>
  );
}

// ----------------------------------------------------------------------
// URL serialization: ?pane=student:abc,session:def
// ----------------------------------------------------------------------

function parseQuery(s: string): Pane[] {
  if (!s) return [];
  return s.split(',').map((bit) => {
    const [type, id] = bit.split(':');
    if (!type || !id) return null;
    return { type: type as PaneType, id };
  }).filter(Boolean) as Pane[];
}

function encodeQuery(panes: Pane[]): string {
  return panes.map((p) => `${p.type}:${p.id}`).join(',');
}
