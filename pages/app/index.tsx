import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import AuthGuard from '../../components/AuthGuard';
import Layout from '../../components/Layout';
import { useToast } from '../../components/design/Toast';
import { supabase } from '../../lib/supabase';
import { useBilling } from '../../lib/billingContext';
import { useMembership } from '../../lib/membershipContext';
import { timeOfDayPeriod, formatTimeOfDay, DEFAULT_DASHBOARD_TZ } from '../../lib/formatTime';
import { useLocaleFormatters } from '../../lib/useLocaleFormatters';
import { formatCents } from '../../lib/utils';
import SampleDataBanner from '../../components/SampleDataBanner';
import { StatCard } from '../../components/design/StatCard';
import { NudgeCard } from '../../components/design/NudgeCard';
import { TimelineRow } from '../../components/design/TimelineRow';
import { Skeleton } from '../../components/design/Skeleton';
import { StatusPill } from '../../components/design/StatusPill';
import { NowLine, useNowMinute } from '../../components/design/NowLine';

// ---------------------------------------------------------------------------
// Dashboard — morning briefing layout.
// Above the fold: greeting + four stat cards + Today timeline + Needs attention.
// ---------------------------------------------------------------------------

type WeekItem = {
  id: string;
  scheduled_at: string;
  duration_minutes: number;
  subject: string | null;
  status: string;
  student_name: string;
};

type PolishItem = {
  id: string;
  scheduled_at: string;
  subject: string | null;
  student_name: string;
};

type InvoicingEntry = {
  parent_name: string;
  student_ids: string[];
  student_names: string[];
  session_count: number;
  total_cents: number;
  first_session_id: string;
};

type TodayPayload = {
  role: 'owner' | 'tutor';
  currency: string;
  owner_name: string | null;
  next_session: {
    id: string;
    scheduled_at: string;
    duration_minutes: number;
    subject: string | null;
    student_name: string;
    tutor_name: string | null;
  } | null;
  polish_queue: PolishItem[];
  reschedule_requests: any[];
  week_ahead: WeekItem[];
  invoicing_queue: InvoicingEntry[];
  homework_pending: any[];
  today: { count: number; minutes: number; sessions: WeekItem[]; series?: number[] };
  week: { scheduled_count: number; series?: number[] };
  polish?: { series?: number[] };
  unpaid_invoices: { count: number; total_cents: number; oldest_overdue_days: number; series?: number[] };
};

const DISMISSED_NUDGES_KEY = 'crestio.dashboard.dismissed_nudges.v1';
const COACHMARK_KEY = 'crestio.dashboard.polish_coachmark.v1';

function loadDismissedNudges(): Record<string, number> {
  if (typeof window === 'undefined') return {};
  try { return JSON.parse(window.localStorage.getItem(DISMISSED_NUDGES_KEY) ?? '{}'); }
  catch { return {}; }
}

function saveDismissedNudges(map: Record<string, number>) {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(DISMISSED_NUDGES_KEY, JSON.stringify(map)); } catch { /* ignore */ }
}

function compactCurrency(cents: number, currency: string): string {
  if (cents < 100_00) return formatCents(cents, currency);
  return new Intl.NumberFormat(undefined, {
    style: 'currency', currency, notation: 'compact', maximumFractionDigits: 1,
  }).format(cents / 100);
}

