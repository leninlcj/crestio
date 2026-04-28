import { useCallback, useEffect, useState } from 'react';
import { authFetch } from './authFetch';

export type AuditRow = {
  id: string;
  actor_user_id: string | null;
  actor_role: 'owner' | 'tutor' | 'parent' | 'student' | 'system' | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  payload: Record<string, unknown>;
  created_at: string;
  actor: { name: string | null; email: string | null } | null;
};

export type AuditFilters = {
  actor?: string;
  entity_type?: string;
  entity_id?: string;
  action?: string;
  from?: string;
  to?: string;
  limit?: number;
};

export function useAuditLog(filters: AuditFilters = {}) {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const buildUrl = useCallback((cursor?: string | null) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(filters)) {
      if (v != null && v !== '') params.set(k, String(v));
    }
    if (cursor) params.set('cursor', cursor);
    return `/api/audit-log${params.toString() ? `?${params.toString()}` : ''}`;
  }, [filters]);

  const load = useCallback(async (mode: 'fresh' | 'append' = 'fresh') => {
    setLoading(true);
    setError(null);
    try {
      const cursor = mode === 'append' ? nextCursor : null;
      const res = await authFetch(buildUrl(cursor));
      if (!res.ok) throw new Error('Could not load activity.');
      const data = await res.json();
      setRows((prev) => mode === 'append' ? [...prev, ...(data.rows ?? [])] : (data.rows ?? []));
      setNextCursor(data.next_cursor ?? null);
    } catch (e: any) {
      setError(e?.message ?? 'Could not load activity.');
    } finally {
      setLoading(false);
    }
  }, [buildUrl, nextCursor]);

  useEffect(() => { void load('fresh'); /* eslint-disable-line react-hooks/exhaustive-deps */ }, [JSON.stringify(filters)]);

  return { rows, loading, error, hasMore: !!nextCursor, loadMore: () => load('append'), refresh: () => load('fresh') };
}
