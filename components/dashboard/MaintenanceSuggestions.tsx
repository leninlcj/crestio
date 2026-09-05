import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { authFetch } from '../../lib/authFetch';
import { useArchive } from '../../lib/useArchive';

// Once-a-week (Sunday morning) panel of cleanup candidates, expanded by default
// only when there's at least one suggestion.  Dismissible per-suggestion
// (localStorage tracks dismissals so they don't return the same week).

const DISMISS_KEY = 'crestio.maintenance.dismissed';
const CARD_DISMISS_KEY = 'crestio.maintenance.card_dismissed_on';

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function isCardDismissedToday(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(CARD_DISMISS_KEY) === todayKey();
  } catch { return false; }
}

function dismissCardToday() {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(CARD_DISMISS_KEY, todayKey()); } catch { /* */ }
}

type Suggestion =
  | { kind: 'stale_student'; student_id: string; name: string; days_inactive: number | null }
  | { kind: 'never_tutored'; student_id: string; name: string }
  | { kind: 'old_files'; count: number };

function loadDismissed(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = window.localStorage.getItem(DISMISS_KEY);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch { return new Set(); }
}
function saveDismissed(set: Set<string>) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(DISMISS_KEY, JSON.stringify(Array.from(set)));
}

function suggestionKey(s: Suggestion): string {
  if (s.kind === 'stale_student') return `stale_student:${s.student_id}`;
  if (s.kind === 'never_tutored') return `never_tutored:${s.student_id}`;
  return `old_files:${new Date().toISOString().slice(0, 7)}`; // Refresh monthly.
}

function formatDaysAgo(days: number): string {
  // Cap any human-facing days-since at "over a year ago" so we never render
  // "in 9999 days" for students with no sessions.
  if (days >= 365) return 'over a year ago';
  if (days <= 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  if (days < 60) return 'about a month ago';
  if (days < 365) return `${Math.floor(days / 30)} months ago`;
  return 'over a year ago';
}

export function MaintenanceSuggestions() {
  const archive = useArchive();
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState<Set<string>>(loadDismissed);
  const [cardDismissedToday, setCardDismissedToday] = useState(false);

  useEffect(() => { setCardDismissedToday(isCardDismissedToday()); }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: stale } = await supabase
        .from('students')
        .select('id, name, _last_session_at:sessions(scheduled_at)')
        .is('archived_at', null)
        .limit(50);
      const candidates: Suggestion[] = [];
      const cutoff = Date.now() - 90 * 86400_000;
      for (const s of (stale ?? []) as any[]) {
        const lastTs = Array.isArray(s._last_session_at) && s._last_session_at.length
          ? Math.max(...s._last_session_at.map((r: any) => new Date(r.scheduled_at).getTime()))
          : 0;
        if (!lastTs) {
          // Never tutored — surface separately so we don't render
          // "hasn't had a session in 9999 days".
          candidates.push({ kind: 'never_tutored', student_id: s.id, name: s.name });
        } else if (lastTs < cutoff) {
          candidates.push({
            kind: 'stale_student',
            student_id: s.id,
            name: s.name,
            days_inactive: Math.min(365, Math.floor((Date.now() - lastTs) / 86400_000)),
          });
        }
      }

      // Old files (>1 year, never opened).  Ask the API since RLS hides
      // archived rows but this is just a count.
      const yearAgo = new Date(Date.now() - 365 * 86400_000).toISOString();
      const { count } = await supabase
        .from('files')
        .select('id', { count: 'exact', head: true })
        .lt('created_at', yearAgo)
        .is('archived_at', null)
        .is('deleted_at', null);
      if ((count ?? 0) > 0) candidates.push({ kind: 'old_files', count: count ?? 0 });

      if (!cancelled) {
        setSuggestions(candidates.filter((c) => !dismissed.has(suggestionKey(c))).slice(0, 4));
        setLoading(false);
        setOpen(candidates.length > 0);
      }
    })();
    return () => { cancelled = true; };
  /* eslint-disable-next-line */
  }, []);

  function dismiss(s: Suggestion) {
    const next = new Set(dismissed);
    next.add(suggestionKey(s));
    setDismissed(next);
    saveDismissed(next);
    setSuggestions((prev) => prev.filter((p) => suggestionKey(p) !== suggestionKey(s)));
  }

  if (loading || suggestions.length === 0 || cardDismissedToday) return null;

  return (
    <details
      open={open}
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
      className="card p-4 group"
      data-test-id="maintenance-card"
    >
      <summary className="cursor-pointer flex items-center justify-between text-sm text-ink list-none">
        <span className="flex items-center gap-2">
          <span className="text-2xs uppercase tracking-widest text-ink-muted">Maintenance</span>
          <span className="text-2xs text-ink-soft">· {suggestions.length} suggestion{suggestions.length === 1 ? '' : 's'}</span>
        </span>
        <span className="flex items-center gap-2">
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              dismissCardToday();
              setCardDismissedToday(true);
            }}
            className="text-2xs text-ink-soft hover:text-ink"
            aria-label="Hide maintenance card for today"
            data-test-id="maintenance-dismiss"
          >
            Hide today
          </button>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-ink-soft group-open:rotate-180 transition-transform">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </span>
      </summary>
      <ul className="mt-3 space-y-2">
        {suggestions.map((s) => (
          <li key={suggestionKey(s)} className="text-sm text-ink-muted flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              {s.kind === 'stale_student' ? (
                <>
                  <strong className="text-ink">{s.name}</strong>{' '}
                  hasn't had a session; the last one was{' '}
                  {formatDaysAgo(s.days_inactive ?? 0)}.
                </>
              ) : s.kind === 'never_tutored' ? (
                <>
                  <strong className="text-ink">{s.name}</strong>{' '}
                  hasn't had a first session yet.
                </>
              ) : (
                <>{s.count} files older than 1 year and never opened.</>
              )}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {(s.kind === 'stale_student' || s.kind === 'never_tutored') && (
                <button
                  type="button"
                  onClick={() => {
                    archive.run({
                      entity_type: 'student',
                      ids: [s.student_id],
                      label: `Archived ${s.name}.`,
                    });
                    dismiss(s);
                  }}
                  className="btn-ghost text-2xs px-2 py-1"
                >
                  Archive
                </button>
              )}
              <button
                type="button"
                onClick={() => dismiss(s)}
                className="btn-ghost text-2xs px-2 py-1 text-ink-soft"
                aria-label="Dismiss"
              >
                Keep
              </button>
            </div>
          </li>
        ))}
      </ul>
    </details>
  );
}

export default MaintenanceSuggestions;
