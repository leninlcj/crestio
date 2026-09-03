// Stacked bar chart: $ outstanding by age bucket (0-7, 8-14, 15-30, 30+ days).
// Click a bucket → calls onSelect with the bucket key so the parent list
// can filter to that bucket. Pure SVG so it's tiny.

type Bucket = '0-7' | '8-14' | '15-30' | '30+';

type Props = {
  buckets: Record<Bucket, number>; // cents
  currency: string;
  selected?: Bucket | null;
  onSelect?: (b: Bucket | null) => void;
};

const BUCKET_ORDER: Bucket[] = ['0-7', '8-14', '15-30', '30+'];
const BUCKET_TONES: Record<Bucket, string> = {
  '0-7': '#A0A39E',     // ink-soft
  '8-14': '#B8860B',    // amber
  '15-30': '#8B4A1F',   // rust
  '30+': '#7A2233',     // claret
};

function fmt(cents: number, currency: string): string {
  return new Intl.NumberFormat(undefined, {
    style: 'currency', currency,
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}

export default function AgingChart({ buckets, currency, selected, onSelect }: Props) {
  const total = BUCKET_ORDER.reduce((a, k) => a + (buckets[k] ?? 0), 0);
  if (total === 0) return null;

  return (
    <section className="card p-4">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-2xs uppercase tracking-widest text-ink-muted">Aging</h2>
        <span className="text-xs text-ink-muted">
          Total outstanding{' '}
          <span className="font-mono tabular-nums text-ink">{fmt(total, currency)}</span>
        </span>
      </div>
      <div
        role="group"
        aria-label="Outstanding by age bucket"
        className="flex h-6 w-full rounded overflow-hidden border border-rule mb-3"
      >
        {BUCKET_ORDER.map((b) => {
          const value = buckets[b] ?? 0;
          if (value === 0) return null;
          const pct = (value / total) * 100;
          return (
            <button
              key={b}
              type="button"
              onClick={() => onSelect?.(selected === b ? null : b)}
              style={{ width: `${pct}%`, backgroundColor: BUCKET_TONES[b] }}
              className={[
                'transition-opacity hover:opacity-80',
                selected && selected !== b ? 'opacity-30' : '',
              ].join(' ')}
              title={`${b} days · ${fmt(value, currency)}`}
              aria-label={`${b} days outstanding: ${fmt(value, currency)}`}
            />
          );
        })}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-2xs">
        {BUCKET_ORDER.map((b) => {
          const value = buckets[b] ?? 0;
          const isSelected = selected === b;
          return (
            <button
              key={b}
              type="button"
              onClick={() => onSelect?.(isSelected ? null : b)}
              disabled={value === 0}
              className={[
                'flex items-center gap-2 px-3 py-2 rounded border transition-colors text-left disabled:opacity-40 disabled:cursor-default',
                isSelected ? 'border-forest bg-forest/[0.04]' : 'border-rule hover:bg-cream',
              ].join(' ')}
            >
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: BUCKET_TONES[b] }} />
              <div className="min-w-0">
                <div className="text-ink-muted uppercase tracking-widest">{b} days</div>
                <div className="font-mono tabular-nums text-ink mt-0.5 truncate">{fmt(value, currency)}</div>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

export function bucketForDays(days: number): Bucket {
  if (days <= 7) return '0-7';
  if (days <= 14) return '8-14';
  if (days <= 30) return '15-30';
  return '30+';
}
