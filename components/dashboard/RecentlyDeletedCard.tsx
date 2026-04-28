import { useEffect, useState } from 'react';
import Link from 'next/link';
import { authFetch } from '../../lib/authFetch';
import { describeAction } from '../../lib/audit';

// Small dashboard widget that surfaces "you deleted X items today — restore?".
// Visible only when there's something to surface.

type Item = {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  label: string | null;
  at: string;
};

export function RecentlyDeletedCard() {
  const [items, setItems] = useState<Item[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [restoring, setRestoring] = useState(false);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await authFetch('/api/recently-deleted');
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        setCount(data.count ?? 0);
        setItems(data.items ?? []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (loading || hidden || count === 0) return null;

  async function restoreAll() {
    setRestoring(true);
    try {
      // Group by entity_type + from (action ending in .archived vs .deleted).
      const grouped = new Map<string, string[]>();
      for (const item of items) {
        const key = `${item.entity_type}:${item.action.endsWith('.archived') ? 'archive' : 'soft-delete'}`;
        const list = grouped.get(key) ?? [];
        list.push(item.entity_id);
        grouped.set(key, list);
      }
      for (const [key, ids] of grouped.entries()) {
        const [entity_type, from] = key.split(':');
        await authFetch('/api/restore', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ entity_type, ids, from }),
        });
      }
      setHidden(true);
    } finally {
      setRestoring(false);
    }
  }

  return (
    <div className="card p-4 bg-amber-soft/40 border-amber-soft">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-2xs uppercase tracking-widest text-amber-ink mb-1">Recently deleted</div>
          <div className="text-sm text-ink">
            <strong>{count}</strong> {count === 1 ? 'item' : 'items'} deleted in the last 24 hours.
          </div>
          <div className="text-2xs text-ink-soft mt-0.5 truncate">
            {items.slice(0, 3).map((i) => i.label || i.entity_type).join(' · ')}
            {items.length > 3 && ` · +${items.length - 3} more`}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <button
            type="button"
            onClick={restoreAll}
            disabled={restoring}
            className="btn-ghost text-xs px-2 py-1"
          >
            {restoring ? 'Restoring…' : 'Restore all'}
          </button>
          <Link href="/app/settings/trash" className="text-2xs text-ink-muted hover:text-ink underline-offset-2 hover:underline">
            View trash →
          </Link>
        </div>
      </div>
    </div>
  );
}

export default RecentlyDeletedCard;
