import { useEffect, useMemo, useState } from 'react';
import AuthGuard from '../../../components/AuthGuard';
import Layout from '../../../components/Layout';
import SettingsTabs from '../../../components/SettingsTabs';
import { useToast } from '../../../components/design/Toast';
import { ConfirmDrawer } from '../../../components/design/ConfirmDrawer';
import { authFetch } from '../../../lib/authFetch';
import { ENTITY_SPECS, EntityType } from '../../../lib/entitySchema';
import { useMembership } from '../../../lib/membershipContext';

// Settings → Trash.  Tabs across the top per entity type.  Each tab lists
// archived/deleted rows with restore and "delete forever".  Bulk select +
// bulk restore + bulk purge.

type Row = {
  id: string;
  label: string;
  from: 'archive' | 'soft-delete';
  at: string;
  purges_at: string | null;
  actor_id: string | null;
  actor: string | null;
  reason: string | null;
};

const TABS: { type: EntityType; label: string }[] = [
  { type: 'student',          label: 'Students' },
  { type: 'household',        label: 'Households' },
  { type: 'parent',           label: 'Parents' },
  { type: 'session',          label: 'Sessions' },
  { type: 'invoice',          label: 'Invoices' },
  { type: 'file',             label: 'Files' },
  { type: 'lesson_plan',      label: 'Lesson plans' },
  { type: 'session_template', label: 'Templates' },
  { type: 'message_thread',   label: 'Threads' },
];

