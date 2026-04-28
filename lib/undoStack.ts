// Universal undo stack — depth-3 layer on top of commit-1's per-action
// useUndo() (which is for the 5-second hold-then-commit pattern).  This
// stack is for *already-applied* destructive actions: the mutation has
// happened, the toast says "Undo (⌘Z)", and ⌘Z runs the inverse.
//
// State lives in memory + sessionStorage so navigation between routes
// keeps the stack alive.  The undo callbacks themselves are not persisted
// (you can't serialise a closure) — only the labels + ids are restored
// across navigation.  That means after a hard refresh ⌘Z still pops the
// label but won't actually run the inverse mutation.  We accept this:
// the ⌘Z window is meant for "I just clicked the wrong thing", not for
// long-term recovery (Trash handles that).
//
// Wire from any destructive action:
//
//   undoStack.push({
//     label: 'Archived "Diego".',
//     undo: async () => { await authFetch('/api/restore', ...); refresh(); },
//   });
//
// ⌘Z is registered globally in components/UndoKeybind.tsx (mounted in
// _app.tsx) — pages don't have to install it themselves.

export type UndoEntry = {
  id: string;
  label: string;
  undo: () => Promise<void> | void;
  redo?: () => Promise<void> | void;
  pushedAt: number;
  expiresAt: number;
  /** When false, the entry won't restore from sessionStorage as actionable
   *  (label still shown but undo/redo are no-ops). */
  serialisable?: boolean;
};

type Listener = (entries: UndoEntry[], redoEntries: UndoEntry[]) => void;

const STORAGE_KEY = 'crestio.undostack.v1';
const MAX = 20;
const DEFAULT_TTL_MS = 60_000;

class UndoStackImpl {
  private entries: UndoEntry[] = [];
  private redoEntries: UndoEntry[] = [];
  private listeners = new Set<Listener>();
  private ssrSafe = typeof window !== 'undefined';

  constructor() {
    if (this.ssrSafe) this.hydrate();
  }

  private hydrate() {
    try {
      const raw = window.sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Array<{ id: string; label: string; pushedAt: number; expiresAt: number }>;
      const now = Date.now();
      this.entries = parsed
        .filter((e) => e.expiresAt > now)
        .map((e) => ({
          ...e,
          undo: async () => { /* closures don't survive reload */ },
          serialisable: false,
        }));
    } catch { /* ignore */ }
  }

  private persist() {
    if (!this.ssrSafe) return;
    try {
      const slim = this.entries.map((e) => ({
        id: e.id, label: e.label, pushedAt: e.pushedAt, expiresAt: e.expiresAt,
      }));
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(slim));
    } catch { /* ignore */ }
  }

  private fire() {
    const a = [...this.entries];
    const b = [...this.redoEntries];
    this.listeners.forEach((l) => l(a, b));
    this.persist();
  }

  push(entry: Omit<UndoEntry, 'id' | 'pushedAt' | 'expiresAt'> & { ttlMs?: number; id?: string }): string {
    const now = Date.now();
    const e: UndoEntry = {
      id: entry.id ?? `u-${now}-${Math.random().toString(36).slice(2, 8)}`,
      label: entry.label,
      undo: entry.undo,
      redo: entry.redo,
      pushedAt: now,
      expiresAt: now + (entry.ttlMs ?? DEFAULT_TTL_MS),
      serialisable: entry.serialisable ?? true,
    };
    this.entries.push(e);
    if (this.entries.length > MAX) this.entries.shift();
    // Pushing a fresh action invalidates the redo trail.
    this.redoEntries = [];
    this.fire();
    return e.id;
  }

  async pop(): Promise<UndoEntry | null> {
    // Skip expired entries.
    const now = Date.now();
    while (this.entries.length > 0 && this.entries[this.entries.length - 1]!.expiresAt <= now) {
      this.entries.pop();
    }
    const e = this.entries.pop();
    if (!e) { this.fire(); return null; }
    try { await e.undo(); } catch (err) { console.error('[undoStack] undo failed', err); }
    if (e.redo || e.serialisable === false) this.redoEntries.push(e);
    if (this.redoEntries.length > MAX) this.redoEntries.shift();
    this.fire();
    return e;
  }

  async redo(): Promise<UndoEntry | null> {
    const e = this.redoEntries.pop();
    if (!e) { this.fire(); return null; }
    try { if (e.redo) await e.redo(); } catch (err) { console.error('[undoStack] redo failed', err); }
    this.entries.push(e);
    this.fire();
    return e;
  }

  peek(): UndoEntry | null {
    const now = Date.now();
    for (let i = this.entries.length - 1; i >= 0; i--) {
      if (this.entries[i]!.expiresAt > now) return this.entries[i]!;
    }
    return null;
  }

  size(): number { return this.entries.length; }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener([...this.entries], [...this.redoEntries]);
    return () => { this.listeners.delete(listener); };
  }

  clear() {
    this.entries = [];
    this.redoEntries = [];
    this.fire();
  }
}

export const undoStack = new UndoStackImpl();
