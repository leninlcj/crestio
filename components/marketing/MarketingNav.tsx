import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useIsSignedIn } from '../../lib/useIsSignedIn';

// Public site navigation for Crestio Tutoring. Signed-in tutors/parents get
// a "Go to app" link instead of "Sign in".

const LINKS: Array<{ href: string; label: string }> = [
  { href: '/how-it-works', label: 'How it works' },
  { href: '/maths-tutoring', label: 'Maths' },
  { href: '/physics-tutoring', label: 'Physics' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/tutors', label: 'For tutors' },
  { href: '/faq', label: 'FAQ' },
];

export default function MarketingNav() {
  const router = useRouter();
  const signedIn = useIsSignedIn();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const handler = () => setMobileOpen(false);
    router.events.on('routeChangeStart', handler);
    return () => router.events.off('routeChangeStart', handler);
  }, [router.events]);

  const isActive = (href: string) => router.pathname === href;

  return (
    <header
      className={[
        'sticky top-0 z-40 transition-colors duration-200',
        scrolled ? 'bg-cream/85 backdrop-blur-md border-b border-rule' : 'bg-cream border-b border-transparent',
      ].join(' ')}
    >
      <nav className="px-6 md:px-12 h-16 flex items-center justify-between" aria-label="Primary">
        <Link href="/" className="font-display text-2xl tracking-tightest shrink-0" aria-label="Crestio Tutoring home">
          crest<span className="italic text-forest">io</span>
          <span className="hidden sm:inline text-sm font-sans tracking-normal text-ink-muted ml-2 align-middle">Tutoring</span>
        </Link>

        <div className="hidden lg:flex items-center gap-6 absolute left-1/2 -translate-x-1/2">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`text-sm transition-colors ${isActive(l.href) ? 'text-ink' : 'text-ink-muted hover:text-ink'}`}
              aria-current={isActive(l.href) ? 'page' : undefined}
            >
              {l.label}
            </Link>
          ))}
        </div>

        <div className="hidden lg:flex items-center gap-4 shrink-0">
          {signedIn ? (
            <Link href="/app" className="text-sm text-ink-muted hover:text-ink transition-colors">Go to app</Link>
          ) : (
            <Link href="/auth/signin" className="text-sm text-ink-muted hover:text-ink transition-colors">Sign in</Link>
          )}
          <Link href="/enquire" className="btn-primary text-xs px-4">Book a free consultation</Link>
        </div>

        <button
          type="button"
          className="lg:hidden p-2 -mr-2 text-ink"
          aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen((v) => !v)}
        >
          {mobileOpen ? (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"><path d="M6 6l12 12M6 18L18 6" /></svg>
          ) : (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
          )}
        </button>
      </nav>

      {mobileOpen && (
        <div className="lg:hidden fixed inset-x-0 top-16 bottom-0 z-50 bg-cream border-t border-rule overflow-y-auto animate-fade-in">
          <div className="px-6 py-6 space-y-6">
            <div className="flex flex-col">
              {LINKS.map((l) => (
                <Link key={l.href} href={l.href} className="text-base text-ink py-2 block border-b border-rule last:border-b-0">{l.label}</Link>
              ))}
            </div>
            <div className="pt-2 space-y-3">
              <Link href="/enquire" className="btn-primary w-full text-base py-3 block text-center">Book a free consultation</Link>
              <Link href="/tutors/apply" className="btn-secondary w-full text-base py-3 block text-center">Apply to tutor</Link>
              {signedIn ? (
                <Link href="/app" className="text-base text-ink-muted py-1.5 block text-center">Go to app</Link>
              ) : (
                <Link href="/auth/signin" className="text-base text-ink-muted py-1.5 block text-center">Tutor or parent sign in</Link>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
