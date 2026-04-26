import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useTranslation } from 'react-i18next';
import AuthGuard from '../../../components/AuthGuard';
import Layout from '../../../components/Layout';
import SettingsTabs from '../../../components/SettingsTabs';
import { supabase } from '../../../lib/supabase';
import { useOrganization } from '../../../lib/organizationContext';
import { useMembership } from '../../../lib/membershipContext';
import { useBilling } from '../../../lib/billingContext';
import { Badge } from '../../../components/design/Badge';
import { useLocaleFormatters } from '../../../lib/useLocaleFormatters';

const PLAN_PRICE_DOLLARS: Record<string, Record<string, number>> = {
  solo: { monthly: 24, annual: 240 },
  team: { monthly: 59, annual: 590 },
  growth: { monthly: 129, annual: 1290 },
};

function BillingInner() {
  const { t } = useTranslation('settings');
  const router = useRouter();
  const { organization } = useOrganization();
  const { membership } = useMembership();
  const { status, loading, error } = useBilling();
  const { formatMoney, formatDate } = useLocaleFormatters();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [toast, setToast] = useState<{ kind: 'success' | 'cancelled'; show: boolean } | null>(null);

  const isOwner = membership?.role === 'owner';

  useEffect(() => {
    if (membership === null) return;
    if (!isOwner) router.replace('/app/settings/account');
  }, [isOwner, membership, router]);

  useEffect(() => {
    const q = router.query.billing;
    if (q !== 'success' && q !== 'cancelled') return;
    setToast({ kind: q as 'success' | 'cancelled', show: true });
    const { billing, ...rest } = router.query;
    router.replace({ pathname: router.pathname, query: rest }, undefined, { shallow: true });
    const fade = setTimeout(() => setToast((tst) => (tst ? { ...tst, show: false } : null)), 5000);
    return () => clearTimeout(fade);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.query.billing]);

  function formatTrialDays(days: number | null | undefined): string {
    if (days == null || days < 0) return '';
    if (days === 0) return t('billing.trial_days_zero');
    if (days === 1) return t('billing.trial_days_one');
    return t('billing.trial_days_other', { count: days });
  }

  function formatDMY(iso: string | null | undefined): string | null {
    if (!iso) return null;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return formatDate(d, { day: 'numeric', month: 'short', year: 'numeric' });
  }

  async function startCheckout(plan?: 'solo' | 'team') {
    setBusy(true); setErr(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) { setErr(t('common.not_signed_in')); return; }
      const body: any = {};
      if (plan) {
        body.plan = plan;
        body.interval = organization?.billing_interval ?? 'monthly';
      }
      const res = await fetch('/api/billing/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify(body),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || !payload?.url) {
        setErr(payload?.error ?? t('billing.checkout_error'));
        return;
      }
      window.location.href = payload.url;
    } finally {
      setBusy(false);
    }
  }

  async function openPortal() {
    setBusy(true); setErr(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) { setErr(t('common.not_signed_in')); return; }
      const res = await fetch('/api/billing/create-portal-session', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || !payload?.url) {
        setErr(payload?.error ?? t('billing.portal_error'));
        return;
      }
      window.location.href = payload.url;
    } finally {
      setBusy(false);
    }
  }

  if (loading && !status) {
    return (
      <Layout pageTitle={`${t('tabs.billing')} · ${t('page_title')}`} subtitle={t('tabs.billing')} title={t('page_title')}>
        <SettingsTabs />
        <div className="max-w-2xl">
          <div className="card p-8 animate-pulse space-y-3">
            <div className="h-4 w-24 bg-ruleSoft rounded" />
            <div className="h-6 w-48 bg-ruleSoft rounded" />
            <div className="h-10 w-40 bg-ruleSoft rounded mt-6" />
          </div>
        </div>
      </Layout>
    );
  }

  const s = status?.subscription_status;
  const customerPresent = status?.stripe_customer_id_present;
  const subPresent = status?.stripe_subscription_id_present ?? customerPresent;
  const cancelAtEnd = status?.cancel_at_period_end ?? false;
  const daysLeft = status?.days_left_in_trial;
  const trialEndsDisplay = formatDMY(status?.trial_ends_at);
  const periodEndDisplay = formatDMY(status?.current_period_end);

  const planTier = organization?.plan_tier ?? 'solo';
  const billingInterval = organization?.billing_interval ?? 'monthly';
  const planDollars = PLAN_PRICE_DOLLARS[planTier]?.[billingInterval];
  const priceDisplay = planDollars
    ? {
        price: formatMoney(planDollars * 100, 'AUD', { maximumFractionDigits: 0 }),
        period: billingInterval === 'monthly' ? t('billing.period_monthly') : t('billing.period_annual'),
      }
    : null;

  let headline: string = '';
  let tone: 'default' | 'warning' = 'default';
  let showSubscribe = false;

  if (s === 'active') {
    headline = cancelAtEnd && periodEndDisplay
      ? t('billing.headline_ending', { date: periodEndDisplay })
      : periodEndDisplay ? t('billing.headline_renews', { date: periodEndDisplay }) : t('billing.headline_active');
  } else if (s === 'trialing' && customerPresent && subPresent) {
    headline = trialEndsDisplay
      ? t('billing.headline_trial_converts', { date: trialEndsDisplay })
      : t('billing.headline_trial');
  } else if (s === 'trialing') {
    if (daysLeft != null && daysLeft >= 0) headline = t('billing.headline_trial_days', { days_left: formatTrialDays(daysLeft) });
    else headline = t('billing.headline_trial_expired');
    showSubscribe = true;
  } else if (s === 'past_due') {
    headline = t('billing.headline_past_due');
    tone = 'warning';
  } else if (s === 'canceled') {
    headline = t('billing.headline_cancelled');
    showSubscribe = true;
  } else if (s === 'incomplete' || s === 'incomplete_expired' || s === 'unpaid') {
    headline = t('billing.headline_issue');
    tone = 'warning';
    showSubscribe = !customerPresent;
  } else if (s === 'paused') {
    headline = t('billing.headline_paused');
  } else if (s) {
    headline = s;
  }

  const tierLabel = planTier === 'solo' ? t('billing.plan_solo')
    : planTier === 'team' ? t('billing.plan_team')
    : t('billing.plan_growth');
  const intervalLabel = billingInterval === 'monthly' ? t('billing.interval_monthly') : t('billing.interval_annual');

  return (
    <Layout pageTitle={`${t('tabs.billing')} · ${t('page_title')}`} subtitle={t('tabs.billing')} title={t('page_title')}>
      <SettingsTabs />
      <div className="max-w-2xl space-y-6">
        {toast?.show && (
          <div
            className={['text-sm transition-opacity duration-500', toast.kind === 'success' ? 'text-forest' : 'text-ink-muted'].join(' ')}
            role="status"
          >
            {toast.kind === 'success'
              ? t('billing.toast_success')
              : t('billing.toast_cancelled')}
          </div>
        )}

        {error && !status && (
          <div className="card p-6 text-sm text-claret">{error}</div>
        )}

        {status && (
          <div className="card p-8 space-y-5">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-2xs uppercase tracking-widest text-ink-muted">{t('billing.current_plan')}</span>
                <Badge variant={planTier === 'team' ? 'success' : 'neutral'}>
                  {tierLabel}
                </Badge>
              </div>
              <h2 className="font-display text-2xl tracking-tightest mb-1">
                {t('billing.tier_name', { tier: tierLabel })}
              </h2>
              {priceDisplay && (
                <div className="text-sm text-ink-muted">
                  {t('billing.billed_line', {
                    price: priceDisplay.price,
                    period: priceDisplay.period,
                    interval: intervalLabel,
                  })}
                </div>
              )}
            </div>

            <div className={['text-sm', tone === 'warning' ? 'text-claret' : 'text-ink-muted'].join(' ')}>
              {t('billing.status_label')} <span className={tone === 'warning' ? 'text-claret font-medium' : 'text-ink font-medium'}>{headline}</span>
            </div>

            {err && <div className="text-sm text-claret">{err}</div>}

            <div className="flex flex-wrap gap-2 pt-2">
              {!showSubscribe && customerPresent ? (
                <>
                  <button type="button" onClick={openPortal} disabled={busy} className="btn-primary">
                    {busy ? t('billing.redirecting') : t('billing.manage')}
                  </button>
                  <button type="button" onClick={openPortal} disabled={busy} className="btn-secondary">
                    {t('billing.update_payment')}
                  </button>
                </>
              ) : (
                <button type="button" onClick={() => startCheckout()} disabled={busy} className="btn-primary">
                  {busy ? t('billing.redirecting') : s === 'canceled' ? t('billing.resubscribe') : t('billing.subscribe')}
                </button>
              )}
            </div>
          </div>
        )}

        <div className="card p-8 space-y-4">
          <div>
            <div className="text-2xs uppercase tracking-widest text-ink-muted mb-1">{t('billing.change_plan_eyebrow')}</div>
            <h2 className="font-display text-xl tracking-tightest">{t('billing.change_plan_heading')}</h2>
          </div>

          {billingInterval === 'monthly' && (
            <div className="flex items-center justify-between gap-4 p-4 border border-rule rounded">
              <div>
                <div className="text-sm text-ink font-medium">{t('billing.switch_to_annual')}</div>
                <div className="text-xs text-ink-muted mt-0.5">{t('billing.switch_to_annual_note')}</div>
              </div>
              <Link href="/app/onboarding/plan?interval=annual" className="btn-secondary text-xs">
                {t('billing.switch_to_annual_cta')}
              </Link>
            </div>
          )}

          {planTier === 'solo' && (
            <div className="flex items-center justify-between gap-4 p-4 border border-forest/30 bg-forest-soft/40 rounded">
              <div>
                <div className="text-sm text-forest-ink font-medium">{t('billing.upgrade_team')}</div>
                <div className="text-xs text-forest-ink/80 mt-0.5">{t('billing.upgrade_team_note')}</div>
              </div>
              <Link href="/app/onboarding/plan?plan=team" className="btn-primary text-xs">
                {t('billing.upgrade_team')}
              </Link>
            </div>
          )}

          {planTier === 'team' && (
            <div className="flex items-center justify-between gap-4 p-4 border border-rule rounded">
              <div>
                <div className="text-sm text-ink">{t('billing.downgrade_solo')}</div>
                <div className="text-xs text-ink-muted mt-0.5">{t('billing.downgrade_solo_note')}</div>
              </div>
              <button type="button" onClick={openPortal} disabled={busy} className="btn-ghost text-xs">
                {t('billing.manage_in_portal')}
              </button>
            </div>
          )}
        </div>

        <div className="text-2xs text-ink-soft pt-1">
          {t('billing.gst_note')}
        </div>
      </div>
    </Layout>
  );
}

export default function Page() {
  return <AuthGuard><BillingInner /></AuthGuard>;
}
