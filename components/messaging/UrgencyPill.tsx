type Props = { urgency: 'urgent' | 'normal' | 'info' | null };

export function UrgencyPill({ urgency }: Props) {
  if (!urgency || urgency === 'normal') return null;
  if (urgency === 'urgent') {
    return (
      <span className="inline-block text-2xs uppercase tracking-widest px-1.5 py-0.5 rounded bg-amber-soft text-amber-ink mr-2">
        Urgent
      </span>
    );
  }
  return (
    <span className="inline-block text-2xs uppercase tracking-widest px-1.5 py-0.5 rounded bg-forest-soft text-forest-ink mr-2">
      Info
    </span>
  );
}

export default UrgencyPill;
