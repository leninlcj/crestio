import { useState, FormEvent, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';

type InvitationInfo = {
  valid: boolean;
  email?: string;
  studentName?: string;
  tutorBusinessName?: string;
  error?: string;
};

export default function ParentAccept() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [info, setInfo] = useState<InvitationInfo | null>(null);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!router.isReady) return;
    const t = typeof router.query.token === 'string' ? router.query.token : '';
    if (!t) {
      setInfo({ valid: false, error: 'This link is missing its invitation token.' });
      return;
    }
    setToken(t);
    (async () => {
      try {
        const res = await fetch(`/api/parents/accept-invitation?token=${encodeURIComponent(t)}`);
        const payload = (await res.json()) as InvitationInfo;
        setInfo(payload);
      } catch {
        setInfo({ valid: false, error: 'Could not verify invitation. Please try again later.' });
      }
    })();
  }, [router.isReady, router.query.token]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    if (password.length < 8) {
      setSubmitError('Password must be at least 8 characters.');
      return;
    }
    setSubmitError(null);
    setSubmitting(true);
    try {
      const res = await fetch('/api/parents/accept-invitation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, name, password }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload?.error ?? `Server returned ${res.status}`);
      }
      router.push('/parent/signin?just_created=1');
    } catch (e: any) {
      setSubmitError(e?.message ?? 'Could not create account.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-cream flex flex-col">
      <div className="px-6 md:px-12 py-6">
        <Link href="/" className="font-display text-2xl tracking-tightest">
          crest<span className="italic text-forest">io</span>
        </Link>
      </div>

      <div className="flex-1 flex items-center justify-center px-6 pb-16">
        <div className="w-full max-w-sm">
          <div className="text-2xs uppercase tracking-widest text-ink-muted mb-3">Parent portal</div>

          {!info ? (
            <div className="text-ink-muted text-sm">Checking invitation…</div>
          ) : !info.valid ? (
            <>
              <h1 className="font-display text-3xl tracking-tightest mb-4">Invitation unavailable</h1>
              <p className="text-sm text-ink-muted leading-relaxed mb-6">
                {info.error ?? 'This invitation link is no longer valid.'} If this is a mistake, ask your tutor to send a new invitation.
              </p>
              <Link href="/" className="btn-ghost text-sm">Back to home</Link>
            </>
          ) : (
            <>
              <h1 className="font-display text-4xl tracking-tightest mb-4">
                Accept your invitation
              </h1>
              <p className="text-sm text-ink-muted leading-relaxed mb-8">
                {info.tutorBusinessName} has invited you to view {info.studentName}'s tutoring sessions.
              </p>

              <form onSubmit={onSubmit} className="space-y-5">
                <div>
                  <label className="label">Email</label>
                  <input type="email" disabled value={info.email ?? ''} className="input bg-ink-soft/10" />
                  <div className="text-2xs text-ink-soft mt-1.5">
                    From your invitation. Can't be changed here.
                  </div>
                </div>
                <div>
                  <label className="label">Your name</label>
                  <input type="text" value={name}
                    onChange={(e) => setName(e.target.value)} className="input"
                    placeholder="Optional" />
                </div>
                <div>
                  <label className="label">Create password</label>
                  <input type="password" required minLength={8} value={password}
                    onChange={(e) => setPassword(e.target.value)} className="input" />
                  <div className="text-2xs text-ink-soft mt-1.5">At least 8 characters.</div>
                </div>

                {submitError && <div className="text-sm text-claret">{submitError}</div>}

                <button type="submit" disabled={submitting || password.length < 8}
                  className="btn-primary w-full py-3">
                  {submitting ? 'Creating account…' : 'Create parent account'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
