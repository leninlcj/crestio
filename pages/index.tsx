import { useEffect, useState } from 'react';
import Link from 'next/link';
import Head from 'next/head';
import { useRouter } from 'next/router';
import Screenshot from '../components/marketing/Screenshot';
import FaqItem from '../components/marketing/FaqItem';
import { PLAN_CATALOGUE, type BillingInterval } from '../lib/plans';

const META_TITLE = 'Crestio — software for Australian tutors';
const META_DESCRIPTION =
  'Manage students, log sessions, polish notes with AI, and share progress with parents — from one dashboard. From $24/month. 7-day free trial.';

export default function Home() {
  const router = useRouter();
  const [showDeleted, setShowDeleted] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (router.query.deleted === 'true') setShowDeleted(true);
  }, [router.query.deleted]);

  // Close the mobile menu on route change.
  useEffect(() => {
    const handler = () => setMobileMenuOpen(false);
    router.events.on('routeChangeStart', handler);
    return () => router.events.off('routeChangeStart', handler);
  }, [router.events]);

  return (
    <>
      <Head>
        <title>{META_TITLE}</title>
        <meta name="description" content={META_DESCRIPTION} />
        <meta property="og:title" content={META_TITLE} />
        <meta property="og:description" content={META_DESCRIPTION} />
        <meta property="og:url" content="https://crestio.ai" />
        <meta name="twitter:title" content={META_TITLE} />
        <meta name="twitter:description" content={META_DESCRIPTION} />
      </Head>

      <div className="min-h-screen bg-cream text-ink">
        {showDeleted && (
          <div className="bg-forest-soft border-b border-forest/20 px-6 md:px-12 py-3 text-sm text-forest-ink text-center">
            Your account has been deleted. Sorry to see you go.
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
              Pricing
            </a>
            <Link href="/auth/signin" className="text-sm text-ink-muted hover:text-ink">
              Sign in
            </Link>
            <Link
              href="/auth/signup"
              className="btn-primary text-xs px-4 py-2 min-h-[auto]"
            >
              Start free trial
            </Link>
          </div>

          {/* Mobile hamburger */}
          <button
            type="button"
            className="md:hidden p-2 -mr-2 text-ink"
            aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
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
                Pricing
              </a>
              <Link
                href="/auth/signin"
                onClick={() => setMobileMenuOpen(false)}
                className="text-base text-ink py-1"
              >
                Sign in
              </Link>
              <Link
                href="/auth/signup"
                onClick={() => setMobileMenuOpen(false)}
                className="btn-primary w-full text-base py-3"
              >
                Start free trial
              </Link>
            </div>
          </div>
        )}

        <main>
          {/* Hero */}
          <section className="px-6 md:px-12 pt-10 md:pt-16 pb-16 md:pb-24 max-w-4xl mx-auto text-center">
            <div className="text-2xs uppercase tracking-widest text-ink-muted mb-6">
              For independent tutors and small teams
            </div>
            <h1 className="font-display tracking-tightest text-ink leading-[1.05] text-balance text-4xl sm:text-5xl md:text-6xl mb-6">
              The all-in-one tool for tutors who take their work seriously.
            </h1>
            <p className="text-base md:text-lg text-ink-muted max-w-2xl mx-auto leading-relaxed mb-8 text-balance">
              Manage students, log sessions, polish notes with AI, and share progress with parents — from one dashboard. For independent tutors and small teams.
            </p>

            <div className="flex flex-col items-center gap-3">
              <Link
                href="/auth/signup"
                className="btn-primary text-base px-7 py-3 w-full sm:w-auto min-w-[200px]"
              >
                Start free trial
              </Link>
              <div className="text-2xs text-ink-soft">
                From $24/month. 7-day free trial. Cancel anytime.
              </div>
              <a
                href="#pricing"
                className="text-sm text-ink-muted hover:text-ink underline underline-offset-4 mt-1"
              >
                See all plans →
              </a>
            </div>
          </section>

          {/* Pain */}
          <section className="px-6 md:px-12 py-16 md:py-24 max-w-3xl mx-auto">
            <h2 className="font-display text-3xl md:text-4xl tracking-tightest text-ink mb-10 md:mb-14 text-balance">
              Running a tutoring practice shouldn't feel like this.
            </h2>
            <div className="space-y-5 text-base md:text-lg text-ink-muted leading-relaxed">
              <p>You taught six sessions this week and haven't invoiced for two of them.</p>
              <p>You wrote notes on paper, typed them into a Google Doc, and will eventually summarise them for the parent.</p>
              <p>Three parents texted you tonight asking the same question.</p>
              <p>You're spending two hours on admin for every five hours of actual tutoring.</p>
            </div>
          </section>

          {/* How it works */}
          <section id="how" className="px-6 md:px-12 py-16 md:py-24 max-w-5xl mx-auto scroll-mt-8">
            <h2 className="font-display text-3xl md:text-5xl tracking-tightest text-ink mb-16 md:mb-24 text-balance">
              How Crestio works
            </h2>

            <div className="space-y-20 md:space-y-28">
              {FEATURES.map((f, idx) => (
                <article
                  key={f.title}
                  className={`grid md:grid-cols-2 gap-8 md:gap-12 items-center ${
                    idx % 2 === 1 ? 'md:[&>*:first-child]:order-2' : ''
                  }`}
                >
                  <div>
                    <div className="text-2xs uppercase tracking-widest text-ink-soft font-mono mb-4">
                      {String(idx + 1).padStart(2, '0')}
                    </div>
                    <h3 className="font-display text-2xl md:text-3xl tracking-tightest mb-4 text-balance">
                      {f.title}
                    </h3>
                    <p className="text-base text-ink-muted leading-relaxed max-w-prose">
                      {f.body}
                    </p>
                  </div>
                  <Screenshot src={f.screenshot} alt={f.alt} caption={f.caption} />
                </article>
              ))}
            </div>
          </section>

          {/* Pricing */}
          <MarketingPricing />

          {/* FAQ */}
          <section className="px-6 md:px-12 py-20 md:py-28 max-w-3xl mx-auto">
            <h2 className="font-display text-3xl md:text-5xl tracking-tightest text-ink mb-12 md:mb-14 text-balance">
              Things tutors have asked
            </h2>
            <div className="border-t border-rule">
              <FaqItem question="Is my students' data safe?">
                Yes. Data is stored on Supabase infrastructure and payments go through Stripe, so Crestio never sees your card details. Every organisation's data is isolated — no tutor can see another practice's students. Full details in the{' '}
                <Link href="/privacy" className="underline">privacy policy</Link>.
              </FaqItem>
              <FaqItem question="What does the AI actually do, and does it train on my data?">
                The AI polishes your rough session notes into something parents can read clearly. It only sees what you send it in that specific request, doesn't store anything between sessions, and doesn't train on your data. You always keep your original notes — AI polish is optional per session. The provider is certified to SOC 2 Type II.
              </FaqItem>
              <FaqItem question="What happens after the free trial?">
                Your card gets charged for the plan you chose. Cancel before the trial ends and nothing happens. Cancel after billing starts and you keep access until the end of the period you paid for, then it stops.
              </FaqItem>
              <FaqItem question="Can parents see everything?">
                Only what you share. Session notes split into internal (yours) and parent-facing (shared). Parents only see sessions you've released to them, and only for their own child.
              </FaqItem>
              <FaqItem question="Is this for tutoring companies or individual tutors?">
                Both. Solo is for independent tutors. Team fits small tutoring practices up to 5 tutors. Growth supports up to 15. If you're running a larger operation, email support@crestio.ai and we'll point you in the right direction.
              </FaqItem>
              <FaqItem question="Who runs Crestio?">
                The Crestio team. We're a small team based in Australia, building software for tutors who value their time. Questions or feedback? Email support@crestio.ai and a person reads every message.
              </FaqItem>
            </div>
          </section>

          {/* Final CTA */}
          <section className="px-6 md:px-12 py-20 md:py-28 max-w-2xl mx-auto text-center">
            <p className="font-display text-3xl md:text-4xl tracking-tightest text-ink mb-8 text-balance leading-tight">
              Try Crestio for a week. See if it's for you.
            </p>
            <Link
              href="/auth/signup"
              className="btn-primary text-base px-6 py-3 inline-block"
            >
              Start free trial
            </Link>
            <div className="text-sm text-ink-muted mt-6">
              Questions first? Email{' '}
              <a
                href="mailto:support@crestio.ai"
                className="underline underline-offset-2 hover:text-ink"
              >
                support@crestio.ai
              </a>
              .
            </div>
          </section>
        </main>

        <footer className="px-6 md:px-12 py-12 border-t border-rule text-sm text-ink-muted">
          <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-8">
            <div>
              <div className="font-display text-2xl tracking-tightest text-ink mb-2">
                crest<span className="italic text-forest">io</span>
              </div>
              <div className="text-2xs text-ink-soft">Made in Australia · 2026</div>
            </div>
            <div className="flex flex-col gap-2">
              <Link href="/auth/signin" className="hover:text-ink">Sign in</Link>
              <Link href="/privacy" className="hover:text-ink">Privacy</Link>
              <Link href="/terms" className="hover:text-ink">Terms</Link>
              <a href="mailto:support@crestio.ai" className="hover:text-ink">Support</a>
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

type MarketingTier = {
  tier: 'solo' | 'team' | 'growth';
  label: string;
  subhead: string;
  monthlyDollars: number;
  annualDollars: number;
  trialDays: number;
  features: string[];
  ctaLabel: string;
  isContactSales?: boolean;
};

const TIER_COPY: MarketingTier[] = [
  {
    tier: 'solo',
    label: 'Solo',
    subhead: 'For one tutor, one student list.',
    monthlyDollars: PLAN_CATALOGUE.solo.prices.monthly.dollars,
    annualDollars: PLAN_CATALOGUE.solo.prices.annual.dollars,
    trialDays: PLAN_CATALOGUE.solo.trialDays,
    features: [
      'Unlimited students and sessions',
      'AI-polished notes for parents',
      'Parent portal and invoicing',
      '7-day free trial',
    ],
    ctaLabel: 'Start 7-day free trial',
  },
  {
    tier: 'team',
    label: 'Team',
    subhead: 'For owners with a small team of tutors.',
    monthlyDollars: PLAN_CATALOGUE.team.prices.monthly.dollars,
    annualDollars: PLAN_CATALOGUE.team.prices.annual.dollars,
    trialDays: PLAN_CATALOGUE.team.trialDays,
    features: [
      'Everything in Solo, plus:',
      'Up to 5 tutors with role-based access',
      'Per-tutor payouts and reporting',
      '14-day free trial',
    ],
    ctaLabel: 'Start 14-day free trial',
  },
  {
    tier: 'growth',
    label: 'Growth',
    subhead: 'For tutoring businesses scaling up.',
    monthlyDollars: PLAN_CATALOGUE.growth.prices.monthly.dollars,
    annualDollars: PLAN_CATALOGUE.growth.prices.annual.dollars,
    trialDays: PLAN_CATALOGUE.growth.trialDays,
    features: [
      'Everything in Team, plus:',
      'Up to 15 tutors',
      'Priority support',
      'Custom onboarding',
    ],
    ctaLabel: 'Contact us',
    isContactSales: true,
  },
];

function MarketingPricing() {
  const [interval, setInterval] = useState<BillingInterval>('monthly');

  // Mobile (single column): render Team first so it's top-of-fold.
  // Desktop (3-col grid): always render Solo · Team · Growth.
  // Strategy: render one list in visual order Solo-Team-Growth, use a single
  // grid and give the Team card `md:col-start-2` so on mobile flex-flow
  // ordering can move it to position 1.
  // Simpler approach: render two lists — one mobile-only (Team first), one
  // desktop-only (natural order). Tradeoff: one extra DOM tree on each.
  // Chose the two-list approach below for clarity.

  const mobileOrder: MarketingTier[] = [
    TIER_COPY[1], // team
    TIER_COPY[0], // solo
    TIER_COPY[2], // growth
  ];

  return (
    <section
      id="pricing"
      className="px-6 md:px-12 py-20 md:py-28 max-w-5xl mx-auto scroll-mt-8"
    >
      <div className="text-center mb-8">
        <h2 className="font-display text-3xl md:text-5xl tracking-tightest text-ink mb-3 text-balance">
          One tool. Three plans. Pick what fits.
        </h2>
        <p className="text-ink-muted text-base">
          Most Australian tutors start on Solo. Growing a team? Go Team.
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
            Monthly
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
            Annual
            <span className="text-2xs ml-1 opacity-80">(save 2 months)</span>
          </button>
        </div>
      </div>

      {/* Mobile (Team-first) */}
      <div className="md:hidden grid gap-5">
        {mobileOrder.map((t) => (
          <TierCard key={t.tier} tier={t} interval={interval} mobile />
        ))}
      </div>

      {/* Desktop (Solo · Team · Growth, with Team elevated) */}
      <div className="hidden md:grid md:grid-cols-3 md:gap-6 md:items-start">
        {TIER_COPY.map((t) => (
          <TierCard key={t.tier} tier={t} interval={interval} />
        ))}
      </div>

      <p className="text-center text-2xs text-ink-soft mt-10 md:mt-12">
        Prices in AUD. Inclusive of GST where applicable. Cancel anytime.
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
  const highlight = tier.tier === 'team';
  const dollars =
    interval === 'monthly' ? tier.monthlyDollars : tier.annualDollars;
  const periodLine =
    interval === 'monthly'
      ? 'AUD per month'
      : `per year — about $${Math.round(tier.annualDollars / 12)}/month billed annually`;

  // Visual hierarchy:
  // - Team: 2px forest border, subtle green tint, elevated -16px on desktop,
  //   larger price, full-width "RECOMMENDED" band at the very top.
  // - Solo / Growth: 1px rule border, standard cream surface.
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
          Recommended for most tutors
        </div>
      )}

      <div className="p-7 flex flex-col flex-1">
        <h3
          className={[
            'font-display text-2xl tracking-tightest mb-1',
            highlight ? 'text-forest-ink' : 'text-ink',
          ].join(' ')}
        >
          Crestio {tier.label}
        </h3>
        <p className="text-sm text-ink-muted mb-6">{tier.subhead}</p>

        <div className="mb-6">
          <div className={['text-ink', priceSize].join(' ')}>${dollars}</div>
          <div className="text-xs text-ink-muted mt-1">{periodLine}</div>
        </div>

        <ul className="space-y-2.5 mb-7 text-sm text-ink-muted flex-1">
          {tier.features.map((f) => (
            <li key={f} className="flex items-start gap-2">
              <span aria-hidden="true" className="text-forest mt-[3px]">✓</span>
              <span>{f}</span>
            </li>
          ))}
        </ul>

        {tier.isContactSales ? (
          <a
            href="mailto:support@crestio.ai?subject=Crestio%20Growth%20plan"
            className="text-sm text-forest hover:text-forest-ink underline underline-offset-4 py-3 w-full text-center min-h-[44px] flex items-center justify-center"
          >
            {tier.ctaLabel} →
          </a>
        ) : (
          <Link
            href={`/auth/signup?plan=${tier.tier}&interval=${interval}`}
            className={[
              'w-full block text-center min-h-[44px] flex items-center justify-center',
              highlight ? 'btn-primary text-base' : 'btn-secondary text-sm',
            ].join(' ')}
          >
            {tier.ctaLabel}
          </Link>
        )}
      </div>
    </article>
  );
}

