import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import AuthGuard from '../../../components/AuthGuard';
import OwnerOnly from '../../../components/OwnerOnly';
import Layout from '../../../components/Layout';
import { Badge } from '../../../components/design/Badge';
import { supabase } from '../../../lib/supabase';
import { useOrganization } from '../../../lib/organizationContext';

type ConnectStatus = {
  status: 'pending' | 'restricted' | 'active' | 'disabled';
  charges_enabled: boolean;
  payouts_enabled: boolean;
  requirements: {
    currently_due?: string[];
    past_due?: string[];
    eventually_due?: string[];
    disabled_reason?: string | null;
  };
  country: string;
  onboarded_at: string | null;
  has_account: boolean;
  balance: { available: { amount: number; currency: string }[]; pending: { amount: number; currency: string }[] } | null;
  payouts: { id: string; amount: number; currency: string; status: string; arrival_date: number; created: number }[];
};

type Charge = {
  id: string;
  stripe_payment_intent_id: string;
  stripe_charge_id: string | null;
  amount_total: number;
  amount_application_fee: number;
  amount_stripe_fee: number | null;
  amount_net: number;
  currency: string;
  status: string;
  payment_method_brand: string | null;
  payment_method_last4: string | null;
  refunded_amount: number;
  created_at: string;
  invoice_ids: string[];
};

function fmt(cents: number, currency: string): string {
  try { return new Intl.NumberFormat('en-AU', { style: 'currency', currency: currency.toUpperCase() }).format(cents / 100); }
  catch { return `$${(cents / 100).toFixed(2)}`; }
}
function fmtDate(s: string | number | null): string {
  if (s == null) return '—';
  const d = typeof s === 'number' ? new Date(s * 1000) : new Date(s);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}

