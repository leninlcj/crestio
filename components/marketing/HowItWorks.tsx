import { useTranslation } from 'react-i18next';
import HowItWorksVisual from './HowItWorksVisual';

const STEPS = ['log', 'polish', 'invoice'] as const;
type Step = typeof STEPS[number];

export default function HowItWorks() {
  const { t } = useTranslation('marketing');

  return (
    <section id="how" className="scroll-mt-20">
      {STEPS.map((step, idx) => (
        <div
          key={step}
          className={[
            'px-6 md:px-12 py-16 md:py-24 border-t border-rule',
            idx % 2 === 0 ? 'bg-cream' : 'bg-surface',
          ].join(' ')}
        >
          <div className="max-w-6xl mx-auto grid md:grid-cols-12 gap-10 md:gap-16 items-center">
            <div className={[
              'md:col-span-5',
              idx % 2 === 1 ? 'md:order-2' : '',
            ].join(' ')}>
              <div className="font-mono text-2xs uppercase tracking-widest text-forest mb-4">
                {String(idx + 1).padStart(2, '0')} <span className="text-ink-soft">/ 03</span>
              </div>
              <h3 className="font-display text-2xl md:text-3xl tracking-tighter text-balance mb-5">
                {t(`how_v2.${step}.title`)}
              </h3>
              <p className="text-base text-ink-muted leading-relaxed max-w-prose mb-5">
                {t(`how_v2.${step}.body`)}
              </p>
              <ul className="space-y-2 text-sm text-ink-muted">
                {[1, 2, 3].map((b) => (
                  <li key={b} className="flex items-start gap-2">
                    <span className="text-forest mt-[2px] flex-shrink-0" aria-hidden>
                      <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                        <path d="M3 8.5L6.5 12L13 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                    <span>{t(`how_v2.${step}.bullet_${b}`)}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className={[
              'md:col-span-7',
              idx % 2 === 1 ? 'md:order-1' : '',
            ].join(' ')}>
              <HowItWorksVisual step={step as Step} />
            </div>
          </div>
        </div>
      ))}
    </section>
  );
}
