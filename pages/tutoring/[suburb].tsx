import type { GetStaticPaths, GetStaticProps } from 'next';
import Link from 'next/link';
import { AgencyPage, Section } from '../../components/agency/AgencyPage';
import { RateTable, HowItWorks, FinalBand } from '../../components/agency/blocks';
import { AGENCY, INCLUDED, SUBJECTS, rateBand } from '../../lib/agency';
import { tutoringServiceSchema, breadcrumb, agencyFaqSchema } from '../../lib/agencySchema';
import { SUBURBS, suburbBySlug, neighboursOf, suburbsInRegion, listNames, type Suburb } from '../../lib/suburbs';

// One page per suburb in lib/suburbs.ts. Every sentence is something Crestio
// can stand behind today: where in-home lessons are offered, how matching
// works, what it costs. No claims about tutors who do not exist yet.

type Props = { suburb: Suburb; neighbours: Suburb[]; sameRegion: Suburb[] };

function enquiryHref(s: Suburb): string {
  return `/enquire?mode=in_home&suburb=${encodeURIComponent(s.name)}`;
}

function coverageParagraph(s: Suburb, neighbours: Suburb[]): string {
  const near = neighbours.length ? ` We also cover ${listNames(neighbours)} and the suburbs around them.` : '';
  if (s.core) {
    return `${s.name} is in the St George area, where Crestio is based, so it is where in-home tutors are matched first. Lessons happen at your home, at a local library, or online, and you can switch between them whenever your week changes.${near}`;
  }
  if (s.region === 'Sutherland Shire') {
    return `In-home lessons are available in ${s.name} and across the Sutherland Shire. We match by suburb so the tutor is local rather than crossing Sydney; if no suitable local tutor is free at your preferred time, we tell you straight and offer the same tutor online instead of a worse match in person.${near}`;
  }
  return `In-home lessons are available in ${s.name}, which sits just outside our St George base. We match by suburb so the tutor is local; if no suitable local tutor is free at your preferred time, we say so and offer the same tutor online rather than a worse match in person.${near}`;
}

function travelSentence(s: Suburb): string | null {
  if (!s.station) return null;
  return `${s.name} has its own station on the ${s.station.line} line, which makes it an easy suburb for tutors who travel by train.`;
}

function faqFor(s: Suburb, neighbours: Suburb[]) {
  return [
    {
      q: `Do you offer in-home tutoring in ${s.name}?`,
      a: `Yes. ${s.name} is covered for in-home maths and physics lessons, and online lessons are available anywhere. Tell us your suburb on the enquiry form and we match a tutor who can get to you.`,
    },
    {
      q: `Which suburbs near ${s.name} do you cover?`,
      a: neighbours.length
        ? `${listNames(neighbours)}, and the rest of ${s.region === 'St George' ? 'the St George area' : s.region}. In-home lessons run across Sydney; online lessons run anywhere in Australia.`
        : `The rest of ${s.region === 'St George' ? 'the St George area' : s.region}, and Sydney more widely for in-home lessons. Online lessons run anywhere in Australia.`,
    },
    {
      q: `What if no tutor is available in ${s.name} at the time we want?`,
      a: `We tell you before you commit to anything. You can take the same tutor online, choose a different time, or wait for a local tutor to open up. There is no charge to enquire and no lock-in.`,
    },
    {
      q: 'How much does it cost?',
      a: `In-home rates are $${rateBand('years_7_10').inHome} an hour for Years 7 to 10, $${rateBand('hsc').inHome} for Years 11 and 12, and $${rateBand('ext2').inHome} for Extension 2. Online is $${rateBand('years_7_10').online} / $${rateBand('hsc').online} / $${rateBand('ext2').online}. That is the full price: no joining fee, no booking fee, and the first lesson is guaranteed.`,
    },
  ];
}

