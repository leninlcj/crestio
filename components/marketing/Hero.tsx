import { useState } from 'react';
import Link from 'next/link';
import { useTranslation, Trans } from 'react-i18next';
import HeroScreenshot from './HeroScreenshot';
import VideoModal from './VideoModal';

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
}: Props) {
  const { t } = useTranslation('marketing');
  const [videoOpen, setVideoOpen] = useState(false);

  const finalHeadline = headline ?? (
    <Trans
      i18nKey="hero.heading_v2"
      ns="marketing"
      components={{
        u: <span className="relative inline-block">
          <span className="relative z-10">spreadsheet hell</span>
          <svg
            aria-hidden
            viewBox="0 0 220 8"
            preserveAspectRatio="none"
            className="absolute left-0 right-0 -bottom-1 w-full h-[8px] text-forest"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
          >
            <path d="M2 5 Q 35 1, 70 4 T 140 4 T 218 4" />
          </svg>
        </span>,
      }}
    />
  );

  const finalSubheadline = subheadline ?? t('hero.subheading_v2');
  const finalBadge = badgeText ?? t('hero.badge');
  const finalCtaPrimary = ctaPrimary ?? { label: t('hero.cta_v2'), href: '/auth/signup' };
  const finalCtaSecondary = ctaSecondary ?? { label: t('hero.cta_secondary'), onClick: () => setVideoOpen(true) };
  const finalMicroNote = microNote ?? t('hero.micro_note');

  const showCount = practicesCount !== undefined && practicesCount >= 10;

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

        <h1 className="font-display text-ink leading-[1.05] tracking-tighter font-semibold text-balance text-[36px] sm:text-5xl md:text-6xl lg:text-[56px] mb-5 md:mb-6">
          {finalHeadline}
        </h1>

        <p className="text-base md:text-lg text-ink-muted max-w-[560px] mx-auto leading-relaxed mb-8 md:mb-10 text-balance">
          {finalSubheadline}
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-3">
          <Link
            href={finalCtaPrimary.href}
            className="btn-primary text-sm font-medium px-6 h-11 min-h-[44px] w-full sm:w-auto sm:min-w-[200px] hover:shadow-lift transition-all duration-200"
          >
            {finalCtaPrimary.label}
          </Link>
          {finalCtaSecondary && (
            finalCtaSecondary.href ? (
              <Link
                href={finalCtaSecondary.href}
                className="btn-secondary text-sm font-medium px-6 h-11 min-h-[44px] w-full sm:w-auto"
              >
                {finalCtaSecondary.label}
              </Link>
            ) : (
              <button
                type="button"
                onClick={finalCtaSecondary.onClick}
                className="btn-secondary text-sm font-medium px-6 h-11 min-h-[44px] w-full sm:w-auto"
              >
                <span aria-hidden className="mr-1">▸</span>
                {finalCtaSecondary.label}
              </button>
            )
          )}
        </div>

        <div className="text-xs text-ink-soft">{finalMicroNote}</div>

        {showCount && (
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

      <VideoModal open={videoOpen} onClose={() => setVideoOpen(false)} />
    </section>
  );
}
