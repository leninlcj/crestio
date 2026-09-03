import { ReactNode, useEffect, useMemo, useState } from 'react';
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
import CommandPalette from './CommandPalette';
import { NotificationCenter as NotificationBell } from './design/NotificationCenter';
import { TestAccountBanner, ExemptionOffPill } from './OwnerBanners';
import { isPlatformOwner } from '../lib/owner';
import LanguageSwitcherModal from './LanguageSwitcherModal';
import { useTranslation } from 'react-i18next';
import { Breadcrumb, type Crumb } from './design/Breadcrumb';
import { TabStrip, type Tab } from './design/TabStrip';
import { FloatingActionButton } from './design/FloatingActionButton';
import { Avatar } from './design/Avatar';
import WhatsNewSection from './WhatsNewSection';
import { NewItemMenu } from './quickcreate/NewItemMenu';

// Stub changelog — bumped when something user-visible ships. Used by the
// "what's new" beacon on the avatar.
const LATEST_CHANGELOG_TAG = '2026-05-04-ph7d';
const LAST_SEEN_KEY = 'crestio.changelog.last_seen.v1';

function useUnseenChangelog(): { unseen: boolean; markSeen: () => void } {
  const [unseen, setUnseen] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const seen = window.localStorage.getItem(LAST_SEEN_KEY);
    setUnseen(seen !== LATEST_CHANGELOG_TAG);
  }, []);
  function markSeen() {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(LAST_SEEN_KEY, LATEST_CHANGELOG_TAG);
    }
    setUnseen(false);
  }
  return { unseen, markSeen };
}

interface Props {
  children: ReactNode;
  // Legacy header props — when set, Layout renders its own page header for the
  // children. When omitted, the children are expected to provide their own
  // header (used by PageLayout).
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
  pageTitle?: string;
  // New: breadcrumb shown in the top bar. PageLayout fills this in.
  breadcrumbItems?: Crumb[];
}

// ----------------------------------------------------------------------
// Sidebar — 8 consolidated items.
// ----------------------------------------------------------------------

type NavItem = {
  href: string;
  labelKey: string;
  match: (p: string) => boolean;
  icon: () => JSX.Element;
  requires?: 'multi_tutor' | 'team_tab' | 'money_owner' | 'platform_owner';
};

// Desktop nav order (matches spec):
//   1 Home  2 Sessions  3 People  4 Money  5 Resources
//   6 Messages  7 Team (multi-tutor only)  8 Settings
const NAV_ITEMS: NavItem[] = [
  { href: '/app',              labelKey: 'nav.home',      match: (p) => p === '/app',                                       icon: IconHome },
  { href: '/app/sessions',     labelKey: 'nav.sessions',  match: (p) => p.startsWith('/app/sessions') || p.startsWith('/app/calendar') || p.startsWith('/app/templates'), icon: IconCalendar },
  { href: '/app/students',     labelKey: 'nav.people',    match: (p) => p.startsWith('/app/students') || p.startsWith('/app/households') || p.startsWith('/app/parents') || p === '/app/people', icon: IconUsers },
  { href: '/app/invoices',     labelKey: 'nav.money',     match: (p) => p.startsWith('/app/invoices') || p === '/app/payouts-received' || p === '/app/money', icon: IconCoin },
  { href: '/app/lesson-plans', labelKey: 'nav.resources', match: (p) => p.startsWith('/app/lesson-plans') || p.startsWith('/app/files') || p === '/app/resources', icon: IconBook },
  { href: '/app/messages',     labelKey: 'nav.messages',  match: (p) => p.startsWith('/app/messages'),                      icon: IconChat },
  { href: '/app/tutors',       labelKey: 'nav.team',      match: (p) => p.startsWith('/app/tutors') || p === '/app/team' || p === '/app/payouts', icon: IconTeam, requires: 'team_tab' },
  { href: '/app/leads',        labelKey: 'nav.leads',     match: (p) => p.startsWith('/app/leads'),                         icon: IconInbox, requires: 'platform_owner' },
  { href: '/app/settings/account', labelKey: 'nav.settings', match: (p) => p.startsWith('/app/settings'),                   icon: IconGear },
];

