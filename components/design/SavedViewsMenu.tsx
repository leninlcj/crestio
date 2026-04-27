import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { listViews, saveView, deleteView, type SavedView } from '../../lib/saved-views';
import { cx } from '../../lib/utils';

type Props = {
  /** Stable list identifier — e.g. 'sessions.past' or 'invoices'. */
  listId: string;
};

// Small dropdown next to the filter bar. Lets the user save the current
// URL search string under a name, then jump back to it later.
export function SavedViewsMenu({ listId }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [views, setViews] = useState<SavedView[]>([]);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => { setViews(listViews(listId)); }, [listId]);
  useEffect(() => {
    if (!open) { setAdding(false); setName(''); }
  }, [open]);
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  function applyView(v: SavedView) {
    const url = router.pathname + (v.search.startsWith('?') ? v.search : v.search ? `?${v.search}` : '');
    router.replace(url);
    setOpen(false);
  }

  function commitNew() {
    if (!name.trim()) return;
    const search = window.location.search;
    const next = saveView(listId, name.trim(), search);
    setViews(listViews(listId));
    setAdding(false);
    setName('');
    setOpen(false);
    void next;
  }

  function remove(v: SavedView) {
    deleteView(listId, v.id);
    setViews(listViews(listId));
  }

  return (
    <div ref={wrapRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="btn-ghost text-xs px-2.5 inline-flex items-center gap-1.5"
        style={{ height: 32, minHeight: 32 }}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
        </svg>
        Views
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-30 w-56 bg-surface border border-rule rounded-md shadow-lift py-1 animate-fade-in">
          {views.length === 0 && !adding && (
            <div className="px-3 py-2 text-xs text-ink-soft">No saved views yet.</div>
          )}
          {views.map((v) => (
            <div key={v.id} className="group flex items-center gap-1 pl-3 pr-1 py-1.5 hover:bg-ruleSoft">
              <button
                type="button"
                onClick={() => applyView(v)}
                className="flex-1 text-left text-xs text-ink truncate"
              >
                {v.name}
              </button>
              <button
                type="button"
                onClick={() => remove(v)}
                className="opacity-0 group-hover:opacity-100 text-ink-soft hover:text-claret px-1 transition-opacity duration-100"
                aria-label={`Delete ${v.name}`}
              >
                ×
              </button>
            </div>
          ))}
          <div className={cx('border-t border-rule mt-1 pt-1', views.length === 0 && 'border-t-0 mt-0 pt-0')}>
            {adding ? (
              <div className="px-2 py-1.5 flex items-center gap-1">
                <input
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitNew();
                    if (e.key === 'Escape') { setAdding(false); setName(''); }
                  }}
                  placeholder="Name this view"
                  className="input flex-1 h-8 text-xs"
                />
                <button
                  type="button"
                  onClick={commitNew}
                  className="btn-primary text-xs px-2.5"
                  style={{ height: 28, minHeight: 28 }}
                >
                  Save
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setAdding(true)}
                className="w-full text-left px-3 py-1.5 text-xs text-forest hover:bg-ruleSoft transition-colors duration-100"
              >
                + Save current view as…
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default SavedViewsMenu;
