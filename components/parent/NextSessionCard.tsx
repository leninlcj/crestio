import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useTranslation } from 'react-i18next';
import { useLocaleFormatters } from '../../lib/useLocaleFormatters';
import { supabase } from '../../lib/supabase';
import type { ParentOverview } from './ParentContext';

type Props = {
  session: ParentOverview['this_week_sessions'][number] | null;
  onChanged?: () => void;
};

export default function NextSessionCard({ session, onChanged }: Props) {
  const { t } = useTranslation('parent');
  const router = useRouter();
  const { formatDate, formatTimeOfDay } = useLocaleFormatters();

  if (!session) {
    return (
      <section
        aria-labelledby="next-session-heading"
        className="rounded-md border border-rule bg-surface p-6 md:p-7"
      >
        <h2 id="next-session-heading" className="text-2xs uppercase tracking-widest text-ink-soft mb-2">
          {t('dashboard_v2.next_session')}
        </h2>
        <div className="text-base text-ink-muted">{t('dashboard_v2.no_upcoming_card')}</div>
      </section>
    );
  }

  const dayLabel = formatDate(session.scheduled_at, { weekday: 'short', day: 'numeric', month: 'short' });
  const timeLabel = formatTimeOfDay(session.scheduled_at);

  const onAddToCalendar = async () => {
    const { data: { session: authSession } } = await supabase.auth.getSession();
    if (!authSession?.access_token) return;
    const res = await fetch('/api/calendar/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authSession.access_token}` },
      body: JSON.stringify({ audience: 'parent_student', student_id: session.student_id }),
    });
    const payload = await res.json().catch(() => ({}));
    if (payload?.url) {
      try { await navigator.clipboard.writeText(payload.url); } catch { /* ignore */ }
      router.push('/parent/calendar');
    }
  };

  return (
    <section
      aria-labelledby="next-session-heading"
      className="rounded-md border border-forest/30 bg-forest/[0.04] p-6 md:p-7"
    >
      <h2 id="next-session-heading" className="text-2xs uppercase tracking-widest text-forest-ink mb-2">
        {t('dashboard_v2.next_session')}
      </h2>

      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-5">
        <div className="flex-1 min-w-0">
          <div className="font-display text-2xl md:text-3xl tracking-tighter text-forest-ink tabular-nums leading-tight">
            {dayLabel} · {timeLabel}
          </div>
          <div className="text-base text-forest-ink/80 mt-2">
            {session.student_name}
            {session.subject && <> · {session.subject}</>}
            {' · '}
            {t('dashboard_v2.duration_minutes', { count: session.duration_minutes })}
          </div>
          {session.tutor_name && (
            <div className="text-2xs text-forest-ink/60 mt-1.5">
              {t('connectors.with_tutor', { name: session.tutor_name, defaultValue: 'with {{name}}' })}
            </div>
          )}
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onAddToCalendar}
            className="btn-secondary text-xs h-9 min-h-[36px] px-4"
          >
            {t('dashboard_v2.add_to_calendar')}
          </button>
          <Link
            href={`/parent/student/${session.student_id}`}
            className="btn-primary text-xs h-9 min-h-[36px] px-4"
          >
            {t('dashboard_v2.view_session')}
          </Link>
        </div>
      </div>
    </section>
  );
}
