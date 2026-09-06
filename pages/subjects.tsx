import Link from 'next/link';
import { AgencyPage, Section, CtaRow } from '../components/agency/AgencyPage';
import { FinalBand, RateTable } from '../components/agency/blocks';
import { AGENCY, CORE_SUBJECTS, IB_SUBJECTS, REQUEST_SUBJECTS, SUBJECT_TIER_LABEL, rateBand, type Subject } from '../lib/agency';
import { breadcrumb, tutoringServiceSchema } from '../lib/agencySchema';

// Every subject on one page, in three tiers, with the honest rule for each:
// core is tested by the founder; by-request is matched only when a tested
// tutor exists; IB is taught by tutors with IB experience.

function SubjectCard({ s }: { s: Subject }) {
  const band = rateBand(s.rateBand);
  return (
    <div className="rounded-md border border-rule bg-surface p-5 flex flex-col">
      <div className="flex items-baseline justify-between gap-4 mb-1.5">
        <h3 className="text-base font-semibold text-ink">{s.label}</h3>
        <span className="text-2xs text-ink-soft whitespace-nowrap">{s.years}</span>
      </div>
      <p className="text-sm text-ink-muted leading-relaxed flex-1">{s.blurb}</p>
      <p className="mt-3 text-2xs text-ink-soft">{band.label}: ${band.online} online, {band.inHome == null ? 'online only' : `$${band.inHome} in-home`}, per hour.</p>
    </div>
  );
}

export default function SubjectsPage() {
  return (
    <AgencyPage
      title="Subjects: maths, science, HSC and IB"
      description="Every subject Crestio Tutoring covers, Years 7 to 12: maths and science as the core, other HSC subjects by request, and the IB Diploma. Prices on the page. Sydney in-home and online across Australia."
      path="/subjects"
      ogTitle="Maths and science first. Other HSC subjects and the IB by request."
      ogSubtitle="Years 7 to 12. Prices on the page."
      jsonLd={[tutoringServiceSchema('all'), breadcrumb([{ name: 'Home', url: '/' }, { name: 'Subjects', url: '/subjects' }])]}
    >
      <section className="px-6 md:px-12 pt-14 md:pt-20 pb-6 max-w-6xl mx-auto">
        <div className="max-w-2xl">
          <div className="text-2xs uppercase tracking-widest text-ink-soft mb-4">Subjects · Years 7–12 · HSC and IB</div>
          <h1 className="font-display text-4xl md:text-6xl tracking-tighter text-ink text-balance leading-[1.05] mb-5">Maths and science first. Everything else when we can do it well.</h1>
          <p className="text-base md:text-lg text-ink-muted leading-relaxed mb-7">
            Maths and the sciences are the core: {AGENCY.founder.firstName} tests every tutor himself before they meet a student. English, economics, business, legal and history are listed so your enquiry arrives, and matched only when a tutor has passed our test in that subject. The IB Diploma is taught by tutors with IB experience, to the IB mark schemes.
          </p>
          <CtaRow />
        </div>
      </section>

      <Section tone="surface" id="core" eyebrow={SUBJECT_TIER_LABEL.core} heading="Tested by the founder, taught every week.">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {CORE_SUBJECTS.map((s) => <SubjectCard key={s.key} s={s} />)}
        </div>
        <p className="mt-6 text-sm text-ink-muted">
          In detail: <Link href="/maths-tutoring" className="text-forest underline underline-offset-2">maths</Link>, <Link href="/physics-tutoring" className="text-forest underline underline-offset-2">physics</Link>, <Link href="/science-tutoring" className="text-forest underline underline-offset-2">chemistry, biology and Years 7 to 10 science</Link>.
        </p>
      </Section>

      <Section id="by-request" eyebrow={SUBJECT_TIER_LABEL.request} heading="Listed so you can ask. Matched only when we have the right tutor.">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {REQUEST_SUBJECTS.map((s) => <SubjectCard key={s.key} s={s} />)}
        </div>
        <p className="mt-6 text-sm text-ink-muted max-w-2xl">
          The rule is simple: if we do not have a tutor who has passed our subject test in what you need, we tell you on the call and do not take the booking. We would rather send you elsewhere than send the wrong tutor.
        </p>
      </Section>

      <Section tone="surface" id="ib" eyebrow={SUBJECT_TIER_LABEL.ib} heading="IB Mathematics and sciences, SL and HL.">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {IB_SUBJECTS.map((s) => <SubjectCard key={s.key} s={s} />)}
        </div>
        <p className="mt-6 text-sm text-ink-muted">
          Online anywhere in Australia, in-home in Sydney. <Link href="/ib-tutoring" className="text-forest underline underline-offset-2">IB tutoring in detail</Link>.
        </p>
      </Section>

      <Section eyebrow="Pricing" heading="One rate card for every subject.">
        <div className="grid lg:grid-cols-12 gap-8">
          <div className="lg:col-span-7"><RateTable /></div>
          <div className="lg:col-span-5 text-sm text-ink-muted leading-relaxed">
            <p className="mb-4">The price depends on the level, not the subject. Years 7 to 10 is one band, the HSC courses another, and Extension 2 and the IB a third. University maths and physics online by arrangement.</p>
            <p><Link href="/pricing" className="text-forest underline underline-offset-2">Everything included, prepaid blocks, and the cancellation policy →</Link></p>
          </div>
        </div>
      </Section>

      <FinalBand />
    </AgencyPage>
  );
}
