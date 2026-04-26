import { useState, FormEvent, useEffect } from 'react';
import Link from 'next/link';
import Head from 'next/head';
import { useRouter } from 'next/router';
import type { GetStaticProps } from 'next';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { serverSideTranslations } from '../../lib/i18nServer';

type Step = 'password' | 'mfa';

const MAX_MFA_ATTEMPTS = 5;

export default function SignIn() {
  const router = useRouter();
  const { t } = useTranslation('auth');
  const [step, setStep] = useState<Step>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [showExpiredBanner, setShowExpiredBanner] = useState(false);

  useEffect(() => {
    if (router.query.reason === 'session_expired') {
      setShowExpiredBanner(true);
    }
  }, [router.query.reason]);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aal && aal.currentLevel === 'aal1' && aal.nextLevel === 'aal2') {
        setStep('mfa');
        return;
      }
      router.replace('/app');
    })();
  }, [router]);

  async function onPasswordSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password });
    if (signInErr) {
      setLoading(false);
      // Translate Supabase's raw "Invalid login credentials" into a humanized
      // message. Keep ambiguous about whether email or password was wrong.
      const msg = signInErr.message ?? '';
      if (/invalid login credentials/i.test(msg)) {
        setError(t('signin.invalid_credentials'));
      } else {
        setError(msg || t('signin.invalid_credentials'));
      }
      return;
    }
    const { data: aal, error: aalErr } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    setLoading(false);
    if (aalErr) {
      setError(aalErr.message);
      return;
    }
    if (aal && aal.currentLevel === 'aal1' && aal.nextLevel === 'aal2') {
      setCode('');
      setStep('mfa');
      return;
    }
    router.push('/app');
  }

  async function onMfaSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { data: factorsData, error: factorsErr } = await supabase.auth.mfa.listFactors();
      if (factorsErr) throw factorsErr;
      const totp = factorsData?.totp ?? [];
      const factor = totp.find((f) => f.status === 'verified') || totp[0];
      if (!factor) throw new Error('No authenticator configured for this account.');

      const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({ factorId: factor.id });
      if (chErr) throw chErr;

      const { error: verifyErr } = await supabase.auth.mfa.verify({
        factorId: factor.id,
        challengeId: ch.id,
        code,
      });
      if (verifyErr) throw verifyErr;

      setFailedAttempts(0);
      router.push('/app');
    } catch {
      const next = failedAttempts + 1;
      setCode('');
      if (next >= MAX_MFA_ATTEMPTS) {
        await supabase.auth.signOut();
        setFailedAttempts(0);
        setEmail('');
        setPassword('');
        setStep('password');
        setError(t('signin.mfa_too_many_attempts'));
      } else {
        setFailedAttempts(next);
        setError(t('signin.mfa_invalid'));
      }
    } finally {
      setLoading(false);
    }
  }

  async function cancelMfa() {
    await supabase.auth.signOut();
    setStep('password');
    setCode('');
    setError(null);
    setFailedAttempts(0);
    setPassword('');
  }

  return (
    <div className="min-h-screen bg-cream flex flex-col">
      <Head>
        <title>{t('signin.page_title')}</title>
      </Head>
      <div className="px-6 md:px-12 py-6">
        <Link href="/" className="font-display text-2xl tracking-tightest">
          crest<span className="italic text-forest">io</span>
        </Link>
      </div>

      <div className="flex-1 flex items-center justify-center px-6 pb-16">
        <div className="w-full max-w-sm">
          {step === 'password' ? (
            <>
              {showExpiredBanner && (
                <div className="mb-6 flex items-start justify-between gap-3 p-3 rounded border border-rule bg-rule-soft/40 text-sm text-ink">
                  <span>{t('signin.session_expired')}</span>
                  <button
                    type="button"
                    onClick={() => setShowExpiredBanner(false)}
                    className="text-2xs text-ink-soft hover:text-ink"
                    aria-label={t('signin.dismiss')}
                  >
                    ✕
                  </button>
                </div>
              )}
              <div className="text-2xs uppercase tracking-widest text-ink-muted mb-3">{t('signin.kicker')}</div>
              <h1 className="font-display text-4xl tracking-tightest mb-10">{t('signin.title')}</h1>

              <form onSubmit={onPasswordSubmit} className="space-y-5">
                <div>
                  <label htmlFor="signin-email" className="label">{t('signin.email')}</label>
                  <input
                    id="signin-email"
                    type="email"
                    name="email"
                    autoComplete="email"
                    required
                    autoFocus
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="input"
                  />
                </div>
                <div>
                  <label htmlFor="signin-password" className="label">{t('signin.password')}</label>
                  <input
                    id="signin-password"
                    type="password"
                    name="current-password"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="input"
                  />
                </div>

                {error && <div className="text-sm text-claret">{error}</div>}

                <div className="flex items-center justify-end -mt-1">
                  <Link href="/auth/forgot-password" className="text-2xs uppercase tracking-widest text-ink-muted hover:text-ink">
                    {t('signin.forgot_password')}
                  </Link>
                </div>

                <button type="submit" disabled={loading} className="btn-primary w-full py-3">
                  {loading ? t('signin.submitting') : t('signin.submit')}
                </button>
              </form>

              <div className="mt-8 text-sm text-ink-muted text-center">
                {t('signin.no_account_prompt')}{' '}
                <Link href="/auth/signup" className="text-forest underline underline-offset-2">
                  {t('signin.create_one')}
                </Link>
              </div>
            </>
          ) : (
            <>
              <div className="text-2xs uppercase tracking-widest text-ink-muted mb-3">{t('signin.mfa_kicker')}</div>
              <h1 className="font-display text-4xl tracking-tightest mb-4">{t('signin.mfa_title')}</h1>
              <p className="text-sm text-ink-muted mb-10 leading-relaxed">
                {t('signin.mfa_intro')}
              </p>

              <form onSubmit={onMfaSubmit} className="space-y-5">
                <div>
                  <label className="label">{t('signin.mfa_code_label')}</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    autoComplete="one-time-code"
                    maxLength={6}
                    autoFocus
                    required
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                    className="input font-mono tracking-widest text-center text-lg"
                  />
                </div>

                {error && <div className="text-sm text-claret">{error}</div>}

                <button
                  type="submit"
                  disabled={loading || code.length !== 6}
                  className="btn-primary w-full py-3"
                >
                  {loading ? t('signin.mfa_submitting') : t('signin.mfa_submit')}
                </button>
              </form>

              <button
                type="button"
                onClick={cancelMfa}
                className="mt-6 text-2xs uppercase tracking-widest text-ink-muted hover:text-ink block mx-auto"
              >
                {t('signin.mfa_cancel')}
              </button>
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
