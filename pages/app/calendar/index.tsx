import { activeLocale } from '../../../lib/utils';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { useTranslation } from 'react-i18next';
import { useLocaleFormatters } from '../../../lib/useLocaleFormatters';
import AuthGuard from '../../../components/AuthGuard';
import Layout from '../../../components/Layout';
import { supabase } from '../../../lib/supabase';
import { useMembership } from '../../../lib/membershipContext';
import { useOrganization } from '../../../lib/organizationContext';
import { WeekCalendar, mondayOfWeek } from '../../../components/calendar/WeekCalendar';
import { SessionQuickCreate } from '../../../components/calendar/SessionQuickCreate';
import { SessionDetailModal } from '../../../components/calendar/SessionDetailModal';
import type { CalendarSession } from '../../../components/calendar/types';

type View = 'week' | 'day';

function formatWeekLabel(d: Date): string {
  const end = new Date(d); end.setDate(end.getDate() + 6);
  const sameMonth = d.getMonth() === end.getMonth();
  const left = d.toLocaleDateString(activeLocale(), { day: 'numeric', month: sameMonth ? undefined : 'short' });
  const right = end.toLocaleDateString(activeLocale(), { day: 'numeric', month: 'short', year: 'numeric' });
  return `${left} – ${right}`;
}

