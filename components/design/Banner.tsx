import { ReactNode, useEffect, useState } from 'react';

// Contextual state-of-the-app banner. Stretches across the top of the page
// content area, dismissible, remembers dismissal in localStorage for 7 days.
//
// Usage:
//   <Banner id="payday-2026-04-25" tone="forest" icon={<IconCoin/>}>
//     It's Friday — 6 unbilled sessions.{' '}
//     <a href="/app/invoices/batch">Bill them all</a>
//   </Banner>

const DISMISS_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const DISMISS_KEY = 'crestio.banner.dismissed';

type Tone = 'forest' | 'amber' | 'claret' | 'success' | 'neutral';

type Props = {
  id: string;
  tone?: Tone;
  icon?: ReactNode;
  children: ReactNode;
  dismissible?: boolean;
  className?: string;
};

function loadDismissed(): Record<string, number> {
  if (typeof window === 'undefined') return {};
  try { return JSON.parse(window.localStorage.getItem(DISMISS_KEY) ?? '{}'); }
  catch { return {}; }
}

function saveDismissed(map: Record<string, number>) {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(DISMISS_KEY, JSON.stringify(map)); }
  catch { /* ignore */ }
}

export function Banner({
  id, tone = 'forest', icon, children, dismissible = true, className,
}: Props) {
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    const map = loadDismissed();
    const ts = map[id];
    if (!ts || Date.now() - ts > DISMISS_TTL_MS) setHidden(false);
  }, [id]);

  if (hidden) return null;

  const palette: Record<Tone, string> = {
    forest: 'bg-forest-soft/60 text-forest-ink',
    amber: 'bg-amber-soft/60 text-amber-ink',
    claret: 'bg-claret/8 text-claret',
    success: 'bg-success-soft text-success-ink',
    neutral: 'bg-ruleSoft text-ink',
  };

  return (
    <div
      role="status"
      className={[
        'flex items-center gap-2 px-3 py-2 rounded text-sm leading-snug',
        palette[tone],
        className ?? '',
      ].join(' ')}
      style={{ minHeight: 32 }}
    >
      {icon && <span className="shrink-0 grid place-items-center" aria-hidden="true">{icon}</span>}
      <div className="flex-1 min-w-0 truncate">{children}</div>
      {dismissible && (
        <button
          type="button"
          onClick={() => {
            const map = loadDismissed();
            map[id] = Date.now();
            saveDismissed(map);
            setHidden(true);
          }}
          aria-label="Dismiss"
          className="shrink-0 opacity-60 hover:opacity-100 transition-opacity duration-100"
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M6 6l12 12M6 18L18 6" />
          </svg>
        </button>
      )}
    </div>
  );
}

export default Banner;
