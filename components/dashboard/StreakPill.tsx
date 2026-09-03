type Props = { days: number };

// Small, low-key pill. We never gamify. If the user has logged at least one
// session every day for N consecutive days, this surfaces it once on the
// dashboard. No badges, no fanfare.
export default function StreakPill({ days }: Props) {
  if (days < 3) return null;
  return (
    <span
      className="pill-forest gap-1.5"
      title={`You've logged a session every day for ${days} days in a row.`}
    >
      <span aria-hidden className="w-1.5 h-1.5 rounded-full bg-forest" />
      {days}-day streak
    </span>
  );
}
