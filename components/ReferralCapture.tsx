import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { writeReferralCookie } from '../lib/referralCookie';

// Mounted once in _app.tsx. Watches for ?ref=CODE on any page, validates via
// the public endpoint, and if valid stores a cookie + shows a temporary
// banner. Invalid codes are silently ignored (spec Part 5.1 / T1).

export function ReferralCapture() {
  const router = useRouter();
  const [banner, setBanner] = useState<string | null>(null);

  useEffect(() => {
    if (!router.isReady) return;
    const raw = router.query.ref;
    const code = typeof raw === 'string' ? raw : Array.isArray(raw) ? raw[0] : null;
    if (!code) return;

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/referrals/validate-code', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code }),
        });
        const payload = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (payload?.valid === true) {
          writeReferralCookie(code);
          setBanner("You've been invited by a Crestio user — you'll get 25% off your first paid month.");
          setTimeout(() => setBanner(null), 10_000);
        }
      } catch { /* silent */ }
      // Always strip ?ref from the URL so reload doesn't retrigger / leak code.
      if (!cancelled) {
        const { ref, ...rest } = router.query;
        router.replace({ pathname: router.pathname, query: rest }, undefined, { shallow: true });
      }
    })();

    return () => { cancelled = true; };
    // We only want this to fire when the `ref` param changes — re-running on
    // every router.query change would thrash.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady, router.query.ref]);

  if (!banner) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-0 left-0 right-0 z-[70] bg-forest text-cream px-5 py-3 text-sm text-center shadow-lift"
    >
      {banner}
    </div>
  );
}

export default ReferralCapture;
