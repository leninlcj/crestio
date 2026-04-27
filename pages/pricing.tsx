import Head from 'next/head';
import { useTranslation } from 'react-i18next';
import type { GetStaticProps } from 'next';
import MarketingNav from '../components/marketing/MarketingNav';
import PricingTable from '../components/marketing/PricingTable';
import InteractiveTimeSaved from '../components/marketing/InteractiveTimeSaved';
import FAQ from '../components/marketing/FAQ';
import FinalCTA from '../components/marketing/FinalCTA';
import MarketingFooter from '../components/marketing/MarketingFooter';
import { serverSideTranslations } from '../lib/i18nServer';

const PRICING_FAQS = ['refunds', 'plan_changes', 'currency', 'session_definition'] as const;

export default function Pricing() {
  const { t } = useTranslation('marketing');

  return (
    <>
      <Head>
        <title>{t('meta.pricing_title')}</title>
        <meta name="description" content={t('meta.pricing_description')} />
      </Head>

      <div className="min-h-screen bg-cream text-ink">
        <MarketingNav />

        <main>
          <PricingTable defaultExpanded showCompareLink />
          <InteractiveTimeSaved />
          <FAQ
            questions={PRICING_FAQS}
            prefix="pricing_faq"
            heading={t('pricing_faq.heading')}
          />
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
