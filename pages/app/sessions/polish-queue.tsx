import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import AuthGuard from '../../../components/AuthGuard';
import Layout from '../../../components/Layout';
import { Diff } from '../../../components/design/Diff';
import { PolishProgress } from '../../../components/design/PolishProgress';
import { ErrorState } from '../../../components/design/ErrorState';
import { useToast } from '../../../components/design/Toast';
import { useUndo } from '../../../lib/useUndo';
import { supabase } from '../../../lib/supabase';
import { activeLocale, cx } from '../../../lib/utils';

type QueueRow = {
  id: string;
  student_id: string;
  student_name: string;
  scheduled_at: string;
  duration_minutes: number;
  subject: string | null;
  notes_internal: string;
  notes_parent_facing: string | null;
  polish_skipped: boolean;
};

type RowState = {
  phase: 'idle' | 'polishing' | 'done' | 'editing' | 'sending' | 'sent';
  polishedText: string | null;
  editedText: string | null;
  error: string | null;
  startedAt?: number;
};

const LOOKBACK_DAYS = 14;
const BATCH_SIZE = 5;

function PolishQueueInner() {
  const toast = useToast();
  const undo = useUndo();
  const router = useRouter();
  const studentFilter = typeof router.query.student === 'string' ? router.query.student : '';
  const [showSkipped, setShowSkipped] = useState(false);
  const [rows, setRows] = useState<QueueRow[]>([]);
  const [state, setState] = useState<Map<string, RowState>>(new Map());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [batchBusy, setBatchBusy] = useState(false);
  const [polishedToday, setPolishedToday] = useState(0);
  const [signaturePhrase, setSignaturePhrase] = useState<string | null>(null);
  const [confettiOnce, setConfettiOnce] = useState(false);

  const updateRow = useCallback((id: string, patch: Partial<RowState>) => {
    setState((prev) => {
      const next = new Map(prev);
      const cur = next.get(id) ?? { phase: 'idle', polishedText: null, editedText: null, error: null };
      next.set(id, { ...cur, ...patch });
      return next;
    });
  }, []);

  const load = useCallback(async () => {
    setLoadError(null);
    setLoading(true);
    try {
      const since = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000).toISOString();
      const q = supabase
        .from('sessions')
        .select('id, student_id, scheduled_at, duration_minutes, subject, notes_internal, notes_parent_facing, polish_skipped, student:students!inner(id, name)')
        .eq('status', 'completed')
        .gte('scheduled_at', since)
        .order('scheduled_at', { ascending: false });
      const { data, error } = await q;
      if (error) { setLoadError(error.message); return; }
      const filtered = ((data ?? []) as any[])
        .filter((s) => s.notes_internal && s.notes_internal.trim().length >= 5)
        .filter((s) => !s.notes_parent_facing)
        .filter((s) => showSkipped ? true : !s.polish_skipped)
        .filter((s) => studentFilter ? s.student_id === studentFilter : true)
        .map((s) => ({
          id: s.id,
          student_id: s.student_id,
          student_name: s.student?.name ?? 'Unknown',
          scheduled_at: s.scheduled_at,
          duration_minutes: s.duration_minutes,
          subject: s.subject,
          notes_internal: s.notes_internal,
          notes_parent_facing: s.notes_parent_facing,
          polish_skipped: !!s.polish_skipped,
        } as QueueRow));
      setRows(filtered);
    } finally {
      setLoading(false);
    }
  }, [showSkipped, studentFilter]);

  useEffect(() => { load(); }, [load]);

  // Compute most-used phrase among recently polished sessions for queue-cleared.
  useEffect(() => {
    if (rows.length > 0) return; // only when queue is empty
    let cancelled = false;
    (async () => {
      const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
      const { data: recent } = await supabase
        .from('sessions')
        .select('notes_parent_facing')
        .gte('scheduled_at', since)
        .not('notes_parent_facing', 'is', null)
        .limit(20);
      if (cancelled) return;
      const texts = ((recent ?? []) as any[]).map((r) => r.notes_parent_facing as string).filter(Boolean);
      setPolishedToday(texts.length);
      setSignaturePhrase(extractMostUsedPhrase(texts));
    })();
    return () => { cancelled = true; };
  }, [rows.length]);

  async function callPolishApi(row: QueueRow): Promise<string | null> {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return null;
    const res = await fetch('/api/polish-session-notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({
        rawNotes: row.notes_internal,
        studentId: row.student_id,
        durationMinutes: row.duration_minutes,
        subject: row.subject || '',
      }),
    });
    const payload = await res.json().catch(() => ({} as any));
    if (!res.ok) return null;
    return typeof payload.polishedNotes === 'string' ? payload.polishedNotes : null;
  }

  async function polishRow(row: QueueRow) {
    updateRow(row.id, { phase: 'polishing', error: null, startedAt: Date.now() });
    const polished = await callPolishApi(row);
    if (polished) {
      updateRow(row.id, { phase: 'done', polishedText: polished, editedText: polished });
    } else {
      updateRow(row.id, { phase: 'idle', error: 'Could not polish. Try again.' });
    }
  }

  async function polishNextN(n: number) {
    const queue = rows.filter((r) => {
      const s = state.get(r.id);
      return !s || s.phase === 'idle';
    }).slice(0, n);
    if (queue.length === 0) return;
    setBatchBusy(true);
    try {
      for (const r of queue) {
        await polishRow(r);
      }
    } finally {
      setBatchBusy(false);
    }
  }

  async function approveAndSend(row: QueueRow) {
    const s = state.get(row.id);
    const text = s?.editedText ?? s?.polishedText ?? '';
    if (!text.trim()) return;

    // Optimistic: mark row as sent, store via undo.
    updateRow(row.id, { phase: 'sending' });
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return;

    // First, persist as parent-facing notes.
    await supabase.from('sessions').update({
      notes_parent_facing: text.trim(),
      notes_polished_by_ai: true,
    }).eq('id', row.id);

    // Queue the actual send. Five-second hold window — undo cancels send.
    undo.queue({
      id: `send-polish-${row.id}`,
      label: 'Polish sent.',
      holdMs: 5000,
      commit: async () => {
        try {
          await fetch(`/api/sessions/${row.id}/send-polish-to-parent`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
            body: JSON.stringify({ content: text.trim(), save_as_official: true }),
          });
        } catch { /* */ }
      },
      onUndo: () => {
        updateRow(row.id, { phase: 'done' });
      },
      inverseCommit: async () => {
        // Roll back the parent-facing save too.
        await supabase.from('sessions').update({
          notes_parent_facing: null,
          notes_polished_by_ai: false,
        }).eq('id', row.id);
      },
    });

    updateRow(row.id, { phase: 'sent' });
    setRows((prev) => {
      // First polish of the day → confetti
      if (!confettiOnce) {
        setConfettiOnce(true);
        spawnConfetti();
      }
      // Animate the row off after a beat.
      setTimeout(() => {
        setRows((p2) => p2.filter((r) => r.id !== row.id));
      }, 350);
      return prev;
    });
  }

  function discardPolish(row: QueueRow) {
    updateRow(row.id, { phase: 'idle', polishedText: null, editedText: null, error: null });
  }

  async function skip(id: string) {
    const { error } = await supabase.from('sessions').update({ polish_skipped: true }).eq('id', id);
    if (error) return;
    setRows((prev) => showSkipped
      ? prev.map((r) => r.id === id ? { ...r, polish_skipped: true } : r)
      : prev.filter((r) => r.id !== id));
  }

  async function unskip(id: string) {
    const { error } = await supabase.from('sessions').update({ polish_skipped: false }).eq('id', id);
    if (error) return;
    setRows((prev) => prev.map((r) => r.id === id ? { ...r, polish_skipped: false } : r));
  }

  const pendingCount = rows.filter((r) => !r.polish_skipped).length;

  return (
    <Layout subtitle="Sessions" title="Polish queue"
      actions={
        <>
          <Link href="/app/sessions" className="btn-ghost text-xs">All sessions</Link>
          {pendingCount > 0 && (
            <button
              type="button"
              onClick={() => polishNextN(BATCH_SIZE)}
              disabled={batchBusy}
              className="btn-primary text-xs"
            >
              {batchBusy ? 'Polishing…' : `Polish next ${Math.min(BATCH_SIZE, pendingCount)}`}
            </button>
          )}
        </>
      }
    >
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <p className="text-sm text-ink-muted">
          Completed sessions from the last {LOOKBACK_DAYS} days with internal notes but no parent-facing notes.
        </p>
        <label className="text-2xs uppercase tracking-widest text-ink-muted flex items-center gap-2">
          <input
            type="checkbox"
            checked={showSkipped}
            onChange={(e) => setShowSkipped(e.target.checked)}
            className="h-4 w-4 accent-forest"
          />
          Show skipped
        </label>
      </div>

      {loading ? (
        <PolishQueueSkeleton />
      ) : loadError ? (
        <ErrorState thing="the polish queue" cause={loadError} onRetry={load} />
      ) : rows.length === 0 ? (
        <QueueClearedCard polishedToday={polishedToday} signaturePhrase={signaturePhrase} />
      ) : (
        <ul className="space-y-3 max-w-3xl">
          {rows.map((r) => (
            <QueueCard
              key={r.id}
              row={r}
              state={state.get(r.id) ?? { phase: 'idle', polishedText: null, editedText: null, error: null }}
              onPolish={() => polishRow(r)}
              onApprove={() => approveAndSend(r)}
              onEditChange={(text) => updateRow(r.id, { editedText: text })}
              onEditToggle={() => {
                const s = state.get(r.id);
                if (s?.phase === 'editing') updateRow(r.id, { phase: 'done' });
                else updateRow(r.id, { phase: 'editing' });
              }}
              onDiscard={() => discardPolish(r)}
              onSkip={() => skip(r.id)}
              onUnskip={() => unskip(r.id)}
            />
          ))}
        </ul>
      )}
    </Layout>
  );
}

