import Link from 'next/link';
import { AGENCY, FAQS, INCLUDED, RATE_CARD, SUBJECTS, formatRate, type Faq } from '../../lib/agency';
import { Section, CtaRow } from './AgencyPage';

// ---------------------------------------------------------------------------
// Hero
// ---------------------------------------------------------------------------

export function Hero({
  eyebrow = `Sydney & online · Maths and Physics, Years 7–12`,
  heading,
  lead,
}: {
  eyebrow?: string;
  heading: React.ReactNode;
  lead: React.ReactNode;
}) {
  return (
    <section className="px-6 md:px-12 pt-14 md:pt-24 pb-12 md:pb-16 max-w-6xl mx-auto">
      <div className="grid lg:grid-cols-12 gap-10 lg:gap-16 items-start">
        <div className="lg:col-span-7">
          <div className="text-2xs uppercase tracking-widest text-ink-soft mb-4">{eyebrow}</div>
          <h1 className="font-display text-4xl sm:text-5xl md:text-6xl tracking-tighter text-ink text-balance leading-[1.05] mb-5">
            {heading}
          </h1>
          <p className="text-base md:text-lg text-ink-muted leading-relaxed max-w-xl mb-7">{lead}</p>
          <CtaRow />
          <p className="mt-4 text-2xs text-ink-soft">No joining fee. No lock-in. A reply within {AGENCY.policies.replyWithinHours} hours, from the founder.</p>
        </div>
        <div className="lg:col-span-5">
          <MatchCard />
        </div>
      </div>
      <TrustStrip />
    </section>
  );
}

function MatchCard() {
  const rows: Array<[string, string]> = [
    ['Student', 'Year 11 · Maths Advanced'],
    ['Lessons', `In-home · ${AGENCY.serviceArea.homeSuburb}`],
    ['Tutor', 'Interviewed · ID-checked · WWCC-verified'],
    ['Matched in', `Under ${AGENCY.policies.matchWithinDays} days`],
  ];
  return (
    <div className="rounded-md border border-rule bg-surface p-5 md:p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="text-2xs uppercase tracking-widest text-ink-soft">How a match looks</div>
        <span className="pill pill-forest">Example</span>
      </div>
      <dl className="divide-y divide-rule">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-baseline justify-between gap-4 py-2.5">
            <dt className="text-xs text-ink-muted">{k}</dt>
            <dd className="text-sm text-ink text-right">{v}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-4 pt-4 border-t border-rule text-xs text-ink-muted leading-relaxed">
        {AGENCY.policies.firstLessonGuarantee}
      </div>
    </div>
  );
}

