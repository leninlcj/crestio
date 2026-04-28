import { useMemo, useState } from 'react';
import { useAuditLog, type AuditFilters } from '../../lib/useAuditLog';
import { describeAction } from '../../lib/audit';
import Papa from 'papaparse';

type Props = {
  // When 'self', applies actor=<current user> filter (My activity).  When
  // 'org', shows the full org log (owner-only audit log).
  scope: 'self' | 'org';
  selfUserId?: string;
};

export function AuditLogPage({ scope, selfUserId }: Props) {
  const [filters, setFilters] = useState<AuditFilters>(() => (
    scope === 'self' && selfUserId ? { actor: selfUserId } : {}
  ));
  const { rows, loading, error, hasMore, loadMore } = useAuditLog(filters);

  const [openRow, setOpenRow] = useState<string | null>(null);

  const exportCsv = () => {
    const csv = Papa.unparse(rows.map((r) => ({
      time: r.created_at,
      actor: r.actor?.name ?? r.actor?.email ?? r.actor_user_id ?? '—',
      role: r.actor_role ?? '—',
      action: r.action,
      entity_type: r.entity_type ?? '',
      entity_id: r.entity_id ?? '',
      description: describeAction(r.action, r.payload),
    })));
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `crestio-activity-${Date.now()}.csv`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const grouped = useMemo(() => {
    const map = new Map<string, typeof rows>();
    for (const r of rows) {
      const day = r.created_at.slice(0, 10);
      const list = map.get(day) ?? [];
      list.push(r);
      map.set(day, list);
    }
    return Array.from(map.entries());
  }, [rows]);

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex flex-wrap items-end gap-2">
        {scope === 'org' && (
          <input
            type="text"
            placeholder="Action (e.g. archived)"
            value={filters.action ?? ''}
            onChange={(e) => setFilters((f) => ({ ...f, action: e.target.value }))}
            className="input text-sm"
            style={{ maxWidth: 200 }}
          />
        )}
        <select
          value={filters.entity_type ?? ''}
          onChange={(e) => setFilters((f) => ({ ...f, entity_type: e.target.value || undefined }))}
          className="input text-sm"
          style={{ maxWidth: 160 }}
        >
          <option value="">All entities</option>
          {['student','household','parent','tutor','session','invoice','file','lesson_plan','session_template','message_thread'].map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <input
          type="date"
          value={filters.from?.slice(0, 10) ?? ''}
          onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value ? `${e.target.value}T00:00:00Z` : undefined }))}
          className="input text-sm"
          style={{ maxWidth: 160 }}
        />
        <input
          type="date"
          value={filters.to?.slice(0, 10) ?? ''}
          onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value ? `${e.target.value}T23:59:59Z` : undefined }))}
          className="input text-sm"
          style={{ maxWidth: 160 }}
        />
        <button type="button" onClick={exportCsv} className="btn-ghost text-xs">Export CSV</button>
      </div>

      {error && <div className="text-sm text-claret">{error}</div>}

      <div className="card overflow-hidden">
        {loading && rows.length === 0 ? (
          <div className="p-6 text-sm text-ink-muted">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-sm text-ink-muted text-center">No activity yet.</div>
        ) : (
          <ul className="divide-y divide-ruleSoft">
            {grouped.map(([day, dayRows]) => (
              <li key={day} className="bg-ruleSoft/20">
                <div className="px-4 py-2 text-2xs uppercase tracking-widest text-ink-soft">
                  {formatDay(day)}
                </div>
                <ul className="divide-y divide-ruleSoft bg-surface">
                  {dayRows.map((r) => {
                    const expanded = openRow === r.id;
                    return (
                      <li key={r.id} className="px-4 py-2.5 hover:bg-ruleSoft/30 transition-colors duration-100">
                        <button
                          type="button"
                          onClick={() => setOpenRow(expanded ? null : r.id)}
                          className="w-full flex items-center gap-3 text-left"
                        >
                          <div className="h-7 w-7 rounded-full bg-forest-soft text-forest-ink grid place-items-center text-2xs shrink-0">
                            {(r.actor?.name ?? r.actor?.email ?? '?').slice(0, 1).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm text-ink truncate">
                              <span className="font-medium">{r.actor?.name ?? r.actor?.email ?? 'Someone'}</span>
                              {' · '}
                              {describeAction(r.action, r.payload)}
                            </div>
                            <div className="text-2xs text-ink-soft tabular">
                              {formatTime(r.created_at)}
                              {r.actor_role && ` · ${r.actor_role}`}
                            </div>
                          </div>
                        </button>
                        {expanded && (
                          <pre className="mt-2 text-2xs text-ink-muted bg-ruleSoft/30 rounded p-2 overflow-x-auto">
                            {JSON.stringify({
                              action: r.action,
                              entity_type: r.entity_type,
                              entity_id: r.entity_id,
                              payload: r.payload,
                            }, null, 2)}
                          </pre>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </div>

      {hasMore && (
        <div className="flex justify-center">
          <button type="button" onClick={() => void loadMore()} className="btn-ghost text-xs">
            Load more
          </button>
        </div>
      )}
    </div>
  );
}

function formatDay(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z');
  return d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' });
}
function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export default AuditLogPage;
