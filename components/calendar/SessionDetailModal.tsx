import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Modal } from '../design/Modal';
import { Badge } from '../design/Badge';
import { supabase } from '../../lib/supabase';
import type { CalendarSession } from './types';
import { activeLocale } from '../../lib/utils';

type SessionFileRow = {
  id: string;
  display_name: string;
  mime_type: string;
  file_size_bytes: number;
};

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

type Props = {
  open: boolean;
  onClose: () => void;
  session: CalendarSession | null;
  onChanged: () => void;              // refetch after mutation
  mode: 'tutor' | 'parent';
};

export function SessionDetailModal({ open, onClose, session, onChanged, mode }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<'root' | 'reschedule' | 'cancel'>('root');

  const [newDate, setNewDate] = useState('');
  const [newTime, setNewTime] = useState('');
  const [newDuration, setNewDuration] = useState(60);
  const [message, setMessage] = useState('');

  const [sessionFiles, setSessionFiles] = useState<SessionFileRow[]>([]);

  useEffect(() => {
    if (!open || !session?.id) { setSessionFiles([]); return; }
    let cancelled = false;
    (async () => {
      // RLS lets parents (linked) and org members read these.
      const { data } = await supabase
        .from('files')
        .select('id, display_name, mime_type, file_size_bytes')
        .eq('session_id', session.id)
        .eq('status', 'ready')
        .is('deleted_at', null)
        .order('created_at', { ascending: false });
      if (cancelled) return;
      setSessionFiles((data as SessionFileRow[]) ?? []);
    })();
    return () => { cancelled = true; };
  }, [open, session?.id]);

  if (!session) return null;

  const scheduled = new Date(session.scheduled_at);
  const isPast = scheduled.getTime() < Date.now();
  const isPending = session.status === 'pending_change';
  const isParentProposed = isPending && session.proposed_change_by === 'parent';

  async function auth() {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  }

  function buildIso(): string | null {
    if (!newDate || !newTime) return null;
    const [y, m, d] = newDate.split('-').map(Number);
    const [hh, mm] = newTime.split(':').map(Number);
    return new Date(y, m - 1, d, hh, mm, 0).toISOString();
  }

  async function call(path: string, body: any) {
    setBusy(true); setError(null);
    try {
      const token = await auth(); if (!token) { setError('Not signed in.'); return false; }
      const res = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const p = await res.json().catch(() => ({}));
      if (!res.ok) { setError(p?.error ?? 'Request failed.'); return false; }
      return true;
    } finally { setBusy(false); }
  }

  async function doTutorReschedule() {
    const iso = buildIso(); if (!iso) { setError('Pick a date and time.'); return; }
    const ok = await call(`/api/sessions/${session!.id}/reschedule`, {
      new_start_time: iso, new_duration_minutes: newDuration, message,
    });
    if (ok) { onChanged(); onClose(); }
  }
  const [cancelledBy, setCancelledBy] = useState<'family' | 'tutor' | 'agency'>('family');
  const [waive, setWaive] = useState(false);
  async function doTutorCancel() {
    const ok = await call(`/api/sessions/${session!.id}/cancel`, { message, cancelled_by: cancelledBy, waive });
    if (ok) { onChanged(); onClose(); }
  }
  async function doMark(status: 'completed' | 'no_show') {
    const ok = await call(`/api/sessions/${session!.id}/mark-status`, { status });
    if (ok) { onChanged(); onClose(); }
  }
  async function doRespond(decision: 'accept' | 'reject') {
    const ok = await call(`/api/sessions/${session!.id}/respond-to-proposal`, { decision, message });
    if (ok) { onChanged(); onClose(); }
  }
  async function doParentPropose(kind: 'reschedule' | 'cancel') {
    const body: any = { kind, message };
    if (kind === 'reschedule') {
      const iso = buildIso(); if (!iso) { setError('Pick a date and time.'); return; }
      body.new_start_time = iso; body.new_duration_minutes = newDuration;
    }
    const ok = await call(`/api/parent/sessions/${session!.id}/propose-change`, body);
    if (ok) { onChanged(); onClose(); }
  }
  async function doParentWithdraw() {
    const ok = await call(`/api/parent/sessions/${session!.id}/withdraw-proposal`, {});
    if (ok) { onChanged(); onClose(); }
  }

  const whenDisplay = scheduled.toLocaleString(activeLocale(), {
    weekday: 'long', day: 'numeric', month: 'long',
    hour: 'numeric', minute: '2-digit',
  });
  const proposedDisplay = session.proposed_new_start_time
    ? new Date(session.proposed_new_start_time).toLocaleString(activeLocale(), {
        weekday: 'long', day: 'numeric', month: 'long',
        hour: 'numeric', minute: '2-digit',
      })
    : null;

  return (
    <Modal open={open} onClose={onClose} title={session.student_name} size="md">
      <div className="space-y-4">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant={
            session.status === 'completed' ? 'success' :
            session.status === 'cancelled' ? 'danger' :
            session.status === 'pending_change' ? 'warning' :
            session.status === 'no_show' ? 'danger' :
            'neutral'
          }>
            {session.status.replace('_', ' ')}
          </Badge>
          {session.subject && <span className="text-sm text-ink-muted">{session.subject}</span>}
        </div>

        <div className="text-sm text-ink">
          <div className="text-2xs uppercase tracking-widest text-ink-muted mb-1">When</div>
          <div>{whenDisplay} · {session.duration_minutes} min</div>
        </div>

        {sessionFiles.length > 0 && view === 'root' && (
          <div>
            <div className="text-2xs uppercase tracking-widest text-ink-muted mb-2">
              Files for this session
            </div>
            <ul className="space-y-1.5">
              {sessionFiles.map((f) => (
                <li key={f.id}>
                  <Link
                    href={`/files/${f.id}`}
                    className="card p-3 flex items-center justify-between gap-3 text-sm hover:shadow-lift transition-shadow"
                  >
                    <span className="truncate">{f.display_name}</span>
                    <span className="text-2xs text-ink-soft shrink-0">
                      {f.mime_type === 'application/pdf' ? 'PDF' : f.mime_type.startsWith('image/') ? 'Image' : 'File'}
                      {' · '}{fmtBytes(f.file_size_bytes)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}

        {isParentProposed && mode === 'tutor' && view === 'root' && (
          <div className="card p-4 bg-amber-soft/30 border-amber/50">
            <div className="text-2xs uppercase tracking-widest text-amber-ink mb-1">
              Parent {session.proposed_new_start_time ? 'reschedule' : 'cancellation'} request
            </div>
            {proposedDisplay && (
              <div className="text-sm text-ink">
                Proposed new time: <strong>{proposedDisplay}</strong>
              </div>
            )}
            {session.status === 'pending_change' && (
              <div className="text-xs text-ink-muted mt-2">
                <label className="label">Optional reply to the parent</label>
                <textarea
                  className="input" rows={2} value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Any reason or alternative…"
                />
              </div>
            )}
            <div className="flex gap-2 pt-3">
              <button type="button" onClick={() => doRespond('accept')} disabled={busy} className="btn-primary flex-1">
                Accept
              </button>
              <button type="button" onClick={() => doRespond('reject')} disabled={busy} className="btn-secondary">
                Reject
              </button>
            </div>
            {error && <div className="text-sm text-claret mt-2">{error}</div>}
          </div>
        )}

        {view === 'root' && !isParentProposed && (
          <div className="pt-2 border-t border-rule">
            {mode === 'tutor' ? (
              <div className="flex flex-wrap gap-2">
                {!isPast && session.status !== 'cancelled' && session.status !== 'completed' && (
                  <>
                    <button type="button" onClick={() => setView('reschedule')} className="btn-secondary text-xs">Reschedule</button>
                    <button type="button" onClick={() => setView('cancel')} className="btn-danger text-xs">Cancel</button>
                  </>
                )}
                {isPast && session.status !== 'completed' && session.status !== 'cancelled' && (
                  <>
                    <button type="button" onClick={() => doMark('completed')} disabled={busy} className="btn-primary text-xs">
                      Mark complete
                    </button>
                    <button type="button" onClick={() => doMark('no_show')} disabled={busy} className="btn-secondary text-xs">
                      Mark no-show
                    </button>
                  </>
                )}
                {isPending && session.proposed_change_by === 'tutor' && (
                  <div className="text-xs text-ink-muted">Pending parent response to your proposal.</div>
                )}
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {!isPast && session.status !== 'cancelled' && session.status !== 'completed' && (
                  <>
                    <button type="button" onClick={() => setView('reschedule')} className="btn-secondary text-xs">Request reschedule</button>
                    <button type="button" onClick={() => setView('cancel')} className="btn-danger text-xs">Request cancellation</button>
                  </>
                )}
                {isPending && session.proposed_change_by === 'parent' && (
                  <button type="button" onClick={doParentWithdraw} disabled={busy} className="btn-ghost text-xs">
                    Withdraw my request
                  </button>
                )}
                {isPast && (
                  <span className="text-2xs text-ink-soft">Past session. No actions available.</span>
                )}
              </div>
            )}
            {error && <div className="text-sm text-claret mt-2">{error}</div>}
          </div>
        )}

        {view === 'reschedule' && (
          <div className="space-y-3 pt-2 border-t border-rule">
            <div className="text-2xs uppercase tracking-widest text-ink-muted">
              {mode === 'tutor' ? 'Reschedule session' : 'Request a new time'}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <input type="date" className="input" value={newDate} onChange={(e) => setNewDate(e.target.value)} />
              <input type="time" className="input" value={newTime} onChange={(e) => setNewTime(e.target.value)} />
            </div>
            <div>
              <label className="label">Duration (mins)</label>
              <input type="number" className="input" min={15} max={480} step={15}
                value={newDuration} onChange={(e) => setNewDuration(Number(e.target.value))} />
            </div>
            <div>
              <label className="label">{mode === 'tutor' ? 'Note to parent (optional)' : 'Reason (optional)'}</label>
              <textarea className="input" rows={2} value={message} onChange={(e) => setMessage(e.target.value)} />
            </div>
            {error && <div className="text-sm text-claret">{error}</div>}
            <div className="flex gap-2">
              <button type="button" onClick={() => mode === 'tutor' ? doTutorReschedule() : doParentPropose('reschedule')}
                disabled={busy} className="btn-primary flex-1">
                {busy ? 'Saving…' : mode === 'tutor' ? 'Reschedule' : 'Send request'}
              </button>
              <button type="button" onClick={() => setView('root')} className="btn-ghost">Back</button>
            </div>
          </div>
        )}

        {view === 'cancel' && (
          <div className="space-y-3 pt-2 border-t border-rule">
            <div className="text-2xs uppercase tracking-widest text-claret">
              {mode === 'tutor' ? 'Cancel session' : 'Request cancellation'}
            </div>
            {mode === 'tutor' && (
              <div>
                <label className="label">Who is cancelling?</label>
                <div className="grid grid-cols-3 gap-2">
                  {([['family', 'The family'], ['tutor', 'The tutor'], ['agency', 'Crestio']] as Array<['family' | 'tutor' | 'agency', string]>).map(([k, l]) => (
                    <button key={k} type="button" onClick={() => setCancelledBy(k)} aria-pressed={cancelledBy === k}
                      className={['px-3 py-2 rounded-md border text-sm', cancelledBy === k ? 'bg-forest text-cream border-forest' : 'bg-surface border-rule text-ink hover:bg-ruleSoft'].join(' ')}>{l}</button>
                  ))}
                </div>
                {cancelledBy === 'family' && (
                  <div className="mt-2 text-2xs text-ink-soft">
                    A family cancellation inside 24 hours is charged and the tutor is paid.
                    <label className="flex items-center gap-2 mt-1.5 text-xs text-ink"><input type="checkbox" checked={waive} onChange={(e) => setWaive(e.target.checked)} /> Waive the charge this time</label>
                  </div>
                )}
              </div>
            )}
            <div>
              <label className="label">{mode === 'tutor' ? 'Reason for parent (optional)' : 'Reason (optional)'}</label>
              <textarea className="input" rows={3} value={message} onChange={(e) => setMessage(e.target.value)} />
            </div>
            {error && <div className="text-sm text-claret">{error}</div>}
            <div className="flex gap-2">
              <button type="button" onClick={() => mode === 'tutor' ? doTutorCancel() : doParentPropose('cancel')}
                disabled={busy} className="btn-danger flex-1">
                {busy ? 'Saving…' : mode === 'tutor' ? 'Confirm cancel' : 'Send request'}
              </button>
              <button type="button" onClick={() => setView('root')} className="btn-ghost">Back</button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

export default SessionDetailModal;
