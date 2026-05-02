import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import type { MigrationCounter } from '../../lib/migrationCounter';

type Props = { counter: MigrationCounter };

export default function MigrationBanner({ counter }: Props) {
  const { t } = useTranslation('marketing');
  const remaining = Math.max(0, counter.total_spots - counter.spots_taken);
  const isFull = remaining <= 0;
  const spotsCopy = counter.spots_taken === 0
    ? t('migration_banner.spots_zero')
    : t('migration_banner.spots', { taken: counter.spots_taken, total: counter.total_spots });

  return (
    <section className="border-y border-rule bg-surface">
      <div className="px-6 md:px-12 py-6 md:py-8 max-w-6xl mx-auto flex flex-col md:flex-row items-start md:items-center gap-4 md:gap-8">
        <div className="flex-1 min-w-0">
          <div className="text-2xs uppercase tracking-widest text-ink-soft mb-2 flex items-center gap-2">
            <span aria-hidden className="inline-block w-1.5 h-1.5 rounded-full bg-forest" />
            {t('migration_banner.eyebrow')}
            <span aria-hidden className="text-ink-soft/60">·</span>
            <span className="num tabular text-ink-muted">{spotsCopy}</span>
          </div>
          <div className="font-display text-xl md:text-2xl tracking-tighter text-ink mb-1.5 text-balance">
            {t('migration_banner.title')}
          </div>
          <p className="text-sm text-ink-muted leading-relaxed max-w-prose">
            {t('migration_banner.body')}
          </p>
        </div>
        <div className="shrink-0 flex items-center gap-3">
          <Link
            href="/migrate"
            aria-disabled={isFull}
            className="btn-primary text-sm px-5 h-11 min-h-[44px] inline-flex items-center"
          >
            {t('migration_banner.cta')}
            <span aria-hidden className="ml-1.5">→</span>
          </Link>
        </div>
      </div>
    </section>
  );
}
