import { useState, useEffect, FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import AuthGuard from '../../../components/AuthGuard';
import { supabase } from '../../../lib/supabase';
import { dollarsToCents } from '../../../lib/utils';

function OnboardingInner() {
  const router = useRouter();
  const [ownerName, setOwnerName] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [phone, setPhone] = useState('');
  const [defaultRate, setDefaultRate] = useState('80');
  const [currency, setCurrency] = useState('AUD');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data: p } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single();
      if (p?.onboarded) {
        router.replace('/app');
        return;
      }
      if (p) {
        setOwnerName(p.owner_name ?? '');
        setBusinessName(p.business_name ?? '');
        setPhone(p.phone ?? '');
        if (p.default_rate_cents) setDefaultRate((p.default_rate_cents / 100).toString());
        if (p.currency) setCurrency(p.currency);
      }
    })();
  }, [router]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setError('Session expired. Please sign in again.');
      setLoading(false);
      return;
    }

    const { error: err } = await supabase
      .from('profiles')
      .update({
        owner_name: ownerName || null,
        business_name: businessName || null,
        phone: phone || null,
        default_rate_cents: dollarsToCents(defaultRate),
        currency,
        onboarded: true,
      })
      .eq('id', session.user.id);

    setLoading(false);
    if (err) {
      setError(err.message);
      return;
    }
    router.push('/app');
  }

  return (
    <div className="min-h-screen bg-cream flex flex-col">
      <div className="px-6 md:px-12 py-6">
        <Link href="/app" className="font-display text-2xl tracking-tightest">
          crest<span className="italic text-forest">io</span>
        </Link>
      </div>

      <div className="flex-1 flex items-start justify-center px-6 pb-16 pt-8">
        <div className="w-full max-w-lg">
          <div className="text-2xs uppercase tracking-widest text-ink-muted mb-3">Setup</div>
          <h1 className="font-display text-4xl md:text-5xl tracking-tightest mb-3">
            Let's set up your business
          </h1>
          <p className="text-sm text-ink-muted mb-10">
            A couple of details, then you're in. You can change all of this later.
          </p>

          <form onSubmit={onSubmit} className="space-y-5">
            <div>
              <label className="label">Your name</label>
              <input
                type="text"
                required
                autoFocus
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
                className="input"
                placeholder="e.g. Alex Morgan"
              />
            </div>
            <div>
              <label className="label">Business name</label>
              <input
                type="text"
                required
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                className="input"
                placeholder="e.g. Morgan Tutoring"
              />
              <div className="text-2xs text-ink-soft mt-1.5">
                Shown on invoices and at the top of your dashboard.
              </div>
            </div>
            <div>
              <label className="label">Phone (optional)</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="input"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Default hourly rate</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  required
                  value={defaultRate}
                  onChange={(e) => setDefaultRate(e.target.value)}
                  className="input"
                />
              </div>
              <div>
                <label className="label">Currency</label>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="input"
                >
                  <option value="AUD">AUD</option>
                  <option value="USD">USD</option>
                  <option value="GBP">GBP</option>
                  <option value="EUR">EUR</option>
                  <option value="NZD">NZD</option>
                  <option value="CAD">CAD</option>
                </select>
              </div>
            </div>

            {error && <div className="text-sm text-claret">{error}</div>}

            <button type="submit" disabled={loading} className="btn-primary w-full py-3 mt-2">
              {loading ? 'Saving…' : 'Continue'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default function Onboarding() {
  return (
    <AuthGuard requireOnboarded={false}>
      <OnboardingInner />
    </AuthGuard>
  );
}
