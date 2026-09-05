import { ReactNode } from 'react';

type Props = {
  thing?: string;
  cause?: string;
  onRetry?: () => void;
  onReport?: () => void;
  requestId?: string;
  className?: string;
  children?: ReactNode;
};

// Single-source error renderer. Used wherever a fetch fails. Calm, useful,
// never alarming.
export function ErrorState({
  thing = 'this',
  cause,
  onRetry,
  onReport,
  requestId,
  className,
  children,
}: Props) {
  const inferredCause = cause ?? (typeof navigator !== 'undefined' && !navigator.onLine
    ? 'Network is offline'
    : 'Server is taking too long');
  return (
    <div
      role="alert"
      className={['card p-6 text-center flex flex-col items-center gap-3', className ?? ''].join(' ')}
    >
      <span className="grid place-items-center h-8 w-8 rounded-full bg-ruleSoft text-ink-muted">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M17.5 19a4.5 4.5 0 1 0 0-9h-1.13A6.5 6.5 0 1 0 6 13.5"/>
          <line x1="2" y1="2" x2="22" y2="22"/>
        </svg>
      </span>
      <div className="space-y-0.5">
        <div className="text-sm font-medium text-ink">Couldn't load {thing}</div>
        <div className="text-xs text-ink-muted">{inferredCause}</div>
      </div>
      {children && <div className="text-xs text-ink-muted">{children}</div>}
      <div className="flex items-center gap-3 mt-1">
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="btn-secondary text-xs"
            style={{ height: 32, minHeight: 32 }}
          >
            Try again
          </button>
        )}
        {(onReport || requestId) && (
          <button
            type="button"
            onClick={() => {
              if (onReport) return onReport();
              const subject = encodeURIComponent('Crestio error report');
              const body = encodeURIComponent(`Couldn't load ${thing}.\n\nRequest ID: ${requestId ?? 'n/a'}\nURL: ${typeof window !== 'undefined' ? window.location.href : ''}`);
              if (typeof window !== 'undefined') {
                window.open(`mailto:hello@crestio.ai?subject=${subject}&body=${body}`, '_blank');
              }
            }}
            className="text-xs text-ink-muted hover:text-ink underline underline-offset-2"
          >
            Report this
          </button>
        )}
      </div>
    </div>
  );
}

export default ErrorState;
