import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';

const SESSION_KEY = 'crestio.sticky_cta.dismissed.v1';

export default function StickyConversionBar({ heroSelector = 'h1' }: { heroSelector?: string }) {
  const router = useRouter();
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (sessionStorage.getItem(SESSION_KEY) === '1') {
      setDismissed(true);
      return;
    }
    const target = document.querySelector(heroSelector);
    if (!target) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        // Show the bar when the hero is no longer visible.
        setVisible(!entry.isIntersecting);
      },
      { threshold: 0, rootMargin: '-80px 0px 0px 0px' }
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [heroSelector]);

  function close() {
    setDismissed(true);
    if (typeof window !== 'undefined') sessionStorage.setItem(SESSION_KEY, '1');
  }

  if (dismissed) return null;

  // UTM personalization. The query is stable across the session.
  const utmSource = (Array.isArray(router.query.utm_source) ? router.query.utm_source[0] : router.query.utm_source) ?? '';
  const ref = (Array.isArray(router.query.ref) ? router.query.ref[0] : router.query.ref) ?? '';

  let copy: string = "7-day free trial. No credit card. Cancel from the dashboard.";
  if (ref) {
    copy = `Invited by a friend? You both get a free month.`;
  } else if (utmSource === 'twitter' || utmSource === 'x') {
    copy = `From Twitter? Welcome. Try the sandbox first — no signup.`;
  } else if (utmSource === 'reddit') {
    copy = `From Reddit. The /r/tutoring thread brought you here.`;
  } else if (utmSource === 'producthunt' || utmSource === 'ph') {
    copy = `From Product Hunt — thanks for stopping by.`;
  } else if (utmSource === 'linkedin') {
    copy = `From LinkedIn. You're 30 seconds from a working sandbox.`;
  }

  return (
    <div
      role="region"
      aria-label="Conversion bar"
      className={[
        'fixed top-0 inset-x-0 z-40 bg-cream border-b border-rule transition-transform duration-200 ease-out',
        visible ? 'translate-y-0' : '-translate-y-full',
      ].join(' ')}
    >
      <div className="px-4 md:px-8 h-12 flex items-center justify-between gap-3 max-w-7xl mx-auto">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <span className="hidden sm:inline-flex items-center gap-1.5 text-2xs uppercase tracking-widest text-forest font-medium shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-forest" />
            Crestio
          </span>
          <span className="text-sm text-ink truncate">{copy}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Link
            href={ref ? `/auth/signup?ref=${encodeURIComponent(ref)}` : '/auth/signup'}
            className="bg-forest text-cream rounded-md px-3 py-1.5 text-2xs font-medium hover:bg-forest-ink transition-colors"
          >
            Start free trial →
          </Link>
          <button
            type="button"
            onClick={close}
            aria-label="Dismiss"
            className="p-1 text-ink-soft hover:text-ink transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M6 6l12 12M6 18L18 6" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
