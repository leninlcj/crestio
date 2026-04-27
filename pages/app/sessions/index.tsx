import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useTranslation } from 'react-i18next';
import AuthGuard from '../../../components/AuthGuard';
import Layout from '../../../components/Layout';
import EmptyState from '../../../components/EmptyState';
import { IconCalendar, IconCoin, IconClock, IconArchive } from '../../../components/design/icons';
import { Skeleton } from '../../../components/design/Skeleton';
import { FilterChips, type ChipOption } from '../../../components/design/FilterChips';
import { SavedViewsMenu } from '../../../components/design/SavedViewsMenu';
import { BulkActionBar } from '../../../components/design/BulkActionBar';
import { MiniCalendar } from '../../../components/design/MiniCalendar';
import { StatusPill } from '../../../components/design/StatusPill';
import { useDetailParam } from '../../../components/design/DetailPane';
import dynamic from 'next/dynamic';
const SessionDetailPane = dynamic(
  () => import('../../../components/sessions/SessionDetailPane').then((m) => m.SessionDetailPane),
  { ssr: false },
);
import { ContextMenu, type ContextMenuItem } from '../../../components/design/ContextMenu';
import { Tooltip } from '../../../components/design/Tooltip';
import { Avatar } from '../../../components/design/Avatar';
import { useToast } from '../../../components/design/Toast';
import { useNowMinute } from '../../../components/design/NowLine';
import SampleDataBanner from '../../../components/SampleDataBanner';
import { supabase } from '../../../lib/supabase';
import { useMembership } from '../../../lib/membershipContext';
import { Session, Student, Tutor } from '../../../lib/types';
import { useKeyboard } from '../../../lib/useKeyboard';
import {
  formatCents,
  formatDate,
  formatTime,
  sessionAmount,
  cx,
} from '../../../lib/utils';

type Tab = 'today' | 'upcoming' | 'past' | 'polish-queue';
type SessionRow = Session & { student: Student | null; tutor: Tutor | null };

function startOfDay(d: Date) { const x = new Date(d); x.setHours(0,0,0,0); return x; }
function endOfDay(d: Date)   { const x = new Date(d); x.setHours(23,59,59,999); return x; }

