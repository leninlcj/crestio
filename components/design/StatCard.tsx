import Link from 'next/link';
import { ReactNode } from 'react';
import { Sparkline } from './Sparkline';

type Props = {
  label: string;          // e.g. "Today"
  value: ReactNode;       // big tabular number
  sub?: ReactNode;        // smaller meta line below
  href?: string;          // makes the whole card clickable
  tone?: 'default' | 'forest' | 'amber' | 'claret';
  /** 7-day data series for the bottom sparkline. */
  series?: number[];
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
export function StatCard({ label, value, sub, href, tone = 'default', series }: Props) {
  const inner = (
    <div className="card p-6 h-full flex flex-col gap-3 transition-colors duration-100 hover:bg-ruleSoft/40">
      <div className="text-2xs uppercase tracking-widest text-ink-muted font-medium">
        {label}
      </div>
      <div className={`display-num ${TONE_VALUE[tone]}`}>
        {value}
      </div>
      {sub && (
        <div className="text-xs text-ink-muted truncate">{sub}</div>
      )}
      {series && series.length > 0 && (
        <div className="mt-1 -mb-1">
          <Sparkline data={series} stroke={TONE_STROKE[tone]} width={120} height={18} />
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
