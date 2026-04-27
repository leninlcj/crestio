type Props = {
  editsCount: number;
};

// Subtle pill shown on the dashboard once a tutor has logged 20+ edits to
// polished notes. Sets up the future "personalized polish" feature without
// overpromising — the model isn't actually personalized yet (14G).
export default function CalibrationPill({ editsCount }: Props) {
  if (editsCount < 20) return null;
  return (
    <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full border border-rule bg-surface text-2xs text-ink-muted">
      <span aria-hidden className="text-forest">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6"/>
        </svg>
      </span>
      <span><strong className="text-ink num tabular">{editsCount}</strong> edits logged · personalized polish on the way</span>
    </div>
  );
}
