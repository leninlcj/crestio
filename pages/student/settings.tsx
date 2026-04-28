import { useState } from 'react';
import { useRouter } from 'next/router';
import AuthGuardStudent from '../../components/AuthGuardStudent';
import StudentLayout from '../../components/student/StudentLayout';
import { useStudentMe } from '../../components/student/StudentContext';
import { supabase } from '../../lib/supabase';
import { ageInYears } from '../../lib/ageInYears';

function Inner() {
  const router = useRouter();
  const { me } = useStudentMe();
  const [emailNotes, setEmailNotes] = useState(true);
  const [emailHomework, setEmailHomework] = useState(true);

  async function signOut() {
    await supabase.auth.signOut();
    router.replace('/student/signin');
  }

  const age = ageInYears(me?.profile.date_of_birth ?? null);
  const isMinor = age != null && age < 18;

  return (
    <StudentLayout title="Settings">
      <h1 className="font-display text-[28px] tracking-tightest">Settings</h1>

      <section className="mt-6 card p-5">
        <h2 className="text-2xs uppercase tracking-widest text-ink-muted mb-3">Profile</h2>
        <Row label="Name" value={me?.profile.full_name ?? '—'} hint="Your tutor manages this." />
        <Row label="Email" value={me?.profile.email ?? '—'} />
        <Row label="Date of birth" value={me?.profile.date_of_birth ?? '—'} hint="Read-only." />
      </section>

      <section className="mt-4 card p-5">
        <h2 className="text-2xs uppercase tracking-widest text-ink-muted mb-3">Notifications</h2>
        <ToggleRow
          label={`Email me when ${me?.tutor.name ?? 'my tutor'} sends a new session note`}
          value={emailNotes}
          onChange={setEmailNotes}
        />
        <ToggleRow
          label={`Email me when ${me?.tutor.name ?? 'my tutor'} adds homework`}
          value={emailHomework}
          onChange={setEmailHomework}
        />
        <p className="text-2xs text-ink-soft mt-3">Both default to on. We never send marketing email.</p>
      </section>

      <section className="mt-4 card p-5">
        <h2 className="text-2xs uppercase tracking-widest text-ink-muted mb-3">Account</h2>
        <button type="button" onClick={signOut} className="btn-ghost text-sm w-full justify-start">
          Sign out
        </button>
        {isMinor ? (
          <p className="mt-3 text-sm text-ink-muted">
            Ask your parent to remove your account from their parent portal.
          </p>
        ) : (
          <button
            type="button"
            className="mt-2 text-sm text-claret hover:underline"
            onClick={() => alert('Account deletion: email support@crestio.app to delete your account.')}
          >
            Delete my account
          </button>
        )}
      </section>
    </StudentLayout>
  );
}

function Row({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2 border-b border-ruleSoft last:border-0">
      <div className="text-sm text-ink-muted">{label}</div>
      <div className="text-sm text-ink text-right max-w-[60%]">
        <div>{value}</div>
        {hint && <div className="text-2xs text-ink-soft">{hint}</div>}
      </div>
    </div>
  );
}

function ToggleRow({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 py-2 border-b border-ruleSoft last:border-0 cursor-pointer">
      <span className="text-sm text-ink">{label}</span>
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

export default function Page() {
  return <AuthGuardStudent><Inner /></AuthGuardStudent>;
}