function SessionsInner() {
  const router = useRouter();
  const { t } = useTranslation(['sessions', 'common']);
  const { membership, loading: membershipLoading } = useMembership();
  const isTutor = membership?.role === 'tutor';

  const tab: Tab = (() => {
    const q = router.query.tab;
    if (q === 'past') return 'past';
    if (q === 'upcoming') return 'upcoming';
    if (q === 'polish-queue') return 'polish-queue';
    return 'today';
  })();

  // Date for the Today tab — defaults to today, navigable.
  const [activeDate, setActiveDate] = useState<Date>(() => startOfDay(new Date()));

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<SessionRow[]>([]);
  const [currency, setCurrency] = useState('AUD');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const detail = useDetailParam();
  const detailId = detail.value && detail.value.startsWith('session:')
    ? detail.value.slice('session:'.length)
    : null;

  // Filter chips for past/upcoming.
  const billingFilter = (router.query.status as string) ?? '';
  const filterParam = (router.query.filter as string) ?? '';

  useEffect(() => {
    // legacy ?filter=overdue compat for nudges (keeps the existing wiring).
    if (filterParam === 'overdue') {
      const url = new URL(window.location.href);
      url.searchParams.set('status', 'overdue');
      url.searchParams.delete('filter');
      router.replace(url.pathname + url.search);
    }
  }, [filterParam, router]);

  const [refreshTick, setRefreshTick] = useState(0);
  useEffect(() => {
    const bump = () => setRefreshTick((n) => n + 1);
    window.addEventListener('crestio:sessions-refresh', bump);
    return () => window.removeEventListener('crestio:sessions-refresh', bump);
  }, []);

  useEffect(() => {
    if (membershipLoading) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const { data: p } = await supabase
          .from('profiles').select('currency').eq('id', session.user.id).single();
        if (p?.currency) setCurrency(p.currency);
      }

      const nowIso = new Date().toISOString();
      let q = supabase
        .from('sessions')
        .select('*, student:students(id,name), tutor:tutors(id,name)');

      if (tab === 'today') {
        q = q.gte('scheduled_at', startOfDay(activeDate).toISOString())
             .lte('scheduled_at', endOfDay(activeDate).toISOString())
             .order('scheduled_at', { ascending: true });
      } else if (tab === 'upcoming') {
        q = q.gte('scheduled_at', nowIso)
             .eq('status', 'scheduled')
             .order('scheduled_at', { ascending: true });
      } else if (tab === 'past') {
        q = q.lt('scheduled_at', nowIso)
             .order('scheduled_at', { ascending: false });
        if (billingFilter === 'unbilled') {
          q = q.eq('status', 'completed').is('invoice_id', null);
        } else if (billingFilter === 'invoiced') {
          q = q.eq('status', 'completed').not('invoice_id', 'is', null).eq('paid', false);
        } else if (billingFilter === 'paid') {
          q = q.eq('status', 'completed').eq('paid', true);
        }
      }

      if (isTutor && session) q = q.eq('tutor_user_id', session.user.id);
      const { data } = await q.limit(200);
      if (cancelled) return;
      setRows((data ?? []) as any);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [tab, activeDate, billingFilter, membership, membershipLoading, isTutor, refreshTick]);

  // Keyboard list nav.
  const [activeIdx, setActiveIdx] = useState(0);
  useKeyboard('listDown', () => setActiveIdx((i) => Math.min(rows.length - 1, i + 1)));
  useKeyboard('listUp',   () => setActiveIdx((i) => Math.max(0, i - 1)));
  useKeyboard('listOpen', () => {
    const r = rows[activeIdx];
    if (r) detail.open(`session:${r.id}`);
  });
  useKeyboard('listSelect', () => {
    const r = rows[activeIdx];
    if (!r) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(r.id)) next.delete(r.id); else next.add(r.id);
      return next;
    });
  });
  useKeyboard('listSelectAll', () => {
    setSelected(new Set(rows.map((r) => r.id)));
  });

  // Marked dates for the mini-calendar (today tab only).
  const [markedDays, setMarkedDays] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (tab !== 'today') return;
    let cancelled = false;
    (async () => {
      const start = new Date(activeDate); start.setDate(start.getDate() - 7);
      const end = new Date(activeDate); end.setDate(end.getDate() + 7); end.setHours(23,59,59,999);
      let q = supabase.from('sessions').select('scheduled_at')
        .gte('scheduled_at', start.toISOString())
        .lte('scheduled_at', end.toISOString())
        .limit(500);
      if (isTutor) {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) q = q.eq('tutor_user_id', session.user.id);
      }
      const { data } = await q;
      if (cancelled) return;
      const set = new Set<string>();
      for (const row of (data ?? []) as { scheduled_at: string }[]) {
        set.add(row.scheduled_at.slice(0, 10));
      }
      setMarkedDays(set);
    })();
    return () => { cancelled = true; };
  }, [tab, activeDate, isTutor]);

  const tabs: Array<{ key: Tab; label: string; href: string }> = [
    { key: 'today',         label: 'Today',         href: '/app/sessions?tab=today' },
    { key: 'upcoming',      label: 'Upcoming',      href: '/app/sessions?tab=upcoming' },
    { key: 'past',          label: 'Past',          href: '/app/sessions?tab=past' },
    { key: 'polish-queue',  label: 'Polish queue',  href: '/app/sessions/polish-queue' },
  ];

  const upcomingGroups = useMemo(() => groupByDay(rows), [rows]);

  return (
    <Layout
      subtitle={t('sessions:subtitle')}
      title={t('sessions:title_list')}
      actions={<Link href="/app/sessions/new" className="btn-primary">{t('sessions:actions.new')}</Link>}
    >
      <div className="mb-4"><SampleDataBanner /></div>

      {/* Inner tabs (the nav-level TabStrip already exists; we render this for date + chips). */}
      <div className="flex items-center gap-1 mb-4 -mt-2 overflow-x-auto scrollbar-thin">
        {tabs.map((tt) => (
          <Link
            key={tt.key}
            href={tt.href}
            className={cx(
              'px-3 py-1.5 text-xs rounded-md transition-colors duration-100 whitespace-nowrap',
              tab === tt.key
                ? 'text-ink font-medium bg-ruleSoft/70'
                : 'text-ink-muted hover:text-ink hover:bg-ruleSoft/40',
            )}
          >
            {tt.label}
          </Link>
        ))}
        <Link
          href="/app/templates"
          className="px-3 py-1.5 text-xs text-ink-muted hover:text-ink hover:bg-ruleSoft/40 rounded-md whitespace-nowrap"
        >
          Templates
        </Link>
      </div>

      {tab === 'today' && (
        <div className="card p-3 md:p-4 mb-4 relative">
          <NowPill />
          <MiniCalendar
            value={activeDate}
            marked={markedDays}
            onChange={setActiveDate}
          />
        </div>
      )}

      {(tab === 'past' || tab === 'upcoming') && (
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          {tab === 'past' ? (
            <FilterChips
              ariaLabel="Billing status"
              options={[
                { value: '',         label: 'All' },
                { value: 'unbilled', label: 'Unbilled' },
                { value: 'invoiced', label: 'Invoiced' },
                { value: 'paid',     label: 'Paid' },
              ]}
              value={billingFilter}
              onChange={(next) => {
                const url = new URL(window.location.href);
                if (next) url.searchParams.set('status', next as string);
                else url.searchParams.delete('status');
                router.replace(url.pathname + url.search);
              }}
            />
          ) : <div />}
          <SavedViewsMenu listId={`sessions.${tab}`} />
        </div>
      )}

      {loading ? (
        <SessionsListSkeleton />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={tab === 'past' ? <IconArchive /> : tab === 'upcoming' ? <IconCalendar /> : <IconClock />}
          title={
            tab === 'today'
              ? `No sessions on ${formatDate(activeDate.toISOString())}.`
              : tab === 'past'
              ? 'No past sessions.'
              : 'No upcoming sessions.'
          }
          description={
            tab === 'today'
              ? 'Schedule one or pick a different day.'
              : tab === 'past'
              ? 'Once you log a session it lands here.'
              : 'Schedule one to fill your week.'
          }
          action={tab !== 'past'
            ? <Link href="/app/sessions/new" className="btn-primary">{t('sessions:actions.new')}</Link>
            : undefined
          }
        />
      ) : tab === 'upcoming' ? (
        <UpcomingGroupedList
          groups={upcomingGroups}
          currency={currency}
          activeIdx={activeIdx}
          onOpen={(id) => detail.open(`session:${id}`)}
          selected={selected}
          onToggleSelect={(id) =>
            setSelected((prev) => {
              const n = new Set(prev);
              if (n.has(id)) n.delete(id); else n.add(id);
              return n;
            })
          }
        />
      ) : (
        <SessionsList
          rows={rows}
          currency={currency}
          showBilling={tab === 'past'}
          activeIdx={activeIdx}
          onOpen={(id) => detail.open(`session:${id}`)}
          selected={selected}
          onToggleSelect={(id) =>
            setSelected((prev) => {
              const n = new Set(prev);
              if (n.has(id)) n.delete(id); else n.add(id);
              return n;
            })
          }
        />
      )}

      <BulkActionBar count={selected.size} onClear={() => setSelected(new Set())}>
        {(() => {
          const selectedRows = rows.filter((r) => selected.has(r.id));
          const householdGroups = new Map<string, number>();
          for (const r of selectedRows) {
            const k = (r.student as any)?.household_id ?? r.student?.id ?? 'none';
            householdGroups.set(k, (householdGroups.get(k) ?? 0) + 1);
          }
          const oneHousehold = householdGroups.size === 1 && selectedRows.length >= 3;
          return (
            <>
              {oneHousehold && (
                <button
                  type="button"
                  onClick={() => router.push(`/app/invoices/batch?session_ids=${Array.from(selected).join(',')}&combine=1`)}
                  className="text-xs font-medium bg-cream text-forest-ink px-2.5 py-1 rounded-full hover:bg-cream/90 transition-colors duration-100"
                >
                  Create one invoice for these {selectedRows.length} sessions
                </button>
              )}
              <button
                type="button"
                onClick={() => router.push(`/app/invoices/batch?session_ids=${Array.from(selected).join(',')}`)}
                className="text-xs text-cream/90 hover:text-cream px-2.5 py-1 rounded-full hover:bg-cream/10 transition-colors duration-100"
              >
                Create invoices
              </button>
              <button
                type="button"
                onClick={() => router.push('/app/sessions/polish-queue')}
                className="text-xs text-cream/90 hover:text-cream px-2.5 py-1 rounded-full hover:bg-cream/10 transition-colors duration-100"
              >
                Polish all
              </button>
            </>
          );
        })()}
      </BulkActionBar>

      <SessionDetailPane
        open={!!detailId}
        sessionId={detailId}
        onClose={detail.close}
        currency={currency}
      />
    </Layout>
  );
}

