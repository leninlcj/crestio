import Link from 'next/link';
import { AgencyPage, Section, CtaRow } from '../components/agency/AgencyPage';
import { STEPS, FinalBand } from '../components/agency/blocks';
import { AGENCY } from '../lib/agency';
import { breadcrumb } from '../lib/agencySchema';

const DETAIL = [
  {
    title: 'The call',
    body: `You leave a number and a good time, and ${AGENCY.founder.firstName} calls you back: usually within two hours between ${AGENCY.callBack.hoursFrom} and ${AGENCY.callBack.hoursTo}, always within one business day. If he cannot reach you, you get a message saying so and another call within a business day. On the call we ask about the student, the subject, what has been tried, what a good outcome looks like, and the practical things: days, times, online or at home. No pitch, no pressure. If we are not the right fit, we say so. Prefer to write? The enquiry form gets a reply within a day.`,
  },
  {
    title: 'The match',
    body: `We choose from tutors we have interviewed ourselves: strong results in the exact subject, a Working With Children Check we have verified, and a manner that suits the student. For in-home lessons we match by suburb so the tutor is local. You get a name and a short profile within ${AGENCY.policies.matchWithinDays} days.`,
  },
  {
    title: 'The first lesson',
    body: 'The tutor starts with a short diagnostic so the plan is built on what the student can actually do, not on the year level alone. After the lesson you get a written note: what was covered, what was strong, what comes next. ' + AGENCY.policies.firstLessonGuarantee,
  },
  {
    title: 'Every week after',
    body: 'Same tutor, same slot, a note after every lesson, and homework that is set on purpose. You pay after each lesson by card, or in prepaid blocks. Change or pause any time with a day\'s notice. If anything is off, you call or email the founder and it gets fixed.',
  },
];

export default function HowItWorksPage() {
  return (
    <AgencyPage
      title="How it works"
      description="From one phone call to the right tutor in days: you leave a number, the founder calls back, a hand-picked and WWCC-verified tutor, a guaranteed first lesson, then the same tutor every week."
      path="/how-it-works"
      jsonLd={[breadcrumb([{ name: 'Home', url: '/' }, { name: 'How it works', url: '/how-it-works' }])]}
    >
      <section className="px-6 md:px-12 pt-14 md:pt-20 pb-6 max-w-6xl mx-auto">
        <div className="max-w-2xl">
          <div className="text-2xs uppercase tracking-widest text-ink-soft mb-4">How it works</div>
          <h1 className="font-display text-4xl md:text-6xl tracking-tighter text-ink text-balance leading-[1.05] mb-5">From one phone call to the right tutor, in days.</h1>
          <p className="text-base md:text-lg text-ink-muted leading-relaxed mb-7">No call centres, no random allocation. You deal with one person, and your tutor is hand-picked.</p>
          <CtaRow />
        </div>
      </section>

      <Section tone="surface">
        <ol className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 md:gap-8">
          {STEPS.map((s) => (
            <li key={s.n}>
              <div className="font-display text-3xl tracking-tighter text-forest mb-3">{s.n}</div>
              <h2 className="text-base font-semibold text-ink mb-2">{s.title}</h2>
              <p className="text-sm text-ink-muted leading-relaxed">{s.body}</p>
            </li>
          ))}
        </ol>
      </Section>

      <Section eyebrow="In more detail" heading="What actually happens at each step.">
        <div className="grid md:grid-cols-2 gap-8 md:gap-10">
          {DETAIL.map((d) => (
            <div key={d.title} className="rounded-md border border-rule bg-surface p-6">
              <h3 className="font-display text-xl tracking-tighter text-ink mb-2">{d.title}</h3>
              <p className="text-sm text-ink-muted leading-relaxed">{d.body}</p>
            </div>
          ))}
        </div>
        <p className="mt-8 text-sm text-ink-muted">
          Rates are on the <Link href="/pricing" className="text-forest underline underline-offset-2">pricing page</Link>. Common questions are answered on the <Link href="/faq" className="text-forest underline underline-offset-2">FAQ</Link>.
        </p>
      </Section>

      <FinalBand />
    </AgencyPage>
  );
}
