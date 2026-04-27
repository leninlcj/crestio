type Props = {
  polishedThisMonth: number;
  averageSeconds: number | null;
};

export default function PolishStatsFooter({ polishedThisMonth, averageSeconds }: Props) {
  if (polishedThisMonth === 0 && averageSeconds === null) return null;
  const avgLabel =
    averageSeconds === null
      ? '—'
      : averageSeconds < 60
      ? `${Math.round(averageSeconds)}s`
      : `${Math.round(averageSeconds / 6) / 10} min`;

  return (
    <div className="rounded-md border border-rule bg-cream/60 px-4 py-3 text-2xs text-ink-muted flex flex-wrap items-center gap-x-5 gap-y-1">
      <span>
        <span className="font-mono tabular-nums text-ink">{polishedThisMonth}</span>{' '}
        polished this month
      </span>
      {averageSeconds !== null && (
        <span>
          Average polish time{' '}
          <span className="font-mono tabular-nums text-ink">{avgLabel}</span>
        </span>
      )}
    </div>
  );
}
