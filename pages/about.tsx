import Link from 'next/link';
import Head from 'next/head';
import type { GetStaticProps } from 'next';
import { useTranslation } from 'react-i18next';
import { serverSideTranslations } from '../lib/i18nServer';
import { useIsSignedIn } from '../lib/useIsSignedIn';

export default function About() {
  const { t } = useTranslation('marketing');
  const signedIn = useIsSignedIn();

  return (
    <>
      <Head>
        <title>{t('about.meta_title')}</title>
        <meta name="description" content={t('about.meta_description')} />
      </Head>

      <div className="min-h-screen bg-cream text-ink">
        <nav className="px-6 md:px-12 py-6 flex items-center justify-between border-b border-rule">
          <Link href="/" className="font-display text-2xl tracking-tightest">
            crest<span className="italic text-forest">io</span>
          </Link>
          {signedIn ? (
            <Link href="/app" className="text-sm text-ink-muted hover:text-ink transition-colors duration-200">
              {t('nav.go_to_dashboard')}
            </Link>
          ) : (
            <Link href="/auth/signin" className="text-sm text-ink-muted hover:text-ink transition-colors duration-200">
              {t('nav.sign_in')}
            </Link>
          )}
        </nav>

        <article className="max-w-2xl mx-auto px-6 md:px-12 py-16 md:py-24">
          <div className="text-2xs uppercase tracking-widest text-ink-muted mb-3">
            {t('about.kicker')}
          </div>
          <h1 className="font-display text-4xl md:text-5xl tracking-tightest mb-8 text-balance">
            {t('about.heading')}
          </h1>

          <div className="space-y-5 text-base md:text-lg text-ink-muted leading-relaxed">
            <p>{t('about.body_1')}</p>
            <p>{t('about.body_2')}</p>
            <p>{t('about.body_3')}</p>
          </div>

          <div className="mt-10 pt-10 border-t border-rule">
            <p className="text-sm text-ink-muted mb-5">{t('about.contact_intro')}</p>
            <a
              href="mailto:support@crestio.ai"
              className="btn-secondary text-sm transition-colors duration-200"
            >
              support@crestio.ai
            </a>
          </div>
        </article>

        <footer className="border-t border-rule px-6 md:px-12 py-10 text-2xs text-ink-soft uppercase tracking-widest flex flex-wrap gap-6 justify-between items-center">
          <div>{t('footer.made_in')}</div>
          <div className="flex gap-6">
            <Link href="/privacy" className="hover:text-ink transition-colors duration-200">{t('footer.privacy')}</Link>
            <Link href="/terms" className="hover:text-ink transition-colors duration-200">{t('footer.terms')}</Link>
            <Link href="/contact" className="hover:text-ink transition-colors duration-200">{t('footer.contact')}</Link>
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
