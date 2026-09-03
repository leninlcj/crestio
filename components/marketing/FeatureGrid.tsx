import { useTranslation } from 'react-i18next';

const FEATURES = [
  { key: 'polish', icon: 'sparkle' },
  { key: 'payments', icon: 'card' },
  { key: 'calendar', icon: 'calendar' },
  { key: 'plans', icon: 'book' },
  { key: 'pdfs', icon: 'doc' },
  { key: 'team', icon: 'users' },
] as const;

export default function FeatureGrid() {
  const { t } = useTranslation('marketing');

  return (
    <section className="px-6 md:px-12 py-20 md:py-28 max-w-6xl mx-auto">
      <div className="text-center mb-12 md:mb-16">
        <div className="text-2xs uppercase tracking-widest text-ink-soft mb-3">
          {t('features_v2.eyebrow')}
        </div>
        <h2 className="font-display text-3xl md:text-4xl tracking-tighter text-ink text-balance">
          {t('features_v2.heading')}
        </h2>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {FEATURES.map((f) => (
          <article
            key={f.key}
            className="rounded-md border border-rule bg-surface p-6 transition-colors duration-100 hover:bg-ruleSoft/40"
          >
            <div className="text-forest mb-4">
              <FeatureIcon name={f.icon} />
            </div>
            <h3 className="font-display text-base tracking-tightest text-ink mb-2">
              {t(`features_v2.${f.key}.title`)}
            </h3>
            <p className="text-sm text-ink-muted leading-relaxed">
              {t(`features_v2.${f.key}.body`)}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}

function FeatureIcon({ name }: { name: string }) {
  const common = { width: 24, height: 24, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  switch (name) {
    case 'sparkle':
      return <svg {...common}><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.5 5.5l2 2M16.5 16.5l2 2M5.5 18.5l2-2M16.5 7.5l2-2" /></svg>;
    case 'card':
      return <svg {...common}><rect x="3" y="6" width="18" height="13" rx="2" /><path d="M3 10h18" /><path d="M7 15h3" /></svg>;
    case 'calendar':
      return <svg {...common}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>;
    case 'book':
      return <svg {...common}><path d="M4 4h11a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H4z" /><path d="M4 4v15" /></svg>;
    case 'doc':
      return <svg {...common}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M9 13h6M9 17h4" /></svg>;
    case 'users':
      return <svg {...common}><path d="M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2" /><path d="M16 4a4 4 0 0 1 0 8M21 21v-2a4 4 0 0 0-3-3.87" /></svg>;
    default: return null;
  }
}