function TrashInner() {
  const { membership } = useMembership();
  const toast = useToast();
  const [active, setActive] = useState<EntityType>('student');
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [purgeOpen, setPurgeOpen] = useState(false);
  const [purgeBusy, setPurgeBusy] = useState(false);
  const [confirmText, setConfirmText] = useState('');

  const isOwner = membership?.role === 'owner';

  async function load(type: EntityType) {
    setLoading(true);
    setSelected(new Set());
    try {
      const res = await authFetch(`/api/trash?entity_type=${type}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Could not load.');
      setRows(data.rows ?? []);
    } catch (e: any) {
      toast.show({ message: e?.message ?? 'Could not load trash.', tone: 'error' });
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(active); /* eslint-disable-line */ }, [active]);

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selected.size === rows.length) setSelected(new Set());
    else setSelected(new Set(rows.map((r) => r.id)));
  }

  async function restore(ids: string[], from: 'archive' | 'soft-delete') {
    const res = await authFetch('/api/restore', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ entity_type: active, ids, from }),
    });
    const data = await res.json();
    if (!res.ok) {
      toast.show({ message: data?.error ?? 'Could not restore.', tone: 'error' });
      return;
    }
    toast.show({ message: `Restored ${data.restored}.`, tone: 'success' });
    await load(active);
  }

  async function purge(ids: string[]) {
    setPurgeBusy(true);
    try {
      const res = await authFetch('/api/purge', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ entity_type: active, ids, confirm: 'DELETE' }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.show({ message: data?.error ?? 'Could not purge.', tone: 'error' });
        return;
      }
      toast.show({ message: `Permanently deleted ${data.purged}.`, tone: 'success' });
      setPurgeOpen(false);
      setConfirmText('');
      await load(active);
    } finally {
      setPurgeBusy(false);
    }
  }

  const selectedRows = useMemo(() => rows.filter((r) => selected.has(r.id)), [rows, selected]);

  const stats = useMemo(() => {
    const total = rows.length;
    const purgesSoon = rows.filter((r) => r.purges_at &&
      new Date(r.purges_at).getTime() - Date.now() < 7 * 86400_000).length;
    return { total, purgesSoon };
  }, [rows]);

  return (
    <Layout pageTitle="Trash" title="Trash" subtitle="Settings">
      <SettingsTabs />

      <div className="space-y-4 max-w-5xl">
        <p className="text-sm text-ink-muted">
          Archived items are kept forever until you delete them.
          Soft-deleted items are permanently removed 30 days after deletion.
        </p>

        {/* Entity tabs */}
        <div className="flex gap-1 overflow-x-auto border-b border-rule -mx-2 px-2">
          {TABS.map((t) => (
            <button
              key={t.type}
              type="button"
              onClick={() => setActive(t.type)}
              className={[
                'px-3 py-2 text-sm transition-colors duration-100 border-b-2 -mb-px whitespace-nowrap',
                active === t.type ? 'border-forest text-ink font-medium' : 'border-transparent text-ink-muted hover:text-ink',
              ].join(' ')}
              role="tab"
              aria-selected={active === t.type}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Header strip */}
        <div className="flex items-center justify-between text-2xs text-ink-muted">
          <div>
            {stats.total} {stats.total === 1 ? 'item' : 'items'}
            {stats.purgesSoon > 0 && (
              <span className="ml-2 text-amber-ink">
                · {stats.purgesSoon} purges within 7 days
              </span>
            )}
          </div>
          {selectedRows.length > 0 && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  // Restore all selected — split by from to call /api/restore correctly.
                  const archived = selectedRows.filter((r) => r.from === 'archive').map((r) => r.id);
                  const deleted = selectedRows.filter((r) => r.from === 'soft-delete').map((r) => r.id);
                  if (archived.length > 0) void restore(archived, 'archive');
                  if (deleted.length > 0) void restore(deleted, 'soft-delete');
                }}
                className="btn-ghost text-2xs px-2 py-1"
              >
                Restore {selectedRows.length}
              </button>
              {isOwner && (
                <button
                  type="button"
                  onClick={() => setPurgeOpen(true)}
                  className="btn-ghost text-2xs px-2 py-1 text-claret hover:text-claret"
                >
                  Delete forever
                </button>
              )}
            </div>
          )}
        </div>

        {/* List */}
        <div className="card overflow-hidden">
          {loading ? (
            <div className="p-6 text-sm text-ink-muted">Loading…</div>
          ) : rows.length === 0 ? (
            <div className="p-8 text-sm text-ink-muted text-center">
              Nothing in trash. Items appear here when you archive or delete them.
            </div>
          ) : (
            <ul className="divide-y divide-ruleSoft">
              <li className="px-3 py-2 bg-ruleSoft/30 text-2xs uppercase tracking-widest text-ink-soft flex items-center gap-3">
                <input
                  type="checkbox"
                  aria-label="Select all"
                  onChange={toggleSelectAll}
                  checked={rows.length > 0 && selected.size === rows.length}
                />
                <span className="flex-1">Item</span>
                <span className="w-32 hidden sm:block">When</span>
                <span className="w-32 hidden md:block">By</span>
                <span className="w-32 hidden md:block">Auto-purge</span>
                <span className="w-24 text-right">Actions</span>
              </li>
              {rows.map((r) => (
                <li key={r.id} className="px-3 py-2 flex items-center gap-3 hover:bg-ruleSoft/20" style={{ minHeight: 44 }}>
                  <input
                    type="checkbox"
                    aria-label={`Select ${r.label}`}
                    checked={selected.has(r.id)}
                    onChange={() => toggleSelect(r.id)}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-ink truncate">{r.label || '–'}</div>
                    <div className="text-2xs text-ink-soft">
                      {r.from === 'archive' ? 'Archived' : 'Deleted'}
                      {r.reason ? ` · ${r.reason}` : ''}
                    </div>
                  </div>
                  <div className="w-32 hidden sm:block text-2xs text-ink-muted tabular">
                    {r.at ? formatRelative(r.at) : '–'}
                  </div>
                  <div className="w-32 hidden md:block text-2xs text-ink-muted truncate">
                    {r.actor ?? '–'}
                  </div>
                  <div className="w-32 hidden md:block text-2xs text-ink-muted tabular">
                    {r.purges_at ? `in ${daysUntil(r.purges_at)} d` : 'Never'}
                  </div>
                  <div className="w-24 flex items-center justify-end gap-1">
                    <button
                      type="button"
                      onClick={() => void restore([r.id], r.from)}
                      className="btn-ghost text-2xs px-2 py-1"
                    >Restore</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <ConfirmDrawer
        open={purgeOpen}
        title="Delete forever?"
        summary="This cannot be undone. Type DELETE to confirm."
        items={selectedRows.map((r) => ({ id: r.id, label: r.label || r.id }))}
        confirmLabel={`Delete ${selectedRows.length} forever`}
        onCancel={() => { setPurgeOpen(false); setConfirmText(''); }}
        onConfirm={() => {
          if (confirmText === 'DELETE') void purge(selectedRows.map((r) => r.id));
          else toast.show({ message: 'Type DELETE to confirm.', tone: 'warning' });
        }}
        busy={purgeBusy}
        destructive
      >
        <input
          type="text"
          autoFocus
          placeholder="Type DELETE to confirm"
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          className="w-full mb-3 px-3 py-2 border border-rule rounded-md bg-surface text-sm text-ink"
        />
      </ConfirmDrawer>
    </Layout>
  );
}

function daysUntil(iso: string): number {
  return Math.max(0, Math.floor((new Date(iso).getTime() - Date.now()) / 86400_000));
}
function formatRelative(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400_000);
  if (days < 1) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

export default function Page() {
  return <AuthGuard><TrashInner /></AuthGuard>;
}
