import { useTranslation } from 'react-i18next';

export default function PainSection() {
  const { t } = useTranslation('marketing');
  const lines = [1, 2, 3, 4] as const;

  return (
    <section className="px-6 md:px-12 py-20 md:py-28 max-w-5xl mx-auto">
      <div className="grid md:grid-cols-12 gap-10 md:gap-16">
        <div className="md:col-span-5">
          <div className="text-2xs uppercase tracking-widest text-ink-soft mb-3">
            {t('pain.eyebrow')}
          </div>
          <h2 className="font-display text-3xl md:text-4xl tracking-tighter text-ink text-balance">
            {t('pain.heading_v2')}
          </h2>
        </div>
        <div className="md:col-span-7">
          <ul className="space-y-5 md:space-y-6">
            {lines.map((n) => (
              <li
                key={n}
                className="pl-5 border-l-2 border-forest/30 text-base text-ink-muted leading-relaxed"
              >
                {t(`pain.line_v2_${n}`)}
              </li>
            ))}
            <li className="flex items-start gap-3 pt-3 border-t border-rule">
              <span aria-hidden className="text-forest mt-1 flex-shrink-0">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M3 8.5L6.5 12L13 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              <span className="text-base text-ink leading-relaxed font-medium">
                {t('pain.resolution')}
              </span>
            </li>
          </ul>
        </div>
      </div>
    </section>
  );
}
