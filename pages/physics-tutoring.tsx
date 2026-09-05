import Link from 'next/link';
import { AgencyPage, Section, CtaRow } from '../components/agency/AgencyPage';
import { RateTable, FinalBand, HowItWorks } from '../components/agency/blocks';
import { tutoringServiceSchema, breadcrumb, agencyFaqSchema } from '../lib/agencySchema';

const MODULES = [
  ['Year 11', ['Kinematics', 'Dynamics', 'Waves and thermodynamics', 'Electricity and magnetism']],
  ['Year 12', ['Advanced mechanics', 'Electromagnetism', 'The nature of light', 'From the universe to the atom']],
] as const;

const PHYSICS_FAQ = [
  { q: 'Is physics mostly maths?', a: 'The HSC physics course is about half maths in practice: rearranging formulas, working with vectors, reading graphs, handling units. Students who are shaky on the maths lose marks on physics they understand. Crestio physics lessons teach the maths behind each module explicitly rather than assuming it.' },
  { q: 'What about the depth study and practical work?', a: 'We help plan and write up the depth study, and we go over practical investigations (variables, uncertainty, graphing) because the exam tests them directly.' },
  { q: 'Can the same tutor do maths and physics?', a: 'Often, yes. A physics tutor who also teaches Mathematics Advanced or Extension 1 keeps the weekly plan coherent, and we match one tutor for both subjects where we can. Ask on the enquiry form.' },
  { q: 'Do you tutor Year 10 science as physics preparation?', a: 'If the goal is a strong start to Year 11 physics, yes. A short bridging plan in Term 4 of Year 10 covers the maths and the core ideas. Mention it in your enquiry.' },
];

export default function PhysicsTutoring() {
  return (
    <AgencyPage
      title="Physics tutoring, Years 11–12 and HSC"
      description="One-on-one HSC physics tutoring in Sydney and online, all eight modules, with the maths behind each one made explicit. Hand-matched, WWCC-verified tutors. First lesson guaranteed."
      path="/physics-tutoring"
      ogTitle="HSC physics tutoring, all eight modules."
      ogSubtitle="Hand-matched, WWCC-verified tutors. Sydney in-home and online."
      jsonLd={[tutoringServiceSchema('physics'), agencyFaqSchema(PHYSICS_FAQ), breadcrumb([{ name: 'Home', url: '/' }, { name: 'Physics tutoring', url: '/physics-tutoring' }])]}
    >
      <section className="px-6 md:px-12 pt-14 md:pt-20 pb-6 max-w-6xl mx-auto">
        <div className="max-w-2xl">
          <div className="text-2xs uppercase tracking-widest text-ink-soft mb-4">Physics · Years 11–12 · Sydney & online</div>
          <h1 className="font-display text-4xl md:text-6xl tracking-tighter text-ink text-balance leading-[1.05] mb-5">Physics tutoring with the maths made explicit.</h1>
          <p className="text-base md:text-lg text-ink-muted leading-relaxed mb-7">
            HSC physics is half concepts and half calculation. Lessons teach both: the idea, the formula, what every symbol means, the units, the graph, and how the marker awards the marks.
          </p>
          <CtaRow />
        </div>
      </section>

      <Section tone="surface" eyebrow="Modules" heading="All eight modules of the NSW syllabus.">
        <div className="grid md:grid-cols-2 gap-6">
          {MODULES.map(([year, mods]) => (
            <div key={year} className="rounded-md border border-rule bg-cream p-5">
              <h2 className="text-base font-semibold text-ink mb-3">{year}</h2>
              <ul className="space-y-1.5">
                {mods.map((m, i) => (
                  <li key={m} className="flex gap-3 text-sm text-ink-muted">
                    <span className="num tabular text-ink-soft w-5 shrink-0">{year === 'Year 11' ? i + 1 : i + 5}</span>
                    <span>{m}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <p className="mt-6 text-sm text-ink-muted">Depth study support and practical-investigation skills are part of the plan, because the exam tests them directly.</p>
      </Section>

      <Section eyebrow="How a lesson runs" heading="Idea, formula, meaning, units, marks.">
        <div className="grid md:grid-cols-3 gap-8">
          {[
            ['The idea', 'What is physically happening, in plain words and a diagram, before any formula appears.'],
            ['The formula', 'Every symbol defined, units kept visible, substitution then calculation then a check that the answer is sensible.'],
            ['The marks', 'Past HSC questions, marked the way the marker marks: what earns the mark, what loses it, and the traps in the wording.'],
          ].map(([t, b]) => (
            <div key={t}>
              <h3 className="text-base font-semibold text-ink mb-1.5">{t}</h3>
              <p className="text-sm text-ink-muted leading-relaxed">{b}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section tone="surface" eyebrow="Pricing" heading="Physics rates, per hour.">
        <div className="grid lg:grid-cols-12 gap-8">
          <div className="lg:col-span-7"><RateTable /></div>
          <div className="lg:col-span-5 text-sm text-ink-muted leading-relaxed">
            <p className="mb-4">Physics sits in the Years 11–12 HSC band. No joining fee, no lock-in. Pay after each lesson or in prepaid blocks. First lesson guaranteed.</p>
            <p><Link href="/pricing" className="text-forest underline underline-offset-2">Everything included, and the cancellation policy →</Link></p>
          </div>
        </div>
      </Section>

      <HowItWorks compact />

      <Section eyebrow="Physics questions" heading="Things parents ask us about physics." narrow>
        <div className="divide-y divide-rule border-y border-rule">
          {PHYSICS_FAQ.map((f) => (
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
