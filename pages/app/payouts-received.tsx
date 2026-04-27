import { useEffect, useState } from 'react';
import Link from 'next/link';
import AuthGuard from '../../components/AuthGuard';
import OwnerOnly from '../../components/OwnerOnly';
import Layout from '../../components/Layout';
import { supabase } from '../../lib/supabase';
import { Skeleton } from '../../components/design/Skeleton';
import { StatusPill } from '../../components/design/StatusPill';
import { Sparkline } from '../../components/design/Sparkline';
import EmptyState from '../../components/EmptyState';
import { IconCoin } from '../../components/design/icons';

type Status = {
  status: string | null;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  has_account: boolean;
  balance: { available: { amount: number; currency: string }[]; pending: { amount: number; currency: string }[] } | null;
  payouts: Array<{ id: string; amount: number; currency: string; status: string; arrival_date: number; created: number }>;
};

function PayoutsReceivedInner() {
  const [data, setData] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) { setLoading(false); return; }
      const res = await fetch('/api/stripe/connect/status', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) { if (!cancelled) setLoading(false); return; }
      const payload = await res.json();
      if (!cancelled) {
        setData(payload as Status);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <Layout subtitle="Money" title="Payouts received">
      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : !data || !data.has_account || !data.payouts_enabled ? (
        <PreSetupExplainer />
      ) : (
        <div className="space-y-4">
          <BalancePill balance={data.balance} />
          <DepositChart payouts={data.payouts} />
          <div className="card overflow-hidden">
            {data.payouts.length === 0 ? (
              <div className="p-6 text-center text-sm text-ink-soft">No payouts yet.</div>
            ) : (
              <ul className="divide-y divide-rule">
                {data.payouts.map((p) => (
                  <li key={p.id} className="flex items-center gap-3 px-3 py-2.5" style={{ minHeight: 48 }}>
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] text-ink">
                        {formatStripeAmount(p.amount, p.currency)}
                      </div>
                      <div className="text-2xs text-ink-soft tabular">
                        {new Date(p.created * 1000).toLocaleDateString()}
                        {' · arriving '}
                        {new Date(p.arrival_date * 1000).toLocaleDateString()}
                      </div>
                    </div>
                    <StatusPill
                      tone={p.status === 'paid' ? 'success' : p.status === 'failed' ? 'claret' : 'forest'}
                    >
                      {p.status}
                    </StatusPill>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </Layout>
  );
}

function BalancePill({ balance }: { balance: Status['balance'] }) {
  if (!balance) return null;
  const available = balance.available[0];
  const pending = balance.pending[0];
  if (!available && !pending) return null;
  return (
    <div className="card p-4 flex items-center gap-6">
      {available && (
        <div>
          <div className="text-2xs uppercase tracking-widest text-ink-muted font-medium">Available</div>
          <div className="text-lg font-medium tabular text-ink">
            {formatStripeAmount(available.amount, available.currency)}
          </div>
        </div>
      )}
      {pending && (
        <div>
          <div className="text-2xs uppercase tracking-widest text-ink-muted font-medium">Pending</div>
          <div className="text-lg font-medium tabular text-ink-muted">
            {formatStripeAmount(pending.amount, pending.currency)}
          </div>
        </div>
      )}
    </div>
  );
}

function PreSetupExplainer() {
  return (
    <div className="card p-6 max-w-2xl">
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-full bg-forest-soft text-forest-ink grid place-items-center shrink-0">
          <IconCoin />
        </div>
        <div className="flex-1">
          <h2 className="text-base font-display font-semibold tracking-tighter mb-2 m-0">
            Take payments directly from parents.
          </h2>
          <ul className="text-sm text-ink-muted space-y-1.5 mb-4">
            <li className="flex items-start gap-2">
              <Bullet />
              <span>No card details needed for the parent — they pay with one tap.</span>
            </li>
            <li className="flex items-start gap-2">
              <Bullet />
              <span>1% Crestio fee. Stripe processing on top, paid by you.</span>
            </li>
            <li className="flex items-start gap-2">
              <Bullet />
              <span>Funds land in your bank account in about 2 days.</span>
            </li>
          </ul>
          <div className="flex items-center gap-2">
            <Link href="/app/owner/payouts" className="btn-primary">
              Set up parent payments
            </Link>
            <Link href="/app/settings/billing" className="btn-ghost text-xs">
              Manage billing →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function Bullet() {
  return (
    <span aria-hidden="true" className="mt-2 inline-block w-1 h-1 rounded-full bg-forest shrink-0" />
  );
}

function DepositChart({ payouts }: { payouts: Status['payouts'] }) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = 30;
  const buckets = new Array(days).fill(0);
  for (const p of payouts) {
    if (p.status !== 'paid') continue;
    const arrival = new Date(p.arrival_date * 1000);
    arrival.setHours(0, 0, 0, 0);
    const diff = Math.floor((today.getTime() - arrival.getTime()) / 86_400_000);
    if (diff >= 0 && diff < days) buckets[days - 1 - diff] += p.amount;
  }
  const total = buckets.reduce((a, b) => a + b, 0);
  if (total === 0) return null;
  const last = buckets[buckets.length - 1];
  const currency = (payouts[0]?.currency ?? 'aud').toUpperCase();
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="text-2xs uppercase tracking-widest text-ink-muted font-medium">
          Last 30 days · {currency}
        </div>
        <div className="text-2xs text-ink-soft num tabular">
          Total {formatStripeAmount(total, currency.toLowerCase())}
        </div>
      </div>
      <div className="relative">
        <Sparkline data={buckets} width={400} height={48} stroke="#1F3A2E" fill />
        <div className="absolute right-0 top-0 text-xs num tabular text-ink font-medium bg-cream/80 px-1.5 rounded">
          {formatStripeAmount(last, currency.toLowerCase())}
        </div>
      </div>
    </div>
  );
}

function formatStripeAmount(amount: number, currency: string): string {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: currency.toUpperCase(),
    maximumFractionDigits: 0,
  }).format(amount / 100);
}

export default function PayoutsReceivedPage() {
  return <AuthGuard><OwnerOnly><PayoutsReceivedInner /></OwnerOnly></AuthGuard>;
}
