import { useEffect, useState } from 'react';
import Link from 'next/link';
import Head from 'next/head';
import { supabase } from '../lib/supabase';

export default function NotFound() {
  const [home, setHome] = useState<'/' | '/app'>('/');

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) setHome('/app');
    })();
  }, []);

  return (
    <>
      <Head>
        <title>Page not found · Crestio Tutoring</title>
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

          <div className="flex items-center justify-center gap-3 flex-wrap">
            <Link href={home} className="btn-primary">
              {home === '/app' ? 'Go to dashboard' : 'Go home'}
            </Link>
            <a
              href="mailto:hello@crestio.ai?subject=Broken%20link"
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
