import { ReactNode, useState, useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { supabase } from '../../lib/supabase';
import { StudentContextProvider, useStudentMe } from './StudentContext';

// Student portal layout.  Tutor-branded header with brand color, top tab strip
// on desktop, bottom 4-icon nav on mobile.  Calm, minimal — no Crestio
// branding except the tiny "via Crestio" line at the bottom.

type Props = {
  children: ReactNode;
  active?: 'today' | 'sessions' | 'homework' | 'files';
  title?: string;
};

export default function StudentLayout(props: Props) {
  return (
    <StudentContextProvider>
      <Inner {...props} />
    </StudentContextProvider>
  );
}

function Inner({ children, active, title }: Props) {
  const { me } = useStudentMe();
  const accent = isHex(me?.tutor.brandColor) ? me!.tutor.brandColor! : '#1a3a2a';
  const router = useRouter();

  async function signOut() {
    await supabase.auth.signOut();
    router.replace('/student/signin');
  }

  return (
    <div className="min-h-screen bg-cream text-ink flex flex-col">
      <Head>
        <title>{title ? `${title} · ${me?.tutor.name ?? 'Student portal'}` : (me?.tutor.name ?? 'Student portal')}</title>
        <meta name="robots" content="noindex,nofollow" />
      </Head>

      <header
        className="sticky top-0 z-30 backdrop-blur border-b border-rule"
        style={{ background: `${accent}10` }}
      >
        <div className="max-w-[820px] mx-auto px-5 md:px-8 h-14 flex items-center justify-between gap-3">
          <Link href="/student" className="font-display text-lg tracking-tighter truncate" style={{ color: accent }}>
            {me?.tutor.name ?? '—'}
          </Link>
          <AvatarMenu name={me?.profile.full_name ?? ''} onSignOut={signOut} />
        </div>

        {/* Desktop tabs */}
        <nav className="hidden md:block border-t border-rule/60">
          <div className="max-w-[820px] mx-auto px-5 md:px-8 flex gap-2">
            <Tab href="/student" label="Today" active={active === 'today' || (!active && router.pathname === '/student')} accent={accent} />
            <Tab href="/student/sessions" label="Sessions" active={active === 'sessions'} accent={accent} />
            <Tab href="/student/homework" label="Homework" active={active === 'homework'} accent={accent} />
            <Tab href="/student/files" label="Files" active={active === 'files'} accent={accent} />
          </div>
        </nav>
      </header>

      <main className="flex-1 max-w-[820px] w-full mx-auto px-5 md:px-8 pt-6 pb-24 md:pb-12">
        {children}
      </main>

      <footer className="px-5 md:px-8 pb-24 md:pb-6 max-w-[820px] mx-auto w-full">
        <p className="text-[11px] text-ink-soft">
          Designed by {me?.tutor.name ?? 'your tutor'}.{' '}
          <span className="opacity-60">via Crestio</span>
        </p>
      </footer>

      {/* Mobile bottom nav */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 bg-cream border-t border-rule pt-1.5 pb-safe z-40"
        aria-label="Student portal navigation"
      >
        <div className="grid grid-cols-4">
          <BottomTab href="/student" label="Today" icon={IconHome} active={active === 'today'} accent={accent} />
          <BottomTab href="/student/sessions" label="Sessions" icon={IconCalendar} active={active === 'sessions'} accent={accent} />
          <BottomTab href="/student/homework" label="Homework" icon={IconCheck} active={active === 'homework'} accent={accent} />
          <BottomTab href="/student/files" label="Files" icon={IconFile} active={active === 'files'} accent={accent} />
        </div>
      </nav>
    </div>
  );
}

function isHex(c: string | null | undefined): boolean {
  return !!c && /^#[0-9A-Fa-f]{6}$/.test(c);
}

function Tab({ href, label, active, accent }: { href: string; label: string; active: boolean; accent: string }) {
  return (
    <Link
      href={href}
      role="tab"
      aria-selected={active}
      className="px-3 py-3 text-sm border-b-2 -mb-px transition-colors duration-100 min-h-[48px] flex items-center"
      style={{
        color: active ? accent : undefined,
        borderColor: active ? accent : 'transparent',
        fontWeight: active ? 500 : 400,
      }}
    >
      {label}
    </Link>
  );
}

function BottomTab({
  href, label, icon: Icon, active, accent,
}: {
  href: string; label: string; icon: (p: { color?: string }) => JSX.Element; active: boolean; accent: string;
}) {
  return (
    <Link
      href={href}
      className="flex flex-col items-center justify-center py-1.5 min-h-[48px]"
      aria-label={label}
      aria-current={active ? 'page' : undefined}
    >
      <Icon color={active ? accent : '#6b6b66'} />
      <span className="text-[10px]" style={{ color: active ? accent : '#6b6b66' }}>{label}</span>
    </Link>
  );
}

function AvatarMenu({ name, onSignOut }: { name: string; onSignOut: () => void }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);
  const initial = (name?.[0] ?? '?').toUpperCase();
  return (
    <div className="relative">
      <button
        type="button"
        aria-label="Open account menu"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="h-9 w-9 rounded-full bg-forest-soft text-forest-ink grid place-items-center text-sm font-medium"
      >
        {initial}
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-11 w-44 bg-surface border border-rule rounded-md shadow-lift py-1 z-50">
          <Link role="menuitem" href="/student/settings" className="block px-3 py-2 text-sm hover:bg-ruleSoft" onClick={() => setOpen(false)}>Settings</Link>
          <Link role="menuitem" href="/student/help" className="block px-3 py-2 text-sm hover:bg-ruleSoft" onClick={() => setOpen(false)}>Help</Link>
          <button role="menuitem" type="button" onClick={onSignOut} className="block w-full text-left px-3 py-2 text-sm hover:bg-ruleSoft">Sign out</button>
        </div>
      )}
    </div>
  );
}

const IconHome = ({ color = '#6b6b66' }: { color?: string }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 11l9-7 9 7v9a2 2 0 0 1-2 2h-4v-7H9v7H5a2 2 0 0 1-2-2v-9z" />
  </svg>
);
const IconCalendar = ({ color = '#6b6b66' }: { color?: string }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>
  </svg>
);
const IconCheck = ({ color = '#6b6b66' }: { color?: string }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
  </svg>
);
const IconFile = ({ color = '#6b6b66' }: { color?: string }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
  </svg>
);
