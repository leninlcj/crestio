import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { useLocaleFormatters } from '../../lib/useLocaleFormatters';
import type { ParentOverview } from './ParentContext';

type Student = ParentOverview['students'][number];

type Props = { student: Student; lastSessionDate?: string | null };

export default function StudentRow({ student, lastSessionDate }: Props) {
  const { t } = useTranslation('parent');
  const { formatDate } = useLocaleFormatters();
  const initials = student.name.split(' ').map((p) => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();

  return (
    <Link
      href={`/parent/student/${student.id}`}
      className="flex items-center gap-4 p-4 rounded-md border border-rule bg-surface hover:bg-cream transition-colors"
    >
      <div className="w-11 h-11 rounded-full bg-forest/10 text-forest-ink flex items-center justify-center font-display text-base tracking-tightest shrink-0">
        {initials}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-base font-medium text-ink truncate">{student.name}</div>
        <div className="text-2xs text-ink-soft mt-0.5 truncate">
          {[student.year_level, student.subjects?.[0]].filter(Boolean).join(' · ') || '—'}
          {lastSessionDate && (
            <>
              {' · '}
              {t('dashboard_v2.last_session_at', { date: formatDate(lastSessionDate, { day: 'numeric', month: 'short' }) })}
            </>
          )}
        </div>
      </div>
      {student.outstanding_cents > 0 && (
        <span className="text-2xs text-claret font-medium shrink-0">
          {t('dashboard_v2.outstanding_short')}
        </span>
      )}
      <span aria-hidden className="text-ink-soft text-base shrink-0">›</span>
    </Link>
  );
}
