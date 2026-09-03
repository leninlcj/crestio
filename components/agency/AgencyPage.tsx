import Head from 'next/head';
import type { ReactNode } from 'react';
import MarketingNav from '../marketing/MarketingNav';
import MarketingFooter from '../marketing/MarketingFooter';
import { AGENCY } from '../../lib/agency';

type Props = {
  title: string;              // browser tab + og:title; " · Crestio Tutoring" appended unless noSuffix
  description: string;
  path: string;               // "/pricing"
  ogTitle?: string;           // short headline drawn into the OG image
  ogSubtitle?: string;
  jsonLd?: Array<Record<string, unknown>>;
  noSuffix?: boolean;
  noIndex?: boolean;
  children: ReactNode;
};

export function AgencyPage({ title, description, path, ogTitle, ogSubtitle, jsonLd = [], noSuffix, noIndex, children }: Props) {
  const fullTitle = noSuffix ? title : `${title} · ${AGENCY.name}`;
  const url = `${AGENCY.siteUrl}${path === '/' ? '' : path}`;
  const og = `/api/og?type=marketing&title=${encodeURIComponent(ogTitle ?? title)}&subtitle=${encodeURIComponent(ogSubtitle ?? description)}`;
  return (
    <>
      <Head>
        <title>{fullTitle}</title>
        <meta name="description" content={description} />
        <link rel="canonical" href={url} />
        {noIndex && <meta name="robots" content="noindex, nofollow" />}
        <meta property="og:title" content={fullTitle} />
        <meta property="og:description" content={description} />
        <meta property="og:url" content={url} />
        <meta property="og:image" content={og} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={fullTitle} />
        <meta name="twitter:description" content={description} />
        <meta name="twitter:image" content={og} />
        {jsonLd.map((obj, i) => (
          <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(obj) }} />
        ))}
      </Head>
      <div className="min-h-screen bg-cream text-ink">
        <MarketingNav />
        <main>{children}</main>
        <MarketingFooter />
      </div>
    </>
  );
}

// Section rhythm shared by every agency page.
export function Section({
  id,
  eyebrow,
  heading,
  lead,
  children,
  tone = 'cream',
  narrow,
  className = '',
}: {
  id?: string;
  eyebrow?: string;
  heading?: ReactNode;
  lead?: ReactNode;
  children?: ReactNode;
  tone?: 'cream' | 'surface' | 'forest';
  narrow?: boolean;
  className?: string;
}) {
  const bg = tone === 'surface' ? 'bg-surface border-y border-rule' : tone === 'forest' ? 'bg-forest text-cream' : '';
  const eyebrowColor = tone === 'forest' ? 'text-cream/60' : 'text-ink-soft';
  const headingColor = tone === 'forest' ? 'text-cream' : 'text-ink';
  const leadColor = tone === 'forest' ? 'text-cream/80' : 'text-ink-muted';
  return (
    <section id={id} className={`${bg} ${className}`}>
      <div className={`px-6 md:px-12 py-16 md:py-24 ${narrow ? 'max-w-3xl' : 'max-w-6xl'} mx-auto`}>
        {(eyebrow || heading) && (
          <div className="mb-10 md:mb-12 max-w-2xl">
            {eyebrow && <div className={`text-2xs uppercase tracking-widest ${eyebrowColor} mb-3`}>{eyebrow}</div>}
            {heading && <h2 className={`font-display text-3xl md:text-4xl tracking-tighter ${headingColor} text-balance`}>{heading}</h2>}
            {lead && <p className={`mt-4 text-base md:text-lg ${leadColor} leading-relaxed`}>{lead}</p>}
          </div>
        )}
        {children}
      </div>
    </section>
  );
}

export function CtaRow({ tone = 'cream' }: { tone?: 'cream' | 'forest' }) {
  const secondary = tone === 'forest'
    ? 'btn border border-cream/30 text-cream hover:bg-cream/10 px-6 w-full sm:w-auto'
    : 'btn-secondary px-6 w-full sm:w-auto';
  const primary = tone === 'forest'
    ? 'btn bg-cream text-forest-ink hover:bg-white px-6 w-full sm:w-auto'
    : 'btn-primary px-6 w-full sm:w-auto';
  return (
    <div className="flex flex-col sm:flex-row gap-3">
      <a href="/enquire" className={primary}>Book a free consultation</a>
      <a href="/pricing" className={secondary}>See pricing</a>
    </div>
  );
}
