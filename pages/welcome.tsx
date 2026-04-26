import { useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { useLocale } from '../lib/localeContext';
import { PLAN_CATALOGUE } from '../lib/plans';

type SessionInfo = {
  payment_status: 'paid' | 'unpaid' | 'no_payment_required';
  source: string | null;
  plan_tier: 'solo' | 'team' | 'growth' | null;
  billing_interval: 'monthly' | 'annual' | null;
  customer_email: string | null;
};

type LookupState =
  | { kind: 'loading' }
  | { kind: 'missing_id' }
  | { kind: 'not_found' }
  | { kind: 'error' }
  | { kind: 'unpaid' }
  | { kind: 'paid'; info: SessionInfo };

type ResendState =
  | { kind: 'idle' }
  | { kind: 'sending' }
  | { kind: 'sent' }
  | { kind: 'rate_limited'; minutes: number }
  | { kind: 'failed' };

// Gate on LocaleProvider's isReady so useTranslation never runs against an
// uninitialised i18next instance — otherwise the page paints raw keys for
// ~500ms before hydrating.
export default function Welcome() {
  const { isReady } = useLocale();
  if (!isReady) return <div className="min-h-screen bg-cream" aria-hidden />;
  return <WelcomeInner />;
}

function WelcomeInner() {
  const { t } = useTranslation('welcome');
  const router = useRouter();
  const [state, setState] = useState<LookupState>({ kind: 'loading' });
  const [resend, setResend] = useState<ResendState>({ kind: 'idle' });
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  const sessionId = typeof router.query.session_id === 'string' ? router.query.session_id : '';

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (mounted) setSignedIn(Boolean(data.session?.user));
    });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (!router.isReady) return;
    if (!sessionId) {
      setState({ kind: 'missing_id' });
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/billing/get-checkout-session?session_id=${encodeURIComponent(sessionId)}`);
        if (cancelled) return;
        if (res.status === 404) { setState({ kind: 'not_found' }); return; }
        if (!res.ok) { setState({ kind: 'error' }); return; }
        const info = (await res.json()) as SessionInfo;
        if (info.payment_status !== 'paid') { setState({ kind: 'unpaid' }); return; }
        setState({ kind: 'paid', info });
      } catch {
        if (!cancelled) setState({ kind: 'error' });
      }
    })();
    return () => { cancelled = true; };
  }, [router.isReady, sessionId]);

  // If the visitor is already signed in and payment was successful, send them
  // straight to the app. Onboarding state is handled inside /app.
  useEffect(() => {
    if (state.kind !== 'paid') return;
    if (signedIn) {
      const id = setTimeout(() => router.replace('/app'), 1200);
      return () => clearTimeout(id);
    }
  }, [state, signedIn, router]);

  async function onResend() {
    if (resend.kind === 'sending') return;
    setResend({ kind: 'sending' });
    try {
      const res = await fetch('/api/welcome/resend-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId }),
      });
      const payload = await res.json().catch(() => ({}));
      if (res.status === 429) {
        const seconds = Number(payload?.retry_after_seconds ?? 0);
        const minutes = Math.max(1, Math.ceil(seconds / 60));
        setResend({ kind: 'rate_limited', minutes });
        return;
      }
      if (!res.ok) { setResend({ kind: 'failed' }); return; }
      setResend({ kind: 'sent' });
    } catch {
      setResend({ kind: 'failed' });
    }
  }

  return (
    <>
      <Head><title>{t('meta.title')}</title></Head>
      <div className="min-h-screen bg-cream text-ink flex flex-col">
        <nav className="px-6 md:px-12 py-5">
          <Link href="/" className="font-display text-2xl tracking-tightest">
            crest<span className="italic text-forest">io</span>
          </Link>
        </nav>

        <main className="flex-1 flex items-start justify-center px-6 md:px-12 py-12 md:py-20">
          <div className="max-w-lg w-full">
            {state.kind === 'loading' && (
              <p className="text-ink-muted text-sm">{t('loading')}</p>
            )}

            {state.kind === 'missing_id' && (
              <div>
                <h1 className="font-display text-3xl md:text-4xl tracking-tightest mb-4">
                  {t('missing.heading')}
                </h1>
                <p className="text-ink-muted leading-relaxed mb-6">{t('missing.body')}</p>
                <Link href="/#pricing" className="btn-primary inline-block">
                  {t('missing.back_to_pricing')}
                </Link>
              </div>
            )}

            {(state.kind === 'not_found' || state.kind === 'error') && (
              <div>
                <h1 className="font-display text-3xl md:text-4xl tracking-tightest mb-4">
                  {t('error.heading')}
                </h1>
                <p className="text-ink-muted leading-relaxed">{t('error.body')}</p>
              </div>
            )}

            {state.kind === 'unpaid' && (
              <div>
                <h1 className="font-display text-3xl md:text-4xl tracking-tightest mb-4">
                  {t('unpaid.heading')}
                </h1>
                <p className="text-ink-muted leading-relaxed mb-6">{t('unpaid.body')}</p>
                <Link href="/#pricing" className="btn-secondary inline-block">
                  {t('unpaid.back_to_pricing')}
                </Link>
              </div>
            )}

            {state.kind === 'paid' && signedIn && (
              <div>
                <h1 className="font-display text-3xl md:text-4xl tracking-tightest mb-4">
                  {t('logged_in.heading')}
                </h1>
                <p className="text-ink-muted leading-relaxed mb-6">{t('logged_in.subheading')}</p>
                <Link href="/app" className="btn-primary inline-block">
                  {t('logged_in.go_to_app')}
                </Link>
              </div>
            )}

            {state.kind === 'paid' && signedIn === false && (
              <div>
                <div className="text-2xs uppercase tracking-widest text-ink-muted mb-3">
                  {t('paid.eyebrow')}
                </div>
                <h1 className="font-display text-3xl md:text-4xl tracking-tightest mb-4">
                  {t('paid.heading')}
                </h1>
                <p className="text-ink-muted leading-relaxed mb-2">
                  {state.info.customer_email
                    ? t('paid.subheading_logged_out', { email: state.info.customer_email })
                    : t('paid.subheading_no_email')}
                </p>
                {state.info.plan_tier && state.info.billing_interval && (
                  <p className="text-2xs text-ink-soft mb-6">
                    {t('paid.plan_line', {
                      plan: PLAN_CATALOGUE[state.info.plan_tier]?.label ?? state.info.plan_tier,
                      interval: state.info.billing_interval,
                    })}
                  </p>
                )}
                <p className="text-xs text-ink-soft mb-8">{t('paid.spam_hint')}</p>

                <div className="flex flex-wrap gap-3 items-center">
                  <button
                    type="button"
                    onClick={onResend}
                    disabled={resend.kind === 'sending'}
                    className="btn-secondary text-sm"
                  >
                    {resend.kind === 'sending' ? t('paid.resend_pending') : t('paid.resend_button')}
                  </button>
                  {resend.kind === 'sent' && (
                    <span className="text-sm text-forest">{t('paid.resend_done')}</span>
                  )}
                  {resend.kind === 'rate_limited' && (
                    <span className="text-sm text-ink-muted">
                      {t('paid.resend_rate_limited', { minutes: resend.minutes })}
                    </span>
                  )}
                  {resend.kind === 'failed' && (
                    <span className="text-sm text-claret">{t('paid.resend_failed')}</span>
                  )}
                </div>

                <p className="text-2xs text-ink-soft mt-10">{t('paid.support_line')}</p>
              </div>
            )}
          </div>
        </main>
      </div>
    </>
  );
}
