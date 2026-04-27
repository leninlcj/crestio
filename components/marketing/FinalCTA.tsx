import Link from 'next/link';
import { useTranslation } from 'react-i18next';

type Props = {
  heading?: string;
  sub?: string;
  primaryHref?: string;
  primaryLabel?: string;
};

export default function FinalCTA({
  heading,
  sub,
  primaryHref = '/auth/signup',
  primaryLabel,
}: Props) {
  const { t } = useTranslation('marketing');

  return (
    <section className="px-6 md:px-12 py-20 md:py-28 relative overflow-hidden">
      <div
        aria-hidden
        className="absolute inset-0"
        style={{ background: 'linear-gradient(180deg, transparent 0%, rgba(31,58,46,0.04) 100%)' }}
      />
      <div className="relative max-w-2xl mx-auto text-center">
        <h2 className="font-display text-3xl md:text-5xl tracking-tighter text-ink mb-5 text-balance leading-[1.1]">
          {heading ?? t('final_cta_v2.heading')}
        </h2>
        <p className="text-base md:text-lg text-ink-muted mb-9 leading-relaxed text-balance max-w-lg mx-auto">
          {sub ?? t('final_cta_v2.sub')}
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            href={primaryHref}
            data-cta="final"
            className="btn-primary text-sm font-medium px-6 h-11 min-w-[200px] hover:shadow-lift transition-all duration-200"
          >
            {primaryLabel ?? t('final_cta_v2.primary')}
          </Link>
          <a
            href="mailto:lenin@crestio.ai"
            className="text-sm text-ink-muted hover:text-ink underline underline-offset-4 px-6 py-3"
          >
            {t('final_cta_v2.secondary')}
          </a>
        </div>
        <div className="mt-8 text-2xs uppercase tracking-widest text-ink-soft">
          {t('final_cta_v2.micro')}
        </div>
      </div>
    </section>
  );
}
