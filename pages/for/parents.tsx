import Head from 'next/head';
import Link from 'next/link';
import type { GetStaticProps } from 'next';
import { useTranslation } from 'react-i18next';
import MarketingNav from '../../components/marketing/MarketingNav';
import MarketingFooter from '../../components/marketing/MarketingFooter';
import { serverSideTranslations } from '../../lib/i18nServer';

export default function ForParents() {
  const { t } = useTranslation('marketing');
  const k = (suffix: string) => t(`for.parents.${suffix}`);

  return (
    <>
      <Head>
        <title>{k('meta_title')}</title>
        <meta name="description" content={k('meta_description')} />
      </Head>

      <div className="min-h-screen bg-cream text-ink">
        <MarketingNav />

        <main>
          <section className="px-6 md:px-12 pt-12 md:pt-20 pb-12 md:pb-16 max-w-3xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-rule bg-surface text-2xs text-ink-muted mb-6">
              <span className="w-2 h-2 rounded-full bg-forest" aria-hidden />
              {k('badge')}
            </div>
            <h1 className="font-display text-4xl md:text-5xl tracking-tighter text-balance leading-[1.05] mb-6">
              {k('heading')}
            </h1>
            <p className="text-base md:text-lg text-ink-muted leading-relaxed text-balance max-w-2xl mx-auto mb-3">
              {k('sub')}
            </p>
            <div className="text-2xs uppercase tracking-widest text-ink-muted">
              {k('micro')}
            </div>
          </section>

          <Block eyebrow={k('what_eyebrow')} heading={k('what_heading')}>
            <p>{k('what_p1')}</p>
            <p>{k('what_p2')}</p>
          </Block>

          <Block eyebrow={k('you_eyebrow')} heading={k('you_heading')} alt>
            <p>{k('you_p1')}</p>
            <p>{k('you_p2')}</p>
          </Block>

          <Block eyebrow={k('privacy_eyebrow')} heading={k('privacy_heading')}>
            <p>{k('privacy_p1')}</p>
            <p>{k('privacy_p2')}</p>
            <p>{k('privacy_p3')}</p>
          </Block>

          <section className="px-6 md:px-12 py-16 md:py-20 bg-cream border-t border-rule">
            <div className="max-w-2xl mx-auto text-center">
              <h2 className="font-display text-2xl md:text-3xl tracking-tighter text-ink mb-4 text-balance">
                {k('cta_heading')}
              </h2>
              <p className="text-base text-ink-muted leading-relaxed mb-8">
                {k('cta_body')}
              </p>
              <Link href="/pricing" className="btn-primary px-6">
                {t('hero.see_plans')}
              </Link>
            </div>
          </section>
        </main>

        <MarketingFooter />
      </div>
    </>
  );
}

function Block({
  eyebrow, heading, children, alt = false,
}: {
  eyebrow: string; heading: string; children: React.ReactNode; alt?: boolean;
}) {
  return (
    <section className={`px-6 md:px-12 py-16 md:py-24 ${alt ? 'bg-surface border-y border-rule' : ''}`}>
      <div className="max-w-3xl mx-auto">
        <div className="text-2xs uppercase tracking-widest text-ink-muted mb-3">{eyebrow}</div>
        <h2 className="font-display text-2xl md:text-3xl tracking-tighter text-balance mb-6">
          {heading}
        </h2>
        <div className="space-y-5 text-base text-ink-muted leading-relaxed">
          {children}
        </div>
      </div>
    </section>
  );
}

export const getStaticProps: GetStaticProps = async ({ locale }) => ({
  props: {
    ...serverSideTranslations(locale, ['marketing']),
  },
});
