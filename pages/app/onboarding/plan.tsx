import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useTranslation } from 'react-i18next';
import AuthGuard from '../../../components/AuthGuard';
import { supabase } from '../../../lib/supabase';
import { PLAN_CATALOGUE, type BillingInterval, formatPlanPrice } from '../../../lib/plans';
import type { PlanTier } from '../../../lib/billing';
import { Badge } from '../../../components/design/Badge';

function PlanPickerInner() {
  const { t } = useTranslation('onboarding');
  const router = useRouter();
  const initialInterval = (router.query.interval === 'annual' ? 'annual' : 'monthly') as BillingInterval;
  const [interval, setInterval] = useState<BillingInterval>(initialInterval);
  const [busyPlan, setBusyPlan] = useState<PlanTier | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [repeatNote, setRepeatNote] = useState<boolean>(false);
  const [referralDiscount, setReferralDiscount] = useState<string | null>(null);

  useEffect(() => {
    if (router.query.interval === 'annual' || router.query.interval === 'monthly') {
      setInterval(router.query.interval);
    }
  }, [router.query.interval]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      try {
        const res = await fetch('/api/referrals/my-discount', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        const payload = await res.json().catch(() => ({}));
        if (!cancelled && payload?.referred && payload?.discount_text) {
          setReferralDiscount(payload.discount_text);
        }
      } catch { /* silent */ }
    })();
    return () => { cancelled = true; };
  }, []);

  async function startCheckout(plan: PlanTier) {
    setError(null);
    setBusyPlan(plan);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) { setError(t('plan.not_signed_in')); return; }
      const res = await fetch('/api/billing/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ plan, interval }),
      });
      const payload = await res.json().catch(() => ({}));
      if (payload?.repeat_customer) setRepeatNote(true);
      if (!res.ok || !payload?.url) {
        setError(payload?.error ?? t('plan.checkout_error'));
        return;
      }
      window.location.href = payload.url;
    } finally {
      setBusyPlan(null);
    }
  }

  const plans: PlanTier[] = ['solo', 'team', 'growth'];

  return (
    <div className="min-h-screen bg-cream">
      <header className="px-6 md:px-12 py-6 border-b border-rule flex items-center justify-between">
        <Link href="/" className="font-display text-2xl tracking-tightest">
          crest<span className="italic text-forest">io</span>
        </Link>
        <button
          onClick={async () => { await supabase.auth.signOut(); router.push('/'); }}
          className="text-sm text-ink-muted hover:text-ink"
        >
          {t('plan.sign_out')}
        </button>
      </header>

      <main className="max-w-5xl mx-auto px-6 md:px-12 py-14 md:py-20">
        <div className="text-center mb-10 md:mb-14">
          <div className="text-2xs uppercase tracking-widest text-ink-muted mb-3">{t('plan.kicker')}</div>
          <h1 className="font-display text-4xl md:text-5xl tracking-tightest mb-4">
            {t('plan.heading')}
          </h1>
          <p className="text-sm md:text-base text-ink-muted max-w-xl mx-auto">
            {t('plan.subheading')}
          </p>
        </div>

        <div className="flex justify-center mb-10">
          <div className="inline-flex items-center border border-rule rounded bg-surface p-1 gap-1">
            <button
              type="button"
              onClick={() => setInterval('monthly')}
              className={[
                'px-4 py-2 text-sm rounded transition-colors',
                interval === 'monthly' ? 'bg-forest text-cream' : 'text-ink-muted hover:text-ink',
              ].join(' ')}
            >
              {t('plan.monthly')}
            </button>
            <button
              type="button"
              onClick={() => setInterval('annual')}
              className={[
                'px-4 py-2 text-sm rounded transition-colors flex items-center gap-2',
                interval === 'annual' ? 'bg-forest text-cream' : 'text-ink-muted hover:text-ink',
              ].join(' ')}
            >
              {t('plan.annual')}
              <Badge variant="warning">{t('plan.save_2_months')}</Badge>
            </button>
          </div>
        </div>

        {referralDiscount && (
          <div className="card p-4 mb-6 text-sm text-forest-ink bg-forest-soft/60 border-forest/40 flex items-center gap-2">
            <span aria-hidden="true" className="text-forest">✓</span>
            <span>{t('plan.referral_discount', { discount: referralDiscount })}</span>
          </div>
        )}
        {repeatNote && (
          <div className="card p-4 mb-6 text-sm text-ink-muted bg-amber-soft/40 border-amber/40">
            {t('plan.repeat_customer')}
          </div>
        )}
        {error && <div className="card p-4 mb-6 text-sm text-claret">{error}</div>}

        <div className="grid md:grid-cols-3 gap-5">
          {plans.map((p) => {
            const entry = PLAN_CATALOGUE[p];
            const priceDisplay = formatPlanPrice(p, interval);
            const highlight = p === 'team';
            return (
              <article
                key={p}
                className={[
                  'card p-7 flex flex-col',
                  highlight ? 'border-forest bg-forest-soft/30' : '',
                ].join(' ')}
              >
                {highlight && (
                  <div className="mb-3">
                    <Badge variant="success">{t('plan.most_popular')}</Badge>
                  </div>
                )}
                <h2 className={['font-display text-2xl tracking-tightest mb-1', highlight ? 'text-forest-ink' : 'text-ink'].join(' ')}>
                  {t('plan.tier_name', { tier: entry.label })}
                </h2>
                <p className="text-sm text-ink-muted mb-5">{entry.pitch}</p>
                <div className="mb-5">
                  <div className="font-display text-3xl tracking-tightest text-ink">{priceDisplay.split(' ')[0]}</div>
                  <div className="text-xs text-ink-muted">{priceDisplay.replace(priceDisplay.split(' ')[0] + ' ', '')}</div>
                </div>
                <ul className="space-y-2 mb-6 text-sm text-ink-muted">
                  {entry.features.map((f) => (
                    <li key={f} className="flex items-start gap-2">
                      <span aria-hidden="true" className="text-forest mt-0.5">✓</span>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-auto">
                  {entry.isContactSales ? (
                    <button
                      type="button"
                      onClick={() => window.dispatchEvent(new CustomEvent('crestio:open-support'))}
                      className="btn-secondary w-full"
                    >
                      {t('plan.contact_sales')}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => startCheckout(p)}
                      disabled={busyPlan !== null}
                      className={highlight ? 'btn-primary w-full' : 'btn-secondary w-full'}
                    >
                      {busyPlan === p
                        ? t('plan.redirecting')
                        : t('plan.start_trial', { days: entry.trialDays })}
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>

        <p className="text-center text-2xs text-ink-soft mt-10">
          {t('plan.footer_note')}
        </p>
      </main>
    </div>
  );
}

export default function Page() {
  return <AuthGuard><PlanPickerInner /></AuthGuard>;
}
