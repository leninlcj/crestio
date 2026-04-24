import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from 'react';
import { supabase } from './supabase';
import { getCurrentMembership, Membership } from './membership';

type MembershipContextValue = {
  membership: Membership | null;
  loading: boolean;
  refresh: () => Promise<void>;
};

const MembershipContext = createContext<MembershipContextValue>({
  membership: null,
  loading: true,
  refresh: async () => {},
});

export function MembershipProvider({ children }: { children: ReactNode }) {
  const [membership, setMembership] = useState<Membership | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchMembership = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getCurrentMembership();
      setMembership(result);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMembership();
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      fetchMembership();
    });
    return () => sub.subscription.unsubscribe();
  }, [fetchMembership]);

  return (
    <MembershipContext.Provider value={{ membership, loading, refresh: fetchMembership }}>
      {children}
    </MembershipContext.Provider>
  );
}

export function useMembership() {
  return useContext(MembershipContext);
}
