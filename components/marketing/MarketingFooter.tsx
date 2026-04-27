import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import marketingConfig from '../../config/marketing.json';

export default function MarketingFooter() {
  const { t } = useTranslation('marketing');
  const [healthy, setHealthy] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/health')
      .then((r) => r.ok)
      .then((ok) => { if (!cancelled) setHealthy(ok); })
      .catch(() => { if (!cancelled) setHealthy(false); });
    return () => { cancelled = true; };
  }, []);

  return (
    <footer className="border-t border-rule bg-cream">
      <div className="px-6 md:px-12 py-14 md:py-16 max-w-6xl mx-auto">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-8 md:gap-10">
          <div className="col-span-2 md:col-span-2">
            <Link href="/" className="font-display text-2xl tracking-tightest inline-block mb-3">
              crest<span className="italic text-forest">io</span>
            </Link>
            <p className="text-sm text-ink-muted leading-relaxed max-w-xs mb-5">
              {t('footer_v2.tagline')}
            </p>
            <div className="flex items-center gap-2 text-2xs">
              <span
                className={[
                  'w-1.5 h-1.5 rounded-full',
                  healthy === false ? 'bg-claret' : healthy === true ? 'bg-success' : 'bg-rule',
                ].join(' ')}
                aria-hidden
              />
              <span className="text-ink-soft uppercase tracking-widest">
                {healthy === false ? t('footer_v2.status_down') : t('footer_v2.status_ok')}
              </span>
            </div>
          </div>

          <FooterColumn title={t('footer_v2.col_product')} links={[
            { label: t('footer_v2.product_pricing'), href: '/pricing' },
            { label: t('footer_v2.product_changelog'), href: '/changelog' },
            { label: t('footer_v2.product_security'), href: '/privacy' },
          ]} />

          <FooterColumn title={t('footer_v2.col_for_tutors')} links={[
            { label: t('footer_v2.for_solo'), href: '/for/sydney' },
            { label: t('footer_v2.for_team'), href: '/for/large-practices' },
            { label: t('footer_v2.for_exam'), href: '/for/exam-prep' },
            { label: t('footer_v2.for_music'), href: '/for/music-teachers' },
            { label: t('footer_v2.for_new'), href: '/for/new-tutors' },
            { label: t('footer_v2.for_parents'), href: '/for/parents' },
          ]} />

          <FooterColumn title={t('footer_v2.col_company')} links={[
            { label: t('footer_v2.company_about'), href: '/about' },
            { label: t('footer_v2.company_contact'), href: '/contact' },
            { label: t('footer_v2.company_privacy'), href: '/privacy' },
            { label: t('footer_v2.company_terms'), href: '/terms' },
            { label: t('footer_v2.company_signin'), href: '/auth/signin' },
          ]} />
        </div>

        <div className="mt-12 pt-8 border-t border-rule flex flex-col md:flex-row items-center justify-between gap-4 text-2xs text-ink-soft">
          <div className="uppercase tracking-widest">{t('footer_v2.copyright', { year: new Date().getFullYear() })}</div>
          <div className="flex items-center gap-4">
            {marketingConfig.social?.twitter && (
              <a
                href={marketingConfig.social.twitter}
                rel="noopener noreferrer"
                target="_blank"
                className="hover:text-ink transition-colors"
                aria-label="Twitter"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
              </a>
            )}
            {marketingConfig.social?.linkedin && (
              <a
                href={marketingConfig.social.linkedin}
                rel="noopener noreferrer"
                target="_blank"
                className="hover:text-ink transition-colors"
                aria-label="LinkedIn"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.063 2.063 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                </svg>
              </a>
            )}
          </div>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({ title, links }: { title: string; links: { label: string; href: string }[] }) {
  return (
    <div>
      <div className="text-2xs uppercase tracking-widest text-ink-soft mb-3 font-medium">
        {title}
      </div>
      <div className="flex flex-col gap-2.5">
        {links.map((l) => (
          <Link key={l.href + l.label} href={l.href} className="text-sm text-ink-muted hover:text-ink transition-colors">
            {l.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
