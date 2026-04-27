type Props = { days: number };

// Small, low-key pill. We never gamify. If the user has logged at least one
// session every day for N consecutive days, this surfaces it once on the
// dashboard. No badges, no fanfare.
export default function StreakPill({ days }: Props) {
  if (days < 3) return null;
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-forest/8 text-forest-ink text-2xs font-medium"
      title={`You've logged a session every day for ${days} days in a row.`}
    >
      <span aria-hidden className="w-1.5 h-1.5 rounded-full bg-forest" />
      {days}-day streak
    </span>
  );
}
