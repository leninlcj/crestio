import Link from 'next/link';
import { AgencyPage, Section, CtaRow } from '../components/agency/AgencyPage';
import { RateTable, FinalBand, HowItWorks } from '../components/agency/blocks';
import { IB_SUBJECTS, rateBand } from '../lib/agency';
import { tutoringServiceSchema, breadcrumb, agencyFaqSchema } from '../lib/agencySchema';

const IB_FAQ = [
  { q: 'How is IB tutoring different from HSC tutoring?', a: 'The content overlaps, the assessment does not. IB papers are marked to published mark schemes with command terms that carry specific meanings, the internal assessment is a large part of the grade, and HL adds depth the HSC never reaches. Your tutor works from the IB guide for your subject and the mark schemes, not from HSC materials.' },
  { q: 'SL or HL?', a: 'Both, in every IB subject we list. Tell us which on the call; it changes the tutor we choose.' },
  { q: 'Do you help with the internal assessment and the maths exploration?', a: 'Yes: choosing a topic that can score, planning it, the analysis, and the write-up against the criteria. We do not write it for the student, and we say so plainly, because the IB checks and so do the schools.' },
  { q: 'Which schools do your students come from?', a: 'Crestio is new, and we will not invent a list. About twenty Sydney schools offer the Diploma; if your school is one of them, we can help, online or in your home.' },
  { q: 'Why is IB priced with Extension 2?', a: 'Because the tutors are scarcer. An IB tutor needs to know the IB syllabus, the command terms and the mark schemes, and to have taught or sat the Diploma. We pay those tutors more, so the price is the Extension 2 tier.' },
];

export default function IbTutoring() {
  const band = rateBand('ext2');
  return (
    <AgencyPage
      title="IB Diploma tutoring: maths, physics, chemistry, biology"
      description={`One-on-one IB Diploma tutoring in Sydney and online across Australia: Mathematics AA and AI, Physics, Chemistry and Biology at SL and HL, taught to the IB mark schemes. $${band.online} an hour online, $${band.inHome} in-home. First lesson guaranteed.`}
      path="/ib-tutoring"
      ogTitle="IB tutoring, taught to the IB mark schemes."
      ogSubtitle="Maths AA and AI, Physics, Chemistry, Biology. SL and HL. Sydney and online."
      jsonLd={[tutoringServiceSchema('ib'), agencyFaqSchema(IB_FAQ), breadcrumb([{ name: 'Home', url: '/' }, { name: 'IB tutoring', url: '/ib-tutoring' }])]}
    >
      <section className="px-6 md:px-12 pt-14 md:pt-20 pb-6 max-w-6xl mx-auto">
        <div className="max-w-2xl">
          <div className="text-2xs uppercase tracking-widest text-ink-soft mb-4">IB Diploma · SL and HL · Sydney & online Australia-wide</div>
          <h1 className="font-display text-4xl md:text-6xl tracking-tighter text-ink text-balance leading-[1.05] mb-5">IB tutoring, taught to the IB mark schemes.</h1>
          <p className="text-base md:text-lg text-ink-muted leading-relaxed mb-7">
            Mathematics Analysis and Approaches, Mathematics Applications and Interpretation, Physics, Chemistry and Biology. Tutors with IB experience, who know the command terms, the internal assessment criteria and the difference between SL and HL. Prices on the page: ${band.online} an hour online, ${band.inHome} in your home in Sydney.
          </p>
          <CtaRow />
        </div>
      </section>

      <Section tone="surface" eyebrow="Subjects" heading="Five IB subjects, SL and HL.">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {IB_SUBJECTS.map((s) => (
            <div key={s.key} className="rounded-md border border-rule bg-cream p-5">
              <h3 className="text-base font-semibold text-ink mb-1.5">{s.label}</h3>
              <p className="text-sm text-ink-muted leading-relaxed">{s.blurb}</p>
            </div>
          ))}
        </div>
        <p className="mt-6 text-sm text-ink-muted">Other IB subjects: ask on the call. If we do not have a tutor with IB experience in it, we say so.</p>
      </Section>

      <Section eyebrow="How an IB lesson runs" heading="Guide, mark scheme, command term, marks.">
        <div className="grid md:grid-cols-3 gap-8">
          {[
            ['From the guide', 'Every lesson starts from the IB subject guide for SL or HL, so nothing is taught that is not assessed and nothing assessed is skipped.'],
            ['To the mark scheme', 'Past IB papers, marked with the official mark schemes, so the student learns what a mark is given for and what it is withheld for.'],
            ['The internal assessment', 'Topic choice, plan, analysis and write-up against the criteria, on a schedule that finishes before the school deadline, not on it.'],
          ].map(([t, b]) => (
            <div key={t}>
              <h3 className="text-base font-semibold text-ink mb-1.5">{t}</h3>
              <p className="text-sm text-ink-muted leading-relaxed">{b}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section tone="surface" eyebrow="Pricing" heading="IB rates, per hour.">
        <div className="grid lg:grid-cols-12 gap-8">
          <div className="lg:col-span-7"><RateTable /></div>
          <div className="lg:col-span-5 text-sm text-ink-muted leading-relaxed">
            <p className="mb-4">IB sits in the {band.label} band: ${band.online} online, ${band.inHome} in-home. No joining fee, no lock-in. Pay after each lesson or in prepaid blocks. First lesson guaranteed.</p>
            <p><Link href="/pricing" className="text-forest underline underline-offset-2">Everything included, and the cancellation policy →</Link></p>
          </div>
        </div>
      </Section>

      <HowItWorks compact />

      <Section eyebrow="IB questions" heading="Things parents ask us about the IB." narrow>
        <div className="divide-y divide-rule border-y border-rule">
          {IB_FAQ.map((f) => (
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
