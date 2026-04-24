import { useEffect, useState, FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { supabase } from '../../lib/supabase';

type ValidateResponse = {
  valid: boolean;
  email?: string;
  org_name?: string;
  inviter_email?: string;
  error?: string;
};

export default function TutorAcceptPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [info, setInfo] = useState<ValidateResponse | null>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!router.isReady) return;
    const t = typeof router.query.token === 'string' ? router.query.token : '';
    if (!t) {
      setInfo({ valid: false, error: 'No invitation token provided.' });
      setLoading(false);
      return;
    }
    setToken(t);
    (async () => {
      try {
        const res = await fetch(`/api/tutors/validate-invitation?token=${encodeURIComponent(t)}`);
        const json = (await res.json()) as ValidateResponse;
        setInfo(json);
      } catch {
        setInfo({ valid: false, error: 'Could not validate invitation.' });
      } finally {
        setLoading(false);
      }
    })();
  }, [router.isReady, router.query.token]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token || !info?.valid || !info.email) return;
    setError(null);
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setSubmitting(true);
    try {
      const { error: signUpErr } = await supabase.auth.signUp({
        email: info.email,
        password,
        options: {
          data: { tutor_invitation_token: token },
        },
      });
      if (signUpErr) {
        setError(signUpErr.message);
        return;
      }
      setDone(true);
      // If confirmation email is not required (Supabase project setting), the
      // user already has a session. Otherwise they'll confirm via email first.
      setTimeout(() => router.push('/app'), 600);
    } catch (e: any) {
      setError(e?.message ?? 'Something went wrong.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-cream flex flex-col">
      <header className="px-6 md:px-12 py-6 border-b border-rule">
        <Link href="/" className="font-display text-2xl tracking-tightest">
          crest<span className="italic text-forest">io</span>
        </Link>
      </header>
      <main className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="max-w-md w-full space-y-6">
          {loading ? (
            <div className="text-sm text-ink-muted">Checking invitation…</div>
          ) : !info?.valid ? (
            <div className="card p-8">
              <div className="text-2xs uppercase tracking-widest text-ink-muted mb-2">Invitation</div>
              <h1 className="font-display text-2xl tracking-tightest mb-3">This invitation link is no longer valid.</h1>
              <p className="text-sm text-ink-muted mb-4">
                {info?.error ?? 'This link may have expired, been revoked, or already been used.'}
              </p>
              <a href="https://crestio.ai" className="btn-secondary text-sm">Go to crestio.ai</a>
            </div>
          ) : done ? (
            <div className="card p-8">
              <h1 className="font-display text-2xl tracking-tightest mb-3">You're in.</h1>
              <p className="text-sm text-ink-muted">Taking you to the app…</p>
            </div>
          ) : (
            <div className="card p-8">
              <div className="text-2xs uppercase tracking-widest text-ink-muted mb-2">Tutor invitation</div>
              <h1 className="font-display text-3xl tracking-tightest mb-2">
                Join {info.org_name ?? 'the team'}
              </h1>
              <p className="text-sm text-ink-muted mb-6">
                {info.inviter_email ? (
                  <><span className="text-ink">{info.inviter_email}</span> has invited you to join as a tutor.</>
                ) : (
                  <>You've been invited to join as a tutor.</>
                )}
              </p>

              <form onSubmit={onSubmit} className="space-y-4">
                <div>
                  <label className="label">Email</label>
                  <input type="email" value={info.email ?? ''} readOnly className="input bg-rule-soft" />
                </div>
                <div>
                  <label className="label">Password</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="input"
                    required
                    autoComplete="new-password"
                  />
                </div>
                <div>
                  <label className="label">Confirm password</label>
                  <input
                    type="password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    className="input"
                    required
                    autoComplete="new-password"
                  />
                </div>
                {error && <div className="text-sm text-claret">{error}</div>}
                <button type="submit" disabled={submitting} className="btn-primary w-full">
                  {submitting ? 'Creating account…' : 'Accept and create account'}
                </button>
              </form>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
