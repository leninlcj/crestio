import Link from 'next/link';
import Head from 'next/head';
import { useTranslation } from 'react-i18next';
import MarketingNav from './MarketingNav';
import Hero from './Hero';
import PainSection from './PainSection';
import HowItWorks from './HowItWorks';
import FeatureGrid from './FeatureGrid';
import PricingTable from './PricingTable';
import FAQ from './FAQ';
import FinalCTA from './FinalCTA';
import MarketingFooter from './MarketingFooter';

type Stat = { label: string; value: string };
type Testimonial = {
  quote: string;
  name: string;
  title: string;
  enabled?: boolean;
};

export type Limitations = {
  heading: string;
  intro?: string;
  bullets: string[];
  closing?: string;
};

export type LandingPageProps = {
  type: 'region' | 'vertical';
  slug: string;
  metaTitle: string;
  metaDescription: string;
  heroBadge: string;
  heroHeading: string;
  heroSub: string;
  microNote: string;
  painHeading: string;
  painLines: string[];
  painResolution: string;
  limitations?: Limitations;
  testimonials?: Testimonial[];
  faqQuestions?: { q: string; a: string }[];
  faqHeading?: string;
  region?: { country: string; currency: string };
  schemaOrg?: Record<string, unknown> | null;
};

export default function MarketLandingPage(props: LandingPageProps) {
  const { t } = useTranslation('marketing');

  return (
    <>
      <Head>
        <title>{props.metaTitle}</title>
        <meta name="description" content={props.metaDescription} />
        <meta property="og:title" content={props.metaTitle} />
        <meta property="og:description" content={props.metaDescription} />
        {props.schemaOrg && (
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(props.schemaOrg) }}
          />
        )}
      </Head>

      <div className="min-h-screen bg-cream text-ink">
        <MarketingNav />

        <Hero
          badgeText={props.heroBadge}
          headline={props.heroHeading}
          subheadline={props.heroSub}
          microNote={props.microNote}
          showScreenshot={false}
        />

        <section className="px-6 md:px-12 py-16 md:py-20 max-w-4xl mx-auto">
          <h2 className="font-display text-2xl md:text-3xl tracking-tighter text-ink mb-8 text-balance">
            {props.painHeading}
          </h2>
          <ul className="space-y-4">
            {props.painLines.map((line, i) => (
              <li key={i} className="pl-5 border-l-2 border-forest/30 text-base text-ink-muted leading-relaxed">
                {line}
              </li>
            ))}
            <li className="flex items-start gap-3 pt-3 border-t border-rule">
              <span aria-hidden className="text-forest mt-1">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M3 8.5L6.5 12L13 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              <span className="text-base text-ink leading-relaxed font-medium">
                {props.painResolution}
              </span>
            </li>
          </ul>
        </section>

        {props.limitations && props.limitations.bullets.length > 0 && (
          <section className="px-6 md:px-12 pb-16 md:pb-20 max-w-4xl mx-auto">
            <div className="rounded-md border border-rule bg-surface p-6 md:p-8">
              <h2 className="font-display text-xl md:text-2xl tracking-tightest text-ink mb-3">
                {props.limitations.heading}
              </h2>
              {props.limitations.intro && (
                <p className="text-sm text-ink-muted leading-relaxed mb-5 max-w-prose">
                  {props.limitations.intro}
                </p>
              )}
              <ul className="space-y-2.5">
                {props.limitations.bullets.map((b, i) => (
                  <li key={i} className="flex items-start gap-3 text-sm text-ink-muted leading-relaxed">
                    <span aria-hidden className="text-ink-soft mt-1 shrink-0">
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.5" />
                        <path d="M4 7h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                      </svg>
                    </span>
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
              {props.limitations.closing && (
                <p className="text-sm text-ink-muted leading-relaxed mt-5 pt-5 border-t border-rule max-w-prose">
                  {props.limitations.closing}
                </p>
              )}
            </div>
          </section>
        )}

        <FeatureGrid />

        {props.testimonials && props.testimonials.filter((tm) => tm.enabled !== false).length > 0 && (
          <section className="px-6 md:px-12 py-16 md:py-20 bg-cream">
            <div className="max-w-6xl mx-auto grid md:grid-cols-3 gap-5">
              {props.testimonials.filter((tm) => tm.enabled !== false).map((tm, i) => (
                <article key={i} className="rounded-md border border-rule bg-surface p-6">
                  <p className="text-sm text-ink leading-relaxed mb-5">&ldquo;{tm.quote}&rdquo;</p>
                  <div className="text-2xs text-ink-muted">{tm.name}</div>
                  <div className="text-2xs text-ink-soft">{tm.title}</div>
                </article>
              ))}
            </div>
          </section>
        )}

        <HowItWorks />

        <PricingTable showCompareLink={false} />

        {props.faqQuestions && props.faqQuestions.length > 0 && (
          <section className="px-6 md:px-12 py-20 md:py-24 max-w-3xl mx-auto">
            <h2 className="font-display text-2xl md:text-3xl tracking-tighter text-ink mb-10 text-balance text-center">
              {props.faqHeading ?? t('faq_v2.heading')}
            </h2>
            <div className="border-t border-rule">
              {props.faqQuestions.map((qa, i) => (
                <details key={i} className="border-b border-rule group">
                  <summary className="flex items-start justify-between gap-6 py-5 cursor-pointer">
                    <span className="font-display text-lg tracking-tightest text-ink">{qa.q}</span>
                    <span className="text-ink-soft group-open:rotate-45 transition-transform shrink-0 mt-0.5 text-2xl leading-none" aria-hidden>+</span>
                  </summary>
                  <p className="pb-6 text-sm text-ink-muted leading-relaxed">{qa.a}</p>
                </details>
              ))}
            </div>
          </section>
        )}

        <FinalCTA />

        <MarketingFooter />
      </div>
    </>
  );
}
