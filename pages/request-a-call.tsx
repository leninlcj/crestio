import Link from 'next/link';
import { useRouter } from 'next/router';
import { AgencyPage } from '../components/agency/AgencyPage';
import { RequestCallForm } from '../components/agency/RequestCallForm';
import { AGENCY, SUBJECT_KEYS, YEAR_LEVELS, type SubjectKey } from '../lib/agency';
import { classByKey } from '../lib/classes';
import { breadcrumb } from '../lib/agencySchema';

// The site's primary action. /request-a-call?year=Year%2011&subject=physics
// pre-fills the form; /request-a-call?class=y12_physics registers interest in
// a group class.

export default function RequestACall() {
  const router = useRouter();
  const year = typeof router.query.year === 'string' && (YEAR_LEVELS as readonly string[]).includes(router.query.year) ? router.query.year : undefined;
  const subjectParam = typeof router.query.subject === 'string' ? router.query.subject : null;
  const subjects = subjectParam && (SUBJECT_KEYS as string[]).includes(subjectParam) ? [subjectParam as SubjectKey] : undefined;
  const groupClass = classByKey(typeof router.query.class === 'string' ? router.query.class : null);

  return (
    <AgencyPage
      title="Request a call"
      description={`Leave your number and ${AGENCY.founder.firstName} calls you back, usually within two hours, always within one business day. Ten minutes on the phone to match the right tutor. No charge, no lock-in.`}
      path="/request-a-call"
      ogTitle="Leave your number. Lenin calls you back."
      ogSubtitle="Usually within two hours, always within one business day."
      jsonLd={[breadcrumb([{ name: 'Home', url: '/' }, { name: 'Request a call', url: '/request-a-call' }])]}
    >
      <section className="px-6 md:px-12 pt-12 md:pt-16 pb-16 md:pb-24 max-w-5xl mx-auto">
        <div className="grid lg:grid-cols-12 gap-10 lg:gap-14">
          <div className="lg:col-span-4">
            <div className="text-2xs uppercase tracking-widest text-ink-soft mb-3">{groupClass ? 'Register interest' : 'Talk to the founder'}</div>
            <h1 className="font-display text-4xl md:text-5xl tracking-tighter text-ink text-balance leading-[1.05] mb-4">
              {groupClass ? groupClass.title : 'One call gets the match right.'}
            </h1>
            <p className="text-base text-ink-muted leading-relaxed mb-6">
              {groupClass
                ? `${groupClass.term}. ${groupClass.when} Leave your number and ${AGENCY.founder.firstName} will call to confirm the details before anything is charged.`
                : `${AGENCY.callBack.promise} The call takes about ten minutes: what your child needs, which days suit, online or at home. Then ${AGENCY.founder.firstName} hand-picks the tutor.`}
            </p>
            <dl className="space-y-4 text-sm">
              <div>
                <dt className="font-medium text-ink">If we miss each other</dt>
                <dd className="text-ink-muted">You get a message saying we tried, and another call within one business day. Reply with a time that suits and we call then.</dd>
              </div>
              <div>
                <dt className="font-medium text-ink">What it costs</dt>
                <dd className="text-ink-muted">Nothing to ask. Lesson rates are on the <Link href="/pricing" className="text-forest underline underline-offset-2">pricing page</Link>; the first lesson is guaranteed.</dd>
              </div>
              <div>
                <dt className="font-medium text-ink">Prefer email?</dt>
                <dd className="text-ink-muted"><Link href="/enquire" className="text-forest underline underline-offset-2">Send the full enquiry</Link> and you get a written reply within a day. Or email <a className="text-forest underline underline-offset-2" href={`mailto:${AGENCY.email}`}>{AGENCY.email}</a>.</dd>
              </div>
              {AGENCY.phone && AGENCY.phoneDisplay && (
                <div>
                  <dt className="font-medium text-ink">Or call us</dt>
                  <dd className="text-ink-muted"><a className="text-forest underline underline-offset-2 num tabular" href={`tel:${AGENCY.phone}`}>{AGENCY.phoneDisplay}</a>, {AGENCY.callBack.hoursFrom} to {AGENCY.callBack.hoursTo}.</dd>
                </div>
              )}
            </dl>
          </div>
          <div className="lg:col-span-8">
            <RequestCallForm key={`${groupClass?.key ?? ''}|${year ?? ''}|${subjectParam ?? ''}`} initialYear={year} initialSubjects={subjects} classKey={groupClass?.key} />
          </div>
        </div>
      </section>
    </AgencyPage>
  );
}
