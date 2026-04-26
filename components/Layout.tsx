import { ReactNode, useEffect, useState } from 'react';
import Link from 'next/link';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabase';
import { useOrganization } from '../lib/organizationContext';
import { useMembership } from '../lib/membershipContext';
import { useAssistantConversation } from '../lib/assistantConversation';
import { planAllowsFeature } from '../lib/billing';
import { cx } from '../lib/utils';
import AssistantPanel from './AssistantPanel';
import AssistantLauncher from './AssistantLauncher';
import SupportWidget from './SupportWidget';
import GlobalSearch from './GlobalSearch';
import NotificationBell from './notifications/NotificationBell';
import { TestAccountBanner, ExemptionOffPill } from './OwnerBanners';
import { isPlatformOwner } from '../lib/owner';
import LanguageSwitcherModal from './LanguageSwitcherModal';
import { useTranslation } from 'react-i18next';

interface Props {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
  // Sets the browser tab title. Defaults to `title` when omitted, then falls
  // back to "Crestio". Always suffixed with " · Crestio" except when the value
  // already contains "Crestio".
  pageTitle?: string;
}

type NavItem = { href: string; labelKey: string; match: (p: string) => boolean; requires?: 'multi_tutor' | 'households' };

const NAV_ITEMS: NavItem[] = [
  { href: '/app', labelKey: 'nav.overview', match: (p) => p === '/app' },
  { href: '/app/calendar', labelKey: 'nav.calendar', match: (p) => p.startsWith('/app/calendar') },
  { href: '/app/sessions', labelKey: 'nav.sessions', match: (p) => p.startsWith('/app/sessions') },
  { href: '/app/students', labelKey: 'nav.students', match: (p) => p.startsWith('/app/students') },
  { href: '/app/households', labelKey: 'nav.households', match: (p) => p.startsWith('/app/households'), requires: 'households' },
  { href: '/app/messages', labelKey: 'nav.messages', match: (p) => p.startsWith('/app/messages') },
  { href: '/app/lesson-plans', labelKey: 'nav.lesson_plans', match: (p) => p.startsWith('/app/lesson-plans') },
  // Files entry visible for everyone. On Solo, /app/files renders the
  // Team-upgrade prompt (existing behaviour); on Team, it shows the org file
  // index. The plan check below only hides the link, but tutors and Solo
  // owners still find the page via student detail — having a sidebar entry
  // is the discoverable path (P2-2.1).
  { href: '/app/files', labelKey: 'nav.files', match: (p) => p.startsWith('/app/files') },
  { href: '/app/invoices', labelKey: 'nav.invoices', match: (p) => p.startsWith('/app/invoices') },
  { href: '/app/tutors', labelKey: 'nav.tutors', match: (p) => p.startsWith('/app/tutors'), requires: 'multi_tutor' },
  { href: '/app/payouts', labelKey: 'nav.payouts', match: (p) => p.startsWith('/app/payouts'), requires: 'multi_tutor' },
];

