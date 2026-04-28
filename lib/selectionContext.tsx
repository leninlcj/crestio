import { createContext, useCallback, useContext, useMemo, useState, ReactNode } from 'react';

// Selection context for any list view.  Provides:
//   * mode: 'visible' (only currently selected ids) vs 'all-matching'
//     (every row matching the active filter — server-side select).
//   * ids: Set<string> when mode === 'visible'
//   * filters: opaque object echoed to the bulk endpoint when mode === 'all-matching'.
//
// Wrap the list page with <SelectionProvider> and call useSelection() in
// rows / bulk action bar.

export type SelectionMode = 'visible' | 'all-matching';

export type Filters = Record<string, unknown>;

export type SelectionState = {
  mode: SelectionMode;
  ids: Set<string>;
  filters: Filters;
  /** Total filtered count (set by the list page when known) — surfaces the
   *  "247 selected across all pages" copy in the bulk bar. */
  totalMatching: number | null;
};

export type SelectionApi = {
  state: SelectionState;
  toggle: (id: string) => void;
  select: (ids: string[]) => void;
  selectAllVisible: (ids: string[]) => void;
  selectAllMatching: () => void;
  clear: () => void;
  setFilters: (f: Filters) => void;
  setTotalMatching: (n: number | null) => void;
  isSelected: (id: string) => boolean;
  /** True when the bulk action should fan out across all matches. */
  isAllMatching: () => boolean;
  count: () => number;
};

const Ctx = createContext<SelectionApi | null>(null);

export function SelectionProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<SelectionMode>('visible');
  const [ids, setIds] = useState<Set<string>>(new Set());
  const [filters, setFiltersS] = useState<Filters>({});
  const [totalMatching, setTotalMatchingS] = useState<number | null>(null);

  const toggle = useCallback((id: string) => {
    setMode('visible');
    setIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const select = useCallback((newIds: string[]) => {
    setMode('visible');
    setIds(new Set(newIds));
  }, []);

  const selectAllVisible = useCallback((visibleIds: string[]) => {
    setMode('visible');
    setIds(new Set(visibleIds));
  }, []);

  const selectAllMatching = useCallback(() => {
    setMode('all-matching');
    // Don't clear the visible ids — bulk endpoints prefer select_all when
    // mode is all-matching, so ids becomes informational only.
  }, []);

  const clear = useCallback(() => {
    setMode('visible');
    setIds(new Set());
  }, []);

  const setFilters = useCallback((f: Filters) => { setFiltersS(f); }, []);
  const setTotalMatching = useCallback((n: number | null) => { setTotalMatchingS(n); }, []);

  const api: SelectionApi = useMemo(() => ({
    state: { mode, ids, filters, totalMatching },
    toggle, select, selectAllVisible, selectAllMatching, clear,
    setFilters, setTotalMatching,
    isSelected: (id: string) => ids.has(id),
    isAllMatching: () => mode === 'all-matching',
    count: () => mode === 'all-matching' ? (totalMatching ?? ids.size) : ids.size,
  }), [mode, ids, filters, totalMatching, toggle, select, selectAllVisible, selectAllMatching, clear, setFilters, setTotalMatching]);

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useSelection(): SelectionApi {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSelection must be used inside <SelectionProvider>');
  return v;
}

export function useOptionalSelection(): SelectionApi | null {
  return useContext(Ctx);
}
