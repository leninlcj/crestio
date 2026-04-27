import Head from 'next/head';
import { useTranslation } from 'react-i18next';
import type { GetStaticProps } from 'next';
import MarketingNav from '../components/marketing/MarketingNav';
import PricingTable from '../components/marketing/PricingTable';
import ROICalculator from '../components/marketing/ROICalculator';
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
        <meta property="og:title" content={t('meta.pricing_title')} />
        <meta property="og:description" content={t('meta.pricing_description')} />
        <meta property="og:image" content="/api/og?type=pricing&title=Solo%20%2424.%20Team%20%2459.%20No%20surprises." />
      </Head>

      <div className="min-h-screen bg-cream text-ink">
        <MarketingNav />

        <main>
          <PricingTable defaultExpanded showCompareLink />
          <section className="border-t border-rule">
            <ROICalculator />
          </section>
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
