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
        <title>Page not found · Crestio</title>
      </Head>
      <div className="min-h-screen bg-cream text-ink flex flex-col items-center justify-center px-6 py-16">
        <div className="max-w-md text-center">
          <div className="text-2xs uppercase tracking-widest text-ink-muted mb-3">404</div>
          <h1 className="font-display text-5xl md:text-6xl tracking-tightest mb-4">Page not found</h1>
          <p className="text-sm text-ink-muted mb-8">
            The page you were looking for doesn&apos;t exist — or has moved. Let&apos;s get you home.
          </p>
          <Link href={home} className="btn-primary">
            {home === '/app' ? 'Go to dashboard' : 'Go home'}
          </Link>
        </div>
      </div>
    </>
  );
}
