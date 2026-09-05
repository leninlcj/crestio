import Link from 'next/link';
import { AgencyPage, Section, CtaRow } from '../components/agency/AgencyPage';
import { RateTable, FinalBand } from '../components/agency/blocks';
import { AGENCY, INCLUDED, FAQS } from '../lib/agency';
import { tutoringServiceSchema, breadcrumb, agencyFaqSchema } from '../lib/agencySchema';

const PRICING_FAQ = FAQS.filter((f) => /cost|cancellation|pay|guarantee/i.test(f.q));

export default function Pricing() {
  return (
    <AgencyPage
      title="Pricing"
      description="Simple hourly rates for maths and physics tutoring in Sydney and online. No joining fee, no lock-in, first lesson guaranteed. Pay by card after each lesson or in prepaid blocks."
      path="/pricing"
      ogTitle="Simple hourly rates. No joining fee. No lock-in."
      ogSubtitle="Maths and physics tutoring, Years 7–12. Sydney in-home and online."
      jsonLd={[tutoringServiceSchema('all'), agencyFaqSchema(PRICING_FAQ), breadcrumb([{ name: 'Home', url: '/' }, { name: 'Pricing', url: '/pricing' }])]}
    >
      <section className="px-6 md:px-12 pt-14 md:pt-20 pb-10 max-w-6xl mx-auto">
        <div className="max-w-2xl mb-10">
          <div className="text-2xs uppercase tracking-widest text-ink-soft mb-4">Pricing</div>
          <h1 className="font-display text-4xl md:text-6xl tracking-tighter text-ink text-balance leading-[1.05] mb-5">Simple hourly rates.</h1>
          <p className="text-base md:text-lg text-ink-muted leading-relaxed">
            No joining fee, no lock-in. Online costs less; in-home rates cover the tutor's travel. Prices are per hour and are the full amount you pay.
          </p>
        </div>
        <div className="grid lg:grid-cols-12 gap-8 lg:gap-12">
          <div className="lg:col-span-7"><RateTable /></div>
          <div className="lg:col-span-5">
            <h2 className="text-2xs uppercase tracking-widest text-ink-soft mb-4">Every match includes</h2>
            <ul className="space-y-2.5 mb-8">
              {INCLUDED.map((item) => (
                <li key={item} className="flex gap-3 text-sm text-ink">
                  <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-forest shrink-0" aria-hidden />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <CtaRow />
          </div>
        </div>
      </section>

      <Section tone="surface" eyebrow="The fine print, in plain words" heading="How paying works.">
        <div className="grid md:grid-cols-3 gap-8">
          {[
            ['Pay as you go', 'After each lesson you get an invoice with a secure card link. Or buy a prepaid block of hours and we draw it down. Nothing is charged to your card without your say-so.'],
            [`${AGENCY.policies.cancellationHours}-hour cancellations`, `Tell us ${AGENCY.policies.cancellationHours} hours before a lesson and we reschedule at no charge. Inside ${AGENCY.policies.cancellationHours} hours the lesson is charged, so the tutor is paid for the time they held for you.`],
            ['First lesson guaranteed', AGENCY.policies.firstLessonGuarantee + ' Just tell us before the second lesson.'],
          ].map(([t, b]) => (
            <div key={t}>
              <h3 className="text-base font-semibold text-ink mb-1.5">{t}</h3>
              <p className="text-sm text-ink-muted leading-relaxed">{b}</p>
            </div>
          ))}
        </div>
        <p className="mt-8 text-sm text-ink-muted">
          Longer or shorter lessons are priced pro rata. The usual booking is one hour a week; for HSC students we suggest 90 minutes. Full terms are on the <Link href="/terms" className="text-forest underline underline-offset-2">terms page</Link>.
        </p>
      </Section>

      <Section eyebrow="Pricing questions" heading="What parents ask before they book." narrow>
        <div className="divide-y divide-rule border-y border-rule">
          {PRICING_FAQ.map((f) => (
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
