import Head from 'next/head';
import type { GetStaticProps } from 'next';
import MarketingNav from '../components/marketing/MarketingNav';
import MarketingFooter from '../components/marketing/MarketingFooter';
import BrandKit from '../components/marketing/BrandKit';
import { serverSideTranslations } from '../lib/i18nServer';

export default function Brand() {
  return (
    <>
      <Head>
        <title>Brand · Crestio</title>
        <meta name="description" content="Crestio brand assets — logo files, color palette, typography, and embed badge for tutors who want to add a Powered by Crestio mark to their website." />
        <meta property="og:title" content="Crestio brand kit" />
        <meta property="og:image" content="/api/og?type=marketing&title=Brand%20kit&subtitle=Logos%2C%20colors%2C%20fonts%2C%20embed%20badge." />
      </Head>

      <div className="min-h-screen bg-cream text-ink">
        <MarketingNav />

        <main className="px-6 md:px-12 py-12 md:py-20 max-w-4xl mx-auto">
          <div className="text-2xs uppercase tracking-widest text-ink-soft mb-3">Brand</div>
          <h1 className="font-display text-4xl md:text-5xl tracking-tighter mb-4 leading-[1.05] text-balance">
            Brand kit.
          </h1>
          <p className="text-base text-ink-muted leading-relaxed mb-12 max-w-prose">
            Logos, colors, fonts, and a Powered-by badge for your website. If you write about Crestio, please use these. If you need something missing, email <a href="mailto:hello@crestio.ai" className="text-forest underline underline-offset-2">hello@crestio.ai</a>.
          </p>

          <BrandKit />
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