// ---------------------------------------------------------------------------
// Card — transforms in-place across phases
// ---------------------------------------------------------------------------

function QueueCard({
  row, state,
  onPolish, onApprove, onEditChange, onEditToggle, onDiscard, onSkip, onUnskip,
}: {
  row: QueueRow;
  state: RowState;
  onPolish: () => void;
  onApprove: () => void;
  onEditChange: (text: string) => void;
  onEditToggle: () => void;
  onDiscard: () => void;
  onSkip: () => void;
  onUnskip: () => void;
}) {
  const exiting = state.phase === 'sent';
  return (
    <li
      className={cx(
        'transition-all duration-300 ease-out',
        exiting ? 'opacity-0 -translate-y-2' : 'opacity-100',
      )}
    >
      <div className={cx(
        'card overflow-hidden transition-all duration-200',
        state.phase === 'polishing' && 'ring-1 ring-forest/30 polish-pulse',
      )}>
        {/* Header */}
        <div className="px-5 py-3 flex items-center justify-between gap-3 border-b border-rule">
          <div className="min-w-0 flex-1">
            <div className="text-sm text-ink truncate">
              <strong>{row.student_name}</strong>
              {' · '}
              {new Date(row.scheduled_at).toLocaleDateString(activeLocale(), { day: 'numeric', month: 'short' })}
              {row.subject ? ` · ${row.subject}` : ''}
            </div>
            <div className="text-2xs text-ink-muted truncate">
              {row.notes_internal.slice(0, 100)}{row.notes_internal.length > 100 ? '…' : ''}
            </div>
          </div>
          <div className="shrink-0 flex items-center gap-2">
            {row.polish_skipped && <span className="badge-neutral">Skipped</span>}
            {state.phase === 'polishing' && (
              <span className="text-2xs text-ink-muted flex items-center gap-1">
                Polishing
                <span className="assistant-dot" /><span className="assistant-dot" /><span className="assistant-dot" />
              </span>
            )}
            {state.phase === 'done' && <span className="badge-forest">Ready</span>}
            {state.phase === 'sent' && <span className="badge-forest">Sent ✓</span>}
          </div>
        </div>

        {/* Body */}
        {state.phase === 'idle' && (
          <div className="px-5 py-4 flex items-center gap-2 flex-wrap">
            <button type="button" onClick={onPolish} className="btn-primary text-xs" style={{ height: 32, minHeight: 32 }}>
              Polish notes
            </button>
            {row.polish_skipped ? (
              <button type="button" onClick={onUnskip} className="btn-ghost text-xs" style={{ height: 32, minHeight: 32 }}>Un-skip</button>
            ) : (
              <button type="button" onClick={onSkip} className="btn-ghost text-xs" style={{ height: 32, minHeight: 32 }}>Skip</button>
            )}
            {state.error && <span className="text-2xs text-claret">{state.error}</span>}
            <Link href={`/app/sessions/${row.id}`} className="ml-auto text-2xs text-ink-muted hover:text-ink underline underline-offset-2">
              Open session →
            </Link>
          </div>
        )}

        {state.phase === 'polishing' && (
          <div className="px-5 py-4">
            <PolishProgress busy done={false} />
          </div>
        )}

        {(state.phase === 'done' || state.phase === 'editing' || state.phase === 'sending') && state.polishedText && (
          <div className="px-5 py-4 space-y-4">
            <div className="grid md:grid-cols-[40%_60%] gap-3">
              <div>
                <div className="text-2xs uppercase tracking-widest text-ink-muted mb-1.5">Original</div>
                <div className="text-2xs text-ink-muted whitespace-pre-wrap bg-ruleSoft/40 rounded p-3 border border-rule leading-relaxed">
                  {row.notes_internal}
                </div>
              </div>
              <div>
                <div className="text-2xs uppercase tracking-widest text-ink-muted mb-1.5">Polished</div>
                {state.phase === 'editing' ? (
                  <textarea
                    rows={8}
                    className="input text-sm leading-relaxed"
                    value={state.editedText ?? state.polishedText}
                    onChange={(e) => onEditChange(e.target.value)}
                  />
                ) : (
                  <div className="text-sm text-ink whitespace-pre-wrap leading-relaxed bg-cream/50 rounded p-3 border border-rule">
                    {state.editedText ?? state.polishedText}
                  </div>
                )}
              </div>
            </div>

            {state.phase !== 'editing' && (
              <div>
                <div className="text-2xs uppercase tracking-widest text-ink-muted mb-1">What changed</div>
                <div className="bg-cream/60 rounded p-3 border border-rule">
                  <Diff before={row.notes_internal} after={state.editedText ?? state.polishedText ?? ''} />
                </div>
              </div>
            )}

            <div className="flex items-center gap-2 flex-wrap">
              {state.phase !== 'editing' && (
                <button type="button" onClick={onApprove} disabled={state.phase === 'sending'} className="btn-primary text-xs" style={{ height: 32, minHeight: 32 }}>
                  {state.phase === 'sending' ? 'Sending…' : 'Approve and send'}
                </button>
              )}
              <button
                type="button"
                onClick={onEditToggle}
                className="btn-secondary text-xs"
                style={{ height: 32, minHeight: 32 }}
              >
                {state.phase === 'editing' ? 'Done editing' : 'Edit'}
              </button>
              <button type="button" onClick={onDiscard} className="btn-ghost text-xs" style={{ height: 32, minHeight: 32 }}>
                Discard polish
              </button>
              <Link href={`/app/sessions/${row.id}`} className="ml-auto text-2xs text-ink-muted hover:text-ink underline underline-offset-2">
                Open session →
              </Link>
            </div>
          </div>
        )}
      </div>
      <style jsx>{`
        @keyframes polish-pulse-kf {
          0%, 100% { box-shadow: 0 0 0 0 rgba(31, 58, 46, 0.18); }
          50%      { box-shadow: 0 0 0 6px rgba(31, 58, 46, 0); }
        }
        :global(.polish-pulse) { animation: polish-pulse-kf 1.6s ease-in-out infinite; }
      `}</style>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Queue cleared anticipation card
// ---------------------------------------------------------------------------

function QueueClearedCard({ polishedToday, signaturePhrase }: { polishedToday: number; signaturePhrase: string | null }) {
  return (
    <div className="card p-10 text-center max-w-2xl">
      <div className="mx-auto mb-4 grid place-items-center w-12 h-12 rounded-full bg-forest-soft text-forest">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 13l4 4L19 7"/>
        </svg>
      </div>
      <h2 className="font-display text-xl tracking-tightest text-ink mb-1">Queue cleared.</h2>
      {polishedToday > 0 && (
        <p className="text-sm text-ink-muted mb-1 num tabular">
          {polishedToday} {polishedToday === 1 ? 'session' : 'sessions'} polished recently.
        </p>
      )}
      {signaturePhrase && (
        <p className="text-xs text-ink-muted italic">
          Most-used phrase: "{signaturePhrase}"
        </p>
      )}
    </div>
  );
}

function PolishQueueSkeleton() {
  return (
    <ul className="space-y-3 max-w-3xl">
      {Array.from({ length: 4 }, (_, i) => (
        <li key={i} className="card p-5">
          <div className="skeleton-shimmer h-3 w-48 mb-3 rounded" />
          <div className="skeleton-shimmer h-2.5 w-2/3 mb-3 rounded" />
          <div className="skeleton-shimmer h-7 w-32 rounded" />
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractMostUsedPhrase(texts: string[]): string | null {
  if (texts.length === 0) return null;
  // Compute 3-5 word ngrams, count frequencies, pick the most common with
  // length > 12 chars (so we don't return "the the the").
  const counts = new Map<string, number>();
  for (const t of texts) {
    const tokens = t.toLowerCase().replace(/[^\w\s]/g, ' ').split(/\s+/).filter(Boolean);
    for (let n = 5; n >= 3; n--) {
      for (let i = 0; i + n <= tokens.length; i++) {
        const phrase = tokens.slice(i, i + n).join(' ');
        if (phrase.length < 12) continue;
        if (/^\d|^and |^the |^to |^of |^in |^that /.test(phrase)) continue;
        counts.set(phrase, (counts.get(phrase) ?? 0) + 1);
      }
    }
  }
  let best: string | null = null;
  let bestN = 1;
  for (const [p, n] of counts) {
    if (n > bestN) { bestN = n; best = p; }
  }
  return bestN >= 2 ? best : null;
}

function spawnConfetti() {
  if (typeof window === 'undefined') return;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  const root = document.createElement('div');
  root.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:200;overflow:hidden;';
  const colors = ['#1F3A2E', '#2F7D4F', '#B8860B'];
  for (let i = 0; i < 24; i++) {
    const piece = document.createElement('span');
    const left = Math.random() * 100;
    const delay = Math.random() * 200;
    const duration = 500 + Math.random() * 300;
    const color = colors[i % colors.length];
    piece.style.cssText = `position:absolute;top:50%;left:${left}vw;width:6px;height:8px;background:${color};border-radius:1px;transform:translateY(0);transition:transform ${duration}ms ease-out, opacity ${duration}ms ease-out;opacity:1;`;
    root.appendChild(piece);
    setTimeout(() => {
      piece.style.transform = `translate(${(Math.random() - 0.5) * 200}px, ${-150 - Math.random() * 100}px) rotate(${Math.random() * 360}deg)`;
      piece.style.opacity = '0';
    }, delay);
  }
  document.body.appendChild(root);
  setTimeout(() => root.remove(), 900);
}

export default function Page() {
  return <AuthGuard><PolishQueueInner /></AuthGuard>;
}
