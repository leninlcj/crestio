import Link from 'next/link';
import { AgencyPage, Section, CtaRow } from '../components/agency/AgencyPage';
import { RateTable, FinalBand } from '../components/agency/blocks';
import { AGENCY, INCLUDED, FAQS, PREPAID_BLOCK, REFERRAL } from '../lib/agency';
import { CLASS_RULES, GROUP_CLASSES, TERM_1_2027, classTermPrice, formatDollars } from '../lib/classes';
import { tutoringServiceSchema, breadcrumb, agencyFaqSchema } from '../lib/agencySchema';

const PRICING_FAQ = FAQS.filter((f) => /cost|cancellation|pay|guarantee/i.test(f.q));

export default function Pricing() {
  return (
    <AgencyPage
      title="Pricing"
      description="Simple hourly rates for maths, science, HSC and IB tutoring in Sydney and online, and small-group classes at less than half the one-to-one price. No joining fee, no lock-in, first lesson guaranteed."
      path="/pricing"
      ogTitle="Simple hourly rates. No joining fee. No lock-in."
      ogSubtitle="Maths, science, HSC and IB tutoring, Years 7–12. Sydney in-home and online."
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

      <Section tone="surface" eyebrow="Small-group classes" heading="Classes of six, at less than half the one-to-one price.">
        <div className="grid lg:grid-cols-12 gap-8 lg:gap-12">
          <div className="lg:col-span-7">
            <div className="rounded-md border border-rule bg-cream overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-2xs uppercase tracking-widest text-ink-soft border-b border-rule">
                    <th className="text-left font-medium px-4 md:px-5 py-3">Class</th>
                    <th className="text-right font-medium px-4 md:px-5 py-3">Per hour</th>
                    <th className="text-right font-medium px-4 md:px-5 py-3">Per term</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-rule">
                  {GROUP_CLASSES.filter((c) => c.term === TERM_1_2027.label).map((c) => (
                    <tr key={c.key}>
                      <td className="px-4 md:px-5 py-3.5 align-top">
                        <div className="text-ink">{c.title}</div>
                        <div className="text-2xs text-ink-soft mt-0.5">{c.hoursPerWeek === 1.5 ? '90 minutes' : `${c.hoursPerWeek} hours`} a week, {c.weeks} weeks</div>
                      </td>
                      <td className="px-4 md:px-5 py-3.5 text-right align-top num tabular text-ink whitespace-nowrap">{formatDollars(c.pricePerHour)}</td>
                      <td className="px-4 md:px-5 py-3.5 text-right align-top num tabular text-ink whitespace-nowrap">{formatDollars(classTermPrice(c))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="px-4 md:px-5 py-3 border-t border-rule text-2xs text-ink-soft leading-relaxed">
                Per student. {CLASS_RULES.minStudents} to {CLASS_RULES.maxStudents} students, taught by the founder, in Kogarah with an online seat. {CLASS_RULES.proRata}
              </div>
            </div>
          </div>
          <div className="lg:col-span-5 text-sm text-ink-muted leading-relaxed">
            <p className="mb-4">A class follows the course in step with school, one topic ahead, with a marked past-paper set every week. It is the right choice for a student who is keeping up and wants to get ahead; one-to-one is the right choice for a student who is stuck. Many families do both before exams.</p>
            <p><Link href="/classes" className="text-forest underline underline-offset-2">The {TERM_1_2027.label} classes and the January intensives →</Link></p>
          </div>
        </div>
      </Section>

      <Section eyebrow="The fine print, in plain words" heading="How paying works.">
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
          {[
            ['Pay as you go', 'After each lesson you get an invoice with a secure card link. Nothing is charged to your card without your say-so.'],
            [`Prepaid block, ${PREPAID_BLOCK.discountPercent}% off`, `Buy ${PREPAID_BLOCK.hours} hours up front at ${PREPAID_BLOCK.discountPercent}% off your hourly rate. Each lesson is drawn from the credit, every invoice shows what is left, and unused credit is refundable. Refer another family and you get $${REFERRAL.creditCents / 100} of lesson credit once they have had ${REFERRAL.afterLessons} lessons.`],
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

      <Section tone="surface" eyebrow="Pricing questions" heading="What parents ask before they book." narrow>
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
