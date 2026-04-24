import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from 'react';
import { supabase } from './supabase';

export type PlanTier = 'solo' | 'team' | 'growth';
export type BillingInterval = 'monthly' | 'annual';

export type Organization = {
  id: string;
  name: string;
  plan_tier: PlanTier;
  billing_interval: BillingInterval;
};

type OrgContextValue = {
  organization: Organization | null;
  loading: boolean;
  refresh: () => Promise<void>;
};

const OrgContext = createContext<OrgContextValue>({
  organization: null,
  loading: true,
  refresh: async () => {},
});

export function OrganizationProvider({ children }: { children: ReactNode }) {
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchOrg = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setOrganization(null);
        return;
      }
      // Resolve org via organization_members so this works for tutors too.
      const { data: membership } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', session.user.id)
        .maybeSingle();
      if (!membership) {
        setOrganization(null);
        return;
      }
      const { data } = await supabase
        .from('organizations')
        .select('id, name, plan_tier, billing_interval')
        .eq('id', membership.organization_id)
        .maybeSingle();
      if (!data) {
        setOrganization(null);
        return;
      }
      setOrganization({
        id: data.id,
        name: data.name,
        plan_tier: (data.plan_tier as PlanTier | null) ?? 'solo',
        billing_interval: (data.billing_interval as BillingInterval | null) ?? 'monthly',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOrg();
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      fetchOrg();
    });
    return () => sub.subscription.unsubscribe();
  }, [fetchOrg]);

  return (
    <OrgContext.Provider value={{ organization, loading, refresh: fetchOrg }}>
      {children}
    </OrgContext.Provider>
  );
}

export function useOrganization() {
  return useContext(OrgContext);
}
