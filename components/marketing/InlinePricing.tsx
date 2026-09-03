import Link from 'next/link';
import { useTranslation } from 'react-i18next';

// Compact 3-tier pricing for the homepage. Full pricing details (annual
// toggle + comparison table + tier-edge annotations) live on /pricing.

type TierKey = 'solo' | 'team' | 'growth';

const TIERS: { key: TierKey; href: string; highlight: boolean }[] = [
  { key: 'solo',   href: '/auth/signup?plan=solo',   highlight: false },
  { key: 'team',   href: '/auth/signup?plan=team',   highlight: true },
  { key: 'growth', href: '/contact',                  highlight: false },
];

export default function InlinePricing() {
  const { t } = useTranslation('marketing');

  return (
    <section id="pricing" className="px-6 md:px-12 py-20 md:py-24 max-w-6xl mx-auto scroll-mt-20">
      <div className="text-center mb-10 md:mb-12 max-w-prose mx-auto">
        <div className="text-2xs uppercase tracking-widest text-ink-soft mb-3">
          {t('inline_pricing.eyebrow')}
        </div>
        <h2 className="font-display text-3xl md:text-4xl tracking-tighter text-ink mb-3 text-balance">
          {t('inline_pricing.heading')}
        </h2>
        <p className="text-base text-ink-muted leading-relaxed">
          {t('inline_pricing.subheading')}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3 md:gap-5 md:items-stretch max-w-5xl mx-auto">
        {TIERS.map(({ key, href, highlight }) => (
          <TierCard key={key} tier={key} href={href} highlight={highlight} />
        ))}
      </div>

      <div className="mt-8 text-center">
        <Link href="/pricing" className="text-sm text-forest hover:underline">
          {t('inline_pricing.compare_link')}
        </Link>
      </div>
    </section>
  );
}

function TierCard({ tier, href, highlight }: { tier: TierKey; href: string; highlight: boolean }) {
  const { t } = useTranslation('marketing');

  return (
    <article
      className={[
        'relative flex flex-col rounded-md p-6 md:p-7',
        highlight
          ? 'border border-forest bg-surface pt-12 md:pt-12'
          : 'border border-rule bg-surface',
      ].join(' ')}
    >
      {highlight && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-forest text-cream px-3 py-1 rounded-full text-2xs uppercase tracking-widest font-medium whitespace-nowrap">
          {t('inline_pricing.recommended')}
        </div>
      )}

      <div className="flex items-baseline gap-1 mb-1">
        <span className="font-display text-3xl md:text-4xl tracking-tightest text-ink tabular-nums">
          {t(`inline_pricing.${tier}.price`)}
        </span>
        <span className="text-xs text-ink-muted">{t('inline_pricing.per_month')}</span>
      </div>
      <h3 className="font-display text-base tracking-tightest text-ink mb-1.5">
        {t(`inline_pricing.${tier}.label`)}
      </h3>
      <p className="text-xs text-ink-muted mb-5 leading-relaxed">
        {t(`inline_pricing.${tier}.subhead`)}
      </p>

      <ul className="space-y-2 text-sm text-ink-muted mb-6 flex-1 border-t border-rule pt-5">
        {(['b1', 'b2', 'b3', 'b4'] as const).map((b) => (
          <li key={b} className="flex items-start gap-2">
            <span className="text-forest mt-[3px] flex-shrink-0" aria-hidden>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path d="M3 8.5L6.5 12L13 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <span>{t(`inline_pricing.${tier}.${b}`)}</span>
          </li>
        ))}
      </ul>

      <Link
        href={href}
        className={[
          'w-full',
          highlight ? 'btn-primary' : 'btn-secondary',
        ].join(' ')}
      >
        {t(`inline_pricing.${tier}.cta`)}
      </Link>
    </article>
  );
}
