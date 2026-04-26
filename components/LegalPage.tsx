import Link from 'next/link';
import Head from 'next/head';
import { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocale } from '../lib/localeContext';
import { useIsSignedIn } from '../lib/useIsSignedIn';

type Props = {
  title: string;
  kicker?: string;
  lastUpdated: string;
  toc: Array<{ id: string; label: string }>;
  children: ReactNode;
};

export function LegalPage({ title, kicker = 'Legal', lastUpdated, toc, children }: Props) {
  const { t } = useTranslation('legal');
  const { locale } = useLocale();
  const signedIn = useIsSignedIn();
  const showEnglishNotice = locale !== 'en';

  return (
    <>
      <Head>
        <title>{title} · Crestio</title>
      </Head>
      <div className="min-h-screen bg-cream text-ink">
        <nav className="px-6 md:px-12 py-6 flex items-center justify-between border-b border-rule">
          <Link href="/" className="font-display text-2xl tracking-tightest">
            crest<span className="italic text-forest">io</span>
          </Link>
          {signedIn ? (
            <Link href="/app" className="text-sm text-ink-muted hover:text-ink">{t('nav.go_to_dashboard')}</Link>
          ) : (
            <Link href="/auth/signin" className="text-sm text-ink-muted hover:text-ink">{t('nav.sign_in')}</Link>
          )}
        </nav>

        <article className="max-w-2xl mx-auto px-6 md:px-12 py-16 md:py-24">
          <div className="text-2xs uppercase tracking-widest text-ink-muted mb-3">{kicker}</div>
          <h1 className="font-display text-5xl md:text-6xl tracking-tightest mb-2">{title}</h1>
          <div className="text-sm text-ink-muted mb-10">{t('last_updated', { date: lastUpdated })}</div>

          {showEnglishNotice && (
            <div
              className="card p-5 mb-10 bg-amber-soft/60 border-amber/40"
              role="note"
              lang="en"
            >
              <div className="text-2xs uppercase tracking-widest text-amber-ink/80 mb-2">
                {t('english_notice.title')}
              </div>
              <p className="text-sm text-ink leading-relaxed mb-3">
                {t('english_notice.body')}
              </p>
              <a
                href={`?lng=en`}
                className="text-xs text-forest hover:text-forest-ink underline underline-offset-2"
              >
                {t('english_notice.view_english')} →
              </a>
            </div>
          )}

          {toc.length > 0 && (
            <nav aria-label={t('toc_aria')} className="card p-5 md:p-6 mb-10">
              <div className="text-2xs uppercase tracking-widest text-ink-muted mb-3">{t('contents')}</div>
              <ol className="list-decimal pl-5 space-y-1 text-sm text-ink">
                {toc.map((item) => (
                  <li key={item.id}>
                    <a href={`#${item.id}`} className="text-ink hover:text-forest underline underline-offset-2">
                      {item.label}
                    </a>
                  </li>
                ))}
              </ol>
            </nav>
          )}

          <section className="legal-prose text-ink leading-relaxed space-y-4">
            {children}
          </section>
        </article>

        <footer className="border-t border-rule px-6 md:px-12 py-10 text-2xs text-ink-soft uppercase tracking-widest flex flex-wrap gap-6 justify-between items-center">
          <div>{t('footer.copyright', { year: new Date().getFullYear() })}</div>
          <div className="flex gap-6">
            <Link href="/privacy" className="hover:text-ink">{t('footer.privacy')}</Link>
            <Link href="/terms" className="hover:text-ink">{t('footer.terms')}</Link>
            <Link href="/contact" className="hover:text-ink">{t('footer.contact')}</Link>
          </div>
        </footer>
      </div>

      <style jsx global>{`
        .legal-prose h2 {
          font-family: Fraunces, Georgia, serif;
          font-weight: 500;
          letter-spacing: -0.04em;
          font-size: 1.5rem;
          margin-top: 2.25rem;
          margin-bottom: 0.75rem;
          scroll-margin-top: 80px;
        }
        .legal-prose h3 {
          font-weight: 600;
          font-size: 1rem;
          margin-top: 1.25rem;
          margin-bottom: 0.5rem;
        }
        .legal-prose p { margin-bottom: 0.75rem; }
        .legal-prose ul { list-style: disc; padding-left: 1.5rem; margin-bottom: 0.75rem; }
        .legal-prose ul li { margin-bottom: 0.25rem; }
        .legal-prose a { text-decoration: underline; text-underline-offset: 2px; }
      `}</style>
    </>
  );
}

export default LegalPage;
