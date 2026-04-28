import { useState, FormEvent, useEffect } from 'react';
import Link from 'next/link';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { supabase } from '../../lib/supabase';

// Student sign-in page.  Email + password, plus a "send me a magic link"
// fallback that uses Supabase's signInWithOtp.

export default function StudentSignIn() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      // If a student is already signed in, send them to the portal.
      const { data: studentUser } = await supabase
        .from('student_users').select('id, disabled_at').eq('auth_user_id', session.user.id).maybeSingle();
      if (studentUser && !studentUser.disabled_at) router.replace('/student');
    })();
  }, [router]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null); setInfo(null); setLoading(true);
    const { data, error: err } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (err) {
      setError(/invalid login credentials/i.test(err.message) ? 'Email or password is incorrect.' : err.message);
      return;
    }
    const { data: studentUser } = await supabase
      .from('student_users').select('id, disabled_at').eq('auth_user_id', data.user!.id).maybeSingle();
    if (!studentUser || studentUser.disabled_at) {
      await supabase.auth.signOut();
      setError('This sign-in is for student portal accounts. If you\'re a tutor or parent, use the regular sign-in page.');
      return;
    }
    router.push('/student');
  }

  async function magicLink() {
    if (!email) { setError('Type your email first.'); return; }
    setError(null);
    const { error: err } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/student` },
    });
    if (err) setError(err.message);
    else setInfo('Check your email for a sign-in link.');
  }

  return (
    <div className="min-h-screen bg-cream flex flex-col">
      <Head>
        <title>Student sign-in</title>
        <meta name="robots" content="noindex,nofollow" />
      </Head>

      <div className="flex-1 flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-[400px]">
          <div className="text-2xs uppercase tracking-widest text-ink-muted mb-3">Student portal</div>
          <h1 className="font-display text-3xl tracking-tightest mb-8">Sign in</h1>

          {info && <div className="mb-4 text-sm text-forest-ink bg-forest-soft/50 border border-forest/20 p-3 rounded">{info}</div>}

          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label htmlFor="student-email" className="label">Email</label>
              <input id="student-email" type="email" autoComplete="email" required autoFocus
                value={email} onChange={(e) => setEmail(e.target.value)} className="input" />
            </div>
            <div>
              <label htmlFor="student-password" className="label">Password</label>
              <input id="student-password" type="password" autoComplete="current-password" required
                value={password} onChange={(e) => setPassword(e.target.value)} className="input" />
            </div>

            {error && <div className="text-sm text-claret">{error}</div>}

            <button type="submit" disabled={loading} className="btn-primary w-full py-3">
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <button type="button" onClick={magicLink} className="mt-3 w-full text-sm text-ink-muted hover:text-ink py-2">
            Or send me a sign-in link
          </button>

          <p className="mt-8 text-xs text-ink-soft text-center">
            <Link href="/student/help" className="hover:text-ink underline-offset-2">Help</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
