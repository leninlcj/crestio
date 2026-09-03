import { AgencyPage } from '../../components/agency/AgencyPage';
import { TutorApplicationForm } from '../../components/agency/TutorApplicationForm';
import { AGENCY } from '../../lib/agency';
import { breadcrumb } from '../../lib/agencySchema';

export default function ApplyToTutor() {
  return (
    <AgencyPage
      title="Apply to tutor"
      description="Apply to tutor maths or physics with Crestio Tutoring in Sydney or online. Five minutes. We read every application personally."
      path="/tutors/apply"
      ogTitle="Apply to tutor with Crestio."
      ogSubtitle="Maths and physics. Sydney and online. Five minutes."
      jsonLd={[breadcrumb([{ name: 'Home', url: '/' }, { name: 'For tutors', url: '/tutors' }, { name: 'Apply', url: '/tutors/apply' }])]}
    >
      <section className="px-6 md:px-12 pt-12 md:pt-16 pb-16 md:pb-24 max-w-3xl mx-auto">
        <div className="mb-8">
          <div className="text-2xs uppercase tracking-widest text-ink-soft mb-3">Apply to tutor</div>
          <h1 className="font-display text-4xl md:text-5xl tracking-tighter text-ink text-balance leading-[1.05] mb-4">We read every application personally.</h1>
          <p className="text-base text-ink-muted leading-relaxed">
            Five minutes. If your subjects and results are a match, {AGENCY.founder.firstName} will reply within a week with a time for a short video call.
          </p>
        </div>
        <TutorApplicationForm />
      </section>
    </AgencyPage>
  );
}
