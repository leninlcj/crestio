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
        // Signed in, but not a parent — must be a tutor account.
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
