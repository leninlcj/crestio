import Link from 'next/link';
import { AgencyPage, Section } from '../components/agency/AgencyPage';
import { FinalBand } from '../components/agency/blocks';
import { AGENCY, RATE_CARD } from '../lib/agency';
import { CLASS_RULES, GROUP_CLASSES, TERM_1_2027, classTermPrice, classWeeklyPrice, formatDollars } from '../lib/classes';
import { agencyFaqSchema, breadcrumb } from '../lib/agencySchema';

// Group classes taught by the founder. A class page in the Matrix shape:
// what is included, when, what it costs, how to join. No booking widget: a
// family registers interest, the founder calls, and the class runs at four.

const hsc = RATE_CARD.find((b) => b.key === 'hsc')!;

const CLASS_FAQ = [
  { q: 'Who teaches the classes?', a: `${AGENCY.founder.name}, the founder: an electrical engineering student at Macquarie University who has tutored HSC maths and physics in Sydney's south since 2022. Every class is his, every week. No rotating teachers.` },
  { q: 'How big is a class?', a: `Never more than ${CLASS_RULES.maxStudents}. A class runs once ${CLASS_RULES.minStudents} families have confirmed, so every student is seen and every question gets answered.` },
  { q: 'Where and how?', a: `${CLASS_RULES.venue}. ${CLASS_RULES.onlineOnly}. Online students see the same board and get the same marked work.` },
  { q: 'What does a term cost, and when do I pay?', a: `Year 11 and 12 classes are $45 an hour per student, two hours a week, so ${formatDollars(classTermPrice(GROUP_CLASSES[0]))} for a ${TERM_1_2027.classWeeks}-week term. The term is invoiced once the class is confirmed and can be paid by card. ${CLASS_RULES.proRata} ${CLASS_RULES.refund}` },
  { q: 'Is a class as good as one-to-one?', a: `Different. One-to-one at $${hsc.inHome} an hour follows one student wherever they are stuck. A class follows the course in step with school, with marked past-paper work every week, at less than half the price per hour. Many families do a class and add one-to-one before exams.` },
  { q: 'What about missed weeks?', a: 'Notes and the marked set for that week are posted in the parent portal. Online classes may be recorded for absent students only with written consent from every family in the class; recordings are private and deleted at the end of term.' },
];

