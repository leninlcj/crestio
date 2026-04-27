import { useEffect, useState } from 'react';
import type { Insight } from '../../lib/insightCard';

type Props = { insight: Insight };

const STORAGE_KEY = 'crestio.insight_card.dismissed.v1';

export default function InsightCard({ insight }: Props) {
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const today = new Date().toISOString().slice(0, 10);
    if (window.localStorage.getItem(STORAGE_KEY) === today) setDismissed(true);
  }, []);

  function dismiss() {
    setDismissed(true);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, new Date().toISOString().slice(0, 10));
    }
  }

  if (dismissed) return null;

  const tone =
    insight.tone === 'forest' ? 'border-forest/20 bg-forest-soft/30' :
    insight.tone === 'amber' ? 'border-amber/30 bg-amber-soft/30' :
    'border-rule bg-surface';

  return (
    <div
      role="status"
      className={['rounded-md border px-4 py-3 flex items-start gap-3 mb-4 animate-fade-in relative', tone].join(' ')}
    >
      <span aria-hidden className="text-forest mt-0.5 shrink-0">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 8v4M12 16h.01" />
        </svg>
      </span>
      <div className="text-sm text-ink leading-snug flex-1 min-w-0">{insight.text}</div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss for today"
        className="text-ink-soft hover:text-ink transition-colors p-0.5 shrink-0"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M6 6l12 12M6 18L18 6" />
        </svg>
      </button>
    </div>
  );
}
