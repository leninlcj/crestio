import Head from 'next/head';
import Link from 'next/link';
import { useState, useMemo } from 'react';
import type { GetStaticProps } from 'next';
import MarketingNav from '../components/marketing/MarketingNav';
import MarketingFooter from '../components/marketing/MarketingFooter';
import RoadmapColumn from '../components/marketing/RoadmapColumn';
import { loadRoadmap, type RoadmapItem, type RoadmapAudience } from '../lib/roadmap';
import { loadChangelog, type ChangelogEntry } from '../lib/changelog';
import { serverSideTranslations } from '../lib/i18nServer';

type Props = {
  roadmap: RoadmapItem[];
  shippedFromChangelog: ChangelogEntry[];
};

const AUDIENCE_FILTERS: { key: RoadmapAudience | 'all'; label: string }[] = [
  { key: 'all', label: 'Everything' },
  { key: 'tutor', label: 'Tutor-facing' },
  { key: 'owner', label: 'Owner-facing' },
  { key: 'parent', label: 'Parent-facing' },
  { key: 'infra', label: 'Infrastructure' },
];

export default function Roadmap({ roadmap, shippedFromChangelog }: Props) {
  const [filter, setFilter] = useState<RoadmapAudience | 'all'>('all');

  const filtered = useMemo(() => {
    if (filter === 'all') return roadmap;
    return roadmap.filter((r) => r.audience === filter);
  }, [filter, roadmap]);

  // Build "shipped" column from changelog (latest 5).
  const shippedItems: RoadmapItem[] = useMemo(() => {
    const fromRoadmap = filtered.filter((r) => r.status === 'shipped');
    const fromChangelog: RoadmapItem[] = shippedFromChangelog.slice(0, 5).map((entry) => ({
      title: entry.title,
      status: 'shipped' as const,
      audience: 'tutor' as const,
      eta: entry.date,
      description: entry.bullets[0] ?? '',
    }));
    // Combine, dedupe by title, cap.
    const seen = new Set<string>();
    return [...fromRoadmap, ...fromChangelog].filter((r) => {
      if (seen.has(r.title)) return false;
      seen.add(r.title);
      return true;
    }).slice(0, 8);
  }, [filtered, shippedFromChangelog]);

  const inProgress = filtered.filter((r) => r.status === 'in_progress');
  const planned = filtered.filter((r) => r.status === 'planned');

  return (
    <>
      <Head>
        <title>Roadmap · Crestio</title>
        <meta name="description" content="What we ship and when. The Crestio public roadmap." />
        <meta property="og:title" content="Crestio roadmap" />
        <meta property="og:description" content="We ship in public. Here's everything we're working on." />
        <meta property="og:image" content="/api/og?type=marketing&title=Roadmap&subtitle=Shipped%2C%20in%20progress%2C%20planned." />
      </Head>

      <div className="min-h-screen bg-cream text-ink">
        <MarketingNav />

        <main>
          <section className="px-6 md:px-12 pt-12 md:pt-20 pb-6 max-w-6xl mx-auto">
            <div className="text-2xs uppercase tracking-widest text-ink-soft mb-3">Roadmap</div>
            <h1 className="font-display text-4xl md:text-5xl tracking-tighter mb-4 leading-[1.05] text-balance">
              We ship in public.
            </h1>
            <p className="text-base text-ink-muted leading-relaxed mb-8 max-w-prose">
              Here's what's shipped, what's in flight, and what's next. ETAs are best guesses, not promises — we revise them when we learn something.
            </p>

            <div className="flex items-center gap-2 overflow-x-auto scrollbar-thin pb-1">
              {AUDIENCE_FILTERS.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setFilter(f.key as RoadmapAudience | 'all')}
                  className={[
                    'px-3 py-1.5 text-2xs uppercase tracking-widest font-medium rounded-full whitespace-nowrap transition-colors',
                    filter === f.key
                      ? 'bg-forest text-cream'
                      : 'bg-surface border border-rule text-ink-muted hover:text-ink hover:border-ink-soft',
                  ].join(' ')}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </section>

          <section className="px-6 md:px-12 pb-16 md:pb-24 max-w-6xl mx-auto">
            <div className="flex flex-col lg:flex-row gap-6 md:gap-8">
              <RoadmapColumn status="shipped" title="Shipped" items={shippedItems} />
              <RoadmapColumn status="in_progress" title="In progress" items={inProgress} />
              <RoadmapColumn status="planned" title="Planned" items={planned} />
            </div>

            <div className="mt-12 pt-8 border-t border-rule text-sm text-ink-muted leading-relaxed max-w-prose">
              Looking for the version-by-version log? See the{' '}
              <Link href="/changelog" className="text-forest underline underline-offset-2">changelog</Link>.
            </div>
          </section>
        </main>

        <MarketingFooter />
      </div>
    </>
  );
}

export const getStaticProps: GetStaticProps<Props> = async ({ locale }) => ({
  props: {
    ...serverSideTranslations(locale, ['marketing']),
    roadmap: loadRoadmap(),
    shippedFromChangelog: loadChangelog(),
  },
  revalidate: 600,
});
