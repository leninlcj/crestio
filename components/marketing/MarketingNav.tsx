import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useTranslation } from 'react-i18next';
import { useIsSignedIn } from '../../lib/useIsSignedIn';

type NavLink = { href: string; label: string; description?: string };

export default function MarketingNav() {
  const { t } = useTranslation('marketing');
  const router = useRouter();
  const signedIn = useIsSignedIn();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openDropdown, setOpenDropdown] = useState<'tutors' | 'resources' | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const handler = () => {
      setMobileOpen(false);
      setOpenDropdown(null);
    };
    router.events.on('routeChangeStart', handler);
    return () => router.events.off('routeChangeStart', handler);
  }, [router.events]);

  function openMenu(key: 'tutors' | 'resources') {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setOpenDropdown(key);
  }
  function scheduleClose() {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpenDropdown(null), 150);
  }

  const tutorsLinks: NavLink[] = [
    { href: '/for/solo', label: t('nav.tutors_solo'), description: t('nav.tutors_solo_desc') },
    { href: '/for/small-practices', label: t('nav.tutors_practices'), description: t('nav.tutors_practices_desc') },
    { href: '/for/exam-prep', label: t('nav.tutors_exam'), description: t('nav.tutors_exam_desc') },
    { href: '/for/music-teachers', label: t('nav.tutors_music'), description: t('nav.tutors_music_desc') },
    { href: '/for/new-tutors', label: t('nav.tutors_new'), description: t('nav.tutors_new_desc') },
    { href: '/for/parents', label: t('nav.tutors_parents'), description: t('nav.tutors_parents_desc') },
  ];
  const resourcesLinks: NavLink[] = [
    { href: '/changelog', label: t('nav.resources_changelog'), description: t('nav.resources_changelog_desc') },
    { href: '/roadmap', label: t('nav.resources_roadmap'), description: t('nav.resources_roadmap_desc') },
    { href: '/founder', label: t('nav.resources_founder'), description: t('nav.resources_founder_desc') },
    { href: '/about', label: t('nav.resources_about'), description: t('nav.resources_about_desc') },
    { href: '/contact', label: t('nav.resources_contact'), description: t('nav.resources_contact_desc') },
  ];

  return (
    <header
      className={[
        'sticky top-0 z-40 transition-colors duration-200',
        scrolled
          ? 'bg-cream/85 backdrop-blur-md border-b border-rule'
          : 'bg-cream border-b border-transparent',
      ].join(' ')}
    >
      <nav className="px-6 md:px-12 h-16 flex items-center justify-between" aria-label={t('nav.primary_aria')}>
        <Link href="/" className="font-display text-2xl tracking-tightest shrink-0">
          crest<span className="italic text-forest">io</span>
        </Link>

        <div className="hidden lg:flex items-center gap-7 absolute left-1/2 -translate-x-1/2">
          <Link href="/#how" className="text-sm text-ink-muted hover:text-ink transition-colors">
            {t('nav.product')}
          </Link>
          <Link href="/pricing" className="text-sm text-ink-muted hover:text-ink transition-colors">
            {t('nav.pricing')}
          </Link>

          <DropdownTrigger
            label={t('nav.for_tutors')}
            open={openDropdown === 'tutors'}
            onEnter={() => openMenu('tutors')}
            onLeave={scheduleClose}
            links={tutorsLinks}
          />
          <DropdownTrigger
            label={t('nav.resources')}
            open={openDropdown === 'resources'}
            onEnter={() => openMenu('resources')}
            onLeave={scheduleClose}
            links={resourcesLinks}
          />

          {signedIn ? null : (
            <Link href="/auth/signin" className="text-sm text-ink-muted hover:text-ink transition-colors">
              {t('nav.sign_in')}
            </Link>
          )}
        </div>

        <div className="hidden lg:flex shrink-0">
          {signedIn ? (
            <Link href="/app" className="btn-primary text-xs px-4 py-2 min-h-[auto]">
              {t('nav.go_to_dashboard')}
            </Link>
          ) : (
            <Link href="/auth/signup" className="btn-primary text-xs px-4 py-2 min-h-[auto]">
              {t('nav.start_trial')}
            </Link>
          )}
        </div>

        <button
          type="button"
          className="lg:hidden p-2 -mr-2 text-ink"
          aria-label={mobileOpen ? t('nav.close_menu') : t('nav.open_menu')}
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen((v) => !v)}
        >
          {mobileOpen ? (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
              <path d="M6 6l12 12M6 18L18 6" />
            </svg>
          ) : (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          )}
        </button>
      </nav>

      {mobileOpen && (
        <div className="lg:hidden fixed inset-x-0 top-16 bottom-0 z-50 bg-cream border-t border-rule overflow-y-auto animate-fade-in">
          <div className="px-6 py-6 space-y-6">
            <MobileSection title={t('nav.product')}>
              <Link href="/#how" className="text-base text-ink py-1.5 block">{t('nav.product_how')}</Link>
              <Link href="/pricing" className="text-base text-ink py-1.5 block">{t('nav.pricing')}</Link>
            </MobileSection>
            <MobileSection title={t('nav.for_tutors')}>
              {tutorsLinks.map((l) => (
                <Link key={l.href} href={l.href} className="text-base text-ink py-1.5 block">{l.label}</Link>
              ))}
            </MobileSection>
            <MobileSection title={t('nav.resources')}>
              {resourcesLinks.map((l) => (
                <Link key={l.href} href={l.href} className="text-base text-ink py-1.5 block">{l.label}</Link>
              ))}
            </MobileSection>
            <div className="pt-4 border-t border-rule space-y-3">
              {signedIn ? (
                <Link href="/app" className="btn-primary w-full text-base py-3 block text-center">
                  {t('nav.go_to_dashboard')}
                </Link>
              ) : (
                <>
                  <Link href="/auth/signin" className="text-base text-ink-muted py-1.5 block">
                    {t('nav.sign_in')}
                  </Link>
                  <Link href="/auth/signup" className="btn-primary w-full text-base py-3 block text-center">
                    {t('nav.start_trial')}
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}

function MobileSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-2xs uppercase tracking-widest text-ink-soft mb-2.5">{title}</div>
      <div className="flex flex-col">{children}</div>
    </div>
  );
}

function DropdownTrigger({
  label,
  open,
  onEnter,
  onLeave,
  links,
}: {
  label: string;
  open: boolean;
  onEnter: () => void;
  onLeave: () => void;
  links: NavLink[];
}) {
  return (
    <div className="relative" onMouseEnter={onEnter} onMouseLeave={onLeave}>
      <button
        type="button"
        className="text-sm text-ink-muted hover:text-ink transition-colors flex items-center gap-1"
        aria-expanded={open}
        aria-haspopup="true"
      >
        {label}
        <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform duration-150 ${open ? 'rotate-180' : ''}`}>
          <path d="M3 4.5L6 7.5L9 4.5" />
        </svg>
      </button>
      {open && (
        <div
          className="absolute top-full left-1/2 -translate-x-1/2 pt-3"
          role="menu"
        >
          <div className="w-72 rounded-md bg-surface border border-rule shadow-lift p-1 animate-fade-in">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                role="menuitem"
                className="block px-3 py-2.5 rounded hover:bg-ruleSoft transition-colors"
              >
                <div className="text-sm font-medium text-ink">{l.label}</div>
                {l.description && (
                  <div className="text-2xs text-ink-soft mt-0.5">{l.description}</div>
                )}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
