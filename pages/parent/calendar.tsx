import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import AuthGuardParent from '../../components/AuthGuardParent';
import ParentLayout from '../../components/parent/ParentLayout';
import { useParentContext } from '../../components/parent/ParentContext';
import { supabase } from '../../lib/supabase';
import { WeekCalendar, mondayOfWeek } from '../../components/calendar/WeekCalendar';
import { SessionDetailModal } from '../../components/calendar/SessionDetailModal';
import type { CalendarSession } from '../../components/calendar/types';
import { useLocaleFormatters } from '../../lib/useLocaleFormatters';

function Inner() {
  const { t } = useTranslation('parent');
  const { overview, loading: ctxLoading } = useParentContext();
  const { formatDate } = useLocaleFormatters();
  const [weekStart, setWeekStart] = useState<Date>(() => mondayOfWeek(new Date()));
  const [dayStart, setDayStart] = useState<Date>(() => {
    const d = new Date(); d.setHours(0, 0, 0, 0); return d;
  });
  const [view, setView] = useState<'week' | 'day'>(() => {
    if (typeof window === 'undefined') return 'week';
    return window.matchMedia('(max-width: 767px)').matches ? 'day' : 'week';
  });
  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState<CalendarSession[]>([]);
  const [detailSession, setDetailSession] = useState<CalendarSession | null>(null);

  const rangeStart = view === 'week' ? weekStart : dayStart;
  const rangeEnd = useMemo(() => {
    const d = new Date(rangeStart);
    d.setDate(d.getDate() + (view === 'week' ? 7 : 1));
    return d;
  }, [rangeStart, view]);

  const studentIds = useMemo(() => (overview?.students ?? []).map((s) => s.id), [overview]);

  const load = useCallback(async () => {
    if (ctxLoading) return;
    if (studentIds.length === 0) { setSessions([]); setLoading(false); return; }
    setLoading(true);

    const { data } = await supabase
      .from('sessions')
      .select('id, student_id, subject, scheduled_at, duration_minutes, status, proposed_change_by, proposed_new_start_time, student:students!inner(id, name)')
      .in('student_id', studentIds)
      .gte('scheduled_at', rangeStart.toISOString())
      .lt('scheduled_at', rangeEnd.toISOString())
      .order('scheduled_at', { ascending: true });

    setSessions(((data ?? []) as any[]).map((s) => ({
      id: s.id,
      student_id: s.student_id,
      student_name: s.student?.name ?? 'Unknown',
      subject: s.subject,
      scheduled_at: s.scheduled_at,
      duration_minutes: s.duration_minutes,
      status: s.status,
      proposed_change_by: s.proposed_change_by,
      proposed_new_start_time: s.proposed_new_start_time,
    })));
    setLoading(false);
  }, [studentIds.join(','), rangeStart.toISOString(), rangeEnd.toISOString(), ctxLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);

  function shiftRange(days: number) {
    const step = view === 'week' ? days : (days < 0 ? -1 : 1);
    if (view === 'week') {
      const d = new Date(weekStart); d.setDate(d.getDate() + step); setWeekStart(d);
    } else {
      const d = new Date(dayStart); d.setDate(d.getDate() + step); setDayStart(d);
    }
  }
  function goToday() {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    setWeekStart(mondayOfWeek(today));
    setDayStart(today);
  }

  const rangeLabel = view === 'week'
    ? t('calendar.week_range', {
        start: formatDate(weekStart, { day: 'numeric', month: 'short' }),
        end: formatDate(new Date(weekStart.getTime() + 6 * 86_400_000), { day: 'numeric', month: 'short', year: 'numeric' }),
      })
    : formatDate(dayStart, { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <section className="px-4 md:px-12 pt-10 pb-16 max-w-5xl mx-auto">
      <div className="mb-5">
        <h1 className="font-display text-3xl md:text-4xl tracking-tighter text-ink mb-1">
          {t('calendar.heading_v2')}
        </h1>
      </div>

      <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
        <div className="flex items-center gap-1">
          <button onClick={() => shiftRange(-7)} className="btn-ghost text-xs h-8 min-h-[32px] px-2.5" aria-label="Previous">‹</button>
          <button onClick={goToday} className="btn-ghost text-xs h-8 min-h-[32px] px-3">{t('calendar.today')}</button>
          <button onClick={() => shiftRange(7)} className="btn-ghost text-xs h-8 min-h-[32px] px-2.5" aria-label="Next">›</button>
          <span className="text-sm text-ink ml-3 tabular-nums">{rangeLabel}</span>
        </div>
        <div className="inline-flex border border-rule rounded-full bg-surface p-1 gap-1">
          <button onClick={() => setView('week')}
            className={[
              'px-3 py-1 text-xs rounded-full transition-colors duration-150',
              view === 'week' ? 'bg-forest text-cream' : 'text-ink-muted hover:text-ink',
            ].join(' ')}>{t('calendar.view_week', { defaultValue: 'Week' })}</button>
          <button onClick={() => setView('day')}
            className={[
              'px-3 py-1 text-xs rounded-full transition-colors duration-150',
              view === 'day' ? 'bg-forest text-cream' : 'text-ink-muted hover:text-ink',
            ].join(' ')}>{t('calendar.view_day', { defaultValue: 'Day' })}</button>
        </div>
      </div>

      {loading ? (
        <div className="card p-6 text-sm text-ink-muted">{t('common.loading')}</div>
      ) : (
        <WeekCalendar
          weekStart={rangeStart}
          daysToShow={view === 'week' ? 7 : 1}
          sessions={sessions}
          onClickSession={(s) => setDetailSession(s)}
          readOnly
        />
      )}

      <SessionDetailModal
        open={!!detailSession}
        onClose={() => setDetailSession(null)}
        session={detailSession}
        onChanged={load}
        mode="parent"
      />
    </section>
  );
}

export default function ParentCalendar() {
  return (
    <AuthGuardParent>
      <ParentLayout active="calendar">
        <Inner />
      </ParentLayout>
    </AuthGuardParent>
  );
}
