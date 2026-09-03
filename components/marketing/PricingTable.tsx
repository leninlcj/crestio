import { useState } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { PLAN_CATALOGUE, type BillingInterval } from '../../lib/plans';
import { useLocaleFormatters } from '../../lib/useLocaleFormatters';
import { paymentLinkUrl, isPayablePlan } from '../../lib/stripe/payment-links';

type TierKey = 'solo' | 'team' | 'growth';

type Props = {
  showHeader?: boolean;
  showCompareLink?: boolean;
  defaultExpanded?: boolean;
};

const TIERS: { tier: TierKey; featureKeys: string[] }[] = [
  { tier: 'solo',   featureKeys: ['unlimited', 'polish', 'parent_portal', 'invoicing', 'calendar', 'plans', 'support', 'trial'] },
  { tier: 'team',   featureKeys: ['inherits', 'up_to_5', 'payouts', 'roles', 'owner_brief', 'team_calendar', 'trial'] },
  { tier: 'growth', featureKeys: ['inherits_team', 'up_to_15', 'priority', 'onboarding', 'advanced_reports'] },
];

export default function PricingTable({ showHeader = true, showCompareLink = true, defaultExpanded = false }: Props) {
  const { t } = useTranslation('marketing');
  const [interval, setInterval] = useState<BillingInterval>('monthly');
  const [comparing, setComparing] = useState(defaultExpanded);

  return (
    <section id="pricing" className="px-6 md:px-12 py-20 md:py-28 max-w-6xl mx-auto scroll-mt-20">
      {showHeader && (
        <div className="text-center mb-8">
          <div className="text-2xs uppercase tracking-widest text-ink-soft mb-3">
            {t('pricing_v2.eyebrow')}
          </div>
          <h2 className="font-display text-3xl md:text-4xl tracking-tighter text-ink mb-4 text-balance">
            {t('pricing_v2.heading')}
          </h2>
          <p className="text-ink-muted text-base max-w-prose mx-auto">
            {t('pricing_v2.subheading')}
          </p>
        </div>
      )}

      <div className="flex justify-center mb-10 md:mb-12">
        <div
          className="inline-flex items-center border border-rule rounded-full bg-surface p-1 gap-1"
          role="tablist"
          aria-label={t('pricing_v2.toggle_label')}
        >
          <button
            type="button"
            role="tab"
            aria-selected={interval === 'monthly'}
            onClick={() => setInterval('monthly')}
            className={[
              'px-4 py-1.5 text-sm rounded-full transition-colors duration-150',
              interval === 'monthly' ? 'bg-forest text-cream' : 'text-ink-muted hover:text-ink',
            ].join(' ')}
          >
            {t('pricing_v2.monthly')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={interval === 'annual'}
            onClick={() => setInterval('annual')}
            className={[
              'px-4 py-1.5 text-sm rounded-full transition-colors duration-150 inline-flex items-center gap-1.5',
              interval === 'annual' ? 'bg-forest text-cream' : 'text-ink-muted hover:text-ink',
            ].join(' ')}
          >
            {t('pricing_v2.annual')}
            <span
              className={[
                'inline-flex items-center px-1.5 py-0.5 rounded-full text-2xs uppercase tracking-widest font-medium',
                interval === 'annual' ? 'bg-cream/15 text-cream' : 'bg-amber-soft text-amber-ink',
              ].join(' ')}
            >
              {t('pricing_v2.save_short')}
            </span>
          </button>
        </div>
      </div>

      <div className="grid gap-5 md:grid-cols-3 md:gap-5 md:items-stretch max-w-5xl mx-auto">
        {TIERS.map(({ tier, featureKeys }) => (
          <TierCard key={tier} tier={tier} featureKeys={featureKeys} interval={interval} />
        ))}
      </div>

      <div className="mt-12 max-w-3xl mx-auto rounded-md border border-rule bg-cream p-5 md:p-6 text-center">
        <div className="text-2xs uppercase tracking-widest text-ink-soft mb-2">Doesn't fit?</div>
        <p className="text-sm text-ink-muted leading-relaxed mb-2">
          {t('pricing_v2.solo_pitch')}
        </p>
        <p className="text-sm text-ink-muted leading-relaxed">
          {t('pricing_v2.enterprise_pitch')}{' '}
          <a href="mailto:lenin@crestio.ai" className="text-forest hover:text-forest-ink underline underline-offset-2">
            lenin@crestio.ai
          </a>
          .
        </p>
      </div>

      {showCompareLink && (
        <div className="mt-12 max-w-4xl mx-auto">
          <button
            type="button"
            onClick={() => setComparing((v) => !v)}
            className="w-full flex items-center justify-center gap-2 text-sm text-ink-muted hover:text-ink py-3 border-t border-rule transition-colors"
            aria-expanded={comparing}
          >
            {comparing ? t('pricing_v2.hide_compare') : t('pricing_v2.show_compare')}
            <span aria-hidden className={`transition-transform duration-150 ${comparing ? 'rotate-180' : ''}`}>↓</span>
          </button>
          {comparing && <ComparisonTable />}
        </div>
      )}

      <p className="text-center text-2xs text-ink-soft mt-10">
        {t('pricing_v2.footer_note')}
      </p>
    </section>
  );
}

function TierCard({
  tier,
  featureKeys,
  interval,
}: {
  tier: TierKey;
  featureKeys: string[];
  interval: BillingInterval;
}) {
  const { t } = useTranslation('marketing');
  const { formatMoney } = useLocaleFormatters();
  const highlight = tier === 'team';
  const entry = PLAN_CATALOGUE[tier];

  const monthlyDollars = entry.prices.monthly.dollars;
  const annualDollars = entry.prices.annual.dollars;
  const monthlyEquivalent = Math.round(annualDollars / 12);

  const displayDollars = interval === 'monthly' ? monthlyDollars : monthlyEquivalent;
  const displayPrice = formatMoney(displayDollars * 100, 'AUD', { maximumFractionDigits: 0 });
  const billedNote = interval === 'annual'
    ? t('pricing_v2.billed_annually', { total: formatMoney(annualDollars * 100, 'AUD', { maximumFractionDigits: 0 }) })
    : t('pricing_v2.per_month_billed_monthly');

  return (
    <article
      className={[
        'flex flex-col relative rounded-md p-7 md:p-8',
        highlight
          ? 'border border-forest bg-surface pt-14 md:pt-14'
          : 'border border-rule bg-surface',
      ].join(' ')}
    >
      {highlight && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-forest text-cream px-3 py-1 rounded-full text-2xs uppercase tracking-widest font-medium whitespace-nowrap">
          {t('pricing_v2.recommended')}
        </div>
      )}

      <h3 className="font-display text-base tracking-tightest text-ink mb-1">
        {t(`tiers.${tier}.label`)}
      </h3>
      <p className="text-xs text-ink-muted mb-6 leading-relaxed">
        {t(`tiers.${tier}.subhead`)}
      </p>

      <div className="mb-6">
        <div className="flex items-baseline gap-1">
          <span className="font-display text-4xl md:text-5xl tracking-tightest text-ink tabular-nums">
            {displayPrice}
          </span>
          <span className="text-xs text-ink-muted">{t('pricing_v2.per_month')}</span>
        </div>
        <div className="text-2xs text-ink-soft mt-1">{billedNote}</div>
      </div>

      <div className="border-t border-rule pt-6 mb-7 flex-1">
        <ul className="space-y-2.5 text-sm text-ink-muted">
          {featureKeys.map((fk) => (
            <li key={fk} className="flex items-start gap-2">
              <span className="text-forest mt-[3px] flex-shrink-0" aria-hidden>
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <path d="M3 8.5L6.5 12L13 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              <span>{t(`tiers_v2.${tier}.${fk}`)}</span>
            </li>
          ))}
        </ul>
      </div>

      {entry.isContactSales ? (
        <a
          href="mailto:hello@crestio.ai?subject=Crestio%20Growth%20plan"
          className="btn-secondary text-sm w-full"
        >
          {t(`tiers.${tier}.cta`)}
        </a>
      ) : (
        <Link
          href={`/auth/signup?plan=${tier}&interval=${interval}`}
          className={[
            'w-full text-sm',
            highlight ? 'btn-primary' : 'btn-secondary',
          ].join(' ')}
        >
          {t(`tiers.${tier}.cta`)}
        </Link>
      )}

      {!entry.isContactSales && isPayablePlan(tier as 'solo' | 'team') && (() => {
        const url = paymentLinkUrl(tier as 'solo' | 'team', interval);
        if (!url) return null;
        return (
          <a
            href={url}
            className="block text-center text-2xs text-ink-muted hover:text-ink mt-3 underline underline-offset-2"
          >
            {t('pricing_v2.pay_now')}
          </a>
        );
      })()}
    </article>
  );
}

