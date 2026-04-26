import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useTranslation } from 'react-i18next';
import FaqItem from '../components/marketing/FaqItem';
import { PLAN_CATALOGUE, type BillingInterval } from '../lib/plans';
import { useLocaleFormatters } from '../lib/useLocaleFormatters';
import { useLocale } from '../lib/localeContext';
import { paymentLinkUrl, isPayablePlan } from '../lib/stripe/payment-links';

// LocaleProvider initialises i18next inside a useEffect; calling useTranslation
// before that fires returns the keys verbatim. Gate the inner page on isReady
// so every translation call sees a live instance and we never paint raw keys.
export default function Home() {
  const { isReady } = useLocale();
  if (!isReady) return <div className="min-h-screen bg-cream" aria-hidden />;
  return <HomeInner />;
}

function HomeInner() {
  const router = useRouter();
  const { t } = useTranslation('marketing');
  const [showDeleted, setShowDeleted] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { formatMoney } = useLocaleFormatters();

  useEffect(() => {
    if (router.query.deleted === 'true') setShowDeleted(true);
  }, [router.query.deleted]);

  useEffect(() => {
    const handler = () => setMobileMenuOpen(false);
    router.events.on('routeChangeStart', handler);
    return () => router.events.off('routeChangeStart', handler);
  }, [router.events]);

  const metaTitle = t('meta.home_title');
  const metaDescription = t('meta.home_description');
  const soloPrice = formatMoney(PLAN_CATALOGUE.solo.prices.monthly.dollars * 100, 'AUD', { maximumFractionDigits: 0 });

  return (
    <>
      <Head>
        <title>{metaTitle}</title>
        <meta name="description" content={metaDescription} />
        <meta property="og:title" content={metaTitle} />
        <meta property="og:description" content={metaDescription} />
        <meta property="og:url" content="https://crestio.ai" />
        <meta name="twitter:title" content={metaTitle} />
        <meta name="twitter:description" content={metaDescription} />
      </Head>

      <div className="min-h-screen bg-cream text-ink">
        {showDeleted && (
          <div className="bg-forest-soft border-b border-forest/20 px-6 md:px-12 py-3 text-sm text-forest-ink text-center">
            {t('deleted_banner')}
          </div>
        )}

        {/* Top nav */}
        <nav
          className="px-6 md:px-12 py-5 flex items-center justify-between"
          aria-label="Primary"
        >
          <Link href="/" className="font-display text-2xl tracking-tightest">
            crest<span className="italic text-forest">io</span>
          </Link>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-6">
            <a href="#pricing" className="text-sm text-ink-muted hover:text-ink">
              {t('nav.pricing')}
            </a>
            <Link href="/auth/signin" className="text-sm text-ink-muted hover:text-ink">
              {t('nav.sign_in')}
            </Link>
            <Link
              href="/auth/signup"
              className="btn-primary text-xs px-4 py-2 min-h-[auto]"
            >
              {t('nav.start_trial')}
            </Link>
          </div>

          {/* Mobile hamburger */}
          <button
            type="button"
            className="md:hidden p-2 -mr-2 text-ink"
            aria-label={mobileMenuOpen ? t('nav.close_menu') : t('nav.open_menu')}
            aria-expanded={mobileMenuOpen}
            onClick={() => setMobileMenuOpen((v) => !v)}
          >
            {mobileMenuOpen ? (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
                <path d="M6 6l12 12M6 18L18 6" />
              </svg>
            ) : (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
                <path d="M4 7h16M4 12h16M4 17h16" />
              </svg>
            )}
          </button>
        </nav>

        {/* Mobile menu drawer */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-rule bg-cream px-6 py-5 animate-fade-in">
            <div className="flex flex-col gap-4">
              <a
                href="#pricing"
                onClick={() => setMobileMenuOpen(false)}
                className="text-base text-ink py-1"
              >
                {t('nav.pricing')}
              </a>
              <Link
                href="/auth/signin"
                onClick={() => setMobileMenuOpen(false)}
                className="text-base text-ink py-1"
              >
                {t('nav.sign_in')}
              </Link>
              <Link
                href="/auth/signup"
                onClick={() => setMobileMenuOpen(false)}
                className="btn-primary w-full text-base py-3"
              >
                {t('nav.start_trial')}
              </Link>
            </div>
          </div>
        )}

        <main>
          {/* Hero */}
          <section className="px-6 md:px-12 pt-10 md:pt-16 pb-16 md:pb-24 max-w-4xl mx-auto text-center">
            <div className="text-2xs uppercase tracking-widest text-ink-muted mb-6">
              {t('hero.eyebrow')}
            </div>
            <h1 className="font-display tracking-tightest text-ink leading-[1.05] text-balance text-4xl sm:text-5xl md:text-6xl mb-6">
              {t('hero.heading')}
            </h1>
            <p className="text-base md:text-lg text-ink-muted max-w-2xl mx-auto leading-relaxed mb-8 text-balance">
              {t('hero.subheading')}
            </p>

            <div className="flex flex-col items-center gap-3">
              <Link
                href="/auth/signup"
                className="btn-primary text-base px-7 py-3 w-full sm:w-auto min-w-[200px]"
              >
                {t('hero.cta')}
              </Link>
              <div className="text-2xs text-ink-soft">
                {t('hero.price_note', { price: soloPrice })}
              </div>
              <a
                href="#pricing"
                className="text-sm text-ink-muted hover:text-ink underline underline-offset-4 mt-1"
              >
                {t('hero.see_plans')}
              </a>
            </div>
          </section>

          {/* Pain */}
          <section className="px-6 md:px-12 py-16 md:py-24 max-w-3xl mx-auto">
            <h2 className="font-display text-3xl md:text-4xl tracking-tightest text-ink mb-10 md:mb-14 text-balance">
              {t('pain.heading')}
            </h2>
            <div className="space-y-5 text-base md:text-lg text-ink-muted leading-relaxed">
              <p>{t('pain.line_1')}</p>
              <p>{t('pain.line_2')}</p>
              <p>{t('pain.line_3')}</p>
              <p>{t('pain.line_4')}</p>
            </div>
          </section>

          {/* How it works */}
          <section id="how" className="px-6 md:px-12 py-16 md:py-24 max-w-5xl mx-auto scroll-mt-8">
            <h2 className="font-display text-3xl md:text-5xl tracking-tightest text-ink mb-16 md:mb-24 text-balance">
              {t('how.heading')}
            </h2>

            <div className="space-y-20 md:space-y-28">
              {FEATURE_KEYS.map((key, idx) => (
                <article
                  key={key}
                  className={`grid md:grid-cols-2 gap-8 md:gap-12 items-center ${
                    idx % 2 === 1 ? 'md:[&>*:first-child]:order-2' : ''
                  }`}
                >
                  <div>
                    <div className="text-2xs uppercase tracking-widest text-ink-soft font-mono mb-4">
                      {String(idx + 1).padStart(2, '0')}
                    </div>
                    <h3 className="font-display text-2xl md:text-3xl tracking-tightest mb-4 text-balance">
                      {t(`features.${key}.title`)}
                    </h3>
                    <p className="text-base text-ink-muted leading-relaxed max-w-prose">
                      {t(`features.${key}.body`)}
                    </p>
                  </div>
                  <div className="rounded-lg border border-rule bg-surface shadow-card overflow-hidden">
                    <div className="aspect-[16/10] bg-ruleSoft flex items-center justify-center px-6">
                      <div className="text-center">
                        <div className="font-display text-xl md:text-2xl tracking-tightest text-ink mb-2 text-balance">
                          {t(`features.${key}.title`)}
                        </div>
                        <div className="text-2xs uppercase tracking-widest text-ink-soft">
                          Screenshot coming soon
                        </div>
                      </div>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>

          {/* Pricing */}
          <MarketingPricing />

          {/* FAQ */}
          <section className="px-6 md:px-12 py-20 md:py-28 max-w-3xl mx-auto">
            <h2 className="font-display text-3xl md:text-5xl tracking-tightest text-ink mb-12 md:mb-14 text-balance">
              {t('faq.heading')}
            </h2>
            <div className="border-t border-rule">
              <FaqItem question={t('faq.q1')}>
                {t('faq.a1_part1')}
                <Link href="/privacy" className="underline">{t('faq.a1_privacy_link')}</Link>
                {t('faq.a1_part2')}
              </FaqItem>
              <FaqItem question={t('faq.q2')}>{t('faq.a2')}</FaqItem>
              <FaqItem question={t('faq.q3')}>{t('faq.a3')}</FaqItem>
              <FaqItem question={t('faq.q4')}>{t('faq.a4')}</FaqItem>
              <FaqItem question={t('faq.q5')}>{t('faq.a5')}</FaqItem>
              <FaqItem question={t('faq.q6')}>{t('faq.a6')}</FaqItem>
            </div>
          </section>

          {/* Final CTA */}
          <section className="px-6 md:px-12 py-20 md:py-28 max-w-2xl mx-auto text-center">
            <p className="font-display text-3xl md:text-4xl tracking-tightest text-ink mb-8 text-balance leading-tight">
              {t('final_cta.headline')}
            </p>
            <Link
              href="/auth/signup"
              className="btn-primary text-base px-6 py-3 inline-block"
            >
              {t('final_cta.button')}
            </Link>
            <div className="text-sm text-ink-muted mt-6">
              {t('final_cta.questions_part1')}
              <a
                href="mailto:support@crestio.ai"
                className="underline underline-offset-2 hover:text-ink"
              >
                support@crestio.ai
              </a>
              {t('final_cta.questions_part2')}
            </div>
          </section>
        </main>

        <StickyMobileCTA />

        <footer className="px-6 md:px-12 py-12 border-t border-rule text-sm text-ink-muted">
          <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-8">
            <div>
              <div className="font-display text-2xl tracking-tightest text-ink mb-2">
                crest<span className="italic text-forest">io</span>
              </div>
              <div className="text-2xs text-ink-soft">{t('footer.made_in')}</div>
            </div>
            <div className="flex flex-col gap-2">
              <Link href="/auth/signin" className="hover:text-ink">{t('footer.sign_in')}</Link>
              <Link href="/privacy" className="hover:text-ink">{t('footer.privacy')}</Link>
              <Link href="/terms" className="hover:text-ink">{t('footer.terms')}</Link>
              <a href="mailto:support@crestio.ai" className="hover:text-ink">{t('footer.support')}</a>
            </div>
            <div className="md:text-right">
              <a href="mailto:support@crestio.ai" className="hover:text-ink">
                support@crestio.ai
              </a>
            </div>
          </div>
        </footer>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Pricing section
// ---------------------------------------------------------------------------

type TierKey = 'solo' | 'team' | 'growth';

type MarketingTier = {
  tier: TierKey;
  monthlyDollars: number;
  annualDollars: number;
  featureKeys: string[];
  isContactSales?: boolean;
};

const TIER_BASE: MarketingTier[] = [
  {
    tier: 'solo',
    monthlyDollars: PLAN_CATALOGUE.solo.prices.monthly.dollars,
    annualDollars: PLAN_CATALOGUE.solo.prices.annual.dollars,
    featureKeys: ['unlimited', 'polish', 'parent_portal', 'trial'],
  },
  {
    tier: 'team',
    monthlyDollars: PLAN_CATALOGUE.team.prices.monthly.dollars,
    annualDollars: PLAN_CATALOGUE.team.prices.annual.dollars,
    featureKeys: ['inherits', 'up_to_5', 'payouts', 'trial'],
  },
  {
    tier: 'growth',
    monthlyDollars: PLAN_CATALOGUE.growth.prices.monthly.dollars,
    annualDollars: PLAN_CATALOGUE.growth.prices.annual.dollars,
    featureKeys: ['inherits', 'up_to_15', 'priority', 'onboarding'],
    isContactSales: true,
  },
];

function MarketingPricing() {
  const { t } = useTranslation('marketing');
  const [interval, setInterval] = useState<BillingInterval>('monthly');

  const mobileOrder = useMemo<MarketingTier[]>(() => [TIER_BASE[1], TIER_BASE[0], TIER_BASE[2]], []);

  return (
    <section
      id="pricing"
      className="px-6 md:px-12 py-20 md:py-28 max-w-5xl mx-auto scroll-mt-8"
    >
      <div className="text-center mb-8">
        <h2 className="font-display text-3xl md:text-5xl tracking-tightest text-ink mb-3 text-balance">
          {t('pricing.heading')}
        </h2>
        <p className="text-ink-muted text-base">
          {t('pricing.subheading')}
        </p>
      </div>

      {/* Monthly/Annual toggle */}
      <div className="flex justify-center mb-12 md:mb-16">
        <div className="inline-flex items-center border border-rule rounded bg-surface p-1 gap-1">
          <button
            type="button"
            onClick={() => setInterval('monthly')}
            className={[
              'px-4 py-2 text-sm rounded transition-colors',
              interval === 'monthly'
                ? 'bg-forest text-cream'
                : 'text-ink-muted hover:text-ink',
            ].join(' ')}
          >
            {t('pricing.monthly')}
          </button>
          <button
            type="button"
            onClick={() => setInterval('annual')}
            className={[
              'px-4 py-2 text-sm rounded transition-colors',
              interval === 'annual'
                ? 'bg-forest text-cream'
                : 'text-ink-muted hover:text-ink',
            ].join(' ')}
          >
            {t('pricing.annual')}
            <span className="text-2xs ml-1 opacity-80">{t('pricing.annual_save_note')}</span>
          </button>
        </div>
      </div>

      {/* Mobile (Team-first) */}
      <div className="md:hidden grid gap-5">
        {mobileOrder.map((tier) => (
          <TierCard key={tier.tier} tier={tier} interval={interval} mobile />
        ))}
      </div>

      {/* Desktop (Solo · Team · Growth, with Team elevated) */}
      <div className="hidden md:grid md:grid-cols-3 md:gap-6 md:items-start">
        {TIER_BASE.map((tier) => (
          <TierCard key={tier.tier} tier={tier} interval={interval} />
        ))}
      </div>

      <p className="text-center text-2xs text-ink-soft mt-10 md:mt-12">
        {t('pricing.footer_note')}
      </p>
    </section>
  );
}

function TierCard({
  tier,
  interval,
  mobile = false,
}: {
  tier: MarketingTier;
  interval: BillingInterval;
  mobile?: boolean;
}) {
  const { t } = useTranslation('marketing');
  const { formatMoney } = useLocaleFormatters();
  const highlight = tier.tier === 'team';
  const dollars =
    interval === 'monthly' ? tier.monthlyDollars : tier.annualDollars;
  const displayPrice = formatMoney(dollars * 100, 'AUD', { maximumFractionDigits: 0 });
  const monthlyEquivalent = formatMoney(Math.round(tier.annualDollars / 12) * 100, 'AUD', { maximumFractionDigits: 0 });
  const periodLine =
    interval === 'monthly'
      ? t('pricing.period_monthly')
      : t('pricing.period_annual', { monthly_equivalent: monthlyEquivalent });

  const baseCard = [
    'flex flex-col relative overflow-hidden',
    'rounded-md',
    highlight
      ? 'border-2 border-forest bg-forest/[0.06]'
      : 'border border-rule bg-surface',
    !mobile && highlight ? 'md:-translate-y-4' : '',
    !mobile && highlight ? 'md:shadow-lift' : '',
  ].filter(Boolean).join(' ');

  const priceSize = highlight
    ? 'font-display text-5xl md:text-6xl tracking-tightest'
    : 'font-display text-4xl md:text-[2.75rem] tracking-tightest';

  return (
    <article className={baseCard}>
      {highlight && (
        <div className="bg-forest text-cream text-center py-2 px-4 font-display uppercase tracking-widest text-2xs">
          {t('pricing.recommended_banner')}
        </div>
      )}

      <div className="p-7 flex flex-col flex-1">
        <h3
          className={[
            'font-display text-2xl tracking-tightest mb-1',
            highlight ? 'text-forest-ink' : 'text-ink',
          ].join(' ')}
        >
          {t('pricing.tier_name', { tier: t(`tiers.${tier.tier}.label`) })}
        </h3>
        <p className="text-sm text-ink-muted mb-6">{t(`tiers.${tier.tier}.subhead`)}</p>

        <div className="mb-6">
          <div className={['text-ink', priceSize].join(' ')}>{displayPrice}</div>
          <div className="text-xs text-ink-muted mt-1">{periodLine}</div>
        </div>

        <ul className="space-y-2.5 mb-7 text-sm text-ink-muted flex-1">
          {tier.featureKeys.map((fk) => (
            <li key={fk} className="flex items-start gap-2">
              <span aria-hidden="true" className="text-forest mt-[3px]">✓</span>
              <span>{t(`tiers.${tier.tier}.features.${fk}`)}</span>
            </li>
          ))}
        </ul>

        {tier.isContactSales ? (
          <a
            href="mailto:support@crestio.ai?subject=Crestio%20Growth%20plan"
            className="text-sm text-forest hover:text-forest-ink underline underline-offset-4 py-3 w-full text-center min-h-[44px] flex items-center justify-center"
          >
            {t(`tiers.${tier.tier}.cta`)} →
          </a>
        ) : (
          <>
            <Link
              href={`/auth/signup?plan=${tier.tier}&interval=${interval}`}
              className={[
                'w-full block text-center min-h-[44px] flex items-center justify-center',
                highlight ? 'btn-primary text-base' : 'btn-secondary text-sm',
              ].join(' ')}
            >
              {t(`tiers.${tier.tier}.cta`)}
            </Link>
            {isPayablePlan(tier.tier) && (() => {
              const url = paymentLinkUrl(tier.tier, interval);
              if (!url) return null;
              return (
                <a
                  href={url}
                  className="block text-center text-xs text-ink-soft hover:text-ink mt-3 underline underline-offset-4 decoration-ink-soft/30 hover:decoration-ink"
                >
                  {t('pricing.pay_now_secondary')}
                </a>
              );
            })()}
          </>
        )}
      </div>
    </article>
  );
}

// ---------------------------------------------------------------------------
// Mobile sticky CTA — pinned to viewport bottom on small screens. Shows after
// the user scrolls past the hero and hides once they reach #pricing (so it
// doesn't fight the in-section CTAs).
// ---------------------------------------------------------------------------

function StickyMobileCTA() {
  const { t } = useTranslation('marketing');
  const [visible, setVisible] = useState(false);
  const teamPaymentUrl = paymentLinkUrl('team', 'monthly');

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      const pricingEl = document.getElementById('pricing');
      const pricingTop = pricingEl ? pricingEl.getBoundingClientRect().top + window.scrollY : Infinity;
      const showAfter = window.innerHeight * 0.8;
      setVisible(y > showAfter && y + window.innerHeight < pricingTop + 200);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  if (!visible) return null;

  return (
    <div className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-cream/95 backdrop-blur border-t border-rule px-4 py-3 flex items-center gap-2">
      <Link
        href="/auth/signup?plan=team&interval=monthly"
        className="btn-primary flex-1 text-sm py-2 min-h-[40px]"
      >
        {t('pricing.sticky_mobile_cta')}
      </Link>
      {teamPaymentUrl && (
        <a
          href={teamPaymentUrl}
          className="text-sm text-ink-muted underline underline-offset-4 px-3 py-2"
        >
          {t('pricing.sticky_mobile_pay_now')}
        </a>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Feature copy for the "How it works" section
// ---------------------------------------------------------------------------

const FEATURE_KEYS = ['session_log', 'polish', 'invoices', 'parent_portal'] as const;
