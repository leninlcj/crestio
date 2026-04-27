import { useEffect, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useTranslation } from 'react-i18next';
import type { GetStaticProps } from 'next';
import MarketingNav from '../components/marketing/MarketingNav';
import Hero from '../components/marketing/Hero';
import SocialProofBand from '../components/marketing/SocialProofBand';
import PainSection from '../components/marketing/PainSection';
import HowItWorks from '../components/marketing/HowItWorks';
import FeatureGrid from '../components/marketing/FeatureGrid';
import TestimonialSpotlight from '../components/marketing/TestimonialSpotlight';
import PricingTable from '../components/marketing/PricingTable';
import FAQ from '../components/marketing/FAQ';
import FinalCTA from '../components/marketing/FinalCTA';
import MarketingFooter from '../components/marketing/MarketingFooter';
import { serverSideTranslations } from '../lib/i18nServer';
import { fetchMarketingStats } from '../lib/marketing-stats';

type Props = { practicesCount: number };

export default function Home({ practicesCount }: Props) {
  const router = useRouter();
  const { t } = useTranslation('marketing');
  const [showDeleted, setShowDeleted] = useState(false);

  useEffect(() => {
    if (router.query.deleted === 'true') setShowDeleted(true);
  }, [router.query.deleted]);

  const metaTitle = t('meta.home_title');
  const metaDescription = t('meta.home_description');

  return (
    <>
      <Head>
        <title>{metaTitle}</title>
        <meta name="description" content={metaDescription} />
        <meta property="og:title" content={metaTitle} />
        <meta property="og:description" content={metaDescription} />
        <meta property="og:url" content="https://crestio.ai" />
        <meta name="twitter:title" content={metaTitle} />
        <meta name="twitter:description" content={metaDescription} />
      </Head>

      <div className="min-h-screen bg-cream text-ink">
        {showDeleted && (
          <div className="bg-forest-soft border-b border-forest/20 px-6 md:px-12 py-3 text-sm text-forest-ink text-center">
            {t('deleted_banner')}
          </div>
        )}

        <MarketingNav />

        <main>
          <Hero practicesCount={practicesCount} />
          <SocialProofBand />
          <PainSection />
          <HowItWorks />
          <FeatureGrid />
          <TestimonialSpotlight />
          <PricingTable />
          <FAQ />
          <FinalCTA />
        </main>

        <MarketingFooter />
      </div>
    </>
  );
}

export const getStaticProps: GetStaticProps<Props> = async ({ locale }) => {
  const stats = await fetchMarketingStats();
  return {
    props: {
      ...serverSideTranslations(locale, ['marketing']),
      practicesCount: stats.practicesCount,
    },
    revalidate: 600,
  };
};
