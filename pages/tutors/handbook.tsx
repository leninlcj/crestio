import Link from 'next/link';
import { AgencyPage } from '../../components/agency/AgencyPage';
import { LegalDocBody } from '../../components/agency/LegalDoc';
import { TUTOR_HANDBOOK } from '../../lib/tutorHandbook';
import { breadcrumb } from '../../lib/agencySchema';

// The handbook is public on purpose: applicants see how the work runs before
// they apply, and parents can see what their tutor has agreed to do.

export default function TutorHandbookPage() {
  return (
    <AgencyPage
      title="Tutor handbook"
      description="How tutoring with Crestio works day to day: the checks before your first student, how a lesson runs, the lesson note, cancellations, weekly pay, safety rules, and what to do when something goes wrong."
      path="/tutors/handbook"
      ogTitle="Tutor handbook."
      ogSubtitle="Before your first student, the first lesson, every lesson, the note, pay, safety."
      jsonLd={[breadcrumb([{ name: 'Home', url: '/' }, { name: 'For tutors', url: '/tutors' }, { name: 'Tutor handbook', url: '/tutors/handbook' }])]}
    >
      <article className="px-6 md:px-12 pt-14 md:pt-20 pb-16 md:pb-24 max-w-3xl mx-auto">
        <div className="text-2xs uppercase tracking-widest text-ink-soft mb-3">{TUTOR_HANDBOOK.kicker}</div>
        <h1 className="font-display text-4xl md:text-5xl tracking-tighter text-ink text-balance leading-[1.05] mb-4">How tutoring with Crestio works, day to day.</h1>
        <p className="text-base text-ink-muted leading-relaxed mb-6">
          Ten short sections. The <Link href="/tutors/agreement" className="text-forest underline underline-offset-2">tutor agreement and code of conduct</Link> are the rules; this is how they work in practice. Print it if you like: the page prints cleanly.
        </p>
        <nav aria-label="Handbook sections" className="rounded-md border border-rule bg-surface p-5 mb-10 print-hide">
          <div className="text-2xs uppercase tracking-widest text-ink-soft mb-3">In this handbook</div>
          <ol className="grid sm:grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
            {TUTOR_HANDBOOK.sections.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="text-forest underline underline-offset-2">{s.heading}</a>
              </li>
            ))}
          </ol>
        </nav>
        <div className="rounded-md border border-rule bg-surface p-6 md:p-8">
          <LegalDocBody doc={TUTOR_HANDBOOK} />
        </div>
        <p className="mt-8 text-sm text-ink-muted">
          Not a tutor yet? <Link href="/tutors" className="text-forest underline underline-offset-2">How selection works</Link>, or <Link href="/tutors/apply" className="text-forest underline underline-offset-2">apply</Link>.
        </p>
      </article>
    </AgencyPage>
  );
}
