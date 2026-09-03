import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import HeroScreenshot from './HeroScreenshot';

type Props = {
  badgeText?: string;
  badgeHref?: string;
  headline?: React.ReactNode;
  subheadline?: string;
  ctaPrimary?: { label: string; href: string };
  ctaSecondary?: { label: string; href?: string; onClick?: () => void };
  microNote?: string;
  showScreenshot?: boolean;
  practicesCount?: number;
  signal?: { commits: number };
};

export default function Hero({
  badgeText,
  badgeHref = '/changelog',
  headline,
  subheadline,
  ctaPrimary,
  ctaSecondary,
  microNote,
  showScreenshot = true,
  practicesCount,
  signal,
}: Props) {
  const { t } = useTranslation('marketing');

  const finalHeadline = headline ?? t('hero.heading_v2');
  const finalSubheadline = subheadline ?? t('hero.subheading_v2');
  const finalBadge = badgeText ?? t('hero.badge');
  const finalCtaPrimary = ctaPrimary ?? { label: t('hero.cta_v2'), href: '/auth/signup' };
  const finalCtaSecondary = ctaSecondary ?? { label: t('hero.cta_secondary'), href: '/sandbox' };
  const finalMicroNote = microNote ?? t('hero.micro_note');

  const showLatentTrustedBy = practicesCount !== undefined && practicesCount >= 10;

  return (
    <section className="px-6 md:px-12 pt-10 md:pt-16 pb-12 md:pb-20 max-w-[1200px] mx-auto">
      <div className="text-center max-w-[720px] mx-auto">
        <Link
          href={badgeHref}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-rule bg-surface text-2xs text-ink-muted hover:text-ink hover:border-ink-soft transition-colors mb-6"
        >
          <span className="relative flex h-2 w-2">
            <span className="absolute inset-0 rounded-full bg-forest animate-ping opacity-50" />
            <span className="relative rounded-full h-2 w-2 bg-forest" />
          </span>
          <span>{finalBadge}</span>
          <span aria-hidden>→</span>
        </Link>

        <h1 className="font-display text-ink tracking-tighter font-semibold text-balance text-4xl sm:text-5xl md:text-6xl mb-5 md:mb-6">
          {finalHeadline}
        </h1>

        <p className="text-base md:text-lg text-ink-muted max-w-[560px] mx-auto leading-relaxed mb-8 md:mb-10 text-balance">
          {finalSubheadline}
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-3">
          <Link
            href={finalCtaPrimary.href}
            className="btn-primary px-6 w-full sm:w-auto"
          >
            {finalCtaPrimary.label}
          </Link>
          {finalCtaSecondary && (
            finalCtaSecondary.href ? (
              <Link
                href={finalCtaSecondary.href}
                className="btn-secondary px-6 w-full sm:w-auto"
              >
                {finalCtaSecondary.label}
              </Link>
            ) : (
              <button
                type="button"
                onClick={finalCtaSecondary.onClick}
                className="btn-secondary px-6 w-full sm:w-auto"
              >
                {finalCtaSecondary.label}
              </button>
            )
          )}
        </div>

        <div className="text-xs text-ink-soft">{finalMicroNote}</div>

        {signal && (
          <div className="mt-7 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-2xs uppercase tracking-widest text-ink-soft">
            {signal.commits >= 1 && (
              <>
                <span aria-label="ship velocity">
                  <span className="num tabular text-ink">{signal.commits}</span>{' '}
                  <span>{signal.commits === 1 ? 'commit' : 'commits'} in the last 7 days</span>
                </span>
                <span aria-hidden className="w-1 h-1 rounded-full bg-rule" />
              </>
            )}
            <Link href="/changelog" className="text-ink-muted hover:text-ink underline-offset-4 hover:underline">
              {t('hero.signal_changelog')} →
            </Link>
            <span aria-hidden className="w-1 h-1 rounded-full bg-rule" />
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden className="inline-block">
                <svg width="14" height="10" viewBox="0 0 14 10" fill="none" aria-hidden>
                  <rect width="14" height="10" rx="1" fill="#012169" />
                  <path d="M0 0L14 10M14 0L0 10" stroke="#fff" strokeWidth="1" />
                  <path d="M7 0V10M0 5H14" stroke="#fff" strokeWidth="2" />
                </svg>
              </span>
              {t('hero.signal_made_in')}
            </span>
          </div>
        )}

        {showLatentTrustedBy && (
          <div className="mt-8 text-2xs uppercase tracking-widest text-ink-soft">
            {t('hero.trusted_by', { count: practicesCount })}
          </div>
        )}
      </div>

      {showScreenshot && (
        <div className="mt-12 md:mt-16">
          <HeroScreenshot />
        </div>
      )}
    </section>
  );
}
