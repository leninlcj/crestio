import Link from 'next/link';
import Head from 'next/head';
import type { GetStaticProps } from 'next';
import { useTranslation } from 'react-i18next';
import MarketingNav from '../components/marketing/MarketingNav';
import MarketingFooter from '../components/marketing/MarketingFooter';
import FinalCTA from '../components/marketing/FinalCTA';
import { serverSideTranslations } from '../lib/i18nServer';

export default function About() {
  const { t } = useTranslation('marketing');

  const values = [
    { key: 'calm', title: t('about.values_calm_title'), body: t('about.values_calm_body') },
    { key: 'tutor', title: t('about.values_tutor_title'), body: t('about.values_tutor_body') },
    { key: 'privacy', title: t('about.values_privacy_title'), body: t('about.values_privacy_body') },
    { key: 'built', title: t('about.values_built_title'), body: t('about.values_built_body') },
  ];

  return (
    <>
      <Head>
        <title>{t('meta.about_title')}</title>
        <meta name="description" content={t('meta.about_description')} />
      </Head>

      <div className="min-h-screen bg-cream text-ink">
        <MarketingNav />

        <main>
          <section className="px-6 md:px-12 pt-12 md:pt-20 pb-12 md:pb-16 max-w-3xl mx-auto">
            <div className="text-2xs uppercase tracking-widest text-ink-muted mb-4">
              {t('about.kicker')}
            </div>
            <h1 className="font-display text-4xl md:text-6xl tracking-tighter text-balance leading-[1.05] mb-4">
              {t('about.heading')}
            </h1>
            <p className="text-base text-ink-muted leading-relaxed max-w-prose">
              {t('about.body_1')}
            </p>
          </section>

          <section className="px-6 md:px-12 pb-16 md:pb-24 max-w-3xl mx-auto">
            <div className="rounded-md border border-rule bg-surface p-8 md:p-12">
              <div className="flex items-start gap-5 mb-8">
                {/* TODO: replace with founder photo at /public/marketing/lenin-founder.jpg when available. */}
                <div className="w-16 h-16 rounded-full bg-forest-soft text-forest-ink flex items-center justify-center font-display text-xl tracking-tightest shrink-0">
                  L
                </div>
                <div>
                  <div className="text-2xs uppercase tracking-widest text-ink-muted mb-1">
                    {t('about.founder_eyebrow')}
                  </div>
                  <div className="text-base font-medium text-ink">Lenin</div>
                  <div className="text-xs text-ink-muted">Founder · Sydney</div>
                </div>
              </div>
              <div className="space-y-5 text-base text-ink-muted leading-relaxed">
                <p>{t('about.founder_p1')}</p>
                <p>{t('about.founder_p2')}</p>
                <p>{t('about.founder_p3')}</p>
                <p>{t('about.founder_p4')}</p>
              </div>
              <div className="mt-8 pt-6 border-t border-rule">
                <div className="font-display text-lg tracking-tightest text-ink italic">
                  {t('about.founder_signature')}
                </div>
              </div>
            </div>
          </section>

          <section className="px-6 md:px-12 py-16 md:py-24 max-w-3xl mx-auto">
            <div className="text-2xs uppercase tracking-widest text-ink-muted mb-4">
              {t('about.why_eyebrow')}
            </div>
            <h2 className="font-display text-3xl md:text-4xl tracking-tighter text-balance mb-8">
              {t('about.why_heading')}
            </h2>
            <div className="space-y-5 text-base text-ink-muted leading-relaxed">
              <p>{t('about.why_p1')}</p>
              <p>{t('about.why_p2')}</p>
              <p>{t('about.why_p3')}</p>
            </div>
          </section>

          <section className="px-6 md:px-12 py-16 md:py-24 bg-surface border-y border-rule">
            <div className="max-w-5xl mx-auto">
              <div className="text-2xs uppercase tracking-widest text-ink-muted mb-4">
                {t('about.values_eyebrow')}
              </div>
              <h2 className="font-display text-3xl md:text-4xl tracking-tighter text-balance mb-8">
                {t('about.values_heading')}
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {values.map((v) => (
                  <article key={v.key} className="rounded-md border border-rule bg-cream p-6">
                    <h3 className="font-display text-lg tracking-tighter text-ink mb-2">
                      {v.title}
                    </h3>
                    <p className="text-sm text-ink-muted leading-relaxed">{v.body}</p>
                  </article>
                ))}
              </div>
            </div>
          </section>

          <section className="px-6 md:px-12 py-16 md:py-24 max-w-3xl mx-auto">
            <div className="grid md:grid-cols-2 gap-8">
              <div>
                <div className="text-2xs uppercase tracking-widest text-ink-muted mb-3">
                  {t('about.roadmap_eyebrow')}
                </div>
                <h3 className="font-display text-2xl tracking-tighter mb-3">
                  {t('about.roadmap_heading')}
                </h3>
                <p className="text-sm text-ink-muted leading-relaxed mb-4">{t('about.roadmap_body')}</p>
                <Link href="/changelog" className="text-sm text-forest hover:text-forest-ink underline underline-offset-4">
                  {t('about.roadmap_link')}
                </Link>
              </div>
              <div>
                <div className="text-2xs uppercase tracking-widest text-ink-muted mb-3">
                  {t('about.hiring_eyebrow')}
                </div>
                <h3 className="font-display text-2xl tracking-tighter mb-3">
                  {t('about.hiring_heading')}
                </h3>
                <p className="text-sm text-ink-muted leading-relaxed">{t('about.hiring_body')}</p>
              </div>
            </div>
          </section>

          <FinalCTA />
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
