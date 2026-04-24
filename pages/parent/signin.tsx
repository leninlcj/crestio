import { useState, FormEvent, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { supabase } from '../../lib/supabase';

export default function ParentSignIn() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data: parent } = await supabase
        .from('parents')
        .select('id')
        .eq('auth_user_id', session.user.id)
        .maybeSingle();
      if (parent) router.replace('/parent/dashboard');
    })();
  }, [router]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { data: signInData, error: err } = await supabase.auth.signInWithPassword({ email, password });
    if (err) {
      setLoading(false);
      setError(err.message);
      return;
    }
    if (!signInData.user) {
      setLoading(false);
      setError('Sign-in failed.');
      return;
    }
    const { data: parent } = await supabase
      .from('parents')
      .select('id')
      .eq('auth_user_id', signInData.user.id)
      .maybeSingle();
    setLoading(false);
    if (!parent) {
      await supabase.auth.signOut();
      setError(
        "This sign-in is for parents only. If you're a tutor, sign in at /auth/signin."
      );
      return;
    }
    router.push('/parent/dashboard');
  }

  async function forgotPassword() {
    if (!email) {
      setError('Enter your email first, then tap Forgot password.');
      return;
    }
    setError(null);
    const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    });
    if (err) setError(err.message);
    else setError('Check your email for a reset link.');
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
          <h1 className="font-display text-4xl tracking-tightest mb-10">Sign in</h1>

          <form onSubmit={onSubmit} className="space-y-5">
            <div>
              <label className="label">Email</label>
              <input type="email" required autoFocus value={email}
                onChange={(e) => setEmail(e.target.value)} className="input" />
            </div>
            <div>
              <label className="label">Password</label>
              <input type="password" required value={password}
                onChange={(e) => setPassword(e.target.value)} className="input" />
            </div>

            {error && <div className="text-sm text-claret">{error}</div>}

            <div className="flex items-center justify-end -mt-1">
              <button type="button" onClick={forgotPassword}
                className="text-2xs uppercase tracking-widest text-ink-muted hover:text-ink">
                Forgot password?
              </button>
            </div>

            <button type="submit" disabled={loading} className="btn-primary w-full py-3">
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <div className="mt-8 text-sm text-ink-muted text-center">
            Haven't received an invitation from your tutor yet? Ask them to send one.
          </div>
        </div>
      </div>
    </div>
  );
}
