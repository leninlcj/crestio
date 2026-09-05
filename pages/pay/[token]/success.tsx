import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';

// /pay/[token]/success — Stripe redirects here with payment_intent and
// payment_intent_client_secret query params. We show a generic success
// confirmation; the webhook is the source of truth for marking invoices paid.
export default function PaySuccessPage() {
  const router = useRouter();
  const status = typeof router.query.redirect_status === 'string' ? router.query.redirect_status : null;
  const [label, setLabel] = useState('Processing…');

  useEffect(() => {
    if (!status) return;
    if (status === 'succeeded') setLabel('Payment received');
    else if (status === 'processing') setLabel('Payment processing');
    else setLabel('Payment status');
  }, [status]);

  return (
    <>
      <Head><title>{label}</title></Head>
      <div className="min-h-screen bg-cream text-ink flex items-center justify-center px-6">
        <div className="card p-8 max-w-md w-full text-center">
          <div className="text-2xs uppercase tracking-widest text-ink-muted mb-2">Crestio</div>
          <h1 className="font-display text-3xl tracking-tightest mb-3">{label}</h1>
          <p className="text-sm text-ink-muted mb-6">
            {status === 'succeeded'
              ? 'Thanks. A receipt is on its way to your email if you provided one.'
              : status === 'processing'
              ? 'Your payment is processing. We will email a receipt once it clears.'
              : 'We will email you once we have an update.'}
          </p>
          <Link href="/" className="btn-secondary text-sm">Done</Link>
        </div>
      </div>
    </>
  );
}
