import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import AuthGuard from '../../components/AuthGuard';
import Layout from '../../components/Layout';
import { useToast } from '../../components/design/Toast';
import { supabase } from '../../lib/supabase';
import { useBilling } from '../../lib/billingContext';
import { timeOfDayPeriod, formatTimeOfDay, DEFAULT_DASHBOARD_TZ } from '../../lib/formatTime';
import { useLocaleFormatters } from '../../lib/useLocaleFormatters';
import { formatCents } from '../../lib/utils';
import SampleDataBanner from '../../components/SampleDataBanner';
import { StatCard } from '../../components/design/StatCard';
import { NudgeCard } from '../../components/design/NudgeCard';
import { TimelineRow } from '../../components/design/TimelineRow';
import { Skeleton } from '../../components/design/Skeleton';
import { StatusPill } from '../../components/design/StatusPill';

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
  today: { count: number; minutes: number; sessions: WeekItem[] };
  week: { scheduled_count: number };
  unpaid_invoices: { count: number; total_cents: number; oldest_overdue_days: number };
};

function DashboardInner() {
  const router = useRouter();
  const toast = useToast();
  const [data, setData] = useState<TodayPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const cacheRef = useRef<TodayPayload | null>(null);

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
            {greeting}{firstName ? `, ${firstName}` : ''}.
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
          <DashboardBody payload={data} onChanged={load} />
        ) : null}
      </div>
    </Layout>
  );
}

function DashboardBody({ payload, onChanged }: { payload: TodayPayload; onChanged: () => void }) {
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

  const nudges = useMemo(() => buildNudges(payload), [payload]);

  return (
    <>
      {/* Stat row — 4 cards. */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-8 md:mb-10 stat-grid">
        <StatCard
          label="Today"
          value={todayCount}
          sub={todayNextSub}
          href="/app/sessions?tab=today"
        />
        <StatCard
          label="This week"
          value={weekScheduled}
          sub={weekScheduled === 0 ? 'No sessions scheduled' : 'Scheduled'}
          href="/app/sessions?tab=upcoming"
        />
        <StatCard
          label="Polish queue"
          value={polishCount}
          sub={polishOldest ?? 'Caught up'}
          tone={polishCount > 0 ? 'amber' : 'default'}
          href="/app/sessions?tab=polish-queue"
        />
        <StatCard
          label="Unpaid invoices"
          value={unpaid.count > 0 ? formatCents(unpaid.total_cents, currency) : 0}
          sub={
            unpaid.count === 0
              ? 'All paid'
              : unpaid.oldest_overdue_days > 0
                ? `Oldest is ${unpaid.oldest_overdue_days} days overdue`
                : `${unpaid.count} ${unpaid.count === 1 ? 'invoice' : 'invoices'}`
          }
          tone={unpaid.oldest_overdue_days > 7 ? 'claret' : unpaid.count > 0 ? 'amber' : 'default'}
          href="/app/invoices"
        />
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
        <section>
          <h2 className="text-[15px] font-display font-semibold tracking-tighter mb-3">Needs attention</h2>
          {nudges.length === 0 ? (
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
              {nudges.slice(0, 3).map((n, i) => (
                <NudgeCard key={i} {...n} />
              ))}
              {nudges.length > 3 && (
                <div className="text-xs text-ink-muted text-center pt-1">
                  +{nudges.length - 3} more
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Today timeline
// ---------------------------------------------------------------------------

function TodayTimeline({ sessions, nextId }: { sessions: WeekItem[]; nextId: string | null }) {
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
  const now = Date.now();
  return (
    <div className="space-y-0.5">
      {sessions.map((s) => {
        const start = new Date(s.scheduled_at).getTime();
        const end = start + (s.duration_minutes ?? 0) * 60_000;
        let state: 'past' | 'current' | 'future' = 'future';
        let pill: { label: string; tone: 'neutral' | 'forest' | 'amber' | 'claret' | 'success' } = { label: 'Upcoming', tone: 'neutral' };
        if (s.status === 'completed') { state = 'past'; pill = { label: 'Logged', tone: 'success' }; }
        else if (s.status === 'cancelled') { state = 'past'; pill = { label: 'Cancelled', tone: 'claret' }; }
        else if (s.status === 'no_show') { state = 'past'; pill = { label: 'No show', tone: 'claret' }; }
        else if (start <= now && now <= end) { state = 'current'; pill = { label: 'In session', tone: 'forest' }; }
        else if (s.id === nextId) { pill = { label: 'Next', tone: 'forest' }; }

        return (
          <TimelineRow
            key={s.id}
            href={`/app/sessions/${s.id}`}
            time={formatTimeOfDay(s.scheduled_at)}
            title={s.student_name}
            subtitle={[s.subject, `${s.duration_minutes} min`].filter(Boolean).join(' · ')}
            state={state}
            status={<StatusPill tone={pill.tone}>{pill.label}</StatusPill>}
          />
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Nudge generation rules
// ---------------------------------------------------------------------------

type NudgeProps = React.ComponentProps<typeof NudgeCard>;

function buildNudges(p: TodayPayload): NudgeProps[] {
  const out: NudgeProps[] = [];

  if (p.polish_queue.length > 0) {
    out.push({
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
