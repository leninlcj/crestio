import Link from 'next/link';
import { ReactNode } from 'react';

type Props = {
  icon?: ReactNode;
  title: string;
  description?: string;
  actionLabel: string;
  actionHref?: string;
  onAction?: () => void;
  tone?: 'default' | 'amber' | 'claret' | 'forest';
};

const TONE_ICON_BG: Record<NonNullable<Props['tone']>, string> = {
  default: 'bg-ruleSoft text-ink-muted',
  amber: 'text-amber-ink',
  claret: 'text-claret',
  forest: 'text-forest',
};

// Smart actionable nudge on the dashboard "Needs attention" column.
// Single line description + one action button. Calm, factual voice.
export function NudgeCard({
  icon,
  title,
  description,
  actionLabel,
  actionHref,
  onAction,
  tone = 'default',
}: Props) {
  const button = actionHref ? (
    <Link href={actionHref} className="btn-secondary text-xs px-3" style={{ height: 32, minHeight: 32 }}>
      {actionLabel}
    </Link>
  ) : (
    <button onClick={onAction} className="btn-secondary text-xs px-3" style={{ height: 32, minHeight: 32 }}>
      {actionLabel}
    </button>
  );

  const iconBg = tone === 'amber'
    ? 'bg-amber-soft'
    : tone === 'claret'
    ? 'bg-claret/10'
    : tone === 'forest'
    ? 'bg-forest-soft'
    : 'bg-ruleSoft';

  return (
    <div className="card p-4 flex items-start gap-3">
      {icon && (
        <div
          aria-hidden="true"
          className={`shrink-0 grid place-items-center w-8 h-8 rounded-full ${iconBg} ${TONE_ICON_BG[tone]}`}
        >
          {icon}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="text-sm text-ink font-medium leading-snug">{title}</div>
        {description && (
          <div className="text-xs text-ink-muted mt-0.5 leading-snug">{description}</div>
        )}
      </div>
      <div className="shrink-0 self-center">{button}</div>
    </div>
  );
}

export default NudgeCard;