// ---------------------------------------------------------------------------
// List rendering
// ---------------------------------------------------------------------------

function SessionsList({
  rows, currency, showBilling, activeIdx, onOpen, selected, onToggleSelect,
}: {
  rows: SessionRow[];
  currency: string;
  showBilling: boolean;
  activeIdx: number;
  onOpen: (id: string) => void;
  selected: Set<string>;
  onToggleSelect: (id: string) => void;
}) {
  return (
    <div className="card overflow-hidden">
      <ul className="divide-y divide-rule">
        {rows.map((r, i) => (
          <SessionListRow
            key={r.id}
            row={r}
            currency={currency}
            showBilling={showBilling}
            isActive={i === activeIdx}
            isSelected={selected.has(r.id)}
            onOpen={onOpen}
            onToggleSelect={onToggleSelect}
          />
        ))}
      </ul>
    </div>
  );
}

function SessionListRow({
  row, currency, showBilling, isActive, isSelected, onOpen, onToggleSelect,
}: {
  row: SessionRow;
  currency: string;
  showBilling: boolean;
  isActive: boolean;
  isSelected: boolean;
  onOpen: (id: string) => void;
  onToggleSelect: (id: string) => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const tone =
    row.status === 'completed' && row.paid ? 'success'
    : row.status === 'completed' ? 'rust'
    : row.status === 'cancelled' ? 'neutral'
    : row.status === 'no_show' ? 'claret'
    : 'neutral';
  const label =
    row.status === 'completed' ? (row.paid ? 'Paid' : 'Unpaid')
    : row.status;

  const menuItems: ContextMenuItem[] = [
    { label: 'Open', onSelect: () => onOpen(row.id) },
    {
      label: 'Polish notes',
      onSelect: () => router.push(`/app/sessions/${row.id}?polish=1`),
      disabled: row.status !== 'completed' || !row.notes_internal,
    },
    {
      label: 'Send to parent',
      onSelect: () => router.push(`/app/sessions/${row.id}#send`),
      disabled: !row.notes_parent_facing,
    },
    { label: 'Reschedule', onSelect: () => router.push(`/app/sessions/${row.id}#reschedule`) },
    { label: 'Mark cancelled', onSelect: () => quickMutate(row.id, { status: 'cancelled' }, toast, 'Cancelled.') },
    { label: 'Duplicate', onSelect: () => router.push(`/app/sessions/new?duplicate=${row.id}`), separator: true },
    {
      label: 'Copy link',
      onSelect: () => {
        navigator.clipboard.writeText(`${window.location.origin}/app/sessions/${row.id}`);
        toast.show({ message: 'Link copied.', tone: 'success' });
      },
    },
    { label: 'Delete', destructive: true, onSelect: () => quickMutate(row.id, { delete: true }, toast, 'Deleted.'), separator: true },
  ];

  return (
    <ContextMenu items={menuItems}>
      <li
        onClick={() => onOpen(row.id)}
        className={cx(
          'group relative flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-ruleSoft/40 transition-colors duration-100',
          isActive && 'bg-ruleSoft/30',
          isSelected && 'bg-forest-soft/30',
        )}
        style={{ minHeight: 48 }}
      >
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onToggleSelect(row.id); }}
          aria-label={isSelected ? 'Deselect' : 'Select'}
          className={cx(
            'shrink-0 w-4 h-4 rounded border grid place-items-center transition-all duration-100',
            isSelected
              ? 'bg-forest border-forest text-cream'
              : 'border-rule opacity-0 group-hover:opacity-100',
          )}
        >
          {isSelected && (
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
              <path d="M5 13l4 4L19 7" />
            </svg>
          )}
        </button>
        <div className="w-20 shrink-0 text-xs text-ink-muted num tabular">
          {formatTime(row.scheduled_at)}
          <div className="text-2xs text-ink-soft">{formatDate(row.scheduled_at, { day: 'numeric', month: 'short' })}</div>
        </div>
        <Avatar name={row.student?.name ?? '?'} size={20} className="shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-[13px] text-ink truncate flex items-center gap-1.5">
            {row.student?.name ?? '—'}
            <PipelineIcons row={row} />
          </div>
          <div className="text-2xs text-ink-soft truncate">
            {[row.subject, row.topic, `${row.duration_minutes}m`].filter(Boolean).join(' · ')}
            {row.tutor?.name && <span> · {row.tutor.name}</span>}
          </div>
        </div>
        <div className="hidden md:flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-100 shrink-0" onClick={(e) => e.stopPropagation()}>
          <Link href={`/app/sessions/${row.id}`} className="btn-ghost text-2xs px-2 py-1">Edit</Link>
          {row.status === 'completed' && !row.notes_parent_facing && row.notes_internal && (
            <Link href={`/app/sessions/${row.id}?polish=1`} className="btn-ghost text-2xs px-2 py-1">Polish</Link>
          )}
        </div>
        {showBilling && (
          <div className="shrink-0 flex items-center gap-2">
            <BilledIndicator invoiced={!!row.invoice_id} />
            <StatusPill tone={tone as any}>{label}</StatusPill>
          </div>
        )}
        <div className="w-20 shrink-0 text-right text-[13px] num tabular text-ink">
          {formatCents(sessionAmount(row), currency)}
        </div>
      </li>
    </ContextMenu>
  );
}