export default function SuburbPage({ suburb, neighbours, sameRegion }: Props) {
  const faq = faqFor(suburb, neighbours);
  const title = `Maths and physics tutoring in ${suburb.name}`;
  const description = `One-on-one maths and physics tutoring in ${suburb.name}, in-home or online, Years 7 to 12 and the HSC. Tutors matched by suburb, interviewed and WWCC-verified. First lesson guaranteed.`;
  const travel = travelSentence(suburb);
  const others = sameRegion.filter((x) => x.slug !== suburb.slug);

  return (
    <AgencyPage
      title={title}
      description={description}
      path={`/tutoring/${suburb.slug}`}
      ogTitle={`${title}.`}
      ogSubtitle="In-home or online. Matched by suburb, interviewed and WWCC-verified."
      jsonLd={[
        tutoringServiceSchema('all', { suburb: suburb.name, region: suburb.region }),
        agencyFaqSchema(faq),
        breadcrumb([{ name: 'Home', url: '/' }, { name: 'Where we tutor', url: '/tutoring' }, { name: suburb.name, url: `/tutoring/${suburb.slug}` }]),
      ]}
    >
      <section className="px-6 md:px-12 pt-14 md:pt-20 pb-6 max-w-6xl mx-auto">
        <div className="max-w-2xl">
          <div className="text-2xs uppercase tracking-widest text-ink-soft mb-4">{suburb.region} · Sydney</div>
          <h1 className="font-display text-4xl md:text-6xl tracking-tighter text-ink text-balance leading-[1.05] mb-5">{title}.</h1>
          <p className="text-base md:text-lg text-ink-muted leading-relaxed mb-7">
            One tutor, one student, at your home in {suburb.name} or online. Maths from Year 7 to Extension 2 and HSC physics, with every tutor interviewed, ID-checked and WWCC-verified before they meet your child.
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <Link href={enquiryHref(suburb)} className="btn-primary px-6 w-full sm:w-auto">Book a free consultation</Link>
            <Link href="/pricing" className="btn-secondary px-6 w-full sm:w-auto">See pricing</Link>
          </div>
          <p className="mt-4 text-2xs text-ink-soft">No joining fee. No lock-in. A reply within {AGENCY.policies.replyWithinHours} hours, from the founder.</p>
        </div>
      </section>

      <Section tone="surface" eyebrow="In-home lessons" heading={`Tutoring at home in ${suburb.name}.`}>
        <div className="grid lg:grid-cols-12 gap-8 lg:gap-12">
          <div className="lg:col-span-7 space-y-4 text-sm md:text-base text-ink-muted leading-relaxed">
            <p>{coverageParagraph(suburb, neighbours)}</p>
            {travel && <p>{travel}</p>}
            <p>
              For in-home lessons with a child, a parent or guardian is home and the lesson takes place in a shared living area. That is part of our <Link href="/child-safe" className="text-forest underline underline-offset-2">child safe policy</Link>, and every tutor agrees to it before their first student.
            </p>
          </div>
          <div className="lg:col-span-5">
            <div className="rounded-md border border-rule bg-cream p-6">
              <div className="text-2xs uppercase tracking-widest text-ink-soft mb-4">Every match includes</div>
              <ul className="space-y-2.5">
                {INCLUDED.map((item) => (
                  <li key={item} className="flex gap-3 text-sm text-ink">
                    <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-forest shrink-0" aria-hidden />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </Section>

      <Section eyebrow="Subjects" heading="Maths from Year 7 to Extension 2. Physics for the HSC.">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {SUBJECTS.map((s) => (
            <div key={s.key} className="rounded-md border border-rule bg-surface p-5">
              <div className="flex items-baseline justify-between gap-4 mb-1.5">
                <h3 className="text-base font-semibold text-ink">{s.label}</h3>
                <span className="text-2xs text-ink-soft whitespace-nowrap">{s.years}</span>
              </div>
              <p className="text-sm text-ink-muted leading-relaxed">{s.blurb}</p>
            </div>
          ))}
        </div>
        <p className="mt-6 text-sm text-ink-muted">
          More on each course: <Link href="/maths-tutoring" className="text-forest underline underline-offset-2">maths tutoring</Link> and <Link href="/physics-tutoring" className="text-forest underline underline-offset-2">physics tutoring</Link>.
        </p>
      </Section>

      <Section tone="surface" eyebrow="Pricing" heading={`Rates in ${suburb.name}, per hour.`}>
        <div className="grid lg:grid-cols-12 gap-8">
          <div className="lg:col-span-7"><RateTable /></div>
          <div className="lg:col-span-5 text-sm text-ink-muted leading-relaxed">
            <p className="mb-4">The same rates apply in every suburb. In-home rates include the tutor's travel; there is nothing added for distance. Pay after each lesson or in prepaid blocks. The first lesson is guaranteed: not the right fit, and we re-match you or refund it.</p>
            <p><Link href="/pricing" className="text-forest underline underline-offset-2">Everything included, and the cancellation policy →</Link></p>
          </div>
        </div>
      </Section>

      <HowItWorks compact />

      <Section eyebrow={`${suburb.name} questions`} heading="What families here ask." narrow>
        <div className="divide-y divide-rule border-y border-rule">
          {faq.map((f) => (
            <details key={f.q} className="group py-4">
              <summary className="cursor-pointer list-none flex items-start justify-between gap-4 text-base text-ink font-medium">
                <span>{f.q}</span><span className="mt-1 text-ink-soft group-open:rotate-45 transition-transform duration-150" aria-hidden>+</span>
              </summary>
              <p className="mt-3 text-sm text-ink-muted leading-relaxed">{f.a}</p>
            </details>
          ))}
        </div>
      </Section>

      {others.length > 0 && (
        <Section tone="surface" eyebrow="Nearby" heading={`Other suburbs in ${suburb.region}.`}>
          <ul className="flex flex-wrap gap-2">
            {others.map((o) => (
              <li key={o.slug}>
                <Link href={`/tutoring/${o.slug}`} className="inline-block rounded-md border border-rule bg-cream px-3 py-1.5 text-sm text-ink hover:bg-ruleSoft transition-colors">{o.name}</Link>
              </li>
            ))}
          </ul>
          <p className="mt-6 text-sm text-ink-muted">
            <Link href="/tutoring" className="text-forest underline underline-offset-2">All suburbs we tutor in →</Link>
          </p>
        </Section>
      )}

      <FinalBand />
    </AgencyPage>
  );
}

export const getStaticPaths: GetStaticPaths = async () => ({
  paths: SUBURBS.map((s) => ({ params: { suburb: s.slug } })),
  fallback: false,
});

export const getStaticProps: GetStaticProps<Props> = async ({ params }) => {
  const slug = typeof params?.suburb === 'string' ? params.suburb : '';
  const suburb = suburbBySlug(slug);
  if (!suburb) return { notFound: true };
  return {
    props: {
      suburb,
      neighbours: neighboursOf(suburb),
      sameRegion: suburbsInRegion(suburb.region),
    },
  };
};
