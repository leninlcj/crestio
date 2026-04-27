type Props = {
  label: string;
  current: number;
  limit: number | null;
  /** Optional unit suffix, e.g. "calls", "MB". */
  unit?: string;
  className?: string;
};

// Usage progress row. Used in Settings → Billing for AI calls / storage /
// transcription minutes. Bar colors: <70% forest, 70–90% amber, >90% claret.
// limit=null renders an "Unlimited" pill instead of a bar.
export function UsageBar({ label, current, limit, unit, className }: Props) {
  const isUnlimited = limit === null;
  const pct = limit && limit > 0 ? Math.min(100, (current / limit) * 100) : 0;
  const tone =
    pct >= 90 ? 'bg-claret' :
    pct >= 70 ? 'bg-amber' :
    'bg-forest';
  const remaining = limit !== null ? Math.max(0, limit - current) : null;

  return (
    <div className={['py-3', className ?? ''].join(' ')}>
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="text-sm text-ink">{label}</span>
        <span className="text-xs text-ink-muted tabular num">
          {isUnlimited ? (
            <span className="text-forest">Unlimited</span>
          ) : (
            <>
              <span className="text-ink font-medium">{current.toLocaleString()}</span>
              {' / '}
              <span>{limit!.toLocaleString()}</span>
              {unit ? ` ${unit}` : ''}
            </>
          )}
        </span>
      </div>
      {!isUnlimited && (
        <div className="relative h-1 bg-ruleSoft rounded-full overflow-hidden">
          <div
            className={['absolute inset-y-0 left-0 rounded-full transition-[width] duration-200 ease-out', tone].join(' ')}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
      {!isUnlimited && remaining !== null && (
        <div className="text-2xs text-ink-soft mt-1 num tabular">
          {remaining.toLocaleString()}{unit ? ` ${unit}` : ''} left
        </div>
      )}
    </div>
  );
}

export default UsageBar;
