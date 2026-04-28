import { useEffect, useState, ReactNode } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabase';

// Gates /student/* pages.  Requires the signed-in user to:
//   - have an auth session
//   - have a row in student_users for that auth user, with disabled_at IS NULL
// Otherwise: redirects to /student/signin (no session) or 404 (wrong role).
//
// We deliberately render a generic 404 for non-student authenticated users
// rather than redirecting to /app — this avoids leaking that /student/*
// routes exist for a particular role.

interface Props { children: ReactNode }

export default function AuthGuardStudent({ children }: Props) {
  const router = useRouter();
  const [state, setState] = useState<'loading' | 'ready' | '404'>('loading');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.replace('/student/signin');
        return;
      }
      const { data: studentUser } = await supabase
        .from('student_users')
        .select('id, disabled_at')
        .eq('auth_user_id', session.user.id)
        .maybeSingle();
      if (cancelled) return;
      if (!studentUser || studentUser.disabled_at) {
        // Wrong role for this route.  Render 404 — don't reveal anything.
        setState('404');
        return;
      }
      setState('ready');
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      if (!session) router.replace('/student/signin');
    });
    return () => { cancelled = true; sub.subscription.unsubscribe(); };
  }, [router]);

  if (state === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-cream">
        <div className="text-ink-muted text-sm tracking-widest uppercase">Loading</div>
      </div>
    );
  }
  if (state === '404') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-cream text-ink p-6 text-center">
        <h1 className="font-display text-4xl tracking-tightest mb-2">404</h1>
        <p className="text-sm text-ink-muted">This page doesn't exist.</p>
      </div>
    );
  }
  return <>{children}</>;
}