// ---------------------------------------------------------------------------
// Feature copy for the "How it works" section
// ---------------------------------------------------------------------------

type Feature = {
  title: string;
  body: string;
  screenshot: string;
  alt: string;
  caption: string;
};

const FEATURES: Feature[] = [
  {
    title: 'Log sessions in seconds',
    body:
      "Pick a student, pick the time, jot the notes. The same form covers today's session and one you forgot to log last Tuesday. No calendar-app detour.",
    screenshot: '/marketing/screenshot-session-log.png',
    alt: 'Crestio session logging form with student, subject, topic, homework, and notes fields.',
    caption: 'The session log form.',
  },
  {
    title: 'Polish notes with AI',
    body:
      'Write the rough version fast. One click rewrites it into something a parent can actually read — short, warm, specific. Your notes stay yours; the polished version is separate.',
    screenshot: '/marketing/screenshot-polish.png',
    alt: 'Side-by-side view of rough session notes and AI-polished parent-facing notes.',
    caption: 'Rough notes on the left, polished on the right.',
  },
  {
    title: 'Invoice without the chase',
    body:
      'Completed sessions turn into line items. Generate an invoice, mark it paid when the bank transfer lands. No separate spreadsheet of who owes what.',
    screenshot: '/marketing/screenshot-invoices.png',
    alt: 'Crestio invoice list showing paid and unpaid invoices with amounts and due dates.',
    caption: 'The invoice list, paid vs unpaid.',
  },
  {
    title: 'Give parents their own portal',
    body:
      "Invite a parent and they get a simple view of their child's sessions, homework, and polished notes. They stop texting you at 9pm because they already know how things are going.",
    screenshot: '/marketing/screenshot-parent-portal.png',
    alt: "Parent portal showing a child's recent sessions with homework and tutor notes.",
    caption: 'The parent portal.',
  },
];
