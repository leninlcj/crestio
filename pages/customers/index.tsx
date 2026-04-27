import Head from 'next/head';
import Link from 'next/link';
import type { GetStaticProps } from 'next';
import MarketingNav from '../../components/marketing/MarketingNav';
import MarketingFooter from '../../components/marketing/MarketingFooter';
import CustomerStoryCard from '../../components/marketing/CustomerStoryCard';
import FinalCTA from '../../components/marketing/FinalCTA';
import { CUSTOMER_STORIES } from '../../content/customer-stories';
import { serverSideTranslations } from '../../lib/i18nServer';

export default function CustomersIndex() {
  return (
    <>
      <Head>
        <title>Customers · Crestio</title>
        <meta name="description" content="Real tutoring practices using Crestio. Specific results, real numbers, no marketing-speak." />
        <meta property="og:title" content="Crestio customers" />
        <meta property="og:image" content="/api/og?type=marketing&title=Real%20practices.%20Real%20numbers.&subtitle=A%20few%20tutors%20who%20switched%20to%20Crestio." />
      </Head>

      <div className="min-h-screen bg-cream text-ink">
        <MarketingNav />

        <main>
          <section className="px-6 md:px-12 py-12 md:py-20 max-w-5xl mx-auto">
            <div className="text-2xs uppercase tracking-widest text-ink-soft mb-3">Customers</div>
            <h1 className="font-display text-4xl md:text-5xl tracking-tighter mb-4 leading-[1.05] text-balance">
              Real practices. Real numbers.
            </h1>
            <p className="text-base text-ink-muted leading-relaxed mb-12 max-w-prose">
              These are tutors and tutoring practices using Crestio in their week. Each story is specific — what was broken, what changed, what the actual numbers look like now.
            </p>

            <div className="grid sm:grid-cols-2 gap-4 md:gap-5">
              {CUSTOMER_STORIES.map((story) => (
                <CustomerStoryCard key={story.slug} story={story} />
              ))}
            </div>

            <div className="mt-12 pt-8 border-t border-rule text-sm text-ink-muted leading-relaxed max-w-prose">
              Using Crestio in your practice and willing to share?{' '}
              <Link href="mailto:hello@crestio.ai?subject=Customer%20story" className="text-forest underline underline-offset-2">
                Email Lenin
              </Link>
              . We'll write it together — your name, your numbers, your final say.
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