function CalendarInner() {
  const { t } = useTranslation(['common']);
  const fmt = useLocaleFormatters();
  const { membership } = useMembership();
  const { organization } = useOrganization();
  // Default to day view on mobile, week view on larger screens.
  const [view, setView] = useState<View>(() => {
    if (typeof window === 'undefined') return 'week';
    return window.matchMedia('(max-width: 767px)').matches ? 'day' : 'week';
  });
  const [weekStart, setWeekStart] = useState<Date>(() => mondayOfWeek(new Date()));
  const [dayStart, setDayStart] = useState<Date>(() => {
    const d = new Date(); d.setHours(0, 0, 0, 0); return d;
  });
  const [sessions, setSessions] = useState<CalendarSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [students, setStudents] = useState<Array<{ id: string; name: string }>>([]);
  const [pendingProposals, setPendingProposals] = useState<CalendarSession[]>([]);

  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  const [quickCreateStart, setQuickCreateStart] = useState<Date | null>(null);
  const [detailSession, setDetailSession] = useState<CalendarSession | null>(null);

  const rangeStart = view === 'week' ? weekStart : dayStart;
  const rangeEnd = useMemo(() => {
    const d = new Date(rangeStart);
    d.setDate(d.getDate() + (view === 'week' ? 7 : 1));
    return d;
  }, [rangeStart, view]);

  const refetch = useCallback(async () => {
    if (!membership) return;
    setLoading(true);
    try {
      // Load students once.
      if (students.length === 0) {
        const { data: studentRows } = await supabase
          .from('students')
          .select('id, name')
          .eq('archived', false)
          .order('name');
        setStudents((studentRows ?? []) as any);
      }

      // Load sessions in range.
      const query = supabase
        .from('sessions')
        .select('id, student_id, subject, scheduled_at, duration_minutes, status, tutor_user_id, proposed_change_by, proposed_new_start_time, student:students!inner(id, name)')
        .gte('scheduled_at', rangeStart.toISOString())
        .lt('scheduled_at', rangeEnd.toISOString())
        .order('scheduled_at', { ascending: true });

      const { data } = await query;
      const mapped: CalendarSession[] = ((data ?? []) as any[]).map((s) => ({
        id: s.id,
        student_id: s.student_id,
        student_name: s.student?.name ?? 'Unknown',
        subject: s.subject ?? null,
        scheduled_at: s.scheduled_at,
        duration_minutes: s.duration_minutes,
        status: s.status,
        tutor_user_id: s.tutor_user_id,
        proposed_change_by: s.proposed_change_by,
        proposed_new_start_time: s.proposed_new_start_time,
      }));
      setSessions(mapped);

      // Pending parent proposals across the org (not just this range).
      const nowIso = new Date().toISOString();
      const { data: pending } = await supabase
        .from('sessions')
        .select('id, student_id, subject, scheduled_at, duration_minutes, status, tutor_user_id, proposed_change_by, proposed_new_start_time, student:students!inner(id, name)')
        .eq('status', 'pending_change')
        .eq('proposed_change_by', 'parent')
        .gt('scheduled_at', nowIso)
        .order('scheduled_at', { ascending: true })
        .limit(5);
      setPendingProposals(((pending ?? []) as any[]).map((s) => ({
        id: s.id, student_id: s.student_id, student_name: s.student?.name ?? 'Unknown',
        subject: s.subject ?? null, scheduled_at: s.scheduled_at, duration_minutes: s.duration_minutes,
        status: s.status, tutor_user_id: s.tutor_user_id,
        proposed_change_by: s.proposed_change_by, proposed_new_start_time: s.proposed_new_start_time,
      })));
    } finally {
      setLoading(false);
    }
  }, [membership, rangeStart, rangeEnd, students.length]);

  useEffect(() => { refetch(); }, [refetch]);

  // Backfill recurring templates on mount — runs once per calendar visit.
  useEffect(() => {
    if (!organization) return;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) return;
        await fetch('/api/session-templates/backfill', {
          method: 'POST',
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
      } catch { /* silent */ }
    })();
  }, [organization?.id]);

  function goPrev() {
    const d = new Date(rangeStart);
    d.setDate(d.getDate() - (view === 'week' ? 7 : 1));
    view === 'week' ? setWeekStart(d) : setDayStart(d);
  }
  function goNext() {
    const d = new Date(rangeStart);
    d.setDate(d.getDate() + (view === 'week' ? 7 : 1));
    view === 'week' ? setWeekStart(d) : setDayStart(d);
  }
  function goToday() {
    const t = new Date(); t.setHours(0, 0, 0, 0);
    setWeekStart(mondayOfWeek(t));
    setDayStart(t);
  }

  return (
    <Layout subtitle={t('common:calendar_page.subtitle')} title={t('common:nav.calendar')} actions={
      <>
        <button type="button" onClick={() => { setQuickCreateStart(new Date()); setQuickCreateOpen(true); }}
          className="btn-primary text-xs">{t('common:calendar_page.new_session')}</button>
      </>
    }>
      {pendingProposals.length > 0 && (
        <div className="card p-4 mb-6 border-amber/50 bg-amber-soft/30">
          <div className="text-2xs uppercase tracking-widest text-amber-ink mb-2">
            {t('common:calendar_page.pending_requests', { count: pendingProposals.length })}
          </div>
          <ul className="space-y-2">
            {pendingProposals.map((s) => (
              <li key={s.id} className="flex items-center justify-between text-sm">
                <div>
                  <strong>{s.student_name}</strong> · {fmt.formatDateTime(s.scheduled_at, {
                    weekday: 'short', day: 'numeric', month: 'short',
                    hour: 'numeric', minute: '2-digit',
                  })}
                </div>
                <button type="button" onClick={() => setDetailSession(s)}
                  className="text-xs text-forest hover:text-forest-ink underline">
                  {t('common:calendar_page.review')}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <button onClick={goPrev} className="btn-ghost text-xs">‹</button>
          <button onClick={goToday} className="btn-ghost text-xs">{t('common:calendar_page.today')}</button>
          <button onClick={goNext} className="btn-ghost text-xs">›</button>
          <span className="text-sm text-ink ml-2">
            {view === 'week'
              ? formatWeekLabel(rangeStart)
              : fmt.formatDate(rangeStart, { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })}
          </span>
        </div>
        <div className="inline-flex border border-rule rounded bg-surface p-1 gap-1">
          <button onClick={() => setView('week')}
            className={[
              'px-3 py-1 text-xs rounded',
              view === 'week' ? 'bg-forest text-cream' : 'text-ink-muted hover:text-ink',
            ].join(' ')}>{t('common:calendar_page.week')}</button>
          <button onClick={() => setView('day')}
            className={[
              'px-3 py-1 text-xs rounded',
              view === 'day' ? 'bg-forest text-cream' : 'text-ink-muted hover:text-ink',
            ].join(' ')}>{t('common:calendar_page.day')}</button>
        </div>
      </div>

      {loading && sessions.length === 0 ? (
        <div className="card p-6 text-sm text-ink-muted">{t('common:actions.loading')}</div>
      ) : (
        <WeekCalendar
          weekStart={rangeStart}
          daysToShow={view === 'week' ? 7 : 1}
          sessions={sessions}
          onClickSlot={(d) => { setQuickCreateStart(d); setQuickCreateOpen(true); }}
          onClickSession={(s) => setDetailSession(s)}
        />
      )}

      <SessionQuickCreate
        open={quickCreateOpen}
        onClose={() => setQuickCreateOpen(false)}
        onCreated={() => { setQuickCreateOpen(false); refetch(); }}
        students={students}
        initialStart={quickCreateStart}
      />

      <SessionDetailModal
        open={!!detailSession}
        onClose={() => setDetailSession(null)}
        session={detailSession}
        onChanged={refetch}
        mode="tutor"
      />
    </Layout>
  );
}

export default function Page() {
  return <AuthGuard><CalendarInner /></AuthGuard>;
}
