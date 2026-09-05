import Link from 'next/link';
import { AgencyPage, Section, CtaRow } from '../components/agency/AgencyPage';
import { RateTable, FinalBand, HowItWorks } from '../components/agency/blocks';
import { SUBJECTS } from '../lib/agency';
import { tutoringServiceSchema, breadcrumb, agencyFaqSchema } from '../lib/agencySchema';

const MATHS_FAQ = [
  { q: 'My child is in Year 9 and has "always been bad at maths". Can this be fixed?', a: 'Usually, yes. Usually the problem is two or three missing links from earlier years (fractions, negative numbers, algebra basics) that make everything after them feel impossible. The first lesson finds those links. Fix them and the current work gets easier fast.' },
  { q: 'Which HSC maths course should my child do?', a: 'Standard 2 suits students who want a solid, practical maths mark without calculus. Advanced is the gateway to engineering, science, commerce and most STEM degrees. Extension 1 and 2 are for students who enjoy the subject and want the scaling. We will give you an honest read after the first couple of lessons.' },
  { q: 'Do you help with assessments and past papers?', a: 'Yes. In Years 11 and 12 the lessons follow the school\'s assessment calendar: concepts first, then past-paper practice under timed conditions, then a debrief on the exact marks lost and why.' },
  { q: 'Do you cover the new NSW syllabus?', a: 'Yes. Lessons follow the current NESA syllabuses for Stage 4, Stage 5 and Stage 6 and use the school\'s textbook and notation, so nothing is taught twice in two different ways.' },
];

export default function MathsTutoring() {
  const maths = SUBJECTS.filter((s) => s.key !== 'physics');
  return (
    <AgencyPage
      title="Maths tutoring, Years 7–12 and HSC"
      description="One-on-one maths tutoring in Sydney and online: Years 7–10, HSC Mathematics Standard 2, Advanced, Extension 1 and Extension 2. Hand-matched, WWCC-verified tutors. First lesson guaranteed."
      path="/maths-tutoring"
      ogTitle="Maths tutoring, Year 7 to Extension 2."
      ogSubtitle="Hand-matched, WWCC-verified tutors. Sydney in-home and online."
      jsonLd={[tutoringServiceSchema('maths'), agencyFaqSchema(MATHS_FAQ), breadcrumb([{ name: 'Home', url: '/' }, { name: 'Maths tutoring', url: '/maths-tutoring' }])]}
    >
      <section className="px-6 md:px-12 pt-14 md:pt-20 pb-6 max-w-6xl mx-auto">
        <div className="max-w-2xl">
          <div className="text-2xs uppercase tracking-widest text-ink-soft mb-4">Mathematics · Years 7–12 · Sydney & online</div>
          <h1 className="font-display text-4xl md:text-6xl tracking-tighter text-ink text-balance leading-[1.05] mb-5">Maths tutoring that starts where your child actually is.</h1>
          <p className="text-base md:text-lg text-ink-muted leading-relaxed mb-7">
            Most maths trouble is a few missing links from earlier years. The first lesson finds them. Then a tutor who is strong in the exact course, from Year 7 through to Extension 2, builds forward from there, one week at a time.
          </p>
          <CtaRow />
        </div>
      </section>

      <Section tone="surface" eyebrow="Courses" heading="Every NSW maths course from Year 7 to Extension 2.">
        <div className="grid md:grid-cols-2 gap-4">
          {maths.map((s) => (
            <div key={s.key} className="rounded-md border border-rule bg-cream p-5">
              <div className="flex items-baseline justify-between gap-4 mb-1.5">
                <h2 className="text-base font-semibold text-ink">{s.label}</h2>
                <span className="text-2xs text-ink-soft whitespace-nowrap">{s.years}</span>
              </div>
              <p className="text-sm text-ink-muted leading-relaxed">{s.blurb}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section eyebrow="How a lesson runs" heading="Understanding first, speed second, marks as the result.">
        <div className="grid md:grid-cols-3 gap-8">
          {[
            ['Diagnose', 'A short diagnostic in the first lesson shows exactly which earlier skills are shaky. The plan is built on that, not on the year level.'],
            ['Build', 'One concept at a time, in the order the syllabus needs it, with the school\'s textbook and notation. A worked example, then the student does it, then a harder one.'],
            ['Prove it', 'Past-paper questions under time, marked the way a marker marks. A written note after every lesson tells you what was covered and what is next.'],
          ].map(([t, b]) => (
            <div key={t}>
              <h3 className="text-base font-semibold text-ink mb-1.5">{t}</h3>
              <p className="text-sm text-ink-muted leading-relaxed">{b}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section tone="surface" eyebrow="Pricing" heading="Maths rates, per hour.">
        <div className="grid lg:grid-cols-12 gap-8">
          <div className="lg:col-span-7"><RateTable /></div>
          <div className="lg:col-span-5 text-sm text-ink-muted leading-relaxed">
            <p className="mb-4">No joining fee, no lock-in. Pay after each lesson or in prepaid blocks. The first lesson is guaranteed: not the right fit, and we re-match you or refund it.</p>
            <p><Link href="/pricing" className="text-forest underline underline-offset-2">Everything included, and the cancellation policy →</Link></p>
          </div>
        </div>
      </Section>

      <HowItWorks compact />

      <Section eyebrow="Maths questions" heading="Things parents ask us about maths." narrow>
        <div className="divide-y divide-rule border-y border-rule">
          {MATHS_FAQ.map((f) => (
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
