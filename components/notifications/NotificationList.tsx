import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../../lib/supabase';
import { cx } from '../../lib/utils';
import { formatRelativeDay, formatTimeOfDay } from '../../lib/formatTime';

type Notif = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link_url: string | null;
  created_at: string;
  read_at: string | null;
  dismissed_at: string | null;
};

type Filter = 'all' | 'unread';

export function NotificationList() {
  const router = useRouter();
  const [notifs, setNotifs] = useState<Notif[] | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch('/api/notifications?limit=100', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) return;
      const p = await res.json();
      setNotifs(p.notifications ?? []);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const visible = (notifs ?? []).filter((n) => !n.dismissed_at && (filter === 'all' || !n.read_at));
  const unreadCount = (notifs ?? []).filter((n) => !n.read_at && !n.dismissed_at).length;

  async function markRead(id: string) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return;
    await fetch(`/api/notifications/${id}/read`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    setNotifs((prev) => prev?.map((x) => x.id === id ? { ...x, read_at: new Date().toISOString() } : x) ?? prev);
  }
  async function markAll() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return;
    await fetch('/api/notifications/read-all', {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    await load();
  }
  async function dismiss(id: string) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return;
    await fetch(`/api/notifications/${id}/dismiss`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    setNotifs((prev) => prev?.filter((n) => n.id !== id) ?? prev);
  }

  function handleRowClick(n: Notif) {
    if (!n.read_at) markRead(n.id);
    if (n.link_url) router.push(n.link_url);
  }

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div className="inline-flex border border-rule rounded bg-surface p-1 gap-1">
          <button
            type="button"
            onClick={() => setFilter('all')}
            className={cx('px-3 py-1 text-xs rounded', filter === 'all' ? 'bg-forest text-cream' : 'text-ink-muted hover:text-ink')}
          >
            All
          </button>
          <button
            type="button"
            onClick={() => setFilter('unread')}
            className={cx('px-3 py-1 text-xs rounded', filter === 'unread' ? 'bg-forest text-cream' : 'text-ink-muted hover:text-ink')}
          >
            Unread {unreadCount > 0 && <span className="text-2xs opacity-80">({unreadCount})</span>}
          </button>
        </div>
        {unreadCount > 0 && (
          <button type="button" onClick={markAll} className="text-xs text-forest hover:text-forest-ink underline">
            Mark all read
          </button>
        )}
      </div>

      {loading && !notifs ? (
        <div className="card p-6 text-sm text-ink-muted">Loading…</div>
      ) : visible.length === 0 ? (
        <div className="card p-10 text-center">
          <div className="text-2xs uppercase tracking-widest text-ink-muted mb-2">
            {filter === 'unread' ? 'No unread' : 'No notifications yet'}
          </div>
          <p className="text-sm text-ink-muted">
            We'll surface reminders, parent messages, and invoice updates here.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-rule border border-rule rounded bg-surface overflow-hidden">
          {visible.map((n) => {
            const unread = !n.read_at;
            const isUrgent = ['message_urgent', 'payment_failed', 'invoice_overdue'].includes(n.type);
            return (
              <li key={n.id} className={cx('group hover:bg-ruleSoft/50', unread && 'bg-forest-soft/30')}>
                <button
                  type="button"
                  onClick={() => handleRowClick(n)}
                  className="w-full text-left flex items-start gap-3 px-4 py-3"
                >
                  <span
                    className={cx(
                      'mt-1 w-2 h-2 rounded-full shrink-0',
                      unread ? (isUrgent ? 'bg-claret' : 'bg-forest') : 'bg-transparent',
                    )}
                  />
                  <span className="flex-1 min-w-0">
                    <span className={cx('block text-sm', unread ? 'text-ink font-medium' : 'text-ink')}>
                      {n.title}
                    </span>
                    {n.body && (
                      <span className="block text-xs text-ink-muted mt-0.5 whitespace-pre-wrap line-clamp-3">
                        {n.body}
                      </span>
                    )}
                    <span className="block text-2xs text-ink-soft mt-1">
                      {formatRelativeDay(n.created_at)} · {formatTimeOfDay(n.created_at)}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); dismiss(n.id); }}
                    aria-label="Dismiss"
                    className="text-ink-soft hover:text-ink text-sm opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                  >×</button>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default NotificationList;