function DashboardInner() {
  const router = useRouter();
  const toast = useToast();
  const [data, setData] = useState<TodayPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const cacheRef = useRef<TodayPayload | null>(null);
  const [teamSummary, setTeamSummary] = useState<{
    sessions: number; hours_billed: number; awaiting_notes: number;
  } | null>(null);

  // One-time welcome toast after onboarding completes.
  useEffect(() => {
    if (router.query.welcome === '1') {
      toast.show({ message: 'Welcome — press ⌘K anytime to find anything.', tone: 'info', durationMs: 6000 });
      const url = new URL(window.location.href);
      url.searchParams.delete('welcome');
      window.history.replaceState({}, '', url.toString());
    }
  }, [router.query.welcome, toast]);

  const load = useCallback(async () => {
    if (!cacheRef.current) setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) { setLoading(false); return; }
      const res = await fetch('/api/dashboard/today', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) { setError('Could not load dashboard.'); return; }
      const payload = await res.json();
      cacheRef.current = payload;
      setData(payload);
      setError(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const onFocus = () => { load(); };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [load]);

  // Owner team summary — derived in the browser from a tutors count call.
  // Kept lightweight so we don't add a new API endpoint just for one card.
  const { membership } = useMembership();
  const isOwner = membership?.role === 'owner';
  useEffect(() => {
    if (!isOwner) { setTeamSummary(null); return; }
    let cancelled = false;
    (async () => {
      const { count: tutorCount } = await supabase
        .from('tutors')
        .select('id', { count: 'exact', head: true });
      if (cancelled) return;
      if (!tutorCount || tutorCount <= 1) { setTeamSummary(null); return; }

      const weekStart = new Date();
      weekStart.setHours(0, 0, 0, 0);
      const dow = weekStart.getDay();
      weekStart.setDate(weekStart.getDate() - (dow === 0 ? 6 : dow - 1));

      const { data: weekSessions } = await supabase
        .from('sessions')
        .select('duration_minutes,status,scheduled_at')
        .gte('scheduled_at', weekStart.toISOString())
        .in('status', ['completed', 'scheduled']);

      const { count: awaiting } = await supabase
        .from('sessions')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'completed')
        .is('notes_internal', null)
        .lt('scheduled_at', new Date(Date.now() - 48 * 3_600_000).toISOString());

      if (cancelled) return;
      const completed = (weekSessions ?? []).filter((s: any) => s.status === 'completed');
      const totalMin = completed.reduce((acc: number, s: any) => acc + (s.duration_minutes ?? 0), 0);
      setTeamSummary({
        sessions: weekSessions?.length ?? 0,
        hours_billed: Math.round(totalMin / 60),
        awaiting_notes: awaiting ?? 0,
      });
    })();
    return () => { cancelled = true; };
  }, [isOwner]);

  const { formatFullDate } = useLocaleFormatters(DEFAULT_DASHBOARD_TZ);
  const period = timeOfDayPeriod();
  const todayLabel = formatFullDate(new Date());
  const firstName = (data?.owner_name ?? '').trim().split(/\s+/)[0] || null;
  const greeting = period === 'morning'
    ? 'Good morning'
    : period === 'afternoon'
    ? 'Good afternoon'
    : 'Good evening';

  return (
    <Layout pageTitle="Home">
      <div className="px-4 md:px-8 pt-6 md:pt-10 pb-8 md:pb-12 max-w-[1200px] mx-auto">
        <header className="mb-6 md:mb-8">
          <h1 className="text-[28px] md:text-[32px] font-display font-semibold tracking-tighter leading-tight m-0">
            {greeting}{firstName ? `, ${firstName}` : 'Welcome back'}.
          </h1>
          <div className="text-sm text-ink-muted mt-1">
            {todayLabel}
            {data?.today && (
              <>
                {' · '}
                {data.today.count === 0
                  ? 'No sessions today'
                  : `${data.today.count} ${data.today.count === 1 ? 'session' : 'sessions'} · ${data.today.minutes} min`}
              </>
            )}
          </div>
        </header>

        <TrialBanner />
        <div className="mb-4"><SampleDataBanner /></div>

        {loading && !data ? (
          <DashboardSkeleton />
        ) : error ? (
          <div className="card p-6 text-sm text-claret">{error}</div>
        ) : data ? (
          <DashboardBody payload={data} teamSummary={teamSummary} onChanged={load} />
        ) : null}
      </div>
    </Layout>
  );
}

