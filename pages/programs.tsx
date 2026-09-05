import Link from 'next/link';
import { AgencyPage, Section } from '../components/agency/AgencyPage';
import { FinalBand } from '../components/agency/blocks';
import { AGENCY, rateBand } from '../lib/agency';
import { PROGRAMS, programPrice, type Program } from '../lib/programs';
import { agencyFaqSchema, breadcrumb, tutoringServiceSchema } from '../lib/agencySchema';

// Two summer programs, each four one-on-one lessons at the published hourly
// rate. No package price, no discount claims: the price on this page is the
// rate card multiplied by four.

const FAQ = [
  {
    q: 'Is this a group course?',
    a: 'No. Every lesson is one tutor and one student, online or at your home, at times you choose inside the program window.',
  },
  {
    q: 'Who teaches it?',
    a: `A tutor matched to the student and the course, interviewed, ID-checked and WWCC-verified by Crestio, or ${AGENCY.founder.name} himself. You know who it is before the first lesson.`,
  },
  {
    q: 'What does it cost?',
    a: `Four lessons at the published hourly rate for the level, nothing more. The HSC head start is $${programPrice(PROGRAMS[0], 'online')} online or $${programPrice(PROGRAMS[0], 'in_home')} in-home ($${programPrice(PROGRAMS[0], 'online', 'ext2')} or $${programPrice(PROGRAMS[0], 'in_home', 'ext2')} for Extension 2). The Year 11 bridging program is $${programPrice(PROGRAMS[1], 'online')} online or $${programPrice(PROGRAMS[1], 'in_home')} in-home. Pay after each lesson by card, or all four up front if you prefer.`,
  },
  {
    q: 'Does the first-lesson guarantee apply?',
    a: `Yes. ${AGENCY.policies.firstLessonGuarantee}`,
  },
  {
    q: 'Can the tutor continue in Term 1?',
    a: 'Yes. If you want the same tutor weekly in Term 1, the slot is booked at the end of the program. There is no obligation either way.',
  },
];

function enquiryHref(p: Program): string {
  return `/enquire?program=${p.key}`;
}

function PriceLine({ p }: { p: Program }) {
  const main = rateBand(p.rateBand);
  const online = programPrice(p, 'online');
  const inHome = programPrice(p, 'in_home');
  return (
    <div className="rounded-md border border-rule bg-cream p-5 text-sm">
      <div className="text-2xs uppercase tracking-widest text-ink-soft mb-3">Price</div>
      <div className="flex items-baseline justify-between gap-4 py-1.5 border-b border-rule">
        <span className="text-ink">{p.lessons} lessons online</span>
        <span className="font-medium text-ink whitespace-nowrap">${online} <span className="text-ink-soft font-normal">({p.lessons} × ${main.online})</span></span>
      </div>
      <div className="flex items-baseline justify-between gap-4 py-1.5 border-b border-rule">
        <span className="text-ink">{p.lessons} lessons in-home</span>
        <span className="font-medium text-ink whitespace-nowrap">${inHome} <span className="text-ink-soft font-normal">({p.lessons} × ${main.inHome})</span></span>
      </div>
      {p.altRateBand && (
        <div className="flex items-baseline justify-between gap-4 py-1.5 border-b border-rule">
          <span className="text-ink">{p.altRateBand.label}</span>
          <span className="font-medium text-ink whitespace-nowrap">${programPrice(p, 'online', p.altRateBand.band)} online · ${programPrice(p, 'in_home', p.altRateBand.band)} in-home</span>
        </div>
      )}
      <p className="mt-3 text-ink-muted leading-relaxed">The published hourly rate, times {p.lessons}. No joining fee. Pay after each lesson by card, or up front. First lesson guaranteed.</p>
    </div>
  );
}

