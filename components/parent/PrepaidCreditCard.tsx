import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { authFetch } from '../../lib/authFetch';
import { useLocaleFormatters } from '../../lib/useLocaleFormatters';
import { CREDIT_KIND_LABEL, type CreditKind } from '../../lib/householdCredit';

type StudentBlock = { id: string; name: string; hourly_rate_cents: number | null; block: { hours: number; face_value_cents: number; price_cents: number } | null };
type HouseholdCredit = {
  id: string; display_name: string; balance_cents: number; lessons_covered: number; setup_required: boolean;
  ledger: Array<{ id: string; created_at: string; kind: string; amount_cents: number; note: string | null; invoice: { number: string } | null }>;
  students: StudentBlock[];
};
type Payload = { households: HouseholdCredit[]; block: { hours: number; discount_percent: number } };

// Prepaid credit in the parent portal: the balance, what it covers, the ledger,
// and a button that creates a block invoice and opens the card payment page.
export function PrepaidCreditCard({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation('parent');
  const { formatMoney, formatDate } = useLocaleFormatters();
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [buying, setBuying] = useState<string | null>(null);
  const [showLedger, setShowLedger] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await authFetch('/api/parent/credit');
        const payload = await res.json();
        if (!res.ok) throw new Error(payload?.error ?? 'Could not load credit.');
        setData(payload);
      } catch (e: any) {
        setError(e?.message ?? 'Could not load credit.');
      }
    })();
  }, []);

  const money = (c: number) => formatMoney(c, 'AUD', { maximumFractionDigits: c % 100 === 0 ? 0 : 2 });

  async function buy(studentId: string) {
    setBuying(studentId); setError(null);
    try {
      const res = await authFetch('/api/parent/credit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ student_id: studentId }) });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error ?? 'Could not create the block.');
      if (payload.pay_url) { window.location.href = payload.pay_url; return; }
      setError(t('credit.created_no_link', { defaultValue: 'The invoice was created. Open it under Invoices to pay.' }));
    } catch (e: any) {
      setError(e?.message ?? 'Could not create the block.');
    } finally {
      setBuying(null);
    }
  }

  if (!data && !error) return null;
  const households = (data?.households ?? []).filter((h) => !h.setup_required);
  if (households.length === 0 && !error) return null;
  const hours = data?.block.hours ?? 10;
  const pct = data?.block.discount_percent ?? 5;

  return (
    <div className="rounded-md border border-rule bg-surface p-5">
      <div className="text-2xs uppercase tracking-widest text-ink-soft mb-2">{t('credit.eyebrow', { defaultValue: 'Prepaid credit' })}</div>
      {error && <p className="text-sm text-claret mb-3" role="alert">{error}</p>}
      <div className="space-y-4">
        {households.map((h) => (
          <div key={h.id}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <div className={`font-display text-3xl tracking-tighter tabular-nums ${h.balance_cents < 0 ? 'text-claret' : 'text-ink'}`}>{money(h.balance_cents)}</div>
                <div className="text-2xs text-ink-soft mt-0.5">
                  {households.length > 1 ? `${h.display_name} · ` : ''}
                  {h.balance_cents > 0
                    ? t('credit.covers', { count: h.lessons_covered, defaultValue: 'Covers about {{count}} lessons at your current rate.' })
                    : h.balance_cents < 0
                      ? t('credit.negative', { defaultValue: 'A refunded block had already been used. We will be in touch to settle the difference.' })
                      : t('credit.none', { defaultValue: 'No prepaid credit. Lessons are invoiced after they happen.' })}
                </div>
              </div>
              {!compact && h.ledger.length > 0 && (
                <button type="button" className="text-xs text-forest underline underline-offset-2" onClick={() => setShowLedger((v) => !v)}>
                  {showLedger ? t('credit.hide_history', { defaultValue: 'Hide history' }) : t('credit.show_history', { defaultValue: 'Show history' })}
                </button>
              )}
            </div>

            {!compact && showLedger && h.ledger.length > 0 && (
              <ul className="mt-3 divide-y divide-ruleSoft border-t border-rule">
                {h.ledger.map((r) => (
                  <li key={r.id} className="py-2 flex items-center justify-between gap-3 text-xs">
                    <span className="text-ink-muted">{formatDate(r.created_at, { day: 'numeric', month: 'short' })} · {CREDIT_KIND_LABEL[r.kind as CreditKind] ?? r.kind}{r.invoice?.number ? ` ${r.invoice.number}` : ''}{r.note && r.kind !== 'drawdown' ? ` · ${r.note}` : ''}</span>
                    <span className={`font-mono tabular-nums ${r.amount_cents < 0 ? 'text-ink-muted' : 'text-forest-ink'}`}>{r.amount_cents < 0 ? '-' : '+'}{money(Math.abs(r.amount_cents))}</span>
                  </li>
                ))}
              </ul>
            )}

            {h.students.some((s) => s.block) && (
              <div className="mt-4 pt-4 border-t border-rule">
                <p className="text-sm text-ink-muted leading-relaxed mb-3">
                  {t('credit.offer', { hours, pct, defaultValue: 'Buy {{hours}} hours up front at {{pct}}% off. Each lesson is drawn from the credit, every invoice shows what is left, and unused credit is refundable.' })}
                </p>
                <div className="flex flex-wrap gap-2">
                  {h.students.filter((s) => s.block).map((s) => (
                    <button key={s.id} type="button" className="btn-secondary text-sm h-10 min-h-[40px] px-4" disabled={!!buying} onClick={() => buy(s.id)}>
                      {buying === s.id
                        ? t('credit.creating', { defaultValue: 'One moment' })
                        : t('credit.buy_for', { name: s.name.split(' ')[0], price: money(s.block!.price_cents), defaultValue: '{{hours}} hours for {{name}}: {{price}}', hours })}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-2xs text-ink-soft">{t('credit.buy_hint', { defaultValue: 'Opens a secure card payment page. Nothing is charged until you pay there.' })}</p>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
