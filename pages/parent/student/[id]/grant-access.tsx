import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import AuthGuardParent from '../../../../components/AuthGuardParent';
import ParentLayout from '../../../../components/parent/ParentLayout';
import { authFetch } from '../../../../lib/authFetch';

// Parent consent screen.  Renders the calm "what they will / won't see"
// frame and routes the parent's approve/decline action through
// /api/student-access/grant-consent.

type Validation = {
  valid: boolean;
  already_consented?: boolean;
  student_name?: string;
  student_email?: string | null;
  error?: string;
};

function Inner() {
  const router = useRouter();
  const studentId = router.query.id as string | undefined;
  const token = typeof router.query.token === 'string' ? router.query.token : '';
  const [v, setV] = useState<Validation | null>(null);
  const [studentEmail, setStudentEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tutorName, setTutorName] = useState<string>('');

  useEffect(() => {
    if (!router.isReady) return;
    if (!token) { setV({ valid: false, error: 'Missing token.' }); return; }
    (async () => {
      const res = await authFetch(`/api/student-access/grant-consent?token=${encodeURIComponent(token)}`);
      const data = await res.json();
      if (!res.ok) { setV({ valid: false, error: data.error ?? 'Could not validate.' }); return; }
      setV(data);
      if (data.student_email) setStudentEmail(data.student_email);
      // Pull tutor branding for the consent screen.
      // (parent already authenticated; we don't strictly need a separate API.)
    })();
  }, [router.isReady, token]);

  // Pull tutor branding for the consent screen header.
  useEffect(() => {
    if (!studentId) return;
    (async () => {
      const res = await authFetch(`/api/parent/students`);
      if (res.ok) {
        const data = await res.json();
        const stu = (data.students ?? []).find((s: any) => s.id === studentId);
        if (stu?.tutor_name) setTutorName(stu.tutor_name);
        else if (stu?.organization_name) setTutorName(stu.organization_name);
      }
    })();
  }, [studentId]);

  async function act(action: 'approve' | 'decline') {
    setError(null);
    if (action === 'approve' && !studentEmail) { setError('Enter the student\'s email.'); return; }
    setBusy(true);
    try {
      const res = await authFetch('/api/student-access/grant-consent', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token, action, student_email_for_invite: studentEmail }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Could not save.'); return; }
      router.push(`/parent/student/${studentId}?consent=${action}`);
    } finally {
      setBusy(false);
    }
  }

  if (!v) return <ParentLayout title="Loading"><div className="px-6 py-8 text-sm text-ink-muted">Loading…</div></ParentLayout>;
  if (!v.valid) return (
    <ParentLayout title="Invalid request" noTabs>
      <div className="max-w-[640px] mx-auto px-6 py-12">
        <h1 className="font-display text-3xl tracking-tightest">This link doesn't work</h1>
        <p className="text-sm text-ink-muted mt-2">{v.error ?? 'Try asking your tutor for a fresh link.'}</p>
        <Link href="/parent/dashboard" className="btn-ghost mt-6 inline-flex">Back to dashboard</Link>
      </div>
    </ParentLayout>
  );

  if (v.already_consented) return (
    <ParentLayout title="Already approved" noTabs>
      <div className="max-w-[640px] mx-auto px-6 py-12">
        <h1 className="font-display text-3xl tracking-tightest">Already approved</h1>
        <p className="text-sm text-ink-muted mt-2">
          You've already approved {v.student_name}'s portal access.
        </p>
        <Link href={`/parent/student/${studentId}`} className="btn-ghost mt-6 inline-flex">Back to {v.student_name}</Link>
      </div>
    </ParentLayout>
  );

  return (
    <ParentLayout title="Approve student portal access" noTabs>
      <div className="max-w-[640px] mx-auto px-6 py-10">
        <div className="text-2xs uppercase tracking-widest text-ink-muted mb-3">
          Parental consent
        </div>
        <h1 className="font-display text-3xl tracking-tightest">
          Approve student portal access for {v.student_name}?
        </h1>
        {tutorName && <p className="text-sm text-ink-muted mt-2">From {tutorName}.</p>}

        <section className="mt-8 card p-5">
          <h2 className="text-2xs uppercase tracking-widest text-ink-muted mb-3">
            What {v.student_name} will see
          </h2>
          <ul className="space-y-2 text-sm text-ink list-disc pl-5">
            <li>Their session schedule</li>
            <li>Polished session notes after each lesson</li>
            <li>Homework with checkboxes to mark done</li>
            <li>Files {tutorName || 'their tutor'} shares with them</li>
          </ul>
        </section>

        <section className="mt-4 card p-5">
          <h2 className="text-2xs uppercase tracking-widest text-ink-muted mb-3">
            What {v.student_name} will NOT see
          </h2>
          <ul className="space-y-2 text-sm text-ink list-disc pl-5">
            <li>Other students or your household details</li>
            <li>Invoices, payments, or anything about money</li>
            <li>Direct messaging with {tutorName || 'their tutor'} (homework questions go on session notes, which you also see)</li>
            <li>Marketing of any kind</li>
          </ul>
        </section>

        <section className="mt-4 card p-5">
          <h2 className="text-2xs uppercase tracking-widest text-ink-muted mb-3">
            Your privacy posture
          </h2>
          <ul className="space-y-2 text-sm text-ink list-disc pl-5">
            <li>All data stays under {tutorName || 'your tutor'}'s practice. No third-party sharing.</li>
            <li>You see everything your child sees, plus invoices and payments.</li>
            <li>Revoke access any time from this portal.</li>
          </ul>
        </section>

        <section className="mt-6">
          <label className="label" htmlFor="consent-email">{v.student_name}'s email</label>
          <input
            id="consent-email" type="email" required
            value={studentEmail} onChange={(e) => setStudentEmail(e.target.value)}
            className="input"
            placeholder="The invitation email goes here"
          />
        </section>

        {error && <div className="mt-4 text-sm text-claret">{error}</div>}

        <div className="mt-8 flex flex-col sm:flex-row gap-3">
          <button
            type="button" onClick={() => act('approve')} disabled={busy}
            className="btn-primary flex-1 py-3"
          >
            {busy ? 'Sending…' : `Approve and send invitation to ${v.student_name}`}
          </button>
          <button
            type="button" onClick={() => act('decline')} disabled={busy}
            className="btn-ghost py-3"
          >
            Decline
          </button>
        </div>
      </div>
    </ParentLayout>
  );
}

export default function Page() {
  return <AuthGuardParent><Inner /></AuthGuardParent>;
}
