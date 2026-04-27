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
import SandboxEmbed from '../components/marketing/SandboxEmbed';
import StickyConversionBar from '../components/marketing/StickyConversionBar';
import FounderHomepageEmbed from '../components/marketing/FounderHomepageEmbed';
import { serverSideTranslations } from '../lib/i18nServer';
import { fetchMarketingStats } from '../lib/marketing-stats';
import { loadFounderNotes, type FounderNote } from '../lib/founderNotes';

type Props = { practicesCount: number; latestFounderNote: FounderNote | null };

export default function Home({ practicesCount, latestFounderNote }: Props) {
  const router = useRouter();
  const { t } = useTranslation('marketing');
  const [showDeleted, setShowDeleted] = useState(false);

  useEffect(() => {
    if (router.query.deleted === 'true') setShowDeleted(true);
  }, [router.query.deleted]);

  const metaTitle = t('meta.home_title');
  const metaDescription = t('meta.home_description');
  const ogUrl = '/api/og?type=marketing&title=Run%20your%20tutoring%20practice%20%E2%80%94%20finally%20without%20the%20spreadsheet.&subtitle=Log%20a%20session%20in%208%20seconds.%20Polish%20notes.%20Get%20paid%20by%20card.';

  return (
    <>
      <Head>
        <title>{metaTitle}</title>
        <meta name="description" content={metaDescription} />
        <meta property="og:title" content={metaTitle} />
        <meta property="og:description" content={metaDescription} />
        <meta property="og:url" content="https://crestio.ai" />
        <meta property="og:image" content={ogUrl} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={metaTitle} />
        <meta name="twitter:description" content={metaDescription} />
        <meta name="twitter:image" content={ogUrl} />
      </Head>

      <div className="min-h-screen bg-cream text-ink">
        {showDeleted && (
          <div className="bg-forest-soft border-b border-forest/20 px-6 md:px-12 py-3 text-sm text-forest-ink text-center">
            {t('deleted_banner')}
          </div>
        )}

        <StickyConversionBar />
        <MarketingNav />

        <main>
          <Hero practicesCount={practicesCount} />
          <SandboxEmbed />
          <SocialProofBand />
          <PainSection />
          <HowItWorks />
          <FeatureGrid />
          <TestimonialSpotlight />
          {latestFounderNote && <FounderHomepageEmbed latest={latestFounderNote} />}
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
  const notes = loadFounderNotes();
  return {
    props: {
      ...serverSideTranslations(locale, ['marketing']),
      practicesCount: stats.practicesCount,
      latestFounderNote: notes[0] ?? null,
    },
    revalidate: 600,
  };
};
