import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { loadStripe, type Stripe, type StripeElements } from '@stripe/stripe-js';
import AuthGuardParent from '../../components/AuthGuardParent';
import { supabase } from '../../lib/supabase';

type Invoice = {
  id: string;
  number: string;
  total_cents: number;
  currency: string;
  due_on: string | null;
  status: string;
  organization_id: string;
  organization_name: string | null;
};

type SavedCard = {
  id: string;
  brand: string | null;
  last4: string | null;
  exp_month: number | null;
  exp_year: number | null;
};

function fmt(cents: number, currency: string): string {
  try { return new Intl.NumberFormat('en-AU', { style: 'currency', currency: currency.toUpperCase() }).format(cents / 100); }
  catch { return `$${(cents / 100).toFixed(2)}`; }
}
function fmtDate(s: string | null): string {
  if (!s) return '–';
  try { return new Date(s).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }); }
  catch { return s; }
}

function ParentPayInner() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [savedCards, setSavedCards] = useState<SavedCard[]>([]);
  const [savedCardsOrgId, setSavedCardsOrgId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chosenPm, setChosenPm] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [intent, setIntent] = useState<{
    clientSecret: string;
    publishableKey: string;
    connectedAccountId: string;
    amountTotal: number;
    currency: string;
  } | null>(null);

  const stripeRef = useRef<Stripe | null>(null);
  const elementsRef = useRef<StripeElements | null>(null);
  const mountRef = useRef<HTMLDivElement | null>(null);

  // Load unpaid invoices for this parent + saved cards.
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const userId = session?.user?.id;
        if (!userId) { setError('Sign in required.'); return; }
        const { data: parent } = await supabase
          .from('parents')
          .select('id')
          .eq('auth_user_id', userId)
          .maybeSingle();
        if (!parent) { setError('Parent account required.'); return; }

        // Pull invoices through RLS — parent_select policy lets us see invoices
        // for linked students + our households.
        const { data: rows, error: invErr } = await supabase
          .from('invoices')
          .select('id, number, total_cents, currency, due_on, status, organization_id')
          .in('status', ['sent', 'overdue', 'draft'])
          .order('due_on', { ascending: true });
        if (invErr) { setError(invErr.message); return; }
        const orgIds = Array.from(new Set(((rows ?? []) as any[]).map((r) => r.organization_id)));
        const orgNameById = new Map<string, string>();
        if (orgIds.length > 0) {
          const { data: orgs } = await supabase
            .from('organizations')
            .select('id, name')
            .in('id', orgIds);
          for (const o of (orgs ?? []) as any[]) orgNameById.set(o.id, o.name);
        }
        const enriched: Invoice[] = ((rows ?? []) as any[])
          .filter((r) => r.total_cents > 0)
          .map((r) => ({
            id: r.id,
            number: r.number,
            total_cents: r.total_cents,
            currency: r.currency,
            due_on: r.due_on,
            status: r.status,
            organization_id: r.organization_id,
            organization_name: orgNameById.get(r.organization_id) ?? null,
          }));
        setInvoices(enriched);

        // Saved cards.
        if (session?.access_token) {
          const res = await fetch('/api/parent-portal/saved-cards', {
            headers: { Authorization: `Bearer ${session.access_token}` },
          });
          if (res.ok) {
            const payload = await res.json();
            setSavedCards(payload.saved_cards ?? []);
            setSavedCardsOrgId(payload.org_id ?? null);
          }
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Group invoices by org so we never let users mix invoices across tutors.
  const grouped = useMemo(() => {
    const m = new Map<string, Invoice[]>();
    for (const inv of invoices) {
      const arr = m.get(inv.organization_id) ?? [];
      arr.push(inv);
      m.set(inv.organization_id, arr);
    }
    return Array.from(m.entries()).map(([orgId, list]) => ({
      orgId,
      orgName: list[0]?.organization_name ?? 'Tutor',
      list,
    }));
  }, [invoices]);

  const selectedInvoices = invoices.filter((i) => selected.has(i.id));
  const selectedOrgIds = new Set(selectedInvoices.map((i) => i.organization_id));
  const total = selectedInvoices.reduce((a, i) => a + i.total_cents, 0);
  const currency = selectedInvoices[0]?.currency ?? 'AUD';
  const canShowSavedCards =
    selectedOrgIds.size === 1 &&
    savedCardsOrgId !== null &&
    [...selectedOrgIds][0] === savedCardsOrgId;

  // Mount Stripe Payment Element after we have a clientSecret.
  useEffect(() => {
    if (!intent || !mountRef.current) return;
    let cancelled = false;
    (async () => {
      const stripe = await loadStripe(intent.publishableKey, {
        stripeAccount: intent.connectedAccountId,
      });
      if (cancelled || !stripe) return;
      stripeRef.current = stripe;
      const elements = stripe.elements({ clientSecret: intent.clientSecret, appearance: { theme: 'stripe' } });
      elementsRef.current = elements;
      const payment = elements.create('payment', { layout: 'tabs' });
      payment.mount(mountRef.current!);
    })();
    return () => { cancelled = true; };
  }, [intent]);

  const togglePay = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else {
        const inv = invoices.find((i) => i.id === id);
        if (!inv) return prev;
        // Prevent mixing orgs.
        const otherOrgs = [...next]
          .map((sid) => invoices.find((i) => i.id === sid)?.organization_id)
          .filter((x): x is string => Boolean(x))
          .filter((oid) => oid !== inv.organization_id);
        if (otherOrgs.length > 0) {
          // Reset selection to just this invoice.
          return new Set([id]);
        }
        next.add(id);
      }
      return next;
    });
  }, [invoices]);

  const startPayment = useCallback(async () => {
    if (selectedInvoices.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) { setError('Sign in required.'); return; }
      const res = await fetch('/api/parent-portal/pay-multiple', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          invoiceIds: selectedInvoices.map((i) => i.id),
          paymentMethodId: chosenPm,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) { setError(payload?.error ?? 'Could not start payment.'); return; }
      setIntent({
        clientSecret: payload.clientSecret,
        publishableKey: payload.publishableKey,
        connectedAccountId: payload.connectedAccountId,
        amountTotal: payload.amountTotal,
        currency: payload.currency,
      });
    } catch (e: any) {
      setError(e?.message ?? 'Could not start payment.');
    } finally {
      setBusy(false);
    }
  }, [selectedInvoices, chosenPm]);

  const confirmPayment = useCallback(async () => {
    if (!stripeRef.current || !elementsRef.current) return;
    setBusy(true);
    setError(null);
    const returnUrl = typeof window !== 'undefined'
      ? `${window.location.origin}/parent/invoices`
      : '/parent/invoices';
    if (chosenPm && canShowSavedCards) {
      // Confirm with saved card directly (no PaymentElement).
      const { error: err } = await stripeRef.current.confirmCardPayment(intent!.clientSecret, {
        payment_method: chosenPm,
      });
      if (err) {
        setError(err.message ?? 'Payment failed.');
      } else {
        window.location.href = returnUrl + '?paid=1';
      }
    } else {
      const { error: err } = await stripeRef.current.confirmPayment({
        elements: elementsRef.current,
        confirmParams: { return_url: returnUrl },
      });
      if (err) setError(err.message ?? 'Payment failed.');
    }
    setBusy(false);
  }, [chosenPm, canShowSavedCards, intent]);

  const removeCard = useCallback(async (pmId: string) => {
    if (!window.confirm('Remove this saved card?')) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return;
    const res = await fetch(`/api/parent-portal/saved-cards?paymentMethodId=${encodeURIComponent(pmId)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (res.ok) {
      setSavedCards((prev) => prev.filter((c) => c.id !== pmId));
      if (chosenPm === pmId) setChosenPm(null);
    }
  }, [chosenPm]);

  return (
    <div className="min-h-screen bg-cream text-ink">
      <nav className="px-6 md:px-12 py-6 flex items-center justify-between border-b border-rule">
        <Link href="/parent/dashboard" className="font-display text-2xl tracking-tightest">
          crest<span className="italic text-forest">io</span>
        </Link>
        <Link href="/parent/invoices" className="text-sm text-ink-muted hover:text-ink">Invoices</Link>
      </nav>

      <main className="px-6 md:px-12 py-10 max-w-3xl mx-auto">
        <div className="mb-6">
          <h1 className="font-display text-3xl tracking-tightest">Pay invoices</h1>
          <p className="text-sm text-ink-muted">Select one or more invoices to pay together.</p>
        </div>

        {loading ? (
          <div className="card p-6 text-sm text-ink-muted">Loading…</div>
        ) : invoices.length === 0 ? (
          <div className="card p-6 text-sm text-ink-muted">No outstanding invoices. You're all caught up.</div>
        ) : (
          <div className="space-y-6">
            {grouped.map((g) => (
              <div key={g.orgId} className="card p-5">
                <div className="text-2xs uppercase tracking-widest text-ink-muted mb-3">{g.orgName}</div>
                <ul className="divide-y divide-ruleSoft">
                  {g.list.map((inv) => (
                    <li key={inv.id} className="py-3 flex items-center justify-between gap-4">
                      <label className="flex items-center gap-3 cursor-pointer flex-1 min-w-0">
                        <input
                          type="checkbox"
                          checked={selected.has(inv.id)}
                          onChange={() => togglePay(inv.id)}
                        />
                        <div className="min-w-0">
                          <div className="text-sm text-ink truncate">{inv.number}</div>
                          <div className="text-2xs text-ink-muted">
                            {inv.due_on ? `Due ${fmtDate(inv.due_on)}` : 'No due date'}
                            {inv.status === 'overdue' ? ' · overdue' : ''}
                          </div>
                        </div>
                      </label>
                      <div className="font-mono text-sm shrink-0">{fmt(inv.total_cents, inv.currency)}</div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}

            <div className="card p-5">
              <div className="flex items-baseline justify-between mb-4">
                <div className="text-2xs uppercase tracking-widest text-ink-muted">Total</div>
                <div className="font-display text-3xl tracking-tightest num">
                  {selectedInvoices.length > 0 ? fmt(total, currency) : '–'}
                </div>
              </div>

              {canShowSavedCards && savedCards.length > 0 && !intent && (
                <div className="mb-4">
                  <div className="text-2xs uppercase tracking-widest text-ink-muted mb-2">Saved cards</div>
                  <ul className="space-y-2">
                    {savedCards.map((c) => (
                      <li key={c.id} className="flex items-center justify-between gap-3">
                        <label className="flex items-center gap-2 cursor-pointer flex-1">
                          <input
                            type="radio"
                            name="saved-card"
                            checked={chosenPm === c.id}
                            onChange={() => setChosenPm(c.id)}
                          />
                          <span className="text-sm">
                            {(c.brand ?? 'Card').toUpperCase()} ····{c.last4}
                          </span>
                          <span className="text-2xs text-ink-muted">
                            exp {String(c.exp_month).padStart(2, '0')}/{String(c.exp_year).slice(-2)}
                          </span>
                        </label>
                        <button onClick={() => removeCard(c.id)} className="text-2xs text-ink-soft hover:text-claret">Remove</button>
                      </li>
                    ))}
                    <li>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="saved-card"
                          checked={chosenPm === null}
                          onChange={() => setChosenPm(null)}
                        />
                        <span className="text-sm">Use a new card</span>
                      </label>
                    </li>
                  </ul>
                </div>
              )}

              {error && <div className="text-sm text-claret mb-3">{error}</div>}

              {!intent && (
                <button
                  type="button"
                  className="btn-primary w-full"
                  disabled={busy || selectedInvoices.length === 0}
                  onClick={startPayment}
                >
                  {busy ? 'Preparing…' : `Pay ${fmt(total, currency)}`}
                </button>
              )}

              {intent && (
                <div className="space-y-4">
                  {(!chosenPm || !canShowSavedCards) && (
                    <div ref={mountRef} className="min-h-[200px]" />
                  )}
                  <button
                    type="button"
                    className="btn-primary w-full"
                    disabled={busy}
                    onClick={confirmPayment}
                  >
                    {busy ? 'Processing…' : `Pay ${fmt(intent.amountTotal, intent.currency)}`}
                  </button>
                  <p className="text-2xs text-ink-soft text-center">
                    Payments are processed by Stripe.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default function ParentPayPage() {
  return <AuthGuardParent><ParentPayInner /></AuthGuardParent>;
}
