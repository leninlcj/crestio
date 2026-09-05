import Link from 'next/link';
import { AGENCY } from '../../lib/agency';

type Props = { shipVelocity?: number }; // kept for call-site compatibility; unused

export default function MarketingFooter(_props: Props = {}) {
  return (
    <footer className="border-t border-rule bg-cream">
      <div className="px-6 md:px-12 pt-10 md:pt-12 pb-6 max-w-6xl mx-auto">
        <div className="grid grid-cols-2 md:grid-cols-6 gap-8 md:gap-10">
          <div className="col-span-2 md:col-span-3">
            <Link href="/" className="font-display text-2xl tracking-tightest inline-block mb-3">
              crest<span className="italic text-forest">io</span>
              <span className="text-sm font-sans tracking-normal text-ink-muted ml-2 align-middle">Tutoring</span>
            </Link>
            <p className="text-sm text-ink-muted leading-relaxed max-w-sm mb-4">
              Carefully matched one-on-one maths and physics tutoring. Sydney in-home and online across Australia.
            </p>
            <a href={`mailto:${AGENCY.email}`} className="text-sm text-forest hover:underline underline-offset-2">{AGENCY.email}</a>
          </div>

          <FooterColumn title="Explore" links={[
            { label: 'How it works', href: '/how-it-works' },
            { label: 'Maths tutoring', href: '/maths-tutoring' },
            { label: 'Physics tutoring', href: '/physics-tutoring' },
            { label: 'Where we tutor', href: '/tutoring' },
            { label: 'Pricing', href: '/pricing' },
            { label: 'FAQ', href: '/faq' },
            { label: 'En español', href: '/es' },
          ]} />

          <FooterColumn title="Get started" links={[
            { label: 'Book a consultation', href: '/enquire' },
            { label: 'Become a tutor', href: '/tutors' },
            { label: 'Apply to tutor', href: '/tutors/apply' },
            { label: 'Tutor agreement', href: '/tutors/agreement' },
            { label: 'Tutor and parent sign in', href: '/auth/signin' },
          ]} />

          <FooterColumn title="Company" links={[
            { label: 'About', href: '/about' },
            { label: 'Contact', href: '/contact' },
            { label: 'Child safe policy', href: '/child-safe' },
            { label: 'Report a concern', href: '/report' },
            { label: 'Privacy policy', href: '/privacy' },
            { label: 'Terms of service', href: '/terms' },
            { label: 'Cookies', href: '/cookies' },
          ]} />
        </div>

        <div className="mt-12 pt-8 border-t border-rule flex flex-col md:flex-row items-start md:items-center justify-between gap-3 text-2xs text-ink-soft">
          <div className="uppercase tracking-widest">© {new Date().getFullYear()} {AGENCY.name} · Sydney{AGENCY.abn ? ` · ABN ${AGENCY.abn}` : ''}</div>
          <div>Serving Sydney in-home and online across Australia.</div>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({ title, links }: { title: string; links: { label: string; href: string }[] }) {
  return (
    <div>
      <div className="text-2xs uppercase tracking-widest text-ink-soft mb-3">{title}</div>
      <ul className="space-y-2">
        {links.map((l) => (
          <li key={l.href}>
            <Link href={l.href} className="text-sm text-ink-muted hover:text-ink transition-colors">{l.label}</Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