// ---------------------------------------------------------------------------
// Pipeline icons — one glyph tells the whole pipeline state.
// scheduled · notes drafted · polished · sent · invoiced · paid
// ---------------------------------------------------------------------------

function PipelineIcons({ row }: { row: SessionRow }) {
  const states: Array<{ key: string; tip: string; on: boolean; svg: JSX.Element }> = [
    {
      key: 'cal',
      tip: 'Scheduled',
      on: row.status === 'scheduled' || row.status === 'completed',
      svg: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>,
    },
    {
      key: 'pen',
      tip: 'Notes drafted',
      on: !!row.notes_internal,
      svg: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4z"/></svg>,
    },
    {
      key: 'spk',
      tip: 'Polished',
      on: !!row.notes_parent_facing,
      svg: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v4M12 17v4M5 12H1M23 12h-4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6"/></svg>,
    },
    {
      key: 'env',
      tip: 'Sent to parent',
      on: !!row.parent_notified_at,
      svg: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 7l9-7"/></svg>,
    },
    {
      key: 'usd',
      tip: 'Invoiced',
      on: !!row.invoice_id,
      svg: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 1 1 0 7H6"/></svg>,
    },
  ];
  return (
    <span className="inline-flex items-center gap-0.5 ml-1 align-middle">
      {states.map((s) => (
        <Tooltip key={s.key} label={s.tip}>
          <span className={s.on ? 'text-forest' : 'text-ink-soft/40'}>
            {s.svg}
          </span>
        </Tooltip>
      ))}
    </span>
  );
}

