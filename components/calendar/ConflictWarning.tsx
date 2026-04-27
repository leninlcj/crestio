import type { ConflictResult } from '../../lib/calendar-conflicts';

type Props = {
  conflict: ConflictResult;
};

export default function ConflictWarning({ conflict }: Props) {
  if (conflict.kind === 'none') return null;

  const tone =
    conflict.kind === 'blocking' ? 'border-claret/30 bg-claret/5 text-claret' :
    'border-amber/30 bg-amber-soft/40 text-amber-ink';

  return (
    <div role="alert" className={['rounded-md border px-3 py-2 text-2xs leading-snug flex items-start gap-2', tone].join(' ')}>
      <span aria-hidden className="shrink-0 mt-0.5">
        {conflict.kind === 'blocking' ? <BlockingIcon /> : <WarningIcon />}
      </span>
      <span>
        {conflict.kind === 'blocking' ? <strong className="font-medium">Can't schedule.</strong> : <strong className="font-medium">Heads up.</strong>}{' '}
        {conflict.reason}
      </span>
    </div>
  );
}

function BlockingIcon() {
  return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M4.93 4.93l14.14 14.14"/></svg>;
}
function WarningIcon() {
  return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 9v4M12 17h.01"/><path d="M10.3 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.41 0z"/></svg>;
}
