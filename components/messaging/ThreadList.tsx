import { activeLocale } from '../../lib/utils';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import type { ThreadSummary, Viewer } from './types';
import EmptyState from '../EmptyState';
import { IconMessage } from '../design/icons';

// Thread list — used on /app/messages and /parent/messages.
// Caller passes the base link (`/app/messages` or `/parent/messages`) so we
// can build correct <Link> hrefs without routing introspection.

type Props = {
  basePath: '/app/messages' | '/parent/messages';
  allowArchiveToggle?: boolean; // only true for tutor viewers
};

function relativeTime(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const mins = Math.round(diffMs / 60_000);
  const hours = Math.round(diffMs / 3_600_000);
  const days = Math.round(diffMs / 86_400_000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return d.toLocaleDateString(activeLocale(), { weekday: 'short' });
  return d.toLocaleDateString(activeLocale(), { day: 'numeric', month: 'short' });
}

export function ThreadList({ basePath, allowArchiveToggle }: Props) {
  const { t } = useTranslation('messages');
  const [threads, setThreads] = useState<ThreadSummary[] | null>(null);
  const [viewer, setViewer] = useState<Viewer | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  // basePath is the source of truth for POV — works even before the threads
  // API responds, so the empty state copy doesn't briefly render the wrong
  // perspective (P1-2.1).
  const isTutorView = basePath === '/app/messages';

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) { setError('Not signed in.'); return; }
        const params = new URLSearchParams();
        if (unreadOnly) params.set('has_unread', 'true');
        if (showArchived) params.set('archived', 'true');
        const res = await fetch(`/api/messages/threads?${params.toString()}`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (!res.ok) { setError('Could not load messages.'); return; }
        const payload = await res.json();
        setThreads(payload.threads ?? []);
        setViewer(payload.viewer ?? null);
      } finally { setLoading(false); }
    })();
  }, [unreadOnly, showArchived]);

  const filtered = useMemo(() => {
    if (!threads) return [];
    if (!query.trim()) return threads;
    const q = query.trim().toLowerCase();
    return threads.filter((t) =>
      (t.student_name ?? '').toLowerCase().includes(q)
      || (t.parent_name ?? '').toLowerCase().includes(q)
      || (t.tutor_name ?? '').toLowerCase().includes(q),
    );
  }, [threads, query]);

  return (
    <div className="max-w-3xl">
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by student or parent name"
          className="input flex-1 min-w-[180px]"
        />
        <label className="flex items-center gap-2 text-xs text-ink-muted cursor-pointer">
          <input
            type="checkbox"
            checked={unreadOnly}
            onChange={(e) => setUnreadOnly(e.target.checked)}
            className="h-4 w-4 accent-forest"
          />
          Unread only
        </label>
        {allowArchiveToggle && (
          <label className="flex items-center gap-2 text-xs text-ink-muted cursor-pointer">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
              className="h-4 w-4 accent-forest"
            />
            Show archived
          </label>
        )}
      </div>

      {loading ? (
        <div className="card p-6 text-sm text-ink-muted">Loading…</div>
      ) : error ? (
        <div className="card p-6 text-sm text-claret">{error}</div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<IconMessage />}
          title={t('empty.kicker')}
          description={isTutorView ? t('empty.body_tutor') : t('empty.body_parent')}
        />
      ) : (
        <ul className="divide-y divide-rule border border-rule rounded bg-surface overflow-hidden">
          {filtered.map((t) => {
            const other = viewer === 'tutor'
              ? (t.parent_name ?? 'Parent')
              : (t.tutor_name ?? 'Your tutor');
            const dotColor =
              t.has_urgent_unread ? 'bg-claret' :
              t.unread_count > 0 ? 'bg-forest' :
              null;
            return (
              <li key={t.id}>
                <Link
                  href={`${basePath}/${t.id}`}
                  className="flex items-start gap-3 px-4 py-3 hover:bg-ruleSoft/50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="text-sm font-medium text-ink truncate">
                        {t.student_name}
                      </div>
                      <div className="text-2xs text-ink-muted truncate">· with {other}</div>
                      {t.archived && (
                        <span className="text-2xs uppercase tracking-widest text-ink-soft ml-auto shrink-0">
                          Archived
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-ink-muted mt-0.5 line-clamp-2">
                      {t.last_message_preview ?? 'No messages yet'}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <div className="text-2xs text-ink-soft whitespace-nowrap">
                      {relativeTime(t.last_message_at)}
                    </div>
                    {dotColor && (
                      <span className={`inline-block w-2 h-2 rounded-full ${dotColor}`} title={`${t.unread_count} unread`} />
                    )}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default ThreadList;
