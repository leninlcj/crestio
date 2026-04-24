import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { isPlatformOwner } from '../lib/owner';

type Status = {
  loaded: boolean;
  isTestAccount: boolean;
  testEmail: string | null;
  isOwner: boolean;
  exemptionActive: boolean;
};

// Reads the current profile's test / exemption flags in one round-trip.
// Used by both banners below so we only hit the DB once per Layout mount.
function useOwnerStatus(): Status {
  const [state, setState] = useState<Status>({
    loaded: false,
    isTestAccount: false,
    testEmail: null,
    isOwner: false,
    exemptionActive: true,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;
      const { data: profile } = await supabase
        .from('profiles')
        .select('email, is_test_account, billing_exemption_active')
        .eq('id', session.user.id)
        .maybeSingle();
      if (cancelled) return;
      setState({
        loaded: true,
        isTestAccount: !!profile?.is_test_account,
        testEmail: session.user.email ?? null,
        isOwner: isPlatformOwner(profile?.email ?? session.user.email ?? null),
        exemptionActive: profile?.billing_exemption_active !== false,
      });
    })();
    return () => { cancelled = true; };
  }, []);

  return state;
}

export function TestAccountBanner() {
  const { loaded, isTestAccount, testEmail } = useOwnerStatus();
  if (!loaded || !isTestAccount) return null;
  return (
    <div
      role="status"
      className="sticky top-0 z-40 bg-amber text-amber-ink border-b border-amber/40"
      style={{ backgroundColor: '#F6C14A' }}
    >
      <div className="px-4 md:px-6 py-2 text-2xs uppercase tracking-widest text-center text-ink font-medium">
        TEST ACCOUNT
        {testEmail && <span className="normal-case tracking-normal"> · {testEmail}</span>}
        <span className="normal-case tracking-normal text-ink/80"> · Data here is isolated from production.</span>
      </div>
    </div>
  );
}

export function ExemptionOffPill() {
  const { loaded, isOwner, exemptionActive } = useOwnerStatus();
  const [busy, setBusy] = useState(false);
  if (!loaded || !isOwner || exemptionActive) return null;

  async function turnOn() {
    setBusy(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) { setBusy(false); return; }
    await fetch('/api/owner/billing-exemption', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ active: true }),
    });
    // Hard reload so any paywall gating clears.
    window.location.reload();
  }

  return (
    <button
      type="button"
      onClick={turnOn}
      disabled={busy}
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-2xs font-medium"
      style={{ backgroundColor: '#F6C14A', color: '#2C2724' }}
      title="Your billing exemption is off. Click to turn back on."
    >
      <span className="inline-block w-1.5 h-1.5 rounded-full bg-claret" aria-hidden="true" />
      Exemption: OFF
    </button>
  );
}
