import Head from 'next/head';
import Link from 'next/link';
import type { GetStaticProps } from 'next';
import MarketingNav from '../../components/marketing/MarketingNav';
import MarketingFooter from '../../components/marketing/MarketingFooter';
import FinalCTA from '../../components/marketing/FinalCTA';
import { serverSideTranslations } from '../../lib/i18nServer';

export default function CustomersIndex() {
  return (
    <>
      <Head>
        <title>Customers · Crestio</title>
        <meta name="description" content="Crestio is in early access. Real customer stories will live here once tutors are ready to share them." />
        <meta property="og:title" content="Crestio customers" />
        <meta property="og:description" content="Crestio is in early access. Real customer stories will live here." />
        <meta property="og:image" content="/api/og?type=marketing&title=Stories%20live%20here%20once%20they're%20real.&subtitle=Crestio%20is%20in%20early%20access." />
      </Head>

      <div className="min-h-screen bg-cream text-ink">
        <MarketingNav />

        <main>
          <section className="px-6 md:px-12 py-12 md:py-20 max-w-3xl mx-auto">
            <div className="text-2xs uppercase tracking-widest text-ink-soft mb-3">Customers</div>
            <h1 className="font-display text-4xl md:text-5xl tracking-tighter mb-5 leading-[1.05] text-balance">
              Stories will live here once they&rsquo;re real.
            </h1>
            <p className="text-base text-ink-muted leading-relaxed mb-6 max-w-prose">
              Crestio is in early access. There aren&rsquo;t any case studies yet because there aren&rsquo;t any case-study customers yet — and we won&rsquo;t fabricate them.
            </p>
            <p className="text-base text-ink-muted leading-relaxed mb-10 max-w-prose">
              When tutors agree to share their numbers and their words, the stories go up here, with first names, real practice details, and verifiable details — never composites.
            </p>

            <div className="rounded-md border border-rule bg-surface p-6 md:p-8">
              <div className="text-2xs uppercase tracking-widest text-ink-soft mb-2">If you&rsquo;d like to be one of the first</div>
              <h2 className="font-display text-xl tracking-tightest text-ink mb-3">
                Try Crestio. Tell us if it works.
              </h2>
              <p className="text-sm text-ink-muted leading-relaxed mb-5 max-w-prose">
                Start a 7-day free trial. If it changes how your week looks, we&rsquo;d love to write your story together — your numbers, your words, your final say. No pressure either way.
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <Link href="/auth/signup" className="btn-primary text-sm">Start free trial</Link>
                <Link href="mailto:lenin@crestio.ai?subject=Customer%20story" className="text-sm text-forest hover:underline">
                  Or email Lenin directly →
                </Link>
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
