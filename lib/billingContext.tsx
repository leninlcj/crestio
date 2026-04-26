import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useRouter } from 'next/router';
import { supabase } from './supabase';

export type BillingStatus = {
  subscription_status: string;
  trial_ends_at: string | null;
  current_period_end: string | null;
  days_left_in_trial: number | null;
  is_in_trial: boolean;
  is_active: boolean;
  stripe_customer_id_present: boolean;
  stripe_subscription_id_present?: boolean;
  cancel_at_period_end?: boolean;
  role: 'owner' | 'tutor';
};

type PaywallReason =
  | 'trial_expired'
  | 'subscription_past_due'
  | 'canceled'
  | 'never_subscribed'
  | 'subscription_required'
  | 'unknown';

type ContextValue = {
  status: BillingStatus | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  refreshBilling: () => Promise<void>;
  paywallOpen: boolean;
  paywallReason: PaywallReason | null;
  openPaywall: (reason?: PaywallReason) => void;
  closePaywall: () => void;
  startCheckout: () => Promise<void>;
};

const BillingContext = createContext<ContextValue | null>(null);

export function BillingProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [paywallReason, setPaywallReason] = useState<PaywallReason | null>(null);
  const statusRef = useRef<BillingStatus | null>(null);
  statusRef.current = status;

  // Routes that don't need billing status. Marketing/legal/auth/parent — none
  // of these read billing, and skipping the fetch removes a dozen+ calls per
  // marketing page load (P1-1.1, P1-1.2). The signed-in user nav still works
  // because pages use the lighter useIsSignedIn() hook directly.
  function pathNeedsBilling(p: string | undefined): boolean {
    if (!p) return false;
    return p.startsWith('/app') || p.startsWith('/welcome');
  }

  const fetchStatus = useCallback(async (): Promise<BillingStatus | null> => {
    if (typeof window !== 'undefined' && !pathNeedsBilling(window.location.pathname)) {
      setStatus(null);
      return null;
    }
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      setStatus(null);
      return null;
    }
    const res = await fetch('/api/billing/status', {
      headers: { Authorization: `Bearer ${session.access_token}` },
      cache: 'no-store',
    });
    if (res.status === 401 && typeof window !== 'undefined') {
      // Billing only runs on /app routes (see pathNeedsBilling above), so a
      // session_expired redirect always belongs on the tutor signin page.
      if (!window.location.pathname.startsWith('/auth/signin')) {
        window.location.href = '/auth/signin?reason=session_expired';
      }
      return null;
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error('[billing] status fetch failed', res.status, text);
      setError(`Could not load billing status (${res.status}).`);
      return null;
    }
    const payload = await res.json().catch(() => null);
    if (payload) {
      setError(null);
      setStatus(payload as BillingStatus);
      return payload as BillingStatus;
    }
    return null;
  }, []);

  const refresh = useCallback(async () => {
    if (typeof window !== 'undefined' && !pathNeedsBilling(window.location.pathname)) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      await fetchStatus();
    } finally {
      setLoading(false);
    }
  }, [fetchStatus]);

  const refreshBilling = refresh;

  useEffect(() => {
    refresh();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        setStatus(null);
        setError(null);
        setPaywallOpen(false);
        return;
      }
      refresh();
    });
    return () => subscription.unsubscribe();
  }, [refresh]);

  // When the user crosses into a billing-needing route (e.g. marketing → /app),
  // pull billing status in. Without this the /app dashboard would render with
  // status=null until a focus event or reload.
  useEffect(() => {
    function onRouteChange(url: string) {
      const path = url.split('?')[0];
      if (pathNeedsBilling(path) && !statusRef.current) refresh();
    }
    router.events.on('routeChangeComplete', onRouteChange);
    return () => router.events.off('routeChangeComplete', onRouteChange);
  }, [router.events, refresh]);

  // Refetch when the tab regains focus — handles the case where the user
  // subscribed in another tab (Stripe Checkout) and came back.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    function onFocus() {
      refresh();
    }
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refresh]);

  // Post-checkout recovery: Stripe redirects back to ?billing=success before
  // the webhooks have propagated to our DB. Refetch at 2s and 6s; stop early
  // once stripe_customer_id_present is true.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const q = router.query?.billing;
    if (q !== 'success') return;
    let cancelled = false;

    const timers: ReturnType<typeof setTimeout>[] = [];
    timers.push(
      setTimeout(async () => {
        if (cancelled) return;
        const next = await fetchStatus();
        if (cancelled) return;
        if (!next?.stripe_customer_id_present) {
          timers.push(
            setTimeout(async () => {
              if (cancelled) return;
              await fetchStatus();
            }, 4000),
          );
        }
      }, 2000),
    );

    return () => {
      cancelled = true;
      for (const t of timers) clearTimeout(t);
    };
  }, [router.query?.billing, fetchStatus]);

  const openPaywall = useCallback((reason?: PaywallReason) => {
    setPaywallReason(reason ?? 'unknown');
    setPaywallOpen(true);
  }, []);

  const closePaywall = useCallback(() => setPaywallOpen(false), []);

  const startCheckout = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return;
    const res = await fetch('/api/billing/create-checkout-session', {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    const payload = await res.json().catch(() => ({}));
    if (res.ok && payload?.url && typeof window !== 'undefined') {
      window.location.href = payload.url;
    }
  }, []);

  const value = useMemo<ContextValue>(
    () => ({
      status,
      loading,
      error,
      refresh,
      refreshBilling,
      paywallOpen,
      paywallReason,
      openPaywall,
      closePaywall,
      startCheckout,
    }),
    [status, loading, error, refresh, refreshBilling, paywallOpen, paywallReason, openPaywall, closePaywall, startCheckout],
  );

  return <BillingContext.Provider value={value}>{children}</BillingContext.Provider>;
}

export function useBilling() {
  const ctx = useContext(BillingContext);
  if (!ctx) throw new Error('useBilling must be used within BillingProvider');
  return ctx;
}

export async function billingGatedFetch(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  openPaywall: (reason?: PaywallReason) => void,
): Promise<Response> {
  const res = await fetch(input, init);
  if (res.status === 402) {
    try {
      const payload = await res.clone().json();
      openPaywall(payload?.reason ?? 'unknown');
    } catch {
      openPaywall('unknown');
    }
  }
  return res;
}
