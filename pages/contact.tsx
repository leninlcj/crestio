import Link from 'next/link';
import { AgencyPage } from '../components/agency/AgencyPage';
import { AGENCY } from '../lib/agency';
import { breadcrumb } from '../lib/agencySchema';

export default function Contact() {
  return (
    <AgencyPage
      title="Contact"
      description={`Leave your number for a call back, or email ${AGENCY.email}. Replies within a day, from the founder.`}
      path="/contact"
      ogTitle="Contact Crestio Tutoring."
      ogSubtitle="A reply within a day, from the founder."
      jsonLd={[breadcrumb([{ name: 'Home', url: '/' }, { name: 'Contact', url: '/contact' }])]}
    >
      <section className="px-6 md:px-12 pt-14 md:pt-20 pb-16 md:pb-24 max-w-5xl mx-auto">
        <div className="grid md:grid-cols-12 gap-10 md:gap-16">
          <div className="md:col-span-6">
            <div className="text-2xs uppercase tracking-widest text-ink-soft mb-3">Contact</div>
            <h1 className="font-display text-4xl md:text-5xl tracking-tighter text-ink text-balance leading-[1.05] mb-5">A real person answers.</h1>
            <p className="text-base text-ink-muted leading-relaxed mb-7">
              Every message goes to {AGENCY.founder.firstName}, the founder. Replies within {AGENCY.policies.replyWithinHours} hours, usually much sooner.
            </p>
            <dl className="space-y-5 text-sm">
              <div>
                <dt className="text-2xs uppercase tracking-widest text-ink-soft mb-1">Email</dt>
                <dd><a href={`mailto:${AGENCY.email}`} className="text-base text-forest underline underline-offset-2">{AGENCY.email}</a></dd>
              </div>
              <div>
                <dt className="text-2xs uppercase tracking-widest text-ink-soft mb-1">Where</dt>
                <dd className="text-ink">Sydney, based in the {AGENCY.serviceArea.homeSuburb} area. In-home across Sydney, online across Australia.</dd>
              </div>
              <div>
                <dt className="text-2xs uppercase tracking-widest text-ink-soft mb-1">Existing families and tutors</dt>
                <dd className="text-ink">Sign in to the app to message your tutor or see invoices: <Link href="/auth/signin" className="text-forest underline underline-offset-2">tutor sign in</Link> · <Link href="/parent/signin" className="text-forest underline underline-offset-2">parent sign in</Link>.</dd>
              </div>
            </dl>
          </div>
          <div className="md:col-span-6 space-y-4">
            <div className="rounded-md border border-rule bg-surface p-6">
              <h2 className="font-display text-xl tracking-tighter text-ink mb-2">Looking for a tutor?</h2>
              <p className="text-sm text-ink-muted leading-relaxed mb-4">The enquiry form asks the few things we need to match well: year level, subject, online or in-home, and how to reach you.</p>
              <Link href="/request-a-call" className="btn-primary px-6">Request a call</Link>
            </div>
            <div className="rounded-md border border-rule bg-surface p-6">
              <h2 className="font-display text-xl tracking-tighter text-ink mb-2">Want to tutor?</h2>
              <p className="text-sm text-ink-muted leading-relaxed mb-4">Maths or physics, Sydney or online. Five minutes on the form and {AGENCY.founder.firstName} reads it personally.</p>
              <Link href="/tutors/apply" className="btn-secondary px-6">Apply to tutor</Link>
            </div>
          </div>
        </div>
      </section>
    </AgencyPage>
  );
}
