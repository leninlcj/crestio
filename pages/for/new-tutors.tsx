import Head from 'next/head';
import Link from 'next/link';
import type { GetStaticProps } from 'next';
import { useTranslation } from 'react-i18next';
import MarketingNav from '../../components/marketing/MarketingNav';
import MarketingFooter from '../../components/marketing/MarketingFooter';
import PricingTable from '../../components/marketing/PricingTable';
import FinalCTA from '../../components/marketing/FinalCTA';
import { serverSideTranslations } from '../../lib/i18nServer';

export default function ForNewTutors() {
  const { t } = useTranslation('marketing');
  const k = (suffix: string) => t(`for.new_tutors.${suffix}`);

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
            <p className="text-base md:text-lg text-ink-muted leading-relaxed text-balance max-w-2xl mx-auto mb-5">
              {k('sub')}
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link href="/auth/signup?plan=solo&interval=monthly" className="btn-primary text-sm font-medium px-6 h-11 min-w-[200px]">
                {t('hero.cta_v2')}
              </Link>
              <Link href="/pricing" className="btn-secondary text-sm font-medium px-6 h-11">
                {t('hero.see_plans')}
              </Link>
            </div>
            <div className="mt-4 text-2xs uppercase tracking-widest text-ink-soft">{k('micro')}</div>
          </section>

          <Block eyebrow={k('what_eyebrow')} heading={k('what_heading')}>
            <Item>{k('what_1')}</Item>
            <Item>{k('what_2')}</Item>
            <Item>{k('what_3')}</Item>
            <Item>{k('what_4')}</Item>
          </Block>

          <Block eyebrow={k('skip_eyebrow')} heading={k('skip_heading')} alt>
            <Item dash>{k('skip_1')}</Item>
            <Item dash>{k('skip_2')}</Item>
            <Item dash>{k('skip_3')}</Item>
            <Item dash>{k('skip_4')}</Item>
          </Block>

          <Block eyebrow={k('mistakes_eyebrow')} heading={k('mistakes_heading')}>
            <Item warn>{k('mistakes_1')}</Item>
            <Item warn>{k('mistakes_2')}</Item>
            <Item warn>{k('mistakes_3')}</Item>
            <Item warn>{k('mistakes_4')}</Item>
          </Block>

          <PricingTable showCompareLink={false} />

          <FinalCTA heading={k('cta_heading')} />
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
    <section className={`px-6 md:px-12 py-14 md:py-20 ${alt ? 'bg-surface border-y border-rule' : ''}`}>
      <div className="max-w-3xl mx-auto">
        <div className="text-2xs uppercase tracking-widest text-ink-soft mb-3">{eyebrow}</div>
        <h2 className="font-display text-2xl md:text-3xl tracking-tighter text-balance mb-6">
          {heading}
        </h2>
        <ul className="space-y-3">{children}</ul>
      </div>
    </section>
  );
}

function Item({ children, dash, warn }: { children: React.ReactNode; dash?: boolean; warn?: boolean }) {
  return (
    <li className="flex items-start gap-3 text-base text-ink-muted leading-relaxed">
      {dash ? (
        <span aria-hidden className="text-ink-soft mt-1 flex-shrink-0 text-lg leading-none">−</span>
      ) : warn ? (
        <span aria-hidden className="text-rust mt-1 flex-shrink-0">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M8 5v3M8 11v.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </span>
      ) : (
        <span aria-hidden className="text-forest mt-1 flex-shrink-0">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M3 8.5L6.5 12L13 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      )}
      <span>{children}</span>
    </li>
  );
}

export const getStaticProps: GetStaticProps = async ({ locale }) => ({
  props: {
    ...serverSideTranslations(locale, ['marketing']),
  },
});
