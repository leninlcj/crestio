import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { useLocaleFormatters } from '../../lib/useLocaleFormatters';

type Props = {
  outstandingCents: number;
  unpaidCount?: number;
};

export default function BalanceCard({ outstandingCents, unpaidCount }: Props) {
  const { t } = useTranslation('parent');
  const { formatMoney } = useLocaleFormatters();

  if (outstandingCents <= 0) {
    return (
      <section className="rounded-md border border-forest/20 bg-forest-soft/40 p-5 md:p-6">
        <h2 className="text-2xs uppercase tracking-widest text-forest font-medium mb-3">
          {t('dashboard_v2.balance')}
        </h2>
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-full bg-forest text-cream grid place-items-center shrink-0" aria-hidden>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M3 8.5L6.5 12L13 4.5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div className="min-w-0">
            <div className="font-display text-base md:text-lg tracking-tightest text-forest-ink leading-tight">
              All paid up.
            </div>
            <div className="text-2xs text-forest-ink/85 mt-1">Thank you.</div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-md border border-claret/30 bg-claret/[0.04] p-5 md:p-6">
      <h2 className="text-2xs uppercase tracking-widest text-claret mb-2">
        {t('dashboard_v2.outstanding_balance')}
      </h2>
      <div className="font-display text-2xl md:text-3xl tracking-tighter text-claret tabular-nums">
        {formatMoney(outstandingCents, 'AUD', { maximumFractionDigits: outstandingCents % 100 === 0 ? 0 : 2 })}
      </div>
      {typeof unpaidCount === 'number' && (
        <div className="text-2xs text-claret/80 mt-1">
          {t('dashboard_v2.unpaid_invoices', { count: unpaidCount })}
        </div>
      )}
      <Link
        href="/parent/pay"
        className="mt-4 inline-flex items-center justify-center btn-primary text-sm h-10 px-4 w-full md:w-auto"
      >
        {t('dashboard_v2.pay_now')}
      </Link>
    </section>
  );
}
