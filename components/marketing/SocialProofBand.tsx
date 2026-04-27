import { useTranslation } from 'react-i18next';
import marketingConfig from '../../config/marketing.json';

export default function SocialProofBand() {
  const { t } = useTranslation('marketing');
  const cities = marketingConfig.cities ?? [];

  return (
    <section className="px-6 md:px-12 py-8 md:py-10 border-y border-rule bg-cream">
      <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-center gap-4 md:gap-10 text-center">
        <div className="text-2xs uppercase tracking-widest text-ink-soft">
          {t('social_proof.line', { count: cities.length })}
        </div>
        <div className="flex flex-wrap items-center justify-center gap-3 md:gap-5 text-sm text-ink-muted">
          {cities.map((c, i) => (
            <span key={c} className="flex items-center gap-3 md:gap-5">
              <span className="font-display tracking-tightest">{c}</span>
              {i < cities.length - 1 && (
                <span aria-hidden className="w-1 h-1 rounded-full bg-rule" />
              )}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
