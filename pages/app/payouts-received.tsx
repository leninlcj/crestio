import { useEffect, useState } from 'react';
import Link from 'next/link';
import AuthGuard from '../../components/AuthGuard';
import OwnerOnly from '../../components/OwnerOnly';
import Layout from '../../components/Layout';
import { supabase } from '../../lib/supabase';
import { Skeleton } from '../../components/design/Skeleton';
import { StatusPill } from '../../components/design/StatusPill';
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
        <EmptyState
          icon={<IconCoin />}
          title="Parent payments aren't on yet."
          description="Once parent payments are turned on, your payouts from Stripe will show here."
          action={
            <Link href="/app/settings/billing" className="btn-primary">
              Set up parent payments
            </Link>
          }
        />
      ) : (
        <div className="space-y-4">
          <BalancePill balance={data.balance} />
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
