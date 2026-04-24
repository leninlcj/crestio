import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import AuthGuard from '../../../components/AuthGuard';
import Layout from '../../../components/Layout';
import SettingsTabs from '../../../components/SettingsTabs';
import { supabase } from '../../../lib/supabase';
import { useOrganization } from '../../../lib/organizationContext';
import { useMembership } from '../../../lib/membershipContext';
import { useBilling } from '../../../lib/billingContext';
import { Badge } from '../../../components/design/Badge';

function formatTrialDays(days: number | null | undefined): string {
  if (days == null || days < 0) return '';
  if (days === 0) return 'Less than a day';
  if (days === 1) return '1 day';
  return `${days} days`;
}
function formatDMY(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}

const PLAN_PRICE: Record<string, Record<string, { price: string; period: string }>> = {
  solo: { monthly: { price: '$24 AUD', period: '/month' }, annual: { price: '$240 AUD', period: '/year' } },
  team: { monthly: { price: '$59 AUD', period: '/month' }, annual: { price: '$590 AUD', period: '/year' } },
  growth: { monthly: { price: '$129 AUD', period: '/month' }, annual: { price: '$1,290 AUD', period: '/year' } },
};

function BillingInner() {
  const router = useRouter();
  const { organization } = useOrganization();
  const { membership } = useMembership();
  const { status, loading, error } = useBilling();
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
    const fade = setTimeout(() => setToast((t) => (t ? { ...t, show: false } : null)), 5000);
    return () => clearTimeout(fade);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.query.billing]);

  async function startCheckout(plan?: 'solo' | 'team') {
    setBusy(true); setErr(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) { setErr('Not signed in.'); return; }
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
        setErr(payload?.error ?? 'Could not start checkout. Please try again.');
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
      if (!session?.access_token) { setErr('Not signed in.'); return; }
      const res = await fetch('/api/billing/create-portal-session', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || !payload?.url) {
        setErr(payload?.error ?? 'Could not open the billing portal. Please try again.');
        return;
      }
      window.location.href = payload.url;
    } finally {
      setBusy(false);
    }
  }

  if (loading && !status) {
    return (
      <Layout subtitle="Billing" title="Settings">
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
  const priceDisplay = PLAN_PRICE[planTier]?.[billingInterval];

  let headline: string = '';
  let tone: 'default' | 'warning' = 'default';
  let showSubscribe = false;

  if (s === 'active') {
    headline = cancelAtEnd && periodEndDisplay
      ? `Ending ${periodEndDisplay} — access continues until then`
      : periodEndDisplay ? `Renews ${periodEndDisplay}` : 'Active';
  } else if (s === 'trialing' && customerPresent && subPresent) {
    headline = trialEndsDisplay
      ? `Free trial — converts on ${trialEndsDisplay}`
      : 'Free trial';
  } else if (s === 'trialing') {
    if (daysLeft != null && daysLeft >= 0) headline = `Free trial — ${formatTrialDays(daysLeft)} left`;
    else headline = 'Trial expired';
    showSubscribe = true;
  } else if (s === 'past_due') {
    headline = 'Payment past due — update your card to keep access';
    tone = 'warning';
  } else if (s === 'canceled') {
    headline = 'Cancelled';
    showSubscribe = true;
  } else if (s === 'incomplete' || s === 'incomplete_expired' || s === 'unpaid') {
    headline = 'Subscription issue';
    tone = 'warning';
    showSubscribe = !customerPresent;
  } else if (s === 'paused') {
    headline = 'Paused';
  } else if (s) {
    headline = s;
  }

  return (
    <Layout subtitle="Billing" title="Settings">
      <SettingsTabs />
      <div className="max-w-2xl space-y-6">
        {toast?.show && (
          <div
            className={['text-sm transition-opacity duration-500', toast.kind === 'success' ? 'text-forest' : 'text-ink-muted'].join(' ')}
            role="status"
          >
            {toast.kind === 'success'
              ? 'Subscription confirmed.'
              : 'Checkout was cancelled. Your card was not charged.'}
          </div>
        )}

        {error && !status && (
          <div className="card p-6 text-sm text-claret">{error}</div>
        )}

        {status && (
          <div className="card p-8 space-y-5">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-2xs uppercase tracking-widest text-ink-muted">Current plan</span>
                <Badge variant={planTier === 'team' ? 'success' : 'neutral'}>
                  {planTier === 'solo' ? 'Solo' : planTier === 'team' ? 'Team' : 'Growth'}
                </Badge>
              </div>
              <h2 className="font-display text-2xl tracking-tightest mb-1">
                Crestio {planTier === 'solo' ? 'Solo' : planTier === 'team' ? 'Team' : 'Growth'}
              </h2>
              {priceDisplay && (
                <div className="text-sm text-ink-muted">
                  {priceDisplay.price}<span className="text-ink-soft">{priceDisplay.period}</span> · billed {billingInterval}
                </div>
              )}
            </div>

            <div className={['text-sm', tone === 'warning' ? 'text-claret' : 'text-ink-muted'].join(' ')}>
              Status: <span className={tone === 'warning' ? 'text-claret font-medium' : 'text-ink font-medium'}>{headline}</span>
            </div>

            {err && <div className="text-sm text-claret">{err}</div>}

            <div className="flex flex-wrap gap-2 pt-2">
              {!showSubscribe && customerPresent ? (
                <>
                  <button type="button" onClick={openPortal} disabled={busy} className="btn-primary">
                    {busy ? 'Redirecting…' : 'Manage billing →'}
                  </button>
                  <button type="button" onClick={openPortal} disabled={busy} className="btn-secondary">
                    Update payment method
                  </button>
                </>
              ) : (
                <button type="button" onClick={() => startCheckout()} disabled={busy} className="btn-primary">
                  {busy ? 'Redirecting…' : s === 'canceled' ? 'Resubscribe' : 'Subscribe'}
                </button>
              )}
            </div>
          </div>
        )}

        <div className="card p-8 space-y-4">
          <div>
            <div className="text-2xs uppercase tracking-widest text-ink-muted mb-1">Change plan</div>
            <h2 className="font-display text-xl tracking-tightest">Switch tier or interval</h2>
          </div>

          {billingInterval === 'monthly' && (
            <div className="flex items-center justify-between gap-4 p-4 border border-rule rounded">
              <div>
                <div className="text-sm text-ink font-medium">Switch to annual billing</div>
                <div className="text-xs text-ink-muted mt-0.5">Save 2 months vs monthly.</div>
              </div>
              <Link href="/app/onboarding/plan?interval=annual" className="btn-secondary text-xs">
                Switch to annual
              </Link>
            </div>
          )}

          {planTier === 'solo' && (
            <div className="flex items-center justify-between gap-4 p-4 border border-forest/30 bg-forest-soft/40 rounded">
              <div>
                <div className="text-sm text-forest-ink font-medium">Upgrade to Team</div>
                <div className="text-xs text-forest-ink/80 mt-0.5">Add tutors, manage payouts, invite your team.</div>
              </div>
              <Link href="/app/onboarding/plan?plan=team" className="btn-primary text-xs">
                Upgrade to Team
              </Link>
            </div>
          )}

          {planTier === 'team' && (
            <div className="flex items-center justify-between gap-4 p-4 border border-rule rounded">
              <div>
                <div className="text-sm text-ink">Downgrade to Solo</div>
                <div className="text-xs text-ink-muted mt-0.5">Applies at the end of your current billing cycle.</div>
              </div>
              <button type="button" onClick={openPortal} disabled={busy} className="btn-ghost text-xs">
                Manage in portal
              </button>
            </div>
          )}
        </div>

        <div className="text-2xs text-ink-soft pt-1">
          Payments handled by Stripe. All prices in Australian Dollars, inclusive of GST where applicable.
        </div>
      </div>
    </Layout>
  );
}

export default function Page() {
  return <AuthGuard><BillingInner /></AuthGuard>;
}
