import Link from 'next/link';
import { AgencyPage, Section, CtaRow } from '../components/agency/AgencyPage';
import { FinalBand } from '../components/agency/blocks';
import { AGENCY } from '../lib/agency';
import { agencyOrganizationSchema, breadcrumb } from '../lib/agencySchema';

export default function About() {
  return (
    <AgencyPage
      title="About"
      description="Crestio Tutoring is run by Lenin Joaquin, a Sydney maths and physics tutor and engineering student. Small on purpose: hand-matched tutors, one person who answers, no fabricated reviews."
      path="/about"
      ogTitle="Small on purpose."
      ogSubtitle="Run by a tutor, from Sydney. One person who answers."
      jsonLd={[agencyOrganizationSchema(), breadcrumb([{ name: 'Home', url: '/' }, { name: 'About', url: '/about' }])]}
    >
      <section className="px-6 md:px-12 pt-14 md:pt-20 pb-10 max-w-6xl mx-auto">
        <div className="max-w-2xl">
          <div className="text-2xs uppercase tracking-widest text-ink-soft mb-4">About Crestio</div>
          <h1 className="font-display text-4xl md:text-6xl tracking-tighter text-ink text-balance leading-[1.05] mb-5">Small on purpose.</h1>
          <p className="text-base md:text-lg text-ink-muted leading-relaxed">
            Crestio Tutoring is run by {AGENCY.founder.name}, a maths and physics tutor in Sydney's south and an electrical engineering student. It exists because of what he saw from the inside of bigger agencies: tutors allocated from a list, rotated mid-term, and paid so little that the good ones left.
          </p>
        </div>
      </section>

      <Section tone="surface" eyebrow="The founder" heading="Built by a tutor who still tutors.">
        <div className="grid lg:grid-cols-12 gap-8 lg:gap-12">
          <div className="lg:col-span-7 space-y-4 text-sm md:text-base text-ink-muted leading-relaxed">
            <p>
              Lenin has tutored high-school maths and physics across Sydney, first with a national agency and then through his own practice, Ace Tutors Australia. He is studying Electrical Engineering (Honours) at Macquarie University, which means the maths and physics he teaches are the maths and physics he uses.
            </p>
            <p>
              He also wrote the software Crestio runs on: the scheduling, the parent notes, the invoicing and the payments. It was built for tutors first, so the admin gets out of the way of the teaching.
            </p>
            <p>
              Every enquiry, every match and every problem goes to him. That is a deliberate limit on how big Crestio can get, and it is the point.
            </p>
          </div>
          <div className="lg:col-span-5">
            <div className="rounded-md border border-rule bg-cream p-6">
              <div className="text-2xs uppercase tracking-widest text-ink-soft mb-4">What we will not do</div>
              <ul className="space-y-3 text-sm text-ink">
                <li>Invent reviews or numbers. The reviews on this site will be real or absent.</li>
                <li>Allocate a tutor from a list without having interviewed them.</li>
                <li>Rotate your tutor mid-term to fill a gap elsewhere.</li>
                <li>Charge a joining fee, lock you in, or charge your card without your say-so.</li>
                <li>Send a tutor to a child without a verified Working With Children Check.</li>
              </ul>
            </div>
          </div>
        </div>
      </Section>

      <Section eyebrow="Where we work" heading="Sydney in-home. Online anywhere in Australia.">
        <div className="grid md:grid-cols-2 gap-8">
          <p className="text-sm md:text-base text-ink-muted leading-relaxed">
            In-home lessons run across Sydney, with {AGENCY.serviceArea.inHomeFocus} best covered because that is where Crestio is based. Online lessons run anywhere in Australia over video with a shared whiteboard: the same tutor, the same plan, the same written note after every lesson.
          </p>
          <div>
            <CtaRow />
            <p className="mt-4 text-sm text-ink-muted">See the <Link href="/tutoring" className="text-forest underline underline-offset-2">suburbs we cover</Link>. Questions first? <Link href="/contact" className="text-forest underline underline-offset-2">Contact us</Link> or read the <Link href="/faq" className="text-forest underline underline-offset-2">FAQ</Link>.</p>
          </div>
        </div>
      </Section>

      <FinalBand />
    </AgencyPage>
  );
}
