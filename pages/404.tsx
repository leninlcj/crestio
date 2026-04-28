import { useEffect, useState } from 'react';
import Link from 'next/link';
import Head from 'next/head';
import { supabase } from '../lib/supabase';

export default function NotFound() {
  const [home, setHome] = useState<'/' | '/app'>('/');
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        setSignedIn(true);
        setHome('/app');
      }
    })();
  }, []);

  function openSearch() {
    if (typeof window === 'undefined') return;
    if (signedIn) {
      window.dispatchEvent(new CustomEvent('crestio:open-search'));
    }
  }

  return (
    <>
      <Head>
        <title>Page not found · Crestio</title>
        <meta name="description" content="That page doesn't exist or has moved." />
        <meta name="robots" content="noindex" />
      </Head>
      <div className="min-h-screen bg-cream text-ink flex flex-col items-center justify-center px-6 py-16">
        <div className="max-w-md text-center w-full">
          <div className="text-2xs uppercase tracking-widest text-ink-soft mb-3 font-mono">404 · not found</div>
          <h1 className="font-display text-5xl md:text-6xl tracking-tightest mb-4 text-balance">Page not found.</h1>
          <p className="text-sm text-ink-muted mb-8 max-w-prose mx-auto">
            That page doesn&apos;t exist or has moved. If you got here from a link inside the app, let us know what you clicked.
          </p>

          {signedIn && (
            <button
              type="button"
              onClick={openSearch}
              className="w-full max-w-sm mx-auto mb-6 flex items-center gap-2.5 px-3 h-10 rounded-md border border-rule bg-surface hover:bg-ruleSoft transition-colors duration-100 text-left"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-ink-soft shrink-0" aria-hidden>
                <circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" />
              </svg>
              <span className="flex-1 text-sm text-ink-muted">Search anything…</span>
              <kbd className="text-2xs font-mono text-ink-soft border border-rule rounded px-1.5 py-0.5">⌘K</kbd>
            </button>
          )}

          <div className="flex items-center justify-center gap-3 flex-wrap">
            <Link href={home} className="btn-primary">
              {home === '/app' ? 'Go to dashboard' : 'Go home'}
            </Link>
            <a
              href="mailto:support@crestio.ai?subject=Broken%20link"
              className="text-sm text-ink-muted hover:text-ink underline underline-offset-2"
            >
              Report broken link
            </a>
          </div>
        </div>
      </div>
    </>
  );
}
