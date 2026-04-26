import Link from 'next/link';
import Head from 'next/head';
import type { GetStaticProps } from 'next';
import { useTranslation } from 'react-i18next';
import { serverSideTranslations } from '../lib/i18nServer';
import { useIsSignedIn } from '../lib/useIsSignedIn';

type Entry = {
  date: string;
  titleKey: string;
  bullets: string[];
};

const ENTRIES: Entry[] = [
  {
    date: '2026-04-26',
    titleKey: 'changelog.entries.april_polish.title',
    bullets: [
      'changelog.entries.april_polish.b1',
      'changelog.entries.april_polish.b2',
      'changelog.entries.april_polish.b3',
    ],
  },
  {
    date: '2026-04-20',
    titleKey: 'changelog.entries.april_files.title',
    bullets: [
      'changelog.entries.april_files.b1',
      'changelog.entries.april_files.b2',
    ],
  },
  {
    date: '2026-04-10',
    titleKey: 'changelog.entries.april_ai.title',
    bullets: [
      'changelog.entries.april_ai.b1',
      'changelog.entries.april_ai.b2',
    ],
  },
];

export default function Changelog() {
  const { t } = useTranslation('marketing');
  const signedIn = useIsSignedIn();

  return (
    <>
      <Head>
        <title>{t('changelog.meta_title')}</title>
        <meta name="description" content={t('changelog.meta_description')} />
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
            {t('changelog.kicker')}
          </div>
          <h1 className="font-display text-4xl md:text-5xl tracking-tightest mb-3 text-balance">
            {t('changelog.heading')}
          </h1>
          <p className="text-base text-ink-muted leading-relaxed mb-12 max-w-prose">
            {t('changelog.intro')}
          </p>

          <div className="space-y-12">
            {ENTRIES.map((entry) => (
              <div key={entry.date} className="pb-10 border-b border-rule last:border-b-0">
                <div className="text-2xs uppercase tracking-widest text-ink-soft font-mono mb-3">
                  {entry.date}
                </div>
                <h2 className="font-display text-2xl tracking-tightest mb-4 text-balance">
                  {t(entry.titleKey)}
                </h2>
                <ul className="space-y-2 text-sm md:text-base text-ink-muted leading-relaxed">
                  {entry.bullets.map((b) => (
                    <li key={b} className="flex items-start gap-2">
                      <span aria-hidden className="text-forest mt-[6px] block w-1 h-1 rounded-full bg-forest shrink-0" />
                      <span>{t(b)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
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