function DashboardBody({
  payload, teamSummary, onChanged,
}: {
  payload: TodayPayload;
  teamSummary: { sessions: number; hours_billed: number; awaiting_notes: number } | null;
  onChanged: () => void;
}) {
  const { currency } = payload;
  const next = payload.next_session;
  const todayCount = payload.today?.count ?? 0;
  const polishCount = payload.polish_queue.length;
  const polishOldest = payload.polish_queue.length > 0
    ? polishOldestLabel(payload.polish_queue[payload.polish_queue.length - 1].scheduled_at)
    : null;
  const unpaid = payload.unpaid_invoices ?? { count: 0, total_cents: 0, oldest_overdue_days: 0 };
  const weekScheduled = payload.week?.scheduled_count ?? 0;

  const todayNextSub = next && isToday(next.scheduled_at)
    ? `Next: ${next.student_name} at ${formatTimeOfDay(next.scheduled_at)}`
    : todayCount === 0
    ? 'All done for today'
    : 'Next: scheduled';

  const allNudges = useMemo(() => buildNudges(payload), [payload]);
  const [dismissed, setDismissed] = useState<Record<string, number>>({});
  useEffect(() => { setDismissed(loadDismissedNudges()); }, []);
  const visibleNudges = useMemo(() => {
    const cutoff = Date.now() - 24 * 3_600_000;
    return allNudges.filter((n) => {
      const ts = dismissed[n.id ?? ''];
      return !ts || ts < cutoff;
    });
  }, [allNudges, dismissed]);

  function dismissNudge(id: string) {
    const next = { ...dismissed, [id]: Date.now() };
    setDismissed(next);
    saveDismissedNudges(next);
  }

  // Polish coach mark — show once after first session is logged and queue > 0.
  const [showCoachMark, setShowCoachMark] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const seen = window.localStorage.getItem(COACHMARK_KEY) === '1';
    if (seen) return;
    if (polishCount > 0) setShowCoachMark(true);
  }, [polishCount]);
  function dismissCoachMark() {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(COACHMARK_KEY, '1');
    }
    setShowCoachMark(false);
  }

  const showTeamCard = !!teamSummary;
  const statColCx = showTeamCard ? 'lg:grid-cols-5' : 'lg:grid-cols-4';

  return (
    <>
      {/* Stat row. */}
      <div className={`grid grid-cols-2 ${statColCx} gap-3 md:gap-4 mb-8 md:mb-10 stat-grid`}>
        <StatCard
          label="Today"
          value={todayCount}
          sub={todayNextSub}
          href="/app/sessions?tab=today"
          series={payload.today?.series}
        />
        <StatCard
          label="This week"
          value={weekScheduled}
          sub={weekScheduled === 0 ? 'No sessions scheduled' : 'Scheduled'}
          href="/app/sessions?tab=upcoming"
          series={payload.week?.series}
        />
        <StatCard
          label="Polish queue"
          value={polishCount}
          sub={polishOldest ?? 'Caught up'}
          tone={polishCount > 0 ? 'amber' : 'default'}
          href="/app/sessions?tab=polish-queue"
          series={payload.polish?.series}
        />
        <StatCard
          label="Unpaid invoices"
          value={unpaid.count > 0 ? compactCurrency(unpaid.total_cents, currency) : 0}
          sub={
            unpaid.count === 0
              ? 'All paid'
              : unpaid.oldest_overdue_days > 0
                ? `Oldest is ${unpaid.oldest_overdue_days} days overdue`
                : `${unpaid.count} ${unpaid.count === 1 ? 'invoice' : 'invoices'}`
          }
          tone={unpaid.oldest_overdue_days > 7 ? 'claret' : unpaid.count > 0 ? 'amber' : 'default'}
          href="/app/invoices"
          series={payload.unpaid_invoices?.series}
        />
        {showTeamCard && teamSummary && (
          <StatCard
            label="Team this week"
            value={teamSummary.sessions}
            sub={`${teamSummary.hours_billed}h billed · ${teamSummary.awaiting_notes} awaiting notes`}
            tone={teamSummary.awaiting_notes > 0 ? 'amber' : 'default'}
            href="/app/tutors"
          />
        )}
      </div>

      {/* Two-column body — 60/40 on desktop. */}
      <div className="grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-6 md:gap-8">
        {/* Today timeline */}
        <section>
          <h2 className="text-[15px] font-display font-semibold tracking-tighter mb-3">Today</h2>
          <div className="card p-3 md:p-4">
            <TodayTimeline sessions={payload.today?.sessions ?? []} nextId={next?.id ?? null} />
          </div>
        </section>

        {/* Needs attention */}
        <section className="relative">
          <h2 className="text-[15px] font-display font-semibold tracking-tighter mb-3">Needs attention</h2>
          {visibleNudges.length === 0 ? (
            <div className="card p-5 flex items-center gap-3">
              <div className="w-8 h-8 grid place-items-center rounded-full bg-success-soft text-success-ink shrink-0">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 13l4 4L19 7"/>
                </svg>
              </div>
              <div className="text-sm text-ink">All caught up.</div>
            </div>
          ) : (
            <div className="space-y-3">
              {visibleNudges.slice(0, 3).map((n, i) => (
                <div
                  key={n.id ?? i}
                  className="relative animate-fade-in"
                  style={{ animationDelay: `${i * 75}ms`, animationFillMode: 'both' }}
                >
                  <NudgeCard {...n} />
                  {n.id && (
                    <button
                      type="button"
                      aria-label="Dismiss"
                      onClick={() => dismissNudge(n.id!)}
                      className="absolute top-2 right-2 opacity-0 hover:opacity-100 focus:opacity-100 transition-opacity duration-100 text-ink-soft hover:text-ink p-1 rounded"
                    >
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <path d="M6 6l12 12M6 18L18 6"/>
                      </svg>
                    </button>
                  )}
                </div>
              ))}
              {visibleNudges.length > 3 && (
                <div className="text-xs text-ink-muted text-center pt-1">
                  +{visibleNudges.length - 3} more
                </div>
              )}
            </div>
          )}
          {showCoachMark && polishCount > 0 && (
            <div className="mt-4 card p-4 bg-amber-soft/40 border-amber/30 flex items-start gap-3 animate-fade-in">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-ink shrink-0 mt-0.5">
                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
              </svg>
              <div className="flex-1 min-w-0 text-xs text-amber-ink leading-snug">
                Your first session is ready to polish. One tap turns rough notes into a polished update for the parent.
              </div>
              <button
                type="button"
                onClick={dismissCoachMark}
                className="text-2xs uppercase tracking-widest text-amber-ink/70 hover:text-amber-ink"
              >
                Got it
              </button>
            </div>
          )}
        </section>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Today timeline — with NowLine and inline action buttons.
// ---------------------------------------------------------------------------

function TodayTimeline({ sessions, nextId }: { sessions: WeekItem[]; nextId: string | null }) {
  const now = useNowMinute();

  if (sessions.length === 0) {
    return (
      <div className="px-3 py-10 text-center">
        <div className="text-sm text-ink mb-1">No sessions today.</div>
        <div className="text-xs text-ink-muted mb-4">Catch up on polish or plan tomorrow.</div>
        <div className="flex items-center justify-center gap-2">
          <Link href="/app/sessions?tab=polish-queue" className="btn-secondary text-xs px-3" style={{ height: 32, minHeight: 32 }}>
            Polish queue
          </Link>
          <Link href="/app/sessions?tab=upcoming" className="btn-secondary text-xs px-3" style={{ height: 32, minHeight: 32 }}>
            Tomorrow
          </Link>
        </div>
      </div>
    );
  }

  // Find the index where the now line should be inserted (between past and future).
  const nowIdx = sessions.findIndex((s) => new Date(s.scheduled_at).getTime() > now);
  const insertNowAt = nowIdx === -1 ? sessions.length : nowIdx;

  const rows: JSX.Element[] = [];
  sessions.forEach((s, i) => {
    if (i === insertNowAt) rows.push(<NowLine key={`now-${i}`} />);
    rows.push(<TimelineSessionRow key={s.id} session={s} now={now} nextId={nextId} />);
  });
  if (insertNowAt === sessions.length) {
    rows.push(<NowLine key="now-end" />);
  }

  return <div className="space-y-0.5">{rows}</div>;
}

function TimelineSessionRow({ session: s, now, nextId }: { session: WeekItem; now: number; nextId: string | null }) {
  const start = new Date(s.scheduled_at).getTime();
  const end = start + (s.duration_minutes ?? 0) * 60_000;
  let state: 'past' | 'current' | 'future' = 'future';
  let pill: { label: string; tone: 'neutral' | 'forest' | 'amber' | 'claret' | 'success' } = { label: 'Upcoming', tone: 'neutral' };
  if (s.status === 'completed') { state = 'past'; pill = { label: 'Logged', tone: 'success' }; }
  else if (s.status === 'cancelled') { state = 'past'; pill = { label: 'Cancelled', tone: 'claret' }; }
  else if (s.status === 'no_show') { state = 'past'; pill = { label: 'No show', tone: 'claret' }; }
  else if (start <= now && now <= end) { state = 'current'; pill = { label: 'In session', tone: 'forest' }; }
  else if (s.id === nextId) { pill = { label: 'Next', tone: 'forest' }; }

  const isFuture = state === 'future';
  const isPast = state === 'past';

  const actions = (
    <>
      {isPast && s.status === 'completed' && (
        <Link href={`/app/sessions/${s.id}`} className="btn-ghost text-2xs px-2 py-1" title="Polish notes">
          Polish
        </Link>
      )}
      {isPast && s.status !== 'completed' && (
        <Link href={`/app/sessions/${s.id}`} className="btn-ghost text-2xs px-2 py-1" title="Log notes">
          Log notes
        </Link>
      )}
      {isFuture && (
        <>
          <Link href={`/app/sessions/${s.id}`} className="btn-ghost text-2xs px-2 py-1">Reschedule</Link>
          <Link href={`/app/sessions/${s.id}`} className="btn-ghost text-2xs px-2 py-1 text-claret hover:text-claret">Cancel</Link>
        </>
      )}
    </>
  );

  return (
    <TimelineRow
      href={`/app/sessions/${s.id}`}
      time={formatTimeOfDay(s.scheduled_at)}
      title={s.student_name}
      subtitle={[s.subject, `${s.duration_minutes} min`].filter(Boolean).join(' · ')}
      state={state}
      status={<StatusPill tone={pill.tone}>{pill.label}</StatusPill>}
      actions={actions}
    />
  );
}

// ---------------------------------------------------------------------------
// Nudge generation rules
// ---------------------------------------------------------------------------

type NudgeProps = React.ComponentProps<typeof NudgeCard> & { id?: string };

function buildNudges(p: TodayPayload): NudgeProps[] {
  const out: NudgeProps[] = [];

  if (p.polish_queue.length > 0) {
    out.push({
      id: 'polish_queue',
      icon: <DotIcon />,
      tone: 'amber',
      title: `${p.polish_queue.length} session${p.polish_queue.length === 1 ? '' : 's'} ready to polish`,
      description: p.polish_queue[0].student_name,
      actionLabel: 'Polish now',
      actionHref: '/app/sessions?tab=polish-queue',
    });
  }

  if (p.unpaid_invoices?.oldest_overdue_days > 7) {
    out.push({
      id: 'overdue_invoices',
      icon: <DotIcon />,
      tone: 'claret',
      title: `${p.unpaid_invoices.count} invoice${p.unpaid_invoices.count === 1 ? '' : 's'} overdue`,
      description: `Oldest is ${p.unpaid_invoices.oldest_overdue_days} days past due.`,
      actionLabel: 'Review',
      actionHref: '/app/invoices?filter=overdue',
    });
  }

  if (p.invoicing_queue.length > 0) {
    const total = p.invoicing_queue.reduce((acc, e) => acc + e.total_cents, 0);
    if (total > 5000) {
      const sessions = p.invoicing_queue.reduce((acc, e) => acc + e.session_count, 0);
      out.push({
        id: 'unbilled',
        icon: <DotIcon />,
        tone: 'forest',
        title: `${sessions} unbilled session${sessions === 1 ? '' : 's'} worth ${formatCents(total, p.currency)}`,
        actionLabel: 'Create invoices',
        actionHref: '/app/invoices/batch',
      });
    }
  }

  if (p.reschedule_requests.length > 0) {
    out.push({
      id: 'reschedule',
      icon: <DotIcon />,
      tone: 'amber',
      title: `${p.reschedule_requests.length} reschedule request${p.reschedule_requests.length === 1 ? '' : 's'}`,
      description: 'Parents are waiting on your response.',
      actionLabel: 'Review',
      actionHref: '/app/sessions',
    });
  }

  if (p.homework_pending && p.homework_pending.length > 0) {
    out.push({
      id: 'homework',
      icon: <DotIcon />,
      tone: 'default',
      title: `${p.homework_pending.length} homework item${p.homework_pending.length === 1 ? '' : 's'} pending`,
      description: 'Check in with students or mark complete.',
      actionLabel: 'View',
      actionHref: '/app/sessions',
    });
  }

  return out;
}

function DotIcon() {
  return (
    <svg width="6" height="6" viewBox="0 0 6 6" aria-hidden="true">
      <circle cx="3" cy="3" r="3" fill="currentColor" />
    </svg>
  );
}

function isToday(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  return d.getDate() === now.getDate() && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
}

function polishOldestLabel(iso: string): string {
  const days = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));
  if (days === 0) return 'Oldest is from today';
  return `Oldest is from ${days} day${days === 1 ? '' : 's'} ago`;
}