// ----------------------------------------------------------------------
// Tab strips per consolidated section.
// Returns null when the current path doesn't belong to a tabbed group.
// ----------------------------------------------------------------------

function tabsForPath(pathname: string, _query: Record<string, any>, _opts: { isOwner: boolean; hasTeam: boolean; hasHouseholds: boolean }): Tab[] | null {
  // Sessions: Today, Upcoming, Past, Templates, Polish queue
  if (pathname.startsWith('/app/sessions') || pathname.startsWith('/app/templates') || pathname.startsWith('/app/calendar')) {
    return [
      { key: 'today',    label: 'Today',         href: '/app/sessions?tab=today',         match: (p, q) => p === '/app/sessions' && (q.tab === 'today' || !q.tab) },
      { key: 'upcoming', label: 'Upcoming',      href: '/app/sessions?tab=upcoming',      match: (p, q) => p === '/app/sessions' && q.tab === 'upcoming' },
      { key: 'past',     label: 'Past',          href: '/app/sessions?tab=past',          match: (p, q) => p === '/app/sessions' && q.tab === 'past' },
      { key: 'templates',label: 'Templates',     href: '/app/templates',                  match: (p) => p.startsWith('/app/templates') },
      { key: 'polish',   label: 'Polish queue',  href: '/app/sessions/polish-queue',      match: (p) => p.startsWith('/app/sessions/polish-queue') },
    ];
  }
  // People: Students, Households (Households hidden on solo plan)
  if (pathname.startsWith('/app/students') || pathname.startsWith('/app/households') || pathname.startsWith('/app/parents') || pathname === '/app/people') {
    const tabs: Tab[] = [
      { key: 'students',  label: 'Students',  href: '/app/students',  match: (p) => p.startsWith('/app/students') },
    ];
    if (_opts.hasHouseholds) {
      tabs.push({ key: 'households', label: 'Households', href: '/app/households', match: (p) => p.startsWith('/app/households') });
    }
    tabs.push({ key: 'parents', label: 'Parents', href: '/app/parents', match: (p) => p.startsWith('/app/parents') });
    return tabs;
  }
  // Money: Invoices, Payouts received (parent → tutor's Stripe payouts)
  if (pathname.startsWith('/app/invoices') || pathname === '/app/payouts-received' || pathname === '/app/money') {
    return [
      { key: 'invoices',         label: 'Invoices',         href: '/app/invoices',          match: (p) => p.startsWith('/app/invoices') },
      { key: 'payouts-received', label: 'Payouts received', href: '/app/payouts-received',  match: (p) => p === '/app/payouts-received' },
    ];
  }
  // Resources: Files, Lesson plans
  if (pathname.startsWith('/app/lesson-plans') || pathname.startsWith('/app/files') || pathname === '/app/resources') {
    return [
      { key: 'lesson-plans', label: 'Lesson plans', href: '/app/lesson-plans', match: (p) => p.startsWith('/app/lesson-plans') },
      { key: 'files',        label: 'Files',        href: '/app/files',        match: (p) => p.startsWith('/app/files') },
    ];
  }
  // Team: Tutors, Payouts (owner only on multi-tutor plan)
  if (pathname.startsWith('/app/tutors') || pathname === '/app/team') {
    return [
      { key: 'tutors',  label: 'Tutors',           href: '/app/tutors',  match: (p) => p.startsWith('/app/tutors') },
      { key: 'payouts', label: 'Payouts to tutors',href: '/app/payouts', match: (p) => p === '/app/payouts' },
    ];
  }
  // Leads: Enquiries, Tutor applications (agency owner only)
  if (pathname.startsWith('/app/leads')) {
    return [
      { key: 'enquiries',    label: 'Enquiries',          href: '/app/leads',              match: (p) => p === '/app/leads' },
      { key: 'applications', label: 'Tutor applications', href: '/app/leads/applications', match: (p) => p === '/app/leads/applications' },
    ];
  }
  // Settings: tabs already exist via SettingsTabs — leave to that component.
  return null;
}

