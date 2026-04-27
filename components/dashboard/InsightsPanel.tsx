import { useState } from 'react';

type Insight = {
  label: string;
  value: string;
  trend?: 'up' | 'down' | 'flat';
  hint?: string;
};

type Props = { insights: Insight[] };

export default function InsightsPanel({ insights }: Props) {
  const [open, setOpen] = useState(false);
  if (insights.length === 0) return null;

  return (
    <section className="rounded-md border border-rule bg-surface">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-cream transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-2xs uppercase tracking-widest text-ink-soft">Insights</span>
          <span className="text-xs text-ink-muted">·</span>
          <span className="text-xs text-ink-muted">{insights.length} this week</span>
        </div>
        <span aria-hidden className={`text-ink-soft transition-transform duration-150 ${open ? 'rotate-180' : ''}`}>↓</span>
      </button>
      {open && (
        <div className="px-5 pb-5 grid grid-cols-1 sm:grid-cols-2 gap-3 border-t border-rule pt-4">
          {insights.map((i, idx) => (
            <div key={idx} className="rounded border border-rule bg-cream/60 px-4 py-3">
              <div className="flex items-baseline justify-between gap-2 mb-1">
                <span className="text-2xs uppercase tracking-widest text-ink-soft truncate">{i.label}</span>
                {i.trend && (
                  <span className={[
                    'text-xs',
                    i.trend === 'up' ? 'text-success' : i.trend === 'down' ? 'text-claret' : 'text-ink-soft',
                  ].join(' ')}>
                    {i.trend === 'up' ? '↑' : i.trend === 'down' ? '↓' : '·'}
                  </span>
                )}
              </div>
              <div className="font-display text-lg tracking-tightest text-ink tabular-nums leading-tight">
                {i.value}
              </div>
              {i.hint && (
                <div className="text-2xs text-ink-soft mt-1">{i.hint}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
