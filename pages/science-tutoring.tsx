import Link from 'next/link';
import { AgencyPage, Section, CtaRow } from '../components/agency/AgencyPage';
import { RateTable, FinalBand, HowItWorks } from '../components/agency/blocks';
import { SUBJECTS } from '../lib/agency';
import { tutoringServiceSchema, breadcrumb, agencyFaqSchema } from '../lib/agencySchema';

const COURSES = [
  ['Chemistry, Years 11–12', ['Properties and structure of matter', 'Introduction to quantitative chemistry', 'Reactive chemistry', 'Drivers of reactions', 'Equilibrium and acid reactions', 'Acid/base reactions', 'Organic chemistry', 'Applying chemical ideas']],
  ['Biology, Years 11–12', ['Cells as the basis of life', 'Organisation of living things', 'Biological diversity', 'Ecosystem dynamics', 'Heredity', 'Genetic change', 'Infectious disease', 'Non-infectious disease and disorders']],
  ['Science, Years 7–10', ['Physical world', 'Chemical world', 'Living world', 'Earth and space', 'Working scientifically: variables, graphs, uncertainty, conclusions']],
] as const;

const SCIENCE_FAQ = [
  { q: 'Is chemistry mostly memorising?', a: 'Less than students think. About a third of the HSC chemistry paper is calculation (moles, concentration, equilibrium, pH) and most of the rest is explanation to a marking guideline. Lessons practise both: the working shown in full, and answers written the way the marker awards the marks.' },
  { q: 'Why do biology students lose marks?', a: 'Usually in the extended responses: knowing the content but not structuring the answer, or answering the topic instead of the question. Every biology lesson ends with one long-answer question written to time and marked to the guidelines.' },
  { q: 'Can one tutor cover chemistry and maths, or physics and chemistry?', a: 'Often, yes. We look for science tutors who also teach Mathematics Advanced or Extension 1, or a second science, and where one tutor can take both subjects we match them, because one weekly plan is easier for a Year 12 student to follow than two.' },
  { q: 'What about depth studies and practical investigations?', a: 'Both sciences assess a depth study and test practical skills in the exam. We help plan it, run the analysis and write it up, and we go through the working-scientifically skills (variables, reliability, validity, graphing) that the exam asks about directly.' },
  { q: 'Years 7 to 10 science: is it worth tutoring?', a: 'For a student who is behind, or who wants to take physics or chemistry in Year 11, yes. A term in Year 10 spent on the physical and chemical world topics and the maths underneath them is the cheapest preparation for Year 11 there is.' },
];

export default function ScienceTutoring() {
  const science = SUBJECTS.filter((s) => s.group === 'science');
  return (
    <AgencyPage
      title="Chemistry, biology and science tutoring, Years 7–12 and HSC"
      description="One-on-one HSC chemistry and biology tutoring, and Years 7 to 10 science, in Sydney and online. Hand-matched, WWCC-verified tutors who also teach the maths behind the science. First lesson guaranteed."
      path="/science-tutoring"
      ogTitle="Chemistry, biology and science tutoring."
      ogSubtitle="HSC and Years 7 to 10. Sydney in-home and online."
      jsonLd={[tutoringServiceSchema('science'), agencyFaqSchema(SCIENCE_FAQ), breadcrumb([{ name: 'Home', url: '/' }, { name: 'Science tutoring', url: '/science-tutoring' }])]}
    >
      <section className="px-6 md:px-12 pt-14 md:pt-20 pb-6 max-w-6xl mx-auto">
        <div className="max-w-2xl">
          <div className="text-2xs uppercase tracking-widest text-ink-soft mb-4">Science · Years 7–12 · Sydney & online</div>
          <h1 className="font-display text-4xl md:text-6xl tracking-tighter text-ink text-balance leading-[1.05] mb-5">Science tutoring that shows the working.</h1>
          <p className="text-base md:text-lg text-ink-muted leading-relaxed mb-7">
            Chemistry and biology for the HSC, and science for Years 7 to 10. The calculation done in full, the explanation written to the marking guideline, and the practical skills the exam tests directly. Physics has <Link href="/physics-tutoring" className="text-forest underline underline-offset-2">its own page</Link>.
          </p>
          <CtaRow />
        </div>
      </section>

      <Section tone="surface" eyebrow="Courses" heading="The NSW courses, module by module.">
        <div className="grid md:grid-cols-3 gap-6">
          {COURSES.map(([course, mods]) => (
            <div key={course} className="rounded-md border border-rule bg-cream p-5">
              <h2 className="text-base font-semibold text-ink mb-3">{course}</h2>
              <ul className="space-y-1.5">
                {mods.map((m, i) => (
                  <li key={m} className="flex gap-3 text-sm text-ink-muted">
                    <span className="num tabular text-ink-soft w-5 shrink-0">{i + 1}</span>
                    <span>{m}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Section>

      <Section eyebrow="Subjects" heading="What each subject covers.">
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
          {science.map((s) => (
            <div key={s.key} className="rounded-md border border-rule bg-surface p-5">
              <div className="flex items-baseline justify-between gap-4 mb-1.5">
                <h3 className="text-base font-semibold text-ink">{s.label}</h3>
                <span className="text-2xs text-ink-soft whitespace-nowrap">{s.years}</span>
              </div>
              <p className="text-sm text-ink-muted leading-relaxed">{s.blurb}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section tone="surface" eyebrow="Pricing" heading="Science rates, per hour.">
        <div className="grid lg:grid-cols-12 gap-8">
          <div className="lg:col-span-7"><RateTable /></div>
          <div className="lg:col-span-5 text-sm text-ink-muted leading-relaxed">
            <p className="mb-4">Chemistry and biology sit in the Years 11–12 HSC band; Years 7 to 10 science in the Years 7–10 band. No joining fee, no lock-in. Pay after each lesson or in prepaid blocks. First lesson guaranteed.</p>
            <p><Link href="/pricing" className="text-forest underline underline-offset-2">Everything included, and the cancellation policy →</Link></p>
          </div>
        </div>
      </Section>

      <HowItWorks compact />

      <Section eyebrow="Science questions" heading="Things parents ask us about science." narrow>
        <div className="divide-y divide-rule border-y border-rule">
          {SCIENCE_FAQ.map((f) => (
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
