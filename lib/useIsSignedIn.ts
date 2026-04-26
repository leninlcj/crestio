import { useEffect, useState } from 'react';
import { supabase } from './supabase';

// Returns null while still loading the initial session, then true/false. Used
// by marketing/auth pages to render the correct nav (sign in vs go to app).
// Cheaper than going through BillingProvider — no API calls, just one read of
// the local Supabase session cookie.
export function useIsSignedIn(): boolean | null {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!cancelled) setSignedIn(!!session);
    })();
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setSignedIn(!!session);
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  return signedIn;
}
