import Link from 'next/link';
import { ReactNode, useMemo, useState } from 'react';
import { Sparkline } from './Sparkline';
import { useCountUp } from '../../lib/useCountUp';

type Props = {
  label: string;          // e.g. "Today"
  value: ReactNode;       // big tabular number (or pre-formatted string)
  /** Optional numeric value used for count-up animation when value is a string. */
  numericValue?: number;
  sub?: ReactNode;        // smaller meta line below
  href?: string;          // makes the whole card clickable
  tone?: 'default' | 'forest' | 'amber' | 'claret';
  /** 7-day data series for the bottom sparkline. */
  series?: number[];
  /** Optional previous-week series; used to compute a delta line. */
  previousSeries?: number[];
  /** Optional override for the delta unit label ("sessions", "invoices"). */
  deltaUnit?: string;
};

const TONE_VALUE: Record<NonNullable<Props['tone']>, string> = {
  default: 'text-ink',
  forest: 'text-forest',
  amber: 'text-amber-ink',
  claret: 'text-claret',
};

const TONE_STROKE: Record<NonNullable<Props['tone']>, string> = {
  default: '#1F3A2E',
  forest: '#1F3A2E',
  amber: '#B8860B',
  claret: '#7A2233',
};

// One of the four header cards on the dashboard. 24px padding, 8px radius,
// no shadow. Number uses display-num (40 / 600 / tabular).
//
// Phase 3 additions:
// - End-dot on the sparkline (4px circle in the same tone).
// - Optional week-over-week delta + tooltip-on-hover with current vs previous.
// - Count-up animation on numeric values.
export function StatCard({ label, value, numericValue, sub, href, tone = 'default', series, previousSeries, deltaUnit }: Props) {
  const [hover, setHover] = useState(false);
  const stroke = TONE_STROKE[tone];

  // Count-up on numeric values.
  const count = useCountUp(typeof value === 'number' ? value : (numericValue ?? 0), 400);
  const renderValue: ReactNode = typeof value === 'number'
    ? count
    : value;

  // Week-over-week delta from series totals.
  const delta = useMemo(() => {
    if (!series || !previousSeries) return null;
    const cur = series.reduce((a, b) => a + b, 0);
    const prev = previousSeries.reduce((a, b) => a + b, 0);
    const diff = cur - prev;
    if (cur === 0 && prev === 0) return null;
    return { cur, prev, diff };
  }, [series, previousSeries]);

  const sparklineWidth = 120;
  const sparklineHeight = 18;
  const lastDot = useMemo(() => {
    if (!series || series.length === 0) return null;
    const min = Math.min(...series);
    const max = Math.max(...series);
    const span = max - min || 1;
    const last = series[series.length - 1];
    const x = sparklineWidth;
    const y = sparklineHeight - ((last - min) / span) * (sparklineHeight - 2) - 1;
    return { x, y };
  }, [series]);

  const inner = (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="card p-6 h-full flex flex-col gap-3 transition-colors duration-100 hover:bg-ruleSoft/40 relative"
    >
      <div className="text-2xs uppercase tracking-widest text-ink-muted font-medium">
        {label}
      </div>
      <div className={`display-num num ${TONE_VALUE[tone]}`}>
        {renderValue}
      </div>
      {sub && (
        <div className="text-xs text-ink-muted truncate leading-snug">{sub}</div>
      )}
      {delta && (
        <div className="text-2xs text-ink-soft num tabular leading-snug">
          {delta.diff === 0 ? (
            <span>Same as last week</span>
          ) : (
            <span className={delta.diff > 0 ? 'text-success-ink' : 'text-claret'}>
              {delta.diff > 0 ? '+' : ''}{delta.diff} vs last week{deltaUnit ? ` ${deltaUnit}` : ''}
            </span>
          )}
        </div>
      )}
      {series && series.length > 0 && (
        <div className="mt-1 -mb-1 relative" style={{ width: sparklineWidth, height: sparklineHeight }}>
          <Sparkline data={series} stroke={stroke} width={sparklineWidth} height={sparklineHeight} />
          {lastDot && (
            <span
              aria-hidden="true"
              className="absolute block rounded-full"
              style={{
                width: 4, height: 4,
                left: lastDot.x - 2,
                top: lastDot.y - 2,
                background: stroke,
              }}
            />
          )}
        </div>
      )}
      {hover && delta && series && (
        <div
          role="tooltip"
          className="absolute right-3 top-3 z-10 text-2xs px-2 py-1 rounded border border-rule bg-surface shadow-lift num tabular pointer-events-none"
        >
          <span className="text-ink font-medium">{delta.cur}</span>
          <span className="text-ink-soft"> · prev </span>
          <span className="text-ink-muted">{delta.prev}</span>
        </div>
      )}
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-forest/40 rounded-[8px]">
        {inner}
      </Link>
    );
  }
  return inner;
}

export default StatCard;
