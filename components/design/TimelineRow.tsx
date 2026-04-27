import Link from 'next/link';
import { ReactNode, MouseEvent } from 'react';

type Props = {
  time: string;             // formatted time, left column
  title: ReactNode;         // student name etc. (string or composed nodes)
  subtitle?: string;        // subject + duration
  status?: ReactNode;       // status pill
  href?: string;
  onOpen?: () => void;      // alternate to href (pane mode)
  state?: 'past' | 'current' | 'future';
  /** Hover-revealed action toolbar on the right. Buttons handle stopPropagation. */
  actions?: ReactNode;
};

// Single row in the dashboard "Today" timeline.
export function TimelineRow({ time, title, subtitle, status, href, onOpen, state = 'future', actions }: Props) {
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
      {actions && (
        <div
          className="hidden md:flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-100 shrink-0"
          onClick={(e) => e.stopPropagation()}
        >
          {actions}
        </div>
      )}
      {status && <div className="shrink-0">{status}</div>}
    </div>
  );

  function handleClick(e: MouseEvent) {
    if (onOpen) {
      e.preventDefault();
      onOpen();
    }
  }

  if (href || onOpen) {
    return (
      <Link
        href={href ?? '#'}
        onClick={handleClick}
        className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-forest/40 rounded-md"
      >
        {inner}
      </Link>
    );
  }
  return inner;
}

export default TimelineRow;