function ComparisonTable() {
  const { t } = useTranslation('marketing');
  const sections = [
    { key: 'sessions', items: ['unlimited_sessions', 'session_log', 'session_polish', 'voice_capture'] },
    { key: 'students', items: ['unlimited_students', 'parent_portal', 'pdf_summaries', 'homework_tracking'] },
    { key: 'ai', items: ['polish_credits', 'lesson_plans', 'assistant', 'priority_models'] },
    { key: 'billing', items: ['invoices', 'parent_payments', 'platform_fee', 'refunds'] },
    { key: 'team', items: ['tutors_count', 'roles', 'owner_brief', 'payouts_received'] },
    { key: 'support', items: ['email_support', 'priority_support', 'onboarding_call'] },
  ];

  return (
    <div className="mt-6 rounded-md border border-rule overflow-hidden bg-surface">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-cream border-b border-rule">
            <tr>
              <th className="text-left px-4 py-3 text-2xs uppercase tracking-widest text-ink-muted font-medium">
                {t('compare.feature')}
              </th>
              {(['solo', 'team', 'growth'] as TierKey[]).map((tier) => (
                <th key={tier} className="text-center px-4 py-3 text-2xs uppercase tracking-widest text-ink-muted font-medium">
                  {t(`tiers.${tier}.label`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sections.map((section) => (
              <>
                <tr key={`${section.key}-header`} className="bg-ruleSoft/50">
                  <td colSpan={4} className="px-4 py-2 text-2xs uppercase tracking-widest text-ink font-medium">
                    {t(`compare.section_${section.key}`)}
                  </td>
                </tr>
                {section.items.map((item) => (
                  <tr key={item} className="border-b border-ruleSoft last:border-b-0">
                    <td className="px-4 py-3 text-ink-muted">{t(`compare.row.${item}`)}</td>
                    {(['solo', 'team', 'growth'] as TierKey[]).map((tier) => (
                      <td key={tier} className="px-4 py-3 text-center text-ink">
                        <CompareValue value={t(`compare.values.${tier}.${item}`, { defaultValue: '' })} />
                      </td>
                    ))}
                  </tr>
                ))}
              </>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CompareValue({ value }: { value: string }) {
  if (!value || value === '-') return <span className="text-ink-soft">—</span>;
  if (value === '✓') return (
    <span className="inline-block text-forest" aria-label="Included">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M3 8.5L6.5 12L13 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
  return <span className="tabular-nums">{value}</span>;
}
