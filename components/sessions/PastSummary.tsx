type Props = {
  sessionCount: number;
  hours: number;
  unbilledCents: number;
  billedCents: number;
  paidCents: number;
  currency: string;
};

function fmt(cents: number, currency: string): string {
  return new Intl.NumberFormat(undefined, {
    style: 'currency', currency,
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}

export default function PastSummary({ sessionCount, hours, unbilledCents, billedCents, paidCents, currency }: Props) {
  return (
    <div className="rounded-md border border-rule bg-cream/60 px-4 py-3 mb-4 grid grid-cols-2 sm:grid-cols-5 gap-4 text-2xs">
      <Item label="Sessions" value={String(sessionCount)} />
      <Item label="Hours" value={hours.toFixed(1)} />
      <Item label="Unbilled" value={fmt(unbilledCents, currency)} tone={unbilledCents > 0 ? 'amber' : undefined} />
      <Item label="Billed" value={fmt(billedCents, currency)} />
      <Item label="Paid" value={fmt(paidCents, currency)} tone="success" />
    </div>
  );
}

function Item({ label, value, tone }: { label: string; value: string; tone?: 'success' | 'amber' }) {
  return (
    <div>
      <div className="text-ink-soft uppercase tracking-widest mb-0.5">{label}</div>
      <div className={[
        'font-mono tabular-nums text-sm',
        tone === 'success' ? 'text-success' : tone === 'amber' ? 'text-amber-ink' : 'text-ink',
      ].join(' ')}>
        {value}
      </div>
    </div>
  );
}
