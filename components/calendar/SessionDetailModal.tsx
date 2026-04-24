import { useState } from 'react';
import { Modal } from '../design/Modal';
import { Badge } from '../design/Badge';
import { supabase } from '../../lib/supabase';
import type { CalendarSession } from './types';

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
  async function doTutorCancel() {
    const ok = await call(`/api/sessions/${session!.id}/cancel`, { message });
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

  const whenDisplay = scheduled.toLocaleString('en-AU', {
    weekday: 'long', day: 'numeric', month: 'long',
    hour: 'numeric', minute: '2-digit',
  });
  const proposedDisplay = session.proposed_new_start_time
    ? new Date(session.proposed_new_start_time).toLocaleString('en-AU', {
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
                  <span className="text-2xs text-ink-soft">Past session — no actions available.</span>
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
