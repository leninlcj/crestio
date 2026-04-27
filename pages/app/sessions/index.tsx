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
import { SessionDetailPane } from '../../../components/sessions/SessionDetailPane';
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
  }, [tab, activeDate, billingFilter, membership, membershipLoading, isTutor]);

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
        <div className="card p-3 md:p-4 mb-4">
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
  const tone =
    row.status === 'completed' && row.paid ? 'success'
    : row.status === 'completed' ? 'rust'
    : row.status === 'cancelled' ? 'neutral'
    : row.status === 'no_show' ? 'claret'
    : 'neutral';
  const label =
    row.status === 'completed' ? (row.paid ? 'Paid' : 'Unpaid')
    : row.status;
  return (
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
      <div className="w-20 shrink-0 text-xs text-ink-muted tabular">
        {formatTime(row.scheduled_at)}
        <div className="text-2xs text-ink-soft">{formatDate(row.scheduled_at, { day: 'numeric', month: 'short' })}</div>
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[13px] text-ink truncate">
          {row.student?.name ?? '—'}
          {row.parent_notified_at && (
            <span className="ml-1.5 text-forest text-xs" title="Parent emailed">✓</span>
          )}
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
        <div className="shrink-0">
          <StatusPill tone={tone as any}>{label}</StatusPill>
        </div>
      )}
      <div className="w-20 shrink-0 text-right text-[13px] tabular text-ink">
        {formatCents(sessionAmount(row), currency)}
      </div>
    </li>
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
