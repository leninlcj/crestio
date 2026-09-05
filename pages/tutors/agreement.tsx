import Link from 'next/link';
import { AgencyPage } from '../../components/agency/AgencyPage';
import { LegalDocBody } from '../../components/agency/LegalDoc';
import { TUTOR_AGREEMENT, CODE_OF_CONDUCT } from '../../lib/agencyLegal';
import { breadcrumb } from '../../lib/agencySchema';

export default function TutorAgreementPage() {
  return (
    <AgencyPage
      title="Tutor agreement and code of conduct"
      description="The agreement every Crestio tutor accepts: an independent tutor, introduced to families by Crestio, paid weekly, with clear safety rules."
      path="/tutors/agreement"
      jsonLd={[breadcrumb([{ name: 'Home', url: '/' }, { name: 'For tutors', url: '/tutors' }, { name: 'Tutor agreement', url: '/tutors/agreement' }])]}
    >
      <article className="px-6 md:px-12 pt-14 md:pt-20 pb-16 md:pb-24 max-w-3xl mx-auto">
        <div className="text-2xs uppercase tracking-widest text-ink-soft mb-3">For tutors</div>
        <h1 className="font-display text-4xl md:text-5xl tracking-tighter text-ink text-balance leading-[1.05] mb-4">What you agree to when you tutor with Crestio.</h1>
        <p className="text-base text-ink-muted leading-relaxed mb-10">
          Read it before you apply. You accept it in the app when you join; nothing is hidden in the onboarding. Questions: <Link href="/contact" className="text-forest underline underline-offset-2">contact us</Link>.
        </p>
        <div className="rounded-md border border-rule bg-surface p-6 md:p-8 mb-10">
          <h2 className="font-display text-2xl md:text-3xl tracking-tighter text-ink mb-4">{TUTOR_AGREEMENT.title}</h2>
          <LegalDocBody doc={TUTOR_AGREEMENT} />
        </div>
        <div id="code-of-conduct" className="rounded-md border border-rule bg-surface p-6 md:p-8">
          <h2 className="font-display text-2xl md:text-3xl tracking-tighter text-ink mb-4">{CODE_OF_CONDUCT.title}</h2>
          <LegalDocBody doc={CODE_OF_CONDUCT} />
        </div>
        <p className="mt-8 text-sm text-ink-muted">How this works day to day is in the <Link href="/tutors/handbook" className="text-forest underline underline-offset-2">tutor handbook</Link>. Ready? <Link href="/tutors/apply" className="text-forest underline underline-offset-2">Apply to tutor</Link>.</p>
      </article>
    </AgencyPage>
  );
}