function ProgramBlock({ p, tone }: { p: Program; tone: 'cream' | 'surface' }) {
  return (
    <Section id={p.key} tone={tone} eyebrow={p.window} heading={`${p.name}.`} lead={p.who}>
      <div className="grid lg:grid-cols-12 gap-8 lg:gap-12">
        <div className="lg:col-span-7">
          <p className="text-sm md:text-base text-ink-muted leading-relaxed mb-6">{p.windowNote}</p>
          <ol className="space-y-5">
            {p.plan.map((step) => (
              <li key={step.n} className="flex gap-4">
                <div className="font-display text-2xl tracking-tighter text-forest w-7 shrink-0">{step.n}</div>
                <div>
                  <h3 className="text-base font-semibold text-ink mb-1">{step.title}</h3>
                  <p className="text-sm text-ink-muted leading-relaxed">{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
          <p className="mt-6 text-sm md:text-base text-ink leading-relaxed">{p.outcome}</p>
        </div>
        <div className="lg:col-span-5 space-y-4">
          <PriceLine p={p} />
          <Link href={enquiryHref(p)} className="btn-primary px-6 w-full block text-center">Ask about the {p.short}</Link>
          <p className="text-2xs text-ink-soft">A reply within {AGENCY.policies.replyWithinHours} hours, from the founder. No charge to ask.</p>
        </div>
      </div>
    </Section>
  );
}

export default function ProgramsPage() {
  return (
    <AgencyPage
      title="Summer programs: HSC head start and Year 11 bridging"
      description="Four one-on-one maths or physics lessons over the summer holidays: a January head start for the 2027 HSC, and a Year 10 to 11 maths bridging program. Published rates, online or at home in Sydney."
      path="/programs"
      ogTitle="Summer programs."
      ogSubtitle="A January HSC head start and a Year 10 to 11 maths bridge. Four lessons, one tutor, published rates."
      jsonLd={[
        tutoringServiceSchema('all'),
        agencyFaqSchema(FAQ),
        breadcrumb([{ name: 'Home', url: '/' }, { name: 'Summer programs', url: '/programs' }]),
      ]}
    >
      <section className="px-6 md:px-12 pt-14 md:pt-20 pb-6 max-w-6xl mx-auto">
        <div className="max-w-2xl">
          <div className="text-2xs uppercase tracking-widest text-ink-soft mb-4">Summer 2026 to 2027 · Sydney and online</div>
          <h1 className="font-display text-4xl md:text-6xl tracking-tighter text-ink text-balance leading-[1.05] mb-5">Four summer lessons, one tutor, before Term 1 starts.</h1>
          <p className="text-base md:text-lg text-ink-muted leading-relaxed mb-7">
            Two programs, each four one-hour lessons with one tutor: a January head start for students sitting the 2027 HSC, and a bridging program for Year 10 students about to begin Year 11 maths. Both are charged at the published hourly rate, nothing on top.
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <a href="#hsc-head-start" className="btn-primary px-6 w-full sm:w-auto">HSC head start</a>
            <a href="#year-11-bridging" className="btn-secondary px-6 w-full sm:w-auto">Year 11 bridging</a>
          </div>
        </div>
      </section>

      <ProgramBlock p={PROGRAMS[0]} tone="surface" />
      <ProgramBlock p={PROGRAMS[1]} tone="cream" />

      <Section tone="surface" eyebrow="Questions" heading="Common questions." narrow>
        <div className="divide-y divide-rule border-y border-rule">
          {FAQ.map((f) => (
            <details key={f.q} className="group py-4">
              <summary className="cursor-pointer list-none flex items-start justify-between gap-4 text-base text-ink font-medium">
                <span>{f.q}</span><span className="mt-1 text-ink-soft group-open:rotate-45 transition-transform duration-150" aria-hidden>+</span>
              </summary>
              <p className="mt-3 text-sm text-ink-muted leading-relaxed">{f.a}</p>
            </details>
          ))}
        </div>
        <p className="mt-8 text-sm text-ink-muted">
          Weekly tutoring during term is on the <Link href="/pricing" className="text-forest underline underline-offset-2">pricing page</Link>. Both programs can lead into it with the same tutor.
        </p>
      </Section>

      <FinalBand />
    </AgencyPage>
  );
}
