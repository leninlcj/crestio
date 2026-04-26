import { useState, FormEvent } from 'react';
import Link from 'next/link';
import Head from 'next/head';
import type { GetStaticProps } from 'next';
import { useTranslation } from 'react-i18next';
import { serverSideTranslations } from '../lib/i18nServer';

export default function Contact() {
  const { t } = useTranslation('marketing');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [copied, setCopied] = useState(false);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const subject = encodeURIComponent(
      name ? t('contact.subject_named', { name }) : t('contact.subject_anonymous')
    );
    const body = encodeURIComponent(
      [
        message,
        '',
        '---',
        name ? t('contact.body_from', { name }) : null,
        email ? t('contact.body_reply_to', { email }) : null,
      ]
        .filter(Boolean)
        .join('\n')
    );
    window.location.href = `mailto:hello@crestio.ai?subject=${subject}&body=${body}`;
  }

  async function copyEmail() {
    try {
      await navigator.clipboard.writeText('hello@crestio.ai');
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Fallback: do nothing; the mailto: form still works
    }
  }

  return (
    <>
      <Head>
        <title>{t('meta.contact_title')}</title>
      </Head>
      <div className="min-h-screen bg-cream text-ink">
        <nav className="px-6 md:px-12 py-6 flex items-center justify-between border-b border-rule">
          <Link href="/" className="font-display text-2xl tracking-tightest">
            crest<span className="italic text-forest">io</span>
          </Link>
          <Link href="/auth/signin" className="text-sm text-ink-muted hover:text-ink">
            {t('nav.sign_in')}
          </Link>
        </nav>

        <div className="max-w-xl mx-auto px-6 md:px-12 py-16 md:py-24">
          <div className="text-2xs uppercase tracking-widest text-ink-muted mb-3">{t('contact.eyebrow')}</div>
          <h1 className="font-display text-5xl md:text-6xl tracking-tightest mb-4">{t('contact.heading')}</h1>
          <p className="text-ink-muted mb-10 leading-relaxed">
            {t('contact.intro')}
          </p>

          <div className="card p-6 mb-8 flex items-center justify-between gap-4">
            <div>
              <div className="text-2xs uppercase tracking-widest text-ink-muted mb-1">{t('contact.email_label')}</div>
              <div className="font-mono text-sm text-ink">hello@crestio.ai</div>
            </div>
            <button onClick={copyEmail} className="btn-secondary text-xs">
              {copied ? t('contact.copied') : t('contact.copy')}
            </button>
          </div>

          <form onSubmit={onSubmit} className="card p-8 space-y-5">
            <div className="text-2xs uppercase tracking-widest text-ink-muted">
              {t('contact.or_send_via_mail')}
            </div>
            <div>
              <label className="label">{t('contact.name_label')}</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="input"
              />
            </div>
            <div>
              <label className="label">{t('contact.email_field_label')}</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input"
              />
              <div className="text-2xs text-ink-soft mt-1.5">
                {t('contact.email_hint')}
              </div>
            </div>
            <div>
              <label className="label">{t('contact.message_label')}</label>
              <textarea
                required
                rows={6}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="input"
                placeholder={t('contact.message_placeholder')}
              />
            </div>
            <button type="submit" disabled={!message.trim()} className="btn-primary w-full py-3">
              {t('contact.submit')}
            </button>
            <div className="text-2xs text-ink-soft text-center">
              {t('contact.submit_note')}
            </div>
          </form>
        </div>

        <footer className="px-6 md:px-12 py-10 border-t border-rule text-xs text-ink-muted">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>{t('contact.footer_location')}</div>
            <div className="flex flex-wrap gap-6">
              <Link href="/privacy" className="hover:text-ink">{t('footer.privacy')}</Link>
              <Link href="/terms" className="hover:text-ink">{t('footer.terms')}</Link>
              <Link href="/contact" className="hover:text-ink">{t('contact.eyebrow')}</Link>
              <Link href="/auth/signin" className="hover:text-ink">{t('nav.sign_in')}</Link>
            </div>
          </div>
        </footer>
      </div>
    </>
  );
}

export const getStaticProps: GetStaticProps = async ({ locale }) => ({
  props: {
    ...serverSideTranslations(locale, ['marketing']),
  },
});
