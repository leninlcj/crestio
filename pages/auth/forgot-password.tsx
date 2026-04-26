import { useState, FormEvent } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { useLocale } from '../../lib/localeContext';

// Gate on LocaleProvider's isReady so useTranslation never runs against an
// uninitialised i18next instance — otherwise the page paints raw keys for
// ~500ms before hydrating.
export default function ForgotPassword() {
  const { isReady } = useLocale();
  if (!isReady) return <div className="min-h-screen bg-cream" aria-hidden />;
  return <ForgotPasswordInner />;
}

function ForgotPasswordInner() {
  const { t } = useTranslation('auth');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const redirectTo =
      typeof window !== 'undefined'
        ? `${window.location.origin}/auth/reset-password`
        : undefined;

    const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo,
    });

    setLoading(false);
    if (err) {
      setError(err.message);
      return;
    }
    setSent(true);
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
          {sent ? (
            <>
              <div className="text-2xs uppercase tracking-widest text-ink-muted mb-3">
                {t('forgot_password.kicker_sent')}
              </div>
              <h1 className="font-display text-4xl tracking-tightest mb-5">
                {t('forgot_password.title_sent')}
              </h1>
              <p className="text-sm text-ink-muted leading-relaxed">
                {t('forgot_password.body_sent', { email })}
              </p>
              <Link href="/auth/signin" className="btn-secondary w-full mt-8 py-3 justify-center">
                {t('forgot_password.back_to_sign_in')}
              </Link>
            </>
          ) : (
            <>
              <div className="text-2xs uppercase tracking-widest text-ink-muted mb-3">
                {t('forgot_password.kicker')}
              </div>
              <h1 className="font-display text-4xl tracking-tightest mb-3">{t('forgot_password.title')}</h1>
              <p className="text-sm text-ink-muted mb-8">
                {t('forgot_password.body')}
              </p>

              <form onSubmit={onSubmit} className="space-y-5">
                <div>
                  <label className="label">{t('forgot_password.email')}</label>
                  <input
                    type="email"
                    required
                    autoFocus
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="input"
                  />
                </div>

                {error && <div className="text-sm text-claret">{error}</div>}

                <button type="submit" disabled={loading} className="btn-primary w-full py-3">
                  {loading ? t('forgot_password.submitting') : t('forgot_password.submit')}
                </button>
              </form>

              <div className="mt-8 text-sm text-ink-muted text-center">
                {t('forgot_password.remembered')}{' '}
                <Link href="/auth/signin" className="text-forest underline underline-offset-2">
                  {t('forgot_password.sign_in_link')}
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