export default function ClassesPage() {
  const termClasses = GROUP_CLASSES.filter((c) => c.term === TERM_1_2027.label);
  const intensives = GROUP_CLASSES.filter((c) => c.term !== TERM_1_2027.label);
  return (
    <AgencyPage
      title="Small-group classes in Kogarah and online"
      description={`Senior maths and physics classes of ${CLASS_RULES.minStudents} to ${CLASS_RULES.maxStudents}, taught by the founder, in Kogarah and online. Two hours a week for a ten-week term at $45 an hour per student, less than half the one-to-one price. ${TERM_1_2027.label} and January 2027 intensives now registering.`}
      path="/classes"
      ogTitle="Classes of six, taught by the founder."
      ogSubtitle="Senior maths and physics. Kogarah and online. $45 an hour per student."
      jsonLd={[agencyFaqSchema(CLASS_FAQ), breadcrumb([{ name: 'Home', url: '/' }, { name: 'Classes', url: '/classes' }])]}
    >
      <section className="px-6 md:px-12 pt-14 md:pt-20 pb-6 max-w-6xl mx-auto">
        <div className="max-w-2xl">
          <div className="text-2xs uppercase tracking-widest text-ink-soft mb-4">Classes · Kogarah & online · Years 10–12</div>
          <h1 className="font-display text-4xl md:text-6xl tracking-tighter text-ink text-balance leading-[1.05] mb-5">Six students, one teacher, the whole course.</h1>
          <p className="text-base md:text-lg text-ink-muted leading-relaxed mb-7">
            Senior maths and physics classes taught by the founder, in step with school and one topic ahead, with a marked past-paper set every week. Two hours a week, ten weeks a term, $45 an hour per student. In a hired room in Kogarah, with an online seat for students who cannot travel.
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <a href="#timetable" className="btn-primary px-6 w-full sm:w-auto">See the classes</a>
            <Link href="/request-a-call" className="btn-secondary px-6 w-full sm:w-auto">Request a call</Link>
          </div>
          <p className="mt-4 text-2xs text-ink-soft">A class runs once {CLASS_RULES.minStudents} families confirm. Nothing is charged until it does.</p>
        </div>
      </section>

      <Section id="timetable" tone="surface" eyebrow={TERM_1_2027.label} heading={`Term classes: ${TERM_1_2027.studentsStart} to ${TERM_1_2027.ends}.`} lead="Days and times are set with the first four families, from weekday evenings and Saturday mornings, and then fixed for the term.">
        <div className="grid md:grid-cols-2 gap-4">
          {termClasses.map((c) => (
            <div key={c.key} id={c.key} className="rounded-md border border-rule bg-cream p-6 flex flex-col">
              <div className="flex items-baseline justify-between gap-4 mb-2">
                <h3 className="font-display text-xl tracking-tighter text-ink">{c.title}</h3>
                <span className="pill pill-neutral">{c.format === 'hybrid' ? 'Kogarah + online' : 'Online'}</span>
              </div>
              <p className="text-sm text-ink-muted leading-relaxed mb-4">{c.blurb}</p>
              <dl className="text-sm divide-y divide-rule border-y border-rule mb-5">
                <div className="flex justify-between gap-4 py-2"><dt className="text-ink-muted">Each week</dt><dd className="text-ink text-right">{c.hoursPerWeek === 1.5 ? '90 minutes' : `${c.hoursPerWeek} hours`}, {formatDollars(classWeeklyPrice(c))}</dd></div>
                <div className="flex justify-between gap-4 py-2"><dt className="text-ink-muted">Term</dt><dd className="text-ink text-right">{c.weeks} weeks, {formatDollars(classTermPrice(c))}</dd></div>
                <div className="flex justify-between gap-4 py-2"><dt className="text-ink-muted">Per hour</dt><dd className="text-ink text-right num tabular">{formatDollars(c.pricePerHour)} per student</dd></div>
                <div className="flex justify-between gap-4 py-2"><dt className="text-ink-muted">Class size</dt><dd className="text-ink text-right">{CLASS_RULES.minStudents} to {CLASS_RULES.maxStudents}</dd></div>
              </dl>
              <p className="text-2xs text-ink-soft mb-5">{c.when}</p>
              <div className="mt-auto">
                <Link href={`/request-a-call?class=${c.key}`} className="btn-primary w-full sm:w-auto px-6">Register interest</Link>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section eyebrow="January 2027" heading="Holiday intensives, online." lead="Three two-hour sessions in the week of 18 January, before Term 1. A head start for students going into Year 12.">
        <div className="grid md:grid-cols-2 gap-4">
          {intensives.map((c) => (
            <div key={c.key} id={c.key} className="rounded-md border border-rule bg-surface p-6 flex flex-col">
              <div className="flex items-baseline justify-between gap-4 mb-2">
                <h3 className="font-display text-xl tracking-tighter text-ink">{c.title}</h3>
                <span className="pill pill-neutral">Online</span>
              </div>
              <p className="text-sm text-ink-muted leading-relaxed mb-4">{c.blurb}</p>
              <dl className="text-sm divide-y divide-rule border-y border-rule mb-5">
                <div className="flex justify-between gap-4 py-2"><dt className="text-ink-muted">Sessions</dt><dd className="text-ink text-right">{c.weeks} x {c.hoursPerWeek} hours</dd></div>
                <div className="flex justify-between gap-4 py-2"><dt className="text-ink-muted">Price</dt><dd className="text-ink text-right">{formatDollars(classTermPrice(c))} per student</dd></div>
                <div className="flex justify-between gap-4 py-2"><dt className="text-ink-muted">Class size</dt><dd className="text-ink text-right">{CLASS_RULES.minStudents} to {CLASS_RULES.maxStudents}</dd></div>
              </dl>
              <p className="text-2xs text-ink-soft mb-5">{c.when}</p>
              <div className="mt-auto">
                <Link href={`/request-a-call?class=${c.key}`} className="btn-primary w-full sm:w-auto px-6">Register interest</Link>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section tone="surface" eyebrow="What a class week looks like" heading="Teach, work, mark, report.">
        <div className="grid md:grid-cols-4 gap-8">
          {[
            ['Teach', 'The week\'s topic, one step ahead of school, with the reasoning shown and the traps named.'],
            ['Work', 'Past HSC questions on that topic, done in class, so the method is practised while the explanation is fresh.'],
            ['Mark', 'A short set to finish at home, marked to the HSC marking guidelines and handed back the next week.'],
            ['Report', 'A note in the parent portal after every class: what was covered, how your child went, what to practise.'],
          ].map(([t, b]) => (
            <div key={t}>
              <h3 className="text-base font-semibold text-ink mb-1.5">{t}</h3>
              <p className="text-sm text-ink-muted leading-relaxed">{b}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section eyebrow="Class questions" heading="Things parents ask about classes." narrow>
        <div className="divide-y divide-rule border-y border-rule">
          {CLASS_FAQ.map((f) => (
            <details key={f.q} className="group py-4">
              <summary className="cursor-pointer list-none flex items-start justify-between gap-4 text-base text-ink font-medium">
                <span>{f.q}</span><span className="mt-1 text-ink-soft group-open:rotate-45 transition-transform duration-150" aria-hidden>+</span>
              </summary>
              <p className="mt-3 text-sm text-ink-muted leading-relaxed">{f.a}</p>
            </details>
          ))}
        </div>
      </Section>

      <FinalBand />
    </AgencyPage>
  );
}
