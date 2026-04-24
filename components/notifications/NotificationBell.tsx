import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
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

type UnreadInfo = { total: number; hasUrgent: boolean };

type Props = {
  mode: 'tutor' | 'parent';
};

// Bell icon + dropdown/sheet. Drops into the top bar of Layout (tutor) or
// the parent dashboard nav.

export function NotificationBell({ mode }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState<UnreadInfo>({ total: 0, hasUrgent: false });
  const [notifs, setNotifs] = useState<Notif[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const fetchUnread = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch('/api/notifications/unread-count', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) return;
      const p = await res.json();
      setUnread({ total: p.total ?? 0, hasUrgent: !!p.has_urgent });
    } catch { /* ignore */ }
  }, []);

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch('/api/notifications?limit=30', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) return;
      const p = await res.json();
      setNotifs(p.notifications ?? []);
      setUnread({
        total: p.unread_count ?? 0,
        hasUrgent: (p.notifications ?? []).some((n: any) =>
          ['message_urgent', 'payment_failed', 'invoice_overdue'].includes(n.type)
          && !n.read_at && !n.dismissed_at,
        ),
      });
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetchUnread();
    const onFocus = () => fetchUnread();
    window.addEventListener('focus', onFocus);
    const interval = setInterval(fetchUnread, 60_000);
    return () => {
      window.removeEventListener('focus', onFocus);
      clearInterval(interval);
    };
  }, [fetchUnread, router.pathname]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(max-width: 767px)');
    setIsMobile(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    if (mq.addEventListener) mq.addEventListener('change', onChange);
    else mq.addListener(onChange);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener('change', onChange);
      else mq.removeListener(onChange);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    fetchList();
    function onDown(e: MouseEvent) {
      if (!rootRef.current) return;
      if (e.target instanceof Node && !rootRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, fetchList]);

  async function markRead(id: string) {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      await fetch(`/api/notifications/${id}/read`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
    } catch { /* ignore */ }
  }

  async function markAllRead() {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      await fetch('/api/notifications/read-all', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      setNotifs((prev) => prev?.map((n) => ({
        ...n, read_at: n.read_at ?? new Date().toISOString(),
      })) ?? prev);
      setUnread({ total: 0, hasUrgent: false });
    } catch { /* ignore */ }
  }

  async function dismiss(id: string) {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      await fetch(`/api/notifications/${id}/dismiss`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      setNotifs((prev) => prev?.filter((n) => n.id !== id) ?? prev);
    } catch { /* ignore */ }
  }

  async function handleRowClick(n: Notif) {
    if (!n.read_at) {
      setNotifs((prev) => prev?.map((x) => x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x) ?? prev);
      setUnread((u) => ({ ...u, total: Math.max(0, u.total - 1) }));
      markRead(n.id);
    }
    setOpen(false);
    if (n.link_url) router.push(n.link_url);
  }

  const allHref = mode === 'tutor' ? '/app/notifications' : '/parent/notifications';

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Notifications"
        className="relative p-2 rounded hover:bg-ruleSoft transition-colors"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="text-ink">
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/>
          <path d="M10 21a2 2 0 0 0 4 0"/>
        </svg>
        {unread.total > 0 && (
          <span
            className={cx(
              'absolute top-0.5 right-0.5 inline-flex items-center justify-center text-[10px] font-medium rounded-full px-1 min-w-[16px] h-4',
              unread.hasUrgent ? 'bg-claret text-cream' : 'bg-forest text-cream',
            )}
          >
            {unread.total > 9 ? '9+' : unread.total}
          </span>
        )}
      </button>

      {open && !isMobile && (
        <div
          role="dialog"
          aria-label="Notifications"
          className="absolute right-0 top-full mt-1 z-50 w-96 max-w-[95vw] bg-surface border border-rule rounded shadow-lift py-1 animate-fade-in"
        >
          <BellContent
            notifs={notifs}
            loading={loading}
            unreadTotal={unread.total}
            onRowClick={handleRowClick}
            onMarkAllRead={markAllRead}
            onDismiss={dismiss}
            allHref={allHref}
          />
        </div>
      )}

      {open && isMobile && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Notifications"
          className="fixed inset-0 z-50 bg-ink/40"
          onClick={() => setOpen(false)}
        >
          <div
            className="absolute inset-x-0 bottom-0 top-14 bg-surface rounded-t-xl pb-safe overflow-y-auto animate-slide-up"
            onClick={(e) => e.stopPropagation()}
          >
            <BellContent
              notifs={notifs}
              loading={loading}
              unreadTotal={unread.total}
              onRowClick={handleRowClick}
              onMarkAllRead={markAllRead}
              onDismiss={dismiss}
              allHref={allHref}
              onClose={() => setOpen(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function BellContent({
  notifs, loading, unreadTotal, onRowClick, onMarkAllRead, onDismiss, allHref, onClose,
}: {
  notifs: Notif[] | null;
  loading: boolean;
  unreadTotal: number;
  onRowClick: (n: Notif) => void;
  onMarkAllRead: () => void;
  onDismiss: (id: string) => void;
  allHref: string;
  onClose?: () => void;
}) {
  return (
    <>
      <div className="px-4 py-3 border-b border-rule flex items-center justify-between">
        <div className="font-display text-lg tracking-tightest">Notifications</div>
        <div className="flex items-center gap-3">
          {unreadTotal > 0 && (
            <button type="button" onClick={onMarkAllRead} className="text-2xs text-forest hover:text-forest-ink underline">
              Mark all read
            </button>
          )}
          {onClose && (
            <button type="button" onClick={onClose} aria-label="Close" className="text-ink-soft">
              ×
            </button>
          )}
        </div>
      </div>

      {loading && !notifs ? (
        <div className="p-6 text-sm text-ink-muted text-center">Loading…</div>
      ) : !notifs || notifs.length === 0 ? (
        <div className="p-8 text-center">
          <div className="text-sm text-ink-muted">Nothing yet.</div>
          <div className="text-2xs text-ink-soft mt-1">
            We'll surface reminders, parent messages, and invoice updates here.
          </div>
        </div>
      ) : (
        <ul className="divide-y divide-ruleSoft max-h-[70vh] overflow-y-auto">
          {notifs.filter((n) => !n.dismissed_at).map((n) => {
            const unread = !n.read_at;
            return (
              <li key={n.id} className={cx('px-3 py-3 group hover:bg-ruleSoft/50', unread && 'bg-forest-soft/30')}>
                <button
                  type="button"
                  onClick={() => onRowClick(n)}
                  className="w-full text-left flex items-start gap-2"
                >
                  <span
                    className={cx(
                      'mt-1 w-1.5 h-1.5 rounded-full shrink-0',
                      unread
                        ? (['message_urgent', 'payment_failed', 'invoice_overdue'].includes(n.type) ? 'bg-claret' : 'bg-forest')
                        : 'bg-transparent',
                    )}
                  />
                  <span className="flex-1 min-w-0">
                    <span className={cx('block text-sm', unread ? 'text-ink font-medium' : 'text-ink')}>
                      {n.title}
                    </span>
                    {n.body && (
                      <span className="block text-2xs text-ink-muted mt-0.5 line-clamp-2 whitespace-pre-wrap">
                        {n.body}
                      </span>
                    )}
                    <span className="block text-2xs text-ink-soft mt-1">
                      {formatRelativeDay(n.created_at)} · {formatTimeOfDay(n.created_at)}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onDismiss(n.id); }}
                    aria-label="Dismiss"
                    className="text-ink-soft hover:text-ink text-sm opacity-0 group-hover:opacity-100 transition-opacity"
                  >×</button>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="px-4 py-2 border-t border-rule">
        <Link href={allHref} className="text-xs text-ink-muted hover:text-ink">
          View all notifications →
        </Link>
      </div>
    </>
  );
}

export default NotificationBell;
