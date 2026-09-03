import Head from 'next/head';
import Link from 'next/link';
import type { GetStaticPaths, GetStaticProps } from 'next';
import MarketingNav from '../../components/marketing/MarketingNav';
import MarketingFooter from '../../components/marketing/MarketingFooter';
import ComparisonTable from '../../components/marketing/ComparisonTable';
import { COMPETITOR_PAGES, getCompetitor, type CompetitorPage } from '../../lib/comparisons';
import { serverSideTranslations } from '../../lib/i18nServer';

type Props = { page: CompetitorPage };

export default function CompareCompetitor({ page }: Props) {
  const title = `Crestio vs ${page.competitor}`;
  const ogUrl = `/api/og?type=comparison&accent=${encodeURIComponent(page.competitor)}&title=${encodeURIComponent(title)}&subtitle=${encodeURIComponent('A side-by-side that does not bury the trade-offs.')}`;

  return (
    <>
      <Head>
        <title>{`${title} · Crestio`}</title>
        <meta name="description" content={`${title} — feature comparison, pricing, and where each tool genuinely wins.`} />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={page.hero_sub} />
        <meta property="og:image" content={ogUrl} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content={ogUrl} />
      </Head>

      <div className="min-h-screen bg-cream text-ink">
        <MarketingNav />

        <main>
          <section className="px-6 md:px-12 pt-12 md:pt-20 pb-10 max-w-4xl mx-auto">
            <div className="text-2xs uppercase tracking-widest text-ink-soft mb-3">Comparison</div>
            <h1 className="font-display text-4xl md:text-5xl tracking-tighter mb-5 leading-[1.05] text-balance">
              Crestio vs {page.competitor}.
            </h1>
            <p className="text-base md:text-lg text-ink-muted leading-relaxed max-w-prose">
              {page.hero_sub}
            </p>
          </section>

          <section className="px-6 md:px-12 mb-14 max-w-4xl mx-auto">
            <ComparisonTable competitorName={page.competitor} sections={page.sections} />
          </section>

          <section className="px-6 md:px-12 mb-14 max-w-3xl mx-auto">
            <div className="rounded-md border border-rule bg-surface p-6 md:p-8">
              <h2 className="font-display text-xl tracking-tighter text-ink mb-4">
                {page.honest.heading}.
              </h2>
              <ul className="space-y-3">
                {page.honest.cases.map((c, i) => (
                  <li key={i} className="text-sm text-ink-muted leading-relaxed pl-5 border-l-2 border-amber">
                    {c}
                  </li>
                ))}
              </ul>
              <div className="mt-6 pt-5 border-t border-rule text-2xs text-ink-soft leading-relaxed">
                We wrote this comparison ourselves. If something here is wrong or has shifted, email <a href="mailto:hello@crestio.ai" className="text-forest underline">hello@crestio.ai</a> and we'll update it.
              </div>
            </div>
          </section>

          <section className="px-6 md:px-12 mb-14 max-w-3xl mx-auto">
            <div className="rounded-md border border-rule bg-forest-soft p-6 md:p-8">
              <h2 className="font-display text-xl tracking-tighter text-forest-ink mb-3">
                Switching from {page.competitor}? We'll move you in 24 hours, free.
              </h2>
              <p className="text-sm text-forest-ink/85 leading-relaxed mb-5 max-w-prose">
                Send your export. We'll stand up your Crestio account with every student, every session, every invoice. You email parents one time with the new login. That's the whole job.
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <Link href="/migrate" className="btn-primary text-sm">Move me over</Link>
                <a href="mailto:lenin@crestio.ai" className="text-sm text-forest hover:underline">Talk to founder →</a>
              </div>
            </div>
          </section>

          <section className="px-6 md:px-12 py-16 md:py-20 max-w-3xl mx-auto text-center border-t border-rule">
            <h2 className="font-display text-2xl md:text-3xl tracking-tighter text-ink mb-3 text-balance">
              See it in your own day.
            </h2>
            <p className="text-sm text-ink-muted mb-6 max-w-prose mx-auto">
              7-day free trial. No card needed. Or open the live sandbox and click around — no signup at all.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Link href="/auth/signup" className="btn-primary text-sm px-6">Start free trial</Link>
              <Link href="/sandbox" className="btn-secondary text-sm px-6">Try the sandbox</Link>
            </div>
          </section>
        </main>

        <MarketingFooter />
      </div>
    </>
  );
}

export const getStaticPaths: GetStaticPaths = async () => ({
  paths: Object.keys(COMPETITOR_PAGES).map((slug) => ({ params: { competitor: slug } })),
  fallback: false,
});

export const getStaticProps: GetStaticProps<Props> = async ({ params, locale }) => {
  const slug = String(params?.competitor ?? '');
  const page = getCompetitor(slug);
  if (!page) return { notFound: true };
  return {
    props: {
      page,
      ...serverSideTranslations(locale, ['marketing']),
    },
  };
};
