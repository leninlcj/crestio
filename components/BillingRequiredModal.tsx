import { useEffect } from 'react';
import { useBilling } from '../lib/billingContext';

export default function BillingRequiredModal() {
  const { paywallOpen, paywallReason, closePaywall, startCheckout, status } = useBilling();

  useEffect(() => {
    if (!paywallOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        closePaywall();
      }
    }
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [paywallOpen, closePaywall]);

  if (!paywallOpen) return null;

  const isOwner = status?.role === 'owner';
  const headline =
    paywallReason === 'trial_expired'
      ? 'Your free trial has ended.'
      : paywallReason === 'subscription_past_due'
      ? 'Payment is past due.'
      : paywallReason === 'canceled'
      ? 'Your subscription has been cancelled.'
      : "Your organisation's subscription isn't active.";

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-ink/40"
      role="dialog"
      aria-modal="true"
      aria-label="Subscription required"
    >
      <div className="w-full max-w-md bg-cream border border-rule rounded-lg shadow-xl p-6">
        <div className="text-2xs uppercase tracking-widest text-ink-soft mb-2">
          Subscription required
        </div>
        <h2 className="font-display text-2xl tracking-tightest text-ink mb-3">{headline}</h2>
        {isOwner ? (
          <p className="text-sm text-ink-muted mb-5">
            Subscribe to keep using Crestio — $19/month, cancel anytime.
          </p>
        ) : (
          <p className="text-sm text-ink-muted mb-5">
            Your organisation&apos;s subscription has lapsed. Contact your organisation owner to reactivate.
          </p>
        )}
        <div className="flex items-center justify-end gap-2">
          <button type="button" onClick={closePaywall} className="btn-ghost text-xs">
            Close
          </button>
          {isOwner && (
            <button type="button" onClick={startCheckout} className="btn-primary text-xs">
              Subscribe now
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
