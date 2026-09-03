import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import { isPlatformOwner } from './owner';

// True when the signed-in user is the platform owner (the agency). Cheap:
// one local session read, no network.
export function useIsPlatformOwner(): boolean {
  const [value, setValue] = useState(false);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!cancelled) setValue(isPlatformOwner(session?.user?.email));
    })();
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setValue(isPlatformOwner(session?.user?.email));
    });
    return () => { cancelled = true; sub.subscription.unsubscribe(); };
  }, []);
  return value;
}
