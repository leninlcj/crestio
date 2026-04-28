import { useEffect, useState, FormEvent } from 'react';
import Link from 'next/link';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { supabase } from '../../lib/supabase';

// Student invitation acceptance.  Validates the token, collects DOB +
// password, calls /api/student/accept-invitation, then auto-signs in.

type Info = {
  valid: boolean;
  reason?: string;
  email?: string;
  studentName?: string;
  dateOfBirth?: string | null;
  tutorBusinessName?: string;
  brandColor?: string | null;
};

export default function StudentAccept() {
  const router = useRouter();
  const [token, setToken] = useState('');
  const [info, setInfo] = useState<Info | null>(null);
  const [name, setName] = useState('');
  const [dob, setDob] = useState('');
  const [password, setPassword] = useState('');
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!router.isReady) return;
    const tok = typeof router.query.token === 'string' ? router.query.token : '';
    if (!tok) { setInfo({ valid: false, reason: 'missing' }); return; }
    setToken(tok);
    (async () => {
      try {
        const res = await fetch(`/api/student/validate-invitation?token=${encodeURIComponent(tok)}`);
        const data = await res.json();
        setInfo(data);
        if (data.valid) {
          if (data.studentName) setName(data.studentName);
          if (data.dateOfBirth) setDob(data.dateOfBirth);
        }
      } catch {
        setInfo({ valid: false, reason: 'verify_failed' });
      }
    })();
  }, [router.isReady, router.query.token]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!agree) { setError('Please tick the box to agree.'); return; }
    if (password.length < 12) { setError('Password must be at least 12 characters.'); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) { setError('Enter your date of birth.'); return; }

    setBusy(true);
    try {
      const res = await fetch('/api/student/accept-invitation', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token, full_name: name, date_of_birth: dob, password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Could not set up your account.'); return; }

      // Auto-sign-in.
      const { error: signErr } = await supabase.auth.signInWithPassword({
        email: info?.email ?? '', password,
      });
      if (signErr) {
        router.replace('/student/signin?accepted=1');
        return;
      }
      router.replace('/student');
    } catch (e: any) {
      setError(e?.message ?? 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  const accent = info?.brandColor && /^#[0-9A-Fa-f]{6}$/.test(info.brandColor) ? info.brandColor : '#1a3a2a';

  return (
    <div className="min-h-screen bg-cream flex flex-col">
      <Head>
        <title>Set up your portal</title>
        <meta name="robots" content="noindex,nofollow" />
      </Head>

      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-[420px]">
          {!info ? (
            <div className="text-sm text-ink-muted">Checking…</div>
          ) : !info.valid ? (
            <>
              <div className="text-2xs uppercase tracking-widest text-ink-muted mb-3">Student portal</div>
              <h1 className="font-display text-3xl tracking-tightest mb-3">Hmm, this link doesn't work.</h1>
              <p className="text-sm text-ink-muted mb-6">
                {info.reason === 'expired' && 'This invitation expired. Ask your tutor to send a new one.'}
                {info.reason === 'used' && 'This invitation has already been used. Try signing in instead.'}
                {info.reason === 'consent_pending' && 'Your parent hasn\'t approved this yet. Ask them to check their email.'}
                {(!info.reason || info.reason === 'missing' || info.reason === 'not_found' || info.reason === 'verify_failed') &&
                  'The link may be old or mistyped. Ask your tutor to send a fresh one.'}
              </p>
              <a href="mailto:support@crestio.app" className="text-sm underline" style={{ color: accent }}>
                Email Crestio support
              </a>
            </>
          ) : (
            <>
              <div className="text-2xs uppercase tracking-widest text-ink-muted mb-3" style={{ color: accent }}>
                {info.tutorBusinessName}
              </div>
              <h1 className="font-display text-3xl tracking-tightest mb-3">
                Welcome, {firstNameOf(info.studentName)}.
              </h1>
              <p className="text-sm text-ink-muted leading-relaxed mb-8">
                {info.tutorBusinessName} invited you to your student portal.
                Set up your account below — it takes about a minute.
              </p>

              <form onSubmit={onSubmit} className="space-y-4">
                <div>
                  <label htmlFor="acc-email" className="label">Email</label>
                  <input id="acc-email" type="email" disabled value={info.email ?? ''} className="input bg-ink-soft/10" />
                </div>
                <div>
                  <label htmlFor="acc-name" className="label">Your full name</label>
                  <input id="acc-name" type="text" required value={name} onChange={(e) => setName(e.target.value)} className="input" autoComplete="name" />
                </div>
                <div>
                  <label htmlFor="acc-dob" className="label">Date of birth</label>
                  <input id="acc-dob" type="date" required value={dob} onChange={(e) => setDob(e.target.value)} className="input" />
                  <div className="text-2xs text-ink-soft mt-1">We use this to verify your age.</div>
                </div>
                <div>
                  <label htmlFor="acc-password" className="label">Set a password</label>
                  <input id="acc-password" type="password" required minLength={12} value={password} onChange={(e) => setPassword(e.target.value)} className="input" autoComplete="new-password" />
                  <div className="text-2xs text-ink-soft mt-1">At least 12 characters.</div>
                </div>

                <label className="flex items-start gap-2 text-sm text-ink-muted leading-snug pt-2">
                  <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-1" />
                  <span>
                    I agree to the{' '}
                    <Link href="/student/privacy" target="_blank" className="underline" style={{ color: accent }}>Privacy notice</Link>
                    {' and '}
                    <Link href="/student/terms" target="_blank" className="underline" style={{ color: accent }}>Terms</Link>.
                  </span>
                </label>

                {error && <div className="text-sm text-claret">{error}</div>}

                <button
                  type="submit"
                  disabled={busy}
                  className="btn-primary w-full py-3"
                  style={{ background: accent, borderColor: accent }}
                >
                  {busy ? 'Setting up…' : 'Set up my portal'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function firstNameOf(full?: string): string {
  if (!full) return 'there';
  return full.trim().split(/\s+/)[0] || 'there';
}