function BilledIndicator({ invoiced }: { invoiced: boolean }) {
  return (
    <Tooltip label={invoiced ? 'Invoiced' : 'Not yet invoiced'}>
      <span className={['inline-flex items-center justify-center w-5 h-5 rounded-full', invoiced ? 'text-forest' : 'text-ink-soft'].join(' ')}>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={invoiced ? 2.5 : 1.75} strokeLinecap="round">
          <line x1="12" y1="1" x2="12" y2="23"/>
          <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 1 1 0 7H6"/>
        </svg>
      </span>
    </Tooltip>
  );
}

// Minimal optimistic mutation helper for the row context menu.
async function quickMutate(
  sessionId: string,
  body: { status?: string; delete?: boolean },
  toast: ReturnType<typeof useToast>,
  successMessage: string,
) {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error('No session');
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    };
    const res = body.delete
      ? await fetch(`/api/sessions/${sessionId}`, { method: 'DELETE', headers })
      : await fetch(`/api/sessions/${sessionId}`, { method: 'PATCH', headers, body: JSON.stringify(body) });
    if (!res.ok) throw new Error('Failed');
    toast.show({ message: successMessage, tone: 'success' });
    // Soft refresh: trigger a local route change to re-run effects.
    window.dispatchEvent(new Event('crestio:sessions-refresh'));
  } catch {
    toast.show({ message: 'Action failed.', tone: 'error' });
  }
}

