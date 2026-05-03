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
import { Avatar } from '../../components/design/Avatar';
import { MiniBarChart } from '../../components/design/MiniBarChart';
import { Banner } from '../../components/design/Banner';
import { formatRelativeDate, formatMoney } from '../../lib/format';
import InsightsPanel from '../../components/dashboard/InsightsPanel';
import StreakPill from '../../components/dashboard/StreakPill';
import { RecentlyDeletedCard } from '../../components/dashboard/RecentlyDeletedCard';
import { MaintenanceSuggestions } from '../../components/dashboard/MaintenanceSuggestions';
import StreakHeatmapModal from '../../components/dashboard/StreakHeatmapModal';
import MonthlyImpactCard from '../../components/dashboard/MonthlyImpactCard';
import AnniversaryBanner from '../../components/dashboard/AnniversaryBanner';
import InsightCard from '../../components/dashboard/InsightCard';
import BatchInvoicingNudge from '../../components/dashboard/BatchInvoicingNudge';
import CalibrationPill from '../../components/dashboard/CalibrationPill';
import RightNowCard from '../../components/dashboard/RightNowCard';
import Tour from '../../components/onboarding/Tour';
import { pickGreeting, computeStreak } from '../../lib/dashboardGreeting';
import { pickInsight } from '../../lib/insightCard';
import { useOrganization } from '../../lib/organizationContext';

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

type Series = { series?: number[]; previous_series?: number[] };

type OwnerBrief = {
  yesterday_sessions: number;
  yesterday_amount_cents: number;
  yesterday_tutor_count: number;
  notes_pending: number;
  actions: Array<{ tutor_name: string; student_name: string; reason: string }>;
};

