import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

// Auto-pay UI. The toggle persists, and the parent can save a card via
// Stripe Connect Customer (POST /api/parent/save-payment-method, stub).
// The actual auto-charging on invoice.sent is queued for a follow-up commit
// (14F+) — this lets parents prep the option now.

type Props = {
  parentId: string | null;
};

export default function AutoPayCard({ parentId }: Props) {
  const [enabled, setEnabled] = useState(false);
  const [last4, setLast4] = useState<string | null>(null);
  const [brand, setBrand] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!parentId) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('parents')
        .select('autopay_enabled, stripe_default_payment_method_id')
        .eq('id', parentId)
        .maybeSingle();
      if (cancelled) return;
      if (data) {
        setEnabled(!!data.autopay_enabled);
        // We don't store last4 in the DB; fetch it from Stripe via the API.
        if (data.stripe_default_payment_method_id) {
          try {
            const res = await fetch(`/api/parent/save-payment-method?parent_id=${parentId}`);
            if (res.ok) {
              const j = await res.json();
              setLast4(j.last4 ?? null);
              setBrand(j.brand ?? null);
            }
          } catch { /* */ }
        }
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [parentId]);

  async function toggle() {
    if (!parentId) return;
    if (!last4) {
      // No saved card yet — kick off the save flow first.
      saveCard();
      return;
    }
    const next = !enabled;
    setEnabled(next);
    setSaving(true);
    try {
      await supabase.from('parents').update({ autopay_enabled: next }).eq('id', parentId);
    } finally {
      setSaving(false);
    }
  }

  async function saveCard() {
    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch('/api/parent/save-payment-method', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      });
      const j = await res.json();
      if (j?.checkout_url) {
        window.location.href = j.checkout_url;
      } else if (j?.error) {
        alert(j.error);
      }
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="rounded-md border border-rule bg-surface p-5 md:p-6 animate-pulse">
        <div className="h-3 w-24 bg-ruleSoft rounded mb-3" />
        <div className="h-4 w-2/3 bg-ruleSoft rounded mb-4" />
        <div className="h-8 w-32 bg-ruleSoft rounded" />
      </div>
    );
  }

  return (
    <div className="rounded-md border border-rule bg-surface p-5 md:p-6">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <div className="text-2xs uppercase tracking-widest text-ink-soft mb-1">Auto-pay</div>
          <h3 className="font-display text-base tracking-tightest text-ink m-0">
            {enabled ? 'On — invoices charge automatically' : last4 ? 'Card saved · ready when you are' : 'Save a card to auto-pay'}
          </h3>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          onClick={toggle}
          disabled={saving || !parentId}
          className={[
            'shrink-0 relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50',
            enabled ? 'bg-forest' : 'bg-rule',
          ].join(' ')}
        >
          <span
            className={[
              'inline-block h-4 w-4 transform rounded-full bg-cream transition-transform',
              enabled ? 'translate-x-6' : 'translate-x-1',
            ].join(' ')}
          />
        </button>
      </div>
      <p className="text-2xs text-ink-muted leading-relaxed">
        {last4
          ? `${brand?.toUpperCase() ?? 'Card'} ending in ${last4}. ${enabled ? 'Future invoices charge automatically when sent.' : 'Toggle on to charge new invoices automatically.'}`
          : 'Save a card and we\'ll charge new invoices automatically. No more "did you see my invoice?" follow-ups.'}
      </p>
      {!last4 && (
        <button
          type="button"
          onClick={saveCard}
          disabled={saving}
          className="mt-4 btn-primary text-2xs h-8 min-h-[32px] px-4"
        >
          {saving ? 'Opening checkout…' : 'Save a card →'}
        </button>
      )}
      {last4 && (
        <button
          type="button"
          onClick={saveCard}
          disabled={saving}
          className="mt-4 text-2xs text-ink-soft hover:text-ink underline-offset-2 hover:underline"
        >
          Replace card →
        </button>
      )}
    </div>
  );
}
