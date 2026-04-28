import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import AuthGuardParent from '../../../../components/AuthGuardParent';
import ParentLayout from '../../../../components/parent/ParentLayout';
import { authFetch } from '../../../../lib/authFetch';

// /parent/student/[id]/access — manage / revoke student portal access.

type Access = {
  enabled: boolean;
  parental_consent_required: boolean;
  parental_consent_given_at: string | null;
  invitation_email: string | null;
  invitation_sent_at: string | null;
  accepted_at: string | null;
  enabled_at: string | null;
  disabled_at: string | null;
  disabled_reason: string | null;
};

type State = {
  loaded: boolean;
  studentName: string | null;
  access: Access | null;
  lastLoginAt: string | null;
};

function Inner() {
  const router = useRouter();
  const studentId = router.query.id as string | undefined;
  const [state, setState] = useState<State>({ loaded: false, studentName: null, access: null, lastLoginAt: null });
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (!studentId) return;
    setError(null);
    const res = await authFetch(`/api/parent/student-access?student_id=${studentId}`);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data?.error ?? 'Could not load.');
      setState({ loaded: true, studentName: null, access: null, lastLoginAt: null });
      return;
    }
    const data = await res.json();
    setState({
      loaded: true,
      studentName: data.student_name,
      access: data.access,
      lastLoginAt: data.last_login_at,
    });
  }

  useEffect(() => { void load(); /* eslint-disable-line */ }, [studentId]);

  async function revoke() {
    setBusy(true);
    try {
      const res = await authFetch('/api/student-access/revoke-by-parent', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ student_id: studentId }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Could not revoke.'); return; }
      setConfirm(false);
      await load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <ParentLayout title="Student access" noTabs>
      <div className="max-w-[640px] mx-auto px-6 py-10">
        <Link href={`/parent/student/${studentId}`} className="text-sm text-ink-muted">← Back</Link>

        <h1 className="font-display text-3xl tracking-tightest mt-4">
          Student portal access
          {state.studentName && <span className="text-ink-muted"> · {state.studentName}</span>}
        </h1>

        {error && <div className="mt-4 text-sm text-claret">{error}</div>}

        {!state.loaded ? (
          <p className="mt-6 text-sm text-ink-muted">Loading…</p>
        ) : !state.access ? (
          <p className="mt-6 text-sm text-ink-muted">No access has been set up yet.</p>
        ) : (
          <section className="mt-6 card p-5">
            <Status access={state.access} lastLoginAt={state.lastLoginAt} />
            {state.access.enabled && state.access.accepted_at && (
              <button
                type="button"
                onClick={() => setConfirm(true)}
                className="mt-4 btn-ghost text-sm text-claret hover:text-claret"
              >
                Revoke access
              </button>
            )}
          </section>
        )}

        {confirm && (
          <div role="dialog" aria-modal="true"
            className="fixed inset-0 z-[80] bg-ink/40 flex items-center justify-center px-4"
            onClick={() => setConfirm(false)}>
            <div className="bg-surface border border-rule rounded-md max-w-[420px] w-full p-5"
              onClick={(e) => e.stopPropagation()}>
              <h2 className="font-display text-xl">Revoke access for {state.studentName}?</h2>
              <p className="text-sm text-ink-muted mt-2">
                {state.studentName} will no longer be able to sign in. The tutoring records stay with your tutor.
              </p>
              <div className="mt-5 flex justify-end gap-2">
                <button type="button" onClick={() => setConfirm(false)} className="btn-ghost text-sm">Cancel</button>
                <button type="button" onClick={revoke} disabled={busy}
                  className="btn-primary text-sm bg-claret hover:bg-claret">
                  {busy ? 'Revoking…' : 'Revoke access'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </ParentLayout>
  );
}

function Status({ access, lastLoginAt }: { access: Access; lastLoginAt: string | null }) {
  if (access.disabled_at) return (
    <>
      <div className="text-2xs uppercase tracking-widest text-ink-muted mb-1">Status</div>
      <div className="text-sm text-ink">Disabled · {access.disabled_reason ?? 'No reason given'}</div>
      <div className="text-2xs text-ink-soft mt-1">{formatRelative(access.disabled_at)}</div>
    </>
  );
  if (access.accepted_at) return (
    <>
      <div className="text-2xs uppercase tracking-widest text-ink-muted mb-1">Status</div>
      <div className="text-sm text-ink">Active</div>
      <div className="text-2xs text-ink-soft mt-1">
        Last login: {lastLoginAt ? formatRelative(lastLoginAt) : 'never'}
      </div>
    </>
  );
  if (access.parental_consent_given_at && access.invitation_sent_at) return (
    <>
      <div className="text-2xs uppercase tracking-widest text-ink-muted mb-1">Status</div>
      <div className="text-sm text-ink">Invitation sent</div>
      <div className="text-2xs text-ink-soft mt-1">{access.invitation_email}</div>
    </>
  );
  if (access.parental_consent_required && !access.parental_consent_given_at) return (
    <>
      <div className="text-2xs uppercase tracking-widest text-ink-muted mb-1">Status</div>
      <div className="text-sm text-ink">Awaiting your approval</div>
    </>
  );
  return (
    <>
      <div className="text-2xs uppercase tracking-widest text-ink-muted mb-1">Status</div>
      <div className="text-sm text-ink">Pending</div>
    </>
  );
}

function formatRelative(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400_000);
  if (days < 1) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function Page() {
  return <AuthGuardParent><Inner /></AuthGuardParent>;
}
