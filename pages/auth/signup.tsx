import { useEffect, useState, FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { useLocale } from '../../lib/localeContext';
import { readReferralCookie, clearReferralCookie } from '../../lib/referralCookie';
import { normaliseCode } from '../../lib/referralCode';

// Gate on LocaleProvider's isReady so useTranslation never runs against an
// uninitialised i18next instance — otherwise the page paints raw keys for
// ~500ms before hydrating.
export default function SignUp() {
  const { isReady } = useLocale();
  if (!isReady) return <div className="min-h-screen bg-cream" aria-hidden />;
  return <SignUpInner />;
}

function SignUpInner() {
  const router = useRouter();
  const { t } = useTranslation('auth');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [referralCode, setReferralCode] = useState('');
  const [showReferralField, setShowReferralField] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentConfirmation, setSentConfirmation] = useState(false);

  // Pre-fill referral code from the cookie captured by ReferralCapture.
  useEffect(() => {
    const cached = readReferralCookie();
    if (cached) {
      setReferralCode(cached);
      setShowReferralField(true);
    }
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { data, error: err } = await supabase.auth.signUp({ email, password });

    if (err) {
      setLoading(false);
      setError(err.message);
      return;
    }

    // If email confirmation is enabled, session will be null — the user will
    // record their referral after confirming. For that case we keep the
    // cookie so it's still available on the confirmed-session device.
    if (!data.session) {
      setLoading(false);
      setSentConfirmation(true);
      return;
    }

    // Detect region → seed invoicing currency + UI locale. Best-effort; never
    // blocks signup.
    try {
      await fetch('/api/onboarding/detect-region', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${data.session.access_token}`,
        },
        body: JSON.stringify({}),
      });
    } catch { /* ignore */ }

    // Record the referral (non-fatal — signup still continues on failure).
    const code = normaliseCode(referralCode);
    if (code) {
      try {
        const res = await fetch('/api/referrals/record-signup', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${data.session.access_token}`,
          },
          body: JSON.stringify({ code }),
        });
        const payload = await res.json().catch(() => ({}));
        if (payload?.recorded) clearReferralCookie();
      } catch {
        // Silent fail — referral isn't critical path for signup.
      }
    }

    setLoading(false);
    router.push('/app/onboarding/plan');
  }

  return (
    <div className="min-h-screen bg-cream flex flex-col">
      <div className="px-6 md:px-12 py-6">
        <Link href="/" className="font-display text-2xl tracking-tightest">
          crest<span className="italic text-forest">io</span>
        </Link>
      </div>

      <div className="flex-1 flex items-center justify-center px-6 pb-16">
        <div className="w-full max-w-sm">
          {sentConfirmation ? (
            <>
              <div className="text-2xs uppercase tracking-widest text-ink-muted mb-3">
                {t('signup.confirm_kicker')}
              </div>
              <h1 className="font-display text-4xl tracking-tightest mb-5">
                {t('signup.confirm_title')}
              </h1>
              <p className="text-sm text-ink-muted leading-relaxed">
                {t('signup.confirm_body', { email })}
              </p>
              <Link href="/auth/signin" className="btn-secondary w-full mt-8 py-3 justify-center">
                {t('signup.back_to_sign_in')}
              </Link>
            </>
          ) : (
            <>
              <div className="text-2xs uppercase tracking-widest text-ink-muted mb-3">{t('signup.kicker')}</div>
              <h1 className="font-display text-4xl tracking-tightest mb-10">{t('signup.title')}</h1>

              <form onSubmit={onSubmit} className="space-y-5">
                <div>
                  <label className="label">{t('signup.email')}</label>
                  <input
                    type="email" required autoFocus
                    value={email} onChange={(e) => setEmail(e.target.value)}
                    className="input"
                  />
                </div>
                <div>
                  <label className="label">{t('signup.password')}</label>
                  <input
                    type="password" required minLength={8}
                    value={password} onChange={(e) => setPassword(e.target.value)}
                    className="input"
                  />
                  <div className="text-2xs text-ink-soft mt-1.5">{t('signup.password_hint')}</div>
                </div>

                {!showReferralField ? (
                  <button
                    type="button"
                    onClick={() => setShowReferralField(true)}
                    className="text-sm text-forest hover:text-forest-ink underline underline-offset-2 block"
                  >
                    {t('signup.referral_prompt')}
                  </button>
                ) : (
                  <div>
                    <label className="label">
                      {t('signup.referral_label')} <span className="text-ink-soft normal-case tracking-normal font-normal">{t('signup.referral_optional')}</span>
                    </label>
                    <input
                      type="text"
                      value={referralCode}
                      onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
                      placeholder="CRESTIO-XXXXYYYY"
                      className="input font-mono tracking-wide uppercase"
                      autoComplete="off"
                    />
                    <div className="text-2xs text-ink-soft mt-1.5">
                      {t('signup.referral_hint')}
                    </div>
                  </div>
                )}

                {error && <div className="text-sm text-claret">{error}</div>}

                <button type="submit" disabled={loading} className="btn-primary w-full py-3">
                  {loading ? t('signup.submitting') : t('signup.submit')}
                </button>
              </form>

              <div className="mt-8 text-sm text-ink-muted text-center">
                {t('signup.already_have_account')}{' '}
                <Link href="/auth/signin" className="text-forest underline underline-offset-2">
                  {t('signup.sign_in_link')}
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