export default function Layout({ children, title, subtitle, actions, pageTitle }: Props) {
  const { t } = useTranslation('common');
  const router = useRouter();
  const { organization } = useOrganization();
  const { membership } = useMembership();
  const isTutor = membership?.role === 'tutor';
  const isOwner = membership?.role === 'owner';
  const planTier = organization?.plan_tier ?? 'solo';

  const nav = NAV_ITEMS.filter((item) => {
    // Owner-only items (Tutors, Payouts) respect plan gating too.
    if (item.requires === 'multi_tutor') {
      if (!isOwner) return false;
      return planAllowsFeature(planTier, 'multi_tutor');
    }
    // Households nav entry: hidden on Solo plan.
    if (item.requires === 'households') {
      return planTier !== 'solo';
    }
    return true;
  });

  const businessName = organization?.name ?? 'Crestio';
  const [userEmail, setUserEmail] = useState('');
  const [accountOpen, setAccountOpen] = useState(false);
  const [languageOpen, setLanguageOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [messagesUnread, setMessagesUnread] = useState<{ total: number; hasUrgent: boolean }>({ total: 0, hasUrgent: false });

  useEffect(() => {
    let cancelled = false;
    async function fetchUnread() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) return;
        const res = await fetch('/api/messages/unread-count', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (!res.ok || cancelled) return;
        const p = await res.json();
        setMessagesUnread({ total: p.total ?? 0, hasUrgent: !!p.has_urgent });
      } catch { /* ignore */ }
    }
    fetchUnread();
    const onFocus = () => fetchUnread();
    window.addEventListener('focus', onFocus);
    const interval = setInterval(fetchUnread, 60_000);
    return () => {
      cancelled = true;
      window.removeEventListener('focus', onFocus);
      clearInterval(interval);
    };
  }, [router.pathname]);

  // Items that appear in the mobile "More" drawer. Plan- and role-aware.
  const moreNav = [
    { href: '/app/sessions', label: t('nav.sessions') },
    { href: '/app/messages', label: t('nav.messages') },
    { href: '/app/lesson-plans', label: t('nav.lesson_plans') },
    { href: '/app/invoices', label: t('nav.invoices') },
    ...(isOwner && planAllowsFeature(planTier, 'multi_tutor') ? [
      { href: '/app/tutors', label: t('nav.tutors') },
      { href: '/app/payouts', label: t('nav.payouts') },
    ] : []),
    { href: '/app/settings/account', label: t('nav.settings') },
  ];
  const { isOpen: assistantOpen, openPanel: openAssistant } = useAssistantConversation();

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      setUserEmail(session.user.email ?? '');
    })();
  }, []);

  useEffect(() => {
    const handle = () => setAccountOpen(false);
    router.events.on('routeChangeStart', handle);
    return () => router.events.off('routeChangeStart', handle);
  }, [router.events]);

  async function signOut() {
    await supabase.auth.signOut();
    router.push('/');
  }

  const avatar = (userEmail[0] ?? 'U').toUpperCase();

  const browserTitleBase = pageTitle ?? title;
  const browserTitle = browserTitleBase
    ? (browserTitleBase.includes('Crestio') ? browserTitleBase : `${browserTitleBase} · Crestio`)
    : 'Crestio';

  return (
    <div
      data-assistant-open={assistantOpen ? 'true' : 'false'}
      className="min-h-screen bg-cream flex flex-col"
    >
      <Head>
        <title>{browserTitle}</title>
      </Head>
      <TestAccountBanner />
      <div className="flex flex-1 min-h-0">
      {/* ================= DESKTOP SIDEBAR (nav only) ================= */}
      <aside className="w-60 shrink-0 border-r border-rule bg-cream hidden md:flex flex-col min-h-screen sticky top-0">
        <Link href="/app" className="block px-6 py-6 border-b border-rule">
          <div className="font-display text-2xl tracking-tightest text-ink leading-none">
            crest<span className="italic text-forest">io</span>
          </div>
          {businessName.toLowerCase() !== 'crestio' && (
            <div className="text-2xs uppercase tracking-widest text-ink-soft mt-1.5 truncate">
              {businessName}
            </div>
          )}
        </Link>

        <div className="px-3 pt-4 pb-3 border-b border-rule space-y-2">
          <button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent('crestio:open-search'))}
            className="w-full flex items-center justify-between px-3 py-2 rounded border border-rule bg-surface hover:bg-ruleSoft transition-colors text-left"
            aria-label={t('nav.search')}
          >
            <span className="text-sm text-ink-muted">{t('actions.search_placeholder')}</span>
            <span className="text-2xs text-ink-soft font-mono">⌘K</span>
          </button>
          <button
            type="button"
            onClick={openAssistant}
            className="w-full flex items-center justify-between px-3 py-2 rounded border border-rule bg-surface hover:bg-ruleSoft transition-colors text-left"
            aria-label={t('nav.assistant')}
          >
            <span className="text-sm text-ink">{t('nav.assistant')}</span>
            <span className="text-2xs text-ink-soft">AI</span>
          </button>
        </div>

        <nav className="px-3 py-4 space-y-0.5 flex-1">
          {nav.map((item) => {
            const active = item.match(router.pathname);
            const showBadge = item.href === '/app/messages' && messagesUnread.total > 0;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cx(
                  'group relative flex items-center justify-between pl-3.5 pr-3 py-2 text-sm rounded transition-all duration-200 ease-out',
                  active
                    ? 'bg-surface text-ink font-medium shadow-card'
                    : 'text-ink-muted hover:text-ink hover:bg-ruleSoft/70',
                )}
              >
                {/* Subtle left accent on the active link */}
                <span
                  aria-hidden="true"
                  className={cx(
                    'absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r bg-forest transition-opacity duration-200 ease-out',
                    active ? 'opacity-100' : 'opacity-0',
                  )}
                />
                <span>{t(item.labelKey)}</span>
                {showBadge && (
                  <span
                    className={cx(
                      'inline-flex items-center justify-center text-2xs font-medium rounded-full px-1.5 min-w-[18px] h-[18px]',
                      messagesUnread.hasUrgent ? 'bg-claret text-cream' : 'bg-forest text-cream',
                    )}
                    aria-label={`${messagesUnread.total} unread messages`}
                  >
                    {messagesUnread.total > 99 ? '99+' : messagesUnread.total}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* ================= DESKTOP TOP BAR ================= */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="hidden md:flex sticky top-0 z-20 bg-cream border-b border-rule px-6 h-14 items-center justify-end gap-2">
          <ExemptionOffPill />
          <NotificationBell mode="tutor" />
          <AccountDropdown
            email={userEmail}
            avatar={avatar}
            open={accountOpen}
            setOpen={setAccountOpen}
            isOwner={isOwner}
            isPlatformOwner={isPlatformOwner(userEmail)}
            onOpenLanguage={() => { setAccountOpen(false); setLanguageOpen(true); }}
            signOut={signOut}
          />
        </header>

        {/* ================= MOBILE TOP BAR ================= */}
        <div className="md:hidden sticky top-0 z-30 bg-cream border-b border-rule pt-safe">
          <div className="px-5 h-14 flex items-center justify-between">
            <Link href="/app" className="font-display text-xl tracking-tightest">
              crest<span className="italic text-forest">io</span>
            </Link>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => window.dispatchEvent(new CustomEvent('crestio:open-search'))}
                className="h-11 w-11 grid place-items-center rounded border border-rule text-ink"
                aria-label="Search"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
                  <circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>
                </svg>
              </button>
              <NotificationBell mode="tutor" />
              <AccountDropdown
                email={userEmail}
                avatar={avatar}
                open={accountOpen}
                setOpen={setAccountOpen}
                isOwner={isOwner}
                isPlatformOwner={isPlatformOwner(userEmail)}
                onOpenLanguage={() => { setAccountOpen(false); setLanguageOpen(true); }}
                signOut={signOut}
              />
            </div>
          </div>
        </div>

        {/* ================= MAIN ================= */}
        <main className="flex-1 min-w-0 pb-20 md:pb-0">
          {title && (
            <header className="px-5 md:px-12 pt-8 md:pt-10 pb-6 md:pb-8 border-b border-rule bg-cream">
              <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
                <div>
                  {subtitle && (
                    <div className="text-2xs uppercase tracking-widest text-ink-muted mb-2">
                      {subtitle}
                    </div>
                  )}
                  <h1 className="font-display text-3xl md:text-5xl tracking-tightest text-ink leading-none">
                    {title}
                  </h1>
                </div>
                {actions && <div className="hidden md:flex items-center gap-2">{actions}</div>}
              </div>
              {actions && <div className="md:hidden flex items-center gap-2 mt-4 [&>*]:!px-3 [&>*]:!py-1.5 [&>*]:!text-xs">{actions}</div>}
            </header>
          )}

          <div className="px-5 md:px-12 py-6 md:py-10">{children}</div>
        </main>

        {/* ================= MOBILE BOTTOM TABS (5 items) ================= */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-cream border-t border-rule pb-safe">
          <div className="grid grid-cols-5">
            <Link href="/app" className={tabCx(router.pathname === '/app')}>
              <IconHome />
              <span className="text-2xs font-medium">Home</span>
            </Link>
            <Link href="/app/calendar" className={tabCx(router.pathname.startsWith('/app/calendar'))}>
              <IconCalendar />
              <span className="text-2xs font-medium">Calendar</span>
            </Link>
            <Link href="/app/students" className={tabCx(router.pathname.startsWith('/app/students'))}>
              <IconUsers />
              <span className="text-2xs font-medium">Students</span>
            </Link>
            <button type="button" onClick={openAssistant} className={tabCx(false)}>
              <IconSparkle />
              <span className="text-2xs font-medium">Assistant</span>
            </button>
            <button type="button" onClick={() => setMoreOpen(true)} className={cx(tabCx(moreOpen), 'relative')}>
              <IconMore />
              <span className="text-2xs font-medium">More</span>
              {messagesUnread.total > 0 && (
                <span
                  className={cx(
                    'absolute top-1 right-1/4 inline-block w-2 h-2 rounded-full',
                    messagesUnread.hasUrgent ? 'bg-claret' : 'bg-forest',
                  )}
                  aria-label="Unread messages"
                />
              )}
            </button>
          </div>
        </nav>

        {/* ================= MOBILE MORE DRAWER ================= */}
        {moreOpen && (
          <div className="md:hidden fixed inset-0 z-40 bg-ink/40" onClick={() => setMoreOpen(false)}>
            <div
              className="absolute bottom-0 left-0 right-0 bg-cream rounded-t-xl shadow-lift pb-safe"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="h-1 w-10 bg-rule rounded-full mx-auto my-3" />
              <div className="px-5 pb-4 divide-y divide-ruleSoft">
                {moreNav.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="flex items-center justify-between py-3 text-ink"
                    onClick={() => setMoreOpen(false)}
                  >
                    <span>{item.label}</span>
                    <span className="text-ink-soft">›</span>
                  </Link>
                ))}
                <button
                  onClick={() => { setMoreOpen(false); window.dispatchEvent(new CustomEvent('crestio:open-support')); }}
                  className="w-full flex items-center justify-between py-3 text-ink text-left"
                >
                  <span>Help &amp; support</span>
                  <span className="text-ink-soft">›</span>
                </button>
                <button
                  onClick={signOut}
                  className="w-full flex items-center justify-between py-3 text-claret text-left"
                >
                  <span>Sign out</span>
                  <span>›</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <AssistantPanel />
      <AssistantLauncher />
      <SupportWidget />
      <GlobalSearch />
      </div>
      <LanguageSwitcherModal open={languageOpen} onClose={() => setLanguageOpen(false)} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Account dropdown (top-right)
// ---------------------------------------------------------------------------

function AccountDropdown({
  email,
  avatar,
  open,
  setOpen,
  isOwner,
  isPlatformOwner,
  onOpenLanguage,
  signOut,
}: {
  email: string;
  avatar: string;
  open: boolean;
  setOpen: (v: boolean) => void;
  isOwner: boolean;
  isPlatformOwner: boolean;
  onOpenLanguage: () => void;
  signOut: () => void;
}) {
  const { t } = useTranslation('common');
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-ruleSoft transition-colors"
        aria-label="Account menu"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <div className="h-8 w-8 bg-forest text-cream rounded-full grid place-items-center text-xs font-medium font-mono">
          {avatar}
        </div>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden="true" />
          <div
            role="menu"
            className="absolute right-0 top-full mt-1 z-50 w-60 bg-surface border border-rule rounded shadow-lift py-1 animate-fade-in"
          >
            <div className="px-3 py-2 border-b border-rule">
              <div className="text-2xs uppercase tracking-widest text-ink-soft mb-0.5">{t('nav.signed_in_as')}</div>
              <div className="text-xs text-ink truncate">{email}</div>
            </div>
            <Link href="/app/settings/account" className="block px-3 py-2 text-sm text-ink hover:bg-ruleSoft" role="menuitem">
              {t('nav.settings')}
            </Link>
            <button
              type="button"
              onClick={onOpenLanguage}
              className="w-full text-left px-3 py-2 text-sm text-ink hover:bg-ruleSoft"
              role="menuitem"
            >
              {t('nav.language')}
            </button>
            {isOwner && (
              <Link href="/app/settings/billing" className="block px-3 py-2 text-sm text-ink hover:bg-ruleSoft" role="menuitem">
                {t('nav.billing')}
              </Link>
            )}
            {isPlatformOwner && (
              <div className="border-t border-rule mt-1 pt-1">
                <div className="px-3 pb-1 text-2xs uppercase tracking-widest text-ink-soft">{t('nav.owner_tools')}</div>
                <Link href="/app/owner/test-accounts" className="block px-3 py-2 text-sm text-ink hover:bg-ruleSoft" role="menuitem">
                  {t('nav.test_accounts')}
                </Link>
              </div>
            )}
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                window.dispatchEvent(new CustomEvent('crestio:open-support'));
              }}
              className="w-full text-left px-3 py-2 text-sm text-ink hover:bg-ruleSoft"
              role="menuitem"
            >
              {t('nav.help_support')}
            </button>
            <div className="border-t border-rule mt-1">
              <button
                onClick={signOut}
                className="w-full text-left px-3 py-2 text-sm text-claret hover:bg-claret/5"
                role="menuitem"
              >
                {t('nav.sign_out')}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function tabCx(active: boolean) {
  return cx(
    'flex flex-col items-center justify-center gap-1 py-2.5 transition-colors',
    active ? 'text-forest' : 'text-ink-muted active:bg-ruleSoft',
  );
}

function IconHome() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1h-5v-7h-6v7H4a1 1 0 0 1-1-1V9.5z"/>
    </svg>
  );
}
function IconClock() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>
    </svg>
  );
}
function IconUsers() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2"/>
      <circle cx="10" cy="7" r="4"/>
      <path d="M21 21v-2a4 4 0 0 0-3-3.87"/>
      <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  );
}
function IconInvoice() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 3h10l4 4v14H6z"/><path d="M8 10h8M8 14h8M8 18h4"/>
    </svg>
  );
}
function IconCalendar() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="16" rx="2"/>
      <path d="M3 10h18M8 3v4M16 3v4"/>
    </svg>
  );
}
function IconSparkle() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6"/>
    </svg>
  );
}
function IconMore() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>
    </svg>
  );
}