type TodayPayload = {
  role: 'owner' | 'tutor';
  currency: string;
  owner_name: string | null;
  owner_brief?: OwnerBrief | null;
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
  today: { count: number; minutes: number; sessions: WeekItem[]; series?: number[]; previous_series?: number[] };
  week: { scheduled_count: number; series?: number[]; previous_series?: number[] };
  polish?: Series;
  unpaid_invoices: { count: number; total_cents: number; oldest_overdue_days: number; series?: number[]; previous_series?: number[] };
  team_breakdown?: Array<{ tutor_id: string; tutor_name: string; sessions: number }> | null;
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

// Greeting sub-line — assembles only the non-zero parts. Falls back to a
// quiet "All clear" when nothing needs the user's attention right now.
function buildGreetingSubline(data: TodayPayload): string {
  const todayCount = data.today?.count ?? 0;
  const invoiceQueue = (data.invoicing_queue ?? []).reduce((acc, e) => acc + e.session_count, 0);
  const polishCount = data.polish_queue?.length ?? 0;
  const parts: string[] = [];
  if (todayCount > 0) {
    parts.push(`${todayCount} ${todayCount === 1 ? 'session' : 'sessions'} today`);
  }
  if (invoiceQueue > 0) {
    parts.push(`${invoiceQueue} ${invoiceQueue === 1 ? 'invoice' : 'invoices'} to send`);
  }
  if (polishCount > 0) {
    parts.push(`${polishCount} in polish queue`);
  }
  if (parts.length === 0) return 'All clear. Nothing waiting.';
  return parts.join(', ') + '.';
}

function DashboardInner() {
  const router = useRouter();
  const toast = useToast();
  const { organization } = useOrganization();
  const [data, setData] = useState<TodayPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const cacheRef = useRef<TodayPayload | null>(null);
  const [teamSummary, setTeamSummary] = useState<{
    sessions: number; hours_billed: number; awaiting_notes: number;
  } | null>(null);
  const [streakOpen, setStreakOpen] = useState(false);
  const [tourActive, setTourActive] = useState(false);
  const [calibrationCount, setCalibrationCount] = useState(0);

  // One-time welcome toast after onboarding completes.
  useEffect(() => {
    if (router.query.welcome === '1' || router.query.welcome === 'sample') {
      toast.show({ message: 'Welcome — press ⌘K anytime to find anything.', tone: 'info', durationMs: 6000 });
      const url = new URL(window.location.href);
      url.searchParams.delete('welcome');
      window.history.replaceState({}, '', url.toString());
    }
  }, [router.query.welcome, toast]);

  // First-run tour. Activate when profile.tour_completed_at is null and there
  // is at least some data on the dashboard (real or sample).
  useEffect(() => {
    if (router.query.tour === 'replay') {
      setTourActive(true);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session || cancelled) return;
      const { data: prof } = await supabase
        .from('profiles')
        .select('tour_completed_at, power_user_mode')
        .eq('id', session.user.id)
        .maybeSingle();
      if (cancelled) return;
      // Apply power-user class globally.
      if (prof?.power_user_mode) {
        document.documentElement.classList.add('crestio-power-user');
      } else {
        document.documentElement.classList.remove('crestio-power-user');
      }
      if (!prof?.tour_completed_at) {
        // Defer slightly so the dashboard finishes rendering first.
        setTimeout(() => { if (!cancelled) setTourActive(true); }, 1200);
      }
    })();
    return () => { cancelled = true; };
  }, [router.query.tour]);

  // Calibration count.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) return;
        const res = await fetch('/api/dashboard/calibration-count', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (!res.ok || cancelled) return;
        const p = await res.json();
        setCalibrationCount(p.edits_count ?? 0);
      } catch { /* */ }
    })();
    return () => { cancelled = true; };
  }, []);

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
  const todayLabel = formatFullDate(new Date());
  const firstName = (data?.owner_name ?? '').trim().split(/\s+/)[0] || null;
  const greeting = pickGreeting(firstName);

  const streakDays = useMemo(() => {
    if (!data) return 0;
    const dates: string[] = [];
    for (const s of data.today?.sessions ?? []) dates.push(s.scheduled_at);
    for (const s of data.week_ahead ?? []) dates.push(s.scheduled_at);
    return computeStreak(dates);
  }, [data]);

  // Build session dates for streak heatmap (past 30 days).
  const heatmapSessionDates = useMemo(() => {
    if (!data) return [];
    const out: string[] = [];
    for (const s of data.today?.sessions ?? []) out.push(s.scheduled_at);
    for (const s of data.week_ahead ?? []) out.push(s.scheduled_at);
    return out;
  }, [data]);

  // Insight card data — derived client-side from the existing payload.
  const insight = useMemo(() => {
    if (!data) return null;
    const polishedThisWeek = (data.polish?.series ?? []).reduce((a: number, b: number) => a + b, 0);
    return pickInsight({
      polished_this_week: polishedThisWeek,
    });
  }, [data]);

  // Monthly impact card — show on first day of month for 7 days.
  const monthlyImpact = useMemo(() => {
    if (!data) return null;
    const now = new Date();
    if (now.getDate() > 7) return null;
    const monthName = now.toLocaleString('en-AU', { month: 'long' });
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const previousLabel = lastMonth.toLocaleString('en-AU', { month: 'long' });
    return {
      monthLabel: monthName,
      previousLabel,
    };
  }, [data]);

  return (
    <Layout pageTitle="Home">
      <div className="px-4 md:px-8 pt-6 md:pt-10 pb-8 md:pb-12 max-w-[1200px] mx-auto">
        <header className="mb-6 md:mb-8">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-[28px] md:text-[32px] font-display font-semibold tracking-tighter leading-tight m-0">
              {greeting}
            </h1>
            {streakDays >= 3 && (
              <button
                type="button"
                onClick={() => setStreakOpen(true)}
                className="rounded-full hover:opacity-80 transition-opacity"
                aria-label="Open streak heatmap"
              >
                <StreakPill days={streakDays} />
              </button>
            )}
            <CalibrationPill editsCount={calibrationCount} />
          </div>
          <div className="text-sm text-ink-muted mt-1" data-test-id="dashboard-greeting-sub">
            {todayLabel}
            {data && (
              <>
                {' · '}
                {buildGreetingSubline(data)}
              </>
            )}
          </div>
        </header>

        <TrialBanner />
        <div className="mb-4"><SampleDataBanner /></div>
        <div className="mb-4"><RecentlyDeletedCard /></div>
        <div className="mb-4"><MaintenanceSuggestions /></div>
        <AnniversaryBanner
          organizationCreatedAt={(organization as any)?.created_at}
          totalSessions={(data?.today?.series ?? []).reduce((a: number, b: number) => a + b, 0) + (data?.polish?.series ?? []).reduce((a: number, b: number) => a + b, 0)}
        />
        {monthlyImpact && data && (
          <MonthlyImpactCard
            monthLabel={monthlyImpact.monthLabel}
            sessions={(data.today?.series ?? []).reduce((a: number, b: number) => a + b, 0)}
            hours={Math.round((data.today?.minutes ?? 0) / 60 * 4.3)}
            earnedCents={(data.unpaid_invoices?.total_cents ?? 0)}
            studentsHelped={(data.team_breakdown?.length ?? 5)}
            currency={data.currency}
          />
        )}
        {insight && <InsightCard insight={insight} />}
        {data && (
          <BatchInvoicingNudge
            unbilledSessions={data.invoicing_queue.reduce((acc, e) => acc + e.session_count, 0)}
            unbilledHouseholds={data.invoicing_queue.length}
            totalCents={data.invoicing_queue.reduce((acc, e) => acc + e.total_cents, 0)}
            currency={data.currency}
          />
        )}
        <StateOfTheAppBanners payload={data} />

        {loading && !data ? (
          <DashboardSkeleton />
        ) : error ? (
          <div className="card p-6 text-sm text-claret">{error}</div>
        ) : data ? (
          <DashboardBody payload={data} teamSummary={teamSummary} onChanged={load} />
        ) : null}
      </div>
      <StreakHeatmapModal
        open={streakOpen}
        onClose={() => setStreakOpen(false)}
        sessionDates={heatmapSessionDates}
        streakDays={streakDays}
      />
      <Tour active={tourActive} onComplete={() => setTourActive(false)} />
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
      <OwnerBriefCard brief={payload.owner_brief ?? null} currency={currency} />

      <div className="mb-6 md:mb-8" data-tour="right-now">
        <RightNowCard
          nextSession={payload.next_session}
          todaySessions={payload.today?.sessions ?? []}
          weekAhead={payload.week_ahead ?? []}
        />
      </div>

      {/* Stat row. */}
      <div className={`grid grid-cols-2 ${statColCx} gap-3 md:gap-4 mb-8 md:mb-10 stat-grid`}>
        <StatCard
          label="Today"
          value={todayCount}
          sub={todayNextSub}
          href="/app/sessions?tab=today"
          series={payload.today?.series}
          previousSeries={payload.today?.previous_series}
          deltaUnit="sessions"
        />
        <StatCard
          label="This week"
          value={weekScheduled}
          sub={weekScheduled === 0 ? 'No sessions scheduled' : 'Scheduled'}
          href="/app/sessions?tab=upcoming"
          series={payload.week?.series}
          previousSeries={payload.week?.previous_series}
          deltaUnit="sessions"
        />
        <div data-tour="polish-card">
          <StatCard
            label="Polish queue"
            value={polishCount}
            sub={polishOldest ?? 'Caught up'}
            tone={polishCount > 0 ? 'amber' : 'default'}
            href="/app/sessions?tab=polish-queue"
            series={payload.polish?.series}
            previousSeries={payload.polish?.previous_series}
          />
        </div>
        <div data-tour="invoices-card">
        <StatCard
          label="Unpaid invoices"
          value={unpaid.count > 0 ? compactCurrency(unpaid.total_cents, currency) : 0}
          numericValue={unpaid.count}
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
          previousSeries={payload.unpaid_invoices?.previous_series}
        />
        </div>
        {showTeamCard && teamSummary && (
          <OwnerTeamCard
            sessions={teamSummary.sessions}
            hoursBilled={teamSummary.hours_billed}
            awaitingNotes={teamSummary.awaiting_notes}
            breakdown={payload.team_breakdown ?? null}
          />
        )}
      </div>

      {/* Two-column body — 60/40 on desktop. */}
      <div className="grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-6 md:gap-8">
        {/* Today timeline + Tomorrow at a glance */}
        <section data-tour="today-timeline">
          <h2 className="text-[15px] font-display font-semibold tracking-tighter mb-3">Today</h2>
          <div className="card p-3 md:p-4">
            <TodayTimeline sessions={payload.today?.sessions ?? []} nextId={next?.id ?? null} />
          </div>
          <TomorrowAtAGlance weekAhead={payload.week_ahead} />
          <WhatChangedFeed currency={payload.currency} />
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

        <section className="mt-6">
          <InsightsPanel insights={buildInsights(payload)} />
        </section>
      </div>
    </>
  );
}

