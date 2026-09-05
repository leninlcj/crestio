import Link from 'next/link';
import { useRouter } from 'next/router';
import { AgencyPage } from '../components/agency/AgencyPage';
import { EnquiryForm } from '../components/agency/EnquiryForm';
import { AGENCY, SUBJECT_KEYS, YEAR_LEVELS, type SubjectKey } from '../lib/agency';
import { breadcrumb } from '../lib/agencySchema';

export default function Enquire() {
  const router = useRouter();
  const year = typeof router.query.year === 'string' && (YEAR_LEVELS as readonly string[]).includes(router.query.year) ? router.query.year : undefined;
  const subjectParam = typeof router.query.subject === 'string' ? router.query.subject : undefined;
  const subjects = subjectParam && (SUBJECT_KEYS as string[]).includes(subjectParam) ? [subjectParam as SubjectKey] : undefined;
  const modeParam = typeof router.query.mode === 'string' ? router.query.mode : undefined;
  const mode = modeParam === 'online' || modeParam === 'in_home' || modeParam === 'either' ? modeParam : undefined;
  const suburb = typeof router.query.suburb === 'string' ? router.query.suburb.slice(0, 80) : undefined;

  return (
    <AgencyPage
      title="Book a free consultation"
      description="Tell us what your child needs and we will reply within a day with a suggested maths or physics tutor. No charge to enquire, no lock-in."
      path="/enquire"
      ogTitle="Book a free consultation."
      ogSubtitle="Tell us what your child needs. A reply within a day, from the founder."
      jsonLd={[breadcrumb([{ name: 'Home', url: '/' }, { name: 'Enquire', url: '/enquire' }])]}
    >
      <section className="px-6 md:px-12 pt-12 md:pt-16 pb-16 md:pb-24 max-w-5xl mx-auto">
        <div className="grid lg:grid-cols-12 gap-10 lg:gap-14">
          <div className="lg:col-span-4">
            <div className="text-2xs uppercase tracking-widest text-ink-soft mb-3">Get matched</div>
            <h1 className="font-display text-4xl md:text-5xl tracking-tighter text-ink text-balance leading-[1.05] mb-4">Book a free consultation.</h1>
            <p className="text-base text-ink-muted leading-relaxed mb-6">
              A quick, no-obligation chat about what your child needs. Then we find the right tutor. There is no charge to enquire and no lock-in.
            </p>
            <dl className="space-y-4 text-sm">
              <div>
                <dt className="font-medium text-ink">You will hear back within a day</dt>
                <dd className="text-ink-muted">From {AGENCY.founder.firstName}, the founder, not a call centre.</dd>
              </div>
              <div>
                <dt className="font-medium text-ink">¿Prefieres español?</dt>
                <dd className="text-ink-muted"><Link href="/es" className="text-forest underline underline-offset-2">Consulta en español</Link>, con respuesta en español.</dd>
              </div>
              <div>
                <dt className="font-medium text-ink">Prefer to email?</dt>
                <dd className="text-ink-muted">Reach us at <a className="text-forest underline underline-offset-2" href={`mailto:${AGENCY.email}`}>{AGENCY.email}</a>.</dd>
              </div>
            </dl>
          </div>
          <div className="lg:col-span-8">
            {router.isReady && <EnquiryForm key={`${year ?? ''}-${subjectParam ?? ''}-${mode ?? ''}-${suburb ?? ''}`} initialYear={year} initialSubjects={subjects} initialMode={mode} initialSuburb={suburb} />}
          </div>
        </div>
      </section>
    </AgencyPage>
  );
}
