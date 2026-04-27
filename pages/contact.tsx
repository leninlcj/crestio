import { useState, FormEvent } from 'react';
import Link from 'next/link';
import Head from 'next/head';
import type { GetStaticProps } from 'next';
import { useTranslation } from 'react-i18next';
import MarketingNav from '../components/marketing/MarketingNav';
import MarketingFooter from '../components/marketing/MarketingFooter';
import marketingConfig from '../config/marketing.json';
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
      ].filter(Boolean).join('\n')
    );
    window.location.href = `mailto:support@crestio.ai?subject=${subject}&body=${body}`;
  }

  async function copyEmail() {
    try {
      await navigator.clipboard.writeText('support@crestio.ai');
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* fallback: form still works */ }
  }

  return (
    <>
      <Head>
        <title>{t('meta.contact_title')}</title>
      </Head>
      <div className="min-h-screen bg-cream text-ink">
        <MarketingNav />

        <main className="px-6 md:px-12 py-12 md:py-20 max-w-5xl mx-auto">
          <div className="grid md:grid-cols-12 gap-10 md:gap-16">
            <div className="md:col-span-5 md:sticky md:top-24 md:self-start">
              <div className="text-2xs uppercase tracking-widest text-ink-soft mb-3">{t('contact.eyebrow')}</div>
              <h1 className="font-display text-4xl md:text-5xl tracking-tighter text-balance leading-[1.05] mb-5">
                {t('contact.heading')}
              </h1>
              <p className="text-base text-ink-muted leading-relaxed mb-7">
                {t('contact.intro')}
              </p>

              <div className="rounded-md border border-forest/30 bg-forest/[0.04] p-5 mb-7">
                <div className="text-2xs uppercase tracking-widest text-forest-ink mb-1">
                  {t('contact.guarantee')}
                </div>
              </div>

              <div className="space-y-4">
                <div className="text-2xs uppercase tracking-widest text-ink-soft">{t('contact.alt_heading')}</div>
                <a
                  href="mailto:support@crestio.ai"
                  className="flex items-center justify-between gap-3 p-3 rounded border border-rule hover:bg-surface transition-colors"
                >
                  <span className="text-sm text-ink">{t('contact.alt_email')}</span>
                  <span className="text-2xs text-ink-soft font-mono">support@crestio.ai</span>
                </a>
                {marketingConfig.social?.twitter && (
                  <a
                    href={marketingConfig.social.twitter}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between gap-3 p-3 rounded border border-rule hover:bg-surface transition-colors"
                  >
                    <span className="text-sm text-ink">{t('contact.alt_x')}</span>
                    <span className="text-2xs text-ink-soft">@crestio</span>
                  </a>
                )}
                {marketingConfig.social?.linkedin && (
                  <a
                    href={marketingConfig.social.linkedin}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between gap-3 p-3 rounded border border-rule hover:bg-surface transition-colors"
                  >
                    <span className="text-sm text-ink">{t('contact.alt_linkedin')}</span>
                    <span className="text-2xs text-ink-soft">crestio</span>
                  </a>
                )}
              </div>
            </div>

            <div className="md:col-span-7">
              <div className="card p-5 mb-6 flex items-center justify-between gap-4">
                <div>
                  <div className="text-2xs uppercase tracking-widest text-ink-soft mb-1">{t('contact.email_label')}</div>
                  <div className="font-mono text-sm text-ink">support@crestio.ai</div>
                </div>
                <button onClick={copyEmail} className="btn-secondary text-xs">
                  {copied ? t('contact.copied') : t('contact.copy')}
                </button>
              </div>

              <form onSubmit={onSubmit} className="card p-6 md:p-8 space-y-5">
                <div className="text-2xs uppercase tracking-widest text-ink-soft">
                  {t('contact.or_send_via_mail')}
                </div>
                <div>
                  <label htmlFor="contact-name" className="label">{t('contact.name_label')}</label>
                  <input id="contact-name" type="text" name="name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} className="input" />
                </div>
                <div>
                  <label htmlFor="contact-email" className="label">{t('contact.email_field_label')}</label>
                  <input id="contact-email" type="email" name="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input" />
                  <div className="text-2xs text-ink-soft mt-1.5">{t('contact.email_hint')}</div>
                </div>
                <div>
                  <label htmlFor="contact-message" className="label">{t('contact.message_label')}</label>
                  <textarea id="contact-message" name="message" required rows={6} value={message} onChange={(e) => setMessage(e.target.value)} className="input" placeholder={t('contact.message_placeholder')} />
                </div>
                <button type="submit" disabled={!message.trim()} className="btn-primary w-full py-3">
                  {t('contact.submit')}
                </button>
                <div className="text-2xs text-ink-soft text-center">
                  {t('contact.submit_note')}
                </div>
              </form>
            </div>
          </div>
        </main>

        <MarketingFooter />
      </div>
    </>
  );
}

export const getStaticProps: GetStaticProps = async ({ locale }) => ({
  props: {
    ...serverSideTranslations(locale, ['marketing']),
  },
});
