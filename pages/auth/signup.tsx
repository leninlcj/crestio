import { useEffect, useState, FormEvent } from 'react';
import Link from 'next/link';
import Head from 'next/head';
import { useRouter } from 'next/router';
import type { GetStaticProps } from 'next';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { readReferralCookie, clearReferralCookie } from '../../lib/referralCookie';
import { normaliseCode } from '../../lib/referralCode';
import { serverSideTranslations } from '../../lib/i18nServer';

export default function SignUp() {
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

    if (!data.session) {
      setLoading(false);
      setSentConfirmation(true);
      return;
    }

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
      } catch { /* ignore */ }
    }

    setLoading(false);
    router.push('/app/onboarding/plan');
  }

  return (
    <div className="min-h-screen bg-cream flex flex-col">
      <Head>
        <title>{t('signup.page_title')}</title>
      </Head>
      <div className="flex-1 flex items-center justify-center px-4 py-16">
        <div className="w-full max-w-[400px]">
          <Link href="/" className="block mx-auto mb-10 font-display text-2xl tracking-tighter text-center">
            crest<span className="italic text-forest">io</span>
          </Link>

          {sentConfirmation ? (
            <>
              <h1 className="text-[24px] font-display font-semibold tracking-tighter mb-1 m-0">
                {t('signup.confirm_title')}
              </h1>
              <p className="text-sm text-ink-muted mb-6 leading-relaxed">
                {t('signup.confirm_body', { email })}
              </p>
              <Link href="/auth/signin" className="btn-secondary w-full">
                {t('signup.back_to_sign_in')}
              </Link>
            </>
          ) : (
            <>
              <h1 className="text-[24px] font-display font-semibold tracking-tighter mb-1 m-0">
                Create your account
              </h1>
              <p className="text-sm text-ink-muted mb-8">
                Start your free trial — no card required.
              </p>

              <form onSubmit={onSubmit} className="space-y-4">
                <div>
                  <label htmlFor="signup-email" className="label">{t('signup.email')}</label>
                  <input
                    id="signup-email"
                    type="email" name="email" autoComplete="email"
                    required autoFocus
                    value={email} onChange={(e) => setEmail(e.target.value)}
                    className="input"
                  />
                </div>
                <div>
                  <label htmlFor="signup-password" className="label">{t('signup.password')}</label>
                  <input
                    id="signup-password"
                    type="password" name="new-password" autoComplete="new-password"
                    required minLength={8}
                    value={password} onChange={(e) => setPassword(e.target.value)}
                    className="input"
                  />
                  <div className="text-xs text-ink-soft mt-1.5">{t('signup.password_hint')}</div>
                </div>

                {!showReferralField ? (
                  <button
                    type="button"
                    onClick={() => setShowReferralField(true)}
                    className="text-xs text-forest hover:text-forest-ink underline underline-offset-2 block"
                  >
                    {t('signup.referral_prompt')}
                  </button>
                ) : (
                  <div>
                    <label htmlFor="signup-referral" className="label">
                      {t('signup.referral_label')} <span className="text-ink-soft normal-case font-normal">{t('signup.referral_optional')}</span>
                    </label>
                    <input
                      id="signup-referral"
                      type="text"
                      name="referral-code"
                      value={referralCode}
                      onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
                      placeholder="CRESTIO-XXXXYYYY"
                      className="input font-mono tracking-wide uppercase"
                      autoComplete="off"
                    />
                    <div className="text-xs text-ink-soft mt-1.5">
                      {t('signup.referral_hint')}
                    </div>
                  </div>
                )}

                {error && <div className="text-xs text-claret">{error}</div>}

                <button type="submit" disabled={loading} className="btn-primary w-full">
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

export const getStaticProps: GetStaticProps = async ({ locale }) => ({
  props: {
    ...serverSideTranslations(locale, ['auth']),
  },
});
