import { AgencyPage } from '../components/agency/AgencyPage';
import { ReportForm } from '../components/agency/ReportForm';
import { AGENCY } from '../lib/agency';

export default function ReportPage() {
  return (
    <AgencyPage
      title="Report a concern"
      description="Raise a concern or complaint about a Crestio tutor or lesson. It goes directly to the founder and is answered within one business day."
      path="/report"
      noIndex
    >
      <section className="px-6 md:px-12 pt-12 md:pt-16 pb-16 md:pb-24 max-w-3xl mx-auto">
        <div className="text-2xs uppercase tracking-widest text-ink-soft mb-3">Safety and complaints</div>
        <h1 className="font-display text-4xl md:text-5xl tracking-tighter text-ink text-balance leading-[1.05] mb-4">Report a concern.</h1>
        <p className="text-base text-ink-muted leading-relaxed mb-3">Anything that worried you about a tutor, a lesson, or how we handled something. It goes straight to {AGENCY.founder.name} and is answered within one business day.</p>
        <p className="text-sm text-claret mb-8">If a child is in immediate danger, call 000 now. The NSW Child Protection Helpline is 132 111.</p>
        <ReportForm />
      </section>
    </AgencyPage>
  );
}
