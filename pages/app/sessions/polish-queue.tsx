import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import AuthGuard from '../../../components/AuthGuard';
import Layout from '../../../components/Layout';
import { Diff } from '../../../components/design/Diff';
import { supabase } from '../../../lib/supabase';
import { activeLocale } from '../../../lib/utils';

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
  polishing?: boolean;
  polished?: string | null;
  polish_error?: string | null;
};

const LOOKBACK_DAYS = 14;
const BATCH_SIZE = 5;

function PolishQueueInner() {
  const [showSkipped, setShowSkipped] = useState(false);
  const [rows, setRows] = useState<QueueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [batchBusy, setBatchBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const since = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000).toISOString();
    const q = supabase
      .from('sessions')
      .select('id, student_id, scheduled_at, duration_minutes, subject, notes_internal, notes_parent_facing, polish_skipped, student:students!inner(id, name)')
      .eq('status', 'completed')
      .gte('scheduled_at', since)
      .order('scheduled_at', { ascending: false });
    const { data } = await q;
    const filtered = ((data ?? []) as any[])
      .filter((s) => s.notes_internal && s.notes_internal.trim().length >= 5)
      .filter((s) => !s.notes_parent_facing)
      .filter((s) => showSkipped ? true : !s.polish_skipped)
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
    setLoading(false);
  }, [showSkipped]);

  useEffect(() => { load(); }, [load]);

  async function polishOne(row: QueueRow): Promise<string | null> {
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
        // Intentionally NOT passing sessionId — we want the tutor to approve
        // before we write notes_parent_facing.
      }),
    });
    const payload = await res.json().catch(() => ({} as any));
    if (!res.ok) return null;
    return typeof payload.polishedNotes === 'string' ? payload.polishedNotes : null;
  }

  async function polishRow(id: string) {
    const row = rows.find((r) => r.id === id); if (!row) return;
    setRows((prev) => prev.map((r) => r.id === id ? { ...r, polishing: true, polish_error: null } : r));
    const polished = await polishOne(row);
    setRows((prev) => prev.map((r) => r.id === id ? {
      ...r, polishing: false, polished, polish_error: polished ? null : 'Could not polish — try again.',
    } : r));
    if (polished) setOpenId(id);
  }

  // Slim progress for "Polish all" — emitted as a 0-100% via the bar at the
  // top of the page; cancellable any time via the X button.
  const [batchProgress, setBatchProgress] = useState<{ done: number; total: number } | null>(null);
  const [batchCancel, setBatchCancel] = useState(false);

  async function polishNextN(n: number) {
    const queue = rows.filter((r) => !r.polished && !r.polishing).slice(0, n);
    if (queue.length === 0) return;
    setBatchBusy(true);
    setBatchCancel(false);
    setBatchProgress({ done: 0, total: queue.length });
    try {
      // Sequential to keep the progress bar honest (and to be friendlier to
      // the polish endpoint's rate limit).
      for (let i = 0; i < queue.length; i++) {
        if (batchCancel) break;
        await polishRow(queue[i].id);
        setBatchProgress({ done: i + 1, total: queue.length });
      }
    } finally {
      setBatchBusy(false);
      setBatchProgress(null);
      setBatchCancel(false);
    }
  }

  function cancelBatch() {
    setBatchCancel(true);
  }

  async function approve(id: string, editedText: string) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return;
    const { error } = await supabase
      .from('sessions')
      .update({ notes_parent_facing: editedText.trim(), notes_polished_by_ai: true })
      .eq('id', id);
    if (error) return;
    setRows((prev) => prev.filter((r) => r.id !== id));
    const next = rows.find((r) => r.id !== id && r.polished);
    setOpenId(next?.id ?? null);
  }

  async function skip(id: string) {
    const { error } = await supabase.from('sessions').update({ polish_skipped: true }).eq('id', id);
    if (error) return;
    setRows((prev) => showSkipped
      ? prev.map((r) => r.id === id ? { ...r, polish_skipped: true } : r)
      : prev.filter((r) => r.id !== id));
    setOpenId(null);
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
      {/* Slim progress bar at the top of the page during "Polish all". */}
      {batchProgress && (
        <div className="fixed top-14 left-0 right-0 z-40 h-0.5 bg-ruleSoft pointer-events-none">
          <div
            className="h-full bg-forest transition-[width] duration-200 ease-out"
            style={{ width: `${(batchProgress.done / batchProgress.total) * 100}%` }}
          />
          <button
            type="button"
            onClick={cancelBatch}
            className="pointer-events-auto absolute right-3 top-1.5 text-2xs text-ink-muted hover:text-ink underline underline-offset-2"
          >
            Cancel
          </button>
          <div className="absolute left-3 top-1.5 text-2xs text-ink-muted num tabular">
            Polished {batchProgress.done} of {batchProgress.total}
          </div>
        </div>
      )}

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
        <div className="card p-6 text-sm text-ink-muted">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="card p-10 text-center">
          <div className="text-2xs uppercase tracking-widest text-ink-muted mb-2">Inbox zero</div>
          <p className="text-sm text-ink-muted">No sessions waiting to be polished.</p>
        </div>
      ) : (
        <ul className="space-y-3 max-w-3xl">
          {rows.map((r) => (
            <li key={r.id}>
              <div className="card">
                <button
                  type="button"
                  onClick={() => setOpenId((prev) => prev === r.id ? null : r.id)}
                  className="w-full text-left px-5 py-4 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="text-sm text-ink truncate">
                      <strong>{r.student_name}</strong>
                      {' · '}
                      {new Date(r.scheduled_at).toLocaleDateString(activeLocale(), { day: 'numeric', month: 'short' })}
                      {r.subject ? ` · ${r.subject}` : ''}
                    </div>
                    <div className="text-2xs text-ink-muted truncate">
                      {r.notes_internal.slice(0, 120)}{r.notes_internal.length > 120 ? '…' : ''}
                    </div>
                  </div>
                  <div className="shrink-0 flex items-center gap-2">
                    {r.polish_skipped && <span className="badge-neutral">Skipped</span>}
                    {r.polished && <span className="badge-forest">Ready</span>}
                    {r.polishing && <span className="text-2xs text-ink-soft">Polishing…</span>}
                    <span className="text-ink-soft">{openId === r.id ? '▲' : '▼'}</span>
                  </div>
                </button>

                {openId === r.id && (
                  <div className="px-5 pb-5 space-y-4 border-t border-rule pt-4">
                    <div className="grid md:grid-cols-2 gap-4">
                      <div>
                        <div className="text-2xs uppercase tracking-widest text-ink-muted mb-1">Original</div>
                        <div className="text-sm text-ink-muted whitespace-pre-wrap bg-ruleSoft/40 rounded p-3 border border-rule">
                          {r.notes_internal}
                        </div>
                      </div>
                      <div>
                        <div className="text-2xs uppercase tracking-widest text-ink-muted mb-1">Polished</div>
                        <InlineEditor
                          initial={r.polished ?? ''}
                          onApprove={(text) => approve(r.id, text)}
                          disabled={!r.polished}
                        />
                        {!r.polished && !r.polishing && (
                          <button type="button" onClick={() => polishRow(r.id)}
                            className="btn-secondary text-xs w-full mt-2">
                            Polish with AI
                          </button>
                        )}
                        {r.polish_error && <div className="text-2xs text-claret mt-1">{r.polish_error}</div>}
                      </div>
                    </div>
                    {r.polished && (
                      <div>
                        <div className="text-2xs uppercase tracking-widest text-ink-muted mb-1">What changed</div>
                        <div className="bg-cream/60 rounded p-3 border border-rule">
                          <Diff before={r.notes_internal} after={r.polished} />
                        </div>
                      </div>
                    )}
                    <div className="flex gap-2">
                      {r.polish_skipped ? (
                        <button type="button" onClick={() => unskip(r.id)} className="btn-ghost text-xs">Un-skip</button>
                      ) : (
                        <button type="button" onClick={() => skip(r.id)} className="btn-ghost text-xs">Skip</button>
                      )}
                      <Link href={`/app/sessions/${r.id}`} className="btn-ghost text-xs ml-auto">
                        Open session →
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Layout>
  );
}

function InlineEditor({
  initial, onApprove, disabled,
}: { initial: string; onApprove: (text: string) => void; disabled?: boolean }) {
  const [value, setValue] = useState(initial);
  useEffect(() => { setValue(initial); }, [initial]);
  return (
    <div>
      <textarea
        rows={6}
        className="input text-sm"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={disabled}
        placeholder={disabled ? 'Click "Polish with AI" first.' : ''}
      />
      <button
        type="button"
        onClick={() => onApprove(value)}
        disabled={disabled || !value.trim()}
        className="btn-primary text-xs w-full mt-2"
      >
        Use polished
      </button>
    </div>
  );
}

export default function Page() {
  return <AuthGuard><PolishQueueInner /></AuthGuard>;
}
