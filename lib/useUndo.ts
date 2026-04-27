import { createContext, useContext, useEffect, useState, useRef, useCallback, ReactNode, createElement } from 'react';

// Universal undo system. Pattern:
//
//   const undo = useUndo();
//   undo.queue({
//     id: 'send-polish-' + sessionId,
//     label: 'Polish sent.',
//     holdMs: 5000,            // Wait 5s before committing.
//     commit: async () => fetch('/api/.../send-polish-to-parent', ...),
//     onUndo: () => {},        // Optional: called when user undoes before commit.
//     undoLabel: 'Undo',       // Optional label override.
//   });
//
// During the hold window the action is "queued" — UI should already show the
// optimistic state (e.g. row marked "Sent"), but the actual mutation hasn't
// fired. If the user clicks Undo before the timer expires, the commit is
// skipped and onUndo runs. Otherwise commit() runs after `holdMs`.
//
// For mutations that already happened (delete a row, archive a student), the
// caller should perform the mutation immediately and pass an `inverseCommit`
// for undo:
//
//   undo.queue({
//     id: '...',
//     label: 'Student archived.',
//     holdMs: 5000,
//     commit: async () => null,                  // No-op; already done.
//     inverseCommit: async () => fetch('/api/students/restore', ...),
//   });
//
// The toast UI sits at the bottom of the viewport, replaces any current
// undo-toast for the same id (so rapid actions stack cleanly), and shows a
// draining ring around the timer.

export type UndoEntry = {
  id: string;
  label: string;
  holdMs: number;
  commit: () => Promise<unknown>;
  inverseCommit?: () => Promise<unknown>;
  onUndo?: () => void;
  undoLabel?: string;
};

type ActiveEntry = UndoEntry & {
  startedAt: number;
  state: 'pending' | 'committed' | 'undone';
};

type UndoApi = {
  queue: (e: UndoEntry) => void;
};

const UndoCtx = createContext<UndoApi | null>(null);

export function useUndo(): UndoApi {
  const v = useContext(UndoCtx);
  if (!v) return { queue: () => {} };
  return v;
}

export function UndoProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<ActiveEntry[]>([]);
  const timersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const removeAfter = useCallback((id: string, delay = 250) => {
    setTimeout(() => {
      setEntries((prev) => prev.filter((e) => e.id !== id));
    }, delay);
  }, []);

  const queue = useCallback((e: UndoEntry) => {
    // Clear any existing timer for the same id and replace.
    const existing = timersRef.current.get(e.id);
    if (existing) clearTimeout(existing);

    setEntries((prev) => {
      const next = prev.filter((p) => p.id !== e.id);
      next.push({ ...e, startedAt: Date.now(), state: 'pending' });
      return next;
    });

    const t = setTimeout(async () => {
      timersRef.current.delete(e.id);
      try {
        await e.commit();
      } catch {
        /* swallow — UI already moved on */
      }
      setEntries((prev) => prev.map((p) => p.id === e.id ? { ...p, state: 'committed' } : p));
      removeAfter(e.id);
    }, e.holdMs);
    timersRef.current.set(e.id, t);
  }, [removeAfter]);

  const undo = useCallback(async (id: string) => {
    const t = timersRef.current.get(id);
    if (t) clearTimeout(t);
    timersRef.current.delete(id);
    const target = entries.find((e) => e.id === id);
    setEntries((prev) => prev.map((p) => p.id === id ? { ...p, state: 'undone' } : p));
    if (target) {
      try {
        target.onUndo?.();
        if (target.inverseCommit) await target.inverseCommit();
      } catch { /* swallow */ }
    }
    removeAfter(id);
  }, [entries, removeAfter]);

  const dismiss = useCallback((id: string) => {
    // Manual dismiss = commit early.
    const t = timersRef.current.get(id);
    if (t) clearTimeout(t);
    timersRef.current.delete(id);
    const target = entries.find((e) => e.id === id);
    if (target) {
      target.commit().catch(() => undefined);
    }
    setEntries((prev) => prev.map((p) => p.id === id ? { ...p, state: 'committed' } : p));
    removeAfter(id);
  }, [entries, removeAfter]);

  useEffect(() => {
    return () => {
      for (const t of timersRef.current.values()) clearTimeout(t);
      timersRef.current.clear();
    };
  }, []);

  const api: UndoApi = { queue };

  return createElement(
    UndoCtx.Provider,
    { value: api },
    children,
    createElement(UndoToastStack as any, {
      entries,
      onUndo: undo,
      onDismiss: dismiss,
    }),
  );
}

// ----------------------------------------------------------------------
// Stack of undo toasts. One per pending action.
// ----------------------------------------------------------------------

import { UndoToast } from '../components/design/UndoToast';

function UndoToastStack({
  entries, onUndo, onDismiss,
}: {
  entries: ActiveEntry[];
  onUndo: (id: string) => void;
  onDismiss: (id: string) => void;
}) {
  if (entries.length === 0) return null;
  return createElement(
    'div',
    {
      className: 'fixed bottom-3 left-1/2 -translate-x-1/2 z-[110] flex flex-col items-center gap-2 pb-safe pointer-events-none',
      'aria-live': 'polite',
    },
    entries.map((e) =>
      createElement(UndoToast as any, {
        key: e.id,
        label: e.label,
        holdMs: e.holdMs,
        startedAt: e.startedAt,
        state: e.state,
        onUndo: () => onUndo(e.id),
        onDismiss: () => onDismiss(e.id),
        undoLabel: e.undoLabel,
      }),
    ),
  );
}
