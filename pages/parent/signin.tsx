import { useState, FormEvent, useEffect } from 'react';
import Link from 'next/link';
import Head from 'next/head';
import { useRouter } from 'next/router';
import type { GetStaticProps } from 'next';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { serverSideTranslations } from '../../lib/i18nServer';

type Banner = { kind: 'success' | 'neutral'; text: string } | null;

export default function ParentSignIn() {
  const { t } = useTranslation('parent');
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<Banner>(null);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data: parent } = await supabase
        .from('parents')
        .select('id')
        .eq('auth_user_id', session.user.id)
        .maybeSingle();
      if (parent) router.replace('/parent/dashboard');
    })();
  }, [router]);

  // Read the query-param banners after the router is ready. Auto-dismiss after
  // 8 seconds so they don't linger on the page.
  useEffect(() => {
    if (!router.isReady) return;
    if (router.query.just_created === '1') {
      setBanner({ kind: 'success', text: t('signin.banner_just_created') });
    } else if (router.query.reason === 'session_expired') {
      setBanner({ kind: 'neutral', text: t('signin.banner_session_expired') });
    } else {
      return;
    }
    const id = setTimeout(() => setBanner(null), 8000);
    return () => clearTimeout(id);
  }, [router.isReady, router.query.just_created, router.query.reason, t]);

  // Clear the banner on next navigation.
  useEffect(() => {
    const handle = () => setBanner(null);
    router.events.on('routeChangeStart', handle);
    return () => router.events.off('routeChangeStart', handle);
  }, [router.events]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { data: signInData, error: err } = await supabase.auth.signInWithPassword({ email, password });
    if (err) {
      setLoading(false);
      const msg = err.message ?? '';
      if (/invalid login credentials/i.test(msg)) {
        setError(t('signin.invalid_credentials'));
      } else {
        setError(msg || t('signin.invalid_credentials'));
      }
      return;
    }
    if (!signInData.user) {
      setLoading(false);
      setError(t('signin.error_generic'));
      return;
    }
    const { data: parent } = await supabase
      .from('parents')
      .select('id')
      .eq('auth_user_id', signInData.user.id)
      .maybeSingle();
    setLoading(false);
    if (!parent) {
      await supabase.auth.signOut();
      setError(t('signin.error_not_parent'));
      return;
    }
    router.push('/parent/dashboard');
  }

  async function forgotPassword() {
    if (!email) {
      setError(t('signin.forgot_need_email'));
      return;
    }
    setError(null);
    const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    });
    if (err) setError(err.message);
    else setError(t('signin.forgot_sent'));
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
          {banner && (
            <div
              role={banner.kind === 'success' ? 'status' : 'note'}
              className={`mb-6 flex items-start justify-between gap-3 p-3 rounded border text-sm ${
                banner.kind === 'success'
                  ? 'border-forest/30 bg-forest-soft/50 text-forest-ink'
                  : 'border-rule bg-rule-soft/40 text-ink'
              }`}
            >
              <span>{banner.text}</span>
              <button
                type="button"
                onClick={() => setBanner(null)}
                className="text-2xs text-ink-soft hover:text-ink"
                aria-label={t('signin.banner_dismiss')}
              >
                ✕
              </button>
            </div>
          )}
          <div className="text-2xs uppercase tracking-widest text-ink-muted mb-3">{t('signin.kicker')}</div>
          <h1 className="font-display text-4xl tracking-tightest mb-10">{t('signin.heading')}</h1>

          <form onSubmit={onSubmit} className="space-y-5">
            <div>
              <label htmlFor="parent-signin-email" className="label">{t('signin.email_label')}</label>
              <input id="parent-signin-email" type="email"
                name="email" autoComplete="email"
                required autoFocus value={email}
                onChange={(e) => setEmail(e.target.value)} className="input" />
            </div>
            <div>
              <label htmlFor="parent-signin-password" className="label">{t('signin.password_label')}</label>
              <input id="parent-signin-password" type="password"
                name="current-password" autoComplete="current-password"
                required value={password}
                onChange={(e) => setPassword(e.target.value)} className="input" />
            </div>

            {error && <div className="text-sm text-claret">{error}</div>}

            <div className="flex items-center justify-end -mt-1">
              <button type="button" onClick={forgotPassword}
                className="text-2xs uppercase tracking-widest text-ink-muted hover:text-ink">
                {t('signin.forgot')}
              </button>
            </div>

            <button type="submit" disabled={loading} className="btn-primary w-full py-3">
              {loading ? t('signin.submitting') : t('signin.submit')}
            </button>
          </form>

          <div className="mt-8 text-sm text-ink-muted text-center">
            {t('signin.invitation_hint')}
          </div>
        </div>
      </div>
    </div>
  );
}

export const getStaticProps: GetStaticProps = async ({ locale }) => ({
  props: {
    ...serverSideTranslations(locale, ['parent']),
  },
});