function buildInsights(p: TodayPayload): Array<{ label: string; value: string; trend?: 'up' | 'down' | 'flat'; hint?: string }> {
  const out: Array<{ label: string; value: string; trend?: 'up' | 'down' | 'flat'; hint?: string }> = [];
  const polishThis = (p.polish?.series ?? []).reduce((a, b) => a + b, 0);
  const polishPrev = (p.polish?.previous_series ?? []).reduce((a, b) => a + b, 0);
  if (polishThis > 0 || polishPrev > 0) {
    out.push({
      label: 'Polish this week',
      value: String(polishThis),
      trend: polishThis > polishPrev ? 'up' : polishThis < polishPrev ? 'down' : 'flat',
      hint: polishPrev > 0 ? `Last week ${polishPrev}` : 'First week with polish',
    });
  }
  const todayThis = (p.today?.series ?? []).reduce((a, b) => a + b, 0);
  const todayPrev = (p.today?.previous_series ?? []).reduce((a, b) => a + b, 0);
  if (todayThis > 0 || todayPrev > 0) {
    out.push({
      label: 'Sessions this week',
      value: String(todayThis),
      trend: todayThis > todayPrev ? 'up' : todayThis < todayPrev ? 'down' : 'flat',
      hint: todayPrev > 0 ? `Last week ${todayPrev}` : 'New this week',
    });
  }
  if (p.unpaid_invoices) {
    const days = p.unpaid_invoices.oldest_overdue_days ?? 0;
    if (days > 0) {
      out.push({
        label: 'Oldest overdue',
        value: `${days} days`,
        trend: days > 14 ? 'down' : 'flat',
        hint: `${p.unpaid_invoices.count} unpaid invoice${p.unpaid_invoices.count === 1 ? '' : 's'}`,
      });
    }
  }
  if (p.team_breakdown && p.team_breakdown.length > 0) {
    const top = [...p.team_breakdown].sort((a, b) => b.sessions - a.sessions)[0];
    if (top && top.sessions > 0) {
      out.push({
        label: 'Top tutor this week',
        value: top.tutor_name,
        hint: `${top.sessions} session${top.sessions === 1 ? '' : 's'}`,
      });
    }
  }
  return out;
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
  const isCurrent = state === 'current';

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
    <div className={isCurrent ? 'relative' : undefined}>
      {isCurrent && (
        <span
          aria-hidden="true"
          className="absolute left-0 top-1 bottom-1 w-0.5 bg-forest rounded session-now-pulse"
        />
      )}
      <TimelineRow
        href={`/app/sessions/${s.id}`}
        time={formatTimeOfDay(s.scheduled_at)}
        title={
          <span className="inline-flex items-center gap-2">
            <Avatar name={s.student_name} size={20} />
            <span>{s.student_name}</span>
          </span>
        }
        subtitle={[s.subject, `${s.duration_minutes} min`].filter(Boolean).join(' · ')}
        state={state}
        status={<StatusPill tone={pill.tone}>{pill.label}</StatusPill>}
        actions={actions}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tomorrow at a glance — collapsed by default; expandable.
// Hidden on weekends or when nothing is scheduled tomorrow.
// ---------------------------------------------------------------------------

function TomorrowAtAGlance({ weekAhead }: { weekAhead: WeekItem[] }) {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  const dayAfter = new Date(tomorrow);
  dayAfter.setDate(dayAfter.getDate() + 1);
  const dow = tomorrow.getDay();
  const isWeekend = dow === 0 || dow === 6;
  const tomorrowSessions = weekAhead.filter((s) => {
    const t = new Date(s.scheduled_at).getTime();
    return t >= tomorrow.getTime() && t < dayAfter.getTime();
  });
  const [expanded, setExpanded] = useState(false);
  if (isWeekend || tomorrowSessions.length === 0) return null;

  const preview = tomorrowSessions.slice(0, 3);
  const more = tomorrowSessions.length - preview.length;
  const label = `Tomorrow · ${tomorrowSessions.length} ${tomorrowSessions.length === 1 ? 'session' : 'sessions'}`;
  const first = tomorrowSessions[0];
  const firstName = first ? first.student_name : null;

  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2 rounded border border-rule bg-surface hover:bg-ruleSoft/40 transition-colors duration-100 text-left"
        aria-expanded={expanded}
      >
        <div className="flex items-baseline gap-2 min-w-0">
          <span className="text-xs uppercase tracking-widest text-ink-muted font-medium shrink-0">{label}</span>
          {!expanded && firstName && (
            <span className="text-xs text-ink-muted truncate">
              First: {firstName} at {formatTimeOfDay(first.scheduled_at)}
            </span>
          )}
        </div>
        <span className="text-ink-soft text-xs shrink-0">
          {expanded ? '–' : '+'}
        </span>
      </button>
      {expanded && (
        <div className="mt-2 card p-3 space-y-1">
          {preview.map((s) => (
            <Link
              key={s.id}
              href={`/app/sessions/${s.id}`}
              className="flex items-center gap-3 px-2 py-1.5 rounded hover:bg-ruleSoft/40 transition-colors duration-100"
            >
              <span className="text-xs text-ink-muted num tabular shrink-0 w-12">{formatTimeOfDay(s.scheduled_at)}</span>
              <Avatar name={s.student_name} size={20} />
              <span className="text-sm text-ink truncate flex-1">{s.student_name}</span>
              <span className="text-xs text-ink-soft num tabular">{s.duration_minutes} min</span>
            </Link>
          ))}
          {more > 0 && (
            <Link
              href="/app/sessions?tab=upcoming"
              className="block text-2xs text-forest hover:underline pl-2 pt-1"
            >
              +{more} more
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// What changed — feed of recent material events with filter chips.
// Pulls a small slice of recent sessions, invoices, and reschedules in the
// browser; renders a small list with parent-initiated events promoted.
// ---------------------------------------------------------------------------

type ChangeEvent = {
  id: string;
  kind: 'parent' | 'money' | 'session';
  initiator: 'parent' | 'tutor' | 'system';
  icon: 'envelope' | 'dollar' | 'calendar' | 'reply' | 'sparkle';
  title: string;
  subtitle?: string;
  href: string;
  at: number;
};

function WhatChangedFeed({ currency }: { currency: string }) {
  const [events, setEvents] = useState<ChangeEvent[] | null>(null);
  const [filter, setFilter] = useState<'all' | 'parents' | 'money' | 'sessions'>('all');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) return;
        const headers = { Authorization: `Bearer ${session.access_token}` };
        // Best-effort parallel fetches; degrade quietly when an endpoint is missing.
        const [sessionsRes, invoicesRes] = await Promise.allSettled([
          fetch('/api/sessions?limit=8&order=updated', { headers }),
          fetch('/api/invoices?limit=8&order=updated', { headers }),
        ]);
        const list: ChangeEvent[] = [];
        if (sessionsRes.status === 'fulfilled' && sessionsRes.value.ok) {
          const arr = await sessionsRes.value.json();
          for (const s of (Array.isArray(arr) ? arr : arr.sessions ?? []).slice(0, 5)) {
            const at = new Date(s.updated_at ?? s.scheduled_at).getTime();
            if (s.notes_parent_facing) {
              list.push({
                id: `s-polished-${s.id}`,
                kind: 'session',
                initiator: 'tutor',
                icon: 'sparkle',
                title: `Polished notes for ${s.student?.name ?? 'session'}`,
                subtitle: 'Sent to parent',
                href: `/app/sessions/${s.id}`,
                at,
              });
            } else if (s.status === 'pending_change' && s.proposed_change_by === 'parent') {
              list.push({
                id: `s-resched-${s.id}`,
                kind: 'parent',
                initiator: 'parent',
                icon: 'calendar',
                title: `Parent proposed reschedule`,
                subtitle: s.student?.name,
                href: `/app/sessions/${s.id}`,
                at,
              });
            }
          }
        }
        if (invoicesRes.status === 'fulfilled' && invoicesRes.value.ok) {
          const arr = await invoicesRes.value.json();
          for (const i of (Array.isArray(arr) ? arr : arr.invoices ?? []).slice(0, 5)) {
            const at = new Date(i.updated_at ?? i.issued_on).getTime();
            if (i.status === 'paid') {
              list.push({
                id: `i-paid-${i.id}`,
                kind: 'money',
                initiator: 'parent',
                icon: 'dollar',
                title: `Invoice ${i.number} paid`,
                subtitle: formatMoney(i.total_cents, currency),
                href: `/app/invoices/${i.id}`,
                at,
              });
            } else if (i.status === 'sent') {
              list.push({
                id: `i-sent-${i.id}`,
                kind: 'money',
                initiator: 'tutor',
                icon: 'envelope',
                title: `Sent invoice ${i.number}`,
                subtitle: formatMoney(i.total_cents, currency),
                href: `/app/invoices/${i.id}`,
                at,
              });
            }
          }
        }
        list.sort((a, b) => b.at - a.at);
        if (!cancelled) setEvents(list.slice(0, 10));
      } catch {
        if (!cancelled) setEvents([]);
      }
    })();
    return () => { cancelled = true; };
  }, [currency]);

  if (events === null) return null;

  const filtered = events.filter((e) => {
    if (filter === 'all') return true;
    if (filter === 'parents') return e.initiator === 'parent';
    if (filter === 'money') return e.kind === 'money';
    if (filter === 'sessions') return e.kind === 'session';
    return true;
  });

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-[15px] font-display font-semibold tracking-tighter m-0">What changed</h2>
        <div className="flex items-center gap-1 text-2xs">
          {(['all', 'parents', 'money', 'sessions'] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setFilter(k)}
              className={[
                'px-2 py-1 rounded transition-colors duration-100 capitalize',
                filter === k ? 'bg-forest-soft text-forest-ink font-medium' : 'text-ink-muted hover:text-ink hover:bg-ruleSoft',
              ].join(' ')}
            >
              {k}
            </button>
          ))}
        </div>
      </div>
      {filtered.length === 0 ? (
        <div className="card p-4 text-xs text-ink-muted">Nothing recent here.</div>
      ) : (
        <div className="card p-1">
          {filtered.map((e) => (
            <Link
              key={e.id}
              href={e.href}
              className={[
                'flex items-center gap-3 px-3 py-2 rounded transition-colors duration-100 hover:bg-ruleSoft/40',
                e.initiator === 'parent' ? 'bg-forest-soft/20' : '',
              ].join(' ')}
            >
              <ChangeIcon kind={e.icon} />
              <div className="flex-1 min-w-0">
                <div className="text-sm text-ink truncate">{e.title}</div>
                {e.subtitle && <div className="text-xs text-ink-muted truncate">{e.subtitle}</div>}
              </div>
              <span className="text-2xs text-ink-soft num tabular shrink-0">
                {formatRelativeDate(new Date(e.at))}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function ChangeIcon({ kind }: { kind: ChangeEvent['icon'] }) {
  const cls = 'shrink-0 text-ink-muted';
  if (kind === 'envelope') return (
    <svg className={cls} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 7l9-7"/></svg>
  );
  if (kind === 'dollar') return (
    <svg className={cls} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 1 1 0 7H6"/></svg>
  );
  if (kind === 'calendar') return (
    <svg className={cls} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>
  );
  if (kind === 'sparkle') return (
    <svg className={cls} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v4M12 17v4M5 12H1M23 12h-4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6"/></svg>
  );
  return (
    <svg className={cls} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a8 8 0 0 1-11.3 7.3L4 21l1.7-5.7A8 8 0 1 1 21 12z"/></svg>
  );
}

// ---------------------------------------------------------------------------
// Owner team card — shares the StatCard footprint, but adds a stacked-bar
// breakdown across tutors at the bottom.
// ---------------------------------------------------------------------------

function OwnerTeamCard({
  sessions, hoursBilled, awaitingNotes, breakdown,
}: {
  sessions: number;
  hoursBilled: number;
  awaitingNotes: number;
  breakdown: Array<{ tutor_id: string; tutor_name: string; sessions: number }> | null;
}) {
  const tone = awaitingNotes > 0 ? 'amber-ink' : 'ink';
  const palette = ['#1F3A2E', '#2F7D4F', '#B8860B', '#7A2233', '#8B4A1F', '#0F1714'];
  const data = (breakdown ?? []).map((t, i) => ({
    label: t.tutor_name,
    value: t.sessions,
    color: palette[i % palette.length],
  }));

  return (
    <Link
      href="/app/tutors"
      className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-forest/40 rounded-[8px]"
    >
      <div className="card p-6 h-full flex flex-col gap-3 transition-colors duration-100 hover:bg-ruleSoft/40">
        <div className="text-2xs uppercase tracking-widest text-ink-muted font-medium">
          Team this week
        </div>
        <div className={`display-num num text-${tone}`}>{sessions}</div>
        <div className="text-xs text-ink-muted truncate leading-snug">
          {hoursBilled}h billed
          {awaitingNotes > 0 && <> · {awaitingNotes} awaiting notes</>}
        </div>
        {data.length > 0 && (
          <div className="mt-1">
            <MiniBarChart data={data} variant="stacked" width={140} height={20} />
          </div>
        )}
      </div>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Nudge generation rules
// ---------------------------------------------------------------------------

type NudgeProps = React.ComponentProps<typeof NudgeCard> & { id?: string };

function buildNudges(p: TodayPayload): NudgeProps[] {
  const out: NudgeProps[] = [];
  const dayMs = 86_400_000;
  const now = Date.now();

  // 1. Sessions completed but not polished, >24h old.
  const stalePolish = (p.polish_queue ?? []).filter((s) =>
    now - new Date(s.scheduled_at).getTime() > dayMs);
  if (stalePolish.length > 0) {
    out.push({
      id: 'polish_stale',
      icon: <DotIcon />,
      tone: 'amber',
      title: `${stalePolish.length} session${stalePolish.length === 1 ? '' : 's'} waiting on notes`,
      description: `Oldest is ${stalePolish[stalePolish.length - 1].student_name}.`,
      actionLabel: 'Polish now',
      actionHref: '/app/sessions/polish-queue',
    });
  }

  // 2. Sessions polished but not invoiced, >48h old. (We approximate with
  //    invoicing_queue since polished == has notes_parent_facing AND only
  //    polished sessions qualify for one-click invoice send.)
  const sessionsToInvoice = (p.invoicing_queue ?? [])
    .reduce((acc, e) => acc + e.session_count, 0);
  if (sessionsToInvoice > 0) {
    const total = p.invoicing_queue.reduce((acc, e) => acc + e.total_cents, 0);
    out.push({
      id: 'unbilled',
      icon: <DotIcon />,
      tone: 'forest',
      title: `${sessionsToInvoice} unbilled session${sessionsToInvoice === 1 ? '' : 's'} worth ${formatCents(total, p.currency)}`,
      description: 'Send invoices in one batch.',
      actionLabel: 'Batch invoice',
      actionHref: '/app/invoices/batch',
    });
  }

  // 3. Invoices sent but unpaid past due date.
  if ((p.unpaid_invoices?.oldest_overdue_days ?? 0) > 0
      && (p.unpaid_invoices?.count ?? 0) > 0) {
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

  // 4. Reschedule requests — parent-initiated, waiting on tutor response.
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

  // 5. Pending homework — chase students still working on assigned tasks.
  if (p.homework_pending && p.homework_pending.length > 0) {
    const oldest = p.homework_pending[0];
    const sessionId = (oldest as any).session_id ?? '';
    out.push({
      id: 'homework',
      icon: <DotIcon />,
      tone: 'default',
      title: `${p.homework_pending.length} homework item${p.homework_pending.length === 1 ? '' : 's'} pending`,
      description: 'Check in with students or mark complete.',
      actionLabel: 'Open homework',
      actionHref: sessionId ? `/app/sessions/${sessionId}#homework` : '/app/sessions',
    });
  }

  return out;
}

function OwnerBriefCard({ brief, currency }: { brief: OwnerBrief | null; currency: string }) {
  if (!brief || brief.yesterday_sessions === 0) return null;
  // Only show during the morning briefing window (8-10am Sydney) — keep it
  // out of the way for tutors who open the dashboard later in the day.
  const now = new Date();
  const tzNow = new Date(now.toLocaleString('en-US', { timeZone: 'Australia/Sydney' }));
  const hour = tzNow.getHours();
  if (hour < 8 || hour >= 10) return null;

  return (
    <div className="mb-8 card p-4 md:p-5 border-forest/15 bg-forest-soft/25">
      <div className="text-2xs uppercase tracking-widest text-forest font-medium mb-1.5">Owner brief</div>
      <div className="text-sm text-ink leading-relaxed">
        Yesterday: <strong className="num tabular">{brief.yesterday_sessions}</strong> {brief.yesterday_sessions === 1 ? 'session' : 'sessions'}
        {brief.yesterday_tutor_count > 1 && <> across <strong className="num tabular">{brief.yesterday_tutor_count}</strong> tutors</>}
        {' · '}
        <strong className="num tabular">{formatCents(brief.yesterday_amount_cents, currency)}</strong> earned.
        {' · '}
        Notes pending: <strong className="num tabular">{brief.notes_pending}</strong>
        {brief.notes_pending > 0 && <> &gt; 48h</>}.
      </div>
      {brief.actions.length > 0 && (
        <div className="mt-3 pt-3 border-t border-forest/15">
          <div className="text-2xs uppercase tracking-widest text-forest font-medium mb-1">Action needed</div>
          <ul className="space-y-0.5">
            {brief.actions.map((a, i) => (
              <li key={i} className="text-xs text-ink">
                <strong>{a.tutor_name}</strong> · {a.student_name} <span className="text-ink-muted">— {a.reason}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
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

// State-of-the-app banners on the dashboard: streak, cold-spell, first-win.
// Computes lightly from the payload — no extra API calls.
function StateOfTheAppBanners({ payload }: { payload: TodayPayload | null }) {
  if (!payload) return null;
  const banners: React.ReactNode[] = [];
  const todaySeries = payload.today?.series ?? [];

  // Streak — 7+ consecutive days of >=1 session ending today.
  let streak = 0;
  for (let i = todaySeries.length - 1; i >= 0; i--) {
    if (todaySeries[i] > 0) streak++;
    else break;
  }
  if (streak >= 7) {
    const today = new Date().toISOString().slice(0, 10);
    banners.push(
      <Banner key="streak" id={`streak-${streak}-${today}`} tone="forest">
        {streak}-day logging streak. Don't break it.
      </Banner>,
    );
  }

  // Cold spell — last 5+ days with no sessions on the series.
  if (todaySeries.length === 7 && todaySeries.every((v) => v === 0)) {
    banners.push(
      <Banner key="cold" id="cold-welcome-back" tone="amber">
        Welcome back. No sessions logged this week — schedule your next one.
      </Banner>,
    );
  }

  if (banners.length === 0) return null;
  return <div className="mb-4 space-y-2">{banners}</div>;
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
