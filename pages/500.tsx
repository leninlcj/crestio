import Link from 'next/link';
import Head from 'next/head';
import { useEffect, useState } from 'react';

// Generate a short request ID client-side so users can include it when
// reporting. Refreshing produces a new one.
function makeRequestId(): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 8; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

export default function ServerError() {
  const [requestId, setRequestId] = useState('');

  useEffect(() => {
    setRequestId(makeRequestId());
  }, []);

  const mailtoBody = `Hi — got a 500 on Crestio.\n\nRequest ID: ${requestId}\nURL: ${typeof window !== 'undefined' ? window.location.href : ''}\n\nWhat I was doing:\n`;

  return (
    <>
      <Head>
        <title>Something broke · Crestio</title>
        <meta name="robots" content="noindex" />
      </Head>
      <div className="min-h-screen bg-cream flex flex-col">
        <div className="px-6 md:px-12 py-6">
          <Link href="/" className="font-display text-2xl tracking-tightest">
            crest<span className="italic text-forest">io</span>
          </Link>
        </div>

        <div className="flex-1 flex items-center justify-center px-6 pb-24">
          <div className="max-w-md text-center">
            <div className="text-2xs uppercase tracking-widest text-ink-soft mb-3 font-mono">500 · server error</div>
            <h1 className="font-display text-5xl md:text-6xl tracking-tightest text-ink mb-5 text-balance">
              Something on our end broke.
            </h1>
            <p className="text-ink-muted mb-3 max-w-prose mx-auto">
              Not you. Refresh in a minute. If it keeps happening, email{' '}
              <a
                href={`mailto:support@crestio.ai?subject=Crestio%20500%20%E2%80%94%20${encodeURIComponent(requestId)}&body=${encodeURIComponent(mailtoBody)}`}
                className="text-forest underline underline-offset-2"
              >
                support@crestio.ai
              </a>{' '}
              and include the request ID below.
            </p>
            {requestId && (
              <div className="inline-flex items-center gap-2 px-3 py-1.5 mb-8 rounded-md border border-rule bg-surface">
                <span className="text-2xs uppercase tracking-widest text-ink-soft">Request ID</span>
                <code className="font-mono text-sm tabular-nums text-ink">{requestId}</code>
              </div>
            )}
            <div className="flex items-center justify-center gap-3 flex-wrap">
              <Link href="/" className="btn-secondary">Go home</Link>
              <button
                type="button"
                onClick={() => typeof window !== 'undefined' && window.location.reload()}
                className="btn-primary"
              >
                Try again
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
