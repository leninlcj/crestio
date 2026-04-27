import { useEffect, useState } from 'react';

type Props = {
  monthLabel: string;             // "April"
  sessions: number;
  hours: number;
  earnedCents: number;
  studentsHelped: number;
  currency: string;
  comparison?: { delta_pct: number; previous_label: string };
  onShare?: () => void;
};

const STORAGE_KEY = 'crestio.monthly_impact.dismissed.v1';

export default function MonthlyImpactCard(props: Props) {
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === keyForMonth(props.monthLabel)) setDismissed(true);
  }, [props.monthLabel]);

  function dismiss() {
    setDismissed(true);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, keyForMonth(props.monthLabel));
    }
  }

  if (dismissed) return null;

  const earned = formatMoney(props.earnedCents, props.currency);

  return (
    <div className="mb-6 rounded-md border border-forest/20 bg-forest-soft/40 p-5 md:p-6 relative overflow-hidden animate-fade-in">
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
      <div className="text-2xs uppercase tracking-widest text-forest font-medium mb-1.5">Monthly impact</div>
      <h2 className="font-display text-xl md:text-2xl tracking-tighter text-forest-ink mb-4 leading-tight">
        Your {props.monthLabel} in numbers.
      </h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-5 mb-5">
        <Stat label="Sessions" value={props.sessions} />
        <Stat label="Hours" value={`${props.hours}h`} />
        <Stat label="Earned" value={earned} />
        <Stat label="Students helped" value={props.studentsHelped} />
      </div>
      {props.comparison && (
        <div className="text-xs text-forest-ink/85 mb-4">
          <Trend pct={props.comparison.delta_pct} /> vs {props.comparison.previous_label}
        </div>
      )}
      {props.onShare && (
        <button
          type="button"
          onClick={props.onShare}
          className="text-2xs font-medium text-forest hover:underline inline-flex items-center gap-1.5"
        >
          <ShareIcon /> Share these numbers
        </button>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <div className="text-2xs uppercase tracking-widest text-forest-ink/65 mb-1">{label}</div>
      <div className="font-display text-2xl md:text-3xl tracking-tightest text-forest-ink num tabular leading-none">
        {value}
      </div>
    </div>
  );
}

function Trend({ pct }: { pct: number }) {
  if (pct === 0) return <span>Flat</span>;
  const arrow = pct > 0 ? '↑' : '↓';
  const sign = pct > 0 ? '+' : '';
  return (
    <span>
      <span aria-hidden className="font-mono">{arrow}</span> <strong className="num tabular">{sign}{pct}%</strong>
    </span>
  );
}

function ShareIcon() {
  return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" /></svg>;
}

function formatMoney(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 0 }).format(cents / 100);
  } catch {
    return `${currency} ${(cents / 100).toFixed(0)}`;
  }
}

function keyForMonth(label: string): string {
  const now = new Date();
  return `${now.getFullYear()}-${label}`;
}