// Page-title fallback derived from the pathname. Used for browser tab title
// when the page doesn't pass one in.
function defaultPageTitle(pathname: string): string {
  if (pathname === '/app') return 'Home';
  if (pathname.startsWith('/app/sessions')) return 'Sessions';
  if (pathname.startsWith('/app/templates')) return 'Templates';
  if (pathname.startsWith('/app/calendar')) return 'Calendar';
  if (pathname.startsWith('/app/students')) return 'People';
  if (pathname.startsWith('/app/households')) return 'People';
  if (pathname.startsWith('/app/parents')) return 'People';
  if (pathname.startsWith('/app/invoices')) return 'Money';
  if (pathname === '/app/payouts-received') return 'Money';
  if (pathname === '/app/payouts') return 'Team';
  if (pathname.startsWith('/app/lesson-plans')) return 'Resources';
  if (pathname.startsWith('/app/files')) return 'Resources';
  if (pathname.startsWith('/app/messages')) return 'Messages';
  if (pathname.startsWith('/app/tutors')) return 'Team';
  if (pathname.startsWith('/app/leads')) return 'Leads';
  if (pathname.startsWith('/app/settings')) return 'Settings';
  return 'Crestio';
}

export default function Layout({
  children,
  title,
  subtitle,
  actions,
  pageTitle,
  breadcrumbItems,
}: Props) {
  const { t } = useTranslation('common');
  const router = useRouter();
  const { organization } = useOrganization();
  const { membership } = useMembership();
  const isOwner = membership?.role === 'owner';
  const planTier = organization?.plan_tier ?? 'solo';
  const hasMultiTutor = planAllowsFeature(planTier, 'multi_tutor');
  const hasHouseholds = planTier !== 'solo';

  const businessName = organization?.name ?? 'Crestio';
  const [userEmail, setUserEmail] = useState('');
  const [accountOpen, setAccountOpen] = useState(false);
  const [languageOpen, setLanguageOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [messagesUnread, setMessagesUnread] = useState<{ total: number; hasUrgent: boolean }>({ total: 0, hasUrgent: false });
  const [activeNow, setActiveNow] = useState(false);

  // Tutor avatar shows a small green dot when at least one session is happening
  // right now. Lightweight count query — runs every 60s while tab is focused.
  useEffect(() => {
    let cancelled = false;
    async function tick() {
      try {
        const now = new Date();
        const fifteenAgo = new Date(now.getTime() - 15 * 60_000);
        const fifteenLater = new Date(now.getTime() + 15 * 60_000);
        const { count } = await supabase
          .from('sessions')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'scheduled')
          .gte('scheduled_at', fifteenAgo.toISOString())
          .lte('scheduled_at', fifteenLater.toISOString());
        if (!cancelled) setActiveNow((count ?? 0) > 0);
      } catch { /* */ }
    }
    tick();
    const id = setInterval(tick, 60_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  const platformOwner = isPlatformOwner(userEmail);
  const nav = useMemo(() => NAV_ITEMS.filter((item) => {
    if (item.requires === 'team_tab') {
      // Team sidebar entry: owner on multi-tutor plan.
      return isOwner && hasMultiTutor;
    }
    if (item.requires === 'platform_owner') {
      // Agency leads: enquiries and tutor applications.
      return isOwner && platformOwner;
    }
    return true;
  }), [isOwner, hasMultiTutor, platformOwner]);

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

  const moreNav = [
    { href: '/app/sessions', label: t('nav.sessions') },
    { href: '/app/messages', label: t('nav.messages') },
    { href: '/app/lesson-plans', label: t('nav.lesson_plans') },
    { href: '/app/invoices', label: t('nav.invoices') },
    ...(isOwner && hasMultiTutor ? [
      { href: '/app/tutors', label: t('nav.tutors') },
      { href: '/app/payouts', label: t('nav.payouts') },
    ] : []),
    ...(isOwner && platformOwner ? [
      { href: '/app/leads', label: t('nav.leads') },
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
    const handle = () => { setAccountOpen(false); setMobileNavOpen(false); };
    router.events.on('routeChangeStart', handle);
    return () => router.events.off('routeChangeStart', handle);
  }, [router.events]);

  // Close mobile drawers on Escape — matches the modal/drawer convention
  // (see ConfirmDrawer, LanguageSwitcherModal).
  useEffect(() => {
    if (!mobileNavOpen && !moreOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { setMobileNavOpen(false); setMoreOpen(false); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mobileNavOpen, moreOpen]);

  async function signOut() {
    await supabase.auth.signOut();
    router.push('/');
  }

  const avatar = (userEmail[0] ?? 'U').toUpperCase();

  // Browser tab title.
  const browserTitleBase = pageTitle ?? title ?? defaultPageTitle(router.pathname);
  const browserTitle = browserTitleBase.includes('Crestio')
    ? browserTitleBase
    : `${browserTitleBase} · Crestio`;

  // Tab strip for the current consolidated section (if any).
  const tabs = tabsForPath(router.pathname, router.query, { isOwner, hasTeam: hasMultiTutor, hasHouseholds });

  // Breadcrumb for the top bar. If the page provided crumbs, use them;
  // else derive a single-leaf crumb from the page title.
  const crumbs: Crumb[] = breadcrumbItems && breadcrumbItems.length > 0
    ? breadcrumbItems
    : [{ label: title ?? defaultPageTitle(router.pathname) }];

  return (
    <div
      data-assistant-open={assistantOpen ? 'true' : 'false'}
      className="min-h-screen bg-cream flex flex-col"
    >
      <Head>
        <title>{browserTitle}</title>
      </Head>
      <a
        href="#crestio-main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[200] focus:bg-forest focus:text-cream focus:px-3 focus:py-2 focus:rounded focus:text-sm"
      >
        Skip to content
      </a>
      <TestAccountBanner />
      <div className="flex flex-1 min-h-0">
        {/* ============== DESKTOP SIDEBAR (collapsed below xl) ============== */}
        <aside
          className={cx(
            'hidden md:flex shrink-0 border-r border-rule bg-surface flex-col min-h-screen sticky top-0',
            'w-[60px] xl:w-[224px]',
          )}
          aria-label="Primary"
        >
          <Link href="/app" className="flex items-center gap-2 px-3 xl:px-5 h-14 border-b border-rule">
            <span className="font-display text-xl tracking-tighter text-ink leading-none">
              c<span className="hidden xl:inline">rest</span><span className="italic text-forest">i</span>o
            </span>
          </Link>

          <nav className="flex-1 py-3 px-2 xl:px-2 space-y-1">
            {nav.map((item) => {
              const active = item.match(router.pathname);
              const showBadge = item.href === '/app/messages' && messagesUnread.total > 0;
              const showHomeDot = item.href === '/app' && (messagesUnread.total > 0 || activeNow);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  aria-label={t(item.labelKey)}
                  title={t(item.labelKey)}
                  className={cx(
                    'group relative flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors duration-100',
                    active
                      ? 'text-forest font-medium'
                      : 'text-ink-muted hover:text-ink hover:bg-ruleSoft',
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cx(
                      'absolute left-0 top-1 bottom-1 w-0.5 rounded-r bg-forest transition-opacity duration-100',
                      active ? 'opacity-100' : 'opacity-0',
                    )}
                  />
                  <span
                    className={cx(
                      'shrink-0 grid place-items-center w-8 h-8 rounded-md transition-colors duration-100',
                      active ? 'bg-forest-soft text-forest' : 'text-ink-muted group-hover:text-ink',
                    )}
                  >
                    <Icon />
                  </span>
                  <span className="hidden xl:inline truncate">{t(item.labelKey)}</span>
                  {showHomeDot && (
                    <span className="ml-auto inline-block w-1.5 h-1.5 rounded-full bg-forest" aria-hidden="true" />
                  )}
                  {showBadge && (
                    <span
                      className={cx(
                        'hidden xl:inline-flex ml-auto items-center justify-center text-2xs font-medium rounded-full px-1.5 min-w-4 h-4',
                        messagesUnread.hasUrgent ? 'bg-claret text-white' : 'bg-forest text-white',
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

          <div className="border-t border-rule p-2 xl:p-3">
            <div className="hidden xl:flex items-center justify-between mb-2 px-1">
              <span className="text-2xs uppercase tracking-widest text-ink-muted font-medium">
                {planTier === 'solo' ? 'Solo' : planTier === 'team' ? 'Team' : 'Trial'}
              </span>
              {isOwner && (
                <Link href="/app/settings/billing" className="text-2xs text-forest hover:underline">
                  Manage
                </Link>
              )}
            </div>
            <button
              type="button"
              onClick={openAssistant}
              className="hidden xl:flex w-full items-center gap-2 px-3 py-2 rounded-md text-xs text-ink-muted hover:text-ink hover:bg-ruleSoft transition-colors duration-100"
            >
              <IconSparkle />
              <span>{t('nav.assistant')}</span>
            </button>
          </div>
        </aside>

        {/* ================= MAIN COLUMN ================= */}
        <div className="flex-1 min-w-0 flex flex-col">
          {/* ============== DESKTOP TOP BAR ============== */}
          <header className="hidden md:flex sticky top-0 z-20 bg-cream/95 backdrop-blur supports-[backdrop-filter]:bg-cream/85 border-b border-rule h-14 items-center gap-4 px-4 md:px-8">
            <Breadcrumb items={crumbs} />
            <div className="flex-1 flex justify-center">
              <button
                type="button"
                onClick={() => window.dispatchEvent(new CustomEvent('crestio:open-search'))}
                className="hidden md:flex items-center gap-2 w-full max-w-[340px] px-3 h-10 rounded-md border border-rule bg-surface hover:bg-ruleSoft/60 transition-colors duration-100 text-left"
                aria-label="Open command palette"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-ink-soft shrink-0">
                  <circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" />
                </svg>
                <span className="flex-1 text-xs text-ink-muted truncate">Search anything…</span>
                <kbd className="text-2xs font-mono text-ink-soft border border-rule rounded px-1.5 py-0.5">⌘K</kbd>
              </button>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <ExemptionOffPill />
              <NewItemMenu />
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
                activeNow={activeNow}
              />
            </div>
          </header>

          {/* ============== MOBILE TOP BAR ============== */}
          <div className="md:hidden sticky top-0 z-30 bg-cream/95 backdrop-blur border-b border-rule pt-safe">
            <div className="px-4 h-14 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setMobileNavOpen(true)}
                className="h-10 w-10 grid place-items-center rounded-md text-ink"
                aria-label="Open menu"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M4 7h16M4 12h16M4 17h16" />
                </svg>
              </button>
              <div className="flex-1 min-w-0 text-center">
                <span className="text-sm text-ink font-medium truncate">{crumbs[crumbs.length - 1]?.label}</span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => window.dispatchEvent(new CustomEvent('crestio:open-search'))}
                  className="h-10 w-10 grid place-items-center rounded-md text-ink"
                  aria-label="Search"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
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

          {/* ============== TAB STRIP (consolidated sections) ============== */}
          {tabs && tabs.length > 0 && !breadcrumbItems && (
            <TabStrip tabs={tabs} ariaLabel="Section tabs" />
          )}

          {/* ============== MAIN CONTENT ============== */}
          <main id="crestio-main" tabIndex={-1} className="flex-1 min-w-0 pb-24 md:pb-0">
            {title && (
              <div className="px-4 md:px-8 pt-6 md:pt-8 pb-2">
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                  <div className="min-w-0">
                    {subtitle && (
                      <div className="text-2xs uppercase tracking-widest text-ink-muted mb-1 font-medium">
                        {subtitle}
                      </div>
                    )}
                    <h1 className="text-2xl font-display font-semibold tracking-tighter text-ink leading-tight m-0">
                      {title}
                    </h1>
                  </div>
                  {actions && (
                    <div className="flex items-center gap-2 shrink-0 [&_a.btn-primary]:h-10 [&_button.btn-primary]:h-10">
                      {actions}
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className={cx(title ? 'px-4 md:px-8 pb-8 md:pb-10 pt-4' : '')}>
              {children}
            </div>
          </main>

          {/* ============== MOBILE BOTTOM TABS ============== */}
          <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-surface border-t border-rule pb-safe">
            <div className="grid grid-cols-5">
              <Link href="/app" className={tabCx(router.pathname === '/app')}>
                <IconHome />
                <span className="text-2xs font-medium">Home</span>
              </Link>
              <Link href="/app/sessions" className={tabCx(router.pathname.startsWith('/app/sessions') || router.pathname.startsWith('/app/templates') || router.pathname.startsWith('/app/calendar'))}>
                <IconCalendar />
                <span className="text-2xs font-medium">Sessions</span>
              </Link>
              <Link href="/app/students" className={tabCx(router.pathname.startsWith('/app/students') || router.pathname.startsWith('/app/households'))}>
                <IconUsers />
                <span className="text-2xs font-medium">People</span>
              </Link>
              <Link href="/app/messages" className={cx(tabCx(router.pathname.startsWith('/app/messages')), 'relative')}>
                <IconChat />
                <span className="text-2xs font-medium">Messages</span>
                {messagesUnread.total > 0 && (
                  <span
                    className={cx(
                      'absolute top-1 right-1/4 inline-block w-2 h-2 rounded-full',
                      messagesUnread.hasUrgent ? 'bg-claret' : 'bg-forest',
                    )}
                    aria-label="Unread messages"
                  />
                )}
              </Link>
              <button type="button" onClick={() => setMoreOpen(true)} className={cx(tabCx(moreOpen))}>
                <IconMore />
                <span className="text-2xs font-medium">More</span>
              </button>
            </div>
          </nav>

          {/* ============== MOBILE NAV DRAWER ============== */}
          {mobileNavOpen && (
            <div className="md:hidden fixed inset-0 z-40 bg-ink/40 animate-fade-in" onClick={() => setMobileNavOpen(false)}>
              <div
                className="absolute top-0 bottom-0 left-0 w-[280px] bg-surface shadow-lift animate-fade-in flex flex-col"
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-label="Main menu"
              >
                <div className="px-5 h-14 flex items-center border-b border-rule">
                  <span className="font-display text-xl tracking-tighter">
                    crest<span className="italic text-forest">io</span>
                  </span>
                </div>
                <nav className="flex-1 py-3 px-2 overflow-y-auto">
                  {nav.map((item) => {
                    const active = item.match(router.pathname);
                    const Icon = item.icon;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={cx(
                          'flex items-center gap-3 px-3 py-2.5 rounded-md text-sm',
                          active ? 'text-forest font-medium bg-forest-soft/40' : 'text-ink hover:bg-ruleSoft',
                        )}
                        onClick={() => setMobileNavOpen(false)}
                      >
                        <Icon />
                        <span>{t(item.labelKey)}</span>
                      </Link>
                    );
                  })}
                </nav>
              </div>
            </div>
          )}

          {/* ============== MOBILE MORE DRAWER ============== */}
          {moreOpen && (
            <div className="md:hidden fixed inset-0 z-40 bg-ink/40 animate-fade-in" onClick={() => setMoreOpen(false)}>
              <div
                className="absolute bottom-0 left-0 right-0 bg-surface rounded-t-xl shadow-lift pb-safe"
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-label="More"
              >
                <div className="h-1 w-10 bg-rule rounded-full mx-auto my-3" />
                <div className="px-5 pb-4 divide-y divide-ruleSoft">
                  {moreNav.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="flex items-center justify-between py-3 text-sm text-ink"
                      onClick={() => setMoreOpen(false)}
                    >
                      <span>{item.label}</span>
                      <span className="text-ink-soft">›</span>
                    </Link>
                  ))}
                  <button
                    onClick={() => { setMoreOpen(false); window.dispatchEvent(new CustomEvent('crestio:open-support')); }}
                    className="w-full flex items-center justify-between py-3 text-sm text-ink text-left"
                  >
                    <span>Help &amp; support</span>
                    <span className="text-ink-soft">›</span>
                  </button>
                  <button
                    onClick={signOut}
                    className="w-full flex items-center justify-between py-3 text-sm text-claret text-left"
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
        <CommandPalette />
        <FloatingActionButton />
      </div>
      <LanguageSwitcherModal open={languageOpen} onClose={() => setLanguageOpen(false)} />
    </div>
  );
}

// ----------------------------------------------------------------------
// Account dropdown
// ----------------------------------------------------------------------

function AccountDropdown({
  email,
  avatar,
  open,
  setOpen,
  isOwner,
  isPlatformOwner,
  onOpenLanguage,
  signOut,
  activeNow,
}: {
  email: string;
  avatar: string;
  open: boolean;
  setOpen: (v: boolean) => void;
  isOwner: boolean;
  isPlatformOwner: boolean;
  onOpenLanguage: () => void;
  signOut: () => void;
  activeNow?: boolean;
}) {
  const { t } = useTranslation('common');
  const { unseen, markSeen } = useUnseenChangelog();
  function toggle() {
    if (unseen && !open) markSeen();
    setOpen(!open);
  }
  return (
    <div className="relative">
      <button
        onClick={toggle}
        className="relative flex items-center gap-2 px-1.5 py-1 rounded-md hover:bg-ruleSoft transition-colors duration-100"
        aria-label="Account menu"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Avatar name={email || 'You'} size={32} />
        {activeNow && (
          <span
            aria-label="In session right now"
            className="absolute -bottom-0.5 -right-0.5 inline-block w-2.5 h-2.5 rounded-full bg-forest ring-2 ring-cream session-now-pulse"
          />
        )}
        {unseen && !activeNow && (
          <span
            aria-label="What's new"
            className="absolute -top-0.5 -right-0.5 inline-block w-2 h-2 rounded-full bg-success ring-2 ring-cream"
          />
        )}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden="true" />
          <div
            role="menu"
            className="absolute right-0 top-full mt-1 z-50 w-72 bg-surface border border-rule rounded-md shadow-lift py-1 animate-fade-in"
          >
            <div className="px-3 py-2 border-b border-rule">
              <div className="text-2xs uppercase tracking-widest text-ink-muted mb-0.5 font-medium">{t('nav.signed_in_as')}</div>
              <div className="text-xs text-ink truncate">{email}</div>
            </div>
            <WhatsNewSection onClose={() => setOpen(false)} />
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
                <div className="px-3 pb-1 text-2xs uppercase tracking-widest text-ink-muted font-medium">{t('nav.owner_tools')}</div>
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
    'flex flex-col items-center justify-center gap-1 py-2.5 transition-colors duration-100',
    active ? 'text-forest' : 'text-ink-muted active:bg-ruleSoft',
  );
}

// ----------------------------------------------------------------------
// Icon set — single 18×18 stroke-1.75 weight.
// ----------------------------------------------------------------------

function IconHome() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1h-5v-7h-6v7H4a1 1 0 0 1-1-1V9.5z"/>
    </svg>
  );
}
function IconCalendar() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>
    </svg>
  );
}
function IconUsers() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2"/><circle cx="10" cy="7" r="4"/>
      <path d="M21 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  );
}
function IconCoin() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9"/><path d="M12 7v10M9 9.5c.7-.6 1.7-1 3-1s2.3.4 3 1"/><path d="M9 14.5c.7.6 1.7 1 3 1s2.3-.4 3-1"/>
    </svg>
  );
}
function IconBook() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 4h12a4 4 0 0 1 4 4v12H8a4 4 0 0 1-4-4V4z"/><path d="M4 16a4 4 0 0 1 4-4h12"/>
    </svg>
  );
}
function IconChat() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12a8 8 0 0 1-11.3 7.3L4 21l1.7-5.7A8 8 0 1 1 21 12z"/>
    </svg>
  );
}
function IconTeam() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/>
      <path d="M3 19a6 6 0 0 1 12 0"/><path d="M15 19a4 4 0 0 1 6.5-3.1"/>
    </svg>
  );
}
function IconInbox() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 13l2.5-8h13L21 13"/><path d="M3 13v6h18v-6"/><path d="M3 13h5l1.5 3h5L16 13h5"/>
    </svg>
  );
}
function IconGear() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>
    </svg>
  );
}
function IconSparkle() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6"/>
    </svg>
  );
}
function IconMore() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>
    </svg>
  );
}
