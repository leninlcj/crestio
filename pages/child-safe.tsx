import Link from 'next/link';
import { AgencyPage } from '../components/agency/AgencyPage';
import { LegalDocBody } from '../components/agency/LegalDoc';
import { CHILD_SAFE_POLICY } from '../lib/agencyLegal';
import { breadcrumb } from '../lib/agencySchema';

export default function ChildSafePage() {
  return (
    <AgencyPage
      title="Child safe policy"
      description="How Crestio Tutoring keeps students safe: interviewed and WWCC-verified tutors, parent-present in-home lessons, no private contact, and a clear way to raise a concern."
      path="/child-safe"
      jsonLd={[breadcrumb([{ name: 'Home', url: '/' }, { name: 'Child safe policy', url: '/child-safe' }])]}
    >
      <article className="px-6 md:px-12 pt-14 md:pt-20 pb-16 md:pb-24 max-w-3xl mx-auto">
        <div className="text-2xs uppercase tracking-widest text-ink-soft mb-3">Safety</div>
        <h1 className="font-display text-4xl md:text-5xl tracking-tighter text-ink text-balance leading-[1.05] mb-4">Child safe policy.</h1>
        <div className="rounded-md border border-rule bg-surface p-6 md:p-8">
          <LegalDocBody doc={CHILD_SAFE_POLICY} />
        </div>
        <p className="mt-8 text-sm text-ink-muted">
          Something to report? Use the <Link href="/report" className="text-forest underline underline-offset-2">report form</Link> or email us. In an emergency call 000.
        </p>
      </article>
    </AgencyPage>
  );
}