// ---------------------------------------------------------------------------
// Skeleton + Trial banner
// ---------------------------------------------------------------------------

function DashboardSkeleton() {
  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-8">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="card p-6">
            <Skeleton className="h-3 w-16 mb-4" />
            <Skeleton className="h-9 w-20 mb-3" />
            <Skeleton className="h-3 w-32" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-6">
        <div className="card p-4">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="flex items-center gap-4 py-3">
              <Skeleton className="h-3 w-12" />
              <div className="flex-1"><Skeleton className="h-4 w-1/2 mb-1.5" /><Skeleton className="h-3 w-1/3" /></div>
            </div>
          ))}
        </div>
        <div className="space-y-3">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="card p-4 flex items-center gap-3">
              <Skeleton className="h-8 w-8 rounded-full" />
              <div className="flex-1"><Skeleton className="h-4 w-2/3 mb-1.5" /><Skeleton className="h-3 w-1/2" /></div>
              <Skeleton className="h-8 w-16" />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function TrialBanner() {
  const { status, loading } = useBilling();
  const [dismissed, setDismissed] = useState(false);
  if (loading || !status) return null;
  if (dismissed) return null;
  if (status.role !== 'owner') return null;
  if (!status.is_in_trial) return null;
  const days = status.days_left_in_trial ?? 0;
  if (days < 1 || days > 7) return null;
  const alreadySubscribed = !!status.stripe_customer_id_present;
  return (
    <div className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-3 px-4 py-3 rounded-md bg-forest-soft border border-forest/20">
      <div className="text-sm text-forest-ink">
        Your trial ends in {days} {days === 1 ? 'day' : 'days'}.
      </div>
      <div className="flex items-center gap-2">
        {!alreadySubscribed && (
          <Link href="/app/settings/billing" className="btn-primary text-xs" style={{ height: 32, minHeight: 32 }}>
            Subscribe
          </Link>
        )}
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="btn-ghost text-xs"
          style={{ height: 32, minHeight: 32 }}
          aria-label="Dismiss"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}

export default function Dashboard() {
  return (
    <AuthGuard>
      <DashboardInner />
    </AuthGuard>
  );
}
