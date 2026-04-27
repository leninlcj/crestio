import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';

// Embedded sandbox iframe with click-to-interact overlay. The iframe only
// loads after the section enters the viewport — keeps the homepage TTI fast.

export default function SandboxEmbed() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [loadIframe, setLoadIframe] = useState(false);
  const [interacted, setInteracted] = useState(false);

  useEffect(() => {
    const target = containerRef.current;
    if (!target) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setLoadIframe(true);
          observer.disconnect();
        }
      },
      { rootMargin: '200px' }
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, []);

  return (
    <section className="px-6 md:px-12 py-12 md:py-20 max-w-6xl mx-auto">
      <div className="text-center mb-8 md:mb-10">
        <div className="text-2xs uppercase tracking-widest text-ink-soft mb-3">Try it without signing up</div>
        <h2 className="font-display text-3xl md:text-4xl tracking-tighter text-ink mb-3 text-balance">
          Click around. Nothing saves.
        </h2>
        <p className="text-sm md:text-base text-ink-muted max-w-prose mx-auto">
          A real working version of Crestio. Polish a session, send a note, mark an invoice paid. The sandbox forgets everything when you close the tab.
        </p>
      </div>

      <div
        ref={containerRef}
        className="relative max-w-5xl mx-auto rounded-xl overflow-hidden border border-rule bg-surface"
        style={{
          aspectRatio: '16 / 9',
          minHeight: 360,
          filter: 'drop-shadow(0 24px 64px rgba(0,0,0,0.10)) drop-shadow(0 4px 16px rgba(0,0,0,0.04))',
        }}
      >
        <div className="absolute top-0 inset-x-0 z-10 bg-cream border-b border-rule px-4 py-2.5 flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-claret/40" />
          <span className="w-3 h-3 rounded-full bg-amber/40" />
          <span className="w-3 h-3 rounded-full bg-success/40" />
          <div className="ml-3 px-3 py-1 rounded bg-ruleSoft text-2xs text-ink-soft font-mono flex-1 max-w-md mx-auto text-center">
            crestio.ai/sandbox
          </div>
        </div>

        {loadIframe ? (
          <iframe
            src="/sandbox"
            title="Crestio sandbox preview"
            className="absolute inset-0 w-full h-full pt-[40px]"
            loading="lazy"
            sandbox="allow-scripts allow-same-origin"
          />
        ) : (
          <PlaceholderShell />
        )}

        {!interacted && (
          <button
            type="button"
            onClick={() => setInteracted(true)}
            className="absolute inset-0 z-20 grid place-items-center bg-ink/20 backdrop-blur-[1px] hover:bg-ink/10 transition-colors"
            aria-label="Click to interact with the sandbox"
          >
            <div className="bg-surface border border-rule rounded-full px-5 py-2.5 shadow-lift flex items-center gap-2.5 group-hover:bg-cream transition-colors">
              <span className="w-2 h-2 rounded-full bg-forest animate-pulse" />
              <span className="text-sm text-ink font-medium">Click to interact</span>
            </div>
          </button>
        )}
      </div>

      <div className="mt-8 text-center">
        <Link
          href="/sandbox"
          className="text-sm text-forest hover:underline inline-flex items-center gap-1.5"
        >
          Open in full window
          <span aria-hidden>→</span>
        </Link>
      </div>
    </section>
  );
}

function PlaceholderShell() {
  return (
    <div className="absolute inset-0 pt-[40px] flex flex-col bg-cream">
      <div className="flex-1 grid grid-cols-[60px_1fr] xl:grid-cols-[224px_1fr]">
        <div className="bg-surface border-r border-rule p-3">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="skeleton-shimmer h-7 mb-1.5 rounded" />
          ))}
        </div>
        <div className="p-6 space-y-4">
          <div className="skeleton-shimmer h-6 w-64" />
          <div className="grid grid-cols-4 gap-3 pt-3">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="rounded-md border border-rule bg-surface p-4">
                <div className="skeleton-shimmer h-3 w-12 mb-3" />
                <div className="skeleton-shimmer h-7 w-16" />
              </div>
            ))}
          </div>
          <div className="skeleton-shimmer h-44 rounded-md" />
        </div>
      </div>
    </div>
  );
}
