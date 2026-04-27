import Link from 'next/link';
import { ReactNode } from 'react';

type Props = {
  time: string;             // formatted time, left column
  title: string;            // student name etc.
  subtitle?: string;        // subject + duration
  status?: ReactNode;       // status pill
  href?: string;
  state?: 'past' | 'current' | 'future';
};

// Single row in the dashboard "Today" timeline.
export function TimelineRow({ time, title, subtitle, status, href, state = 'future' }: Props) {
  const isPast = state === 'past';
  const isCurrent = state === 'current';

  const inner = (
    <div
      className={[
        'group flex items-center gap-4 px-3 py-3 rounded-md border-l-2 transition-colors duration-100',
        isCurrent ? 'border-forest bg-forest-soft/40' : 'border-transparent hover:bg-ruleSoft/60',
        isPast ? 'opacity-60' : '',
      ].join(' ')}
    >
      <div className="w-16 shrink-0 text-xs text-ink-muted font-medium tabular">
        {time}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm text-ink font-medium truncate">{title}</div>
        {subtitle && (
          <div className="text-xs text-ink-muted truncate">{subtitle}</div>
        )}
      </div>
      {status && <div className="shrink-0">{status}</div>}
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-forest/40 rounded-md">
        {inner}
      </Link>
    );
  }
  return inner;
}

export default TimelineRow;
