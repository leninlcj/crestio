import { useState, FormEvent, useEffect, useRef } from 'react';
import Link from 'next/link';
import Head from 'next/head';
import { useRouter } from 'next/router';
import type { GetStaticProps } from 'next';
import { useTranslation } from 'react-i18next';
import { serverSideTranslations } from '../../lib/i18nServer';

type InvitationInfo = {
  valid: boolean;
  reason?: 'missing' | 'not_found' | 'used' | 'expired';
  email?: string;
  studentName?: string;
  tutorBusinessName?: string;
  error?: string;
};

export default function ParentAccept() {
  const { t } = useTranslation('parent');
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [info, setInfo] = useState<InvitationInfo | null>(null);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement | null>(null);
  const passwordRef = useRef<HTMLInputElement | null>(null);

  // Chrome / 1Password autofill events don't always fire onChange. Poll the
  // refs once after mount + on focus/blur so the controlled state catches up
  // with whatever the password manager actually filled in. Without this the
  // submit button stays disabled even though the inputs visually look filled.
  useEffect(() => {
    function syncFromAutofill() {
      const n = nameRef.current?.value ?? '';
      const p = passwordRef.current?.value ?? '';
      if (n && n !== name) setName(n);
      if (p && p !== password) setPassword(p);
    }
    const t = setTimeout(syncFromAutofill, 250);
    window.addEventListener('focus', syncFromAutofill);
    return () => {
      clearTimeout(t);
      window.removeEventListener('focus', syncFromAutofill);
    };
  }, [name, password]);

  useEffect(() => {
    if (!router.isReady) return;
    const tok = typeof router.query.token === 'string' ? router.query.token : '';
    if (!tok) {
      setInfo({ valid: false, error: t('accept.missing_token') });
      return;
    }
    setToken(tok);
    (async () => {
      try {
        const res = await fetch(`/api/parents/accept-invitation?token=${encodeURIComponent(tok)}`);
        const payload = (await res.json()) as InvitationInfo;
        setInfo(payload);
      } catch {
        setInfo({ valid: false, error: t('accept.verify_failed') });
      }
    })();
  }, [router.isReady, router.query.token, t]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    if (password.length < 8) {
      setSubmitError(t('accept.password_too_short'));
      return;
    }
    setSubmitError(null);
    setSubmitting(true);
    try {
      const res = await fetch('/api/parents/accept-invitation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, name, password }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload?.error ?? `Server returned ${res.status}`);
      }
      router.push('/parent/signin?just_created=1');
    } catch (e: any) {
      setSubmitError(e?.message ?? t('accept.create_failed'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-cream flex flex-col">
      <Head>
        <title>Accept invitation · Crestio</title>
      </Head>
      <div className="px-6 md:px-12 py-6">
        <Link href="/" className="font-display text-2xl tracking-tightest">
          crest<span className="italic text-forest">io</span>
        </Link>
      </div>

      <div className="flex-1 flex items-center justify-center px-6 pb-16">
        <div className="w-full max-w-sm">
          <div className="text-2xs uppercase tracking-widest text-ink-muted mb-3">{t('accept.kicker')}</div>

          {!info ? (
            <div className="text-ink-muted text-sm">{t('accept.checking')}</div>
          ) : !info.valid ? (
            <>
              <h1 className="font-display text-3xl tracking-tightest mb-4">{t('accept.invalid_heading')}</h1>
              <p className="text-sm text-ink-muted leading-relaxed mb-6">
                {info.reason === 'expired'
                  ? t('accept.invalid_expired')
                  : info.reason === 'not_found' || info.reason === 'missing'
                  ? t('accept.invalid_not_found')
                  : `${info.error ?? t('accept.invalid_default')}${t('accept.invalid_body_suffix')}`}
              </p>
              <Link href="/" className="btn-ghost text-sm">{t('accept.back_home')}</Link>
            </>
          ) : (
            <>
              <h1 className="font-display text-4xl tracking-tightest mb-4">
                {t('accept.accept_heading')}
              </h1>
              <p className="text-sm text-ink-muted leading-relaxed mb-8">
                {t('accept.accept_body', { tutor: info.tutorBusinessName ?? '', student: info.studentName ?? '' })}
              </p>

              <form onSubmit={onSubmit} className="space-y-5">
                <div>
                  <label htmlFor="accept-email" className="label">{t('accept.email_label')}</label>
                  <input id="accept-email" type="email" name="email" autoComplete="email"
                    disabled value={info.email ?? ''} className="input bg-ink-soft/10" />
                  <div className="text-2xs text-ink-soft mt-1.5">
                    {t('accept.email_hint')}
                  </div>
                </div>
                <div>
                  <label htmlFor="accept-name" className="label">{t('accept.name_label')}</label>
                  <input id="accept-name" ref={nameRef} type="text"
                    name="name" autoComplete="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)} className="input"
                    placeholder={t('accept.name_placeholder')} />
                </div>
                <div>
                  <label htmlFor="accept-password" className="label">{t('accept.password_label')}</label>
                  <input id="accept-password" ref={passwordRef} type="password"
                    name="new-password" autoComplete="new-password"
                    required minLength={8} value={password}
                    onChange={(e) => setPassword(e.target.value)} className="input" />
                  <div className="text-2xs text-ink-soft mt-1.5">{t('accept.password_min')}</div>
                </div>

                {submitError && <div className="text-sm text-claret">{submitError}</div>}

                <button type="submit" disabled={submitting || password.length < 8}
                  className="btn-primary w-full py-3">
                  {submitting ? t('accept.creating') : t('accept.create')}
                </button>
              </form>
            </>
          )}
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
