import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useTranslation } from 'react-i18next';
import AuthGuardParent from '../../components/AuthGuardParent';
import { supabase } from '../../lib/supabase';
import { WeekCalendar, mondayOfWeek } from '../../components/calendar/WeekCalendar';
import { SessionDetailModal } from '../../components/calendar/SessionDetailModal';
import type { CalendarSession } from '../../components/calendar/types';
import { useLocaleFormatters } from '../../lib/useLocaleFormatters';

function ParentCalendarInner() {
  const { t } = useTranslation('parent');
  const router = useRouter();
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

  const load = useCallback(async () => {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) { setLoading(false); return; }

    const res = await fetch('/api/parent/overview', {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (!res.ok) { setLoading(false); return; }
    const payload = await res.json();
    const studentIds = payload.students.map((s: any) => s.id);
    if (studentIds.length === 0) { setSessions([]); setLoading(false); return; }

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
  }, [weekStart, rangeEnd]);

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
    const t = new Date(); t.setHours(0, 0, 0, 0);
    setWeekStart(mondayOfWeek(t));
    setDayStart(t);
  }

  const weekRange = view === 'week'
    ? t('calendar.week_range', {
        start: formatDate(weekStart, { day: 'numeric', month: 'short' }),
        end: formatDate(new Date(weekStart.getTime() + 6 * 86_400_000), { day: 'numeric', month: 'short', year: 'numeric' }),
      })
    : formatDate(dayStart, { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <div className="min-h-screen bg-cream text-ink">
      <nav className="px-6 md:px-12 py-6 flex items-center justify-between border-b border-rule">
        <Link href="/parent/dashboard" className="font-display text-2xl tracking-tightest">
          crest<span className="italic text-forest">io</span>
        </Link>
        <Link href="/parent/dashboard" className="text-sm text-ink-muted hover:text-ink">{t('nav.back_dashboard')}</Link>
      </nav>

      <main className="px-4 md:px-12 py-8 max-w-5xl mx-auto">
        <div className="mb-6">
          <div className="text-2xs uppercase tracking-widest text-ink-muted mb-2">{t('calendar.kicker')}</div>
          <h1 className="font-display text-3xl md:text-4xl tracking-tightest">{t('calendar.heading')}</h1>
        </div>

        <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <button onClick={() => shiftRange(-7)} className="btn-ghost text-xs">‹</button>
            <button onClick={goToday} className="btn-ghost text-xs">{t('calendar.today')}</button>
            <button onClick={() => shiftRange(7)} className="btn-ghost text-xs">›</button>
            <span className="text-sm text-ink ml-2">{weekRange}</span>
          </div>
          <div className="inline-flex border border-rule rounded bg-surface p-1 gap-1">
            <button onClick={() => setView('week')}
              className={[
                'px-3 py-1 text-xs rounded transition-colors duration-200',
                view === 'week' ? 'bg-forest text-cream' : 'text-ink-muted hover:text-ink',
              ].join(' ')}>{t('calendar.view_week', { defaultValue: 'Week' })}</button>
            <button onClick={() => setView('day')}
              className={[
                'px-3 py-1 text-xs rounded transition-colors duration-200',
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
      </main>
    </div>
  );
}

export default function ParentCalendar() {
  return <AuthGuardParent><ParentCalendarInner /></AuthGuardParent>;
}
