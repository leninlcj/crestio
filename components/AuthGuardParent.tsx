import { useEffect, useState, ReactNode } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabase';
import { TestAccountBanner } from './OwnerBanners';

interface Props {
  children: ReactNode;
}

export default function AuthGuardParent({ children }: Props) {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.replace('/parent/signin');
        return;
      }

      const { data: parent } = await supabase
        .from('parents')
        .select('id')
        .eq('auth_user_id', session.user.id)
        .maybeSingle();

      if (!cancelled && !parent) {
        // Could be a student account — route them to /student instead of /app.
        const { data: studentUser } = await supabase
          .from('student_users')
          .select('id, disabled_at')
          .eq('auth_user_id', session.user.id)
          .maybeSingle();
        if (studentUser && !studentUser.disabled_at) {
          router.replace('/student');
          return;
        }
        // Otherwise must be a tutor account.
        router.replace('/app');
        return;
      }

      if (!cancelled) setReady(true);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) router.replace('/parent/signin');
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [router]);

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-cream">
        <div className="text-ink-muted text-sm tracking-widest uppercase">Loading</div>
      </div>
    );
  }

  return (
    <>
      <TestAccountBanner />
      {children}
    </>
  );
}
