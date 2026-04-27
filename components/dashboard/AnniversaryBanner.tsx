import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getDueAnniversary, markAnniversaryShown, type Anniversary } from '../../lib/anniversary';

type Props = {
  organizationCreatedAt: string | null | undefined;
  totalSessions: number;
};

export default function AnniversaryBanner({ organizationCreatedAt, totalSessions }: Props) {
  const [anniversary, setAnniversary] = useState<Anniversary | null>(null);

  useEffect(() => {
    setAnniversary(getDueAnniversary(organizationCreatedAt));
  }, [organizationCreatedAt]);

  if (!anniversary) return null;

  function dismiss() {
    if (anniversary) markAnniversaryShown(anniversary.milestone);
    setAnniversary(null);
  }

  const isYear = anniversary.milestone === 365;
  const shareUrl = `/api/og?type=anniversary&accent=${encodeURIComponent(anniversary.label)}&title=${encodeURIComponent(`${anniversary.label} on Crestio`)}&stat=${encodeURIComponent(String(totalSessions))}&statLabel=${encodeURIComponent(totalSessions === 1 ? 'session logged' : 'sessions logged')}`;

  return (
    <div className="mb-6 rounded-md border border-forest/30 bg-forest-soft p-5 md:p-6 flex items-start gap-4 animate-fade-in relative">
      <div className="w-10 h-10 rounded-full bg-forest text-cream grid place-items-center shrink-0" aria-hidden>
        <span className="font-display text-base tracking-tightest">{anniversary.label.charAt(0).toUpperCase()}</span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-2xs uppercase tracking-widest text-forest font-medium mb-1">Anniversary</div>
        <h2 className="font-display text-base md:text-lg tracking-tightest text-forest-ink m-0 mb-1 leading-tight">
          {isYear ? '1 year on Crestio.' : `${anniversary.label} on Crestio.`}
        </h2>
        <p className="text-2xs md:text-xs text-forest-ink/85 leading-relaxed">
          {totalSessions} {totalSessions === 1 ? 'session logged' : 'sessions logged'} so far.
          {isYear ? ' Quietly impressive.' : ' Keep going.'}
        </p>
        <div className="mt-3 flex flex-wrap gap-2 items-center">
          <Link
            href={shareUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-2xs font-medium text-forest hover:underline"
          >
            Share your {anniversary.label.toLowerCase()} →
          </Link>
        </div>
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="absolute top-3 right-3 text-forest-ink/50 hover:text-forest-ink transition-colors p-1"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M6 6l12 12M6 18L18 6" />
        </svg>
      </button>
    </div>
  );
}
