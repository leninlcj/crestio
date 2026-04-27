import Head from 'next/head';
import type { GetStaticProps } from 'next';
import { useTranslation } from 'react-i18next';
import MarketingNav from '../components/marketing/MarketingNav';
import MarketingFooter from '../components/marketing/MarketingFooter';
import { loadChangelog, type ChangelogEntry } from '../lib/changelog';
import { serverSideTranslations } from '../lib/i18nServer';

type Props = { entries: ChangelogEntry[] };

export default function Changelog({ entries }: Props) {
  const { t } = useTranslation('marketing');

  return (
    <>
      <Head>
        <title>{t('meta.changelog_title')}</title>
        <meta name="description" content={t('meta.changelog_description')} />
      </Head>

      <div className="min-h-screen bg-cream text-ink">
        <MarketingNav />

        <main className="px-6 md:px-12 py-12 md:py-20 max-w-6xl mx-auto">
          <div className="grid md:grid-cols-12 gap-10 md:gap-12">
            <article className="md:col-span-8">
              <div className="text-2xs uppercase tracking-widest text-ink-soft mb-3">
                {t('changelog.kicker')}
              </div>
              <h1 className="font-display text-4xl md:text-5xl tracking-tighter mb-4 text-balance leading-[1.05]">
                {t('changelog.heading')}
              </h1>
              <p className="text-base text-ink-muted leading-relaxed mb-12 max-w-prose">
                {t('changelog.intro')}
              </p>

              <div className="space-y-12">
                {entries.length === 0 ? (
                  <div className="text-sm text-ink-muted">No entries yet.</div>
                ) : (
                  entries.map((entry) => (
                    <section
                      key={entry.version}
                      id={entry.version.toLowerCase()}
                      className="pb-10 border-b border-rule last:border-b-0 scroll-mt-24"
                    >
                      <div className="flex items-baseline gap-3 mb-3">
                        <div className="font-mono text-2xs uppercase tracking-widest text-forest">
                          {entry.version}
                        </div>
                        <div className="font-mono text-2xs uppercase tracking-widest text-ink-soft">
                          {entry.date}
                        </div>
                      </div>
                      <h2 className="font-display text-2xl tracking-tighter mb-4 text-balance">
                        {entry.title}
                      </h2>
                      <ul className="space-y-2 text-sm md:text-base text-ink-muted leading-relaxed">
                        {entry.bullets.map((b, i) => (
                          <li key={i} className="flex items-start gap-2">
                            <span aria-hidden className="text-forest mt-[6px] block w-1 h-1 rounded-full bg-forest shrink-0" />
                            <span>{b}</span>
                          </li>
                        ))}
                      </ul>
                    </section>
                  ))
                )}
              </div>
            </article>

            <aside className="hidden md:block md:col-span-4">
              <div className="sticky top-24">
                <div className="text-2xs uppercase tracking-widest text-ink-soft mb-3">
                  {t('changelog.toc_label')}
                </div>
                <ol className="space-y-2 border-l border-rule pl-4">
                  {entries.map((entry) => (
                    <li key={entry.version}>
                      <a
                        href={`#${entry.version.toLowerCase()}`}
                        className="block text-sm text-ink-muted hover:text-ink transition-colors py-0.5"
                      >
                        <span className="font-mono text-2xs text-ink-soft mr-2">{entry.version}</span>
                        {entry.title}
                      </a>
                    </li>
                  ))}
                </ol>
              </div>
            </aside>
          </div>
        </main>

        <MarketingFooter />
      </div>
    </>
  );
}

export const getStaticProps: GetStaticProps<Props> = async ({ locale }) => ({
  props: {
    ...serverSideTranslations(locale, ['marketing']),
    entries: loadChangelog(),
  },
});
