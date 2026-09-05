import { useEffect, useState } from 'react';
import { authFetch } from '../../lib/authFetch';
import { ageInYears } from '../../lib/ageInYears';

// Tutor-side "Student access" card.  Renders pre-conditions, the toggle,
// status, and resend / disable buttons.

type Access = {
  enabled: boolean;
  parental_consent_required: boolean;
  parental_consent_given_at: string | null;
  invitation_email: string | null;
  invitation_sent_at: string | null;
  invitation_expires_at: string | null;
  accepted_at: string | null;
  enabled_at: string | null;
  disabled_at: string | null;
  disabled_reason: string | null;
};

type Props = {
  studentId: string;
  studentName: string;
  dateOfBirth: string | null;
  parentEmail: string | null;
  /** Number of linked parents — used for the under-16 pre-condition. */
  hasLinkedParent: boolean;
};

export function StudentAccessCard({ studentId, studentName, dateOfBirth, parentEmail, hasLinkedParent }: Props) {
  const [access, setAccess] = useState<Access | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [emailDraft, setEmailDraft] = useState(parentEmail ?? '');
  const [confirmDisable, setConfirmDisable] = useState(false);
  const [disableReason, setDisableReason] = useState('');

  async function load() {
    const res = await authFetch(`/api/parent/student-access?student_id=${studentId}`).catch(() => null);
    // Tutor can also use the parent-facing read endpoint? — no: build a tutor variant.
    // Quick fallback: read via supabase directly through public select.
    const r2 = await authFetch(`/api/student-access/state?student_id=${studentId}`);
    if (r2.ok) {
      const data = await r2.json();
      setAccess(data.access);
    }
    setLoaded(true);
  }

  useEffect(() => { void load(); /* eslint-disable-line */ }, [studentId]);

  const age = ageInYears(dateOfBirth);
  const requiresConsent = age == null || age < 16;
  const ineligibleReasons: string[] = [];
  if (!dateOfBirth) ineligibleReasons.push('Set the student\'s date of birth first.');
  if (requiresConsent && !hasLinkedParent) ineligibleReasons.push('Add a parent before enabling for under-16 students.');

  async function call(path: string, body: Record<string, unknown>): Promise<{ ok: boolean; data: any }> {
    setError(null); setInfo(null); setBusy(true);
    try {
      const res = await authFetch(path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Failed.'); return { ok: false, data }; }
      return { ok: true, data };
    } finally { setBusy(false); }
  }

  async function enable() {
    if (ineligibleReasons.length > 0) return;
    const result = await call('/api/student-access/enable', {
      student_id: studentId,
      email: emailDraft,
    });
    if (result.ok) {
      setInfo(result.data.state === 'awaiting_consent'
        ? 'Sent consent request to the parent.'
        : 'Invitation sent.');
      await load();
    }
  }

  async function resend() {
    const path = (access?.parental_consent_required && !access.parental_consent_given_at)
      ? '/api/student-access/resend-consent'
      : '/api/student-access/resend-invitation';
    const r = await call(path, { student_id: studentId });
    if (r.ok) { setInfo('Sent.'); await load(); }
  }

  async function disable() {
    const r = await call('/api/student-access/disable', { student_id: studentId, reason: disableReason || null });
    if (r.ok) {
      setInfo('Access disabled.');
      setConfirmDisable(false);
      setDisableReason('');
      await load();
    }
  }

  return (
    <section className="card p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-2xs uppercase tracking-widest text-ink-muted">Student access</div>
          <div className="text-sm text-ink mt-1">
            {!loaded ? 'Loading…' : describe(access)}
          </div>
        </div>
      </div>

      {ineligibleReasons.length > 0 && !access?.accepted_at && !access?.enabled_at && (
        <ul className="mt-3 text-2xs text-amber-ink list-disc pl-4 space-y-1">
          {ineligibleReasons.map((r) => <li key={r}>{r}</li>)}
        </ul>
      )}

      {loaded && !access && ineligibleReasons.length === 0 && (
        <div className="mt-3 space-y-2">
          {!requiresConsent && (
            <input
              type="email" placeholder={`${studentName.split(' ')[0]}'s email`}
              value={emailDraft} onChange={(e) => setEmailDraft(e.target.value)}
              className="input text-sm"
            />
          )}
          <button type="button" disabled={busy} onClick={enable} className="btn-primary text-sm">
            {busy ? 'Working…' : `Allow ${studentName.split(' ')[0]} to log in`}
          </button>
          <p className="text-2xs text-ink-soft">
            {requiresConsent
              ? `${studentName.split(' ')[0]} is under 16, so the invitation goes to a parent first for consent.`
              : `Invitation goes to ${studentName.split(' ')[0]} directly.`}
          </p>
        </div>
      )}

      {loaded && access && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {!access.accepted_at && !access.disabled_at && (
            <button type="button" onClick={resend} disabled={busy} className="btn-ghost text-2xs">
              {access.parental_consent_required && !access.parental_consent_given_at ? 'Resend consent request' : 'Resend invitation'}
            </button>
          )}
          {!access.disabled_at && (
            <button type="button" onClick={() => setConfirmDisable(true)} disabled={busy} className="btn-ghost text-2xs text-claret hover:text-claret">
              Disable access
            </button>
          )}
          {access.disabled_at && (
            <button type="button" onClick={enable} disabled={busy} className="btn-ghost text-2xs">
              Re-enable
            </button>
          )}
        </div>
      )}

      {confirmDisable && (
        <div className="mt-3 p-3 bg-ruleSoft/40 rounded-md">
          <p className="text-sm text-ink mb-2">Disable access for {studentName}?</p>
          <input
            type="text"
            placeholder="Reason (optional)"
            value={disableReason}
            onChange={(e) => setDisableReason(e.target.value)}
            className="input text-sm w-full mb-2"
          />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setConfirmDisable(false)} className="btn-ghost text-2xs">Cancel</button>
            <button type="button" onClick={disable} disabled={busy} className="btn-primary text-2xs bg-claret hover:bg-claret">
              {busy ? 'Disabling…' : 'Disable'}
            </button>
          </div>
        </div>
      )}

      {error && <div className="mt-2 text-2xs text-claret">{error}</div>}
      {info && <div className="mt-2 text-2xs text-forest-ink">{info}</div>}
    </section>
  );
}

function describe(a: Access | null): string {
  if (!a) return 'Not yet set up.';
  if (a.disabled_at) return `Disabled${a.disabled_reason ? `: ${a.disabled_reason}` : ''}.`;
  if (a.accepted_at) return `Active since ${formatDate(a.enabled_at ?? a.accepted_at)}.`;
  if (a.parental_consent_required && !a.parental_consent_given_at) return 'Waiting for parental consent.';
  if (a.invitation_sent_at) return `Invitation sent to ${a.invitation_email ?? 'student'}.`;
  return 'Pending.';
}

function formatDate(iso: string | null): string {
  if (!iso) return '–';
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export default StudentAccessCard;
