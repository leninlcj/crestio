import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { supabase } from '../../lib/supabase';
import { cx } from '../../lib/utils';
import { useTimeAgo } from '../../lib/useTimeAgo';

// Notification center popover. 400px wide, sectioned (Today / Earlier this
// week / Older), per-row "Take action" links, mark-all-read, settings link.
// Polls every 60s when tab is focused; pauses when blurred.

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

type Props = {
  mode: 'tutor' | 'parent';
};

export function NotificationCenter({ mode }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [hasUrgent, setHasUrgent] = useState(false);
  const [notifs, setNotifs] = useState<Notif[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  // Live "count" so the badge animates.
  const fetchUnread = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch('/api/notifications/unread-count', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) return;
      const p = await res.json();
      setUnread(p.total ?? 0);
      setHasUrgent(!!p.has_urgent);
    } catch { /* ignore */ }
  }, []);

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch('/api/notifications?limit=40', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) return;
      const p = await res.json();
      setNotifs(p.notifications ?? []);
      setUnread(p.unread_count ?? 0);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetchUnread();
    let interval: ReturnType<typeof setInterval> | null = null;
    function start() {
      if (interval) return;
      interval = setInterval(fetchUnread, 60_000);
    }
    function stop() {
      if (interval) { clearInterval(interval); interval = null; }
    }
    if (!document.hidden) start();
    function onVis() { if (document.hidden) stop(); else { fetchUnread(); start(); } }
    function onFocus() { fetchUnread(); }
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', onFocus);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('focus', onFocus);
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
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false); }
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
    } catch { /* */ }
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
      setUnread(0);
      setHasUrgent(false);
    } catch { /* */ }
  }

  async function handleRowClick(n: Notif) {
    if (!n.read_at) {
      setNotifs((prev) => prev?.map((x) => x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x) ?? prev);
      setUnread((u) => Math.max(0, u - 1));
      markRead(n.id);
    }
    setOpen(false);
    if (n.link_url) router.push(n.link_url);
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Notifications"
        aria-haspopup="menu"
        aria-expanded={open}
        className="relative p-2 rounded hover:bg-ruleSoft transition-colors"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="text-ink">
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/>
          <path d="M10 21a2 2 0 0 0 4 0"/>
        </svg>
        {unread > 0 && (
          <span
            className={cx(
              'absolute top-0.5 right-0.5 inline-flex items-center justify-center text-[10px] font-medium rounded-full px-1 min-w-[16px] h-4',
              hasUrgent ? 'bg-claret text-cream' : 'bg-forest text-cream',
            )}
          >
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && !isMobile && (
        <div
          role="dialog"
          aria-label="Notifications"
          className="absolute right-0 top-full mt-1 z-50 w-[400px] max-w-[95vw] bg-surface border border-rule rounded-md shadow-lift animate-fade-in overflow-hidden"
        >
          <CenterContent
            mode={mode}
            notifs={notifs}
            loading={loading}
            unread={unread}
            onRowClick={handleRowClick}
            onMarkAllRead={markAllRead}
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
            <CenterContent
              mode={mode}
              notifs={notifs}
              loading={loading}
              unread={unread}
              onRowClick={handleRowClick}
              onMarkAllRead={markAllRead}
              onClose={() => setOpen(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------
// Inner content
// ----------------------------------------------------------------------

function CenterContent({
  mode, notifs, loading, unread, onRowClick, onMarkAllRead, onClose,
}: {
  mode: 'tutor' | 'parent';
  notifs: Notif[] | null;
  loading: boolean;
  unread: number;
  onRowClick: (n: Notif) => void;
  onMarkAllRead: () => void;
  onClose?: () => void;
}) {
  const sections = groupBySection(notifs ?? []);
  const settingsHref = mode === 'tutor' ? '/app/settings/notifications' : '/parent/settings';
  const [showOlder, setShowOlder] = useState(false);

  return (
    <>
      <div className="px-4 py-3 border-b border-rule flex items-center justify-between">
        <div className="font-display text-[16px] tracking-tightest font-semibold">Notifications</div>
        <div className="flex items-center gap-3">
          {unread > 0 && (
            <button
              type="button"
              onClick={onMarkAllRead}
              className="text-2xs text-forest hover:text-forest-ink underline"
            >
              Mark all read
            </button>
          )}
          <Link href={settingsHref} className="text-2xs text-ink-muted hover:text-ink underline">
            Settings
          </Link>
          {onClose && (
            <button type="button" onClick={onClose} aria-label="Close" className="text-ink-soft p-1 -mr-1">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M6 6l12 12M6 18L18 6"/>
              </svg>
            </button>
          )}
        </div>
      </div>

      {loading && !notifs ? (
        <NotifSkeleton />
      ) : !notifs || notifs.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="max-h-[70vh] overflow-y-auto">
          {sections.today.length > 0 && (
            <Section title="Today" notifs={sections.today} onRowClick={onRowClick} />
          )}
          {sections.thisWeek.length > 0 && (
            <Section title="Earlier this week" notifs={sections.thisWeek} onRowClick={onRowClick} />
          )}
          {sections.older.length > 0 && (
            <div>
              <button
                type="button"
                onClick={() => setShowOlder((v) => !v)}
                className="w-full px-4 py-2 text-2xs uppercase tracking-widest text-ink-muted font-medium border-t border-rule flex items-center justify-between hover:bg-ruleSoft/40"
              >
                <span>Older ({sections.older.length})</span>
                <span className="text-ink-soft">{showOlder ? '▴' : '▾'}</span>
              </button>
              {showOlder && <Section title="" notifs={sections.older} onRowClick={onRowClick} compact />}
            </div>
          )}
        </div>
      )}
    </>
  );
}

function Section({
  title, notifs, onRowClick, compact,
}: {
  title: string;
  notifs: Notif[];
  onRowClick: (n: Notif) => void;
  compact?: boolean;
}) {
  return (
    <section>
      {title && (
        <div className="px-4 pt-3 pb-1 text-2xs uppercase tracking-widest text-ink-soft font-medium">
          {title}
        </div>
      )}
      <ul className="divide-y divide-ruleSoft">
        {notifs.filter((n) => !n.dismissed_at).map((n) => (
          <NotifRow key={n.id} notif={n} onClick={() => onRowClick(n)} compact={compact} />
        ))}
      </ul>
    </section>
  );
}

function NotifRow({
  notif, onClick, compact,
}: {
  notif: Notif;
  onClick: () => void;
  compact?: boolean;
}) {
  const ago = useTimeAgo(notif.created_at);
  const unread = !notif.read_at;
  const isUrgent = ['message_urgent', 'payment_failed', 'invoice_overdue'].includes(notif.type);
  const accent = isUrgent ? 'bg-claret' : 'bg-forest';
  const action = takeActionLabel(notif.type);

  return (
    <li className={cx('group', unread && 'bg-forest-soft/20')}>
      <button
        type="button"
        onClick={onClick}
        className="w-full text-left flex items-start gap-2.5 px-4 py-3"
      >
        <span className="mt-1.5 shrink-0">
          <span className={cx('block w-1.5 h-1.5 rounded-full', unread ? accent : 'bg-transparent')} />
        </span>
        <span className="flex-1 min-w-0">
          <span className={cx('block text-sm leading-snug', unread ? 'font-medium text-ink' : 'text-ink')}>
            <NotifIcon type={notif.type} /> {notif.title}
          </span>
          {notif.body && !compact && (
            <span className="block text-2xs text-ink-muted mt-0.5 line-clamp-2 whitespace-pre-wrap">
              {notif.body}
            </span>
          )}
          <span className="block text-2xs text-ink-soft mt-1 num tabular">
            {ago}
            {action && notif.link_url && (
              <span className="ml-2 text-forest">{action}</span>
            )}
          </span>
        </span>
      </button>
    </li>
  );
}

function NotifIcon({ type }: { type: string }) {
  // Tiny inline icon prefix — single character for now to avoid SVG sprawl.
  const map: Record<string, string> = {
    invoice_paid: '○',
    invoice_overdue: '!',
    message_received: '✉',
    message_urgent: '!',
    session_rescheduled: '◷',
    session_proposed: '◷',
    parent_accepted: '✓',
    payment_failed: '!',
    template_generated: '↻',
  };
  const ch = map[type];
  if (!ch) return null;
  return <span className="text-ink-muted text-2xs mr-1">{ch}</span>;
}

function takeActionLabel(type: string): string | null {
  switch (type) {
    case 'invoice_paid': return 'View';
    case 'message_received': case 'message_urgent': return 'Reply';
    case 'session_proposed': return 'Review';
    case 'invoice_overdue': return 'Send reminder';
    case 'parent_accepted': return null;
    case 'tutor_joined': return null;
    case 'template_generated': return 'Review';
    default: return null;
  }
}

function groupBySection(notifs: Notif[]): {
  today: Notif[]; thisWeek: Notif[]; older: Notif[];
} {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const weekStart = new Date(today);
  const dow = today.getDay();
  weekStart.setDate(today.getDate() - (dow === 0 ? 6 : dow - 1));

  const out = { today: [] as Notif[], thisWeek: [] as Notif[], older: [] as Notif[] };
  for (const n of notifs) {
    const t = new Date(n.created_at).getTime();
    if (t >= today.getTime()) out.today.push(n);
    else if (t >= weekStart.getTime()) out.thisWeek.push(n);
    else out.older.push(n);
  }
  return out;
}

function EmptyState() {
  return (
    <div className="p-8 text-center">
      <div className="mx-auto mb-3 grid place-items-center w-10 h-10 rounded-full bg-ruleSoft text-ink-muted">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/>
          <path d="M10 21a2 2 0 0 0 4 0"/>
        </svg>
      </div>
      <div className="text-sm text-ink">You're all caught up.</div>
    </div>
  );
}

function NotifSkeleton() {
  return (
    <div className="divide-y divide-ruleSoft">
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="px-4 py-3 flex items-start gap-2.5">
          <div className="w-1.5 h-1.5 rounded-full bg-ruleSoft mt-1.5 shrink-0" />
          <div className="flex-1">
            <div className="skeleton-shimmer h-3 w-2/3 mb-2 rounded" />
            <div className="skeleton-shimmer h-2.5 w-1/2 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default NotificationCenter;
