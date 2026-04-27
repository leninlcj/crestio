import { useTranslation } from 'react-i18next';
import type { GetStaticPaths, GetStaticProps } from 'next';
import MarketLandingPage from '../../components/marketing/MarketLandingPage';
import { LANDING_PAGES, type LandingMeta } from '../../lib/marketing-landing';
import { serverSideTranslations } from '../../lib/i18nServer';

type Props = { slug: string; meta: LandingMeta };

export default function ForSlugPage({ slug, meta }: Props) {
  const { t } = useTranslation('marketing');
  const k = (suffix: string) => t(`for.${meta.i18nKey}.${suffix}`);

  const painLines = [1, 2, 3, 4].map((n) => k(`pain_${n}`));
  const faqQuestions = meta.hasFaq
    ? [1, 2, 3].map((n) => ({ q: k(`faq_${n}_q`), a: k(`faq_${n}_a`) }))
    : [];

  const schemaOrg = meta.country
    ? {
        '@context': 'https://schema.org',
        '@type': 'Organization',
        name: 'Crestio',
        url: 'https://crestio.ai',
        areaServed: meta.country,
      }
    : null;

  return (
    <MarketLandingPage
      type={meta.type}
      slug={slug}
      metaTitle={k('meta_title')}
      metaDescription={k('meta_description')}
      heroBadge={k('badge')}
      heroHeading={k('heading')}
      heroSub={k('sub')}
      microNote={k('micro')}
      painHeading={k('pain_heading')}
      painLines={painLines}
      painResolution={k('resolution')}
      faqHeading={faqQuestions.length > 0 ? t('faq_v2.heading') : undefined}
      faqQuestions={faqQuestions}
      schemaOrg={schemaOrg as Record<string, unknown> | null}
      region={meta.country ? { country: meta.country, currency: meta.currency ?? 'AUD' } : undefined}
    />
  );
}

export const getStaticPaths: GetStaticPaths = async () => ({
  paths: Object.keys(LANDING_PAGES).map((slug) => ({ params: { slug } })),
  fallback: false,
});

export const getStaticProps: GetStaticProps<Props> = async ({ params, locale }) => {
  const slug = String(params?.slug ?? '');
  const meta = LANDING_PAGES[slug];
  if (!meta) return { notFound: true };
  return {
    props: {
      slug,
      meta,
      ...serverSideTranslations(locale, ['marketing']),
    },
  };
};
