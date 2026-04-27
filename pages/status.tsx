import Head from 'next/head';
import type { GetStaticProps } from 'next';
import MarketingNav from '../components/marketing/MarketingNav';
import MarketingFooter from '../components/marketing/MarketingFooter';
import StatusGrid from '../components/marketing/StatusGrid';
import uptimeHistory from '../content/uptime-history.json';
import { loadIncidents, type Incident } from '../lib/incidents';
import { serverSideTranslations } from '../lib/i18nServer';

type Props = {
  components: typeof uptimeHistory.components;
  incidents: Incident[];
};

export default function Status({ components, incidents }: Props) {
  return (
    <>
      <Head>
        <title>Status · Crestio</title>
        <meta name="description" content="Live status of Crestio's web, API, database, email, AI, and Stripe components. 30-day uptime per component." />
        <meta property="og:title" content="Crestio status" />
        <meta property="og:description" content="Real-time component status. 30-day uptime." />
        <meta property="og:image" content="/api/og?type=marketing&title=Status&subtitle=Real-time%20component%20status%20and%2030-day%20uptime." />
      </Head>

      <div className="min-h-screen bg-cream text-ink">
        <MarketingNav />

        <main className="px-6 md:px-12 py-12 md:py-20 max-w-4xl mx-auto">
          <div className="flex items-baseline justify-between gap-4 mb-3">
            <div className="text-2xs uppercase tracking-widest text-ink-soft">Status</div>
            <a
              href="mailto:status@crestio.ai?subject=Subscribe%20to%20incidents"
              className="text-2xs uppercase tracking-widest text-forest hover:underline"
            >
              Subscribe to incidents →
            </a>
          </div>
          <h1 className="font-display text-3xl md:text-4xl tracking-tighter mb-3 leading-[1.05] text-balance">
            Crestio status.
          </h1>
          <p className="text-base text-ink-muted leading-relaxed mb-10 max-w-prose">
            We post here before anyone else hears about an issue. If something is wrong, you'll see it here within five minutes of detection.
          </p>

          <StatusGrid components={components} />

          <section className="mt-14">
            <h2 className="font-display text-xl tracking-tightest text-ink mb-4">Recent incidents</h2>
            {incidents.length === 0 ? (
              <div className="rounded-md border border-rule bg-surface p-6 text-sm text-ink-muted">
                No incidents to report. The most recent disruption was{' '}
                <strong className="text-ink">none</strong> in the last 30 days.
              </div>
            ) : (
              <div className="space-y-3">
                {incidents.map((inc, i) => (
                  <article key={i} className="rounded-md border border-rule bg-surface p-5">
                    <div className="flex items-baseline justify-between gap-4 mb-2">
                      <div className="font-display text-base tracking-tightest text-ink">{inc.title}</div>
                      <div className="text-2xs uppercase tracking-widest text-ink-soft num tabular shrink-0">{inc.date}</div>
                    </div>
                    {inc.impact && <div className="text-2xs text-ink-muted mb-2">Impact: {inc.impact}</div>}
                    <p className="text-sm text-ink-muted leading-relaxed">{inc.body}</p>
                  </article>
                ))}
              </div>
            )}
          </section>

          <div className="mt-12 pt-8 border-t border-rule text-2xs text-ink-soft leading-relaxed">
            Status is computed live from <code className="bg-ruleSoft px-1 py-0.5 rounded">/api/health</code>.
            Uptime history shown above is rolling 30-day. We're working on
            replacing the static history with live telemetry.
          </div>
        </main>

        <MarketingFooter />
      </div>
    </>
  );
}

export const getStaticProps: GetStaticProps<Props> = async ({ locale }) => ({
  props: {
    ...serverSideTranslations(locale, ['marketing']),
    components: uptimeHistory.components,
    incidents: loadIncidents(),
  },
  revalidate: 600,
});
