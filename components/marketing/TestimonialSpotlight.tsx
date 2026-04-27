import marketingConfig from '../../config/marketing.json';

export default function TestimonialSpotlight() {
  const cfg = marketingConfig.testimonials?.homepage;
  if (!cfg?.enabled) return null;

  const initials = cfg.name
    .split(' ')
    .map((p: string) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('');

  return (
    <section className="px-6 md:px-12 py-20 md:py-24 bg-cream">
      <div className="max-w-6xl mx-auto grid md:grid-cols-12 gap-10 md:gap-12 items-center">
        <div className="md:col-span-7">
          <svg width="32" height="24" viewBox="0 0 32 24" fill="none" className="text-forest/30 mb-6" aria-hidden>
            <path d="M0 24V14C0 6.27 4.45 1 11 0v4C7 5 5 8 5 12h6v12H0zm21 0V14C21 6.27 25.45 1 32 0v4c-4 1-6 4-6 8h6v12H21z" fill="currentColor" />
          </svg>
          <p className="font-display text-2xl md:text-3xl tracking-tighter text-ink leading-snug text-balance mb-8">
            {cfg.quote}
          </p>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-forest/10 text-forest-ink flex items-center justify-center font-display text-base tracking-tightest">
              {initials}
            </div>
            <div>
              <div className="text-sm font-medium text-ink">{cfg.name}</div>
              <div className="text-xs text-ink-muted">{cfg.title}</div>
            </div>
          </div>
        </div>

        <div className="md:col-span-5 grid grid-cols-3 md:grid-cols-1 gap-3">
          {cfg.stats.map((s: { label: string; value: string }) => (
            <div key={s.label} className="rounded-md border border-rule bg-surface p-4">
              <div className="text-2xs uppercase tracking-widest text-ink-soft mb-1.5 truncate">
                {s.label}
              </div>
              <div className="font-display text-2xl tracking-tightest text-ink tabular-nums">
                {s.value}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
