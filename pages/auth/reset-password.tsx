import { useEffect, useState, FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';

export default function ResetPassword() {
  const router = useRouter();
  const { t } = useTranslation('auth');
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    // When a user clicks the email link, Supabase redirects here with a session.
    // Wait for it to be established before showing the form.
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        setReady(true);
        return;
      }
      const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
        if (session) setReady(true);
      });
      return () => sub.subscription.unsubscribe();
    })();
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error: err } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (err) {
      setError(err.message);
      return;
    }
    setDone(true);
    setTimeout(() => router.push('/app'), 1500);
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
          <div className="text-2xs uppercase tracking-widest text-ink-muted mb-3">
            {t('reset_password.kicker')}
          </div>
          <h1 className="font-display text-4xl tracking-tightest mb-8">
            {t('reset_password.title')}
          </h1>

          {!ready ? (
            <p className="text-sm text-ink-muted">
              {t('reset_password.waiting')}
            </p>
          ) : done ? (
            <p className="text-sm text-forest">
              {t('reset_password.done')}
            </p>
          ) : (
            <form onSubmit={onSubmit} className="space-y-5">
              <div>
                <label className="label">{t('reset_password.new_password')}</label>
                <input
                  type="password"
                  required
                  autoFocus
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input"
                />
                <div className="text-2xs text-ink-soft mt-1.5">{t('reset_password.password_hint')}</div>
              </div>

              {error && <div className="text-sm text-claret">{error}</div>}

              <button type="submit" disabled={loading} className="btn-primary w-full py-3">
                {loading ? t('reset_password.submitting') : t('reset_password.submit')}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
