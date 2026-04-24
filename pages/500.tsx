import Link from 'next/link';

export default function ServerError() {
  return (
    <div className="min-h-screen bg-cream flex flex-col">
      <div className="px-6 md:px-12 py-6">
        <Link href="/" className="font-display text-2xl tracking-tightest">
          crest<span className="italic text-forest">io</span>
        </Link>
      </div>

      <div className="flex-1 flex items-center justify-center px-6 pb-24">
        <div className="max-w-md text-center">
          <div className="text-2xs uppercase tracking-widest text-ink-muted mb-3 font-mono">
            500 · server error
          </div>
          <h1 className="font-display text-5xl md:text-6xl tracking-tightest text-ink mb-5 text-balance">
            Something on our end broke.
          </h1>
          <p className="text-ink-muted mb-8">
            Not you. Refresh in a minute — if it keeps happening, email <a href="mailto:hello@crestio.ai" className="text-forest underline underline-offset-2">hello@crestio.ai</a>.
          </p>
          <div className="flex items-center justify-center gap-3">
            <Link href="/" className="btn-secondary">Go home</Link>
            <button onClick={() => typeof window !== 'undefined' && window.location.reload()} className="btn-primary">
              Try again
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
