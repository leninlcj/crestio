import Link from 'next/link';
import type { ReactNode } from 'react';

type Props = {
  children: ReactNode;
  page?: 'home' | 'sessions' | 'people' | 'money' | 'messages';
};

const NAV: { key: string; label: string; href: string }[] = [
  { key: 'home',     label: 'Home',     href: '#home' },
  { key: 'sessions', label: 'Sessions', href: '#sessions' },
  { key: 'people',   label: 'People',   href: '#people' },
  { key: 'money',    label: 'Money',    href: '#money' },
  { key: 'messages', label: 'Messages', href: '#messages' },
];

export default function SandboxLayout({ children, page = 'home' }: Props) {
  return (
    <div className="min-h-screen bg-cream flex flex-col">
      <SandboxBanner />
      <div className="flex flex-1 min-h-0">
        <aside className="hidden md:flex shrink-0 border-r border-rule bg-surface flex-col w-[60px] xl:w-[224px] sticky top-[44px] self-start min-h-[calc(100vh-44px)]">
          <Link href="/" className="flex items-center gap-2 px-3 xl:px-5 h-14 border-b border-rule">
            <span className="font-display text-xl tracking-tighter text-ink leading-none">
              c<span className="hidden xl:inline">rest</span><span className="italic text-forest">i</span>o
            </span>
          </Link>

          <nav className="flex-1 py-3 px-2 space-y-0.5">
            {NAV.map((item) => {
              const active = item.key === page;
              return (
                <a
                  key={item.key}
                  href={item.href}
                  className={[
                    'group relative flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors duration-100',
                    active ? 'text-forest font-medium' : 'text-ink-muted hover:text-ink hover:bg-ruleSoft',
                  ].join(' ')}
                >
                  <span
                    aria-hidden
                    className={[
                      'absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-r bg-forest transition-opacity duration-100',
                      active ? 'opacity-100' : 'opacity-0',
                    ].join(' ')}
                  />
                  <span className={[
                    'shrink-0 grid place-items-center w-7 h-7 rounded-md transition-colors duration-100',
                    active ? 'bg-forest-soft text-forest' : 'text-ink-muted',
                  ].join(' ')}>
                    <NavIcon name={item.key} />
                  </span>
                  <span className="hidden xl:inline truncate">{item.label}</span>
                </a>
              );
            })}
          </nav>

          <div className="border-t border-rule p-2 xl:p-3">
            <div className="hidden xl:flex items-center justify-between mb-2 px-1">
              <span className="text-2xs uppercase tracking-widest text-ink-soft font-medium">Trial</span>
            </div>
          </div>
        </aside>

        <div className="flex-1 min-w-0 flex flex-col">
          <header className="hidden md:flex sticky top-[44px] z-10 bg-cream/95 backdrop-blur border-b border-rule h-14 items-center gap-4 px-4 md:px-8">
            <div className="text-sm text-ink-muted">Home</div>
            <div className="flex-1 flex justify-center">
              <button
                type="button"
                onClick={(e) => { e.preventDefault(); alert('In the real app, ⌘K opens a search palette across sessions, students, invoices, and parents.'); }}
                className="hidden md:flex items-center gap-2 w-full max-w-[340px] px-3 h-9 rounded-md border border-rule bg-surface hover:bg-ruleSoft/60 transition-colors duration-100 text-left"
                aria-label="Search"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-ink-soft shrink-0">
                  <circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" />
                </svg>
                <span className="flex-1 text-xs text-ink-muted truncate">Search anything…</span>
                <kbd className="text-2xs font-mono text-ink-soft border border-rule rounded px-1.5 py-0.5">⌘K</kbd>
              </button>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-forest-soft text-forest-ink grid place-items-center text-2xs font-display tracking-tighter" aria-hidden>LJ</div>
            </div>
          </header>

          <main className="flex-1 min-w-0 pb-12">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}

function SandboxBanner() {
  function reset() {
    if (typeof window !== 'undefined') window.location.reload();
  }
  return (
    <div className="sticky top-0 z-30 bg-amber-soft border-b border-amber/30 px-4 md:px-8 h-11 flex items-center justify-between gap-3 text-2xs md:text-xs">
      <div className="flex items-center gap-2 text-amber-ink min-w-0">
        <span aria-hidden className="shrink-0">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>
        </span>
        <span className="font-medium">You're in a sandbox.</span>
        <span className="hidden sm:inline text-amber-ink/85 truncate">Click anywhere — nothing saves.</span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={reset}
          className="hidden sm:inline-flex items-center gap-1 text-amber-ink/85 hover:text-amber-ink underline-offset-2 hover:underline"
        >
          ↻ Reset sandbox
        </button>
        <Link
          href="/auth/signup"
          className="inline-flex items-center gap-1.5 bg-forest text-cream rounded-full px-3 py-1.5 text-2xs font-medium hover:bg-forest-ink transition-colors"
        >
          Start free trial
          <span aria-hidden>→</span>
        </Link>
      </div>
    </div>
  );
}

function NavIcon({ name }: { name: string }) {
  switch (name) {
    case 'home': return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1h-5v-7h-6v7H4a1 1 0 0 1-1-1V9.5z"/></svg>;
    case 'sessions': return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>;
    case 'people': return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2"/><circle cx="10" cy="7" r="4"/></svg>;
    case 'money': return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v10M9 9.5c.7-.6 1.7-1 3-1s2.3.4 3 1"/><path d="M9 14.5c.7.6 1.7 1 3 1s2.3-.4 3-1"/></svg>;
    case 'messages': return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a8 8 0 0 1-11.3 7.3L4 21l1.7-5.7A8 8 0 1 1 21 12z"/></svg>;
    default: return null;
  }
}
