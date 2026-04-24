import { useEffect, useState, ReactNode } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabase';

interface Props {
  children: ReactNode;
  requireOnboarded?: boolean;
}

export default function AuthGuard({ children, requireOnboarded = true }: Props) {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        router.replace('/auth/signin');
        return;
      }

      // If this user is a parent, kick them to the parent dashboard.
      const { data: parent } = await supabase
        .from('parents')
        .select('id')
        .eq('auth_user_id', session.user.id)
        .maybeSingle();
      if (!cancelled && parent) {
        router.replace('/parent/dashboard');
        return;
      }

      if (requireOnboarded) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('onboarded')
          .eq('id', session.user.id)
          .single();

        if (!cancelled && (!profile || !profile.onboarded) && router.pathname !== '/app/onboarding') {
          router.replace('/app/onboarding');
          return;
        }
      }

      if (!cancelled) setReady(true);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) router.replace('/auth/signin');
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [router, requireOnboarded]);

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-cream">
        <div className="text-ink-muted text-sm tracking-widest uppercase">Loading</div>
      </div>
    );
  }

  return <>{children}</>;
}