export function TrustStrip() {
  const items: Array<[string, string]> = [
    ['1:1', 'One tutor, one student, every lesson'],
    ['WWCC', 'Every tutor checked before they meet your child'],
    ['24h', 'A reply within a day, from a person'],
    ['$0', 'No joining fee and no lock-in'],
  ];
  return (
    <div className="mt-12 md:mt-16 grid grid-cols-2 md:grid-cols-4 gap-px bg-rule border border-rule rounded-md overflow-hidden">
      {items.map(([big, small]) => (
        <div key={big} className="bg-surface p-4 md:p-5">
          <div className="font-display text-2xl md:text-3xl tracking-tighter text-forest">{big}</div>
          <div className="text-xs text-ink-muted mt-1 leading-snug">{small}</div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// How it works
// ---------------------------------------------------------------------------

export const STEPS = [
  {
    n: '1',
    title: 'Tell us what you need',
    body: 'Year level, subject, and whether you want lessons online or at home. The form takes two minutes.',
  },
  {
    n: '2',
    title: 'We match a tutor',
    body: 'We hand-pick a tutor for the subject and the student — interviewed, ID-checked and WWCC-verified. Never a random name from a list.',
  },
  {
    n: '3',
    title: 'Meet, guaranteed',
    body: AGENCY.policies.firstLessonGuarantee + ' No awkward conversation.',
  },
  {
    n: '4',
    title: 'Keep the same tutor',
    body: 'You stay with the tutor who works. You get a short written note after every lesson, and we only change things when you ask.',
  },
] as const;

export function HowItWorks({ compact = false }: { compact?: boolean }) {
  return (
    <Section
      id="how"
      eyebrow="How it works"
      heading="From enquiry to the right tutor, in days."
      lead={compact ? undefined : 'No call centres, no random allocation. You deal with one person, and your tutor is hand-picked.'}
      tone="surface"
    >
      <ol className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 md:gap-8">
        {STEPS.map((s) => (
          <li key={s.n} className="relative">
            <div className="font-display text-3xl tracking-tighter text-forest mb-3">{s.n}</div>
            <h3 className="text-base font-semibold text-ink mb-2">{s.title}</h3>
            <p className="text-sm text-ink-muted leading-relaxed">{s.body}</p>
          </li>
        ))}
      </ol>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Subjects
// ---------------------------------------------------------------------------

export function SubjectGrid() {
  const maths = SUBJECTS.filter((s) => s.key !== 'physics');
  const physics = SUBJECTS.filter((s) => s.key === 'physics');
  return (
    <Section
      id="subjects"
      eyebrow="Subjects and levels"
      heading="Maths from Year 7 to Extension 2. Physics for the HSC."
      lead="We keep the list short so every tutor we send is strong in what they teach. Anything else, ask — if we cannot cover it well, we will say so."
    >
      <div className="grid md:grid-cols-2 gap-6 md:gap-8">
        <div className="rounded-md border border-rule bg-surface p-6">
          <div className="flex items-baseline justify-between mb-4">
            <h3 className="font-display text-2xl tracking-tighter text-ink">Mathematics</h3>
            <Link href="/maths-tutoring" className="text-xs text-forest hover:underline">Maths tutoring →</Link>
          </div>
          <ul className="divide-y divide-rule">
            {maths.map((s) => (
              <li key={s.key} className="py-3 flex items-baseline justify-between gap-4">
                <span className="text-sm text-ink">{s.label}</span>
                <span className="text-2xs text-ink-soft whitespace-nowrap">{s.years}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-md border border-rule bg-surface p-6">
          <div className="flex items-baseline justify-between mb-4">
            <h3 className="font-display text-2xl tracking-tighter text-ink">Physics</h3>
            <Link href="/physics-tutoring" className="text-xs text-forest hover:underline">Physics tutoring →</Link>
          </div>
          <ul className="divide-y divide-rule">
            {physics.map((s) => (
              <li key={s.key} className="py-3 flex items-baseline justify-between gap-4">
                <span className="text-sm text-ink">{s.label}</span>
                <span className="text-2xs text-ink-soft whitespace-nowrap">{s.years}</span>
              </li>
            ))}
            <li className="py-3 text-sm text-ink-muted">
              Modules 1–8 of the NSW syllabus, with the maths behind each one made explicit.
            </li>
          </ul>
          <p className="mt-4 text-xs text-ink-soft">University maths and physics by arrangement.</p>
        </div>
      </div>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Why Crestio
// ---------------------------------------------------------------------------

export const WHY = [
  ['The same tutor, every week', 'Consistency is how progress happens. We do not rotate tutors on you mid-term.'],
  ['A real person who answers', 'You deal directly with the founder. Messages get a reply the same day, not a ticket number.'],
  ['Verified, vetted tutors', 'Every tutor is 18 or older, WWCC-verified, ID-checked, and chosen for real results in their subject.'],
  ['Honest pricing, no lock-in', 'Rates are on the website, you pay as you go, and nothing is charged to your card without your say-so.'],
  ['Home or online', 'Lessons at your home, a local library, or online — whatever suits your week. Switch whenever you like.'],
  ['Fair pay, better tutors', 'We pay tutors properly, so the good ones stay. That is who teaches your child.'],
] as const;

export function WhyCrestio() {
  return (
    <Section id="why" eyebrow="Why families choose Crestio" heading="The things other services get wrong, done right.">
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-8">
        {WHY.map(([title, body]) => (
          <div key={title}>
            <h3 className="text-base font-semibold text-ink mb-1.5">{title}</h3>
            <p className="text-sm text-ink-muted leading-relaxed">{body}</p>
          </div>
        ))}
      </div>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Pricing
// ---------------------------------------------------------------------------

export function RateTable({ compact = false }: { compact?: boolean }) {
  return (
    <div className="rounded-md border border-rule bg-surface overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-2xs uppercase tracking-widest text-ink-soft border-b border-rule">
            <th className="text-left font-medium px-4 md:px-5 py-3">Level</th>
            <th className="text-right font-medium px-4 md:px-5 py-3">Online</th>
            <th className="text-right font-medium px-4 md:px-5 py-3">In-home</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-rule">
          {RATE_CARD.map((b) => (
            <tr key={b.key}>
              <td className="px-4 md:px-5 py-3.5 align-top">
                <div className="text-ink">{b.label}</div>
                {!compact && <div className="text-2xs text-ink-soft mt-0.5">{b.detail}</div>}
              </td>
              <td className="px-4 md:px-5 py-3.5 text-right align-top num tabular text-ink whitespace-nowrap">{formatRate(b.online, b.fromPrice)}</td>
              <td className="px-4 md:px-5 py-3.5 text-right align-top num tabular text-ink whitespace-nowrap">{formatRate(b.inHome, b.fromPrice)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="px-4 md:px-5 py-3 border-t border-rule text-2xs text-ink-soft leading-relaxed">
        Per hour, per student. The full price — no joining fee, no booking fee, nothing added at checkout. In-home rates cover the tutor's travel.
      </div>
    </div>
  );
}

export function PricingSummary() {
  return (
    <Section id="pricing" eyebrow="Pricing" heading="Simple hourly rates." lead="Online is the most popular option. Pay by card after each lesson, or in prepaid blocks if you prefer." tone="surface">
      <div className="grid lg:grid-cols-12 gap-8 lg:gap-12">
        <div className="lg:col-span-7"><RateTable /></div>
        <div className="lg:col-span-5">
          <h3 className="text-2xs uppercase tracking-widest text-ink-soft mb-4">What is included</h3>
          <ul className="space-y-2.5">
            {INCLUDED.map((item) => (
              <li key={item} className="flex gap-3 text-sm text-ink">
                <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-forest shrink-0" aria-hidden />
                <span>{item}</span>
              </li>
            ))}
          </ul>
          <div className="mt-8"><CtaRow /></div>
        </div>
      </div>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Tutor CTA
// ---------------------------------------------------------------------------

export function TutorBand() {
  return (
    <Section tone="forest" eyebrow="Become a tutor" heading="Tutor with Crestio.">
      <div className="grid lg:grid-cols-12 gap-8 items-start">
        <p className="lg:col-span-7 text-base text-cream/85 leading-relaxed">
          We are building a small team of maths and physics tutors who are good at their subject and good with people. Pay set to your level and experience, students matched to your strengths, flexible hours, online or local in-home work.
        </p>
        <div className="lg:col-span-5 flex flex-col sm:flex-row gap-3 lg:justify-end">
          <Link href="/tutors" className="btn border border-cream/30 text-cream hover:bg-cream/10 px-6">How it works</Link>
          <Link href="/tutors/apply" className="btn bg-cream text-forest-ink hover:bg-white px-6">Apply to tutor</Link>
        </div>
      </div>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Reviews — only ever real ones. Empty until the first families are in.
// ---------------------------------------------------------------------------

export function ReviewsBand() {
  return (
    <Section eyebrow="What families say" heading="Earning our reputation, one family at a time." tone="surface">
      <p className="text-sm text-ink-muted leading-relaxed max-w-2xl">
        We are new, and we would rather show you real words than invented ones. Verified reviews from our first families will appear here as they come in — and we would love you to be one of them.
      </p>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// FAQ
// ---------------------------------------------------------------------------

export function FaqList({ items = FAQS, heading = 'Good questions, answered plainly.', id = 'faq' }: { items?: readonly Faq[]; heading?: string; id?: string }) {
  return (
    <Section id={id} eyebrow="Frequently asked questions" heading={heading} narrow>
      <div className="divide-y divide-rule border-y border-rule">
        {items.map((f) => (
          <details key={f.q} className="group py-4">
            <summary className="cursor-pointer list-none flex items-start justify-between gap-4 text-base text-ink font-medium">
              <span>{f.q}</span>
              <span className="mt-1 text-ink-soft group-open:rotate-45 transition-transform duration-150" aria-hidden>+</span>
            </summary>
            <p className="mt-3 text-sm text-ink-muted leading-relaxed max-w-2xl">{f.a}</p>
          </details>
        ))}
      </div>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Final CTA
// ---------------------------------------------------------------------------

export function FinalBand() {
  return (
    <Section tone="forest">
      <div className="max-w-2xl">
        <h2 className="font-display text-3xl md:text-4xl tracking-tighter text-cream text-balance mb-4">Ready to find your tutor?</h2>
        <p className="text-base text-cream/80 leading-relaxed mb-7">
          Book a free, no-obligation consultation. Tell us what your child needs, and we will match the right tutor.
        </p>
        <CtaRow tone="forest" />
      </div>
    </Section>
  );
}