// ---------------------------------------------------------------------------
// NowPill — small left-edge marker showing the current local clock time on
// the Today tab. Updates every minute.
// ---------------------------------------------------------------------------

function NowPill() {
  const now = useNowMinute();
  const time = new Date(now).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return (
    <div
      className="absolute -left-2 top-3 -translate-x-full hidden md:flex items-center gap-1.5 text-2xs text-forest font-medium"
      aria-label={`Now ${time}`}
    >
      <span className="inline-block w-1.5 h-1.5 rounded-full bg-forest session-now-pulse" />
      <span className="num tabular">{time}</span>
    </div>
  );
}

function UpcomingGroupedList(props: {
  groups: { label: string; rows: SessionRow[] }[];
  currency: string;
  activeIdx: number;
  onOpen: (id: string) => void;
  selected: Set<string>;
  onToggleSelect: (id: string) => void;
}) {
  let runningIdx = 0;
  return (
    <div className="space-y-4">
      {props.groups.map((g) => (
        <section key={g.label} className="card overflow-hidden">
          <header className="px-3 py-2 border-b border-rule sticky top-[56px] bg-cream/95 backdrop-blur z-10">
            <h3 className="text-2xs uppercase tracking-widest text-ink-muted font-medium">
              {g.label}
            </h3>
          </header>
          <ul className="divide-y divide-rule">
            {g.rows.map((r) => {
              const idx = runningIdx++;
              return (
                <SessionListRow
                  key={r.id}
                  row={r}
                  currency={props.currency}
                  showBilling={false}
                  isActive={idx === props.activeIdx}
                  isSelected={props.selected.has(r.id)}
                  onOpen={props.onOpen}
                  onToggleSelect={props.onToggleSelect}
                />
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

function SessionsListSkeleton() {
  return (
    <div className="card divide-y divide-rule">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="flex items-center gap-3 p-3" style={{ minHeight: 48 }}>
          <Skeleton className="w-4 h-4" />
          <Skeleton className="w-16 h-3" />
          <div className="flex-1"><Skeleton className="h-3 w-1/3 mb-1" /><Skeleton className="h-2.5 w-1/4" /></div>
          <Skeleton className="w-16 h-3" />
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Grouping
// ---------------------------------------------------------------------------

function groupByDay(rows: SessionRow[]): { label: string; rows: SessionRow[] }[] {
  if (rows.length === 0) return [];
  const today = startOfDay(new Date()).getTime();
  const day = 86_400_000;
  const week = today + 7 * day;
  const buckets = new Map<string, SessionRow[]>();
  const order: string[] = [];

  function pushTo(label: string, r: SessionRow) {
    if (!buckets.has(label)) { buckets.set(label, []); order.push(label); }
    buckets.get(label)!.push(r);
  }
  for (const r of rows) {
    const t = new Date(r.scheduled_at).getTime();
    const dayStart = startOfDay(new Date(t)).getTime();
    if (dayStart === today) pushTo('Today', r);
    else if (dayStart === today + day) pushTo('Tomorrow', r);
    else if (dayStart < week) pushTo('This week', r);
    else if (dayStart < today + 14 * day) pushTo('Next week', r);
    else pushTo('Later', r);
  }
  return order.map((label) => ({ label, rows: buckets.get(label)! }));
}

export default function SessionsPage() {
  return <AuthGuard><SessionsInner /></AuthGuard>;
}
