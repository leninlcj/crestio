import { useTranslation } from 'react-i18next';
import { useLocaleFormatters } from '../../lib/useLocaleFormatters';
import type { ParentOverview } from './ParentContext';

type Props = { updates: ParentOverview['recent_updates'] };

export default function ActivityFeed({ updates }: Props) {
  const { t } = useTranslation('parent');
  const { formatRelative } = useLocaleFormatters() as any;

  if (updates.length === 0) {
    return (
      <section>
        <h2 className="text-2xs uppercase tracking-widest text-ink-soft mb-3">
          {t('dashboard_v2.recent_activity')}
        </h2>
        <div className="rounded-md border border-rule bg-surface p-5 text-sm text-ink-muted">
          {t('dashboard_v2.no_activity')}
        </div>
      </section>
    );
  }

  return (
    <section>
      <h2 className="text-2xs uppercase tracking-widest text-ink-soft mb-3">
        {t('dashboard_v2.recent_activity')}
      </h2>
      <div className="rounded-md border border-rule bg-surface divide-y divide-ruleSoft">
        {updates.map((u) => (
          <article key={u.id} className="px-4 md:px-5 py-4">
            <div className="flex items-baseline justify-between mb-1.5 gap-3">
              <div className="text-sm text-ink truncate">
                <span className="font-medium">{u.created_by_name}</span>
                {u.student_name && (
                  <span className="text-ink-muted"> · {t('dashboard_v2.about_student', { name: u.student_name })}</span>
                )}
              </div>
              <div className="text-2xs text-ink-soft shrink-0">
                {formatRelative ? formatRelative(u.created_at) : new Date(u.created_at).toLocaleDateString()}
              </div>
            </div>
            <p className="text-sm text-ink-muted leading-relaxed line-clamp-2 whitespace-pre-wrap">{u.content}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
