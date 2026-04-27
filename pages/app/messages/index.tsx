import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useTranslation } from 'react-i18next';
import AuthGuard from '../../../components/AuthGuard';
import Layout from '../../../components/Layout';
import { supabase } from '../../../lib/supabase';
import type { ThreadSummary, Viewer } from '../../../components/messaging/types';
import ThreadView from '../../../components/messaging/ThreadView';
import EmptyState from '../../../components/EmptyState';
import { IconMessage } from '../../../components/design/icons';
import { Skeleton } from '../../../components/design/Skeleton';
import { useKeyboard } from '../../../lib/useKeyboard';
import { activeLocale, cx } from '../../../lib/utils';

function MessagesInner() {
  const { t } = useTranslation('messages');
  const router = useRouter();
  const [threads, setThreads] = useState<ThreadSummary[] | null>(null);
  const [viewer, setViewer] = useState<Viewer | null>(null);
  const [loading, setLoading] = useState(true);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [query, setQuery] = useState('');

  const selectedId = router.query.thread === undefined
    ? null
    : (Array.isArray(router.query.thread) ? router.query.thread[0] : router.query.thread);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) { setLoading(false); return; }
      const params = new URLSearchParams();
      if (unreadOnly) params.set('has_unread', 'true');
      if (showArchived) params.set('archived', 'true');
      const res = await fetch(`/api/messages/threads?${params.toString()}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) { if (!cancelled) setLoading(false); return; }
      const payload = await res.json();
      if (!cancelled) {
        setThreads(payload.threads ?? []);
        setViewer(payload.viewer ?? null);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
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

  const activeIdx = filtered.findIndex((t) => t.id === selectedId);

  function selectThread(id: string | null) {
    const url = new URL(window.location.href);
    if (id) url.searchParams.set('thread', id);
    else url.searchParams.delete('thread');
    router.replace(url.pathname + url.search, undefined, { shallow: true });
  }
  function moveSelection(delta: number) {
    if (filtered.length === 0) return;
    const next = Math.max(0, Math.min(filtered.length - 1, (activeIdx === -1 ? 0 : activeIdx) + delta));
    selectThread(filtered[next].id);
  }
  useKeyboard('listDown', () => moveSelection(1));
  useKeyboard('listUp',   () => moveSelection(-1));

  return (
    <Layout subtitle={t('subtitle')} title={t('title_list')}>
      <div className="card overflow-hidden grid grid-cols-1 md:grid-cols-[320px_1fr]" style={{ minHeight: 'calc(100vh - 240px)' }}>
        {/* Thread list */}
        <aside className={cx('border-r border-rule flex flex-col min-h-0', selectedId && 'hidden md:flex')}>
          <div className="px-3 py-2.5 border-b border-rule flex items-center gap-2">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search…"
              className="input flex-1 h-8 text-xs"
            />
          </div>
          <div className="px-3 py-1.5 border-b border-rule flex items-center gap-3 text-2xs text-ink-muted">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" checked={unreadOnly} onChange={(e) => setUnreadOnly(e.target.checked)} className="h-3 w-3 accent-forest" />
              Unread
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} className="h-3 w-3 accent-forest" />
              Archived
            </label>
          </div>
          <ul className="flex-1 min-h-0 overflow-y-auto divide-y divide-ruleSoft">
            {loading ? (
              Array.from({ length: 6 }, (_, i) => (
                <li key={i} className="px-3 py-2.5"><Skeleton className="h-3 w-2/3 mb-1" /><Skeleton className="h-2.5 w-1/2" /></li>
              ))
            ) : filtered.length === 0 ? (
              <li className="p-6">
                <EmptyState
                  icon={<IconMessage />}
                  title="No messages."
                  description={query ? 'Nothing matches that search.' : 'Threads will appear here once parents reach out.'}
                />
              </li>
            ) : (
              filtered.map((th) => {
                const other = viewer === 'tutor'
                  ? (th.parent_name ?? 'Parent')
                  : (th.tutor_name ?? 'Your tutor');
                const dotColor = th.has_urgent_unread ? 'bg-claret' : th.unread_count > 0 ? 'bg-forest' : null;
                const isActive = selectedId === th.id;
                return (
                  <li key={th.id}>
                    <button
                      type="button"
                      onClick={() => selectThread(th.id)}
                      className={cx(
                        'w-full text-left px-3 py-2.5 flex items-start gap-2 transition-colors duration-100',
                        isActive ? 'bg-forest-soft/40 border-l-2 border-forest' : 'hover:bg-ruleSoft/40 border-l-2 border-transparent',
                      )}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-1.5">
                          <div className={cx('text-[13px] truncate', th.unread_count > 0 ? 'font-medium text-ink' : 'text-ink')}>
                            {th.student_name}
                          </div>
                          <div className="text-2xs text-ink-soft truncate">· {other}</div>
                        </div>
                        <div className="text-2xs text-ink-muted mt-0.5 line-clamp-1">
                          {th.last_message_preview ?? 'No messages yet'}
                        </div>
                      </div>
                      <div className="flex flex-col items-end shrink-0 gap-0.5">
                        <span className="text-2xs text-ink-soft tabular">{relativeTime(th.last_message_at)}</span>
                        {dotColor && <span className={`inline-block w-2 h-2 rounded-full ${dotColor}`} />}
                      </div>
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </aside>

        {/* Thread content */}
        <section className={cx('min-h-0 flex flex-col', !selectedId && 'hidden md:flex')}>
          {selectedId ? (
            <div className="flex-1 min-h-0 overflow-y-auto">
              <div className="md:hidden px-3 py-2 border-b border-rule">
                <button
                  type="button"
                  onClick={() => selectThread(null)}
                  className="text-xs text-ink-muted hover:text-ink"
                >
                  ← Back to threads
                </button>
              </div>
              <ThreadView threadId={selectedId} backHref="/app/messages" />
            </div>
          ) : (
            <div className="flex-1 grid place-items-center text-center p-8">
              <div>
                <div className="mx-auto mb-3 w-6 h-6 text-ink-soft">
                  <IconMessage />
                </div>
                <div className="text-sm text-ink">Pick a thread to read.</div>
                <div className="text-xs text-ink-muted mt-1">J/K to navigate · ⌘K to search.</div>
              </div>
            </div>
          )}
        </section>
      </div>
    </Layout>
  );
}

function relativeTime(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const mins = Math.round(diffMs / 60_000);
  const hours = Math.round(diffMs / 3_600_000);
  const days = Math.round(diffMs / 86_400_000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  if (hours < 24) return `${hours}h`;
  if (days < 7) return d.toLocaleDateString(activeLocale(), { weekday: 'short' });
  return d.toLocaleDateString(activeLocale(), { day: 'numeric', month: 'short' });
}

export default function Page() {
  return <AuthGuard><MessagesInner /></AuthGuard>;
}
