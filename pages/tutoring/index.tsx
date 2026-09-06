import Link from 'next/link';
import { AgencyPage, Section, CtaRow } from '../../components/agency/AgencyPage';
import { FinalBand } from '../../components/agency/blocks';
import { AGENCY } from '../../lib/agency';
import { breadcrumb, tutoringServiceSchema } from '../../lib/agencySchema';
import { REGIONS, suburbsInRegion } from '../../lib/suburbs';

const REGION_NOTE: Record<string, string> = {
  'St George': `Where Crestio is based. In-home tutors are matched here first, and ${AGENCY.serviceArea.homeSuburb} is home.`,
  'Sutherland Shire': 'Covered for in-home lessons. Matched by suburb so the tutor is local; online with the same tutor if no local time fits.',
  'South-west Sydney': 'The suburbs just west of our base. Covered for in-home lessons, with online as the fallback.',
};

export default function WhereWeTutor() {
  return (
    <AgencyPage
      title="Where we tutor in Sydney"
      description="In-home maths and science tutoring across the St George area, the Sutherland Shire and south-west Sydney, and online anywhere in Australia. Find your suburb."
      path="/tutoring"
      ogTitle="Where we tutor."
      ogSubtitle="St George, the Sutherland Shire and south-west Sydney in-home. Online anywhere."
      jsonLd={[tutoringServiceSchema('all'), breadcrumb([{ name: 'Home', url: '/' }, { name: 'Where we tutor', url: '/tutoring' }])]}
    >
      <section className="px-6 md:px-12 pt-14 md:pt-20 pb-6 max-w-6xl mx-auto">
        <div className="max-w-2xl">
          <div className="text-2xs uppercase tracking-widest text-ink-soft mb-4">Where we tutor</div>
          <h1 className="font-display text-4xl md:text-6xl tracking-tighter text-ink text-balance leading-[1.05] mb-5">Sydney in-home. Online anywhere in Australia.</h1>
          <p className="text-base md:text-lg text-ink-muted leading-relaxed mb-7">
            In-home lessons are matched by suburb so your tutor is local. The suburbs below are the ones we cover best today; if yours is not listed, ask, because in-home lessons run across Sydney and online lessons run anywhere.
          </p>
          <CtaRow />
        </div>
      </section>

      {REGIONS.map((region, i) => (
        <Section key={region} tone={i % 2 === 0 ? 'surface' : 'cream'} eyebrow={region} heading={region === 'St George' ? 'The St George area.' : `${region}.`} lead={REGION_NOTE[region]}>
          <ul className="flex flex-wrap gap-2">
            {suburbsInRegion(region).map((s) => (
              <li key={s.slug}>
                <Link href={`/tutoring/${s.slug}`} className="inline-block rounded-md border border-rule bg-surface px-3 py-1.5 text-sm text-ink hover:bg-ruleSoft transition-colors">{s.name}</Link>
              </li>
            ))}
          </ul>
        </Section>
      ))}

      <Section tone="surface" eyebrow="Online" heading="The same tutor, on a shared whiteboard.">
        <p className="text-sm md:text-base text-ink-muted leading-relaxed max-w-2xl">
          Online lessons run over video with a shared whiteboard and the same written note after every lesson. They cost $15 an hour less than in-home at every level and work anywhere in Australia. You can mix the two: in-home most weeks, online when the week is busy.
        </p>
      </Section>

      <FinalBand />
    </AgencyPage>
  );
}
