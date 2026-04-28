import { useEffect, useRef, useState, KeyboardEvent } from 'react';
import { authFetch } from '../../lib/authFetch';
import { undoStack } from '../../lib/undoStack';

// TagInput — combobox for attaching/detaching tags to a single entity.
// Native (no cmdk dep); keyboard-driven.
//
// Right-click a chip to recolor (12 preset colors).  The colour persists
// to the tag itself, so every entity using that tag updates.

type Tag = { id: string; name: string; color: string };

const COLOR_PRESETS = [
  '#64748b', // slate
  '#6b7280', // gray
  '#ef4444', // red
  '#f97316', // orange
  '#f59e0b', // amber
  '#eab308', // yellow
  '#22c55e', // green
  '#10b981', // emerald
  '#14b8a6', // teal
  '#0ea5e9', // sky
  '#6366f1', // indigo
  '#8b5cf6', // violet
];

type Props = {
  entityType: string;
  entityId: string;
  /** Optional initial set; otherwise loaded from /api/tags/for-entity. */
  initial?: Tag[];
  /** Called with the new attached set after every change. */
  onChange?: (tags: Tag[]) => void;
};

export function TagInput({ entityType, entityId, initial, onChange }: Props) {
  const [attached, setAttached] = useState<Tag[]>(initial ?? []);
  const [loaded, setLoaded] = useState(!!initial);
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<Array<Tag & { usage_count?: number }>>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [colorPickerFor, setColorPickerFor] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Initial fetch.
  useEffect(() => {
    if (initial) return;
    let cancelled = false;
    (async () => {
      const res = await authFetch(`/api/tags/for-entity?entity_type=${entityType}&entity_id=${entityId}`);
      if (cancelled) return;
      if (res.ok) {
        const data = await res.json();
        setAttached(data.tags ?? []);
      }
      setLoaded(true);
    })();
    return () => { cancelled = true; };
  }, [entityType, entityId, initial]);

  // Suggestion fetch (debounced).
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(async () => {
      const url = query ? `/api/tags?q=${encodeURIComponent(query)}` : '/api/tags';
      const res = await authFetch(url);
      if (res.ok) {
        const data = await res.json();
        const attachedIds = new Set(attached.map((a) => a.id));
        setSuggestions((data.tags ?? []).filter((t: Tag) => !attachedIds.has(t.id)));
        setActive(0);
      }
    }, 120);
    return () => clearTimeout(t);
  }, [query, open, attached]);

  // Click-away.
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false); setColorPickerFor(null);
      }
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  async function attach(tag: Tag) {
    setAttached((prev) => [...prev, tag]);
    setQuery('');
    setOpen(false);
    onChange?.([...attached, tag]);
    await authFetch('/api/tags/attach', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tag_id: tag.id, entity_type: entityType, entity_id: entityId }),
    });
    undoStack.push({
      label: `Tagged "${tag.name}".`,
      undo: async () => {
        await authFetch('/api/tags/attach', {
          method: 'DELETE',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ tag_id: tag.id, entity_type: entityType, entity_id: entityId }),
        });
        setAttached((prev) => prev.filter((t) => t.id !== tag.id));
        onChange?.(attached.filter((t) => t.id !== tag.id));
      },
    });
  }

  async function detach(tag: Tag) {
    setAttached((prev) => prev.filter((t) => t.id !== tag.id));
    onChange?.(attached.filter((t) => t.id !== tag.id));
    await authFetch('/api/tags/attach', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tag_id: tag.id, entity_type: entityType, entity_id: entityId }),
    });
    undoStack.push({
      label: `Removed tag "${tag.name}".`,
      undo: async () => {
        await authFetch('/api/tags/attach', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ tag_id: tag.id, entity_type: entityType, entity_id: entityId }),
        });
        setAttached((prev) => [...prev, tag]);
        onChange?.([...attached, tag]);
      },
    });
  }

  async function createAndAttach(name: string) {
    const res = await authFetch('/api/tags', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) return;
    const data = await res.json();
    if (data.tag) await attach(data.tag);
  }

  async function recolor(tag: Tag, color: string) {
    setAttached((prev) => prev.map((t) => t.id === tag.id ? { ...t, color } : t));
    setColorPickerFor(null);
    await authFetch(`/api/tags/${tag.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ color }),
    });
  }

  function onInputKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !query && attached.length > 0) {
      detach(attached[attached.length - 1]!);
      return;
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(suggestions.length, a + 1)); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); return; }
    if (e.key === 'Enter') {
      e.preventDefault();
      const exact = suggestions.find((s) => s.name.toLowerCase() === query.trim().toLowerCase());
      if (active < suggestions.length) {
        const s = suggestions[active];
        if (s) attach(s);
      } else if (query.trim() && !exact) {
        createAndAttach(query.trim());
      }
    }
    if (e.key === 'Escape') { setOpen(false); setColorPickerFor(null); }
  }

  const exactMatch = suggestions.some((s) => s.name.toLowerCase() === query.trim().toLowerCase());
  const showCreate = open && query.trim().length > 0 && !exactMatch;

  return (
    <div ref={containerRef} className="relative">
      <div
        className="flex flex-wrap items-center gap-1.5 px-2 py-1.5 border border-rule rounded bg-surface min-h-[36px] cursor-text focus-within:border-forest"
        onClick={() => { setOpen(true); inputRef.current?.focus(); }}
      >
        {!loaded && <span className="text-2xs text-ink-soft">Loading…</span>}
        {attached.map((t) => (
          <span
            key={t.id}
            className="inline-flex items-center gap-1 text-2xs px-2 py-0.5 rounded-full"
            style={{ background: `${t.color}22`, color: t.color }}
            onContextMenu={(e) => { e.preventDefault(); setColorPickerFor(t.id); }}
          >
            {t.name}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); detach(t); }}
              aria-label={`Remove ${t.name}`}
              className="opacity-70 hover:opacity-100"
            >×</button>
            {colorPickerFor === t.id && (
              <div className="absolute z-30 mt-6 left-0 bg-surface border border-rule rounded-md shadow-lift p-2 grid grid-cols-6 gap-1">
                {COLOR_PRESETS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-label={`Set color ${c}`}
                    onClick={(e) => { e.stopPropagation(); recolor(t, c); }}
                    className="h-5 w-5 rounded-full border border-rule"
                    style={{ background: c }}
                  />
                ))}
              </div>
            )}
          </span>
        ))}
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setOpen(true)}
          onKeyDown={onInputKey}
          placeholder={attached.length === 0 ? 'Add a tag…' : ''}
          className="flex-1 min-w-[80px] bg-transparent outline-none text-xs text-ink"
        />
      </div>

      {open && (suggestions.length > 0 || showCreate) && (
        <div className="absolute z-20 mt-1 w-full bg-surface border border-rule rounded-md shadow-lift overflow-hidden max-h-60 overflow-y-auto">
          <ul role="listbox">
            {suggestions.map((s, i) => (
              <li key={s.id}>
                <button
                  type="button"
                  onMouseEnter={() => setActive(i)}
                  onClick={() => attach(s)}
                  className={[
                    'w-full text-left px-3 py-1.5 flex items-center justify-between gap-2 text-xs',
                    i === active ? 'bg-ruleSoft' : 'hover:bg-ruleSoft/60',
                  ].join(' ')}
                >
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
                    {s.name}
                  </span>
                  {s.usage_count != null && (
                    <span className="text-2xs text-ink-soft">{s.usage_count} use{s.usage_count === 1 ? '' : 's'}</span>
                  )}
                </button>
              </li>
            ))}
            {showCreate && (
              <li>
                <button
                  type="button"
                  onClick={() => createAndAttach(query.trim())}
                  className={[
                    'w-full text-left px-3 py-1.5 text-xs italic',
                    active === suggestions.length ? 'bg-ruleSoft' : 'hover:bg-ruleSoft/60',
                  ].join(' ')}
                >
                  Create "{query.trim()}"
                </button>
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

export default TagInput;
