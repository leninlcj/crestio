import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import AuthGuard from '../../components/AuthGuard';
import Layout from '../../components/Layout';
import QuickLogFab from '../../components/QuickLogFab';
import { supabase } from '../../lib/supabase';
import { useBilling } from '../../lib/billingContext';
import { timeOfDayPeriod, DEFAULT_DASHBOARD_TZ } from '../../lib/formatTime';
import { useLocaleFormatters } from '../../lib/useLocaleFormatters';
import SampleDataBanner from '../../components/SampleDataBanner';
import {
  NextUpCard, PolishQueueCard, InvoicingCard, RescheduleRequestsCard,
  WeekAheadCard, EmptyStateCard, TodaySkeleton, HomeworkStatusCard,
  type NextSession, type PolishItem, type RescheduleRequest,
  type WeekAheadItem, type InvoicingEntry, type HomeworkPendingItem,
} from '../../components/today/TodaySections';

type TodayPayload = {
  role: 'owner' | 'tutor';
  currency: string;
  owner_name: string | null;
  next_session: NextSession | null;
  polish_queue: PolishItem[];
  reschedule_requests: RescheduleRequest[];
  week_ahead: WeekAheadItem[];
  invoicing_queue: InvoicingEntry[];
  homework_pending: HomeworkPendingItem[];
};

function DashboardInner() {
  const { t } = useTranslation('dashboard');
  const [data, setData] = useState<TodayPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const cacheRef = useRef<TodayPayload | null>(null);

  const load = useCallback(async () => {
    // SWR-style: keep last data visible while refetching.
    if (!cacheRef.current) setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) { setLoading(false); return; }
      const res = await fetch('/api/dashboard/today', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) {
        setError(t('loading_error'));
        return;
      }
      const payload = await res.json();
      cacheRef.current = payload;
      setData(payload);
      setError(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Refetch on window focus so tutors see fresh state when they return after
  // the next session time has ticked over, etc. Cheap (single endpoint).
  useEffect(() => {
    const onFocus = () => { load(); };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [load]);

  const { formatFullDate } = useLocaleFormatters(DEFAULT_DASHBOARD_TZ);
  const period = timeOfDayPeriod();
  const todayLabel = formatFullDate(new Date());
  const firstName = (data?.owner_name ?? '').trim().split(/\s+/)[0] || null;
  const greetingKey = period === 'morning'
    ? 'greeting_morning'
    : period === 'afternoon'
    ? 'greeting_afternoon'
    : 'greeting_evening';

  return (
    <Layout pageTitle={t('page_title')}>
      <div className="max-w-[800px] mx-auto">
        <header className="mb-6 md:mb-8">
          <div className="text-2xs uppercase tracking-widest text-ink-muted mb-2">{t('kicker')}</div>
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-2">
            <h1 className="font-display text-3xl md:text-4xl tracking-tightest text-ink leading-tight">
              {todayLabel}
            </h1>
            {firstName && (
              <div className="text-sm text-ink-muted">{t(greetingKey, { name: firstName })}</div>
            )}
          </div>
        </header>

        <TrialBanner />
        <div className="mb-4"><SampleDataBanner /></div>

        {loading && !data ? (
          <TodaySkeleton />
        ) : error ? (
          <div className="card p-6 text-sm text-claret">{error}</div>
        ) : data ? (
          <DashboardSections payload={data} onChanged={load} />
        ) : null}
      </div>
      <QuickLogFab />
    </Layout>
  );
}

function DashboardSections({
  payload, onChanged,
}: { payload: TodayPayload; onChanged: () => void }) {
  const {
    next_session, polish_queue, reschedule_requests, week_ahead, invoicing_queue, currency, homework_pending,
  } = payload;

  const hasNext = !!next_session;
  const hasPolish = polish_queue.length > 0;
  const hasReschedule = reschedule_requests.length > 0;
  const hasInvoicing = invoicing_queue.length > 0;
  const hasHomework = (homework_pending?.length ?? 0) > 0;

  // Filter week-ahead: drop the next session to avoid duplication with Next Up.
  const weekAfterFiltering = next_session
    ? week_ahead.filter((s) => s.id !== next_session.id)
    : week_ahead;
  const hasWeek = weekAfterFiltering.length > 0;

  const everythingEmpty =
    !hasNext && !hasPolish && !hasReschedule && !hasInvoicing && !hasWeek && !hasHomework;

  if (everythingEmpty) return <EmptyStateCard />;

  return (
    <div className="space-y-4">
      {hasNext && <NextUpCard session={next_session!} />}
      {hasReschedule && (
        <RescheduleRequestsCard requests={reschedule_requests} onChanged={onChanged} />
      )}
      {hasPolish && <PolishQueueCard items={polish_queue} />}
      {hasInvoicing && <InvoicingCard entries={invoicing_queue} currency={currency} />}
      {hasHomework && <HomeworkStatusCard items={homework_pending} />}
      {hasWeek && <WeekAheadCard items={weekAfterFiltering} />}
    </div>
  );
}

function TrialBanner() {
  const { t } = useTranslation('dashboard');
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
    <div className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-3 p-4 rounded bg-forest-soft border border-forest/20">
      <div className="text-sm text-forest-ink">
        {t('trial_banner.days_left', { count: days })}
      </div>
      <div className="flex items-center gap-3">
        {!alreadySubscribed && (
          <Link href="/app/settings/billing" className="btn-primary text-xs">
            {t('trial_banner.subscribe')}
          </Link>
        )}
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="btn-ghost text-xs"
          aria-label={t('trial_banner.dismiss')}
        >
          {t('trial_banner.dismiss')}
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
