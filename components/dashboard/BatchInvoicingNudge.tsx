import { useEffect, useState } from 'react';
import Link from 'next/link';

type Props = {
  unbilledSessions: number;
  unbilledHouseholds: number;
  totalCents: number;
  currency: string;
};

const STORAGE_KEY = 'crestio.batch_invoice_nudge.snoozed_until.v1';

export default function BatchInvoicingNudge({ unbilledSessions, unbilledHouseholds, totalCents, currency }: Props) {
  const [snoozed, setSnoozed] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const until = window.localStorage.getItem(STORAGE_KEY);
    if (until && parseInt(until, 10) > Date.now()) setSnoozed(true);
  }, []);

  if (snoozed) return null;
  if (unbilledSessions < 3 || unbilledHouseholds < 2) return null;

  // Show only Friday 4pm onwards through Sunday end of day.
  const now = new Date();
  const day = now.getDay();
  const hour = now.getHours();
  const inFriEvening = day === 5 && hour >= 16;
  const isSat = day === 6;
  const isSun = day === 0;
  if (!inFriEvening && !isSat && !isSun) return null;

  function snooze() {
    if (typeof window === 'undefined') return;
    const until = Date.now() + 48 * 60 * 60_000;
    window.localStorage.setItem(STORAGE_KEY, String(until));
    setSnoozed(true);
  }

  const total = formatMoney(totalCents, currency);

  return (
    <div className="mb-4 rounded-md border border-amber/30 bg-amber-soft/40 p-4 md:p-5 flex items-start gap-3 animate-fade-in">
      <span aria-hidden className="text-amber-ink shrink-0 mt-0.5">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2"/>
          <path d="M9 12l2 2 4-4"/>
        </svg>
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-sm text-ink font-medium leading-snug">
          {dayLabel()}. {unbilledSessions} unbilled {unbilledSessions === 1 ? 'session' : 'sessions'} across {unbilledHouseholds} {unbilledHouseholds === 1 ? 'household' : 'households'} worth {total}.
        </div>
        <div className="text-2xs text-ink-muted mt-1">Want me to draft them all in one go?</div>
        <div className="mt-3 flex items-center gap-2">
          <Link
            href="/app/invoices/batch"
            className="btn-primary text-2xs h-8 min-h-[32px] px-3"
          >
            Draft them all
          </Link>
          <button
            type="button"
            onClick={snooze}
            className="btn-ghost text-2xs h-8 min-h-[32px] px-3"
          >
            Snooze until Sunday
          </button>
        </div>
      </div>
    </div>
  );
}

function dayLabel(): string {
  const day = new Date().getDay();
  if (day === 5) return 'It\'s Friday afternoon';
  if (day === 6) return 'It\'s Saturday';
  return 'It\'s Sunday';
}

function formatMoney(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 0 }).format(cents / 100);
  } catch {
    return `${currency} ${(cents / 100).toFixed(0)}`;
  }
}
