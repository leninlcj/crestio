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
      <div className="flex-1 grid lg:grid-cols-2">
        <div className="flex items-center justify-center px-4 py-16">
        <div className="w-full max-w-[400px]">
          <Link href="/" className="block mx-auto mb-10 font-display text-2xl tracking-tighter text-center">
            crest<span className="italic text-forest">io</span>
          </Link>

          {step === 'password' ? (
            <>
              {showExpiredBanner && (
                <div className="mb-6 flex items-start justify-between gap-3 px-4 py-3 rounded-md border border-rule bg-surface text-sm text-ink">
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
              <h1 className="text-[24px] font-display font-semibold tracking-tighter mb-1 m-0">
                Welcome back
              </h1>
              <p className="text-sm text-ink-muted mb-8">
                Sign in to continue.
              </p>

              <form onSubmit={onPasswordSubmit} className="space-y-4">
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
                  <div className="flex items-center justify-between mb-1.5">
                    <label htmlFor="signin-password" className="label !mb-0">{t('signin.password')}</label>
                    <Link href="/auth/forgot-password" className="text-xs text-forest hover:text-forest-ink underline underline-offset-2">
                      {t('signin.forgot_password')}
                    </Link>
                  </div>
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

                {error && <div className="text-xs text-claret">{error}</div>}

                <button type="submit" disabled={loading} className="btn-primary w-full">
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
              <h1 className="text-[24px] font-display font-semibold tracking-tighter mb-1 m-0">
                {t('signin.mfa_title')}
              </h1>
              <p className="text-sm text-ink-muted mb-8 leading-relaxed">
                {t('signin.mfa_intro')}
              </p>

              <form onSubmit={onMfaSubmit} className="space-y-4">
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

                {error && <div className="text-xs text-claret">{error}</div>}

                <button
                  type="submit"
                  disabled={loading || code.length !== 6}
                  className="btn-primary w-full"
                >
                  {loading ? t('signin.mfa_submitting') : t('signin.mfa_submit')}
                </button>
              </form>

              <button
                type="button"
                onClick={cancelMfa}
                className="mt-6 text-xs text-ink-muted hover:text-ink block mx-auto"
              >
                {t('signin.mfa_cancel')}
              </button>
            </>
          )}
        </div>
        </div>
        <aside className="hidden lg:flex items-center justify-center px-12 py-16 border-l border-rule bg-surface">
          <figure className="max-w-md">
            <blockquote className="font-display text-2xl text-ink leading-snug tracking-tighter italic">
              “I built Crestio because every Sunday I was opening three different spreadsheets to do the same thing. So I built the tool that does the same thing in eight seconds.”
            </blockquote>
            <figcaption className="text-xs text-ink-muted mt-4 not-italic">
              — Lenin, founder · HSC English tutor, Sydney
            </figcaption>
          </figure>
        </aside>
      </div>
    </div>
  );
}

export const getStaticProps: GetStaticProps = async ({ locale }) => ({
  props: {
    ...serverSideTranslations(locale, ['auth']),
  },
});