function PayoutsInner() {
  const { organization } = useOrganization();
  const router = useRouter();
  const [status, setStatus] = useState<ConnectStatus | null>(null);
  const [charges, setCharges] = useState<Charge[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [refundOpen, setRefundOpen] = useState<Charge | null>(null);
  const [refundAmount, setRefundAmount] = useState<string>('');
  const [refundReason, setRefundReason] = useState<string>('');
  const [refundBusy, setRefundBusy] = useState(false);
  const [refundError, setRefundError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) { setError('Sign in required.'); return; }
        const [statusRes, chargesRes] = await Promise.all([
          fetch('/api/stripe/connect/status', { headers: { Authorization: `Bearer ${session.access_token}` } }),
          supabase
            .from('charges')
            .select('id, stripe_payment_intent_id, stripe_charge_id, amount_total, amount_application_fee, amount_stripe_fee, amount_net, currency, status, payment_method_brand, payment_method_last4, refunded_amount, created_at, invoice_ids')
            .order('created_at', { ascending: false })
            .limit(50),
        ]);
        if (!statusRes.ok) {
          const p = await statusRes.json().catch(() => ({}));
          setError(p?.error ?? 'Failed to load Connect status.');
        } else {
          setStatus(await statusRes.json());
        }
        if (!chargesRes.error) setCharges((chargesRes.data ?? []) as Charge[]);
      } finally {
        setLoading(false);
      }
    })();
  }, [router.query.connect]);

  const startOnboarding = async () => {
    setBusy(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) { setError('Sign in required.'); return; }
      const res = await fetch('/api/stripe/connect/onboard', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || !payload?.url) { setError(payload?.error ?? 'Could not start onboarding.'); return; }
      window.location.href = payload.url;
    } finally {
      setBusy(false);
    }
  };

  const submitRefund = async () => {
    if (!refundOpen) return;
    setRefundBusy(true);
    setRefundError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) { setRefundError('Sign in required.'); return; }
      // Refund through the first invoice id in the charge — they all map to the
      // same PI/charge so any of them works.
      const invoiceId = refundOpen.invoice_ids?.[0];
      if (!invoiceId) { setRefundError('No invoice on this charge.'); return; }
      const dollars = refundAmount.trim();
      const amountCents = dollars ? Math.round(Number(dollars) * 100) : null;
      if (dollars && (!Number.isFinite(Number(dollars)) || Number(dollars) <= 0)) {
        setRefundError('Enter a valid dollar amount.'); return;
      }
      const res = await fetch(`/api/invoices/${invoiceId}/refund`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ amount: amountCents ?? undefined, reason: refundReason.trim() || 'requested_by_customer' }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) { setRefundError(payload?.error ?? 'Refund failed.'); return; }
      setRefundOpen(null);
      setRefundAmount('');
      setRefundReason('');
      // Reload charges + status.
      router.replace(router.asPath);
    } finally {
      setRefundBusy(false);
    }
  };

  const statusBadge = useMemo(() => {
    if (!status) return null;
    const s = status.status;
    if (s === 'active') return <Badge variant="success">Active</Badge>;
    if (s === 'restricted') return <Badge variant="warning">Restricted</Badge>;
    if (s === 'disabled') return <Badge variant="danger">Disabled</Badge>;
    return <Badge variant="neutral">Pending setup</Badge>;
  }, [status]);

  return (
    <Layout
      pageTitle="Parent payments · Crestio"
      title="Parent payments"
      subtitle={organization?.name ?? ''}
    >
      {loading && <div className="card p-6 text-sm text-ink-muted">Loading…</div>}
      {error && <div className="card p-6 mb-6 text-sm text-claret">{error}</div>}

      {!loading && status && (
        <div className="space-y-6 max-w-3xl">
          <div className="card p-6">
            <div className="flex items-baseline justify-between gap-4 mb-3">
              <div>
                <div className="text-2xs uppercase tracking-widest text-ink-muted mb-1">Stripe Connect</div>
                <div className="flex items-center gap-2">
                  <h2 className="font-display text-2xl tracking-tightest">Payment account</h2>
                  {statusBadge}
                </div>
              </div>
            </div>
            {!status.has_account && (
              <>
                <p className="text-sm text-ink-muted mb-4">
                  Set up Stripe so parents can pay invoices directly with a card. Payouts arrive in your bank
                  in ~2 business days. Crestio's fee is 1% on top of Stripe's processing fee.
                </p>
                <button onClick={startOnboarding} disabled={busy} className="btn-primary">
                  {busy ? 'Opening…' : 'Set up payments'}
                </button>
              </>
            )}
            {status.has_account && status.status !== 'active' && (
              <>
                <p className="text-sm text-ink-muted mb-4">
                  Stripe needs more information to enable payments.
                  {status.requirements?.currently_due && status.requirements.currently_due.length > 0 && (
                    <> Outstanding: {status.requirements.currently_due.join(', ')}.</>
                  )}
                </p>
                <button onClick={startOnboarding} disabled={busy} className="btn-primary">
                  {busy ? 'Opening…' : 'Continue setup'}
                </button>
              </>
            )}
            {status.status === 'active' && (
              <p className="text-sm text-ink-muted">
                You can take card payments. Payouts run daily on Stripe's default schedule.
              </p>
            )}
          </div>

          {status.balance && (
            <div className="card p-6">
              <div className="text-2xs uppercase tracking-widest text-ink-muted mb-3">Balance</div>
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <div className="text-2xs text-ink-muted mb-1">Available</div>
                  <div className="font-display text-2xl tracking-tightest num">
                    {status.balance.available.length === 0
                      ? '—'
                      : status.balance.available
                          .map((b) => fmt(b.amount, b.currency.toUpperCase()))
                          .join(' · ')}
                  </div>
                </div>
                <div>
                  <div className="text-2xs text-ink-muted mb-1">Pending</div>
                  <div className="font-display text-2xl tracking-tightest num">
                    {status.balance.pending.length === 0
                      ? '—'
                      : status.balance.pending
                          .map((b) => fmt(b.amount, b.currency.toUpperCase()))
                          .join(' · ')}
                  </div>
                </div>
              </div>
            </div>
          )}

          {status.payouts.length > 0 && (
            <div className="card p-6">
              <div className="text-2xs uppercase tracking-widest text-ink-muted mb-3">Recent payouts</div>
              <ul className="divide-y divide-ruleSoft">
                {status.payouts.map((p) => (
                  <li key={p.id} className="py-2 flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm">{fmtDate(p.arrival_date)}</div>
                      <div className="text-2xs text-ink-muted">{p.status}</div>
                    </div>
                    <div className="font-mono text-sm">{fmt(p.amount, p.currency.toUpperCase())}</div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="card p-6">
            <div className="text-2xs uppercase tracking-widest text-ink-muted mb-3">Recent charges</div>
            {charges.length === 0 ? (
              <div className="text-sm text-ink-muted">No charges yet.</div>
            ) : (
              <ul className="divide-y divide-ruleSoft">
                {charges.map((c) => {
                  const refundable = c.status === 'succeeded' || c.status === 'partially_refunded';
                  const remaining = c.amount_total - c.refunded_amount;
                  return (
                    <li key={c.id} className="py-3 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm">
                          {fmtDate(c.created_at)}
                          {c.payment_method_brand && (
                            <span className="text-ink-soft text-2xs ml-2">
                              {c.payment_method_brand.toUpperCase()} ····{c.payment_method_last4}
                            </span>
                          )}
                        </div>
                        <div className="text-2xs text-ink-muted">
                          {c.status}
                          {c.refunded_amount > 0 && (
                            <> · refunded {fmt(c.refunded_amount, c.currency.toUpperCase())}</>
                          )}
                          {' · fee '}{fmt(c.amount_application_fee + (c.amount_stripe_fee ?? 0), c.currency.toUpperCase())}
                          {' · net '}{fmt(c.amount_net, c.currency.toUpperCase())}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <div className="font-mono text-sm">{fmt(c.amount_total, c.currency.toUpperCase())}</div>
                        {refundable && remaining > 0 && (
                          <button
                            type="button"
                            className="text-2xs text-ink-muted hover:text-claret"
                            onClick={() => {
                              setRefundOpen(c);
                              setRefundAmount('');
                              setRefundReason('');
                              setRefundError(null);
                            }}
                          >
                            Refund
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="text-2xs text-ink-soft">
            See <Link href="/app/settings/billing" className="underline">billing settings</Link> for
            your Crestio subscription.
          </div>
        </div>
      )}

      {refundOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-end md:items-center justify-center z-50" onClick={() => !refundBusy && setRefundOpen(null)}>
          <div className="bg-cream rounded-t-lg md:rounded-lg p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-display text-xl tracking-tightest mb-2">Refund charge</h2>
            <p className="text-sm text-ink-muted mb-4">
              Charge of {fmt(refundOpen.amount_total, refundOpen.currency.toUpperCase())}.
              Remaining {fmt(refundOpen.amount_total - refundOpen.refunded_amount, refundOpen.currency.toUpperCase())}.
              Refunds reverse the platform fee.
            </p>
            <div className="space-y-3">
              <div>
                <label className="block text-2xs uppercase tracking-widest text-ink-muted mb-1">
                  Amount (leave blank for full refund)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className="input w-full"
                  value={refundAmount}
                  onChange={(e) => setRefundAmount(e.target.value)}
                  placeholder="Full"
                />
              </div>
              <div>
                <label className="block text-2xs uppercase tracking-widest text-ink-muted mb-1">Reason</label>
                <input
                  type="text"
                  className="input w-full"
                  value={refundReason}
                  onChange={(e) => setRefundReason(e.target.value)}
                  placeholder="Customer requested"
                />
              </div>
              {refundError && <div className="text-sm text-claret">{refundError}</div>}
              <div className="flex gap-2 justify-end pt-2">
                <button
                  type="button"
                  className="btn-ghost"
                  disabled={refundBusy}
                  onClick={() => setRefundOpen(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  disabled={refundBusy}
                  onClick={submitRefund}
                >
                  {refundBusy ? 'Processing…' : 'Issue refund'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}

export default function PayoutsPage() {
  return <AuthGuard><OwnerOnly><PayoutsInner /></OwnerOnly></AuthGuard>;
}
