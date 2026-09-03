import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { loadStripe, type Stripe, type StripeElements } from '@stripe/stripe-js';

type SiblingInvoice = { token: string; number: string; total_cents: number; due_on: string | null };

type PayInfo = {
  org: { name: string; charges_enabled: boolean; status: string; agency_note?: string | null };
  invoice: {
    id: string;
    number: string;
    total_cents: number;
    currency: string;
    status: string;
    due_on: string | null;
    issued_on: string;
    billed_to: string | null;
  };
  sibling_invoices: SiblingInvoice[];
};

function formatAmount(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-AU', { style: 'currency', currency: currency.toUpperCase() }).format(cents / 100);
  } catch {
    return `$${(cents / 100).toFixed(2)}`;
  }
}

function formatDate(s: string | null): string {
  if (!s) return '—';
  try {
    return new Date(s).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return s;
  }
}

export default function PublicPayPage() {
  const router = useRouter();
  const token = typeof router.query.token === 'string' ? router.query.token : null;

  const [info, setInfo] = useState<PayInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [extraTokens, setExtraTokens] = useState<Set<string>>(new Set());
  const [parentEmail, setParentEmail] = useState('');
  const [parentName, setParentName] = useState('');
  const [savePaymentMethod, setSavePaymentMethod] = useState(false);
  const [busy, setBusy] = useState(false);
  const [intentResult, setIntentResult] = useState<{
    clientSecret: string;
    publishableKey: string;
    connectedAccountId: string;
    amountTotal: number;
    currency: string;
  } | null>(null);
  const stripeRef = useRef<Stripe | null>(null);
  const elementsRef = useRef<StripeElements | null>(null);
  const paymentMountRef = useRef<HTMLDivElement | null>(null);

  // Load invoice info.
  useEffect(() => {
    if (!token) return;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/pay/${encodeURIComponent(token)}`);
        if (res.status === 429) { setError('Too many requests. Please wait a minute and try again.'); return; }
        if (!res.ok) {
          const payload = await res.json().catch(() => ({}));
          setError(payload?.error ?? 'Invoice not found.');
          return;
        }
        const data = (await res.json()) as PayInfo;
        setInfo(data);
      } catch (e: any) {
        setError(e?.message ?? 'Failed to load invoice.');
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  const isPayable = info?.invoice.status !== 'paid' && info?.invoice.status !== 'void';

  const total = useMemo(() => {
    if (!info) return 0;
    let t = info.invoice.total_cents;
    for (const sib of info.sibling_invoices) {
      if (extraTokens.has(sib.token)) t += sib.total_cents;
    }
    return t;
  }, [info, extraTokens]);

  // After we have a clientSecret, mount the Stripe Payment Element.
  useEffect(() => {
    if (!intentResult || !paymentMountRef.current) return;
    let cancelled = false;
    (async () => {
      const stripe = await loadStripe(intentResult.publishableKey, {
        stripeAccount: intentResult.connectedAccountId,
      });
      if (cancelled || !stripe) return;
      stripeRef.current = stripe;
      const elements = stripe.elements({ clientSecret: intentResult.clientSecret, appearance: { theme: 'stripe' } });
      elementsRef.current = elements;
      const payment = elements.create('payment', { layout: 'tabs' });
      payment.mount(paymentMountRef.current!);
    })();
    return () => {
      cancelled = true;
    };
  }, [intentResult]);

  const startPayment = useCallback(async () => {
    if (!token || !info) return;
    setBusy(true);
    setError(null);
    try {
      const additionalTokens = info.sibling_invoices.filter((s) => extraTokens.has(s.token)).map((s) => s.token);
      const res = await fetch(`/api/pay/${encodeURIComponent(token)}/intent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parentEmail: parentEmail.trim() || null,
          parentName: parentName.trim() || null,
          savePaymentMethod: Boolean(savePaymentMethod && parentEmail.trim()),
          additionalTokens,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(payload?.error ?? 'Could not start payment.');
        return;
      }
      setIntentResult({
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
  }, [token, info, extraTokens, parentEmail, parentName, savePaymentMethod]);

  const confirmPayment = useCallback(async () => {
    if (!stripeRef.current || !elementsRef.current || !info) return;
    setBusy(true);
    setError(null);
    const returnUrl = typeof window !== 'undefined'
      ? `${window.location.origin}/pay/${encodeURIComponent(token ?? '')}/success`
      : `/pay/${encodeURIComponent(token ?? '')}/success`;
    const { error: err } = await stripeRef.current.confirmPayment({
      elements: elementsRef.current,
      confirmParams: { return_url: returnUrl, receipt_email: parentEmail.trim() || undefined },
    });
    if (err) {
      setError(err.message ?? 'Payment failed.');
    }
    setBusy(false);
  }, [info, token, parentEmail]);

  return (
    <>
      <Head>
        <title>{info ? `Pay ${info.org.name}` : 'Pay invoice'}</title>
      </Head>
      <div className="min-h-screen bg-cream text-ink">
        <header className="px-6 md:px-12 py-6 flex items-center justify-between border-b border-rule">
          <Link href="/" className="font-display text-2xl tracking-tightest">
            crest<span className="italic text-forest">io</span>
          </Link>
          <div className="text-2xs uppercase tracking-widest text-ink-muted">
            Secure payment via Stripe
          </div>
        </header>

        <main className="px-6 md:px-12 py-10 max-w-2xl mx-auto">
          {loading && <div className="card p-6 text-sm text-ink-muted">Loading invoice…</div>}
          {!loading && error && (
            <div className="card p-6 text-sm text-claret">{error}</div>
          )}
          {!loading && info && (
            <>
              <div className="mb-6">
                <div className="text-2xs uppercase tracking-widest text-ink-muted mb-1">{info.org.name}</div>
                <h1 className="font-display text-3xl tracking-tightest mb-1">
                  {isPayable ? 'Pay invoice' : info.invoice.status === 'paid' ? 'Already paid' : 'Invoice not payable'}
                </h1>
                {info.invoice.billed_to && (
                  <div className="text-sm text-ink-muted">For {info.invoice.billed_to}</div>
                )}
              </div>

              <div className="card p-6 mb-6">
                <div className="flex items-baseline justify-between mb-3">
                  <div className="text-sm text-ink-muted">Invoice {info.invoice.number}</div>
                  <div className="font-display text-2xl tracking-tightest num">
                    {formatAmount(info.invoice.total_cents, info.invoice.currency)}
                  </div>
                </div>
                <div className="text-2xs text-ink-muted">
                  Issued {formatDate(info.invoice.issued_on)}{info.invoice.due_on ? ` · due ${formatDate(info.invoice.due_on)}` : ''}
                </div>

                {info.sibling_invoices.length > 0 && isPayable && !intentResult && (
                  <div className="mt-5 pt-5 border-t border-rule">
                    <div className="text-2xs uppercase tracking-widest text-ink-muted mb-3">
                      Other unpaid invoices
                    </div>
                    <ul className="space-y-2">
                      {info.sibling_invoices.map((s) => (
                        <li key={s.token} className="flex items-center justify-between gap-3">
                          <label className="flex items-center gap-2 text-sm cursor-pointer">
                            <input
                              type="checkbox"
                              checked={extraTokens.has(s.token)}
                              onChange={(e) => {
                                setExtraTokens((prev) => {
                                  const next = new Set(prev);
                                  if (e.target.checked) next.add(s.token);
                                  else next.delete(s.token);
                                  return next;
                                });
                              }}
                            />
                            <span>{s.number}</span>
                            <span className="text-ink-muted text-2xs">
                              {s.due_on ? `due ${formatDate(s.due_on)}` : ''}
                            </span>
                          </label>
                          <span className="font-mono text-sm">{formatAmount(s.total_cents, info.invoice.currency)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="mt-5 pt-5 border-t border-rule flex items-center justify-between">
                  <div className="text-2xs uppercase tracking-widest text-ink-muted">Total to pay</div>
                  <div className="font-display text-3xl tracking-tightest num">
                    {formatAmount(total, info.invoice.currency)}
                  </div>
                </div>
              </div>

              {!isPayable && (
                <div className="card p-6 text-sm text-ink-muted">
                  This invoice is no longer accepting payments.
                </div>
              )}

              {isPayable && !info.org.charges_enabled && (
                <div className="card p-6 text-sm text-claret">
                  {info.org.name} has not finished setting up payments yet. Please contact them directly.
                </div>
              )}

              {isPayable && info.org.charges_enabled && !intentResult && (
                <div className="card p-6 space-y-4">
                  <div>
                    <label className="block text-2xs uppercase tracking-widest text-ink-muted mb-1">Email (for receipt)</label>
                    <input
                      type="email"
                      value={parentEmail}
                      onChange={(e) => setParentEmail(e.target.value)}
                      className="w-full input"
                      placeholder="you@example.com"
                    />
                  </div>
                  <div>
                    <label className="block text-2xs uppercase tracking-widest text-ink-muted mb-1">Name (optional)</label>
                    <input
                      type="text"
                      value={parentName}
                      onChange={(e) => setParentName(e.target.value)}
                      className="w-full input"
                      placeholder="Full name"
                    />
                  </div>
                  {parentEmail.trim().length > 0 && (
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={savePaymentMethod}
                        onChange={(e) => setSavePaymentMethod(e.target.checked)}
                      />
                      Save card for next time
                    </label>
                  )}
                  <button
                    type="button"
                    className="btn-primary w-full"
                    disabled={busy || total <= 0}
                    onClick={startPayment}
                  >
                    {busy ? 'Preparing…' : `Continue to payment · ${formatAmount(total, info.invoice.currency)}`}
                  </button>
                </div>
              )}

              {intentResult && (
                <div className="card p-6 space-y-4">
                  <div className="text-2xs uppercase tracking-widest text-ink-muted">
                    Card details
                  </div>
                  <div ref={paymentMountRef} className="min-h-[200px]" />
                  {error && <div className="text-sm text-claret">{error}</div>}
                  <button
                    type="button"
                    className="btn-primary w-full"
                    disabled={busy}
                    onClick={confirmPayment}
                  >
                    {busy ? 'Processing…' : `Pay ${formatAmount(intentResult.amountTotal, intentResult.currency)}`}
                  </button>
                  <p className="text-2xs text-ink-soft text-center">
                    Payments are processed by Stripe. Your card details never touch our servers.
                  </p>
                  {info?.org?.agency_note && (
                    <p className="text-2xs text-ink-soft text-center leading-relaxed">{info.org.agency_note}</p>
                  )}
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </>
  );
}
